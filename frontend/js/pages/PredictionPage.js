const PredictionPage = ({ products, currentUser, onRefreshHistory, onGoToSubscription, onGoToUploadModel }) => {
    const { addToast } = React.useContext(ToastContext);
    const [selectedProduct, setSelectedProduct] = useState(products[0]?.id || '');
    const [predictionDays, setPredictionDays] = useState(7);
    const [isPredicting, setIsPredicting] = useState(false);
    const [result, setResult] = useState(null);
    const [cloudModelInfo, setCloudModelInfo] = useState({ loading: true, hasModel: false, activeModelName: null });

    const isProUser = (currentUser?.subscription_plan || "FREE").toUpperCase() === "PRO";

    useEffect(() => {
        if (!selectedProduct && products.length > 0) {
            setSelectedProduct(products[0].id);
        }
    }, [products, selectedProduct]);

    useEffect(() => {
        if (isProUser) {
            authFetch(`${API_BASE_URL}/cloud/status`)
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    setCloudModelInfo({
                        loading: false,
                        hasModel: Boolean(data?.has_cloud_model),
                        activeModelName: data?.active_model_name || null
                    });
                })
                .catch(() => setCloudModelInfo({ loading: false, hasModel: false, activeModelName: null }));
        }
    }, [isProUser]);

    if (!isProUser) {
        return (
            <Card className="p-10 text-center max-w-2xl mx-auto my-8 border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-amber-50/40 space-y-5 page-enter">
                <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto shadow-lg">
                    <Icons.Lock />
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                    <Icons.Crown /> FITUR EKSKLUSIF PAKET PRO
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900">Prediksi Permintaan Stok Terkunci</h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                    Akun Anda saat ini berada pada paket <strong>FREE</strong>. Silakan aktifkan paket <strong>PRO</strong> terlebih dahulu untuk mengakses fitur proyeksi permintaan cerdas.
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
                    Paket <strong>PRO</strong> Anda sudah aktif. Silakan unggah dan aktifkan model prediksi melalui menu Sinkronisasi Data untuk mulai memproyeksikan kebutuhan stok.
                </p>
                <div className="pt-2 flex justify-center">
                    <Button onClick={onGoToUploadModel} className="py-3 px-6">
                        <Icons.UploadCloud /> Buka Pengaturan Model Prediksi
                    </Button>
                </div>
            </Card>
        );
    }

    const activeProduct = products.find(p => p.id === selectedProduct);

    const runPrediction = async () => {
        if (!selectedProduct) {
            addToast("Silakan pilih produk terlebih dahulu.", "error");
            return;
        }
        setIsPredicting(true);
        setResult(null);
        try {
            const response = await authFetch(`${API_BASE_URL}/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId: selectedProduct,
                    predictionDays: Number(predictionDays)
                })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || "Gagal menjalankan analisis prediksi.");
            }
            setResult(data);
            if (onRefreshHistory) onRefreshHistory();
            addToast("Analisis selesai & otomatis tercatat di Riwayat Prediksi.", "success");
        } catch (error) {
            addToast(error.message || "Gagal menghubungi layanan prediksi.", "error");
        } finally {
            setIsPredicting(false);
        }
    };

    if (products.length === 0) {
        return (
            <Card className="p-10 text-center text-slate-500 page-enter">
                Belum ada data produk yang dimuat.
            </Card>
        );
    }

    return (
        <div className="space-y-6 page-enter">
            <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950 via-violet-950 to-slate-900 text-white shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-violet-500/20 border border-violet-400/30 flex items-center justify-center text-violet-300 shrink-0 mt-0.5">
                        <Icons.BrainCircuit />
                    </div>
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-widest text-violet-300">Analitik & Proyeksi Permintaan</span>
                        <h1 className="text-2xl font-bold tracking-tight mt-0.5">Prediksi Permintaan Stok</h1>
                        <p className="text-xs text-slate-300 mt-1">
                            Model Analitik Aktif: <strong>{cloudModelInfo.activeModelName || "Model Prediksi Utama"}</strong>
                        </p>
                    </div>
                </div>
                <span className="px-3.5 py-1.5 rounded-full text-xs font-extrabold bg-amber-400 text-slate-950 flex items-center gap-1.5 shrink-0">
                    <Icons.Crown /> PAKET PRO AKTIF
                </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="p-5 space-y-6 h-fit border-slate-200/80">
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Pilih Produk ({products.length.toLocaleString('id-ID')} item)</label>
                        <select
                            className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm bg-slate-50/50"
                            value={selectedProduct}
                            onChange={(e) => { setSelectedProduct(e.target.value); setResult(null); }}
                        >
                            {products.slice(0, 500).map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Horizon Periode Prediksi</label>
                        <div className="grid grid-cols-3 gap-2">
                            {[7, 14, 30].map(days => (
                                <button
                                    key={days}
                                    type="button"
                                    onClick={() => { setPredictionDays(days); setResult(null); }}
                                    className={`py-2.5 text-xs rounded-xl border font-bold transition-all ${
                                        predictionDays === days
                                            ? 'bg-gradient-to-r from-indigo-600 to-violet-600 border-indigo-600 text-white shadow-sm'
                                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    {days} Hari
                                </button>
                            ))}
                        </div>
                    </div>
                    <Button onClick={runPrediction} disabled={isPredicting} className="w-full py-3">
                        {isPredicting ? "Menganalisis Permintaan..." : <><Icons.BrainCircuit /> Jalankan Prediksi</>}
                    </Button>
                </Card>

                <div className="lg:col-span-2 space-y-6">
                    {result && activeProduct ? (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Card className="p-4 border-l-4 border-l-indigo-600 bg-indigo-50/40 card-hover">
                                    <p className="text-xs text-indigo-700 font-bold">Proyeksi Permintaan ({predictionDays} hari)</p>
                                    <h3 className="text-3xl font-extrabold text-indigo-950 mt-1">{result.totalDemand} <span className="text-sm font-normal">unit</span></h3>
                                </Card>
                                <Card className="p-4 border-l-4 border-l-slate-600 card-hover">
                                    <p className="text-xs text-slate-500 font-bold">Stok Gudang Saat Ini</p>
                                    <h3 className="text-3xl font-extrabold text-slate-900 mt-1">{activeProduct.stock} <span className="text-sm font-normal">unit</span></h3>
                                </Card>
                                <Card className={`p-4 border-l-4 card-hover ${result.restockRec > 0 ? 'border-l-amber-500 bg-amber-50/50' : 'border-l-emerald-500 bg-emerald-50/50'}`}>
                                    <p className={`text-xs font-bold ${result.restockRec > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>Rekomendasi Restock</p>
                                    <h3 className={`text-3xl font-extrabold mt-1 ${result.restockRec > 0 ? 'text-amber-900' : 'text-emerald-900'}`}>
                                        {result.restockRec} <span className="text-sm font-normal">unit</span>
                                    </h3>
                                </Card>
                            </div>

                            <Card className="p-5">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                                    <div>
                                        <h3 className="text-base font-bold text-slate-900">Grafik Proyeksi Penjualan</h3>
                                    </div>
                                    <div className="flex gap-3 text-xs font-mono text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-xl font-semibold">
                                        <span>MAE: {result.mae}</span>
                                        <span>RMSE: {result.rmse}</span>
                                    </div>
                                </div>
                                <div className="h-[300px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={result.chartData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                            <XAxis dataKey="date" tick={{fontSize: 12, fill: '#6b7280'}} />
                                            <YAxis tick={{fontSize: 12, fill: '#6b7280'}} />
                                            <Tooltip contentStyle={{borderRadius: '12px'}} />
                                            <Legend />
                                            <Line type="monotone" dataKey="actual" name="Aktual" stroke="#94a3b8" strokeWidth={2.5} dot={{r:3}} />
                                            <Line type="monotone" dataKey="predicted" name="Proyeksi Permintaan" stroke="#4f46e5" strokeWidth={3} strokeDasharray="5 5" dot={{r:4, fill: '#4f46e5'}} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="mt-4 p-4 bg-gradient-to-r from-indigo-50 to-cyan-50 border border-indigo-100 rounded-xl flex items-start gap-3">
                                    <div className="text-indigo-600 mt-0.5"><Icons.Info /></div>
                                    <p className="text-xs text-indigo-950 leading-relaxed">
                                        <strong>Ringkasan Analitik:</strong> Tren permintaan produk <strong>{activeProduct.name}</strong> menunjukkan pola <strong>{result.trend}</strong>. Sistem memperkirakan kebutuhan sebesar <strong>{result.totalDemand} unit</strong> untuk {predictionDays} hari ke depan dengan cadangan pengaman (safety stock) <strong>{result.safetyStock} unit</strong>.
                                    </p>
                                </div>
                            </Card>
                        </>
                    ) : (
                        <Card className="h-full flex flex-col items-center justify-center p-10 text-slate-400 text-center min-h-[380px]">
                            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-4">
                                <Icons.BrainCircuit />
                            </div>
                            <p className="text-sm font-semibold text-slate-700">Siap Menjalankan Proyeksi Stok</p>
                            <p className="text-xs text-slate-400 mt-1">Pilih produk dan periode di sebelah kiri, lalu klik "Jalankan Prediksi".</p>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};

window.PredictionPage = PredictionPage;