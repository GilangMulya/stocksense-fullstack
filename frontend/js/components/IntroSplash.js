const IntroSplash = ({ onFinish }) => {
    const [progress, setProgress] = useState(0);
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(interval);
                    return 100;
                }
                return prev + 2;
            });
        }, 65);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (progress === 100) {
            const timer = setTimeout(() => triggerFinish(), 450);
            return () => clearTimeout(timer);
        }
    }, [progress]);

    const triggerFinish = () => {
        setIsExiting(true);
        setTimeout(() => onFinish(), 620);
    };

    const statusMessage = useMemo(() => {
        if (progress < 30) return "Memuat katalog produk & data inventaris...";
        if (progress < 65) return "Menginisialisasi mesin analitik & prediksi cerdas...";
        if (progress < 92) return "Menyiapkan kalkulasi stok pengaman & titik pemesanan...";
        return "Sistem siap. Membuka ruang kerja StockSense...";
    }, [progress]);

    return (
        <div className={`fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-6 overflow-hidden select-none ${isExiting ? 'splash-exit' : ''}`}>
            <div className="absolute inset-0 cyber-grid opacity-80"></div>
            <div className="absolute w-96 h-96 bg-indigo-600/25 rounded-full blur-3xl -top-20 -left-20 pointer-events-none"></div>
            <div className="absolute w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl -bottom-20 -right-20 pointer-events-none"></div>

            <button 
                onClick={triggerFinish}
                className="absolute top-6 right-6 z-20 px-4 py-1.5 rounded-full text-xs font-medium text-slate-300 border border-slate-700/80 bg-slate-900/60 hover:bg-slate-800 hover:text-white transition-all backdrop-blur-md"
            >
                Lewati Intro →
            </button>

            <div className="relative z-10 flex flex-col items-center max-w-md w-full">
                <div className="relative w-36 h-36 flex items-center justify-center mb-6 animate-float">
                    <div className="absolute inset-0 rounded-full border border-dashed border-indigo-500/40 orbit-cw"></div>
                    <div className="absolute inset-3 rounded-full border border-cyan-400/30 border-t-cyan-400 orbit-ccw"></div>
                    <div className="absolute inset-7 rounded-full bg-indigo-500/10 blur-md"></div>

                    <svg className="w-20 h-20 text-indigo-400 drop-shadow-[0_0_16px_rgba(99,102,241,0.75)]" viewBox="0 0 24 24" fill="none">
                        <path className="cube-draw" stroke="url(#cubeGrad)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                        <path className="cube-draw" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="m3.3 7 8.7 5 8.7-5" />
                        <path className="cube-draw" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M12 22V12" />
                        <defs>
                            <linearGradient id="cubeGrad" x1="0" y1="0" x2="24" y2="24">
                                <stop offset="0%" stopColor="#818cf8" />
                                <stop offset="50%" stopColor="#38bdf8" />
                                <stop offset="100%" stopColor="#34d399" />
                            </linearGradient>
                        </defs>
                    </svg>

                    <span className="absolute -top-1 right-6 w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399] animate-ping"></span>
                </div>

                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-500/30 text-indigo-300 text-[11px] font-mono uppercase tracking-widest mb-3">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Smart Inventory & Forecasting
                </div>

                <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white text-center">
                    Stock<span className="text-shimmer">Sense</span>
                </h1>
                <p className="text-slate-400 text-sm text-center mt-2">
                    Intelligent Inventory & Demand Prediction System
                </p>

                <div className="w-full bg-slate-900/70 border border-slate-800 rounded-xl p-3 mt-6 backdrop-blur-sm">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                        <span>── Riwayat Aktual</span>
                        <span className="text-cyan-400">- - - Proyeksi Permintaan</span>
                    </div>
                    <svg className="w-full h-14 overflow-visible" viewBox="0 0 300 55" fill="none">
                        <path className="wave-draw" d="M 5 42 Q 35 18, 65 35 T 125 22 T 175 30" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
                        <path className="wave-draw" d="M 175 30 Q 205 8, 235 20 T 295 10" stroke="#38bdf8" strokeWidth="3" strokeDasharray="5 5" strokeLinecap="round" />
                        <circle cx="175" cy="30" r="4" fill="#818cf8" />
                        <circle cx="295" cy="10" r="4.5" fill="#34d399" className="animate-ping" />
                        <circle cx="295" cy="10" r="4.5" fill="#34d399" />
                    </svg>
                </div>

                <div className="w-full mt-6 space-y-2">
                    <div className="flex justify-between text-xs font-mono">
                        <span className="text-slate-300 truncate pr-2">{statusMessage}</span>
                        <span className="text-indigo-400 font-bold">{progress}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden p-0.5">
                        <div 
                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 transition-all duration-100"
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

window.IntroSplash = IntroSplash;