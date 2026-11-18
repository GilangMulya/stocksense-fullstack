const SubscriptionPage = ({ currentUser, onUserUpdated }) => {
    const { addToast } = React.useContext(ToastContext);
    const [isUpdating, setIsUpdating] = useState(false);
    const [subData, setSubData] = useState({
        price_per_month: 58000,
        is_db_owner: false,
        accounts: [],
        subscriptions_log: []
    });
    const [isLoadingSubData, setIsLoadingSubData] = useState(false);

    const [isQRISModalOpen, setIsQRISModalOpen] = useState(false);
    const [monthsToPay, setMonthsToPay] = useState(1);
    const [isPayingQRIS, setIsPayingQRIS] = useState(false);

    const [editingEmail, setEditingEmail] = useState(null);
    const [manualPlan, setManualPlan] = useState("PRO");
    const [manualExpiresAt, setManualExpiresAt] = useState("");
    const [isSavingManual, setIsSavingManual] = useState(false);

    const currentPlan = (currentUser?.subscription_plan || "FREE").toUpperCase();
    const currentExpires = currentUser?.pro_expires_at || "";

    const fetchSubscriptionsDataset = useCallback(async () => {
        setIsLoadingSubData(true);
        try {
            const res = await authFetch(`${API_BASE_URL}/auth/subscriptions-data`);
            if (res.ok) {
                const data = await res.json();
                setSubData(data);
            }
        } catch (err) {
            console.error("Gagal memuat informasi langganan:", err);
        } finally {
            setIsLoadingSubData(false);
        }
    }, []);

    useEffect(() => {
        fetchSubscriptionsDataset();
    }, [fetchSubscriptionsDataset]);

    const handleDowngradeFree = async () => {
        if (currentPlan === "FREE") return;
        if (!window.confirm("Ubah status langganan akun Anda kembali ke paket FREE?")) return;
        setIsUpdating(true);
        try {
            const res = await authFetch(`${API_BASE_URL}/auth/subscription`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan: "FREE" })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Gagal mengubah paket langganan.");
            onUserUpdated(data.user);
            await fetchSubscriptionsDataset();
            addToast(data.message, "success");
        } catch (err) {
            addToast(err.message, "error");
        } finally {
            setIsUpdating(false);
        }
    };

    const handleConfirmQRISPayment = async () => {
        setIsPayingQRIS(true);
        try {
            const res = await authFetch(`${API_BASE_URL}/auth/subscription/pay-qris`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    months: Number(monthsToPay) || 1,
                    payment_reference: `QRIS-${Date.now()}`
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Gagal memverifikasi pembayaran QRIS.");
            onUserUpdated(data.user);
            setIsQRISModalOpen(false);
            await fetchSubscriptionsDataset();
            addToast(data.message, "success");
        } catch (err) {
            addToast(err.message, "error");
        } finally {
            setIsPayingQRIS(false);
        }
    };

    const openManualEditAccount = (acc) => {
        setEditingEmail(acc.email);
        setManualPlan(acc.subscription_plan || "PRO");
        const defaultDate = acc.pro_expires_at
            ? acc.pro_expires_at.slice(0, 10)
            : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        setManualExpiresAt(defaultDate);
    };

    const handleSaveManualSubscription = async (e) => {
        e.preventDefault();
        if (!editingEmail) return;
        setIsSavingManual(true);
        try {
            const res = await authFetch(`${API_BASE_URL}/auth/admin/set-subscription`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    target_email: editingEmail,
                    plan: manualPlan,
                    pro_expires_at: manualPlan === "PRO" ? manualExpiresAt : ""
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Gagal menyimpan perubahan langganan.");
            if (editingEmail.toLowerCase() === currentUser.email.toLowerCase() && data.updated_account) {
                onUserUpdated(data.updated_account);
            }
            setEditingEmail(null);
            await fetchSubscriptionsDataset();
            addToast(data.message, "success");
        } catch (err) {
            addToast(err.message, "error");
        } finally {
            setIsSavingManual(false);
        }
    };

    const totalQRISNominal = (Number(monthsToPay) || 1) * 58000;

    return (
        <div className="space-y-8 max-w-6xl mx-auto page-enter">
            <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950 via-violet-950 to-slate-900 text-white shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-amber-400/20 border border-amber-300/30 flex items-center justify-center text-amber-300 shrink-0 mt-0.5">
                        <Icons.Crown />
                    </div>
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-widest text-amber-300">Manajemen Langganan</span>
                        <h1 className="text-2xl font-bold tracking-tight mt-0.5">Paket Langganan & Layanan PRO</h1>
                        <p className="text-xs text-slate-300 mt-1">
                            Nikmati fitur operasional kasir dan inventaris gratis selamanya, atau aktifkan fitur analitik prediktif PRO seharga Rp 58.000 / bulan.
                        </p>
                    </div>
                </div>
                <div className="px-4 py-2.5 rounded-xl bg-white/10 border border-white/15 text-xs backdrop-blur-sm shrink-0">
                    <span className="text-slate-300">Paket Saat Ini: </span>
                    <strong className={currentPlan === "PRO" ? "text-amber-300 font-extrabold" : "text-white font-bold"}>{currentPlan}</strong>
                    {currentPlan === "PRO" && currentExpires && (
                        <span className="block text-[11px] text-emerald-300 mt-0.5">Aktif s/d: {currentExpires}</span>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* PAKET FREE */}
                <Card className={`p-6 flex flex-col justify-between card-hover ${
                    currentPlan === 'FREE' ? 'border-2 border-indigo-500 ring-4 ring-indigo-500/10' : 'border-slate-200/80'
                }`}>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Starter Plan</span>
                                <h2 className="text-xl font-bold text-slate-900">Paket FREE</h2>
                                <p className="text-xs text-slate-500">Operasional kasir POS dan manajemen inventaris dasar</p>
                            </div>
                            {currentPlan === "FREE" && (
                                <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    Sedang Aktif
                                </span>
                            )}
                        </div>
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70">
                            <div className="text-3xl font-extrabold text-slate-900">
                                Rp 0 <span className="text-xs font-medium text-slate-500">/ selamanya</span>
                            </div>
                        </div>
                        <ul className="space-y-2.5 text-xs text-slate-600 pt-2">
                            <li className="flex items-center gap-2.5"><span className="text-emerald-600"><Icons.Check /></span> Manajemen Produk & Koreksi Stock Opname</li>
                            <li className="flex items-center gap-2.5"><span className="text-emerald-600"><Icons.Check /></span> Kasir POS, Dukungan Pemindai Barcode & Cetak Struk 58mm</li>
                            <li className="flex items-center gap-2.5"><span className="text-emerald-600"><Icons.Check /></span> Riwayat Data Lengkap & Pembatalan Transaksi (Void)</li>
                            <li className="flex items-center gap-2.5"><span className="text-emerald-600"><Icons.Check /></span> Sinkronisasi & Impor Data Penjualan Massal</li>
                            <li className="flex items-center gap-2.5 text-slate-400 line-through"><Icons.X /> Proyeksi Permintaan & Peramalan Kebutuhan Stok</li>
                            <li className="flex items-center gap-2.5 text-slate-400 line-through"><Icons.X /> Dukungan Model Prediksi Kustom & Peramalan Multi-Periode</li>
                        </ul>
                    </div>
                    <Button
                        variant="outline"
                        disabled={currentPlan === "FREE" || isUpdating}
                        onClick={handleDowngradeFree}
                        className="w-full py-2.5 mt-6 text-xs"
                    >
                        {currentPlan === "FREE" ? "Paket FREE Sedang Aktif" : "Ubah Kembali ke Paket FREE"}
                    </Button>
                </Card>

                {/* PAKET PRO */}
                <div className={`p-6 rounded-2xl flex flex-col justify-between bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-950 text-white shadow-lg card-hover border ${
                    currentPlan === 'PRO' ? 'border-amber-400 ring-4 ring-amber-400/20' : 'border-indigo-800'
                }`}>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">Enterprise Plan</span>
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <span className="text-amber-400"><Icons.Crown /></span> Paket PRO
                                </h2>
                                <p className="text-xs text-indigo-200">Otomatisasi penuh proyeksi permintaan & perencanaan pengadaan</p>
                            </div>
                            {currentPlan === "PRO" && (
                                <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-amber-400 text-slate-950 shadow-sm">
                                    PRO Aktif
                                </span>
                            )}
                        </div>
                        <div className="p-4 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-sm flex justify-between items-center">
                            <div>
                                <div className="text-3xl font-extrabold text-white">
                                    Rp 58.000 <span className="text-xs font-normal text-indigo-200">/ 30 hari</span>
                                </div>
                                {currentPlan === "PRO" && (
                                    <div className="text-[11px] text-amber-300 font-medium mt-1">
                                        Berlaku s/d: {currentExpires || "Tanpa Batas Waktu"}
                                    </div>
                                )}
                            </div>
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[11px] font-bold">
                                Instant QRIS
                            </span>
                        </div>
                        <ul className="space-y-2.5 text-xs text-slate-200 pt-2">
                            <li className="flex items-center gap-2.5"><span className="text-emerald-400"><Icons.Check /></span> Seluruh fitur operasional pada Paket FREE</li>
                            <li className="flex items-center gap-2.5 text-amber-300 font-semibold"><span className="text-amber-400"><Icons.Check /></span> Akses Penuh Proyeksi Permintaan Stok (7, 14, dan 30 Hari)</li>
                            <li className="flex items-center gap-2.5 text-amber-300 font-semibold"><span className="text-amber-400"><Icons.Check /></span> Dukungan Model Prediksi Kustom & Peramalan Multi-Periode</li>
                            <li className="flex items-center gap-2.5"><span className="text-emerald-400"><Icons.Check /></span> Kalkulasi Batas Stok Minimum & Rekomendasi PO Otomatis</li>
                        </ul>
                    </div>
                    <button
                        type="button"
                        onClick={() => { setMonthsToPay(1); setIsQRISModalOpen(true); }}
                        className="w-full py-3 mt-6 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 text-xs font-extrabold shadow-md transition-all flex items-center justify-center gap-2"
                    >
                        <Icons.Crown />
                        {currentPlan === "PRO" ? "Perpanjang Masa Aktif PRO via QRIS" : "Aktifkan Paket PRO via QRIS (Rp 58.000)"}
                    </button>
                </div>
            </div>

            <Card className="p-6 border-slate-200/80 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
                    <div>
                        <h2 className="text-base font-bold text-slate-900">
                            Manajemen Status Langganan Pengguna (Administrator)
                        </h2>
                        <p className="text-xs text-slate-500">
                            Kelola status paket FREE/PRO dan masa berlaku langganan untuk setiap akun terdaftar.
                        </p>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gradient-to-r from-slate-50 via-indigo-50/40 to-slate-50 border-b border-slate-200 text-[11px] text-slate-600 uppercase tracking-wider">
                                <th className="py-3 px-4 font-bold">Email Akun</th>
                                <th className="py-3 px-4 font-bold">Nama Lengkap & Toko</th>
                                <th className="py-3 px-4 font-bold">Status Paket</th>
                                <th className="py-3 px-4 font-bold">Masa Aktif Berakhir</th>
                                <th className="py-3 px-4 font-bold text-right">Pengaturan Manual</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                            {(subData.accounts || []).map(acc => (
                                <tr key={acc.email} className="hover:bg-indigo-50/30 transition-colors">
                                    <td className="py-3 px-4 font-mono text-xs font-semibold text-indigo-600">{acc.email}</td>
                                    <td className="py-3 px-4">
                                        <div className="font-semibold text-slate-900">{acc.full_name}</div>
                                        <div className="text-xs text-slate-400">{acc.store_name}</div>
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                            acc.subscription_plan === 'PRO'
                                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                                : 'bg-slate-100 text-slate-700'
                                        }`}>
                                            {acc.subscription_plan}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 font-mono text-xs text-slate-600">
                                        {acc.pro_expires_at || (acc.subscription_plan === 'PRO' ? 'Tanpa Batas' : '-')}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <button
                                            type="button"
                                            onClick={() => openManualEditAccount(acc)}
                                            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                                        >
                                            Atur Status / Masa Aktif
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {editingEmail && (
                    <form onSubmit={handleSaveManualSubscription} className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-4 mt-3">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-950">
                                Edit Langganan Akun: <span className="text-indigo-600 font-mono">{editingEmail}</span>
                            </h3>
                            <button type="button" onClick={() => setEditingEmail(null)} className="text-slate-400 hover:text-slate-600">
                                <Icons.X />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Status Paket</label>
                                <select
                                    value={manualPlan}
                                    onChange={(e) => setManualPlan(e.target.value)}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
                                >
                                    <option value="PRO">PRO</option>
                                    <option value="FREE">FREE</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Berlaku Sampai Tanggal (Kosong = Tanpa Batas)
                                </label>
                                <input
                                    type="date"
                                    disabled={manualPlan === "FREE"}
                                    value={manualExpiresAt}
                                    onChange={(e) => setManualExpiresAt(e.target.value)}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white disabled:bg-slate-100"
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button type="submit" disabled={isSavingManual} className="flex-1 text-xs">
                                    {isSavingManual ? "Menyimpan..." : "Simpan Perubahan"}
                                </Button>
                                <Button type="button" variant="outline" onClick={() => setEditingEmail(null)} className="text-xs">
                                    Batal
                                </Button>
                            </div>
                        </div>
                    </form>
                )}
            </Card>

            <Card className="p-6 border-slate-200/80 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div>
                        <h2 className="text-base font-bold text-slate-900">
                            Riwayat Pembayaran & Langganan
                        </h2>
                        <p className="text-xs text-slate-500">
                            Catatan pembayaran QRIS dan riwayat perubahan status paket langganan.
                        </p>
                    </div>
                </div>
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500 uppercase tracking-wider">
                            <tr>
                                <th className="py-3 px-4">ID Transaksi</th>
                                <th className="py-3 px-4">Akun & Toko</th>
                                <th className="py-3 px-4">Paket</th>
                                <th className="py-3 px-4">Nominal</th>
                                <th className="py-3 px-4">Metode</th>
                                <th className="py-3 px-4">Mulai Aktif</th>
                                <th className="py-3 px-4">Berakhir Pada</th>
                                <th className="py-3 px-4">Keterangan</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                            {(subData.subscriptions_log || []).map(row => (
                                <tr key={row.id} className="hover:bg-indigo-50/30">
                                    <td className="py-3 px-4 font-mono text-slate-500">{row.id}</td>
                                    <td className="py-3 px-4">
                                        <span className="font-semibold text-slate-800 block">{row.store_name}</span>
                                        <span className="text-slate-400 font-mono">{row.user_email}</span>
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                            row.plan === 'PRO' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                            {row.plan}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 font-bold text-emerald-700">{formatRupiah(row.amount)}</td>
                                    <td className="py-3 px-4 font-medium">{row.payment_method}</td>
                                    <td className="py-3 px-4 font-mono text-slate-500">{row.started_at}</td>
                                    <td className="py-3 px-4 font-mono text-slate-700">{row.expires_at}</td>
                                    <td className="py-3 px-4 text-slate-500">{row.notes}</td>
                                </tr>
                            ))}
                            {(!subData.subscriptions_log || subData.subscriptions_log.length === 0) && (
                                <tr>
                                    <td colSpan="8" className="p-8 text-center text-slate-400">
                                        Belum ada riwayat transaksi berlangganan.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {isQRISModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <Card className="w-full max-w-md bg-white p-6 space-y-5">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Pembayaran QRIS StockSense PRO</h3>
                                <p className="text-xs text-slate-500">Harga resmi: Rp 58.000 / bulan (30 hari kalender)</p>
                            </div>
                            <button type="button" onClick={() => setIsQRISModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <Icons.X />
                            </button>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Pilih Durasi Berlangganan</label>
                            <div className="grid grid-cols-4 gap-2">
                                {[1, 3, 6, 12].map(m => (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => setMonthsToPay(m)}
                                        className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                                            monthsToPay === m
                                                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-indigo-600 shadow-sm'
                                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        {m} Bulan
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="p-5 rounded-2xl bg-gradient-to-b from-indigo-50/50 to-slate-50 border border-indigo-100 flex flex-col items-center text-center space-y-3">
                            <div className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                                QRIS • StockSense Merchant
                            </div>
                            <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-sm">
                                <svg width="160" height="160" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect width="160" height="160" fill="white"/>
                                    <rect x="12" y="12" width="44" height="44" stroke="#0f172a" strokeWidth="6"/>
                                    <rect x="24" y="24" width="20" height="20" fill="#0f172a"/>
                                    <rect x="104" y="12" width="44" height="44" stroke="#0f172a" strokeWidth="6"/>
                                    <rect x="116" y="24" width="20" height="20" fill="#0f172a"/>
                                    <rect x="12" y="104" width="44" height="44" stroke="#0f172a" strokeWidth="6"/>
                                    <rect x="24" y="116" width="20" height="20" fill="#0f172a"/>
                                    <rect x="66" y="16" width="10" height="10" fill="#0f172a"/>
                                    <rect x="82" y="26" width="10" height="20" fill="#0f172a"/>
                                    <rect x="66" y="52" width="24" height="10" fill="#0f172a"/>
                                    <rect x="16" y="68" width="20" height="10" fill="#0f172a"/>
                                    <rect x="46" y="74" width="16" height="16" fill="#4f46e5"/>
                                    <rect x="72" y="72" width="16" height="16" fill="#0f172a"/>
                                    <rect x="98" y="68" width="12" height="24" fill="#0f172a"/>
                                    <rect x="122" y="76" width="24" height="10" fill="#0f172a"/>
                                    <rect x="68" y="102" width="14" height="14" fill="#0f172a"/>
                                    <rect x="92" y="112" width="22" height="12" fill="#0f172a"/>
                                    <rect x="124" y="104" width="20" height="20" fill="#0f172a"/>
                                    <rect x="68" y="130" width="32" height="14" fill="#0f172a"/>
                                    <rect x="112" y="134" width="34" height="12" fill="#0f172a"/>
                                </svg>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">Total Pembayaran ({monthsToPay} Bulan)</p>
                                <p className="text-2xl font-extrabold text-indigo-700 mt-0.5">{formatRupiah(totalQRISNominal)}</p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <Button type="button" variant="outline" onClick={() => setIsQRISModalOpen(false)} className="text-xs">
                                Batal
                            </Button>
                            <Button
                                type="button"
                                variant="success"
                                disabled={isPayingQRIS}
                                onClick={handleConfirmQRISPayment}
                                className="text-xs"
                            >
                                <Icons.Check />
                                {isPayingQRIS ? "Memverifikasi..." : "Konfirmasi Pembayaran QRIS"}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};

window.SubscriptionPage = SubscriptionPage;