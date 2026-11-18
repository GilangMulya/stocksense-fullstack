import json
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import UserCloud, ProductCloud, HistoryLogCloud
from app.schemas import PenjualanBaru, PenjualanBulkRequest
from app.dependencies import get_current_user
from app.utils import (
    buat_id_unik,
    pastikan_model_xgb_siap,
    hitung_metrik_satuan_xgboost,
)

router = APIRouter(prefix="/api/sales", tags=["Sales & Void Transaction"])


def proses_item_penjualan(
    db: Session,
    current_user: UserCloud,
    product_id: str,
    qty: int,
    sale_date: str,
    batch_code: str,
    waktu_input: str,
    payment_info_str: str = ""
):
    produk_db = db.query(ProductCloud).filter(
        ProductCloud.id == product_id,
        ProductCloud.owner_email == current_user.email
    ).first()

    if not produk_db:
        raise HTTPException(status_code=404, detail=f"Produk ID {product_id} tidak ditemukan.")
    if qty <= 0:
        raise HTTPException(status_code=400, detail=f"Jumlah penjualan untuk {produk_db.name} harus lebih dari 0.")
    if produk_db.stock < qty:
        raise HTTPException(
            status_code=400,
            detail=f"Stok {produk_db.name} tidak mencukupi. Sisa stok hanya {produk_db.stock} unit (diminta {qty} unit)."
        )

    stok_awal = produk_db.stock
    produk_db.stock -= qty

    history_list = json.loads(produk_db.history_json) if produk_db.history_json else []
    tanggal_input = datetime.strptime(sale_date, "%Y-%m-%d")
    display_date = f"{tanggal_input.day}/{tanggal_input.month}"

    tanggal_sudah_ada = False
    for riwayat in history_list:
        if riwayat["date"] == sale_date:
            riwayat["value"] += qty
            tanggal_sudah_ada = True
            break

    if not tanggal_sudah_ada:
        history_list.append({
            "date": sale_date,
            "displayDate": display_date,
            "value": qty
        })
        history_list = sorted(history_list, key=lambda x: datetime.strptime(x["date"], "%Y-%m-%d"))

    produk_db.history_json = json.dumps(history_list)

    is_pro = (getattr(current_user, "subscription_plan", "FREE") or "FREE").upper() == "PRO"
    model_xgb = pastikan_model_xgb_siap(db, current_user.email) if is_pro else None
    if is_pro and model_xgb is not None:
        metrik = hitung_metrik_satuan_xgboost(history_list, produk_db.price, produk_db.stock)
        produk_db.minStock = metrik["min_stock"]
        produk_db.status = metrik["status"]
    else:
        produk_db.status = "HABIS" if produk_db.stock <= 0 else "BELUM_DIHITUNG"

    catatan_nota = f"Nota {batch_code} {payment_info_str}| Terjual {qty} unit @ Rp{produk_db.price:,} (Stok: {stok_awal} -> {produk_db.stock})"
    log_sale = HistoryLogCloud(
        id=buat_id_unik("LOG-SLS"),
        owner_email=current_user.email,
        log_type="SALES",
        action_label="PENJUALAN",
        transaction_date=sale_date,
        created_at=waktu_input,
        product_id=produk_db.id,
        product_code=produk_db.code,
        product_name=produk_db.name,
        category=produk_db.category,
        quantity=qty,
        unit_price=produk_db.price,
        total_value=qty * produk_db.price,
        stock_before=stok_awal,
        stock_after=produk_db.stock,
        notes=catatan_nota,
        is_voided=0
    )
    db.add(log_sale)
    return produk_db


@router.post("")
def catat_penjualan_satuan(penjualan: PenjualanBaru, current_user: UserCloud = Depends(get_current_user), db: Session = Depends(get_db)):
    sekarang = datetime.now()
    batch_code = f"TRX-{sekarang.strftime('%Y%m%d-%H%M%S')}"
    waktu_input = sekarang.strftime("%Y-%m-%d %H:%M:%S")

    produk_db = proses_item_penjualan(
        db, current_user, penjualan.productId, penjualan.quantity, penjualan.date, batch_code, waktu_input
    )
    current_user.last_sync_timestamp = waktu_input
    db.commit()

    return {
        "message": f"Penjualan {penjualan.quantity} unit {produk_db.name} berhasil disimpan.",
        "sisa_stok": produk_db.stock,
        "status_baru": produk_db.status
    }


@router.post("/bulk")
def catat_penjualan_sekaligus(req: PenjualanBulkRequest, current_user: UserCloud = Depends(get_current_user), db: Session = Depends(get_db)):
    if not req.items or len(req.items) == 0:
        raise HTTPException(status_code=400, detail="Daftar barang yang dijual masih kosong.")

    sekarang = datetime.now()
    batch_code = f"TRX-{sekarang.strftime('%Y%m%d-%H%M%S')}"
    waktu_input = sekarang.strftime("%Y-%m-%d %H:%M:%S")

    metode = (req.paymentMethod or "TUNAI").upper()
    info_bayar = f"[{metode}] "
    if req.amountPaid and req.amountPaid > 0:
        info_bayar = f"[{metode} | Bayar: Rp{req.amountPaid:,} | Kembali: Rp{req.changeAmount or 0:,}] "

    total_unit = 0
    total_rupiah = 0
    jumlah_produk = 0

    for item in req.items:
        if item.quantity > 0:
            prod = proses_item_penjualan(
                db, current_user, item.productId, item.quantity, req.date, batch_code, waktu_input, info_bayar
            )
            total_unit += item.quantity
            total_rupiah += item.quantity * prod.price
            jumlah_produk += 1

    if jumlah_produk == 0:
        raise HTTPException(status_code=400, detail="Masukkan minimal 1 barang dengan jumlah lebih dari 0.")

    current_user.last_sync_timestamp = waktu_input
    db.commit()

    return {
        "message": f"Transaksi {batch_code} ({metode}) berhasil disimpan.",
        "batch_code": batch_code,
        "timestamp": waktu_input,
        "total_items": jumlah_produk,
        "total_units": total_unit,
        "total_rupiah": total_rupiah
    }


@router.post("/void/{log_id}")
def batalkan_transaksi_penjualan(
    log_id: str,
    current_user: UserCloud = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    log_sale = db.query(HistoryLogCloud).filter(
        HistoryLogCloud.id == log_id,
        HistoryLogCloud.owner_email == current_user.email
    ).first()

    if not log_sale:
        raise HTTPException(status_code=404, detail="Data riwayat penjualan tidak ditemukan.")
    if log_sale.log_type != "SALES":
        raise HTTPException(status_code=400, detail="Hanya transaksi penjualan yang dapat dibatalkan (Void).")
    if getattr(log_sale, "is_voided", 0) == 1:
        raise HTTPException(status_code=400, detail="Transaksi ini sudah pernah dibatalkan sebelumnya.")

    produk_db = db.query(ProductCloud).filter(
        ProductCloud.id == log_sale.product_id,
        ProductCloud.owner_email == current_user.email
    ).first()

    qty_retur = log_sale.quantity
    stok_sebelum_retur = produk_db.stock if produk_db else log_sale.stock_after

    if produk_db:
        produk_db.stock += qty_retur

        history_list = json.loads(produk_db.history_json) if produk_db.history_json else []
        for h in history_list:
            if h["date"] == log_sale.transaction_date:
                h["value"] = max(0, int(h.get("value", 0)) - qty_retur)
                break
        produk_db.history_json = json.dumps(history_list)

        is_pro = (getattr(current_user, "subscription_plan", "FREE") or "FREE").upper() == "PRO"
        model_xgb = pastikan_model_xgb_siap(db, current_user.email) if is_pro else None
        if is_pro and model_xgb is not None:
            metrik = hitung_metrik_satuan_xgboost(history_list, produk_db.price, produk_db.stock)
            produk_db.minStock = metrik["min_stock"]
            produk_db.status = metrik["status"]
        else:
            produk_db.status = "HABIS" if produk_db.stock <= 0 else "BELUM_DIHITUNG"

    stok_sesudah_retur = produk_db.stock if produk_db else (stok_sebelum_retur + qty_retur)
    log_sale.is_voided = 1
    log_sale.notes = f"[VOID / DIBATALKAN] {log_sale.notes}"

    sekarang = datetime.now()
    log_retur = HistoryLogCloud(
        id=buat_id_unik("LOG-VOID"),
        owner_email=current_user.email,
        log_type="PRODUCT",
        action_label="VOID / RETUR PENJUALAN",
        transaction_date=sekarang.strftime("%Y-%m-%d"),
        created_at=sekarang.strftime("%Y-%m-%d %H:%M:%S"),
        product_id=log_sale.product_id,
        product_code=log_sale.product_code,
        product_name=log_sale.product_name,
        category=log_sale.category,
        quantity=qty_retur,
        unit_price=log_sale.unit_price,
        total_value=log_sale.total_value,
        stock_before=stok_sebelum_retur,
        stock_after=stok_sesudah_retur,
        notes=f"Pembatalan (Void) transaksi penjualan ID {log_sale.id} | Stok dikembalikan +{qty_retur} unit ({stok_sebelum_retur} -> {stok_sesudah_retur})"
    )
    db.add(log_retur)
    db.commit()

    return {
        "message": f"Transaksi {log_sale.product_name} ({qty_retur} unit) berhasil dibatalkan dan stok telah dikembalikan ke gudang.",
        "returned_qty": qty_retur,
        "new_stock": stok_sesudah_retur
    }