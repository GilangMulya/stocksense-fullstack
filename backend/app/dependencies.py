from fastapi import HTTPException, Depends, Header
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import UserCloud
from app.utils import cek_dan_update_kadaluarsa_pro


def get_current_user(authorization: str = Header(None), db: Session = Depends(get_db)) -> UserCloud:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sesi login tidak valid. Silakan login kembali.")
    token = authorization.split(" ")[1]
    user = db.query(UserCloud).filter(UserCloud.active_token == token).first()
    if not user:
        raise HTTPException(status_code=401, detail="Token kedaluwarsa atau akun tidak ditemukan.")
    return cek_dan_update_kadaluarsa_pro(user, db)