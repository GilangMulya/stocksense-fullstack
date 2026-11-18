class PageErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, errorMsg: "" };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, errorMsg: error ? String(error.message || error) : "Unknown Render Error" };
    }
    componentDidUpdate(prevProps) {
        if (prevProps.pageKey !== this.props.pageKey && this.state.hasError) {
            this.setState({ hasError: false, errorMsg: "" });
        }
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 rounded-2xl bg-white border-2 border-rose-200 shadow-sm max-w-2xl mx-auto my-8 space-y-4">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
                        Deteksi Kendala Komponen Halaman
                    </span>
                    <h2 className="text-lg font-bold text-slate-900">Halaman Gagal Dimuat</h2>
                    <p className="text-xs text-slate-600 font-mono bg-slate-50 p-3 rounded-xl border border-slate-200">
                        {this.state.errorMsg}
                    </p>
                    <button
                        type="button"
                        onClick={() => window.location.reload(true)}
                        className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                    >
                        Muat Ulang Halaman
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

const App = () => {
    const [showIntro, setShowIntro] = useState(true);
    const [currentUser, setCurrentUser] = useState(() => {
        try {
            const saved = localStorage.getItem("stocksense_user");
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    });
    const [isRegisterMode, setIsRegisterMode] = useState(false);
    const [authForm, setAuthForm] = useState({
        email: '',
        password: '',
        full_name: '',
        store_name: ''
    });
    const [authError, setAuthError] = useState('');
    const [isAuthLoading, setIsAuthLoading] = useState(false);

    const [currentPage, setCurrentPage] = useState('dashboard');
    const [isHistoryDropdownOpen, setIsHistoryDropdownOpen] = useState(false);
    const [historyCategory, setHistoryCategory] = useState('SALES');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [profileForm, setProfileForm] = useState({
        full_name: '',
        store_name: '',
        role: 'Owner',
        store_address: '',
        store_phone: '',
        receipt_footer: '',
        avatar_base64: null
    });
    const [isSavingProfile, setIsSavingProfile] = useState(false);

    const [products, setProducts] = useState([]);
    const [historyLogs, setHistoryLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    const isAuthenticated = Boolean(currentUser);

    const handleUserUpdated = useCallback((updatedUser) => {
        setCurrentUser(updatedUser);
        localStorage.setItem("stocksense_user", JSON.stringify(updatedUser));
    }, []);

    const handleLogout = useCallback(() => {
        localStorage.removeItem("stocksense_token");
        localStorage.removeItem("stocksense_user");
        setCurrentUser(null);
        setProducts([]);
        setHistoryLogs([]);
        setIsAccountMenuOpen(false);
        setIsProfileModalOpen(false);
    }, []);

    const fetchProducts = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await authFetch(`${API_BASE_URL}/products`);
            if (response.status === 401) {
                handleLogout();
                return;
            }
            if (response.ok) {
                const data = await response.json();
                setProducts(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error("Gagal memuat produk:", error);
        } finally {
            setIsLoading(false);
        }
    }, [handleLogout]);

    const fetchHistory = useCallback(async () => {
        try {
            setIsLoadingHistory(true);
            const response = await authFetch(`${API_BASE_URL}/history`);
            if (response.status === 401) {
                handleLogout();
                return;
            }
            if (response.ok) {
                const data = await response.json();
                setHistoryLogs(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error("Gagal memuat riwayat:", error);
        } finally {
            setIsLoadingHistory(false);
        }
    }, [handleLogout]);

    const refreshAllCloudData = useCallback(async () => {
        await Promise.all([fetchProducts(), fetchHistory()]);
    }, [fetchProducts, fetchHistory]);

    useEffect(() => {
        if (isAuthenticated) {
            refreshAllCloudData();
        }
    }, [isAuthenticated, currentUser?.subscription_plan, refreshAllCloudData]);

    const handleAuthSubmit = async (e) => {
        e.preventDefault();
        setAuthError('');
        setIsAuthLoading(true);

        const endpoint = isRegisterMode ? '/auth/register' : '/auth/login';
        try {
            const res = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(authForm)
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || "Gagal melakukan autentikasi.");
            }

            localStorage.setItem("stocksense_token", data.token);
            handleUserUpdated(data.user);
            setCurrentPage('dashboard');
        } catch (err) {
            setAuthError(err.message);
        } finally {
            setIsAuthLoading(false);
        }
    };

    const openEditProfileModal = () => {
        setProfileForm({
            full_name: currentUser?.full_name || '',
            store_name: currentUser?.store_name || '',
            role: currentUser?.role || 'Owner',
            store_address: currentUser?.store_address || '',
            store_phone: currentUser?.store_phone || '',
            receipt_footer: currentUser?.receipt_footer || 'Terima kasih telah berbelanja di toko kami.',
            avatar_base64: currentUser?.avatar_base64 || null
        });
        setIsAccountMenuOpen(false);
        setIsProfileModalOpen(true);
    };

    const handleAvatarChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const base64Str = await fileToBase64Max200KB(file);
            setProfileForm(prev => ({ ...prev, avatar_base64: base64Str }));
        } catch (err) {
            alert(err.message || "Gagal memproses foto profil.");
        }
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        setIsSavingProfile(true);
        try {
            const res = await authFetch(`${API_BASE_URL}/auth/profile`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profileForm)
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || "Gagal memperbarui profil.");
            }
            handleUserUpdated(data.user);
            setIsProfileModalOpen(false);
        } catch (err) {
            alert(err.message);
        } finally {
            setIsSavingProfile(false);
        }
    };

    if (showIntro) {
        return <IntroSplash onFinish={() => setShowIntro(false)} />;
    }

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
                <Card className="w-full max-w-md p-8 space-y-6 login-enter">
                    <div className="text-center">
                        <div className="flex justify-center mb-4 text-primary"><Icons.Box /></div>
                        <h1 className="text-2xl font-bold text-gray-900">StockSense</h1>
                        <p className="text-gray-500 text-sm mt-1">
                            {isRegisterMode ? "Daftarkan akun untuk mulai mengelola operasional toko Anda" : "Masuk ke akun Anda untuk mengelola kasir dan inventaris"}
                        </p>
                    </div>

                    {authError && (
                        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-medium">
                            {authError}
                        </div>
                    )}

                    <form className="space-y-4" onSubmit={handleAuthSubmit}>
                        {isRegisterMode && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap Owner *</label>
                                    <input
                                        type="text"
                                        required
                                        value={authForm.full_name}
                                        onChange={(e) => setAuthForm({...authForm, full_name: e.target.value})}
                                        placeholder="Masukkan nama lengkap..."
                                        className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nama Toko / Usaha *</label>
                                    <input
                                        type="text"
                                        required
                                        value={authForm.store_name}
                                        onChange={(e) => setAuthForm({...authForm, store_name: e.target.value})}
                                        placeholder="Masukkan nama toko..."
                                        className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>
                            </>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email Akun *</label>
                            <input
                                type="email"
                                required
                                value={authForm.email}
                                onChange={(e) => setAuthForm({...authForm, email: e.target.value})}
                                placeholder="nama@email.com"
                                className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                            <input
                                type="password"
                                required
                                value={authForm.password}
                                onChange={(e) => setAuthForm({...authForm, password: e.target.value})}
                                placeholder="Masukkan password..."
                                className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                        <Button className="w-full py-2.5 mt-2" type="submit" disabled={isAuthLoading}>
                            {isAuthLoading ? "Memverifikasi Akun..." : (isRegisterMode ? "Daftar & Buat Akun Toko" : "Masuk ke Dashboard")}
                        </Button>
                    </form>

                    <div className="flex flex-col items-center gap-2 pt-3 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => {
                                setIsRegisterMode(!isRegisterMode);
                                setAuthError('');
                                setAuthForm({ email: '', password: '', full_name: '', store_name: '' });
                            }}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                        >
                            {isRegisterMode ? "Sudah punya akun? Masuk di sini" : "Belum punya akun toko? Daftar Sekarang"}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowIntro(true)}
                            className="text-xs text-gray-400 hover:text-indigo-600 underline mt-1"
                        >
                            Putar Ulang Animasi Pembuka
                        </button>
                    </div>
                </Card>
            </div>
        );
    }

    const userPlan = (currentUser?.subscription_plan || "FREE").toUpperCase();
    const isProUser = userPlan === "PRO";

    const topNavItems = [
        { id: 'dashboard', label: 'Dashboard', icon: Icons.LayoutDashboard },
        { id: 'products', label: 'Manajemen Produk', icon: Icons.Box },
        { id: 'sales-entry', label: 'Input Penjualan', icon: Icons.ClipboardEdit },
        ...(isProUser ? [
            { id: 'predict', label: 'Prediksi Permintaan', icon: Icons.BrainCircuit },
            { id: 'restock-po', label: 'Pesanan Pembelian (PO)', icon: Icons.Truck }
        ] : []),
    ];

    const historySubItems = [
        { id: 'SALES', label: 'Riwayat Input Penjualan', count: historyLogs.filter(l => l.log_type === 'SALES').length },
        ...(isProUser ? [{ id: 'PREDICTION', label: 'Riwayat Prediksi', count: historyLogs.filter(l => l.log_type === 'PREDICTION').length }] : []),
        { id: 'PRODUCT', label: 'Riwayat Manajemen Produk', count: historyLogs.filter(l => l.log_type === 'PRODUCT').length },
        { id: 'ALL', label: 'Basis Data Lengkap', count: historyLogs.length },
    ];

    const bottomNavItems = [
        { id: 'upload-center', label: 'Sinkronisasi Data', icon: Icons.UploadCloud },
        { id: 'guide-support', label: 'Panduan & Bantuan', icon: Icons.BookOpen },
        { id: 'subscription', label: 'Paket Langganan', icon: Icons.Crown },
        { id: 'settings', label: 'Pengaturan', icon: Icons.Settings },
    ];

    const selectHistorySubMenu = (subType) => {
        setHistoryCategory(subType);
        setCurrentPage('history');
        setIsHistoryDropdownOpen(true);
    };

    const renderPage = () => {
        if (isLoading && products.length === 0) {
            return (
                <Card className="p-12 flex flex-col items-center justify-center text-gray-500 gap-3">
                    <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-sm font-medium">Memuat data operasional {currentUser.store_name}...</p>
                </Card>
            );
        }

        switch (currentPage) {
            case 'dashboard':
                return (
                    <DashboardPage
                        products={products}
                        currentUser={currentUser}
                        onGoToRestockPO={() => setCurrentPage('restock-po')}
                        onGoToSubscription={() => setCurrentPage('subscription')}
                        onGoToUploadModel={() => setCurrentPage('upload-center')}
                    />
                );
            case 'products':
                return (
                    <ProductsPage
                        products={products}
                        currentUser={currentUser}
                        onRefreshData={refreshAllCloudData}
                        onGoToUploadModel={() => setCurrentPage('upload-center')}
                    />
                );
            case 'sales-entry':
                return (
                    <SalesEntryPage
                        products={products}
                        currentUser={currentUser}
                        onRefreshData={refreshAllCloudData}
                        onGoToHistory={() => selectHistorySubMenu('SALES')}
                        onGoToUploadDelta={() => setCurrentPage('upload-center')}
                    />
                );
            case 'predict':
                return (
                    <PredictionPage
                        products={products}
                        currentUser={currentUser}
                        onRefreshHistory={refreshAllCloudData}
                        onGoToSubscription={() => setCurrentPage('subscription')}
                        onGoToUploadModel={() => setCurrentPage('upload-center')}
                    />
                );
            case 'restock-po':
                return (
                    <RestockPOPage
                        products={products}
                        currentUser={currentUser}
                        onRefreshData={refreshAllCloudData}
                        onGoToSubscription={() => setCurrentPage('subscription')}
                        onGoToUploadModel={() => setCurrentPage('upload-center')}
                    />
                );
            case 'history':
                return (
                    <HistoryPage
                        historyLogs={historyLogs}
                        currentUser={currentUser}
                        selectedType={historyCategory}
                        setSelectedType={setHistoryCategory}
                        isLoadingHistory={isLoadingHistory}
                        onRefreshHistory={fetchHistory}
                        onRefreshData={refreshAllCloudData}
                    />
                );
            case 'upload-center':
                return (
                    <UploadCenterPage
                        currentUser={currentUser}
                        onRefreshData={refreshAllCloudData}
                        onGoToSubscription={() => setCurrentPage('subscription')}
                    />
                );
            case 'guide-support':
                return <GuideSupportPage />;
            case 'subscription':
                return <SubscriptionPage currentUser={currentUser} onUserUpdated={handleUserUpdated} />;
            case 'settings':
                return <SettingsPage currentUser={currentUser} onUserUpdated={handleUserUpdated} />;
            default:
                return (
                    <DashboardPage
                        products={products}
                        currentUser={currentUser}
                        onGoToRestockPO={() => setCurrentPage('restock-po')}
                        onGoToSubscription={() => setCurrentPage('subscription')}
                        onGoToUploadModel={() => setCurrentPage('upload-center')}
                    />
                );
        }
    };

    return (
        <ToastProvider>
            <div className="flex h-screen bg-background overflow-hidden">
                <aside className="bg-slate-900 text-white w-64 flex-shrink-0 hidden md:flex flex-col">
                    <div className="p-5 flex items-center justify-between border-b border-slate-800">
                        <div className="flex items-center gap-3">
                            <div className="text-indigo-400"><Icons.Box /></div>
                            <div>
                                <span className="text-lg font-bold tracking-wide block leading-none">StockSense</span>
                                <span className="text-[11px] text-indigo-400 font-mono truncate block max-w-[130px]">{currentUser.store_name}</span>
                            </div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${userPlan === 'PRO' ? 'bg-amber-400 text-slate-950' : 'bg-slate-700 text-slate-200'}`}>
                            {userPlan}
                        </span>
                    </div>

                    <nav className="flex-1 px-3 space-y-1 mt-3 overflow-y-auto">
                        {topNavItems.map(item => {
                            const Icon = item.icon;
                            const isActive = currentPage === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => setCurrentPage(item.id)}
                                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-colors text-xs font-medium ${isActive ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                                >
                                    <span className="flex items-center gap-3"><Icon /> {item.label}</span>
                                </button>
                            );
                        })}

                        <div>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsHistoryDropdownOpen(prev => !prev);
                                    if (currentPage !== 'history') setCurrentPage('history');
                                }}
                                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-colors text-xs font-medium ${currentPage === 'history' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                            >
                                <span className="flex items-center gap-3"><Icons.History /> Riwayat Data</span>
                                <Icons.ChevronDown className={`transition-transform duration-200 ${isHistoryDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isHistoryDropdownOpen && (
                                <div className="mt-1 ml-4 pl-3 border-l-2 border-slate-700 space-y-1">
                                    {historySubItems.map(sub => {
                                        const isSubActive = currentPage === 'history' && historyCategory === sub.id;
                                        return (
                                            <button
                                                key={sub.id}
                                                type="button"
                                                onClick={() => selectHistorySubMenu(sub.id)}
                                                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-left ${isSubActive ? 'bg-indigo-500/25 text-indigo-300 font-semibold' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                                            >
                                                <span className="truncate pr-1">{sub.label}</span>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">{sub.count}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="pt-2 mt-2 border-t border-slate-800 space-y-1">
                            {bottomNavItems.map(item => {
                                const Icon = item.icon;
                                const isActive = currentPage === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => setCurrentPage(item.id)}
                                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-colors text-xs font-medium ${isActive ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                                    >
                                        <span className="flex items-center gap-3"><Icon /> {item.label}</span>
                                        {item.id === 'subscription' && (
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${userPlan === 'PRO' ? 'bg-amber-400 text-slate-950' : 'bg-slate-700 text-slate-300'}`}>
                                                {userPlan}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </nav>

                    <div className="p-3 border-t border-slate-800">
                        <button onClick={handleLogout} className="flex items-center gap-3 px-3.5 py-2.5 w-full text-slate-400 hover:text-white transition-colors text-xs">
                            <Icons.LogOut /> Keluar ({currentUser.full_name.split(' ')[0]})
                        </button>
                    </div>
                </aside>

                <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                    <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-4 sm:px-6 z-20 shadow-sm">
                        <div className="flex items-center gap-3 md:hidden">
                            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-gray-500"><Icons.Menu /></button>
                            <span className="font-bold text-gray-800">StockSense</span>
                        </div>
                        <div className="hidden md:flex items-center gap-2 font-medium text-gray-600 text-sm">
                            <span>Toko Aktif:</span>
                            <span className="text-indigo-600 font-bold">{currentUser.store_name}</span>
                            <span className={`ml-2 px-2.5 py-0.5 rounded-full text-xs font-bold ${userPlan === 'PRO' ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-gray-100 text-gray-700'}`}>
                                Paket {userPlan}
                            </span>
                        </div>

                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsAccountMenuOpen(prev => !prev)}
                                className="flex items-center gap-3 p-1.5 pr-3 rounded-full hover:bg-gray-100 border border-gray-200 transition-colors"
                            >
                                {currentUser.avatar_base64 ? (
                                    <img src={currentUser.avatar_base64} alt="Avatar" className="w-9 h-9 rounded-full object-cover border border-indigo-300" />
                                ) : (
                                    <div className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs uppercase">
                                        {(currentUser.full_name || "AD").slice(0, 2)}
                                    </div>
                                )}
                                <div className="hidden sm:block text-left">
                                    <div className="flex items-center gap-1.5">
                                        <p className="font-bold text-gray-800 text-xs leading-none">{currentUser.full_name}</p>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-extrabold ${userPlan === 'PRO' ? 'bg-amber-400 text-slate-950' : 'bg-gray-200 text-gray-700'}`}>
                                            {userPlan}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-500 mt-0.5">{currentUser.role || 'Owner'} • {currentUser.email}</p>
                                </div>
                                <Icons.ChevronDown />
                            </button>

                            {isAccountMenuOpen && (
                                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-200 py-2 z-50 text-sm">
                                    <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
                                        {currentUser.avatar_base64 ? (
                                            <img src={currentUser.avatar_base64} alt="Avatar" className="w-11 h-11 rounded-full object-cover border border-indigo-300" />
                                        ) : (
                                            <div className="w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm uppercase">
                                                {(currentUser.full_name || "AD").slice(0, 2)}
                                            </div>
                                        )}
                                        <div className="overflow-hidden">
                                            <p className="font-bold text-gray-900 truncate">{currentUser.full_name}</p>
                                            <p className="text-xs text-gray-500 truncate">{currentUser.email}</p>
                                            <span className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${userPlan === 'PRO' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-50 text-indigo-700'}`}>
                                                <Icons.Crown /> Paket {userPlan}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="py-1">
                                        <button
                                            type="button"
                                            onClick={openEditProfileModal}
                                            className="w-full px-4 py-2.5 text-left text-xs font-medium text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2.5"
                                        >
                                            <Icons.User /> Edit Profil & Identitas Toko
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setCurrentPage('subscription'); setIsAccountMenuOpen(false); }}
                                            className="w-full px-4 py-2.5 text-left text-xs font-medium text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2.5"
                                        >
                                            <Icons.Crown /> Kelola Langganan ({userPlan})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setCurrentPage('settings'); setIsAccountMenuOpen(false); }}
                                            className="w-full px-4 py-2.5 text-left text-xs font-medium text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2.5"
                                        >
                                            <Icons.Settings /> Pengaturan Sistem
                                        </button>
                                    </div>

                                    <div className="border-t border-gray-100 pt-1">
                                        <button
                                            type="button"
                                            onClick={handleLogout}
                                            className="w-full px-4 py-2.5 text-left text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2.5"
                                        >
                                            <Icons.LogOut /> Keluar dari Akun
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </header>

                    {isProfileModalOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                            <Card className="w-full max-w-lg bg-white p-6 max-h-[90vh] overflow-y-auto">
                                <div className="flex justify-between items-center mb-4">
                                    <div>
                                        <h2 className="text-lg font-bold text-gray-900">Edit Profil & Identitas Toko</h2>
                                        <p className="text-xs text-gray-500">Perbarui informasi pemilik, identitas toko, dan foto profil Anda.</p>
                                    </div>
                                    <button type="button" onClick={() => setIsProfileModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                        <Icons.X />
                                    </button>
                                </div>

                                <form onSubmit={handleSaveProfile} className="space-y-4">
                                    <div className="flex items-center gap-4 p-3 rounded-xl bg-indigo-50/60 border border-indigo-100">
                                        {profileForm.avatar_base64 ? (
                                            <img src={profileForm.avatar_base64} alt="Preview" className="w-16 h-16 rounded-full object-cover border-2 border-indigo-500 shrink-0" />
                                        ) : (
                                            <div className="w-16 h-16 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-lg uppercase shrink-0">
                                                {(profileForm.full_name || "AD").slice(0, 2)}
                                            </div>
                                        )}
                                        <div className="space-y-1.5 flex-1">
                                            <label className="block text-xs font-bold text-indigo-950">Unggah Foto Profil (Format JPG/PNG)</label>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleAvatarChange}
                                                className="text-xs text-gray-600 w-full"
                                            />
                                            {profileForm.avatar_base64 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setProfileForm(prev => ({ ...prev, avatar_base64: "" }))}
                                                    className="text-[11px] text-red-600 hover:underline font-semibold"
                                                >
                                                    Hapus Foto Profil
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Nama Lengkap *</label>
                                            <input
                                                type="text"
                                                required
                                                value={profileForm.full_name}
                                                onChange={(e) => setProfileForm({...profileForm, full_name: e.target.value})}
                                                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Jabatan / Role</label>
                                            <input
                                                type="text"
                                                value={profileForm.role}
                                                onChange={(e) => setProfileForm({...profileForm, role: e.target.value})}
                                                placeholder="Owner / Kasir / Admin"
                                                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Nama Toko *</label>
                                            <input
                                                type="text"
                                                required
                                                value={profileForm.store_name}
                                                onChange={(e) => setProfileForm({...profileForm, store_name: e.target.value})}
                                                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">No. WA / Telepon Toko</label>
                                            <input
                                                type="text"
                                                value={profileForm.store_phone}
                                                onChange={(e) => setProfileForm({...profileForm, store_phone: e.target.value})}
                                                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm font-mono"
                                            />
                                        </div>
                                        <div className="sm:col-span-2">
                                            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Alamat Toko</label>
                                            <input
                                                type="text"
                                                value={profileForm.store_address}
                                                onChange={(e) => setProfileForm({...profileForm, store_address: e.target.value})}
                                                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                                        <Button type="button" variant="outline" onClick={() => setIsProfileModalOpen(false)}>Batal</Button>
                                        <Button type="submit" disabled={isSavingProfile}>
                                            {isSavingProfile ? "Menyimpan..." : "Simpan Perubahan"}
                                        </Button>
                                    </div>
                                </form>
                            </Card>
                        </div>
                    )}

                    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8" onClick={() => isAccountMenuOpen && setIsAccountMenuOpen(false)}>
                        <div className="max-w-7xl mx-auto">
                            <PageErrorBoundary pageKey={currentPage}>
                                {renderPage()}
                            </PageErrorBoundary>
                        </div>
                    </main>
                </div>
            </div>
        </ToastProvider>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);