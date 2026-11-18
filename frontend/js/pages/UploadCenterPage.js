const UploadCenterPage = ({ currentUser, onRefreshData, onGoToSubscription }) => {
    const { addToast } = React.useContext(ToastContext);
    const [cloudStatus, setCloudStatus] = useState(null);
    const [datasetFile, setDatasetFile] = useState(null);
    const [uploadMode, setUploadMode] = useState("FULL_IMPORT");
    const [customCutoff, setCustomCutoff] = useState("");
    const [isUploadingDataset, setIsUploadingDataset] = useState(false);

    const [modelFile, setModelFile] = useState(null);
    const [modelName, setModelName] = useState("Model Prediksi Utama");
    const [isUploadingModel, setIsUploadingModel] = useState(false);

    const datasetInputRef = useRef(null);
    const modelInputRef = useRef(null);

    const isProUser = (currentUser?.subscription_plan || "FREE").toUpperCase() === "PRO";

    const fetchCloudStatus = useCallback(async () => {
        try {
            const res = await authFetch(`${API_BASE_URL}/cloud/status`);
            if (res.ok) {
                const data = await res.json();
                setCloudStatus(data);
            }
        } catch (err) {
            console.error("Gagal memuat status sinkronisasi:", err);
        }
    }, []);

    useEffect(() => {
        fetchCloudStatus();
    }, [fetchCloudStatus]);

    const handleDatasetUpload = async (e) => {
        e.preventDefault();
        if (!datasetFile) {
            addToast("Pilih file dataset (.xlsx, .csv, atau .json) terlebih dahulu.", "error");
            return;
        }
        setIsUploadingDataset(true);
        try {
            const formData = new FormData();
            formData.append("file", datasetFile);
            formData.append("mode", uploadMode);
            formData.append("custom_cutoff", customCutoff);

            const res = await authFetch(`${API_BASE_URL}/cloud/upload-dataset`, {
                method: "POST",
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Gagal mengimpor dataset.");
            addToast(data.message, "success");
            setDatasetFile(null);
            if (datasetInputRef.current) datasetInputRef.current.value = "";
            await Promise.all([fetchCloudStatus(), onRefreshData()]);
        } catch (err) {
            addToast(err.message, "error");
        } finally {
            setIsUploadingDataset(false);
        }
    };

    const handleModelUpload = async (e) => {
        e.preventDefault();
        if (!isProUser) {
            addToast("Fitur konfigurasi model prediksi khusus pengguna Paket PRO.", "error");
            return;
        }
        if (!modelFile) {
            addToast("Pilih file konfigurasi model (.json / .ubj) terlebih dahulu.", "error");
            return;
        }
        setIsUploadingModel(true);
        try {
            const formData = new FormData();
            formData.append("file", modelFile);
            formData.append("model_name", modelName);

            const res = await authFetch(`${API_BASE_URL}/cloud/upload-model`, {
                method: "POST",
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Gagal mengaktifkan model prediksi.");
            addToast(data.message, "success");
            setModelFile(null);
            if (modelInputRef.current) modelInputRef.current.value = "";
            await Promise.all([fetchCloudStatus(), onRefreshData()]);
        } catch (err) {
            addToast(err.message, "error");
        } finally {
            setIsUploadingModel(false);
        }
    };

    const modeOptions = [
        {
            id: "FULL_IMPORT",
            badge: "Mode 1 • Katalog Penuh",
            badgeClass: "bg-indigo-100 text-indigo-700",
            activeBorder: "border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20",
            title: "Impor Seluruh Katalog & Riwayat Transaksi",
            desc: "Mengganti dan mengimpor seluruh produk beserta histori transaksi dari file dataset ke dalam sistem."
        },
        {
            id: "TOP_100",
            badge: "Mode 2 • Top 100 Terlaris",
            badgeClass: "bg-emerald-100 text-emerald-700",
            activeBorder: "border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20",
            title: "Impor 100 Produk Penjualan Tertinggi",
            desc: "Menyaring dataset dan menyimpan 100 produk dengan volume penjualan tertinggi ke dalam sistem."
        },
        {
            id: "DELTA_SYNC",
            badge: "Mode 3 • Smart Cut-Off",
            badgeClass: "bg-amber-100 text-amber-800",
            activeBorder: "border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/20",
            title: "Sinkronisasi Transaksi Terbaru (Delta Sync)",
            desc: `Memotong otomatis transaksi lama (<= ${cloudStatus?.last_sync_timestamp || "2026-10-06 22:55:24"}) dan hanya menyinkronkan transaksi terbaru ke dalam sistem.`
        }
    ];

    return (
        <div className="space-y-6 page-enter">
            <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950 via-slate-900 to-cyan-950 text-white shadow-md flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center text-cyan-300 shrink-0 mt-0.5">
                        <Icons.UploadCloud />
                    </div>
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-widest text-cyan-300">Pusat Manajemen Data</span>
                        <h1 className="text-2xl font-bold tracking-tight mt-0.5">
                            {isProUser ? "Sinkronisasi Data & Konfigurasi Model" : "Sinkronisasi Data Toko"}
                        </h1>
                        <p className="text-xs text-slate-300 mt-1">
                            Impor data katalog dan transaksi penjualan atau kelola model analitik toko Anda.
                        </p>
                    </div>
                </div>
            </div>

            <div className={`grid grid-cols-1 ${isProUser ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
                <Card className="p-4 border-l-4 border-l-indigo-600 card-hover">
                    <div className="flex justify-between items-center">
                        <p className="text-xs font-semibold text-slate-500">Total Produk Terdaftar</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">Katalog Aktif</span>
                    </div>
                    <h3 className="text-2xl font-bold mt-1.5 text-slate-900">
                        {(cloudStatus?.total_products_in_tidb ?? 0).toLocaleString('id-ID')} <span className="text-xs font-normal text-slate-500">Produk</span>
                    </h3>
                </Card>
                <Card className="p-4 border-l-4 border-l-emerald-500 card-hover">
                    <div className="flex justify-between items-center">
                        <p className="text-xs font-semibold text-slate-500">Waktu Sinkronisasi Terakhir</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Smart Cut-Off</span>
                    </div>
                    <h3 className="text-base font-mono font-bold mt-2 text-emerald-700">
                        {cloudStatus?.last_sync_timestamp || currentUser?.last_sync_timestamp || "2026-10-06 22:55:24"}
                    </h3>
                </Card>
                {isProUser && (
                    <Card className="p-4 border-l-4 border-l-violet-600 card-hover">
                        <div className="flex justify-between items-center">
                            <p className="text-xs font-semibold text-slate-500">Model Prediksi Aktif</p>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">Analitik PRO</span>
                        </div>
                        <h3 className={`text-sm font-bold mt-2 truncate ${cloudStatus?.has_cloud_model ? 'text-indigo-700' : 'text-rose-600'}`}>
                            {cloudStatus?.active_model_name || "Belum Ada Model Aktif"}
                        </h3>
                    </Card>
                )}
            </div>

            <div className={`grid grid-cols-1 ${isProUser ? 'lg:grid-cols-2' : 'lg:grid-cols-1'} gap-6`}>
                {/* KARTU 1: UPLOAD DATASET 3 MODE */}
                <Card className="p-6 space-y-5 border-slate-200/80">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div>
                            <h2 className="text-base font-bold text-slate-900">Impor & Sinkronisasi Dataset Toko</h2>
                            <p className="text-xs text-slate-500 mt-0.5">Mendukung format file Excel (.xlsx), CSV, maupun JSON</p>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700">
                            Multi-Format
                        </span>
                    </div>

                    <form onSubmit={handleDatasetUpload} className="space-y-4">
                        <div className="space-y-2.5">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Pilih Metode Sinkronisasi</label>
                            {modeOptions.map(opt => {
                                const active = uploadMode === opt.id;
                                return (
                                    <label
                                        key={opt.id}
                                        className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                                            active ? opt.activeBorder : 'border-slate-200 hover:border-indigo-200 hover:bg-slate-50/60'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="mode"
                                            checked={active}
                                            onChange={() => setUploadMode(opt.id)}
                                            className="mt-1 text-indigo-600"
                                        />
                                        <div className="text-xs flex-1">
                                            <div className="flex items-center justify-between gap-2 mb-0.5">
                                                <span className="font-bold text-slate-900">{opt.title}</span>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${opt.badgeClass}`}>
                                                    {opt.badge}
                                                </span>
                                            </div>
                                            <span className="text-slate-600 leading-relaxed block">{opt.desc}</span>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>

                        {uploadMode === "DELTA_SYNC" && (
                            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1.5">
                                <label className="block text-xs font-bold text-amber-900">
                                    Batas Waktu Cut-Off (Kosongkan untuk Otomatis)
                                </label>
                                <input
                                    type="text"
                                    value={customCutoff}
                                    onChange={(e) => setCustomCutoff(e.target.value)}
                                    placeholder={cloudStatus?.last_sync_timestamp || "2026-10-06 22:55:24"}
                                    className="w-full border border-amber-300 bg-white rounded-xl px-3 py-2 text-xs font-mono outline-none focus:border-indigo-600"
                                />
                                <p className="text-[11px] text-amber-700">
                                    Contoh isi manual: <strong>2026-10-01 00:00:00</strong>. Jika dikosongkan dan seluruh file sudah pernah diimpor, sistem otomatis menyinkronkan transaksi 7 hari terakhir dari dataset.
                                </p>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Pilih File Dataset (.xlsx / .csv / .json)</label>
                            <input
                                ref={datasetInputRef}
                                type="file"
                                accept=".xlsx,.xls,.csv,.json"
                                onChange={(e) => setDatasetFile(e.target.files[0] || null)}
                                className="w-full border border-slate-200 rounded-xl p-2.5 text-xs text-slate-600 bg-slate-50/70 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                            />
                        </div>

                        <Button type="submit" disabled={isUploadingDataset} className="w-full py-2.5 text-xs">
                            <Icons.UploadCloud />
                            {isUploadingDataset
                                ? "Memproses Sinkronisasi Data..."
                                : `Jalankan Sinkronisasi (${uploadMode === 'TOP_100' ? '100 Penjualan Tertinggi' : uploadMode === 'DELTA_SYNC' ? 'Smart Delta Sync' : 'Katalog Penuh'})`}
                        </Button>
                    </form>
                </Card>

                {/* KARTU 2: KONFIGURASI MODEL PREDIKSI (KHUSUS PRO) */}
                {isProUser && (
                    <Card className="p-6 space-y-5 border-slate-200/80 flex flex-col justify-between">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                <div>
                                    <h2 className="text-base font-bold text-slate-900">Konfigurasi Model Prediksi</h2>
                                    <p className="text-xs text-slate-500 mt-0.5">Unggah file konfigurasi model untuk mengaktifkan proyeksi kebutuhan stok otomatis</p>
                                </div>
                                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 flex items-center gap-1">
                                    <Icons.Crown /> PRO
                                </span>
                            </div>

                            <form onSubmit={handleModelUpload} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Nama Versi Model</label>
                                    <input
                                        type="text"
                                        required
                                        value={modelName}
                                        onChange={(e) => setModelName(e.target.value)}
                                        placeholder="Masukkan nama versi model..."
                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm outline-none focus:border-indigo-600"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">File Konfigurasi Model (.json / .ubj)</label>
                                    <input
                                        ref={modelInputRef}
                                        type="file"
                                        accept=".json,.ubj,.model,.txt"
                                        onChange={(e) => setModelFile(e.target.files[0] || null)}
                                        className="w-full border border-slate-200 rounded-xl p-2.5 text-xs text-slate-600 bg-slate-50/70 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"
                                    />
                                </div>

                                <Button type="submit" disabled={isUploadingModel} className="w-full py-2.5 text-xs">
                                    <Icons.BrainCircuit />
                                    {isUploadingModel ? "Menyimpan & Mengaktifkan..." : "Simpan & Aktifkan Model"}
                                </Button>
                            </form>
                        </div>

                        <div className="pt-4 border-t border-slate-100">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">
                                Riwayat Versi Model
                            </h4>
                            <div className="space-y-2 max-h-44 overflow-y-auto">
                                {(cloudStatus?.models || []).map(m => (
                                    <div key={m.id} className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 flex justify-between items-center text-xs">
                                        <div>
                                            <span className="font-bold text-slate-800">{m.model_name}</span>
                                            <span className="text-slate-400 block font-mono text-[11px]">{m.filename} ({m.file_size_kb} KB) • {m.uploaded_at}</span>
                                        </div>
                                        {m.is_active ? (
                                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">Aktif</span>
                                        ) : (
                                            <span className="text-slate-400 font-medium">Arsip</span>
                                        )}
                                    </div>
                                ))}
                                {(!cloudStatus?.models || cloudStatus.models.length === 0) && (
                                    <p className="text-xs text-rose-500 font-medium">
                                        Belum ada model prediksi yang diaktifkan. Silakan unggah file model di atas.
                                    </p>
                                )}
                            </div>
                        </div>
                    </Card>
                )}
            </div>

            <Card className="p-5 border-slate-200/80 space-y-3">
                <div className="flex justify-between items-center">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900">Riwayat Impor & Sinkronisasi Data</h3>
                        <p className="text-xs text-slate-500">Catatan aktivitas sinkronisasi katalog dan transaksi penjualan.</p>
                    </div>
                </div>
                <div className="overflow-x-auto max-h-60 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500">
                            <tr>
                                <th className="py-2.5 px-3">Waktu Impor</th>
                                <th className="py-2.5 px-3">Nama File</th>
                                <th className="py-2.5 px-3">Metode</th>
                                <th className="py-2.5 px-3">Produk Terdampak</th>
                                <th className="py-2.5 px-3">Transaksi Disinkronkan</th>
                                <th className="py-2.5 px-3">Waktu Data Terakhir</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {(cloudStatus?.datasets || []).map(d => (
                                <tr key={d.id} className="hover:bg-indigo-50/30">
                                    <td className="py-2.5 px-3 font-mono text-slate-500">{d.uploaded_at}</td>
                                    <td className="py-2.5 px-3 font-semibold text-slate-800">{d.filename}</td>
                                    <td className="py-2.5 px-3">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                            d.upload_mode === 'TOP_100'
                                                ? 'bg-emerald-100 text-emerald-800'
                                                : d.upload_mode === 'DELTA_SYNC'
                                                ? 'bg-amber-100 text-amber-800'
                                                : 'bg-indigo-100 text-indigo-800'
                                        }`}>
                                            {d.upload_mode}
                                        </span>
                                    </td>
                                    <td className="py-2.5 px-3 font-bold text-slate-800">{Number(d.total_products_affected || 0).toLocaleString('id-ID')} Produk</td>
                                    <td className="py-2.5 px-3 text-slate-700">{Number(d.total_transactions_synced || 0).toLocaleString('id-ID')} Transaksi</td>
                                    <td className="py-2.5 px-3 font-mono text-emerald-700">{d.new_last_timestamp}</td>
                                </tr>
                            ))}
                            {(!cloudStatus?.datasets || cloudStatus.datasets.length === 0) && (
                                <tr>
                                    <td colSpan="6" className="p-6 text-center text-slate-400">Belum ada riwayat sinkronisasi data.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

window.UploadCenterPage = UploadCenterPage;