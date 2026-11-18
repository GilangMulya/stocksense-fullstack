import base64
import io
import json
import os
import tempfile
from collections import defaultdict
from datetime import datetime, timedelta

import pandas as pd
import xgboost as xgb
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    DatasetCloud,
    HistoryLogCloud,
    MLModelCloud,
    ProductCloud,
    UserCloud,
)
from app.utils import (
    buat_id_unik,
    ml_state,
    pastikan_model_xgb_siap,
    hitung_batch_metrik_xgboost,
    sinkronkan_produk_user_dengan_xgboost,
)

router = APIRouter(prefix="/api/cloud", tags=["Cloud Dataset & ML Model Upload"])


def clean_sql_val(val):
    if pd.isna(val):
        return ""
    s = str(val).strip()
    if s.endswith(") VALUES"):
        s = s.replace(") VALUES", "").strip()
    return s


def normalize_col_name(col_name: str) -> str:
    return (
        str(col_name)
        .replace(") VALUES", "")
        .replace("`", "")
        .replace("'", "")
        .replace('"', "")
        .strip()
        .lower()
        .split()[0]
        if str(col_name).strip()
        else ""
    )


def parse_uploaded_dataset(file_bytes: bytes, filename: str):
    ext = filename.lower().split(".")[-1]
    products_dict = {}
    transactions = []

    if ext in ["xlsx", "xls"]:
        xls = pd.ExcelFile(io.BytesIO(file_bytes))
        sheet_names = xls.sheet_names

        if "Produk" in sheet_names and "Barang Keluar" in sheet_names:
            df_prod = pd.read_excel(xls, sheet_name="Produk")
            df_bk = pd.read_excel(xls, sheet_name="Barang Keluar")

            prod_cols = [normalize_col_name(c) for c in df_prod.columns]
            bk_cols = [normalize_col_name(c) for c in df_bk.columns]

            idx_p_code = next(
                (i for i, c in enumerate(prod_cols) if c in ["product_id", "code", "kode", "id"]),
                0,
            )
            idx_p_cat = next(
                (i for i, c in enumerate(prod_cols) if "categor" in c or "kategori" in c),
                None,
            )
            idx_p_name = next(
                (i for i, c in enumerate(prod_cols) if c in ["name", "nama", "product_name"]),
                min(2, len(prod_cols) - 1),
            )
            idx_p_brand = next(
                (i for i, c in enumerate(prod_cols) if c in ["brand", "supplier", "merek"]),
                None,
            )
            idx_p_price = next(
                (i for i, c in enumerate(prod_cols) if "price" in c or "harga" in c),
                len(prod_cols) - 1,
            )

            for row in df_prod.itertuples(index=False):
                vals = list(row)
                pcode = clean_sql_val(vals[idx_p_code])
                if not pcode or pcode.upper() == "NULL":
                    continue
                pname = clean_sql_val(vals[idx_p_name]) or f"Produk {pcode}"
                cat_val = (
                    clean_sql_val(vals[idx_p_cat])
                    if idx_p_cat is not None and idx_p_cat < len(vals)
                    else "Katalog Toko"
                )
                supp_val = (
                    clean_sql_val(vals[idx_p_brand])
                    if idx_p_brand is not None and idx_p_brand < len(vals)
                    else "Supplier Umum"
                )
                if not supp_val or supp_val.upper() == "NULL":
                    supp_val = "Supplier Umum"
                if not cat_val or cat_val.upper() == "NULL":
                    cat_val = "Katalog Toko"

                try:
                    raw_price = float(str(vals[idx_p_price]).replace(",", "").strip())
                    price_int = max(500, int(raw_price))
                except Exception:
                    price_int = 15000

                products_dict[pcode] = {
                    "code": pcode[:60],
                    "name": pname[:190],
                    "category": (f"Kategori {cat_val}" if cat_val.isdigit() else cat_val)[:95],
                    "supplier": supp_val[:140],
                    "price": price_int,
                    "cost": int(price_int * 0.8),
                    "stock": None,
                    "minStock": 0,
                }

            order_time_map = {}
            if "Penjualan" in sheet_names:
                df_penj = pd.read_excel(xls, sheet_name="Penjualan")
                penj_cols = [normalize_col_name(c) for c in df_penj.columns]
                idx_o_id = next(
                    (i for i, c in enumerate(penj_cols) if c in ["orders_id", "ordersid", "order_id", "id"]),
                    0,
                )
                idx_o_yr = next(
                    (i for i, c in enumerate(penj_cols) if c in ["create_at", "year", "tahun"]),
                    1,
                )
                idx_o_mo = next(
                    (i for i, c in enumerate(penj_cols) if c in ["month", "bulan"]),
                    2,
                )
                idx_o_dy = next(
                    (i for i, c in enumerate(penj_cols) if c in ["date", "tanggal"]),
                    3,
                )
                idx_o_tm = next(
                    (i for i, c in enumerate(penj_cols) if c in ["time", "waktu", "jam"]),
                    4,
                )

                for row in df_penj.itertuples(index=False):
                    vals = list(row)
                    oid = clean_sql_val(vals[idx_o_id])
                    try:
                        yr = int(float(vals[idx_o_yr]))
                        mo = int(float(vals[idx_o_mo]))
                        dy = int(float(vals[idx_o_dy]))
                        tm = clean_sql_val(vals[idx_o_tm]) or "12:00:00"
                        if len(tm) == 5:
                            tm += ":00"
                        order_time_map[oid] = f"{yr:04d}-{mo:02d}-{dy:02d} {tm}"
                    except Exception:
                        continue

            idx_bk_yr = next(
                (i for i, c in enumerate(bk_cols) if c in ["date_out", "create_at", "year", "tahun"]),
                0,
            )
            idx_bk_mo = next(
                (i for i, c in enumerate(bk_cols) if c in ["month", "bulan"]),
                1,
            )
            idx_bk_dy = next(
                (i for i, c in enumerate(bk_cols) if c in ["date", "tanggal"]),
                2,
            )
            idx_bk_oid = next(
                (i for i, c in enumerate(bk_cols) if "order" in c),
                3,
            )
            idx_bk_pid = next(
                (i for i, c in enumerate(bk_cols) if "product" in c or c in ["code", "kode"]),
                4,
            )

            for row in df_bk.itertuples(index=False):
                vals = list(row)
                pcode = clean_sql_val(vals[idx_bk_pid])
                if not pcode or pcode.upper() == "NULL":
                    continue
                oid = clean_sql_val(vals[idx_bk_oid])
                if oid in order_time_map:
                    full_ts = order_time_map[oid]
                    date_str = full_ts[:10]
                else:
                    try:
                        yr = int(float(vals[idx_bk_yr]))
                        mo = int(float(vals[idx_bk_mo]))
                        dy = int(float(vals[idx_bk_dy]))
                        date_str = f"{yr:04d}-{mo:02d}-{dy:02d}"
                        full_ts = f"{date_str} 12:00:00"
                    except Exception:
                        continue

                if pcode not in products_dict:
                    products_dict[pcode] = {
                        "code": pcode[:60],
                        "name": f"Produk {pcode}"[:190],
                        "category": "Katalog Toko",
                        "supplier": "Supplier Umum",
                        "price": 15000,
                        "cost": 12000,
                        "stock": None,
                        "minStock": 0,
                    }

                transactions.append(
                    {
                        "code": pcode,
                        "date": date_str,
                        "timestamp": full_ts,
                        "qty": 1,
                    }
                )
            return products_dict, transactions

        df_generic = pd.read_excel(xls, sheet_name=0)
    elif ext == "csv":
        df_generic = pd.read_csv(io.BytesIO(file_bytes))
    elif ext == "json":
        data_json = json.loads(file_bytes.decode("utf-8"))
        if isinstance(data_json, list):
            for item in data_json:
                pcode = str(item.get("code") or item.get("id") or "").strip()
                if not pcode:
                    continue
                price_int = int(item.get("price") or 15000)
                products_dict[pcode] = {
                    "code": pcode[:60],
                    "name": (item.get("name") or f"Produk {pcode}")[:190],
                    "category": (item.get("category") or "Sembako")[:95],
                    "supplier": (item.get("supplier") or "Supplier Umum")[:140],
                    "price": price_int,
                    "cost": int(item.get("cost") or int(price_int * 0.8)),
                    "stock": item.get("stock"),
                    "minStock": 0,
                }
                for h in item.get("history", []):
                    val = int(h.get("value") or 0)
                    if val > 0:
                        d_str = h.get("date") or datetime.now().strftime("%Y-%m-%d")
                        transactions.append(
                            {
                                "code": pcode,
                                "date": d_str,
                                "timestamp": f"{d_str} 23:59:59",
                                "qty": val,
                            }
                        )
            return products_dict, transactions
        raise ValueError("Format JSON tidak dikenali.")
    else:
        raise ValueError("Gunakan file format .xlsx, .xls, .csv, atau .json")

    col_map = {str(c).strip().lower(): c for c in df_generic.columns}
    code_col = next(
        (col_map[k] for k in col_map if k in ["code", "kode", "kode produk", "product_code", "product_id", "barcode"]),
        df_generic.columns[0],
    )
    name_col = next(
        (col_map[k] for k in col_map if k in ["name", "nama", "nama produk", "product_name"]),
        None,
    )
    qty_col = next(
        (col_map[k] for k in col_map if k in ["qty", "quantity", "jumlah", "jumlah terjual", "jumlah terjual (unit)", "kuantitas"]),
        None,
    )
    price_col = next(
        (col_map[k] for k in col_map if k in ["price", "selling_price", "harga", "harga jual", "harga jual satuan (rp)"]),
        None,
    )
    ts_col = next(
        (col_map[k] for k in col_map if k in ["timestamp", "created_at", "waktu", "waktu input", "date", "tanggal", "tanggal penjualan"]),
        None,
    )
    supp_col = next(
        (col_map[k] for k in col_map if k in ["supplier", "brand", "pemasok"]),
        None,
    )
    stock_col = next(
        (col_map[k] for k in col_map if k in ["stock", "stok", "sisa stok"]),
        None,
    )

    for _, r in df_generic.iterrows():
        pcode = clean_sql_val(r.get(code_col, ""))
        if not pcode:
            continue
        pname = clean_sql_val(r.get(name_col, "")) if name_col else f"Produk {pcode}"
        supp = clean_sql_val(r.get(supp_col, "")) if supp_col else "Supplier Umum"
        try:
            price_val = int(float(r.get(price_col, 15000))) if price_col else 15000
        except Exception:
            price_val = 15000

        try:
            stk_val = (
                int(float(r.get(stock_col)))
                if stock_col and not pd.isna(r.get(stock_col))
                else None
            )
        except Exception:
            stk_val = None

        if pcode not in products_dict:
            products_dict[pcode] = {
                "code": pcode[:60],
                "name": (pname or f"Produk {pcode}")[:190],
                "category": "Katalog Toko",
                "supplier": (supp or "Supplier Umum")[:140],
                "price": max(500, price_val),
                "cost": int(max(500, price_val) * 0.8),
                "stock": stk_val,
                "minStock": 0,
            }

        try:
            qty_val = int(float(r.get(qty_col, 1))) if qty_col else 1
        except Exception:
            qty_val = 1

        if qty_val > 0:
            raw_ts = (
                clean_sql_val(r.get(ts_col, ""))
                if ts_col
                else datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            )
            date_only = (
                raw_ts[:10]
                if len(raw_ts) >= 10
                else datetime.now().strftime("%Y-%m-%d")
            )
            full_ts = raw_ts if len(raw_ts) > 10 else f"{date_only} 12:00:00"
            transactions.append(
                {
                    "code": pcode,
                    "date": date_only,
                    "timestamp": full_ts,
                    "qty": qty_val,
                }
            )

    return products_dict, transactions


@router.get("/status")
def get_cloud_upload_status(
    current_user: UserCloud = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    datasets = (
        db.query(DatasetCloud)
        .filter(DatasetCloud.owner_email == current_user.email)
        .order_by(DatasetCloud.uploaded_at.desc())
        .limit(20)
        .all()
    )
    models = (
        db.query(
            MLModelCloud.id,
            MLModelCloud.model_name,
            MLModelCloud.filename,
            MLModelCloud.file_size_kb,
            MLModelCloud.is_active,
            MLModelCloud.uploaded_at,
        )
        .order_by(MLModelCloud.uploaded_at.desc())
        .all()
    )
    active_model_row = next((m for m in models if m.is_active == 1), None)
    has_cloud_model = active_model_row is not None

    if not has_cloud_model:
        ml_state["model_xgb"] = None
        ml_state["active_model_name"] = None

    total_products = (
        db.query(ProductCloud)
        .filter(ProductCloud.owner_email == current_user.email)
        .count()
    )

    return {
        "last_sync_timestamp": getattr(
            current_user, "last_sync_timestamp", "2026-10-06 22:55:24"
        ),
        "has_cloud_model": has_cloud_model,
        "active_model_name": (
            f"{active_model_row.model_name} ({active_model_row.filename})"
            if active_model_row
            else None
        ),
        "total_products_in_tidb": total_products,
        "datasets": [
            {
                "id": d.id,
                "filename": d.filename,
                "upload_mode": d.upload_mode,
                "total_products_affected": d.total_products_affected,
                "total_transactions_synced": d.total_transactions_synced,
                "cutoff_timestamp_used": d.cutoff_timestamp_used,
                "new_last_timestamp": d.new_last_timestamp,
                "file_size_kb": d.file_size_kb,
                "uploaded_at": d.uploaded_at,
            }
            for d in datasets
        ],
        "models": [
            {
                "id": m.id,
                "model_name": m.model_name,
                "filename": m.filename,
                "file_size_kb": m.file_size_kb,
                "is_active": m.is_active,
                "uploaded_at": m.uploaded_at,
            }
            for m in models
        ],
    }


@router.post("/upload-dataset")
async def upload_dataset_to_tidb(
    file: UploadFile = File(...),
    mode: str = Form("FULL_IMPORT"),
    custom_cutoff: str = Form(""),
    current_user: UserCloud = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content = await file.read()
    file_size_kb = max(1, len(content) // 1024)
    sekarang_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    try:
        products_dict, transactions = parse_uploaded_dataset(content, file.filename)
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Gagal membaca dataset: {str(e)}"
        )

    mode_clean = (mode or "FULL_IMPORT").upper()
    is_pro = (getattr(current_user, "subscription_plan", "FREE") or "FREE").upper() == "PRO"
    model_xgb = pastikan_model_xgb_siap(db, current_user.email) if is_pro else None
    is_ml_active = bool(is_pro and model_xgb is not None)

    if mode_clean == "DELTA_SYNC":
        existing_products = (
            db.query(ProductCloud)
            .filter(ProductCloud.owner_email == current_user.email)
            .all()
        )
        existing_by_code = {p.code: p for p in existing_products}

        user_custom_cutoff = (custom_cutoff or "").strip()
        cutoff_ts = (
            user_custom_cutoff
            or getattr(current_user, "last_sync_timestamp", "2026-10-06 22:55:24")
            or "2026-10-06 22:55:24"
        )
        if len(cutoff_ts) == 10:
            cutoff_ts += " 00:00:00"

        new_txs = [t for t in transactions if t["timestamp"] > cutoff_ts]
        auto_window_note = ""

        if len(new_txs) == 0 and not user_custom_cutoff and len(transactions) > 0:
            max_file_ts = max(t["timestamp"] for t in transactions)
            try:
                max_dt = datetime.strptime(max_file_ts[:10], "%Y-%m-%d")
                fallback_cutoff_dt = max_dt - timedelta(days=7)
                cutoff_ts = fallback_cutoff_dt.strftime("%Y-%m-%d 23:59:59")
                new_txs = [t for t in transactions if t["timestamp"] > cutoff_ts]
                auto_window_note = f" (Otomatis Cut-Off 7 Hari Terakhir: > {cutoff_ts})"
            except Exception:
                pass

        if len(new_txs) == 0:
            return {
                "message": f"Sinkronisasi selesai: Tidak ada transaksi baru setelah batas waktu Cut-Off ({cutoff_ts}). Ubah Batas Waktu Cut-Off ke tanggal yang lebih lama jika ingin menyinkronkan ulang.",
                "cutoff_used": cutoff_ts,
                "transactions_added": 0,
                "products_updated": 0,
            }

        sales_by_code_date = defaultdict(lambda: defaultdict(int))
        max_ts = cutoff_ts
        for tx in new_txs:
            sales_by_code_date[tx["code"]][tx["date"]] += tx["qty"]
            if tx["timestamp"] > max_ts:
                max_ts = tx["timestamp"]

        updated_count = 0
        new_products_to_insert = []
        ts_int = int(datetime.now().timestamp() * 1000)

        for idx, (pcode, date_map) in enumerate(sales_by_code_date.items()):
            total_sold = sum(date_map.values())
            if pcode in existing_by_code:
                prod_db = existing_by_code[pcode]
                prod_db.stock = max(0, prod_db.stock - total_sold)
                try:
                    hist = json.loads(prod_db.history_json) if prod_db.history_json else []
                except Exception:
                    hist = []
                hist_map = {h["date"]: int(h.get("value", 0)) for h in hist}
                for dt_key, qty_val in date_map.items():
                    hist_map[dt_key] = hist_map.get(dt_key, 0) + qty_val

                sorted_dates = sorted(hist_map.keys())[-30:]
                new_hist = []
                for d_str in sorted_dates:
                    try:
                        dt_obj = datetime.strptime(d_str, "%Y-%m-%d")
                        disp = f"{dt_obj.day}/{dt_obj.month}"
                    except Exception:
                        disp = d_str[-5:]
                    new_hist.append(
                        {
                            "date": d_str,
                            "displayDate": disp,
                            "value": hist_map[d_str],
                        }
                    )
                prod_db.history_json = json.dumps(new_hist)

                if is_ml_active:
                    metrik = hitung_batch_metrik_xgboost([(new_hist, prod_db.price, prod_db.stock)])[0]
                    prod_db.minStock = metrik["min_stock"]
                    prod_db.status = metrik["status"]
                updated_count += 1
            else:
                p_info = products_dict.get(
                    pcode,
                    {
                        "code": pcode[:60],
                        "name": f"Produk {pcode}"[:190],
                        "category": "Katalog Toko",
                        "supplier": "Supplier Umum",
                        "price": 15000,
                        "cost": 12000,
                    },
                )
                sorted_dates = sorted(date_map.keys())[-30:]
                hist_list = []
                for d_str in sorted_dates:
                    try:
                        dt_obj = datetime.strptime(d_str, "%Y-%m-%d")
                        disp = f"{dt_obj.day}/{dt_obj.month}"
                    except Exception:
                        disp = d_str[-5:]
                    hist_list.append(
                        {
                            "date": d_str,
                            "displayDate": disp,
                            "value": date_map[d_str],
                        }
                    )
                stk_baru = max(10, total_sold * 2)
                if is_ml_active:
                    metrik = hitung_batch_metrik_xgboost([(hist_list, p_info["price"], stk_baru)])[0]
                    min_stk_baru = metrik["min_stock"]
                    status_baru = metrik["status"]
                else:
                    min_stk_baru = 0
                    status_baru = "BELUM_DIHITUNG"

                new_products_to_insert.append(
                    {
                        "id": f"P-DLT-{ts_int}-{idx}",
                        "owner_email": current_user.email,
                        "code": pcode[:60],
                        "name": p_info["name"][:190],
                        "category": p_info["category"][:95],
                        "supplier": p_info["supplier"][:140],
                        "price": p_info["price"],
                        "cost": p_info["cost"],
                        "stock": stk_baru,
                        "minStock": min_stk_baru,
                        "status": status_baru,
                        "history_json": json.dumps(hist_list),
                    }
                )
                updated_count += 1

        if new_products_to_insert:
            CHUNK_SIZE = 250
            for i in range(0, len(new_products_to_insert), CHUNK_SIZE):
                db.bulk_insert_mappings(
                    ProductCloud, new_products_to_insert[i : i + CHUNK_SIZE]
                )

        current_user.last_sync_timestamp = max_ts

        ds_record = DatasetCloud(
            id=buat_id_unik("DS-DLT"),
            owner_email=current_user.email,
            filename=file.filename,
            upload_mode="DELTA_SYNC",
            total_products_affected=updated_count,
            total_transactions_synced=len(new_txs),
            cutoff_timestamp_used=cutoff_ts,
            new_last_timestamp=max_ts,
            file_size_kb=file_size_kb,
            uploaded_at=sekarang_str,
            dataset_summary_json=json.dumps(
                {
                    "skipped_old_rows": len(transactions) - len(new_txs),
                    "inserted_new_rows": len(new_txs),
                }
            ),
        )
        db.add(ds_record)

        log_sync = HistoryLogCloud(
            id=buat_id_unik("LOG-SYNC"),
            owner_email=current_user.email,
            log_type="SALES",
            action_label="DELTA SYNC DATASET",
            transaction_date=sekarang_str[:10],
            created_at=sekarang_str,
            product_id="DATASET-DELTA",
            product_code="SYNC-DATA",
            product_name=f"Delta Sync ({file.filename})"[:190],
            category="Sinkronisasi",
            quantity=len(new_txs),
            unit_price=0,
            total_value=0,
            stock_before=0,
            stock_after=updated_count,
            notes=f"Potong otomatis data <= {cutoff_ts}{auto_window_note} | Menyisakan {len(new_txs)} transaksi baru pada {updated_count} produk",
        )
        db.add(log_sync)
        db.commit()

        return {
            "message": f"Sinkronisasi selesai{auto_window_note}. Data lama (<= {cutoff_ts}) dilewati otomatis dan {len(new_txs):,} transaksi baru pada {updated_count:,} produk berhasil disinkronkan.",
            "cutoff_used": cutoff_ts,
            "new_last_timestamp": max_ts,
            "transactions_added": len(new_txs),
            "products_updated": updated_count,
        }

    # =========================================================================
    # MODE FULL_IMPORT ATAU TOP_100
    # =========================================================================
    try:
        sales_by_code_date = defaultdict(lambda: defaultdict(int))
        total_qty_by_code = defaultdict(int)
        max_ts = "2026-01-01 00:00:00"

        for tx in transactions:
            c = tx["code"]
            sales_by_code_date[c][tx["date"]] += tx["qty"]
            total_qty_by_code[c] += tx["qty"]
            if tx["timestamp"] > max_ts:
                max_ts = tx["timestamp"]

        if max_ts == "2026-01-01 00:00:00":
            max_ts = sekarang_str

        max_date_str = max_ts[:10]
        try:
            ref_date = datetime.strptime(max_date_str, "%Y-%m-%d")
        except Exception:
            ref_date = datetime.now()

        date_window_30 = [
            (ref_date - timedelta(days=i)).strftime("%Y-%m-%d")
            for i in range(29, -1, -1)
        ]

        if mode_clean == "TOP_100":
            sorted_top = sorted(
                products_dict.keys(),
                key=lambda k: total_qty_by_code.get(k, 0),
                reverse=True,
            )[:100]
            target_codes = sorted_top
            target_set = set(target_codes)
            synced_tx_count = sum(
                tx["qty"] for tx in transactions if tx["code"] in target_set
            )
        else:
            all_codes_set = set(products_dict.keys()) | set(sales_by_code_date.keys())
            target_codes = sorted(
                list(all_codes_set),
                key=lambda k: total_qty_by_code.get(k, 0),
                reverse=True,
            )
            synced_tx_count = len(transactions)

        ts_int = int(datetime.now().timestamp() * 1000)
        temp_items = []
        batch_ml_inputs = []

        for idx, pcode in enumerate(target_codes):
            p_info = products_dict.get(
                pcode,
                {
                    "code": str(pcode)[:60],
                    "name": f"Produk {pcode}"[:190],
                    "category": "Katalog Toko",
                    "supplier": "Supplier Umum",
                    "price": 15000,
                    "cost": 12000,
                    "stock": None,
                    "minStock": 0,
                },
            )
            c_sales = sales_by_code_date.get(pcode, {})
            hist_30 = []
            for d_str in date_window_30:
                dt_obj = datetime.strptime(d_str, "%Y-%m-%d")
                hist_30.append(
                    {
                        "date": d_str,
                        "displayDate": f"{dt_obj.day}/{dt_obj.month}",
                        "value": int(c_sales.get(d_str, 0)),
                    }
                )

            vals_30 = [int(h["value"]) for h in hist_30]
            total_30 = sum(vals_30)
            avg_30 = total_30 / 30.0

            if p_info.get("stock") is not None:
                stk = int(p_info["stock"])
            else:
                stk = max(0, int(round(avg_30 * 12)) + (idx % 9) - 2)
                if total_30 == 0:
                    stk = 15 + (idx % 20)

            price_clean = int(p_info.get("price") or 15000)
            cost_clean = int(p_info.get("cost") or int(price_clean * 0.8))

            temp_items.append({
                "id": f"P-{idx + 1:05d}-{ts_int}",
                "owner_email": current_user.email,
                "code": str(pcode)[:60],
                "name": str(p_info.get("name") or f"Produk {pcode}")[:190],
                "category": str(p_info.get("category") or "Katalog Toko")[:95],
                "supplier": str(p_info.get("supplier") or "Supplier Umum")[:140],
                "price": price_clean,
                "cost": cost_clean,
                "stock": stk,
                "history_list": hist_30,
            })
            batch_ml_inputs.append((hist_30, price_clean, stk))

        if is_ml_active and batch_ml_inputs:
            ml_results = hitung_batch_metrik_xgboost(batch_ml_inputs)
        else:
            ml_results = None

        new_mappings = []
        for idx, item in enumerate(temp_items):
            stk = item["stock"]
            if ml_results is not None:
                min_stk_val = int(ml_results[idx]["min_stock"])
                status_val = ml_results[idx]["status"]
            else:
                min_stk_val = 0
                status_val = "HABIS" if stk <= 0 else "BELUM_DIHITUNG"

            new_mappings.append({
                "id": item["id"],
                "owner_email": item["owner_email"],
                "code": item["code"],
                "name": item["name"],
                "category": item["category"],
                "supplier": item["supplier"],
                "price": item["price"],
                "cost": item["cost"],
                "stock": stk,
                "minStock": min_stk_val,
                "status": status_val,
                "history_json": json.dumps(item["history_list"]),
            })

        db.query(ProductCloud).filter(
            ProductCloud.owner_email == current_user.email
        ).delete(synchronize_session=False)
        db.flush()

        CHUNK_SIZE = 300
        for i in range(0, len(new_mappings), CHUNK_SIZE):
            db.bulk_insert_mappings(
                ProductCloud, new_mappings[i : i + CHUNK_SIZE]
            )

        current_user.last_sync_timestamp = max_ts

        ds_record = DatasetCloud(
            id=buat_id_unik("DS-IMP"),
            owner_email=current_user.email,
            filename=file.filename,
            upload_mode=mode_clean,
            total_products_affected=len(new_mappings),
            total_transactions_synced=synced_tx_count,
            cutoff_timestamp_used="-",
            new_last_timestamp=max_ts,
            file_size_kb=file_size_kb,
            uploaded_at=sekarang_str,
            dataset_summary_json=json.dumps({"total_transactions": synced_tx_count}),
        )
        db.add(ds_record)

        label_mode = (
            "TOP 100 DATASET" if mode_clean == "TOP_100" else "FULL IMPORT DATASET"
        )
        log_imp = HistoryLogCloud(
            id=buat_id_unik("LOG-IMP"),
            owner_email=current_user.email,
            log_type="PRODUCT",
            action_label=label_mode,
            transaction_date=sekarang_str[:10],
            created_at=sekarang_str,
            product_id=f"DATASET-{mode_clean}",
            product_code="SYNC-DATA",
            product_name=f"Impor Dataset ({file.filename})"[:190],
            category="Sinkronisasi Data",
            quantity=len(new_mappings),
            unit_price=0,
            total_value=0,
            stock_before=0,
            stock_after=len(new_mappings),
            notes=f"Metode: {mode_clean} | Menyimpan {len(new_mappings)} produk & {synced_tx_count} transaksi ke dalam sistem (Waktu data terakhir: {max_ts})",
        )
        db.add(log_imp)
        db.commit()

        mode_desc = (
            "100 Produk Penjualan Tertinggi"
            if mode_clean == "TOP_100"
            else "Impor Katalog Penuh"
        )
        info_ml = " serta dianalisis otomatis" if is_ml_active else ""
        return {
            "message": f"Berhasil! Metode {mode_desc} telah menyinkronkan {len(new_mappings):,} produk ({synced_tx_count:,} transaksi) dari {file.filename}{info_ml}.",
            "mode": mode_clean,
            "products_imported": len(new_mappings),
            "transactions_synced": synced_tx_count,
            "new_last_timestamp": max_ts,
        }
    except Exception as ex:
        db.rollback()
        print(f"Error saat import dataset ({mode_clean}): {ex}")
        raise HTTPException(
            status_code=500,
            detail=f"Gagal menyimpan data impor ke dalam sistem: {str(ex)}"
        )


@router.post("/upload-model")
async def upload_ml_model_to_tidb(
    file: UploadFile = File(...),
    model_name: str = Form("Model Prediksi Utama"),
    current_user: UserCloud = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if (
        getattr(current_user, "subscription_plan", "FREE") or "FREE"
    ).upper() != "PRO":
        raise HTTPException(
            status_code=403,
            detail="Fitur konfigurasi model prediksi hanya tersedia untuk pengguna Paket PRO.",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File model kosong.")

    ext = file.filename.lower().split(".")[-1]
    if ext not in ["json", "ubj", "model", "txt"]:
        raise HTTPException(
            status_code=400,
            detail="Gunakan format file konfigurasi model yang didukung (.json atau .ubj).",
        )

    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        new_xgb = xgb.XGBRegressor()
        new_xgb.load_model(tmp_path)
    except Exception as e:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise HTTPException(
            status_code=400,
            detail=f"File konfigurasi model tidak valid: {str(e)}",
        )
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    encoded_b64 = base64.b64encode(content).decode("utf-8")
    file_size_kb = max(1, len(content) // 1024)
    sekarang_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    db.query(MLModelCloud).update({"is_active": 0})

    model_row = MLModelCloud(
        id=buat_id_unik("MDL-CLOUD"),
        owner_email=current_user.email,
        model_name=model_name.strip() or "Model Prediksi Utama",
        filename=file.filename,
        file_size_kb=file_size_kb,
        model_base64=encoded_b64,
        is_active=1,
        uploaded_at=sekarang_str,
    )
    db.add(model_row)
    db.commit()

    ml_state["model_xgb"] = new_xgb
    ml_state["active_model_name"] = f"{model_row.model_name} ({file.filename})"
    ml_state["owner_email"] = current_user.email

    _, updated_products = sinkronkan_produk_user_dengan_xgboost(
        db, current_user, simpan_ke_db=True
    )

    return {
        "message": f"Model '{model_row.model_name}' ({file_size_kb} KB) berhasil diaktifkan dan memperbarui analisis batas stok minimum untuk {len(updated_products):,} produk.",
        "active_model_name": ml_state["active_model_name"],
    }