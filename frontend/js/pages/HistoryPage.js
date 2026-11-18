const HistoryPage = ({ historyLogs, currentUser, selectedType, setSelectedType, isLoadingHistory, onRefreshHistory, onRefreshData }) => {
    const { addToast } = React.useContext(ToastContext);
    const isProUser = (currentUser?.subscription_plan || "FREE").toUpperCase() === "PRO";

    const [searchQuery, setSearchQuery] = useState("");
    const [voidingId, setVoidingId] = useState(null);

    const [activeDatasetTab, setActiveDatasetTab] = useState("Penjualan");
    const [datasetTabsData, setDatasetTabsData] = useState({
        "Penjualan": [],
        "Barang Keluar": [],
        "Produk": []
    });
    const [isLoadingTabs, setIsLoadingTabs] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        onRefreshHistory();
    }, [onRefreshHistory]);

    useEffect(() => {
        if (!isProUser && selectedType === "PREDICTION") {
            setSelectedType("SALES");
        }
    }, [isProUser, selectedType, setSelectedType]);

    const fetchThreeTabsDataset = useCallback(async () => {
        setIsLoadingTabs(true);
        try {
            const res = await authFetch(`${API_BASE_URL}/history/dataset-tabs`);
            if (res.ok) {
                const data = await res.json();
                setDatasetTabsData({
                    "Penjualan": data["Penjualan"] || [],
                    "Barang Keluar": data["Barang Keluar"] || [],
                    "Produk": data["Produk"] || []
                });
            }
        } catch (err) {
            console.error("Gagal memuat struktur basis data:", err);
        } finally {
            setIsLoadingTabs(false);
        }
    }, []);

    useEffect(() => {
        if (selectedType === "ALL") {
            fetchThreeTabsDataset();
        }
    }, [selectedType, fetchThreeTabsDataset]);

    const categoryTitles = {
        SALES: "Riwayat Input Penjualan",
        PREDICTION: "Riwayat Prediksi Permintaan",
        PRODUCT: "Riwayat Manajemen Produk",
        ALL: "Basis Data Lengkap (Penjualan, Barang Keluar, Produk)"
    };

    const categorySubtitles = {
        SALES: "Daftar transaksi penjualan kasir beserta fitur pembatalan (Void) dan pengembalian stok.",
        PREDICTION: "Catatan hasil analisis dan proyeksi kebutuhan stok barang.",
        PRODUCT: "Catatan penambahan produk baru, perubahan harga, restock, dan penyesuaian stock opname.",
        ALL: "Menampilkan keseluruhan data operasional toko dalam format tiga tabel: Penjualan, Barang Keluar, dan Produk."
    };

    const filteredLogs = useMemo(() => {
        return historyLogs.filter(item => {
            if (!isProUser && item.log_type === "PREDICTION") return false;
            const matchType = selectedType === "ALL" ? true : item.log_type === selectedType;
            const q = searchQuery.toLowerCase();
            const matchSearch =
                (item.product_name || "").toLowerCase().includes(q) ||
                (item.product_code || "").toLowerCase().includes(q) ||
                (item.action_label || "").toLowerCase().includes(q) ||
                (item.notes || "").toLowerCase().includes(q);
            return matchType && matchSearch;
        });
    }, [historyLogs, selectedType, searchQuery, isProUser]);

    const filteredTabRows = useMemo(() => {
        const rows = datasetTabsData[activeDatasetTab] || [];
        if (!searchQuery.trim()) return rows;
        const q = searchQuery.toLowerCase();
        return rows.filter(r =>
            Object.values(r).some(val => String(val ?? "").toLowerCase().includes(q))
        );
    }, [datasetTabsData, activeDatasetTab, searchQuery]);

    const handleVoidSale = async (log) => {
        if (log.is_voided === 1) return;
        if (!window.confirm(`Batalkan (Void) transaksi penjualan "${log.product_name}" sebanyak ${log.quantity} unit? Stok sebesar +${log.quantity} unit akan dikembalikan ke gudang.`)) {
            return;
        }
        setVoidingId(log.id);
        try {
            const response = await authFetch(`${API_BASE_URL}/sales/void/${log.id}`, {
                method: 'POST'
            });
            const resData = await response.json();
            if (!response.ok) throw new Error(resData.detail || "Gagal membatalkan transaksi.");

            if (onRefreshData) {
                await onRefreshData();
            } else {
                await onRefreshHistory();
            }
            if (selectedType === "ALL") {
                await fetchThreeTabsDataset();
            }
            addToast(resData.message, "success");
        } catch (error) {
            addToast(error.message, "error");
        } finally {
            setVoidingId(null);
        }
    };

    const handleImportDatasetFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsImporting(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("mode", "FULL_IMPORT");
            formData.append("custom_cutoff", "");

            const res = await authFetch(`${API_BASE_URL}/cloud/upload-dataset`, {
                method: "POST",
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Gagal mengimpor file dataset.");

            addToast(data.message, "success");
            if (onRefreshData) await onRefreshData();
            await fetchThreeTabsDataset();
        } catch (err) {
            addToast(err.message, "error");
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const buildSeparateExportRows = () => {
        return filteredLogs.map((log, idx) => ({
            "No": idx + 1,
            "Waktu Input": log.created_at,
            "Tanggal": log.transaction_date,
            "Kategori": log.log_type,
            "Aksi": log.action_label,
            "Kode Produk": log.product_code,
            "Nama Produk": log.product_name,
            "Kuantitas": log.quantity,
            "Harga Satuan": log.unit_price,
            "Total Nilai": log.total_value,
            "Stok Sebelum": log.stock_before,
            "Stok Sesudah": log.stock_after,
            "Status": log.is_voided ? "VOID" : "AKTIF",
            "Keterangan": log.notes
        }));
    };

    const handleExportCSV = () => {
        const rows = selectedType === "ALL" ? filteredTabRows : buildSeparateExportRows();
        if (rows.length === 0) {
            addToast("Tidak ada data untuk diekspor.", "error");
            return;
        }
        const headers = Object.keys(rows[0]);
        const csvLines = [
            headers.join(","),
            ...rows.map(row => headers.map(h => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(","))
        ];
        const blob = new Blob(["\uFEFF" + csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        const fileLabel = selectedType === "ALL" ? `Dataset_${activeDatasetTab.replace(/\s+/g, "_")}` : `Riwayat_${selectedType}`;
        link.setAttribute("download", `StockSense_${fileLabel}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        addToast("File CSV berhasil diunduh.", "success");
    };

    const handleExportExcel = () => {
        if (typeof XLSX === "undefined") return handleExportCSV();

        if (selectedType === "ALL") {
            const workbook = XLSX.utils.book_new();
            const tabsOrder = ["Penjualan", "Barang Keluar", "Produk"];
            let totalRows = 0;

            tabsOrder.forEach(tabName => {
                const tabRows = datasetTabsData[tabName] || [];
                totalRows += tabRows.length;
                const ws = XLSX.utils.json_to_sheet(tabRows.length > 0 ? tabRows : [{}]);
                XLSX.utils.book_append_sheet(workbook, ws, tabName);
            });

            if (totalRows === 0) {
                addToast("Belum ada data pada ketiga tabel untuk diekspor.", "error");
                return;
            }
            XLSX.writeFile(workbook, "Laporan_Basis_Data_StockSense.xlsx");
            addToast("Laporan Excel (Penjualan, Barang Keluar, Produk) berhasil diunduh.", "success");
            return;
        }

        const rows = buildSeparateExportRows();
        if (rows.length === 0) {
            addToast("Tidak ada data riwayat untuk diekspor.", "error");
            return;
        }
        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, `Riwayat_${selectedType}`);
        XLSX.writeFile(workbook, `StockSense_Riwayat_${selectedType}.xlsx`);
        addToast("File Excel (.xlsx) berhasil diunduh.", "success");
    };

    const countSales = historyLogs.filter(l => l.log_type === "SALES").length;
    const countPrediction = historyLogs.filter(l => l.log_type === "PREDICTION").length;
    const countProduct = historyLogs.filter(l => l.log_type === "PRODUCT").length;

    const categoryCards = [
        { id: "SALES", label: "Riwayat Input Penjualan", count: countSales, unit: "Transaksi", accent: "border-l-4 border-l-emerald-500" },
        ...(isProUser ? [{ id: "PREDICTION", label: "Riwayat Prediksi", count: countPrediction, unit: "Analisis", accent: "border-l-4 border-l-violet-600" }] : []),
        { id: "PRODUCT", label: "Riwayat Manajemen Produk", count: countProduct, unit: "Aktivitas", accent: "border-l-4 border-l-amber-500" },
        { id: "ALL", label: "Basis Data Lengkap", count: (datasetTabsData["Penjualan"]?.length || historyLogs.length), unit: "Tiga Tabel", accent: "border-l-4 border-l-indigo-600" }
    ];

    return (
        <div className="space-y-6 page-enter">
            <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 text-white shadow-md flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0 mt-0.5">
                        <Icons.History />
                    </div>
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-300">Audit Log & Basis Data</span>
                        <h1 className="text-2xl font-bold tracking-tight mt-0.5">
                            {categoryTitles[selectedType] || "Riwayat Data"}
                        </h1>
                        <p className="text-xs text-slate-300 mt-1">
                            {categorySubtitles[selectedType]}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv,.json"
                        onChange={handleImportDatasetFile}
                        className="hidden"
                    />
                    <button
                        type="button"
                        disabled={isImporting}
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all flex items-center gap-2"
                    >
                        <Icons.UploadCloud />
                        {isImporting ? "Mengimpor..." : "Impor Dataset"}
                    </button>
                    <button
                        type="button"
                        onClick={handleExportCSV}
                        className="px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all flex items-center gap-2"
                    >
                        <Icons.Download /> Ekspor CSV
                    </button>
                    <Button onClick={handleExportExcel} className="text-xs py-2.5">
                        <Icons.Download />
                        {selectedType === "ALL" ? "Ekspor Excel Lengkap (.xlsx)" : "Ekspor Excel (.xlsx)"}
                    </Button>
                </div>
            </div>

            <div className={`grid grid-cols-1 sm:grid-cols-2 ${isProUser ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
                {categoryCards.map(tab => {
                    const active = selectedType === tab.id;
                    return (
                        <Card
                            key={tab.id}
                            onClick={() => setSelectedType(tab.id)}
                            className={`p-4 ${tab.accent} ${active ? 'ring-2 ring-indigo-500/30 bg-indigo-50/20' : ''}`}
                        >
                            <p className="text-xs font-semibold text-slate-500">{tab.label}</p>
                            <div className="flex items-baseline justify-between mt-1.5">
                                <h3 className="text-2xl font-bold text-slate-900">
                                    {tab.count.toLocaleString('id-ID')}
                                </h3>
                                <span className="text-[11px] font-semibold text-indigo-600">{tab.unit}</span>
                            </div>
                        </Card>
                    );
                })}
            </div>

            <Card className="p-4 border-slate-200/80 space-y-3">
                {selectedType === "ALL" && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div className="flex flex-wrap gap-2">
                            {["Penjualan", "Barang Keluar", "Produk"].map(sheetName => {
                                const isSheetActive = activeDatasetTab === sheetName;
                                const sheetCount = (datasetTabsData[sheetName] || []).length;
                                return (
                                    <button
                                        key={sheetName}
                                        type="button"
                                        onClick={() => setActiveDatasetTab(sheetName)}
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                            isSheetActive
                                                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-indigo-600 shadow-sm'
                                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                        }`}
                                    >
                                        Tabel: {sheetName} ({sheetCount.toLocaleString('id-ID')})
                                    </button>
                                );
                            })}
                        </div>
                        <span className="text-xs text-slate-400">
                            Format Standar Tiga Tabel
                        </span>
                    </div>
                )}

                <div className="relative w-full">
                    <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-indigo-500">
                        <Icons.Search />
                    </div>
                    <input
                        type="text"
                        placeholder={selectedType === "ALL" ? `Cari data di dalam tabel ${activeDatasetTab}...` : "Cari kode produk, nama barang, nomor nota, atau keterangan..."}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                    />
                </div>
            </Card>

            {selectedType === "ALL" ? (
                <Card className="overflow-hidden border-slate-200/80">
                    {isLoadingTabs ? (
                        <div className="p-10 text-center text-slate-400 text-sm">Memuat data riwayat...</div>
                    ) : (
                        <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
                            {activeDatasetTab === "Penjualan" && (
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600 uppercase tracking-wider font-bold">
                                        <tr>
                                            <th className="py-3 px-4">orders_id</th>
                                            <th className="py-3 px-4">create_at</th>
                                            <th className="py-3 px-4">month</th>
                                            <th className="py-3 px-4">date</th>
                                            <th className="py-3 px-4">time</th>
                                            <th className="py-3 px-4">description</th>
                                            <th className="py-3 px-4">payment_id</th>
                                            <th className="py-3 px-4">no_payment</th>
                                            <th className="py-3 px-4">pembayaran</th>
                                            <th className="py-3 px-4">total</th>
                                            <th className="py-3 px-4">user_id</th>
                                            <th className="py-3 px-4">member_id</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-xs font-mono text-slate-700">
                                        {filteredTabRows.slice(0, 300).map((r, i) => (
                                            <tr key={i} className="hover:bg-indigo-50/30">
                                                <td className="py-2.5 px-4 font-bold text-indigo-600">{r.orders_id}</td>
                                                <td className="py-2.5 px-4">{r.create_at}</td>
                                                <td className="py-2.5 px-4">{r.month}</td>
                                                <td className="py-2.5 px-4">{r.date}</td>
                                                <td className="py-2.5 px-4">{r.time}</td>
                                                <td className="py-2.5 px-4">{r.description}</td>
                                                <td className="py-2.5 px-4">{r.payment_id}</td>
                                                <td className="py-2.5 px-4 text-slate-400">{r.no_payment}</td>
                                                <td className="py-2.5 px-4">{formatRupiah(r.pembayaran)}</td>
                                                <td className="py-2.5 px-4 font-bold text-slate-900">{formatRupiah(r.total)}</td>
                                                <td className="py-2.5 px-4">{r.user_id}</td>
                                                <td className="py-2.5 px-4 text-slate-400">{r.member_id}</td>
                                            </tr>
                                        ))}
                                        {filteredTabRows.length === 0 && (
                                            <tr><td colSpan="12" className="p-8 text-center text-slate-400 font-sans">Tidak ada data pada tabel Penjualan.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            )}

                            {activeDatasetTab === "Barang Keluar" && (
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600 uppercase tracking-wider font-bold">
                                        <tr>
                                            <th className="py-3 px-4">date_out</th>
                                            <th className="py-3 px-4">month</th>
                                            <th className="py-3 px-4">date</th>
                                            <th className="py-3 px-4">order_id</th>
                                            <th className="py-3 px-4">product_id</th>
                                            <th className="py-3 px-4">discount</th>
                                            <th className="py-3 px-4">desc</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-xs font-mono text-slate-700">
                                        {filteredTabRows.slice(0, 300).map((r, i) => (
                                            <tr key={i} className="hover:bg-indigo-50/30">
                                                <td className="py-2.5 px-4">{r.date_out}</td>
                                                <td className="py-2.5 px-4">{r.month}</td>
                                                <td className="py-2.5 px-4">{r.date}</td>
                                                <td className="py-2.5 px-4 font-bold text-slate-900">{r.order_id}</td>
                                                <td className="py-2.5 px-4 text-indigo-600 font-bold">{r.product_id}</td>
                                                <td className="py-2.5 px-4">{r.discount}</td>
                                                <td className="py-2.5 px-4 text-slate-400">{r.desc}</td>
                                            </tr>
                                        ))}
                                        {filteredTabRows.length === 0 && (
                                            <tr><td colSpan="7" className="p-8 text-center text-slate-400 font-sans">Tidak ada data pada tabel Barang Keluar.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            )}

                            {activeDatasetTab === "Produk" && (
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600 uppercase tracking-wider font-bold">
                                        <tr>
                                            <th className="py-3 px-4">product_id</th>
                                            <th className="py-3 px-4">categories_id</th>
                                            <th className="py-3 px-4">name</th>
                                            <th className="py-3 px-4">brand</th>
                                            <th className="py-3 px-4 text-right">selling_price</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                                        {filteredTabRows.slice(0, 300).map((r, i) => (
                                            <tr key={i} className="hover:bg-indigo-50/30">
                                                <td className="py-2.5 px-4 font-mono font-semibold text-indigo-600">{r.product_id}</td>
                                                <td className="py-2.5 px-4 text-slate-500">{r.categories_id}</td>
                                                <td className="py-2.5 px-4 font-semibold text-slate-900">{r.name}</td>
                                                <td className="py-2.5 px-4 text-slate-500">{r.brand}</td>
                                                <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">{formatRupiah(r.selling_price)}</td>
                                            </tr>
                                        ))}
                                        {filteredTabRows.length === 0 && (
                                            <tr><td colSpan="5" className="p-8 text-center text-slate-400">Tidak ada data pada tabel Produk.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </Card>
            ) : (
                <Card className="overflow-hidden border-slate-200/80">
                    {isLoadingHistory ? (
                        <div className="p-10 text-center text-slate-400 text-sm">Memuat data riwayat...</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gradient-to-r from-slate-50 via-indigo-50/40 to-slate-50 border-b border-slate-200 text-[11px] text-slate-600 uppercase tracking-wider font-bold">
                                        <th className="py-3.5 px-4">Waktu Input</th>
                                        <th className="py-3.5 px-4">Kategori / Aksi</th>
                                        <th className="py-3.5 px-4">Kode & Nama Produk</th>
                                        <th className="py-3.5 px-4">Kuantitas</th>
                                        <th className="py-3.5 px-4">Nilai (Rp)</th>
                                        <th className="py-3.5 px-4">Perubahan Stok</th>
                                        <th className="py-3.5 px-4">Keterangan</th>
                                        {selectedType === "SALES" && <th className="py-3.5 px-4 text-center">Tindakan</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-sm">
                                    {filteredLogs.map(log => {
                                        const isVoid = log.is_voided === 1;
                                        return (
                                            <tr key={log.id} className={`hover:bg-indigo-50/30 ${isVoid ? 'bg-rose-50/30 line-through text-slate-400' : ''}`}>
                                                <td className="py-3.5 px-4 text-xs text-slate-500 font-mono">{log.created_at}</td>
                                                <td className="py-3.5 px-4">
                                                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${isVoid ? 'bg-rose-100 text-rose-700' : 'bg-indigo-50 text-indigo-700'}`}>
                                                        {isVoid ? "DIBATALKAN (VOID)" : log.action_label}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <span className="font-mono text-xs text-indigo-600 font-semibold block">{log.product_code}</span>
                                                    <span className="font-semibold text-slate-800">{log.product_name}</span>
                                                </td>
                                                <td className="py-3.5 px-4 font-bold text-slate-800">{log.quantity} unit</td>
                                                <td className="py-3.5 px-4 font-bold text-slate-800">{formatRupiah(log.total_value)}</td>
                                                <td className="py-3.5 px-4 text-xs font-mono text-slate-600">{log.stock_before} &rarr; <strong>{log.stock_after}</strong></td>
                                                <td className="py-3.5 px-4 text-xs text-slate-500 max-w-md">{log.notes}</td>
                                                {selectedType === "SALES" && (
                                                    <td className="py-3.5 px-4 text-center">
                                                        {isVoid ? (
                                                            <span className="text-xs font-semibold text-rose-600">Stok Dikembalikan</span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                disabled={voidingId === log.id}
                                                                onClick={() => handleVoidSale(log)}
                                                                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 inline-flex items-center gap-1"
                                                            >
                                                                <Icons.RotateCcw /> {voidingId === log.id ? "Memproses..." : "Batalkan (Void)"}
                                                            </button>
                                                        )}
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                    {filteredLogs.length === 0 && (
                                        <tr>
                                            <td colSpan="8" className="p-10 text-center text-slate-400 text-sm">
                                                Belum ada data riwayat pada kategori ini.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
};

window.HistoryPage = HistoryPage;