const RestockPOPage = ({ products, currentUser, onRefreshData, onGoToSubscription, onGoToUploadModel }) => {
    const { addToast } = React.useContext(ToastContext);
    const isProUser = (currentUser?.subscription_plan || "FREE").toUpperCase() === "PRO";
    const [cloudModelInfo, setCloudModelInfo] = useState({ loading: true, hasModel: false, activeModelName: null });

    const [supplierFilter, setSupplierFilter] = useState("SEMUA");
    const [searchQuery, setSearchQuery] = useState("");
    const [customOrderQtys, setCustomOrderQtys] = useState({});
    const [selectedIds, setSelectedIds] = useState({});
    const [supplierPhone, setSupplierPhone] = useState("");
    const [isReceiving, setIsReceiving] = useState(false);
    const [isRecalculating, setIsRecalculating] = useState(false);

    useEffect(() => {
        if (isProUser) {
            authFetch(`${API_BASE_URL}/cloud/status`)
                .then(r => r.ok ? r.json() : null)
                .then(d => {
                    setCloudModelInfo({
                        loading: false,
                        hasModel: Boolean(d?.has_cloud_model),
                        activeModelName: d?.active_model_name || null
                    });
                })
                .catch(() => setCloudModelInfo({ loading: false, hasModel: false, activeModelName: null }));
        } else {
            setCloudModelInfo({ loading: false, hasModel: false, activeModelName: null });
        }
    }, [isProUser]);

    const restockCandidates = useMemo(() => {
        if (!isProUser) return [];
        const list = [];
        products.forEach(p => {
            if (!p.isMlActive) return;
            if (p.status === "HABIS" || p.status === "MENIPIS") {
                const predicted7d = Number(p.predicted7d ?? 0);
                const safetyStock = Number(p.safetyStock ?? 0);
                const minStockAI = Number(p.minStock ?? 0);
                const aiRecQty = Number(p.aiRecQty ?? 0);
                if (aiRecQty > 0 || p.stock <= minStockAI) {
                    const finalRecQty = aiRecQty > 0 ? aiRecQty : Math.max(1, minStockAI - p.stock + Math.max(1, safetyStock));
                    list.push({
                        ...p,
                        predicted7d,
                        safetyStock,
                        minStock: minStockAI,
                        aiRecQty: finalRecQty,
                        defaultOrderQty: finalRecQty,
                        unitCost: p.cost > 0 ? p.cost : Math.round((p.price || 15000) * 0.8)
                    });
                }
            }
        });
        return list.sort((a, b) => a.stock - b.stock);
    }, [products, isProUser]);

    const suppliersList = useMemo(() => {
        const setSupp = new Set();
        restockCandidates.forEach(item => setSupp.add(item.supplier || "Supplier Umum"));
        return ["SEMUA", ...Array.from(setSupp).sort()];
    }, [restockCandidates]);

    const filteredPOItems = useMemo(() => {
        return restockCandidates.filter(item => {
            const matchSupp = supplierFilter === "SEMUA" || (item.supplier || "Supplier Umum") === supplierFilter;
            const q = searchQuery.toLowerCase();
            const matchSearch =
                (item.name || "").toLowerCase().includes(q) ||
                (item.code || "").toLowerCase().includes(q) ||
                (item.supplier || "").toLowerCase().includes(q);
            return matchSupp && matchSearch;
        }).map(item => {
            const orderQty = customOrderQtys[item.id] !== undefined ? Number(customOrderQtys[item.id]) : item.defaultOrderQty;
            const isChecked = selectedIds[item.id] !== undefined ? selectedIds[item.id] : true;
            return {
                ...item,
                orderQty,
                isChecked,
                subtotalCost: orderQty * item.unitCost
            };
        });
    }, [restockCandidates, supplierFilter, searchQuery, customOrderQtys, selectedIds]);

    const activePOItems = useMemo(() => filteredPOItems.filter(i => i.isChecked && i.orderQty > 0), [filteredPOItems]);
    const totalPOUnits = useMemo(() => activePOItems.reduce((sum, i) => sum + i.orderQty, 0), [activePOItems]);
    const totalPOCost = useMemo(() => activePOItems.reduce((sum, i) => sum + i.subtotalCost, 0), [activePOItems]);

    if (!isProUser) {
        return (
            <Card className="p-10 text-center max-w-2xl mx-auto my-8 border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-amber-50/40 space-y-5 page-enter">
                <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto shadow-lg">
                    <Icons.Lock />
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                    <Icons.Crown /> FITUR EKSKLUSIF PAKET PRO
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900">Rekomendasi Pesanan Barang (PO) Terkunci</h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                    Daftar barang menipis, batas stok minimum, dan rekomendasi kuantitas pesanan di halaman ini dihitung secara otomatis berdasarkan proyeksi permintaan. Silakan aktifkan paket <strong>PRO</strong> untuk membuka fitur ini.
                </p>
                <div className="pt-2 flex justify-center">
                    <Button onClick={onGoToSubscription} className="py-3 px-6">
                        <Icons.Crown /> Buka Paket Langganan & Aktifkan PRO
                    </Button>
                </div>
            </Card>
        );
    }

    if (!cloudModelInfo.loading && !cloudModelInfo.hasModel) {
        return (
            <Card className="p-10 text-center max-w-2xl mx-auto my-8 border-2 border-amber-200 bg-gradient-to-br from-amber-50/60 via-white to-indigo-50/40 space-y-5 page-enter">
                <div className="w-16 h-16 rounded-2xl bg-amber-500 text-white flex items-center justify-center mx-auto shadow-lg">
                    <Icons.UploadCloud />
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                    KONFIGURASI MODEL PREDIKSI
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900">Model Prediksi Belum Diaktifkan</h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                    Rekomendasi Pesanan Barang (PO) membutuhkan model prediksi aktif untuk menghitung proyeksi permintaan 7 hari, stok pengaman, dan batas stok minimum setiap produk.
                </p>
                <div className="pt-2 flex justify-center">
                    <Button onClick={onGoToUploadModel} className="py-3 px-6">
                        <Icons.UploadCloud /> Buka Pengaturan Model Prediksi
                    </Button>
                </div>
            </Card>
        );
    }

    const handleRefreshML = async () => {
        setIsRecalculating(true);
        try {
            const response = await authFetch(`${API_BASE_URL}/products/recalculate-minstock-ai`, {
                method: 'POST'
            });
            const resData = await response.json();
            if (!response.ok) throw new Error(resData.detail || "Gagal menyinkronkan kalkulasi stok.");
            await onRefreshData();
            addToast(resData.message, "success");
        } catch (error) {
            addToast(error.message, "error");
        } finally {
            setIsRecalculating(false);
        }
    };

    const handleSendWhatsAppPO = () => {
        if (activePOItems.length === 0) {
            addToast("Pilih minimal 1 barang pada daftar pesanan.", "error");
            return;
        }
        let phoneClean = supplierPhone.replace(/[^0-9]/g, "");
        if (!phoneClean) {
            addToast("Masukkan nomor WhatsApp supplier tujuan terlebih dahulu.", "error");
            return;
        }
        if (phoneClean.startsWith("0")) phoneClean = "62" + phoneClean.slice(1);

        const lines = activePOItems.slice(0, 35).map((it, idx) =>
            `${idx + 1}. [${it.code}] ${it.name} - *${it.orderQty} unit* (${formatRupiah(it.subtotalCost)})`
        );
        const msg = [
            `Halo Supplier *${supplierFilter === 'SEMUA' ? 'Mitra Toko' : supplierFilter}*,`,
            `Kami dari *${currentUser?.store_name || 'Toko'}* ingin melakukan pemesanan barang (Purchase Order) berikut:`,
            ``,
            ...lines,
            activePOItems.length > 35 ? `...dan ${activePOItems.length - 35} item lainnya.` : ``,
            ``,
            `*Total Jenis Barang:* ${activePOItems.length} item`,
            `*Total Unit Dipesan:* ${totalPOUnits} unit`,
            `*Estimasi Total:* ${formatRupiah(totalPOCost)}`,
            ``,
            `Mohon konfirmasi ketersediaan dan pengiriman. Terima kasih.`
        ].join("\n");

        window.open(`https://wa.me/${phoneClean}?text=${encodeURIComponent(msg)}`, "_blank");
    };

    const handleOneClickReceivePO = async () => {
        if (activePOItems.length === 0) {
            addToast("Tidak ada barang yang dipilih untuk diterima.", "error");
            return;
        }
        if (!window.confirm(`Terima masuk ${activePOItems.length} jenis barang (Total +${totalPOUnits} unit) senilai ${formatRupiah(totalPOCost)} ke dalam inventaris gudang?`)) {
            return;
        }
        setIsReceiving(true);
        try {
            const response = await authFetch(`${API_BASE_URL}/restock/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supplierFilter,
                    items: activePOItems.map(i => ({
                        productId: i.id,
                        quantity: i.orderQty
                    }))
                })
            });
            const resData = await response.json();
            if (!response.ok) throw new Error(resData.detail || "Gagal memproses penerimaan PO.");
            await onRefreshData();
            addToast(resData.message, "success");
            setCustomOrderQtys({});
        } catch (error) {
            addToast(error.message, "error");
        } finally {
            setIsReceiving(false);
        }
    };

    return (
        <div className="space-y-6 page-enter">
            <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950 via-slate-900 to-teal-950 text-white shadow-md flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300 shrink-0 mt-0.5">
                        <Icons.Truck />
                    </div>
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-widest text-teal-300">
                            Perencanaan Pembelian & Purchase Order
                        </span>
                        <h1 className="text-2xl font-bold tracking-tight mt-0.5">Rekomendasi Pesanan Barang (PO)</h1>
                        <p className="text-xs text-slate-300 mt-1">
                            Daftar kebutuhan pengadaan barang yang dihitung secara otomatis berdasarkan proyeksi permintaan 7 hari dan stok pengaman.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={isRecalculating}
                        onClick={handleRefreshML}
                        className="px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all flex items-center gap-2"
                    >
                        <Icons.BrainCircuit /> {isRecalculating ? "Memperbarui..." : "Perbarui Kalkulasi"}
                    </button>
                    <button
                        type="button"
                        onClick={() => printPurchaseOrderDocument({
                            storeName: currentUser?.store_name,
                            storeAddress: currentUser?.store_address,
                            storePhone: currentUser?.store_phone,
                            supplierName: supplierFilter,
                            items: activePOItems.map(i => ({ ...i, cost: i.unitCost })),
                            totalUnits: totalPOUnits,
                            totalCost: totalPOCost
                        })}
                        className="px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all flex items-center gap-2"
                    >
                        <Icons.Printer /> Cetak Surat PO
                    </button>
                    <Button onClick={handleSendWhatsAppPO} variant="success" className="text-xs py-2.5">
                        <Icons.WhatsApp /> Kirim PO ke WhatsApp
                    </Button>
                    <Button onClick={handleOneClickReceivePO} disabled={isReceiving || activePOItems.length === 0} className="text-xs py-2.5">
                        <Icons.Check /> {isReceiving ? "Memproses..." : "Terima Barang Masuk"}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4 border-l-4 border-l-indigo-600 card-hover">
                    <p className="text-xs font-semibold text-slate-500">Produk Perlu Dipesan</p>
                    <h3 className="text-2xl font-bold text-slate-900 mt-1">
                        {activePOItems.length.toLocaleString('id-ID')} <span className="text-xs font-normal text-slate-400">Item</span>
                    </h3>
                </Card>
                <Card className="p-4 border-l-4 border-l-violet-600 card-hover">
                    <p className="text-xs font-semibold text-slate-500">Total Unit Rekomendasi Dipesan</p>
                    <h3 className="text-2xl font-bold text-indigo-600 mt-1">
                        {totalPOUnits.toLocaleString('id-ID')} <span className="text-xs font-normal text-slate-400">Unit</span>
                    </h3>
                </Card>
                <Card className="p-4 border-l-4 border-l-emerald-500 card-hover">
                    <p className="text-xs font-semibold text-slate-500">Estimasi Modal Pengadaan</p>
                    <h3 className="text-2xl font-bold text-emerald-700 mt-1">{formatRupiah(totalPOCost)}</h3>
                </Card>
            </div>

            <Card className="p-4 border-slate-200/80">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    <div className="md:col-span-4">
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Filter Supplier</label>
                        <select
                            value={supplierFilter}
                            onChange={(e) => setSupplierFilter(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-600"
                        >
                            {suppliersList.map(s => (
                                <option key={s} value={s}>{s === "SEMUA" ? `Semua Supplier (${restockCandidates.length} Produk)` : s}</option>
                            ))}
                        </select>
                    </div>
                    <div className="md:col-span-5">
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Cari Produk</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-3.5 flex items-center text-indigo-500"><Icons.Search /></div>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Cari nama produk, kode, atau supplier..."
                                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-600"
                            />
                        </div>
                    </div>
                    <div className="md:col-span-3">
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nomor WhatsApp Supplier</label>
                        <input
                            type="text"
                            value={supplierPhone}
                            onChange={(e) => setSupplierPhone(e.target.value)}
                            placeholder="Contoh: 081234567890"
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-600"
                        />
                    </div>
                </div>
            </Card>

            <Card className="overflow-hidden border-slate-200/80">
                <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-gradient-to-r from-slate-50 via-indigo-50/40 to-slate-50 border-b border-slate-200 z-10">
                            <tr className="text-[11px] text-slate-600 uppercase tracking-wider font-bold">
                                <th className="py-3.5 px-4 text-center w-10">Pilih</th>
                                <th className="py-3.5 px-4">Kode & Nama Produk</th>
                                <th className="py-3.5 px-4">Supplier</th>
                                <th className="py-3.5 px-4 text-center">Status & Sisa / Min.</th>
                                <th className="py-3.5 px-4 text-center">Proyeksi 7 Hari & Safety Stock</th>
                                <th className="py-3.5 px-4 text-center">Rekomendasi</th>
                                <th className="py-3.5 px-4 text-center w-36">Jumlah Pesan</th>
                                <th className="py-3.5 px-4 text-right">Harga Modal</th>
                                <th className="py-3.5 px-4 text-right">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                            {filteredPOItems.slice(0, 300).map(item => (
                                <tr key={item.id} className={`hover:bg-indigo-50/30 transition-colors ${!item.isChecked ? 'opacity-50' : ''}`}>
                                    <td className="py-3.5 px-4 text-center">
                                        <input
                                            type="checkbox"
                                            checked={item.isChecked}
                                            onChange={(e) => setSelectedIds(prev => ({ ...prev, [item.id]: e.target.checked }))}
                                            className="w-4 h-4 rounded text-indigo-600"
                                        />
                                    </td>
                                    <td className="py-3.5 px-4">
                                        <span className="font-mono text-xs text-indigo-600 font-semibold block">{item.code}</span>
                                        <span className="font-semibold text-slate-800">{item.name}</span>
                                    </td>
                                    <td className="py-3.5 px-4 text-xs text-slate-600">{item.supplier || "Supplier Umum"}</td>
                                    <td className="py-3.5 px-4 text-center">
                                        <StatusBadge status={item.status} />
                                        <div className="text-xs text-slate-500 mt-1">
                                            Sisa: <strong className="text-rose-600">{item.stock}</strong> / Min: <strong className="text-indigo-600">{item.minStock}</strong>
                                        </div>
                                    </td>
                                    <td className="py-3.5 px-4 text-center text-xs">
                                        <div className="font-semibold text-slate-800">Proyeksi 7H: <span className="text-indigo-600">{item.predicted7d} unit</span></div>
                                        <div className="text-slate-400">Safety Stock: {item.safetyStock} unit</div>
                                    </td>
                                    <td className="py-3.5 px-4 text-center">
                                        <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs border border-indigo-200">
                                            +{item.aiRecQty} unit
                                        </span>
                                    </td>
                                    <td className="py-3.5 px-4 text-center">
                                        <input
                                            type="number"
                                            min="0"
                                            value={item.orderQty}
                                            onChange={(e) => setCustomOrderQtys(prev => ({ ...prev, [item.id]: e.target.value }))}
                                            className="w-24 text-center border border-slate-200 rounded-xl py-1.5 px-2 font-bold text-indigo-700 outline-none focus:border-indigo-600"
                                        />
                                    </td>
                                    <td className="py-3.5 px-4 text-right text-slate-600">{formatRupiah(item.unitCost)}</td>
                                    <td className="py-3.5 px-4 text-right font-bold text-slate-900">{formatRupiah(item.subtotalCost)}</td>
                                </tr>
                            ))}
                            {filteredPOItems.length === 0 && (
                                <tr>
                                    <td colSpan="9" className="p-10 text-center text-slate-400 text-sm">
                                        Seluruh produk memiliki stok di atas batas stok minimum (Kondisi Aman).
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

window.RestockPOPage = RestockPOPage;