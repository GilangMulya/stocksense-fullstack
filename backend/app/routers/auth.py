import json
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import UserCloud, SubscriptionCloud
from app.schemas import (
    LoginRequest, RegisterRequest, UpdateProfileRequest,
    SubscriptionUpdateRequest, QRISPaymentRequest,
    AdminSetSubscriptionRequest, SettingsUpdateRequest
)
from app.dependencies import get_current_user
from app.utils import hash_password, format_user_profile, cek_dan_update_kadaluarsa_pro, buat_id_unik

router = APIRouter(prefix="/api/auth", tags=["Authentication, Profile & Subscription"])

HARGA_PRO_BULANAN = 58000


@router.post("/login")
def login_cloud(req: LoginRequest, db: Session = Depends(get_db)):
    email_clean = req.email.strip().lower()
    user = db.query(UserCloud).filter(UserCloud.email == email_clean).first()

    if not user or user.password_hash != hash_password(req.password):
        raise HTTPException(status_code=401, detail="Email atau password tidak sesuai.")

    user = cek_dan_update_kadaluarsa_pro(user, db)

    token_baru = secrets.token_hex(32)
    user.active_token = token_baru
    db.commit()

    return {
        "message": f"Selamat datang kembali di {user.store_name}.",
        "token": token_baru,
        "user": format_user_profile(user)
    }


@router.post("/register")
def register_cloud(req: RegisterRequest, db: Session = Depends(get_db)):
    email_clean = req.email.strip().lower()
    existing = db.query(UserCloud).filter(UserCloud.email == email_clean).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email ini sudah terdaftar. Silakan langsung masuk.")

    token_baru = secrets.token_hex(32)
    user_baru = UserCloud(
        email=email_clean,
        password_hash=hash_password(req.password),
        full_name=req.full_name.strip(),
        store_name=req.store_name.strip(),
        role="Owner",
        subscription_plan="FREE",
        pro_expires_at="",
        store_address="",
        store_phone="",
        active_token=token_baru
    )
    db.add(user_baru)
    db.commit()

    return {
        "message": f"Akun toko {user_baru.store_name} berhasil dibuat.",
        "token": token_baru,
        "user": format_user_profile(user_baru)
    }


@router.get("/me")
def get_my_profile(current_user: UserCloud = Depends(get_current_user)):
    return {"user": format_user_profile(current_user)}


@router.put("/profile")
def update_user_profile(
    req: UpdateProfileRequest,
    current_user: UserCloud = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if req.avatar_base64:
        if len(req.avatar_base64) > 280000:
            raise HTTPException(
                status_code=400,
                detail="Ukuran foto profil terlalu besar. Gunakan gambar yang lebih kecil."
            )
        current_user.avatar_base64 = req.avatar_base64
    elif req.avatar_base64 == "":
        current_user.avatar_base64 = None

    current_user.full_name = req.full_name.strip()
    current_user.store_name = req.store_name.strip()
    if req.role:
        current_user.role = req.role.strip()
    if req.store_address is not None:
        current_user.store_address = req.store_address.strip()
    if req.store_phone is not None:
        current_user.store_phone = req.store_phone.strip()
    if req.receipt_footer is not None:
        current_user.receipt_footer = req.receipt_footer.strip()

    db.commit()
    return {
        "message": "Profil dan identitas toko berhasil diperbarui.",
        "user": format_user_profile(current_user)
    }


@router.post("/subscription/pay-qris")
def bayar_langganan_pro_qris(
    req: QRISPaymentRequest,
    current_user: UserCloud = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    durasi_bulan = max(1, int(req.months or 1))
    total_bayar = durasi_bulan * HARGA_PRO_BULANAN
    sekarang = datetime.now()

    base_time = sekarang
    existing_exp = (getattr(current_user, "pro_expires_at", None) or "").strip()
    if current_user.subscription_plan == "PRO" and existing_exp:
        try:
            parsed_exp = datetime.strptime(existing_exp[:19], "%Y-%m-%d %H:%M:%S")
            if parsed_exp > sekarang:
                base_time = parsed_exp
        except Exception:
            pass

    expires_dt = base_time + timedelta(days=30 * durasi_bulan)
    started_str = sekarang.strftime("%Y-%m-%d %H:%M:%S")
    expires_str = expires_dt.strftime("%Y-%m-%d %H:%M:%S")

    current_user.subscription_plan = "PRO"
    current_user.pro_expires_at = expires_str

    sub_row = SubscriptionCloud(
        id=buat_id_unik("SUB-QRIS"),
        user_email=current_user.email,
        store_name=current_user.store_name,
        plan="PRO",
        amount=total_bayar,
        payment_method="QRIS",
        status="PAID",
        started_at=started_str,
        expires_at=expires_str,
        notes=f"Pembayaran QRIS Rp{total_bayar:,} ({durasi_bulan} Bulan) | Aktif s/d {expires_str}"
    )
    db.add(sub_row)
    db.commit()

    return {
        "message": f"Pembayaran QRIS Rp{total_bayar:,} berhasil diverifikasi. Paket PRO aktif hingga {expires_str}.",
        "user": format_user_profile(current_user),
        "subscription_record": {
            "id": sub_row.id,
            "amount": total_bayar,
            "started_at": started_str,
            "expires_at": expires_str
        }
    }


@router.put("/subscription")
def update_subscription_plan(
    req: SubscriptionUpdateRequest,
    current_user: UserCloud = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    plan_clean = req.plan.strip().upper()
    if plan_clean not in ["FREE", "PRO"]:
        raise HTTPException(status_code=400, detail="Pilihan paket hanya FREE atau PRO.")

    sekarang = datetime.now()
    started_str = sekarang.strftime("%Y-%m-%d %H:%M:%S")

    if plan_clean == "FREE":
        current_user.subscription_plan = "FREE"
        current_user.pro_expires_at = ""
        exp_str = "-"
    else:
        exp_dt = sekarang + timedelta(days=30)
        exp_str = exp_dt.strftime("%Y-%m-%d %H:%M:%S")
        current_user.subscription_plan = "PRO"
        current_user.pro_expires_at = exp_str

    sub_row = SubscriptionCloud(
        id=buat_id_unik("SUB-UPD"),
        user_email=current_user.email,
        store_name=current_user.store_name,
        plan=plan_clean,
        amount=HARGA_PRO_BULANAN if plan_clean == "PRO" else 0,
        payment_method="SISTEM",
        status="ACTIVE",
        started_at=started_str,
        expires_at=exp_str,
        notes=f"Perubahan status langganan menjadi {plan_clean}"
    )
    db.add(sub_row)
    db.commit()

    return {
        "message": f"Status langganan berhasil diperbarui menjadi paket {plan_clean}.",
        "user": format_user_profile(current_user)
    }


@router.get("/subscriptions-data")
def get_subscriptions_dataset(
    current_user: UserCloud = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    is_owner_db = current_user.email.lower() == "admin@stocksense.id"

    if is_owner_db:
        all_users = db.query(UserCloud).order_by(UserCloud.email.asc()).all()
        all_subs = db.query(SubscriptionCloud).order_by(SubscriptionCloud.started_at.desc()).limit(100).all()
    else:
        all_users = [current_user]
        all_subs = (
            db.query(SubscriptionCloud)
            .filter(SubscriptionCloud.user_email == current_user.email)
            .order_by(SubscriptionCloud.started_at.desc())
            .limit(50)
            .all()
        )

    for u in all_users:
        cek_dan_update_kadaluarsa_pro(u, db)

    return {
        "price_per_month": HARGA_PRO_BULANAN,
        "is_db_owner": is_owner_db,
        "accounts": [
            {
                "email": u.email,
                "full_name": u.full_name,
                "store_name": u.store_name,
                "subscription_plan": (getattr(u, "subscription_plan", "FREE") or "FREE").upper(),
                "pro_expires_at": getattr(u, "pro_expires_at", None) or ""
            }
            for u in all_users
        ],
        "subscriptions_log": [
            {
                "id": s.id,
                "user_email": s.user_email,
                "store_name": s.store_name,
                "plan": s.plan,
                "amount": s.amount,
                "payment_method": s.payment_method,
                "status": s.status,
                "started_at": s.started_at,
                "expires_at": s.expires_at,
                "notes": s.notes
            }
            for s in all_subs
        ]
    }


@router.put("/admin/set-subscription")
def admin_manual_set_subscription(
    req: AdminSetSubscriptionRequest,
    current_user: UserCloud = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    target_email = req.target_email.strip().lower()
    if current_user.email.lower() != "admin@stocksense.id" and current_user.email.lower() != target_email:
        raise HTTPException(status_code=403, detail="Hanya administrator utama yang dapat mengubah status langganan akun lain.")

    target_user = db.query(UserCloud).filter(UserCloud.email == target_email).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Akun pengguna tidak ditemukan.")

    plan_clean = req.plan.strip().upper()
    if plan_clean not in ["FREE", "PRO"]:
        raise HTTPException(status_code=400, detail="Paket harus FREE atau PRO.")

    exp_clean = (req.pro_expires_at or "").strip()
    if plan_clean == "PRO" and len(exp_clean) == 10:
        exp_clean = f"{exp_clean} 23:59:59"
    elif plan_clean == "FREE":
        exp_clean = ""

    target_user.subscription_plan = plan_clean
    target_user.pro_expires_at = exp_clean

    sekarang_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_sub = SubscriptionCloud(
        id=buat_id_unik("SUB-ADM"),
        user_email=target_user.email,
        store_name=target_user.store_name,
        plan=plan_clean,
        amount=0,
        payment_method="ADMIN",
        status="ACTIVE" if plan_clean == "PRO" else "FREE",
        started_at=sekarang_str,
        expires_at=exp_clean or "-",
        notes=f"Diatur oleh Administrator ({current_user.email}) | Berlaku s/d: {exp_clean or 'Selamanya/Free'}"
    )
    db.add(log_sub)
    db.commit()

    return {
        "message": f"Status langganan {target_user.email} berhasil diatur ke paket {plan_clean} (Berlaku s/d: {exp_clean or '-'}).",
        "updated_account": format_user_profile(target_user)
    }


@router.put("/settings")
def update_store_settings(
    req: SettingsUpdateRequest,
    current_user: UserCloud = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    current_user.store_name = req.store_name.strip()
    current_user.store_address = req.store_address.strip()
    current_user.store_phone = req.store_phone.strip()
    current_user.receipt_footer = req.receipt_footer.strip()

    if req.new_password and len(req.new_password.strip()) >= 4:
        current_user.password_hash = hash_password(req.new_password.strip())

    if req.settings_dict is not None:
        current_user.settings_json = json.dumps(req.settings_dict, ensure_ascii=False)

    db.commit()
    return {
        "message": "Pengaturan toko dan perangkat berhasil disimpan.",
        "user": format_user_profile(current_user)
    }