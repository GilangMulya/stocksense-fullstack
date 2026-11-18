import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import UserCloud, ProductCloud, HistoryLogCloud
from app.dependencies import get_current_user
from app.utils import format_history_row

router = APIRouter(prefix="/api", tags=["History Logs & 3-Tab Dataset"])


@router.get("/history")
def get_all_history(current_user: UserCloud = Depends(get_current_user), db: Session = Depends(get_db)):
    logs = (
        db.query(HistoryLogCloud)
        .filter(HistoryLogCloud.owner_email == current_user.email)
        .order_by(HistoryLogCloud.created_at.desc())
        .all()
    )
    return [format_history_row(l) for l in logs]


@router.get("/history/dataset-tabs")
def get_three_tabs_dataset_format(
    current_user: UserCloud = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Menyusun data dari TiDB Cloud ke dalam 3 struktur tab yang identik dengan file dataset asli:
    1. Penjualan (orders_id, create_at, month, date, time, description, payment_id, no_payment, pembayaran, total, user_id, member_id)
    2. Barang Keluar (date_out, month, date, order_id, product_id, discount, desc)
    3. Produk (product_id, categories_id, name, brand, selling_price)
    """
    products = db.query(ProductCloud).filter(ProductCloud.owner_email == current_user.email).all()
    sales_logs = (
        db.query(HistoryLogCloud)
        .filter(HistoryLogCloud.owner_email == current_user.email, HistoryLogCloud.log_type == "SALES")
        .order_by(HistoryLogCloud.created_at.desc())
        .all()
    )

    tab_produk = []
    tab_barang_keluar = []
    tab_penjualan = []

    for p in products:
        tab_produk.append({
            "product_id": p.code,
            "categories_id": p.category or "0",
            "name": p.name,
            "brand": p.supplier or "",
            "selling_price": p.price
        })

    # Bangun Penjualan & Barang Keluar dari log transaksi penjualan + histori produk
    order_seq = 100001
    for idx, sl in enumerate(sales_logs):
        if getattr(sl, "is_voided", 0) == 1:
            continue
        ts_str = sl.created_at or f"{sl.transaction_date} 12:00:00"
        dt_part = ts_str[:10]
        tm_part = ts_str[11:19] if len(ts_str) >= 19 else "12:00:00"
        parts = dt_part.split("-")
        yr = int(parts[0]) if len(parts) == 3 else 2026
        mo = int(parts[1]) if len(parts) == 3 else 1
        dy = int(parts[2]) if len(parts) == 3 else 1
        oid = order_seq + idx

        tab_penjualan.append({
            "orders_id": oid,
            "create_at": yr,
            "month": mo,
            "date": dy,
            "time": tm_part,
            "description": "-",
            "payment_id": "2" if "QRIS" in (sl.notes or "") else "1",
            "no_payment": "NULL",
            "pembayaran": sl.total_value,
            "total": sl.total_value,
            "user_id": 1,
            "member_id": "NULL"
        })

        for _ in range(max(1, min(sl.quantity, 20))):
            tab_barang_keluar.append({
                "date_out": yr,
                "month": mo,
                "date": dy,
                "order_id": oid,
                "product_id": sl.product_code,
                "discount": 0,
                "desc": "default"
            })

    # Jika belum banyak sales_logs baru, lengkapi juga dari histori produk di TiDB Cloud agar 3 tab penuh
    if len(tab_barang_keluar) < 200:
        for p in products[:300]:
            try:
                hist = json.loads(p.history_json) if p.history_json else []
            except Exception:
                hist = []
            for h in hist:
                val = int(h.get("value", 0))
                if val > 0:
                    d_str = h.get("date", "2026-10-06")
                    parts = d_str.split("-")
                    yr = int(parts[0]) if len(parts) == 3 else 2026
                    mo = int(parts[1]) if len(parts) == 3 else 10
                    dy = int(parts[2]) if len(parts) == 3 else 6
                    order_seq += 1
                    total_rp = val * (p.price or 0)
                    tab_penjualan.append({
                        "orders_id": order_seq,
                        "create_at": yr,
                        "month": mo,
                        "date": dy,
                        "time": "12:00:00",
                        "description": "-",
                        "payment_id": "1",
                        "no_payment": "NULL",
                        "pembayaran": total_rp,
                        "total": total_rp,
                        "user_id": 1,
                        "member_id": "NULL"
                    })
                    tab_barang_keluar.append({
                        "date_out": yr,
                        "month": mo,
                        "date": dy,
                        "order_id": order_seq,
                        "product_id": p.code,
                        "discount": 0,
                        "desc": "default"
                    })
                    if len(tab_barang_keluar) >= 1500:
                        break
            if len(tab_barang_keluar) >= 1500:
                break

    return {
        "Penjualan": tab_penjualan,
        "Barang Keluar": tab_barang_keluar,
        "Produk": tab_produk
    }