import os

# ==============================================================================
# KONFIGURASI MURNI TIDB CLOUD MYSQL & PATH DIREKTORI
# ==============================================================================
TIDB_HOST = "gateway01.ap-southeast-1.prod.aws.tidbcloud.com"
TIDB_PORT = 4000
TIDB_USER = "3pyYWnx2dURk7vX.root"
TIDB_PASSWORD = "3485NV2A6oRqXbI8"
TIDB_DB_NAME = "test"

if TIDB_PASSWORD == "TEMPEL_PASSWORD_TIDB_KAMU_DISINI" or not TIDB_PASSWORD.strip():
    raise RuntimeError(
        "❌ SERVER DIHENTIKAN: Kamu belum menempelkan password TiDB Cloud pada variabel TIDB_PASSWORD!"
    )

DATABASE_URL = f"mysql+pymysql://{TIDB_USER}:{TIDB_PASSWORD}@{TIDB_HOST}:{TIDB_PORT}/{TIDB_DB_NAME}"

# Mengarah ke folder backend/
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.abspath(os.path.join(BACKEND_DIR, "..", "frontend"))

NAMA_FILE_JSON_LAMA = "stocksense_initialProducts_real.json"
PATH_MODEL_XGB = os.path.join(BACKEND_DIR, "stocksense_xgb.json")
PATH_INITIAL_JSON = os.path.join(BACKEND_DIR, NAMA_FILE_JSON_LAMA)