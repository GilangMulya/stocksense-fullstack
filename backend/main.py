import base64
import os
import tempfile

from app.config import FRONTEND_DIR
from app.database import Base, SessionLocal, engine
from app.models import (
    DatasetCloud,
    HistoryLogCloud,
    MLModelCloud,
    ProductCloud,
    SubscriptionCloud,
    UserCloud,
)
from app.routers import auth, history, predict, products, sales, upload_cloud
from app.utils import ml_state, muat_model_aktif_dari_tidb
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

Base.metadata.create_all(bind=engine)

app = FastAPI(title="StockSense TiDB Cloud API", version="5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def disable_static_cache(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.endswith((".js", ".css", ".html")) or request.url.path == "/":
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


def jalankan_migrasi_kolom_tidb():
    daftar_alter = [
        "ALTER TABLE users ADD COLUMN subscription_plan VARCHAR(30) DEFAULT 'FREE'",
        "ALTER TABLE users ADD COLUMN pro_expires_at VARCHAR(40) NULL",
        "ALTER TABLE users ADD COLUMN avatar_base64 LONGTEXT NULL",
        "ALTER TABLE users ADD COLUMN store_address VARCHAR(255) DEFAULT ''",
        "ALTER TABLE users ADD COLUMN store_phone VARCHAR(50) DEFAULT ''",
        "ALTER TABLE users ADD COLUMN receipt_footer VARCHAR(255) DEFAULT 'Terima kasih telah berbelanja di toko kami.'",
        "ALTER TABLE users ADD COLUMN last_sync_timestamp VARCHAR(40) DEFAULT '2026-10-06 22:55:24'",
        "ALTER TABLE users ADD COLUMN settings_json TEXT NULL",
        "ALTER TABLE history_logs ADD COLUMN is_voided INT DEFAULT 0",
    ]
    with engine.connect() as conn:
        for sql_cmd in daftar_alter:
            try:
                conn.execute(text(sql_cmd))
                conn.commit()
            except Exception:
                pass


@app.get("/api/reset-database-total")
def reset_database_tidb_total():
    """Mengosongkan seluruh tabel di TiDB Cloud sekaligus mereset memori model AI di server."""
    db = SessionLocal()
    try:
        db.query(ProductCloud).delete()
        db.query(HistoryLogCloud).delete()
        db.query(DatasetCloud).delete()
        db.query(MLModelCloud).delete()
        db.query(SubscriptionCloud).delete()
        db.query(UserCloud).delete()
        db.commit()

        # Reset state model di RAM server agar benar-benar kosong
        ml_state["model_xgb"] = None
        ml_state["active_model_name"] = None
        ml_state["owner_email"] = None

        return {
            "status": "SUKSES",
            "message": "Seluruh data (Users, Products, History, Datasets, Models, Subscriptions) di TiDB Cloud dan memori model berhasil dikosongkan 100%!"
        }
    except Exception as e:
        db.rollback()
        return {"status": "ERROR", "message": str(e)}
    finally:
        db.close()


@app.on_event("startup")
async def hidupkan_mesin():
    print("Mempersiapkan Server StockSense v5.0 (100% Full TiDB Cloud Tanpa Lokal Fallback)...")

    try:
        jalankan_migrasi_kolom_tidb()
    except Exception as e:
        print(f"Peringatan migrasi kolom: {e}")

    db = SessionLocal()
    try:
        # Murni hanya memuat dari tabel ml_models_cloud di TiDB Cloud (tidak pernah ambil dari folder lokal)
        muat_model_aktif_dari_tidb(db)

        total_users = db.query(UserCloud).count()
        total_products = db.query(ProductCloud).count()
        total_models = db.query(MLModelCloud).count()
        print(f"STATUS TIDB CLOUD AKTIF: {total_users} User | {total_products} Produk | {total_models} Model AI di Cloud")
    except Exception as e:
        print(f"ERROR KONEKSI TIDB CLOUD: {e}")
    finally:
        db.close()


app.include_router(auth.router)
app.include_router(products.router)
app.include_router(sales.router)
app.include_router(predict.router)
app.include_router(history.router)
app.include_router(upload_cloud.router)

if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")