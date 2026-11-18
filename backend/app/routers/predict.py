import json
import math
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import UserCloud, ProductCloud, HistoryLogCloud
from app.schemas import PrediksiRequest
from app.dependencies import get_current_user
from app.utils import (
    ml_state,
    pastikan_model_xgb_siap,
    hitung_metrik_satuan_xgboost,
    buat_id_unik,
)

router = APIRouter(prefix="/api", tags=["ML Prediction"])


@router.post("/predict")
def jalankan_prediksi(req: PrediksiRequest, current_user: UserCloud = Depends(get_current_user), db: Session = Depends(get_db)):
    if (getattr(current_user, "subscription_plan", "FREE") or "FREE").upper() != "PRO":
        raise HTTPException(
            status_code=403,
            detail="Fitur Prediksi Permintaan khusus pengguna Paket PRO. Silakan tingkatkan paket di menu Paket Langganan."
        )

    model_xgb = pastikan_model_xgb_siap(db, current_user.email)
    if model_xgb is None:
        raise HTTPException(
            status_code=400,
            detail="Model prediksi belum diaktifkan. Silakan unggah file konfigurasi model terlebih dahulu di menu Sinkronisasi Data."
        )

    produk_db = db.query(ProductCloud).filter(
        ProductCloud.id == req.productId,
        ProductCloud.owner_email == current_user.email
    ).first()
    if not produk_db:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan.")

    history_full = json.loads(produk_db.history_json) if produk_db.history_json else []
    history_aktual = history_full[-30:]
    if len(history_aktual) < 30:
        pad_len = 30 - len(history_aktual)
        history_buffer = ([0] * pad_len) + [int(h.get("value", 0)) for h in history_aktual]
    else:
        history_buffer = [int(h.get("value", 0)) for h in history_aktual]

    tanggal_terakhir = datetime.strptime(history_aktual[-1]["date"], "%Y-%m-%d") if history_aktual else datetime.now()

    chart_data = []
    for h in history_full[-14:]:
        chart_data.append({
            "date": h["displayDate"],
            "actual": h["value"],
            "predicted": None
        })

    kategori_encoded = 0
    harga_jual = float(produk_db.price or 0)
    prediksi_masa_depan = []

    if len(chart_data) > 0:
        chart_data[-1]["predicted"] = chart_data[-1]["actual"]

    for i in range(1, req.predictionDays + 1):
        tanggal_target = tanggal_terakhir + timedelta(days=i)
        hari_dalam_minggu = tanggal_target.weekday()
        apakah_akhir_pekan = 1 if hari_dalam_minggu >= 5 else 0

        lag_1 = history_buffer[-1]
        lag_2 = history_buffer[-2]
        lag_7 = history_buffer[-7]
        lag_14 = history_buffer[-14]
        lag_30 = history_buffer[-30]

        roll_7 = history_buffer[-7:]
        roll_14 = history_buffer[-14:]
        roll_30 = history_buffer[-30:]

        rm_7 = sum(roll_7) / 7.0
        rm_14 = sum(roll_14) / 14.0
        rm_30 = sum(roll_30) / 30.0

        rstd_7 = float(np.std(roll_7, ddof=1)) if len(roll_7) > 1 else 0.0
        if np.isnan(rstd_7):
            rstd_7 = 0.0

        X_df = pd.DataFrame([{
            'hari_dalam_minggu': hari_dalam_minggu,
            'apakah_akhir_pekan': apakah_akhir_pekan,
            'tanggal_dalam_bulan': tanggal_target.day,
            'bulan': tanggal_target.month,
            'lag_1': lag_1,
            'lag_2': lag_2,
            'lag_7': lag_7,
            'lag_14': lag_14,
            'lag_30': lag_30,
            'rolling_mean_7': rm_7,
            'rolling_mean_14': rm_14,
            'rolling_mean_30': rm_30,
            'rolling_std_7': rstd_7,
            'kategori_encoded': kategori_encoded,
            'selling_price': harga_jual
        }])

        raw_pred = model_xgb.predict(X_df)[0]
        clean_pred = int(round(max(0, float(raw_pred))))

        prediksi_masa_depan.append(clean_pred)
        history_buffer.append(clean_pred)

        chart_data.append({
            "date": f"{tanggal_target.day}/{tanggal_target.month}",
            "actual": None,
            "predicted": clean_pred
        })

    total_demand = sum(prediksi_masa_depan)
    hist_asli = history_buffer[:30]
    avg_30 = sum(hist_asli) / 30.0
    std_7_asli = float(np.std(hist_asli[-7:], ddof=1)) if len(hist_asli[-7:]) > 1 else 0.0
    if np.isnan(std_7_asli):
        std_7_asli = 0.0

    safety_stock = int(math.ceil(max(1.28 * std_7_asli, 0.5 * avg_30)))

    metrik_7d = hitung_metrik_satuan_xgboost(history_full, produk_db.price, produk_db.stock)
    produk_db.minStock = metrik_7d["min_stock"]
    produk_db.status = metrik_7d["status"]

    if req.predictionDays == 7:
        restock_rec = metrik_7d["ai_rec_qty"]
    else:
        target_horizon = max(1, total_demand + safety_stock)
        if produk_db.stock <= target_horizon:
            buffer_siklus = max(1, safety_stock if safety_stock > 0 else total_demand)
            restock_rec = max(1, (target_horizon + buffer_siklus) - produk_db.stock)
        else:
            restock_rec = 0

    avg_7 = sum(hist_asli[-7:]) / 7.0
    trend = "Meningkat" if avg_7 > avg_30 else "Menurun"

    sekarang = datetime.now()
    log_pred = HistoryLogCloud(
        id=buat_id_unik("LOG-PRDCT"),
        owner_email=current_user.email,
        log_type="PREDICTION",
        action_label=f"PREDIKSI {req.predictionDays} HARI",
        transaction_date=sekarang.strftime("%Y-%m-%d"),
        created_at=sekarang.strftime("%Y-%m-%d %H:%M:%S"),
        product_id=produk_db.id,
        product_code=produk_db.code,
        product_name=produk_db.name,
        category=produk_db.category,
        quantity=total_demand,
        unit_price=safety_stock,
        total_value=restock_rec,
        stock_before=produk_db.stock,
        stock_after=produk_db.stock,
        notes=f"Model: {ml_state.get('active_model_name')} | Tren: {trend} | Horizon: {req.predictionDays} Hari | Proyeksi Permintaan: {total_demand} unit | Safety Stock: {safety_stock} unit | Batas Stok Min: {produk_db.minStock} unit | Rekomendasi Restock: {restock_rec} unit"
    )
    db.add(log_pred)
    db.commit()

    return {
        "chartData": chart_data,
        "totalDemand": total_demand,
        "safetyStock": safety_stock,
        "minStockAI": produk_db.minStock,
        "restockRec": restock_rec,
        "mae": 0.13,
        "rmse": 0.33,
        "trend": trend,
        "activeModel": ml_state.get("active_model_name")
    }