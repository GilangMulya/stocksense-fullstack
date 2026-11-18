const DashboardPage = ({ products, currentUser, onGoToRestockPO, onGoToSubscription, onGoToUploadModel }) => {
    const isProUser = (currentUser?.subscription_plan || "FREE").toUpperCase() === "PRO";
    const isMlActive = isProUser && products.some(p => p.isMlActive);

    const totalProducts = products.length;
    const availableStockCount = useMemo(() => products.filter(p => p.stock > 0).length, [products]);
    const outOfStock = useMemo(() => products.filter(p => p.stock <= 0 || p.status === 'HABIS').length, [products]);

    const safeStock = useMemo(() => isMlActive ? products.filter(p => p.status === 'AMAN').length : 0, [products, isMlActive]);
    const lowStock = useMemo(() => isMlActive ? products.filter(p => p.status === 'MENIPIS').length : 0, [products, isMlActive]);

    const totalRestockNeeded = useMemo(() => {
        if (!isMlActive) return 0;
        return products.filter(p => p.status === 'MENIPIS' || p.status === 'HABIS' || (p.aiRecQty && p.aiRecQty > 0)).length;
    }, [products, isMlActive]);

    const salesData = useMemo(() => {
        if (products.length === 0) return [];
        const dateMap = new Map();
        products.forEach(p => {
            (p.history || []).forEach(h => {
                if (!dateMap.has(h.date)) {
                    dateMap.set(h.date, { fullDate: h.date, name: h.displayDate, total: 0 });
                }
                dateMap.get(h.date).total += Number(h.value || 0);
            });
        });
        const sortedDates = Array.from(dateMap.values()).sort(
            (a, b) => new Date(a.fullDate) - new Date(b.fullDate)
        );
        return sortedDates.slice(-7);
    }, [products]);

    const topProducts = useMemo(() => {
        return [...products].map(p => {
            const totalSold = (p.history || []).reduce((sum, h) => sum + Number(h.value || 0), 0);
            return { name: p.name, totalSold };
        }).sort((a, b) => b.totalSold - a.totalSold).slice(0, 5);
    }, [products]);

    const stockStatusData = useMemo(() => {
        return [
            { name: 'Aman', value: safeStock, color: '#10b981' },
            { name: 'Menipis', value: lowStock, color: '#f59e0b' },
            { name: 'Habis', value: outOfStock, color: '#ef4444' }
        ];
    }, [safeStock, lowStock, outOfStock]);

    return (
        <div className="space-y-6 page-enter">
            <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 text-white shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0 mt-0.5">
                        <Icons.LayoutDashboard />
                    </div>
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-300">Ringkasan Operasional</span>
                        <h1 className="text-2xl font-bold tracking-tight mt-0.5">Dashboard Utama</h1>
                        <p className="text-xs text-slate-300 mt-1">
                            {isProUser
                                ? "Ringkasan performa penjualan harian, pemantauan inventaris, dan proyeksi kebutuhan stok."
                                : "Ringkasan performa penjualan harian dan status ketersediaan stok barang."}
                        </p>
                    </div>
                </div>
                {isMlActive && onGoToRestockPO && (
                    <Button onClick={onGoToRestockPO} className="text-xs py-2.5 px-4">
                        <Icons.Truck /> Lihat Daftar Pesanan PO ({totalRestockNeeded} Barang)
                    </Button>
                )}
            </div>

            {isProUser && !isMlActive && products.length > 0 && (
                <Card className="p-4 border-l-4 border-l-amber-500 bg-amber-50/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="text-xs text-amber-900">
                        <strong>Model Prediksi Belum Aktif:</strong> Silakan aktifkan model prediksi di menu Sinkronisasi Data untuk menampilkan analisis stok menipis dan rekomendasi pesanan otomatis.
                    </div>
                    {onGoToUploadModel && (
                        <Button onClick={onGoToUploadModel} className="text-xs py-2 px-3.5 shrink-0">
                            <Icons.UploadCloud /> Konfigurasi Model
                        </Button>
                    )}
                </Card>
            )}

            {isProUser ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="p-4 border-l-4 border-l-indigo-600 card-hover">
                        <div className="flex justify-between items-center">
                            <p className="text-xs text-slate-500 font-semibold">Total Produk Aktif</p>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">Katalog Aktif</span>
                        </div>
                        <h3 className="text-2xl font-bold mt-1.5 text-slate-900">{totalProducts.toLocaleString('id-ID')}</h3>
                    </Card>
                    <Card className="p-4 border-l-4 border-l-amber-500 card-hover">
                        <div className="flex justify-between items-center">
                            <p className="text-xs text-slate-500 font-semibold">Stok Menipis</p>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Perlu Perhatian</span>
                        </div>
                        <h3 className="text-2xl font-bold mt-1.5 text-amber-600">
                            {isMlActive ? lowStock.toLocaleString('id-ID') : "-"}
                        </h3>
                    </Card>
                    <Card className="p-4 border-l-4 border-l-rose-500 card-hover">
                        <div className="flex justify-between items-center">
                            <p className="text-xs text-slate-500 font-semibold">Stok Habis (0 Unit)</p>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">Segera Pesan</span>
                        </div>
                        <h3 className="text-2xl font-bold mt-1.5 text-rose-600">{outOfStock.toLocaleString('id-ID')}</h3>
                    </Card>
                    <Card
                        onClick={isMlActive ? onGoToRestockPO : onGoToUploadModel}
                        className="p-4 border-l-4 border-l-cyan-500 bg-gradient-to-br from-indigo-50/60 to-cyan-50/50 cursor-pointer card-hover"
                    >
                        <p className="text-xs text-indigo-700 font-bold flex items-center justify-between">
                            <span className="flex items-center gap-1.5"><Icons.BrainCircuit /> Rekomendasi Pesanan</span>
                            <span className="text-[11px] underline">{isMlActive ? "Lihat PO →" : "Aktifkan Model →"}</span>
                        </p>
                        {isMlActive ? (
                            <h3 className="text-2xl font-bold mt-1.5 text-indigo-950">
                                {totalRestockNeeded.toLocaleString('id-ID')} <span className="text-xs font-medium text-indigo-700">Produk</span>
                            </h3>
                        ) : (
                            <p className="text-xs font-semibold text-amber-700 mt-2">
                                Menunggu Model Diaktifkan
                            </p>
                        )}
                    </Card>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="p-4 border-l-4 border-l-indigo-600 card-hover">
                        <div className="flex justify-between items-center">
                            <p className="text-xs text-slate-500 font-semibold">Total Produk Aktif</p>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">Katalog Aktif</span>
                        </div>
                        <h3 className="text-2xl font-bold mt-1.5 text-slate-900">{totalProducts.toLocaleString('id-ID')}</h3>
                    </Card>
                    <Card className="p-4 border-l-4 border-l-emerald-500 card-hover">
                        <div className="flex justify-between items-center">
                            <p className="text-xs text-slate-500 font-semibold">Produk Stok Tersedia (&gt; 0 Unit)</p>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Siap Jual</span>
                        </div>
                        <h3 className="text-2xl font-bold mt-1.5 text-emerald-600">{availableStockCount.toLocaleString('id-ID')}</h3>
                    </Card>
                    <Card className="p-4 border-l-4 border-l-rose-500 card-hover">
                        <div className="flex justify-between items-center">
                            <p className="text-xs text-slate-500 font-semibold">Stok Habis (0 Unit)</p>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">Kosong</span>
                        </div>
                        <h3 className="text-2xl font-bold mt-1.5 text-rose-600">{outOfStock.toLocaleString('id-ID')}</h3>
                    </Card>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="p-5 lg:col-span-2">
                    <h3 className="text-base font-bold mb-4 text-slate-800">Volume Terjual 7 Hari Terakhir</h3>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={salesData}>
                                <defs>
                                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.75}/>
                                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis dataKey="name" tick={{fontSize: 12, fill: '#6b7280'}} />
                                <YAxis tick={{fontSize: 12, fill: '#6b7280'}} />
                                <Tooltip formatter={(value) => [`${value} Unit`, 'Terjual']} cursor={{ stroke: '#4f46e5', strokeWidth: 1, strokeDasharray: '4 4' }} />
                                <Area type="monotone" dataKey="total" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                <Card className="p-5">
                    <h3 className="text-base font-bold mb-4 text-slate-800">Top 5 Produk Terlaris</h3>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topProducts} layout="vertical" margin={{ top: 0, right: 0, left: 20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                                <XAxis type="number" tick={{fontSize: 12, fill: '#6b7280'}} />
                                <YAxis dataKey="name" type="category" tick={{fontSize: 11, fill: '#374151'}} width={100} />
                                <Tooltip cursor={{fill: '#f3f4f6'}} />
                                <Bar dataKey="totalSold" fill="#4f46e5" radius={[0, 6, 6, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {isMlActive && (
                    <>
                        <Card className="p-5">
                            <h3 className="text-base font-bold mb-4 text-slate-800">Distribusi Kondisi Stok</h3>
                            <div className="h-64 w-full flex items-center justify-center">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={stockStatusData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                            {stockStatusData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend verticalAlign="bottom" height={36}/>
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>

                        <Card className="p-5 lg:col-span-2">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                    <Icons.AlertTriangle className="text-amber-500" /> Daftar Peringatan Stok Menipis & Habis
                                </h3>
                                {onGoToRestockPO && (
                                    <button onClick={onGoToRestockPO} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
                                        Kelola Semua di Halaman PO &rarr;
                                    </button>
                                )}
                            </div>
                            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-2">
                                {products.filter(p => p.status === 'MENIPIS' || p.status === 'HABIS').slice(0, 50).map(p => (
                                    <div key={p.id} className="flex justify-between items-center p-3 bg-slate-50/70 hover:bg-indigo-50/30 rounded-xl border border-slate-200/80 transition-colors">
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-slate-800 text-sm">{p.name}</span>
                                            <span className="text-xs text-slate-500">
                                                Kode: <strong className="text-indigo-600 font-mono">{p.code}</strong> | Sisa: <strong className="text-rose-600">{p.stock}</strong> | Batas Min: <strong>{p.minStock}</strong> | Proyeksi 7H: <strong>{p.predicted7d} unit</strong> | Rekomendasi PO: <strong className="text-indigo-700">+{p.aiRecQty} unit</strong>
                                            </span>
                                        </div>
                                        <StatusBadge status={p.status} />
                                    </div>
                                ))}
                                {products.filter(p => p.status === 'MENIPIS' || p.status === 'HABIS').length === 0 && (
                                    <div className="text-center py-6 text-emerald-700 bg-emerald-50/60 rounded-xl text-xs font-semibold">
                                        Semua stok produk berada di atas batas stok minimum (Kondisi Aman).
                                    </div>
                                )}
                            </div>
                        </Card>
                    </>
                )}
            </div>
        </div>
    );
};

window.DashboardPage = DashboardPage;