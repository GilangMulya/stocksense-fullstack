import json
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import UserCloud, ProductCloud, HistoryLogCloud
from app.schemas import (
    ProdukBaru,
    ProdukUpdate,
    StockOpnameRequest,
    RestockRequest,
    BulkRestockRequest,
)
from app.dependencies import get_current_user
from app.utils import (
    ml_state,
    pastikan_model_xgb_siap,
    format_product_row,
    buat_id_unik,
    hitung_metrik_satuan_xgboost,
    sinkronkan_produk_user_dengan_xgboost,
)

router = APIRouter(prefix="/api", tags=["Products, Opname & Smart Restock"])


@router.get("/products")
def get_all_products(
    current_user: UserCloud = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _, formatted_list = sinkronkan_produk_user_dengan_xgboost(db, current_user)
    return formatted_list


@router.post("/products")
def tambah_produk_baru(
    produk: ProdukBaru,
    current_user: UserCloud = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hari_ini = datetime.now()
    history_awal = []
    for i in range(29, -1, -1):
        tanggal_hist = hari_ini - timedelta(days=i)
        history_awal.append(
            {
                "date": tanggal_hist.strftime("%Y-%m-%d"),
                "displayDate": f"{tanggal_hist.day}/{tanggal_hist.month}",
                "value": 0,
            }
        )

    is_pro = (getattr(current_user, "subscription_plan", "FREE") or "FREE").upper() == "PRO"
    model_xgb = pastikan_model_xgb_siap(db, current_user.email) if is_pro else None
    is_ml_active = bool(is_pro and model_xgb is not None)

    if is_ml_active:
        metrik = hitung_metrik_satuan_xgboost(history_awal, produk.price, produk.stock)
        min_stock_final = metrik["min_stock"]
        status_stok = metrik["status"]
    else:
        metrik = None
        min_stock_final = 0
        status_stok = "HABIS" if produk.stock <= 0 else "BELUM_DIHITUNG"

    prod_id = f"P{int(hari_ini.timestamp() * 1000)}"
    new_prod = ProductCloud(
        id=prod_id,
        owner_email=current_user.email,
        code=produk.code.strip(),
        name=produk.name.strip(),
        category=produk.category,
        price=produk.price,
        cost=produk.cost,
        stock=produk.stock,
        minStock=min_stock_final,
        supplier=produk.supplier.strip() or "Supplier Umum",
        status=status_stok,
        history_json=json.dumps(history_awal),
    )
    db.add(new_prod)

    ket_min = f"Batas Stok Min: {min_stock_final} unit" if is_ml_active else "Batas Stok Min: Standar"
    log_baru = HistoryLogCloud(
        id=buat_id_unik("LOG-PRD"),
        owner_email=current_user.email,
        log_type="PRODUCT",
        action_label="PRODUK BARU",
        transaction_date=hari_ini.strftime("%Y-%m-%d"),
        created_at=hari_ini.strftime("%Y-%m-%d %H:%M:%S"),
        product_id=prod_id,
        product_code=new_prod.code,
        product_name=new_prod.name,
        category=new_prod.category,
        quantity=produk.stock,
        unit_price=produk.price,
        total_value=produk.stock * produk.cost,
        stock_before=0,
        stock_after=produk.stock,
        notes=f"Produk Baru | Supplier: {new_prod.supplier} | {ket_min}",
    )
    db.add(log_baru)
    db.commit()

    return {
        "message": f"Produk {produk.name} berhasil ditambahkan ke katalog ({ket_min}).",
        "data": format_product_row(new_prod, metrik, is_ml_active),
    }


@router.post("/products/recalculate-minstock-ai")
def hitung_ulang_semua_minstock_xgboost(
    current_user: UserCloud = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if (getattr(current_user, "subscription_plan", "FREE") or "FREE").upper() != "PRO":
        raise HTTPException(
            status_code=403,
            detail="Fitur analisis batas stok minimum khusus pengguna Paket PRO.",
        )

    model_xgb = pastikan_model_xgb_siap(db, current_user.email)
    if model_xgb is None:
        raise HTTPException(
            status_code=400,
            detail="Model prediksi belum diaktifkan. Silakan unggah file konfigurasi model terlebih dahulu di menu Sinkronisasi Data.",
        )

    _, updated_products = sinkronkan_produk_user_dengan_xgboost(db, current_user)
    if not updated_products:
        return {"message": "Tidak ada produk untuk dianalisis.", "updated_count": 0}

    return {
        "message": f"Analisis batas stok minimum dan status ketersediaan untuk {len(updated_products):,} produk berhasil diperbarui.",
        "updated_count": len(updated_products),
    }


@router.put("/products/{product_id}")
def edit_produk(
    product_id: str,
    req: ProdukUpdate,
    current_user: UserCloud = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    produk_db = (
        db.query(ProductCloud)
        .filter(
            ProductCloud.id == product_id,
            ProductCloud.owner_email == current_user.email,
        )
        .first()
    )
    if not produk_db:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan.")

    old_price, old_cost, old_name = produk_db.price, produk_db.cost, produk_db.name

    produk_db.code = req.code.strip()
    produk_db.name = req.name.strip()
    produk_db.category = req.category
    produk_db.supplier = req.supplier.strip() or "Supplier Umum"
    produk_db.cost = req.cost
    produk_db.price = req.price

    is_pro = (getattr(current_user, "subscription_plan", "FREE") or "FREE").upper() == "PRO"
    model_xgb = pastikan_model_xgb_siap(db, current_user.email) if is_pro else None
    is_ml_active = bool(is_pro and model_xgb is not None)

    hist = json.loads(produk_db.history_json) if produk_db.history_json else []
    if is_ml_active:
        metrik = hitung_metrik_satuan_xgboost(hist, req.price, produk_db.stock)
        produk_db.minStock = metrik["min_stock"]
        produk_db.status = metrik["status"]
    else:
        metrik = None
        produk_db.minStock = 0
        produk_db.status = "HABIS" if produk_db.stock <= 0 else "BELUM_DIHITUNG"

    sekarang = datetime.now()
    log_edit = HistoryLogCloud(
        id=buat_id_unik("LOG-EDT"),
        owner_email=current_user.email,
        log_type="PRODUCT",
        action_label="EDIT PRODUK",
        transaction_date=sekarang.strftime("%Y-%m-%d"),
        created_at=sekarang.strftime("%Y-%m-%d %H:%M:%S"),
        product_id=produk_db.id,
        product_code=produk_db.code,
        product_name=produk_db.name,
        category=produk_db.category,
        quantity=0,
        unit_price=produk_db.price,
        total_value=produk_db.cost,
        stock_before=produk_db.stock,
        stock_after=produk_db.stock,
        notes=f"Edit Produk ({old_name} -> {produk_db.name}) | Modal: Rp{old_cost:,}->Rp{produk_db.cost:,} | Harga: Rp{old_price:,}->Rp{produk_db.price:,}",
    )
    db.add(log_edit)
    db.commit()

    return {
        "message": f"Data produk {produk_db.name} berhasil diperbarui.",
        "data": format_product_row(produk_db, metrik, is_ml_active),
    }


@router.delete("/products/{product_id}")
def hapus_produk(
    product_id: str,
    current_user: UserCloud = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    produk_db = (
        db.query(ProductCloud)
        .filter(
            ProductCloud.id == product_id,
            ProductCloud.owner_email == current_user.email,
        )
        .first()
    )
    if not produk_db:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan.")

    nama_hapus = produk_db.name
    kode_hapus = produk_db.code
    stok_terakhir = produk_db.stock
    kat_hapus = produk_db.category
    harga_hapus = produk_db.price

    db.delete(produk_db)

    sekarang = datetime.now()
    log_del = HistoryLogCloud(
        id=buat_id_unik("LOG-DEL"),
        owner_email=current_user.email,
        log_type="PRODUCT",
        action_label="HAPUS PRODUK",
        transaction_date=sekarang.strftime("%Y-%m-%d"),
        created_at=sekarang.strftime("%Y-%m-%d %H:%M:%S"),
        product_id=product_id,
        product_code=kode_hapus,
        product_name=nama_hapus,
        category=kat_hapus,
        quantity=stok_terakhir,
        unit_price=harga_hapus,
        total_value=0,
        stock_before=stok_terakhir,
        stock_after=0,
        notes=f"Penghapusan produk dari katalog gudang (Sisa stok terakhir: {stok_terakhir} unit)",
    )
    db.add(log_del)
    db.commit()

    return {
        "message": f"Produk {nama_hapus} ({kode_hapus}) berhasil dihapus dari katalog."
    }


@router.post("/products/{product_id}/opname")
def koreksi_stock_opname(
    product_id: str,
    req: StockOpnameRequest,
    current_user: UserCloud = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    produk_db = (
        db.query(ProductCloud)
        .filter(
            ProductCloud.id == product_id,
            ProductCloud.owner_email == current_user.email,
        )
        .first()
    )
    if not produk_db:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan.")
    if req.actualStock < 0:
        raise HTTPException(
            status_code=400, detail="Stok fisik tidak boleh negatif."
        )

    stok_sistem = produk_db.stock
    selisih = req.actualStock - stok_sistem
    produk_db.stock = req.actualStock

    is_pro = (getattr(current_user, "subscription_plan", "FREE") or "FREE").upper() == "PRO"
    model_xgb = pastikan_model_xgb_siap(db, current_user.email) if is_pro else None
    is_ml_active = bool(is_pro and model_xgb is not None)

    hist = json.loads(produk_db.history_json) if produk_db.history_json else []
    if is_ml_active:
        metrik = hitung_metrik_satuan_xgboost(hist, produk_db.price, produk_db.stock)
        produk_db.minStock = metrik["min_stock"]
        produk_db.status = metrik["status"]
    else:
        metrik = None
        produk_db.status = "HABIS" if produk_db.stock <= 0 else "BELUM_DIHITUNG"

    sekarang = datetime.now()
    log_opname = HistoryLogCloud(
        id=buat_id_unik("LOG-OPN"),
        owner_email=current_user.email,
        log_type="PRODUCT",
        action_label="STOCK OPNAME",
        transaction_date=sekarang.strftime("%Y-%m-%d"),
        created_at=sekarang.strftime("%Y-%m-%d %H:%M:%S"),
        product_id=produk_db.id,
        product_code=produk_db.code,
        product_name=produk_db.name,
        category=produk_db.category,
        quantity=abs(selisih),
        unit_price=produk_db.price,
        total_value=abs(selisih) * produk_db.cost,
        stock_before=stok_sistem,
        stock_after=produk_db.stock,
        notes=f"Stock Opname ({req.reason}) | Selisih: {selisih:+d} unit (Sistem: {stok_sistem} -> Fisik: {produk_db.stock}). Catatan: {req.notes or '-'}",
    )
    db.add(log_opname)
    db.commit()

    return {
        "message": f"Stock Opname {produk_db.name} selesai. Stok disesuaikan dari {stok_sistem} menjadi {produk_db.stock} unit.",
        "data": format_product_row(produk_db, metrik, is_ml_active),
    }


@router.post("/restock")
def tambah_stok_produk(
    req: RestockRequest,
    current_user: UserCloud = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    produk_db = (
        db.query(ProductCloud)
        .filter(
            ProductCloud.id == req.productId,
            ProductCloud.owner_email == current_user.email,
        )
        .first()
    )

    if not produk_db:
        raise HTTPException(
            status_code=404,
            detail="Produk tidak ditemukan di katalog Anda.",
        )
    if req.quantity <= 0:
        raise HTTPException(
            status_code=400, detail="Jumlah tambahan stok harus lebih dari 0."
        )

    stok_sebelum = produk_db.stock
    produk_db.stock += req.quantity

    is_pro = (getattr(current_user, "subscription_plan", "FREE") or "FREE").upper() == "PRO"
    model_xgb = pastikan_model_xgb_siap(db, current_user.email) if is_pro else None
    is_ml_active = bool(is_pro and model_xgb is not None)

    hist = json.loads(produk_db.history_json) if produk_db.history_json else []
    if is_ml_active:
        metrik = hitung_metrik_satuan_xgboost(hist, produk_db.price, produk_db.stock)
        produk_db.minStock = metrik["min_stock"]
        produk_db.status = metrik["status"]
    else:
        produk_db.status = "HABIS" if produk_db.stock <= 0 else "BELUM_DIHITUNG"

    sekarang = datetime.now()
    log_restock = HistoryLogCloud(
        id=buat_id_unik("LOG-RST"),
        owner_email=current_user.email,
        log_type="PRODUCT",
        action_label="RESTOCK STOK",
        transaction_date=sekarang.strftime("%Y-%m-%d"),
        created_at=sekarang.strftime("%Y-%m-%d %H:%M:%S"),
        product_id=produk_db.id,
        product_code=produk_db.code,
        product_name=produk_db.name,
        category=produk_db.category,
        quantity=req.quantity,
        unit_price=produk_db.cost,
        total_value=req.quantity * produk_db.cost,
        stock_before=stok_sebelum,
        stock_after=produk_db.stock,
        notes=f"Penambahan stok +{req.quantity} unit (Stok: {stok_sebelum} -> {produk_db.stock})",
    )
    db.add(log_restock)
    db.commit()

    return {
        "message": f"Stok {produk_db.name} berhasil ditambah +{req.quantity} unit.",
        "sisa_stok": produk_db.stock,
        "status_baru": produk_db.status if is_ml_active else None,
    }


@router.post("/restock/bulk")
def terima_barang_masuk_po_sekaligus(
    req: BulkRestockRequest,
    current_user: UserCloud = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if (getattr(current_user, "subscription_plan", "FREE") or "FREE").upper() != "PRO":
        raise HTTPException(
            status_code=403,
            detail="Fitur Pesanan Pembelian (PO) khusus pengguna Paket PRO.",
        )
    if not req.items:
        raise HTTPException(
            status_code=400,
            detail="Tidak ada barang yang dipilih untuk diterima.",
        )

    model_xgb = pastikan_model_xgb_siap(db, current_user.email)
    is_ml_active = model_xgb is not None

    sekarang = datetime.now()
    po_code = f"PO-{sekarang.strftime('%Y%m%d-%H%M%S')}"
    total_produk_direstock = 0
    total_unit_masuk = 0
    total_modal = 0

    for item in req.items:
        if item.quantity <= 0:
            continue
        produk_db = (
            db.query(ProductCloud)
            .filter(
                ProductCloud.id == item.productId,
                ProductCloud.owner_email == current_user.email,
            )
            .first()
        )
        if not produk_db:
            continue

        stok_awal = produk_db.stock
        produk_db.stock += item.quantity

        if is_ml_active:
            hist = json.loads(produk_db.history_json) if produk_db.history_json else []
            metrik = hitung_metrik_satuan_xgboost(hist, produk_db.price, produk_db.stock)
            produk_db.minStock = metrik["min_stock"]
            produk_db.status = metrik["status"]
        else:
            produk_db.status = "HABIS" if produk_db.stock <= 0 else "BELUM_DIHITUNG"

        biaya_item = item.quantity * (produk_db.cost or int(produk_db.price * 0.8))
        total_produk_direstock += 1
        total_unit_masuk += item.quantity
        total_modal += biaya_item

        log_po = HistoryLogCloud(
            id=buat_id_unik("LOG-PO"),
            owner_email=current_user.email,
            log_type="PRODUCT",
            action_label="TERIMA PO (RESTOCK)",
            transaction_date=sekarang.strftime("%Y-%m-%d"),
            created_at=sekarang.strftime("%Y-%m-%d %H:%M:%S"),
            product_id=produk_db.id,
            product_code=produk_db.code,
            product_name=produk_db.name,
            category=produk_db.category,
            quantity=item.quantity,
            unit_price=produk_db.cost,
            total_value=biaya_item,
            stock_before=stok_awal,
            stock_after=produk_db.stock,
            notes=f"Penerimaan Barang PO ({po_code}) | Supplier: {produk_db.supplier or 'Umum'} | +{item.quantity} unit (Stok: {stok_awal} -> {produk_db.stock})",
        )
        db.add(log_po)

    db.commit()
    return {
        "message": f"Berhasil menerima {total_produk_direstock} jenis barang (Total +{total_unit_masuk} unit) senilai Rp{total_modal:,} ke dalam inventaris gudang.",
        "po_code": po_code,
        "total_products": total_produk_direstock,
        "total_units": total_unit_masuk,
        "total_cost": total_modal,
    }