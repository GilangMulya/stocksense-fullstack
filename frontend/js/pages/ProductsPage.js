const ProductsPage = ({ products, currentUser, onRefreshData, onGoToUploadModel }) => {
    const isProUser = (currentUser?.subscription_plan || "FREE").toUpperCase() === "PRO";
    const isMlActive = isProUser && Array.isArray(products) && products.some(p => p.isMlActive);

    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [visibleLimit, setVisibleLimit] = useState(150);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRecalculatingAI, setIsRecalculatingAI] = useState(false);
    const { addToast } = React.useContext(ToastContext);

    const [restockTarget, setRestockTarget] = useState(null);
    const [restockQty, setRestockQty] = useState("");

    const [editTarget, setEditTarget] = useState(null);
    const [editForm, setEditForm] = useState({
        code: '',
        name: '',
        category: 'Sembako',
        supplier: '',
        cost: 0,
        price: 0
    });

    const [opnameTarget, setOpnameTarget] = useState(null);
    const [opnameForm, setOpnameForm] = useState({
        actualStock: 0,
        reason: 'Selisih Hitung Fisik Gudang',
        notes: ''
    });

    const initialForm = {
        code: '',
        name: '',
        category: 'Sembako',
        price: '',
        cost: '',
        stock: '',
        supplier: ''
    };
    const [formData, setFormData] = useState(initialForm);

    useEffect(() => {
        if (!isMlActive && (statusFilter === "AMAN" || statusFilter === "MENIPIS")) {
            setStatusFilter("ALL");
        }
    }, [isMlActive, statusFilter]);

    const countAman = useMemo(() => {
        return isMlActive ? products.filter(p => p.status === 'AMAN').length : 0;
    }, [products, isMlActive]);

    const countMenipis = useMemo(() => {
        return isMlActive ? products.filter(p => p.status === 'MENIPIS').length : 0;
    }, [products, isMlActive]);

    const countHabis = useMemo(() => {
        return products.filter(p => Number(p.stock || 0) <= 0 || p.status === 'HABIS').length;
    }, [products]);

    const filteredProducts = useMemo(() => {
        const q = searchTerm.toLowerCase();
        return products.filter(p => {
            if (statusFilter === "HABIS" && Number(p.stock || 0) > 0) return false;
            if (statusFilter !== "ALL" && statusFilter !== "HABIS" && p.status !== statusFilter) return false;
            return (
                (p.name || "").toLowerCase().includes(q) ||
                (p.code || "").toLowerCase().includes(q) ||
                (p.supplier || "").toLowerCase().includes(q)
            );
        });
    }, [products, searchTerm, statusFilter]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleRecalculateMinStockAI = async () => {
        setIsRecalculatingAI(true);
        try {
            const response = await authFetch(`${API_BASE_URL}/products/recalculate-minstock-ai`, {
                method: 'POST'
            });
            const resData = await response.json();
            if (!response.ok) throw new Error(resData.detail || "Gagal menghitung batas stok minimum.");
            await onRefreshData();
            addToast(resData.message, "success");
        } catch (error) {
            addToast(error.message, "error");
        } finally {
            setIsRecalculatingAI(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        const payload = {
            code: formData.code.trim(),
            name: formData.name.trim(),
            category: formData.category,
            supplier: formData.supplier.trim() || "Supplier Umum",
            cost: Number(formData.cost) || 0,
            price: Number(formData.price) || 0,
            stock: Number(formData.stock) || 0,
            minStock: 0
        };

        try {
            const response = await authFetch(`${API_BASE_URL}/products`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const resData = await response.json();
            if (!response.ok) throw new Error(resData.detail || "Gagal menambahkan produk baru.");
            await onRefreshData();
            addToast(resData.message, "success");
            setIsModalOpen(false);
            setFormData(initialForm);
        } catch (error) {
            addToast(error.message, "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRestockSubmit = async (e) => {
        e.preventDefault();
        const qty = parseInt(restockQty, 10);
        if (!restockTarget || isNaN(qty) || qty <= 0) {
            addToast("Masukkan jumlah tambahan stok yang valid.", "error");
            return;
        }
        setIsSubmitting(true);
        try {
            const response = await authFetch(`${API_BASE_URL}/restock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId: restockTarget.id, quantity: qty })
            });
            const resData = await response.json();
            if (!response.ok) throw new Error(resData.detail || "Gagal menambah stok produk.");
            await onRefreshData();
            addToast(resData.message, "success");
            setRestockTarget(null);
            setRestockQty("");
        } catch (error) {
            addToast(error.message, "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const openEditModal = (p) => {
        setEditTarget(p);
        setEditForm({
            code: p.code || '',
            name: p.name || '',
            category: p.category || 'Sembako',
            supplier: p.supplier || 'Supplier Umum',
            cost: p.cost || 0,
            price: p.price || 0
        });
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        if (!editTarget) return;
        setIsSubmitting(true);
        try {
            const response = await authFetch(`${API_BASE_URL}/products/${editTarget.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: editForm.code.trim(),
                    name: editForm.name.trim(),
                    category: editForm.category,
                    supplier: editForm.supplier.trim() || "Supplier Umum",
                    cost: Number(editForm.cost) || 0,
                    price: Number(editForm.price) || 0,
                    minStock: 0
                })
            });
            const resData = await response.json();
            if (!response.ok) throw new Error(resData.detail || "Gagal memperbarui produk.");
            await onRefreshData();
            addToast(resData.message, "success");
            setEditTarget(null);
        } catch (error) {
            addToast(error.message, "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const openOpnameModal = (p) => {
        setOpnameTarget(p);
        setOpnameForm({
            actualStock: p.stock,
            reason: 'Selisih Hitung Fisik Gudang',
            notes: ''
        });
    };

    const handleOpnameSubmit = async (e) => {
        e.preventDefault();
        if (!opnameTarget) return;
        setIsSubmitting(true);
        try {
            const response = await authFetch(`${API_BASE_URL}/products/${opnameTarget.id}/opname`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    actualStock: Number(opnameForm.actualStock),
                    reason: opnameForm.reason,
                    notes: opnameForm.notes
                })
            });
            const resData = await response.json();
            if (!response.ok) throw new Error(resData.detail || "Gagal melakukan Stock Opname.");
            await onRefreshData();
            addToast(resData.message, "success");
            setOpnameTarget(null);
        } catch (error) {
            addToast(error.message, "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteProduct = async (p) => {
        if (!window.confirm(`Apakah Anda yakin ingin menghapus produk "${p.name}" (${p.code}) dari katalog?`)) return;
        try {
            const response = await authFetch(`${API_BASE_URL}/products/${p.id}`, {
                method: 'DELETE'
            });
            const resData = await response.json();
            if (!response.ok) throw new Error(resData.detail || "Gagal menghapus produk.");
            await onRefreshData();
            addToast(resData.message, "success");
        } catch (error) {
            addToast(error.message, "error");
        }
    };

    const filterCards = [
        { id: "ALL", label: "Total Katalog Produk", count: products.length, accent: "border-l-4 border-l-indigo-600", badgeBg: "bg-indigo-50 text-indigo-700" },
        ...(isMlActive ? [
            { id: "AMAN", label: "Stok Kondisi Aman", count: countAman, accent: "border-l-4 border-l-emerald-500", badgeBg: "bg-emerald-50 text-emerald-700" },
            { id: "MENIPIS", label: "Stok Menipis", count: countMenipis, accent: "border-l-4 border-l-amber-500", badgeBg: "bg-amber-50 text-amber-700" }
        ] : []),
        { id: "HABIS", label: "Stok Habis (0 Unit)", count: countHabis, accent: "border-l-4 border-l-rose-500", badgeBg: "bg-rose-50 text-rose-700" }
    ];

    return (
        <div className="space-y-6 page-enter">
            <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 text-white shadow-md flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0 mt-0.5">
                        <Icons.Box />
                    </div>
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-300">Manajemen Inventaris</span>
                        <h1 className="text-2xl font-bold tracking-tight mt-0.5">Manajemen Produk</h1>
                        <p className="text-xs text-slate-300 mt-1">
                            {isProUser
                                ? "Kelola katalog barang, penyesuaian stok fisik (Stock Opname), dan pemantauan batas stok minimum otomatis."
                                : "Kelola katalog barang, harga jual, penambahan stok masuk, dan koreksi stok fisik gudang (Stock Opname)."}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                    {isProUser && (
                        <button
                            type="button"
                            disabled={isRecalculatingAI}
                            onClick={handleRecalculateMinStockAI}
                            className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all flex items-center gap-2"
                        >
                            <Icons.BrainCircuit />
                            {isRecalculatingAI ? "Memperbarui Analisis..." : "Perbarui Analisis Stok"}
                        </button>
                    )}
                    <Button onClick={() => setIsModalOpen(true)} className="py-2.5 px-4 text-xs">
                        <Icons.Plus /> Tambah Produk Baru
                    </Button>
                </div>
            </div>

            {isProUser && !isMlActive && products.length > 0 && (
                <Card className="p-4 border-l-4 border-l-amber-500 bg-amber-50/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="text-xs text-amber-900">
                        <strong>Model Prediksi Belum Aktif:</strong> Batas stok minimum otomatis akan tampil setelah model prediksi diaktifkan.
                    </div>
                    {onGoToUploadModel && (
                        <Button onClick={onGoToUploadModel} className="text-xs py-2 px-3.5 shrink-0">
                            <Icons.UploadCloud /> Konfigurasi Model
                        </Button>
                    )}
                </Card>
            )}

            <div className={`grid grid-cols-2 ${isMlActive ? 'lg:grid-cols-4' : 'lg:grid-cols-2'} gap-4`}>
                {filterCards.map(card => {
                    const isActive = statusFilter === card.id;
                    return (
                        <Card
                            key={card.id}
                            onClick={() => { setStatusFilter(card.id); setVisibleLimit(150); }}
                            className={`p-4 ${card.accent} ${isActive ? 'ring-2 ring-indigo-500/30 bg-indigo-50/20' : ''}`}
                        >
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-semibold text-slate-500">{card.label}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${card.badgeBg}`}>
                                    {isActive ? 'Aktif' : 'Filter'}
                                </span>
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900 mt-1.5">{card.count.toLocaleString('id-ID')}</h3>
                        </Card>
                    );
                })}
            </div>

            <Card className="p-4 flex flex-col sm:flex-row justify-between items-center gap-3">
                <div className="relative w-full sm:flex-1">
                    <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-indigo-500">
                        <Icons.Search />
                    </div>
                    <input
                        type="text"
                        placeholder="Cari nama produk, kode barcode, atau nama supplier..."
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none text-sm bg-slate-50/50 focus:bg-white transition-all"
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setVisibleLimit(150); }}
                    />
                </div>
                <div className="text-xs text-slate-500 font-medium shrink-0">
                    Menampilkan <strong className="text-indigo-600">{Math.min(visibleLimit, filteredProducts.length).toLocaleString('id-ID')}</strong> dari <strong>{filteredProducts.length.toLocaleString('id-ID')}</strong> produk
                </div>
            </Card>

            <Card className="overflow-hidden border-slate-200/80">
                <div className="overflow-x-auto max-h-[580px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-gradient-to-r from-slate-50 via-indigo-50/40 to-slate-50 z-10 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-600">
                            <tr>
                                <th className="py-3.5 px-4 font-bold">Kode</th>
                                <th className="py-3.5 px-4 font-bold">Nama Produk & Supplier</th>
                                <th className="py-3.5 px-4 font-bold">Kategori</th>
                                <th className="py-3.5 px-4 font-bold">Harga Modal / Jual</th>
                                <th className="py-3.5 px-4 font-bold">{isProUser ? "Stok / Batas Min." : "Sisa Stok"}</th>
                                {isProUser && <th className="py-3.5 px-4 font-bold">Status Stok</th>}
                                <th className="py-3.5 px-4 font-bold text-right">Tindakan</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                            {filteredProducts.slice(0, visibleLimit).map(p => (
                                <tr key={p.id} className="hover:bg-indigo-50/30 transition-colors">
                                    <td className="py-3.5 px-4 text-indigo-600 font-mono text-xs font-semibold">{p.code}</td>
                                    <td className="py-3.5 px-4">
                                        <div className="font-semibold text-slate-800">{p.name}</div>
                                        <div className="text-xs text-slate-400">{p.supplier || 'Supplier Umum'}</div>
                                    </td>
                                    <td className="py-3.5 px-4">
                                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium">
                                            {p.category || 'Katalog Toko'}
                                        </span>
                                    </td>
                                    <td className="py-3.5 px-4">
                                        <div className="font-bold text-slate-800">{formatRupiah(p.price)}</div>
                                        <div className="text-[11px] text-slate-400">Modal: {formatRupiah(p.cost)}</div>
                                    </td>
                                    <td className="py-3.5 px-4">
                                        {isProUser ? (
                                            p.isMlActive && p.minStock !== null && p.minStock !== undefined ? (
                                                <div>
                                                    <span className={`font-bold text-base ${p.stock <= p.minStock ? 'text-rose-600' : 'text-slate-800'}`}>
                                                        {p.stock}
                                                    </span>
                                                    <span className="text-indigo-600 font-semibold text-xs ml-1">/ {p.minStock} min</span>
                                                </div>
                                            ) : (
                                                <div>
                                                    <span className="font-bold text-base text-slate-800">{p.stock}</span>
                                                    <span className="text-amber-600 text-[11px] block">Menunggu Model</span>
                                                </div>
                                            )
                                        ) : (
                                            <span className={`font-bold text-base ${p.stock <= 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                                                {p.stock} <span className="text-xs font-normal text-slate-400">unit</span>
                                            </span>
                                        )}
                                    </td>
                                    {isProUser && (
                                        <td className="py-3.5 px-4">
                                            {p.isMlActive && p.status ? (
                                                <StatusBadge status={p.status} />
                                            ) : p.stock <= 0 ? (
                                                <StatusBadge status="HABIS" />
                                            ) : (
                                                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">
                                                    Standar
                                                </span>
                                            )}
                                        </td>
                                    )}
                                    <td className="py-3.5 px-4">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => { setRestockTarget(p); setRestockQty(""); }}
                                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                                            >
                                                + Stok
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => openOpnameModal(p)}
                                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                                            >
                                                Opname
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => openEditModal(p)}
                                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteProduct(p)}
                                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                                            >
                                                Hapus
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredProducts.length === 0 && (
                                <tr>
                                    <td colSpan={isProUser ? "7" : "6"} className="p-10 text-center text-slate-400 text-sm">
                                        Tidak ada produk yang sesuai dengan pencarian.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {filteredProducts.length > visibleLimit && (
                    <div className="p-3.5 bg-slate-50 border-t border-slate-200/80 flex justify-center">
                        <Button variant="outline" onClick={() => setVisibleLimit(prev => prev + 200)} className="text-xs">
                            Tampilkan Lebih Banyak Produk (+200 Item)
                        </Button>
                    </div>
                )}
            </Card>

            {restockTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <Card className="w-full max-w-md bg-white p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-base font-bold text-slate-900">Tambah Stok Masuk</h2>
                            <button type="button" onClick={() => setRestockTarget(null)} className="text-slate-400 hover:text-slate-600"><Icons.X /></button>
                        </div>
                        <div className="p-3.5 bg-emerald-50/70 rounded-xl border border-emerald-200 mb-4">
                            <p className="text-xs text-emerald-700 font-mono font-semibold">{restockTarget.code}</p>
                            <p className="text-sm font-bold text-slate-900">{restockTarget.name}</p>
                            <p className="text-xs text-slate-600 mt-1">
                                Stok Saat Ini: <strong>{restockTarget.stock} unit</strong>
                                {isProUser && restockTarget.isMlActive && restockTarget.minStock !== null && (
                                    <span> (Batas Min: <strong>{restockTarget.minStock} unit</strong>)</span>
                                )}
                            </p>
                        </div>
                        <form onSubmit={handleRestockSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Jumlah Tambahan Stok (Unit)</label>
                                <input
                                    autoFocus
                                    required
                                    type="number"
                                    min="1"
                                    value={restockQty}
                                    onChange={(e) => setRestockQty(e.target.value)}
                                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600"
                                    placeholder="Masukkan jumlah unit..."
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                                <Button type="button" variant="outline" onClick={() => setRestockTarget(null)}>Batal</Button>
                                <Button type="submit" variant="success" disabled={isSubmitting}>
                                    {isSubmitting ? "Menyimpan..." : "Tambah Stok"}
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}

            {editTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <Card className="w-full max-w-lg bg-white p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-base font-bold text-slate-900">Edit Data Produk</h2>
                            <button type="button" onClick={() => setEditTarget(null)} className="text-slate-400 hover:text-slate-600"><Icons.X /></button>
                        </div>
                        <form onSubmit={handleEditSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Kode / Barcode</label>
                                    <input
                                        required
                                        type="text"
                                        value={editForm.code}
                                        onChange={(e) => setEditForm({...editForm, code: e.target.value})}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Kategori</label>
                                    <input
                                        required
                                        type="text"
                                        value={editForm.category}
                                        onChange={(e) => setEditForm({...editForm, category: e.target.value})}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Nama Produk</label>
                                    <input
                                        required
                                        type="text"
                                        value={editForm.name}
                                        onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Supplier</label>
                                    <input
                                        type="text"
                                        value={editForm.supplier}
                                        onChange={(e) => setEditForm({...editForm, supplier: e.target.value})}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Harga Modal (Rp)</label>
                                    <input
                                        required
                                        type="number"
                                        min="0"
                                        value={editForm.cost}
                                        onChange={(e) => setEditForm({...editForm, cost: e.target.value})}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Harga Jual (Rp)</label>
                                    <input
                                        required
                                        type="number"
                                        min="0"
                                        value={editForm.price}
                                        onChange={(e) => setEditForm({...editForm, price: e.target.value})}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                                    />
                                </div>
                            </div>
                            {isProUser && (
                                <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-900">
                                    <strong>Catatan:</strong> Batas stok minimum dan status ketersediaan diperbarui secara otomatis berdasarkan tren penjualan.
                                </div>
                            )}
                            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                                <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>Batal</Button>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}

            {opnameTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <Card className="w-full max-w-md bg-white p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-base font-bold text-slate-900">Penyesuaian Stok Fisik (Stock Opname)</h2>
                            <button type="button" onClick={() => setOpnameTarget(null)} className="text-slate-400 hover:text-slate-600"><Icons.X /></button>
                        </div>
                        <div className="p-3.5 bg-amber-50/70 rounded-xl border border-amber-200 mb-4 text-xs text-slate-700">
                            <div className="font-bold text-sm text-slate-900">{opnameTarget.name}</div>
                            <div className="mt-0.5">Stok Tercatat di Sistem: <strong>{opnameTarget.stock} unit</strong></div>
                        </div>
                        <form onSubmit={handleOpnameSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Stok Fisik Aktual di Gudang (Unit)</label>
                                <input
                                    required
                                    type="number"
                                    min="0"
                                    value={opnameForm.actualStock}
                                    onChange={(e) => setOpnameForm({...opnameForm, actualStock: e.target.value})}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Alasan Penyesuaian</label>
                                <select
                                    value={opnameForm.reason}
                                    onChange={(e) => setOpnameForm({...opnameForm, reason: e.target.value})}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                                >
                                    <option value="Selisih Hitung Fisik Gudang">Selisih Hitung Fisik Gudang</option>
                                    <option value="Barang Rusak">Barang Rusak</option>
                                    <option value="Barang Kedaluwarsa">Barang Kedaluwarsa</option>
                                    <option value="Penyusutan Inventaris">Penyusutan Inventaris</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Catatan</label>
                                <input
                                    type="text"
                                    value={opnameForm.notes}
                                    onChange={(e) => setOpnameForm({...opnameForm, notes: e.target.value})}
                                    placeholder="Masukkan keterangan tambahan..."
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                                <Button type="button" variant="outline" onClick={() => setOpnameTarget(null)}>Batal</Button>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? "Menyimpan..." : "Simpan Opname"}
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <Card className="w-full max-w-xl bg-white p-6 overflow-y-auto max-h-[90vh]">
                        <div className="flex justify-between items-center mb-5">
                            <h2 className="text-base font-bold text-slate-900">Tambah Produk Baru</h2>
                            <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><Icons.X /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Kode / Barcode Produk</label>
                                    <input
                                        required
                                        name="code"
                                        value={formData.code}
                                        onChange={handleInputChange}
                                        type="text"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                                        placeholder="Masukkan kode produk..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Nama Produk</label>
                                    <input
                                        required
                                        name="name"
                                        value={formData.name}
                                        onChange={handleInputChange}
                                        type="text"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                                        placeholder="Masukkan nama produk..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Kategori</label>
                                    <select
                                        required
                                        name="category"
                                        value={formData.category}
                                        onChange={handleInputChange}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                                    >
                                        <option value="Sembako">Sembako</option>
                                        <option value="Minuman">Minuman</option>
                                        <option value="Makanan">Makanan</option>
                                        <option value="Snack">Snack</option>
                                        <option value="Perawatan">Perawatan</option>
                                        <option value="Katalog Toko">Katalog Toko</option>
                                        <option value="Lainnya">Lainnya</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Supplier</label>
                                    <input
                                        name="supplier"
                                        value={formData.supplier}
                                        onChange={handleInputChange}
                                        type="text"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                                        placeholder="Masukkan nama supplier..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Harga Modal (Rp)</label>
                                    <input
                                        required
                                        name="cost"
                                        value={formData.cost}
                                        onChange={handleInputChange}
                                        type="number"
                                        min="0"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                                        placeholder="0"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Harga Jual (Rp)</label>
                                    <input
                                        required
                                        name="price"
                                        value={formData.price}
                                        onChange={handleInputChange}
                                        type="number"
                                        min="0"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                                        placeholder="0"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Stok Awal Gudang (Unit)</label>
                                    <input
                                        required
                                        name="stock"
                                        value={formData.stock}
                                        onChange={handleInputChange}
                                        type="number"
                                        min="0"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                            {isProUser && (
                                <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-900">
                                    <strong>Catatan:</strong> Batas stok minimum dihitung secara otomatis berdasarkan proyeksi permintaan.
                                </div>
                            )}
                            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
                                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Batal</Button>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? "Menyimpan..." : "Simpan Produk"}
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
};

window.ProductsPage = ProductsPage;