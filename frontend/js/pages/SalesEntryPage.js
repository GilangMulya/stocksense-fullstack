const SalesEntryPage = ({ products, currentUser, onRefreshData, onGoToHistory, onGoToUploadDelta }) => {
    const { addToast } = React.useContext(ToastContext);
    const isProUser = (currentUser?.subscription_plan || "FREE").toUpperCase() === "PRO";

    const [searchTerm, setSearchTerm] = useState("");
    const [showOnlySelected, setShowOnlySelected] = useState(false);
    const [cartQuantities, setCartQuantities] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [lastScannedItem, setLastScannedItem] = useState(null);

    const [paymentMethod, setPaymentMethod] = useState("TUNAI");
    const [amountPaid, setAmountPaid] = useState("");
    const [autoPrintReceipt, setAutoPrintReceipt] = useState(true);
    const [lastCompletedReceipt, setLastCompletedReceipt] = useState(null);

    const [saleDate, setSaleDate] = useState(() => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    });

    const scanBufferRef = useRef("");
    const lastKeyTimeRef = useRef(0);

    const processHardwareBarcode = useCallback((rawCode) => {
        const codeClean = String(rawCode ? rawCode : "").trim();
        if (!codeClean) return;

        let matched = products.find(p => String(p.code).toLowerCase() === codeClean.toLowerCase());
        if (!matched) {
            matched = products.find(p => String(p.code).toLowerCase().includes(codeClean.toLowerCase()));
        }

        if (!matched) {
            playScannerBeep(420, 200);
            addToast(`Produk dengan kode barcode "${codeClean}" tidak ditemukan.`, "error");
            return;
        }
        if (matched.stock <= 0) {
            playScannerBeep(420, 200);
            addToast(`Stok ${matched.name} sedang habis.`, "error");
            return;
        }

        setCartQuantities(prev => {
            const rawPrev = prev[matched.id];
            const currentQty = rawPrev ? Number(rawPrev) : 0;
            if (currentQty + 1 > matched.stock) {
                playScannerBeep(420, 200);
                addToast(`Stok ${matched.name} hanya tersisa ${matched.stock} unit.`, "error");
                return prev;
            }
            playScannerBeep(2650, 100);
            setLastScannedItem({
                code: matched.code,
                name: matched.name,
                qty: currentQty + 1
            });
            return { ...prev, [matched.id]: currentQty + 1 };
        });
    }, [products, addToast]);

    useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            const tag = String(e.target && e.target.tagName ? e.target.tagName : "").toUpperCase();
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
                return;
            }
            const now = Date.now();
            if (now - lastKeyTimeRef.current > 120) {
                scanBufferRef.current = "";
            }
            lastKeyTimeRef.current = now;

            if (e.key === "Enter") {
                if (scanBufferRef.current.length >= 3) {
                    e.preventDefault();
                    const scannedCode = scanBufferRef.current;
                    scanBufferRef.current = "";
                    processHardwareBarcode(scannedCode);
                }
            } else if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                scanBufferRef.current += e.key;
            }
        };

        window.addEventListener("keydown", handleGlobalKeyDown);
        return () => window.removeEventListener("keydown", handleGlobalKeyDown);
    }, [processHardwareBarcode]);

    const filteredProducts = useMemo(() => {
        const q = searchTerm.toLowerCase();
        return products.filter(p => {
            const pName = String(p.name ? p.name : "").toLowerCase();
            const pCode = String(p.code ? p.code : "").toLowerCase();
            const matchSearch = pName.includes(q) || pCode.includes(q);
            if (!matchSearch) return false;
            if (showOnlySelected) {
                const qVal = cartQuantities[p.id] ? Number(cartQuantities[p.id]) : 0;
                return qVal > 0;
            }
            return true;
        });
    }, [products, searchTerm, showOnlySelected, cartQuantities]);

    const selectedItems = useMemo(() => {
        return products
            .filter(p => (cartQuantities[p.id] ? Number(cartQuantities[p.id]) : 0) > 0)
            .map(p => {
                const qNum = Number(cartQuantities[p.id]);
                const pPrice = p.price ? Number(p.price) : 0;
                return {
                    ...p,
                    qty: qNum,
                    subtotal: qNum * pPrice
                };
            });
    }, [products, cartQuantities]);

    const totalUnits = useMemo(() => selectedItems.reduce((acc, item) => acc + item.qty, 0), [selectedItems]);
    const totalRevenue = useMemo(() => selectedItems.reduce((acc, item) => acc + item.subtotal, 0), [selectedItems]);
    const numericPaid = paymentMethod === "QRIS" ? totalRevenue : (amountPaid ? Number(amountPaid) : 0);
    const changeAmount = Math.max(0, numericPaid - totalRevenue);

    const handleQtyChange = (product, rawValue) => {
        if (rawValue === "" || rawValue === null || rawValue === undefined) {
            setCartQuantities(prev => {
                const copy = { ...prev };
                delete copy[product.id];
                return copy;
            });
            return;
        }
        let val = parseInt(rawValue, 10);
        if (isNaN(val) || val <= 0) {
            setCartQuantities(prev => {
                const copy = { ...prev };
                delete copy[product.id];
                return copy;
            });
            return;
        }
        if (val > product.stock) {
            val = product.stock;
            addToast(`Stok tersedia untuk ${product.name} maksimal ${product.stock} unit.`, "error");
        }
        setCartQuantities(prev => ({ ...prev, [product.id]: val }));
    };

    const adjustQty = (product, delta) => {
        const current = cartQuantities[product.id] ? Number(cartQuantities[product.id]) : 0;
        const next = current + delta;
        if (next <= 0) {
            handleQtyChange(product, "");
        } else {
            handleQtyChange(product, String(next));
        }
    };

    const handleClearCart = () => {
        setCartQuantities({});
        setAmountPaid("");
        setLastScannedItem(null);
        setShowOnlySelected(false);
    };

    const handleSearchKeyDown = (e) => {
        if (e.key === "Enter" && searchTerm.trim().length >= 3) {
            const exact = products.find(p => String(p.code).toLowerCase() === searchTerm.trim().toLowerCase());
            if (exact) {
                e.preventDefault();
                processHardwareBarcode(exact.code);
                setSearchTerm("");
            }
        }
    };

    const handleBulkSubmit = async (e) => {
        e.preventDefault();
        if (selectedItems.length === 0) {
            addToast("Pilih atau pindai minimal 1 produk terlebih dahulu.", "error");
            return;
        }
        if (paymentMethod === "TUNAI" && numericPaid > 0 && numericPaid < totalRevenue) {
            addToast("Nominal uang diterima kurang dari total pembayaran.", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            const finalPaid = numericPaid > 0 ? numericPaid : totalRevenue;
            const finalChange = Math.max(0, finalPaid - totalRevenue);

            const payload = {
                date: saleDate,
                paymentMethod,
                amountPaid: finalPaid,
                changeAmount: finalChange,
                items: selectedItems.map(item => ({
                    productId: item.id,
                    quantity: item.qty
                }))
            };

            const response = await authFetch(`${API_BASE_URL}/sales/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const resData = await response.json();
            if (!response.ok) {
                throw new Error(resData.detail ? resData.detail : "Gagal menyimpan transaksi penjualan.");
            }

            const receiptPayload = {
                storeName: currentUser && currentUser.store_name ? currentUser.store_name : "Toko",
                storeAddress: currentUser && currentUser.store_address ? currentUser.store_address : "",
                storePhone: currentUser && currentUser.store_phone ? currentUser.store_phone : "",
                receiptFooter: currentUser && currentUser.receipt_footer ? currentUser.receipt_footer : "Terima kasih telah berbelanja.",
                cashierName: currentUser && currentUser.full_name ? currentUser.full_name : "Kasir",
                batchCode: resData.batch_code ? resData.batch_code : "TRX",
                dateStr: resData.timestamp ? resData.timestamp : saleDate,
                items: [...selectedItems],
                totalAmount: totalRevenue,
                paymentMethod,
                amountPaid: finalPaid,
                changeAmount: finalChange
            };

            setLastCompletedReceipt(receiptPayload);
            if (autoPrintReceipt) {
                printThermalReceipt58mm(receiptPayload);
            }

            await onRefreshData();
            addToast(resData.message, "success");
            handleClearCart();
        } catch (error) {
            addToast(error.message ? error.message : "Terjadi kesalahan saat menghubungi server.", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6 page-enter">
            <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950 via-slate-900 to-emerald-950 text-white shadow-md flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0 mt-0.5">
                        <Icons.ClipboardEdit />
                    </div>
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">Kasir & Transaksi (POS)</span>
                        <h1 className="text-2xl font-bold tracking-tight mt-0.5">Input Penjualan Kasir</h1>
                        <p className="text-xs text-slate-300 mt-1">
                            Pilih produk dari katalog atau pindai kode barcode untuk memproses transaksi penjualan.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    <div
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-xs font-semibold"
                        title="Pindai kode barcode produk kapan saja di halaman ini"
                    >
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                        <Icons.Barcode />
                        <span>Pemindai Barcode Aktif</span>
                        {lastScannedItem && (
                            <span className="ml-1 pl-2 border-l border-emerald-400/30 text-white font-bold">
                                {lastScannedItem.name} ({lastScannedItem.qty}x)
                            </span>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={onGoToUploadDelta}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all flex items-center gap-2"
                    >
                        <Icons.UploadCloud /> Impor Transaksi
                    </button>

                    {lastCompletedReceipt && (
                        <button
                            type="button"
                            onClick={() => printThermalReceipt58mm(lastCompletedReceipt)}
                            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-500/30 hover:bg-indigo-500/40 text-indigo-100 border border-indigo-400/30 transition-all flex items-center gap-2"
                        >
                            <Icons.Printer /> Cetak Ulang Struk
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={onGoToHistory}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all flex items-center gap-2"
                    >
                        <Icons.History /> Riwayat
                    </button>
                </div>
            </div>

            <Card className="p-4 border-slate-200/80">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    <div className="md:col-span-3">
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tanggal Transaksi</label>
                        <input
                            type="date"
                            required
                            value={saleDate}
                            onChange={(e) => setSaleDate(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-800 bg-slate-50/50 focus:bg-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                        />
                    </div>
                    <div className="md:col-span-6">
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Cari Nama atau Kode Barcode Produk</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-indigo-500">
                                <Icons.Search />
                            </div>
                            <input
                                type="text"
                                placeholder="Ketik nama barang atau pindai kode barcode di sini..."
                                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-800 bg-slate-50/50 focus:bg-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={handleSearchKeyDown}
                            />
                        </div>
                    </div>
                    <div className="md:col-span-3">
                        <button
                            type="button"
                            onClick={() => setShowOnlySelected(!showOnlySelected)}
                            className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all ${
                                showOnlySelected
                                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-indigo-600 shadow-sm'
                                    : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40'
                            }`}
                        >
                            {showOnlySelected ? `Menampilkan Keranjang (${selectedItems.length})` : `Filter Keranjang (${selectedItems.length} dipilih)`}
                        </button>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <Card className="lg:col-span-2 overflow-hidden border-slate-200/80">
                    <div className="px-5 py-3.5 bg-gradient-to-r from-slate-50 via-indigo-50/40 to-slate-50 border-b border-slate-200/80 flex justify-between items-center">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                            Katalog Produk ({filteredProducts.length.toLocaleString('id-ID')} Item)
                        </span>
                        <span className="text-xs text-indigo-600 font-medium">Klik + atau gunakan Pemindai Barcode</span>
                    </div>
                    <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-white border-b border-slate-200 z-10">
                                <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                    <th className="py-3 px-4">Kode</th>
                                    <th className="py-3 px-4">Nama Produk</th>
                                    <th className="py-3 px-4">Harga Jual</th>
                                    <th className="py-3 px-4">{isProUser ? "Sisa Stok & Status" : "Sisa Stok"}</th>
                                    <th className="py-3 px-4 text-center w-40">Kuantitas</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-sm">
                                {filteredProducts.slice(0, 250).map(p => {
                                    const qtyVal = cartQuantities[p.id] ? cartQuantities[p.id] : "";
                                    const isSelected = Number(qtyVal ? qtyVal : 0) > 0;
                                    const isOut = p.stock <= 0;
                                    const hasMlResult = isProUser && p.isMlActive && p.minStock !== null && p.status;
                                    return (
                                        <tr
                                            key={p.id}
                                            className={`transition-colors ${
                                                isSelected ? 'bg-indigo-50/60' : 'hover:bg-slate-50/80'
                                            } ${isOut ? 'opacity-50' : ''}`}
                                        >
                                            <td className="py-3 px-4 font-mono text-xs font-semibold text-indigo-600">{p.code}</td>
                                            <td className="py-3 px-4">
                                                <div className="font-semibold text-slate-800">{p.name}</div>
                                                <div className="text-xs text-slate-400">{p.category}</div>
                                            </td>
                                            <td className="py-3 px-4 text-slate-800 font-bold">{formatRupiah(p.price)}</td>
                                            <td className="py-3 px-4">
                                                {hasMlResult ? (
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={`font-bold ${p.stock <= p.minStock ? 'text-rose-600' : 'text-slate-700'}`}>
                                                            {p.stock}
                                                        </span>
                                                        <StatusBadge status={p.status} />
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <span className={`font-bold ${isOut ? 'text-rose-600' : 'text-slate-700'}`}>
                                                            {p.stock} <span className="text-xs font-normal text-slate-400">unit</span>
                                                        </span>
                                                        {isOut && <StatusBadge status="HABIS" />}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        disabled={isOut || !isSelected}
                                                        onClick={() => adjustQty(p, -1)}
                                                        className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 disabled:opacity-40 text-slate-600 font-bold flex items-center justify-center transition-colors"
                                                    >
                                                        -
                                                    </button>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max={p.stock}
                                                        disabled={isOut}
                                                        placeholder="0"
                                                        value={qtyVal}
                                                        onChange={(e) => handleQtyChange(p, e.target.value)}
                                                        className={`w-14 text-center border rounded-lg py-1 px-1 text-sm font-bold outline-none ${
                                                            isSelected
                                                                ? 'border-indigo-500 bg-indigo-50/30 text-indigo-700'
                                                                : 'border-slate-200 text-slate-700'
                                                        }`}
                                                    />
                                                    <button
                                                        type="button"
                                                        disabled={isOut || Number(qtyVal ? qtyVal : 0) >= p.stock}
                                                        onClick={() => adjustQty(p, 1)}
                                                        className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 disabled:opacity-40 text-slate-600 font-bold flex items-center justify-center transition-colors"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <Card className="p-5 sticky top-6 space-y-4 border-indigo-100 shadow-md">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                <Icons.ShoppingCart />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-base">Keranjang Kasir</h3>
                                <p className="text-xs text-slate-400">Tanggal: {saleDate}</p>
                            </div>
                        </div>
                        {selectedItems.length > 0 && (
                            <button
                                type="button"
                                onClick={handleClearCart}
                                className="text-xs px-2.5 py-1 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 font-semibold transition-colors"
                            >
                                Reset
                            </button>
                        )}
                    </div>

                    {selectedItems.length === 0 ? (
                        <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                                <Icons.Barcode />
                            </div>
                            <p className="font-semibold text-slate-600">Keranjang Belanja Kosong</p>
                            <p>Pindai kode produk atau klik tombol (+) di tabel kiri.</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                {selectedItems.map(item => (
                                    <div
                                        key={item.id}
                                        className="flex justify-between items-center p-2.5 rounded-xl bg-gradient-to-r from-slate-50 to-indigo-50/30 border border-slate-200/70 text-xs"
                                    >
                                        <div className="flex-1 pr-2">
                                            <span className="font-semibold text-slate-800 block">{item.name}</span>
                                            <span className="text-indigo-600 font-medium">{item.qty} x {formatRupiah(item.price)}</span>
                                        </div>
                                        <div className="text-right flex items-center gap-2">
                                            <span className="font-bold text-slate-900">{formatRupiah(item.subtotal)}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleQtyChange(item, "")}
                                                className="text-slate-400 hover:text-rose-500"
                                            >
                                                <Icons.X />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="pt-3 border-t border-slate-100 space-y-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Metode Pembayaran</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {["TUNAI", "QRIS"].map(m => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => setPaymentMethod(m)}
                                                className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                                                    paymentMethod === m
                                                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-indigo-600 shadow-sm'
                                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                                }`}
                                            >
                                                {m === "TUNAI" ? "Tunai (Cash)" : "QRIS Digital"}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {paymentMethod === "TUNAI" && (
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">Nominal Uang Diterima (Rp)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={amountPaid}
                                            onChange={(e) => setAmountPaid(e.target.value)}
                                            placeholder="Masukkan nominal uang..."
                                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                                        />
                                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                                            {[totalRevenue, 50000, 100000, 200000].map(nom => (
                                                <button
                                                    key={nom}
                                                    type="button"
                                                    onClick={() => setAmountPaid(String(nom))}
                                                    className="px-2.5 py-1 text-[11px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-semibold transition-colors"
                                                >
                                                    {nom === totalRevenue ? "Uang Pas" : formatRupiah(nom)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="p-4 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl space-y-1.5 text-xs shadow-sm">
                                    <div className="flex justify-between text-slate-300">
                                        <span>Total Belanja ({totalUnits} Unit)</span>
                                        <span className="font-bold text-white text-sm">{formatRupiah(totalRevenue)}</span>
                                    </div>
                                    <div className="flex justify-between text-slate-300">
                                        <span>Dibayar ({paymentMethod})</span>
                                        <span>{formatRupiah(numericPaid ? numericPaid : totalRevenue)}</span>
                                    </div>
                                    <div className="flex justify-between text-emerald-400 font-bold text-sm pt-2 border-t border-white/10">
                                        <span>Kembalian</span>
                                        <span>{formatRupiah(changeAmount)}</span>
                                    </div>
                                </div>

                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={autoPrintReceipt}
                                        onChange={(e) => setAutoPrintReceipt(e.target.checked)}
                                        className="rounded text-indigo-600"
                                    />
                                    <span>Cetak struk kasir 58mm otomatis</span>
                                </label>
                            </div>

                            <Button onClick={handleBulkSubmit} disabled={isSubmitting} variant="success" className="w-full py-3">
                                <Icons.Check />
                                {isSubmitting ? "Menyimpan Transaksi..." : "Proses & Simpan Transaksi"}
                            </Button>
                        </>
                    )}
                </Card>
            </div>
        </div>
    );
};

window.SalesEntryPage = SalesEntryPage;