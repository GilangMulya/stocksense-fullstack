from sqlalchemy import Column, String, Integer, Text
from sqlalchemy.dialects.mysql import LONGTEXT
from app.database import Base


class UserCloud(Base):
    __tablename__ = "users"
    email = Column(String(120), primary_key=True, index=True)
    password_hash = Column(String(256), nullable=False)
    full_name = Column(String(120), nullable=False)
    store_name = Column(String(120), nullable=False)
    role = Column(String(50), default="Owner")
    active_token = Column(String(256), nullable=True, index=True)

    # Fitur Profil, Subscription, Masa Aktif PRO, & Pengaturan Toko
    subscription_plan = Column(String(30), default="FREE")       # FREE | PRO
    pro_expires_at = Column(String(40), nullable=True)           # YYYY-MM-DD HH:MM:SS (Kosong = Tanpa Batas / Free)
    avatar_base64 = Column(LONGTEXT, nullable=True)              # Base64 Image max 200KB
    store_address = Column(String(255), default="")
    store_phone = Column(String(50), default="")
    receipt_footer = Column(String(255), default="Terima kasih telah berbelanja di toko kami.")
    last_sync_timestamp = Column(String(40), default="2026-10-06 22:55:24")
    settings_json = Column(Text, default="{}")


class SubscriptionCloud(Base):
    __tablename__ = "subscriptions_cloud"
    id = Column(String(64), primary_key=True, index=True)
    user_email = Column(String(120), index=True, nullable=False)
    store_name = Column(String(120), default="")
    plan = Column(String(30), nullable=False)                    # FREE | PRO
    amount = Column(Integer, default=58000)                      # Rp 58.000
    payment_method = Column(String(50), default="QRIS")          # QRIS | MANUAL_ADMIN
    status = Column(String(30), default="PAID")                  # PAID | ACTIVE | EXPIRED
    started_at = Column(String(40), nullable=False)
    expires_at = Column(String(40), nullable=False)
    notes = Column(Text, default="")


class ProductCloud(Base):
    __tablename__ = "products"
    id = Column(String(64), primary_key=True, index=True)
    owner_email = Column(String(120), index=True, nullable=False)
    code = Column(String(64), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    category = Column(String(100), nullable=False)
    supplier = Column(String(150), default="Supplier Umum")
    cost = Column(Integer, default=0)
    price = Column(Integer, default=0)
    stock = Column(Integer, default=0)
    minStock = Column(Integer, default=0)
    status = Column(String(30), default="AMAN")
    history_json = Column(LONGTEXT, nullable=False)


class HistoryLogCloud(Base):
    __tablename__ = "history_logs"
    id = Column(String(64), primary_key=True, index=True)
    owner_email = Column(String(120), index=True, nullable=False)
    log_type = Column(String(30), index=True, nullable=False)     # SALES | PRODUCT | PREDICTION
    action_label = Column(String(60), nullable=False)
    transaction_date = Column(String(30), nullable=False)
    created_at = Column(String(40), nullable=False, index=True)
    product_id = Column(String(64), nullable=False)
    product_code = Column(String(64), nullable=False)
    product_name = Column(String(200), nullable=False)
    category = Column(String(100), default="")
    quantity = Column(Integer, default=0)
    unit_price = Column(Integer, default=0)
    total_value = Column(Integer, default=0)
    stock_before = Column(Integer, default=0)
    stock_after = Column(Integer, default=0)
    notes = Column(Text, default="")
    is_voided = Column(Integer, default=0)


class DatasetCloud(Base):
    __tablename__ = "datasets_cloud"
    id = Column(String(64), primary_key=True, index=True)
    owner_email = Column(String(120), index=True, nullable=False)
    filename = Column(String(255), nullable=False)
    upload_mode = Column(String(50), nullable=False)             # FULL_IMPORT | TOP_100 | DELTA_SYNC
    total_products_affected = Column(Integer, default=0)
    total_transactions_synced = Column(Integer, default=0)
    cutoff_timestamp_used = Column(String(40), default="-")
    new_last_timestamp = Column(String(40), default="-")
    file_size_kb = Column(Integer, default=0)
    uploaded_at = Column(String(40), nullable=False)
    dataset_summary_json = Column(LONGTEXT, nullable=True)


class MLModelCloud(Base):
    __tablename__ = "ml_models_cloud"
    id = Column(String(64), primary_key=True, index=True)
    owner_email = Column(String(120), index=True, nullable=False)
    model_name = Column(String(150), nullable=False)
    filename = Column(String(255), nullable=False)
    file_size_kb = Column(Integer, default=0)
    model_base64 = Column(LONGTEXT, nullable=False)
    is_active = Column(Integer, default=1)
    uploaded_at = Column(String(40), nullable=False)