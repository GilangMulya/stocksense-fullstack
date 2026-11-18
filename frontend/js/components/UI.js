const Card = ({ children, className = "", onClick }) => (
    <div
        onClick={onClick}
        className={`bg-white/95 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/80 transition-all duration-200 ${onClick ? 'cursor-pointer card-hover' : ''} ${className}`}
    >
        {children}
    </div>
);

const Button = ({ children, onClick, variant = 'primary', className = "", disabled = false, type = "button" }) => {
    const baseStyle = "px-4 py-2 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 text-sm active:scale-[0.98]";
    const variants = {
        primary: "bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 shadow-sm hover:shadow-indigo-500/20 hover:shadow-md disabled:opacity-50",
        secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50",
        success: "bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 shadow-sm hover:shadow-emerald-500/20 hover:shadow-md disabled:opacity-50",
        danger: "bg-rose-50 text-rose-600 border border-rose-200/80 hover:bg-rose-100 disabled:opacity-50",
        outline: "bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50/40 disabled:opacity-50"
    };
    return (
        <button type={type} disabled={disabled} onClick={onClick} className={`${baseStyle} ${variants[variant] || variants.primary} ${className}`}>
            {children}
        </button>
    );
};

const StatusBadge = ({ status }) => {
    const styles = {
        'AMAN': 'bg-emerald-50 text-emerald-700 border border-emerald-200',
        'MENIPIS': 'bg-amber-50 text-amber-700 border border-amber-200',
        'HABIS': 'bg-rose-50 text-rose-700 border border-rose-200',
        'OVERSTOCK': 'bg-sky-50 text-sky-700 border border-sky-200'
    };
    const dotColors = {
        'AMAN': 'bg-emerald-500',
        'MENIPIS': 'bg-amber-500',
        'HABIS': 'bg-rose-500',
        'OVERSTOCK': 'bg-sky-500'
    };
    const label = status || 'AMAN';
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide ${styles[label] || 'bg-slate-100 text-slate-700'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dotColors[label] || 'bg-slate-400'}`}></span>
            {label}
        </span>
    );
};

const ToastContext = React.createContext();

const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    
    const addToast = useCallback((message, type = 'success') => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4200);
    }, []);

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-md">
                {toasts.map(t => (
                    <div
                        key={t.id}
                        className={`toast-enter px-4 py-3 rounded-xl shadow-xl text-white text-xs font-semibold flex items-center gap-2.5 border ${
                            t.type === 'success'
                                ? 'bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-indigo-500/40'
                                : 'bg-gradient-to-r from-rose-600 to-red-600 border-rose-400/40'
                        }`}
                    >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${t.type === 'success' ? 'bg-emerald-400' : 'bg-white'}`}></span>
                        <span className="leading-relaxed">{t.message}</span>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

window.Card = Card;
window.Button = Button;
window.StatusBadge = StatusBadge;
window.ToastContext = ToastContext;
window.ToastProvider = ToastProvider;