import base64
import json
import math
import os
import hashlib
import secrets
import tempfile
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
import xgboost as xgb
from sqlalchemy.orm import Session
from app.models import UserCloud, ProductCloud, HistoryLogCloud, MLModelCloud

ml_state = {
    "model_xgb": None,
    "active_model_name": None,
    "owner_email": None
}


def muat_model_aktif_dari_tidb(db: Session, owner_email: str = None):
    """
    Memuat model XGBoost murni dari tabel ml_models_cloud di TiDB Cloud.
    """
    query = db.query(MLModelCloud).filter(MLModelCloud.is_active == 1)
    if owner_email:
        user_model = query.filter(MLModelCloud.owner_email == owner_email).order_by(MLModelCloud.uploaded_at.desc()).first()
        active_cloud_model = user_model or query.order_by(MLModelCloud.uploaded_at.desc()).first()
    else:
        active_cloud_model = query.order_by(MLModelCloud.uploaded_at.desc()).first()

    if not active_cloud_model or not active_cloud_model.model_base64:
        ml_state["model_xgb"] = None
        ml_state["active_model_name"] = None
        ml_state["owner_email"] = None
        return None

    ext = active_cloud_model.filename.lower().split(".")[-1]
    raw_bytes = base64.b64decode(active_cloud_model.model_base64.encode("utf-8"))

    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp:
        tmp.write(raw_bytes)
        tmp_path = tmp.name

    try:
        cloud_xgb = xgb.XGBRegressor()
        cloud_xgb.load_model(tmp_path)
        ml_state["model_xgb"] = cloud_xgb
        ml_state["active_model_name"] = f"{active_cloud_model.model_name} ({active_cloud_model.filename})"
        ml_state["owner_email"] = active_cloud_model.owner_email
        return cloud_xgb
    except Exception as ex:
        print(f"Gagal memuat model dari TiDB Cloud: {ex}")
        ml_state["model_xgb"] = None
        ml_state["active_model_name"] = None
        ml_state["owner_email"] = None
        return None
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def pastikan_model_xgb_siap(db: Session, owner_email: str = None):
    """Memastikan model XGBoost aktif tersedia di TiDB Cloud dan sudah dimuat ke memori."""
    try:
        active_row = (
            db.query(MLModelCloud.id, MLModelCloud.model_name, MLModelCloud.filename)
            .filter(MLModelCloud.is_active == 1)
            .first()
        )
        if not active_row:
            ml_state["model_xgb"] = None
            ml_state["active_model_name"] = None
            ml_state["owner_email"] = None
            return None
        if ml_state.get("model_xgb") is None:
            return muat_model_aktif_dari_tidb(db, owner_email)
        return ml_state.get("model_xgb")
    except Exception as ex:
        print(f"Peringatan cek model XGBoost: {ex}")
        return ml_state.get("model_xgb")


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def cek_dan_update_kadaluarsa_pro(u: UserCloud, db: Session) -> UserCloud:
    plan = (getattr(u, "subscription_plan", "FREE") or "FREE").upper()
    exp_str = (getattr(u, "pro_expires_at", None) or "").strip()
    if plan == "PRO" and exp_str:
        sekarang_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        exp_norm = exp_str if len(exp_str) > 10 else f"{exp_str} 23:59:59"
        if sekarang_str > exp_norm:
            u.subscription_plan = "FREE"
            db.commit()
    return u


def hitung_metrik_satuan_xgboost(history_list: list, selling_price: float, current_stock: int = 0) -> dict:
    """Menghitung prediksi 7 hari, safety stock, minStock, status, dan rekomendasi restock murni dari model XGBoost."""
    hasil_batch = hitung_batch_metrik_xgboost([(history_list, selling_price, current_stock)])
    if hasil_batch:
        return hasil_batch[0]
    return {
        "predicted_7d": 0,
        "safety_stock": 0,
        "min_stock": 0,
        "status": "HABIS" if int(current_stock or 0) <= 0 else "BELUM_DIHITUNG",
        "ai_rec_qty": 0
    }


def hitung_min_stock_xgboost(history_list: list, selling_price: float) -> int:
    metrik = hitung_metrik_satuan_xgboost(history_list, selling_price, 0)
    return int(metrik["min_stock"])


def hitung_batch_metrik_xgboost(items_history_price_stock: list) -> list:
    """
    Menghitung secara vektorisasi (batch) di RAM menggunakan model XGBoost aktif:
    - predicted_7d: Total permintaan 7 hari ke depan hasil prediksi XGBoost
    - safety_stock: Stok pengaman berdasarkan variansi penjualan & rata-rata
    - min_stock: Reorder Point AI (predicted_7d + safety_stock)
    - status: HABIS | MENIPIS | AMAN
    - ai_rec_qty: Rekomendasi jumlah kulakan (PO) murni dari kebutuhan prediksi ML
    """
    n = len(items_history_price_stock)
    if n == 0:
        return []

    model_xgb = ml_state.get("model_xgb")
    if model_xgb is None:
        return [
            {
                "predicted_7d": 0,
                "safety_stock": 0,
                "min_stock": 0,
                "status": "HABIS" if int(item[2] or 0) <= 0 else "BELUM_DIHITUNG",
                "ai_rec_qty": 0
            }
            for item in items_history_price_stock
        ]

    mat = np.zeros((n, 37), dtype=np.float64)
    prices = np.zeros(n, dtype=np.float64)
    stocks = np.zeros(n, dtype=int)
    last_dates = []

    for idx, item in enumerate(items_history_price_stock):
        h_list = item[0] if len(item) > 0 else []
        price = item[1] if len(item) > 1 else 0
        stk = item[2] if len(item) > 2 else 0

        vals = [int(h.get("value", 0)) if isinstance(h, dict) else int(h or 0) for h in (h_list or [])]
        if len(vals) < 30:
            buf = ([0] * (30 - len(vals))) + vals
        else:
            buf = vals[-30:]
        mat[idx, :30] = buf
        prices[idx] = float(price or 0)
        stocks[idx] = int(stk or 0)

        if h_list and isinstance(h_list[-1], dict) and "date" in h_list[-1]:
            try:
                last_dates.append(datetime.strptime(h_list[-1]["date"], "%Y-%m-%d"))
            except Exception:
                last_dates.append(datetime.now())
        else:
            last_dates.append(datetime.now())

    avg_30_orig = np.mean(mat[:, :30], axis=1)
    std_7_orig = np.std(mat[:, 23:30], axis=1, ddof=1)
    std_7_orig = np.nan_to_num(std_7_orig, nan=0.0)
    safety_stocks = np.ceil(np.maximum(1.28 * std_7_orig, 0.5 * avg_30_orig)).astype(int)

    try:
        for step in range(7):
            col_idx = 30 + step
            target_dates = [ld + timedelta(days=step + 1) for ld in last_dates]
            dows = np.array([td.weekday() for td in target_dates], dtype=int)
            is_wknds = (dows >= 5).astype(int)
            days_of_month = np.array([td.day for td in target_dates], dtype=int)
            months = np.array([td.month for td in target_dates], dtype=int)

            roll_7 = mat[:, col_idx - 7:col_idx]
            roll_14 = mat[:, col_idx - 14:col_idx]
            roll_30 = mat[:, col_idx - 30:col_idx]
            rstd_7 = np.nan_to_num(np.std(roll_7, axis=1, ddof=1), nan=0.0)

            X_batch = pd.DataFrame({
                'hari_dalam_minggu': dows,
                'apakah_akhir_pekan': is_wknds,
                'tanggal_dalam_bulan': days_of_month,
                'bulan': months,
                'lag_1': mat[:, col_idx - 1],
                'lag_2': mat[:, col_idx - 2],
                'lag_7': mat[:, col_idx - 7],
                'lag_14': mat[:, col_idx - 14],
                'lag_30': mat[:, col_idx - 30],
                'rolling_mean_7': np.mean(roll_7, axis=1),
                'rolling_mean_14': np.mean(roll_14, axis=1),
                'rolling_mean_30': np.mean(roll_30, axis=1),
                'rolling_std_7': rstd_7,
                'kategori_encoded': np.zeros(n, dtype=int),
                'selling_price': prices
            })
            preds = np.round(np.maximum(0.0, model_xgb.predict(X_batch)))
            mat[:, col_idx] = preds

        demand_7d = np.sum(mat[:, 30:37], axis=1).astype(int)
        min_stocks = np.maximum(1, demand_7d + safety_stocks).astype(int)

        results = []
        for idx in range(n):
            stk = int(stocks[idx])
            dem = int(demand_7d[idx])
            saf = int(safety_stocks[idx])
            min_stk = int(min_stocks[idx])

            if stk <= 0:
                status_str = "HABIS"
            elif stk <= min_stk:
                status_str = "MENIPIS"
            else:
                status_str = "AMAN"

            if stk <= min_stk:
                buffer_siklus = max(1, saf if saf > 0 else dem)
                target_restock = min_stk + buffer_siklus
                ai_rec = max(1, target_restock - stk)
            else:
                ai_rec = 0

            results.append({
                "predicted_7d": dem,
                "safety_stock": saf,
                "min_stock": min_stk,
                "status": status_str,
                "ai_rec_qty": ai_rec
            })
        return results
    except Exception as ex:
        print(f"Gagal menjalankan inferensi batch XGBoost: {ex}")
        return [
            {
                "predicted_7d": 0,
                "safety_stock": 0,
                "min_stock": 0,
                "status": "HABIS" if int(item[2] or 0) <= 0 else "BELUM_DIHITUNG",
                "ai_rec_qty": 0
            }
            for item in items_history_price_stock
        ]


def hitung_batch_min_stock_xgboost(items_history_and_price: list) -> list:
    items_with_stock = [(h, p, 0) for (h, p) in items_history_and_price]
    metrics = hitung_batch_metrik_xgboost(items_with_stock)
    return [int(m["min_stock"]) for m in metrics]


def sinkronkan_produk_user_dengan_xgboost(
    db: Session,
    current_user: UserCloud,
    rows: list = None,
    simpan_ke_db: bool = False
):
    """
    Menghitung ulang seluruh produk milik user secara real-time di RAM menggunakan model XGBoost.
    Jika simpan_ke_db=True, menggunakan bulk_update_mappings per chunk agar tidak membuat
    ribuan query UPDATE satuan yang menyebabkan timeout di TiDB Cloud.
    """
    if rows is None:
        rows = (
            db.query(ProductCloud)
            .filter(ProductCloud.owner_email == current_user.email)
            .all()
        )

    is_pro = (getattr(current_user, "subscription_plan", "FREE") or "FREE").upper() == "PRO"
    model_xgb = pastikan_model_xgb_siap(db, current_user.email) if is_pro else None
    is_ml_active = bool(is_pro and model_xgb is not None)

    if not rows:
        return is_ml_active, []

    if not is_ml_active:
        return False, [format_product_row(p, None, False) for p in rows]

    batch_inputs = []
    for p in rows:
        try:
            hist = json.loads(p.history_json) if p.history_json else []
        except Exception:
            hist = []
        batch_inputs.append((hist, p.price, p.stock))

    metrics_list = hitung_batch_metrik_xgboost(batch_inputs)

    formatted_products = []
    mappings_to_update = []

    for p, metrik in zip(rows, metrics_list):
        if simpan_ke_db and (p.minStock != metrik["min_stock"] or p.status != metrik["status"]):
            mappings_to_update.append({
                "id": p.id,
                "minStock": metrik["min_stock"],
                "status": metrik["status"]
            })
        formatted_products.append(format_product_row(p, metrik, True))

    if simpan_ke_db and mappings_to_update:
        try:
            CHUNK_SIZE = 250
            for i in range(0, len(mappings_to_update), CHUNK_SIZE):
                db.bulk_update_mappings(ProductCloud, mappings_to_update[i:i + CHUNK_SIZE])
            db.commit()
        except Exception as ex:
            db.rollback()
            print(f"Peringatan bulk update minStock ke TiDB: {ex}")

    return True, formatted_products


def format_user_profile(u: UserCloud) -> dict:
    try:
        settings_parsed = json.loads(u.settings_json) if u.settings_json else {}
    except Exception:
        settings_parsed = {}

    return {
        "email": u.email,
        "full_name": u.full_name,
        "store_name": u.store_name,
        "role": u.role or "Owner",
        "subscription_plan": (getattr(u, "subscription_plan", "FREE") or "FREE").upper(),
        "pro_expires_at": getattr(u, "pro_expires_at", None) or "",
        "is_db_owner": u.email.lower() == "admin@stocksense.id",
        "avatar_base64": getattr(u, "avatar_base64", None),
        "store_address": getattr(u, "store_address", "") or "",
        "store_phone": getattr(u, "store_phone", "") or "",
        "receipt_footer": getattr(u, "receipt_footer", "Terima kasih telah berbelanja di toko kami.") or "Terima kasih telah berbelanja di toko kami.",
        "last_sync_timestamp": getattr(u, "last_sync_timestamp", "2026-10-06 22:55:24") or "2026-10-06 22:55:24",
        "settings": settings_parsed
    }


def format_product_row(p: ProductCloud, ml_metrics: dict = None, is_ml_active: bool = False) -> dict:
    try:
        hist = json.loads(p.history_json) if p.history_json else []
    except Exception:
        hist = []

    if is_ml_active and ml_metrics is not None:
        return {
            "id": p.id,
            "code": p.code,
            "name": p.name,
            "category": p.category,
            "price": p.price,
            "cost": p.cost,
            "stock": p.stock,
            "minStock": ml_metrics["min_stock"],
            "predicted7d": ml_metrics["predicted_7d"],
            "safetyStock": ml_metrics["safety_stock"],
            "aiRecQty": ml_metrics["ai_rec_qty"],
            "supplier": p.supplier or "Supplier Umum",
            "status": ml_metrics["status"],
            "isMlActive": True,
            "history": hist
        }

    return {
        "id": p.id,
        "code": p.code,
        "name": p.name,
        "category": p.category,
        "price": p.price,
        "cost": p.cost,
        "stock": p.stock,
        "minStock": None,
        "predicted7d": None,
        "safetyStock": None,
        "aiRecQty": 0,
        "supplier": p.supplier or "Supplier Umum",
        "status": "HABIS" if (p.stock or 0) <= 0 else None,
        "isMlActive": False,
        "history": hist
    }


def format_history_row(h: HistoryLogCloud) -> dict:
    return {
        "id": h.id,
        "log_type": h.log_type,
        "action_label": h.action_label,
        "transaction_date": h.transaction_date,
        "created_at": h.created_at,
        "product_id": h.product_id,
        "product_code": h.product_code,
        "product_name": h.product_name,
        "category": h.category,
        "quantity": h.quantity,
        "unit_price": h.unit_price,
        "total_value": h.total_value,
        "stock_before": h.stock_before,
        "stock_after": h.stock_after,
        "notes": h.notes,
        "is_voided": getattr(h, "is_voided", 0) or 0
    }


def buat_id_unik(prefix: str) -> str:
    return f"{prefix}-{int(datetime.now().timestamp() * 1000)}-{secrets.token_hex(3)}"