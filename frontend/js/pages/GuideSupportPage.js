const GuideSupportPage = () => {
    const [activeStep, setActiveStep] = useState(1);
    const [issueCategory, setIssueCategory] = useState("Kendala Teknis / Bug");
    const [issueText, setIssueText] = useState("");

    const steps = [
        {
            no: 1,
            title: "Manajemen Katalog & Stock Opname",
            desc: "Kelola data produk, sesuaikan stok fisik gudang (Stock Opname), dan pantau batas stok minimum yang dihitung secara otomatis melalui Prediksi Otomatis.",
            badge: "Inventaris",
            color: "from-indigo-600 to-violet-600",
            lightBg: "bg-indigo-50 text-indigo-700 border-indigo-200"
        },
        {
            no: 2,
            title: "Transaksi Kasir & Pemindai Barcode",
            desc: "Halaman Input Penjualan mendukung alat pemindai barcode secara langsung. Pindai kode produk untuk menginput barang otomatis dan cetak struk 58mm.",
            badge: "Kasir POS",
            color: "from-emerald-600 to-teal-600",
            lightBg: "bg-emerald-50 text-emerald-700 border-emerald-200"
        },
        {
            no: 3,
            title: "Sinkronisasi Data & Model Prediksi",
            desc: "Impor dataset toko dengan 3 metode: Katalog Penuh, 100 Produk Terlaris, atau Sinkronisasi Transaksi Terbaru (Delta Sync) ke penyimpanan awan.",
            badge: "Sinkronisasi",
            color: "from-cyan-600 to-blue-600",
            lightBg: "bg-cyan-50 text-cyan-700 border-cyan-200"
        },
        {
            no: 4,
            title: "Proyeksi Permintaan & PO Supplier",
            desc: "Gunakan menu Prediksi Permintaan untuk memproyeksikan kebutuhan stok 7, 14, hingga 30 hari ke depan dan kirim Surat Pesanan (PO) ke WhatsApp supplier.",
            badge: "Analitik Cerdas",
            color: "from-violet-600 to-purple-600",
            lightBg: "bg-violet-50 text-violet-700 border-violet-200"
        },
        {
            no: 5,
            title: "Audit Riwayat & Pembatalan Transaksi",
            desc: "Kelola riwayat operasional, ekspor laporan dalam format standar tiga tabel (Penjualan, Barang Keluar, Produk), atau batalkan transaksi (Void) untuk mengembalikan stok.",
            badge: "Audit Data",
            color: "from-amber-500 to-orange-600",
            lightBg: "bg-amber-50 text-amber-800 border-amber-200"
        }
    ];

    const openDirectWhatsApp = (customMsg = "") => {
        const cleanMsg = customMsg.trim()
            ? `[${issueCategory}] ${customMsg.trim()}`
            : "Halo Tim Dukungan StockSense, saya membutuhkan bantuan terkait penggunaan aplikasi.";
        window.open(`https://wa.me/6285216793813?text=${encodeURIComponent(cleanMsg)}`, "_blank");
    };

    const currentStepObj = steps.find(s => s.no === activeStep) || steps[0];

    return (
        <div className="space-y-6 pb-16 page-enter">
            <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950 via-slate-900 to-emerald-950 text-white shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="space-y-1.5 max-w-2xl">
                    <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                        Pusat Panduan & Bantuan Pelanggan
                    </span>
                    <h1 className="text-2xl font-bold tracking-tight pt-1">Panduan Penggunaan & Layanan Bantuan</h1>
                    <p className="text-xs text-slate-300 leading-relaxed">
                        Pelajari alur kerja operasional StockSense melalui kartu panduan interaktif di bawah ini atau hubungi tim dukungan kami melalui WhatsApp.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => openDirectWhatsApp()}
                    className="wa-pulse-btn flex items-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-xs shadow-md transition-all shrink-0"
                >
                    <Icons.WhatsApp /> Hubungi Tim Dukungan (WhatsApp)
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {steps.map(st => {
                    const isActive = activeStep === st.no;
                    return (
                        <div
                            key={st.no}
                            onClick={() => setActiveStep(st.no)}
                            className={`guide-step-card p-4 rounded-2xl border cursor-pointer ${
                                isActive
                                    ? `bg-gradient-to-br ${st.color} text-white border-transparent shadow-md`
                                    : 'bg-white text-slate-800 border-slate-200/80 hover:border-indigo-300'
                            }`}
                        >
                            <div className="flex justify-between items-center mb-3">
                                <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs ${
                                    isActive ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-700'
                                }`}>
                                    {st.no}
                                </span>
                                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                                    isActive ? 'bg-white/20 text-white border-white/20' : st.lightBg
                                }`}>
                                    {st.badge}
                                </span>
                            </div>
                            <h3 className="font-bold text-xs mb-1.5">{st.title}</h3>
                            <p className={`text-xs leading-relaxed ${isActive ? 'text-white/90' : 'text-slate-500'}`}>{st.desc}</p>
                        </div>
                    );
                })}
            </div>

            <Card className="p-5 border-l-4 border-l-indigo-600 bg-gradient-to-r from-indigo-50/40 via-white to-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                        Tahap {currentStepObj.no} • {currentStepObj.badge}
                    </span>
                    <h3 className="text-base font-bold text-slate-900">{currentStepObj.title}</h3>
                    <p className="text-xs text-slate-600">{currentStepObj.desc}</p>
                </div>
                <span className="text-xs font-semibold text-indigo-600 shrink-0">
                    Pilih kartu 1–5 di atas untuk melihat detail panduan
                </span>
            </Card>

            <Card className="p-6 border-slate-200/80 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
                    <div>
                        <h3 className="text-base font-bold text-slate-900">Kirim Tiket Bantuan / Laporan Kendala</h3>
                        <p className="text-xs text-slate-500">Pilih kategori kendala dan tuliskan detail pesan Anda untuk diteruskan langsung ke tim dukungan teknis.</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {["Kendala Teknis / Bug", "Bantuan Sinkronisasi Data", "Aktivasi Paket PRO", "Saran Fitur"].map(cat => (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => setIssueCategory(cat)}
                                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                                    issueCategory === cat
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                    <input
                        type="text"
                        value={issueText}
                        onChange={(e) => setIssueText(e.target.value)}
                        placeholder={`Tuliskan detail ${issueCategory.toLowerCase()} yang Anda alami...`}
                        className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 bg-slate-50/50 focus:bg-white"
                    />
                    <Button
                        onClick={() => openDirectWhatsApp(issueText)}
                        variant="success"
                        className="py-2.5 px-6 text-xs shrink-0"
                    >
                        <Icons.WhatsApp /> Kirim Pesan via WhatsApp
                    </Button>
                </div>
            </Card>
        </div>
    );
};

window.GuideSupportPage = GuideSupportPage;