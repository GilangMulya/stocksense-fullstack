from pydantic import BaseModel
from typing import List, Optional


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    store_name: str


class UpdateProfileRequest(BaseModel):
    full_name: str
    store_name: str
    role: Optional[str] = "Owner"
    store_address: Optional[str] = ""
    store_phone: Optional[str] = ""
    receipt_footer: Optional[str] = ""
    avatar_base64: Optional[str] = None


class SubscriptionUpdateRequest(BaseModel):
    plan: str  # FREE | PRO


class QRISPaymentRequest(BaseModel):
    months: Optional[int] = 1
    payment_reference: Optional[str] = ""


class AdminSetSubscriptionRequest(BaseModel):
    target_email: str
    plan: str                         # FREE | PRO
    pro_expires_at: Optional[str] = ""  # Format: YYYY-MM-DD HH:MM:SS atau YYYY-MM-DD


class SettingsUpdateRequest(BaseModel):
    store_name: str
    store_address: str
    store_phone: str
    receipt_footer: str
    new_password: Optional[str] = ""
    settings_dict: Optional[dict] = {}


class ProdukBaru(BaseModel):
    code: str
    name: str
    category: str
    supplier: str = "Supplier Umum"
    cost: int
    price: int
    stock: int
    minStock: Optional[int] = 0


class ProdukUpdate(BaseModel):
    code: str
    name: str
    category: str
    supplier: str = "Supplier Umum"
    cost: int
    price: int
    minStock: Optional[int] = 0


class StockOpnameRequest(BaseModel):
    actualStock: int
    reason: str = "Selisih Hitung Fisik"
    notes: str = ""


class PenjualanBaru(BaseModel):
    productId: str
    quantity: int
    date: str


class ItemPenjualanBulk(BaseModel):
    productId: str
    quantity: int


class PenjualanBulkRequest(BaseModel):
    date: str
    items: List[ItemPenjualanBulk]
    paymentMethod: Optional[str] = "TUNAI"
    amountPaid: Optional[int] = 0
    changeAmount: Optional[int] = 0


class RestockRequest(BaseModel):
    productId: str
    quantity: int


class BulkRestockItem(BaseModel):
    productId: str
    quantity: int


class BulkRestockRequest(BaseModel):
    items: List[BulkRestockItem]
    supplierFilter: Optional[str] = "SEMUA"


class PrediksiRequest(BaseModel):
    productId: str
    predictionDays: int