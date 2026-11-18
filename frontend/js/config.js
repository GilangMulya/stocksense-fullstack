if (window.location.protocol === 'file:') {
    window.location.href = 'http://localhost:8000';
}

if (typeof tailwind !== 'undefined') {
    tailwind.config = {
        theme: {
            extend: {
                colors: {
                    primary: '#4f46e5',
                    'primary-hover': '#4338ca',
                    surface: '#ffffff',
                    background: '#f8fafc',
                    success: '#10b981',
                    warning: '#f59e0b',
                    danger: '#ef4444',
                },
                fontFamily: {
                    sans: ['Inter', 'sans-serif'],
                }
            }
        }
    };
}

const { useState, useEffect, useMemo, useCallback, useRef } = React;

const { 
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, ComposedChart
} = window.Recharts || {};

const API_BASE_URL = "http://localhost:8000/api";

const authFetch = (url, options = {}) => {
    const token = localStorage.getItem("stocksense_token") || "";
    const headers = {
        ...(options.headers || {}),
        "Authorization": `Bearer ${token}`
    };
    return fetch(url, { ...options, headers });
};

const authfetch = authFetch;

const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number || 0);
};

// Suara "Tiiit!" otomatis saat alat Barcode Scanner Fisik menembak produk
const playScannerBeep = (freq = 2650, durationMs = 100) => {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.16, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + durationMs / 1000);
    } catch (e) {
        console.warn("Audio beep tidak dapat diputar:", e);
    }
};

// Kompresi Foto Profil ke Base64 <= 200KB
const fileToBase64Max200KB = (file) => {
    return new Promise((resolve, reject) => {
        if (!file) return reject(new Error("File tidak ditemukan"));
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const MAX_DIM = 360;
                let w = img.width;
                let h = img.height;
                if (w > h && w > MAX_DIM) {
                    h = Math.round((h * MAX_DIM) / w);
                    w = MAX_DIM;
                } else if (h > MAX_DIM) {
                    w = Math.round((w * MAX_DIM) / h);
                    h = MAX_DIM;
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, w, h);

                let quality = 0.82;
                let dataUrl = canvas.toDataURL("image/jpeg", quality);
                while (dataUrl.length > 260000 && quality > 0.3) {
                    quality -= 0.12;
                    dataUrl = canvas.toDataURL("image/jpeg", quality);
                }
                if (dataUrl.length > 280000) {
                    return reject(new Error("Ukuran foto masih di atas 200KB, gunakan gambar yang lebih kecil."));
                }
                resolve(dataUrl);
            };
            img.onerror = () => reject(new Error("Gagal membaca format gambar."));
            img.src = ev.target.result;
        };
        reader.onerror = () => reject(new Error("Gagal membaca file."));
        reader.readAsDataURL(file);
    });
};

// Cetak Struk Kasir Thermal 58mm
const printThermalReceipt58mm = ({ storeName, storeAddress, storePhone, receiptFooter, cashierName, batchCode, dateStr, items, totalAmount, paymentMethod, amountPaid, changeAmount }) => {
    const win = window.open("", "_blank", "width=340,height=600");
    if (!win) {
        alert("Izinkan pop-up browser untuk mencetak struk kasir 58mm.");
        return;
    }
    const rowsHtml = items.map(it => `
        <tr>
            <td colspan="2" style="padding-top:4px;font-weight:bold;">${it.name}</td>
        </tr>
        <tr>
            <td>${it.qty} x ${formatRupiah(it.price)}</td>
            <td style="text-align:right;">${formatRupiah(it.subtotal)}</td>
        </tr>
    `).join("");

    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Struk_${batchCode}</title>
            <style>
                @page { size: 58mm auto; margin: 0; }
                body { width: 54mm; margin: 0 auto; padding: 6px; font-family: 'Courier New', monospace; font-size: 11px; color: #000; }
                .center { text-align: center; }
                .line { border-top: 1px dashed #000; margin: 6px 0; }
                table { width: 100%; border-collapse: collapse; font-size: 11px; }
            </style>
        </head>
        <body onload="window.print(); setTimeout(() => window.close(), 500);">
            <div class="center">
                <div style="font-size:14px;font-weight:bold;">${storeName || 'TOKO RETAIL'}</div>
                ${storeAddress ? `<div>${storeAddress}</div>` : ''}
                ${storePhone ? `<div>Telp: ${storePhone}</div>` : ''}
            </div>
            <div class="line"></div>
            <div>Nota : ${batchCode}</div>
            <div>Tgl  : ${dateStr}</div>
            <div>Kasir: ${cashierName || 'Kasir'}</div>
            <div>Bayar: ${paymentMethod || 'TUNAI'}</div>
            <div class="line"></div>
            <table>${rowsHtml}</table>
            <div class="line"></div>
            <table>
                <tr><td><strong>TOTAL</strong></td><td style="text-align:right;"><strong>${formatRupiah(totalAmount)}</strong></td></tr>
                <tr><td>BAYAR</td><td style="text-align:right;">${formatRupiah(amountPaid || totalAmount)}</td></tr>
                <tr><td>KEMBALI</td><td style="text-align:right;">${formatRupiah(changeAmount || 0)}</td></tr>
            </table>
            <div class="line"></div>
            <div class="center" style="margin-top:6px;">${receiptFooter || 'Terima kasih telah berbelanja.'}</div>
        </body>
        </html>
    `);
    win.document.close();
};

// Cetak Surat Pesanan Kulakan / Purchase Order (PO)
const printPurchaseOrderDocument = ({ storeName, storeAddress, storePhone, supplierName, items, totalUnits, totalCost }) => {
    const win = window.open("", "_blank", "width=850,height=700");
    if (!win) {
        alert("Izinkan pop-up browser untuk mencetak Surat Pesanan (PO).");
        return;
    }
    const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(100 + Math.random() * 900)}`;
    const rowsHtml = items.map((it, idx) => `
        <tr>
            <td style="border:1px solid #cbd5e1;padding:8px;text-align:center;">${idx + 1}</td>
            <td style="border:1px solid #cbd5e1;padding:8px;font-family:monospace;">${it.code}</td>
            <td style="border:1px solid #cbd5e1;padding:8px;"><strong>${it.name}</strong></td>
            <td style="border:1px solid #cbd5e1;padding:8px;">${it.supplier || 'Umum'}</td>
            <td style="border:1px solid #cbd5e1;padding:8px;text-align:center;">${it.stock} unit</td>
            <td style="border:1px solid #cbd5e1;padding:8px;text-align:center;font-weight:bold;color:#1e40af;">${it.orderQty} unit</td>
            <td style="border:1px solid #cbd5e1;padding:8px;text-align:right;">${formatRupiah(it.cost)}</td>
            <td style="border:1px solid #cbd5e1;padding:8px;text-align:right;font-weight:bold;">${formatRupiah(it.orderQty * it.cost)}</td>
        </tr>
    `).join("");

    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Surat_Pesanan_${poNumber}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 28px; color: #1e293b; }
                .header { display: flex; justify-content: space-between; border-bottom: 2px solid #334155; padding-bottom: 14px; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
                th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 10px 8px; text-align: left; }
            </style>
        </head>
        <body onload="window.print();">
            <div class="header">
                <div>
                    <h2 style="margin:0;color:#1e293b;">SURAT PESANAN BARANG (PURCHASE ORDER)</h2>
                    <p style="margin:4px 0 0;font-size:13px;"><strong>${storeName || 'Toko'}</strong> ${storeAddress ? `- ${storeAddress}` : ''} ${storePhone ? `(${storePhone})` : ''}</p>
                </div>
                <div style="text-align:right;font-size:12px;">
                    <div><strong>No. PO:</strong> ${poNumber}</div>
                    <div><strong>Tanggal:</strong> ${new Date().toLocaleDateString('id-ID')}</div>
                    <div><strong>Supplier:</strong> ${supplierName || 'Semua Supplier'}</div>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="text-align:center;">No</th>
                        <th>Kode</th>
                        <th>Nama Barang</th>
                        <th>Supplier</th>
                        <th style="text-align:center;">Sisa Stok</th>
                        <th style="text-align:center;">Jumlah Pesan (PO)</th>
                        <th style="text-align:right;">Harga Modal</th>
                        <th style="text-align:right;">Subtotal</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
                <tfoot>
                    <tr style="background:#f8fafc;font-size:13px;">
                        <td colspan="5" style="border:1px solid #cbd5e1;padding:10px;text-align:right;"><strong>TOTAL (${items.length} Jenis Barang):</strong></td>
                        <td style="border:1px solid #cbd5e1;padding:10px;text-align:center;"><strong>${totalUnits} Unit</strong></td>
                        <td style="border:1px solid #cbd5e1;padding:10px;"></td>
                        <td style="border:1px solid #cbd5e1;padding:10px;text-align:right;"><strong>${formatRupiah(totalCost)}</strong></td>
                    </tr>
                </tfoot>
            </table>
        </body>
        </html>
    `);
    win.document.close();
};