const SettingsPage = ({ currentUser, onUserUpdated }) => {
    const { addToast } = React.useContext(ToastContext);
    const [isSaving, setIsSaving] = useState(false);

    const [form, setForm] = useState({
        store_name: currentUser?.store_name || "",
        store_address: currentUser?.store_address || "",
        store_phone: currentUser?.store_phone || "",
        receipt_footer: currentUser?.receipt_footer || "Terima kasih telah berbelanja di toko kami.",
        new_password: "",
        scanner_beep_enabled: currentUser?.settings?.scanner_beep_enabled ?? true,
        auto_print_58mm: currentUser?.settings?.auto_print_58mm ?? true,
        default_safety_days: currentUser?.settings?.default_safety_days ?? 7
    });

    const handleSaveSettings = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const res = await authFetch(`${API_BASE_URL}/auth/settings`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    store_name: form.store_name,
                    store_address: form.store_address,
                    store_phone: form.store_phone,
                    receipt_footer: form.receipt_footer,
                    new_password: form.new_password,
                    settings_dict: {
                        scanner_beep_enabled: form.scanner_beep_enabled,
                        auto_print_58mm: form.auto_print_58mm,
                        default_safety_days: Number(form.default_safety_days) || 7
                    }
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Gagal menyimpan pengaturan.");
            onUserUpdated(data.user);
            setForm(prev => ({ ...prev, new_password: "" }));
            addToast(data.message, "success");
        } catch (err) {
            addToast(err.message, "error");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6 max-w-4xl page-enter">
            <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 text-white shadow-md flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0 mt-0.5">
                    <Icons.Settings />
                </div>
                <div>
                    <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-300">Konfigurasi Sistem & Perangkat</span>
                    <h1 className="text-2xl font-bold tracking-tight mt-0.5">Pengaturan Toko & Perangkat Kasir</h1>
                    <p className="text-xs text-slate-300 mt-1">
                        Atur identitas toko pada struk kasir, preferensi pemindai barcode, dan keamanan kata sandi akun Anda.
                    </p>
                </div>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-6">
                <Card className="p-6 space-y-4 border-slate-200/80">
                    <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2.5">
                        Identitas Toko & Format Struk Kasir (58mm)
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Nama Toko / Usaha</label>
                            <input
                                required
                                type="text"
                                value={form.store_name}
                                onChange={(e) => setForm({...form, store_name: e.target.value})}
                                placeholder="Masukkan nama toko..."
                                className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm outline-none focus:border-indigo-600"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Nomor Telepon / WhatsApp Toko</label>
                            <input
                                type="text"
                                value={form.store_phone}
                                onChange={(e) => setForm({...form, store_phone: e.target.value})}
                                placeholder="Masukkan nomor telepon..."
                                className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm outline-none focus:border-indigo-600"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Alamat Lengkap Toko</label>
                            <input
                                type="text"
                                value={form.store_address}
                                onChange={(e) => setForm({...form, store_address: e.target.value})}
                                placeholder="Masukkan alamat lengkap toko..."
                                className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm outline-none focus:border-indigo-600"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Catatan Kaki Struk (Receipt Footer)</label>
                            <input
                                type="text"
                                value={form.receipt_footer}
                                onChange={(e) => setForm({...form, receipt_footer: e.target.value})}
                                placeholder="Masukkan pesan penutup struk..."
                                className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm outline-none focus:border-indigo-600"
                            />
                        </div>
                    </div>
                </Card>

                <Card className="p-6 space-y-4 border-slate-200/80">
                    <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2.5">
                        Preferensi Perangkat Kasir
                    </h2>
                    <div className="space-y-3 text-sm">
                        <label className="flex items-center justify-between p-4 rounded-xl bg-indigo-50/40 border border-indigo-100 cursor-pointer">
                            <div>
                                <span className="font-semibold text-slate-800 block">Notifikasi Suara Pemindai Barcode</span>
                                <span className="text-xs text-slate-500">Bunyikan indikator audio otomatis ketika pemindai membaca kode produk</span>
                            </div>
                            <input
                                type="checkbox"
                                checked={form.scanner_beep_enabled}
                                onChange={(e) => setForm({...form, scanner_beep_enabled: e.target.checked})}
                                className="w-4 h-4 text-indigo-600 rounded"
                            />
                        </label>
                        <label className="flex items-center justify-between p-4 rounded-xl bg-emerald-50/40 border border-emerald-100 cursor-pointer">
                            <div>
                                <span className="font-semibold text-slate-800 block">Cetak Struk Kasir 58mm Otomatis</span>
                                <span className="text-xs text-slate-500">Tampilkan jendela cetak struk secara otomatis saat transaksi penjualan disimpan</span>
                            </div>
                            <input
                                type="checkbox"
                                checked={form.auto_print_58mm}
                                onChange={(e) => setForm({...form, auto_print_58mm: e.target.checked})}
                                className="w-4 h-4 text-emerald-600 rounded"
                            />
                        </label>
                    </div>
                </Card>

                <Card className="p-6 space-y-4 border-slate-200/80">
                    <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2.5">
                        Keamanan Akun
                    </h2>
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Password Baru (Kosongkan jika tidak ingin mengubah password)
                        </label>
                        <input
                            type="password"
                            value={form.new_password}
                            onChange={(e) => setForm({...form, new_password: e.target.value})}
                            placeholder="Masukkan password baru..."
                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm outline-none focus:border-indigo-600"
                        />
                    </div>
                </Card>

                <div className="flex justify-end">
                    <Button type="submit" disabled={isSaving} className="py-2.5 px-6 text-xs">
                        <Icons.Check />
                        {isSaving ? "Menyimpan..." : "Simpan Pengaturan"}
                    </Button>
                </div>
            </form>
        </div>
    );
};

window.SettingsPage = SettingsPage;