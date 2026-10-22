// components/credit/BuyerSearchDialog.jsx
//
// Seller-only: find any eligible buyer by phone, email or shop name and
// pick them to approve credit directly (no request needed). The server only
// ever returns verified, non-deleted accounts, with contact details masked.
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Loader2, UserSearch, Check, Clock3, Ban, MapPin } from "lucide-react";
import { C, EASE, initials } from "./tokens.js";

function statusOf(buyer) {
    switch (buyer.credit?.status) {
        case "approved": return { label: "Already approved", bg: C.okBg, fg: C.ok, disabled: true, icon: Check };
        case "pending": return { label: "Requested credit", bg: C.warnBg, fg: C.warn, disabled: false, icon: Clock3 };
        case "rejected": return { label: "Declined earlier", bg: C.hairSoft, fg: C.muted, disabled: false, icon: Ban };
        case "revoked": return { label: "Turned off", bg: C.hairSoft, fg: C.muted, disabled: false, icon: Ban };
        default: return null;
    }
}

function Avatar({ name, logo }) {
    const [broken, setBroken] = useState(false);
    useEffect(() => { setBroken(false); }, [logo]);
    return (
        <span
            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl"
            style={{ background: C.imgBg, border: `1px solid ${C.hairSoft}` }}
        >
            {logo && !broken ? (
                <img src={logo} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
            ) : (
                <span className="text-[12px] font-extrabold tracking-wide" style={{ color: C.ink }}>{initials(name)}</span>
            )}
        </span>
    );
}

export default function BuyerSearchDialog({ open, onClose, onSearch, onPick }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const seq = useRef(0);
    const inputRef = useRef(null);

    const term = query.trim();

    // Fresh start every time the dialog opens.
    useEffect(() => {
        if (!open) return;
        setQuery("");
        setResults([]);
        setError(null);
        setLoading(false);
        const t = setTimeout(() => inputRef.current?.focus(), 80);
        return () => clearTimeout(t);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    // Debounced search; stale responses are ignored via `seq`.
    useEffect(() => {
        if (!open) return;
        if (term.length < 3) {
            seq.current += 1;
            setResults([]);
            setLoading(false);
            setError(null);
            return;
        }
        const my = ++seq.current;
        setLoading(true);
        setError(null);
        const t = setTimeout(async () => {
            let res;
            try { res = await onSearch(term); } catch { res = { success: false }; }
            if (my !== seq.current) return;
            if (res?.success) setResults(res.buyers || []);
            else { setResults([]); setError(res?.message || "Search failed. Please try again."); }
            setLoading(false);
        }, 350);
        return () => clearTimeout(t);
    }, [term, open, onSearch]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
                >
                    <motion.div
                        role="dialog" aria-modal="true" aria-label="Add buyer"
                        initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.98 }}
                        transition={{ duration: 0.2, ease: EASE }}
                        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
                    >
                        <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-4">
                            <div className="min-w-0">
                                <h2 className="text-[16px] font-extrabold capitalize tracking-wide" style={{ color: C.ink }}>Add a buyer</h2>
                                <p className="mt-0.5 text-[12.5px] font-medium leading-snug tracking-wide" style={{ color: C.muted }}>
                                    Find them by phone, email or shop name and approve credit directly.
                                </p>
                            </div>
                            <button
                                type="button" onClick={onClose} aria-label="Close"
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5"
                            >
                                <X className="h-4 w-4" style={{ color: C.ink }} />
                            </button>
                        </div>

                        <div className="px-4 pb-3">
                            <div className="flex h-10 items-center gap-2 rounded-full border bg-white px-3.5" style={{ borderColor: C.hair }}>
                                <Search className="h-3.5 w-3.5 shrink-0" style={{ color: C.muted }} />
                                <input
                                    ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Phone, email or shop name"
                                    className="w-full min-w-0 bg-transparent text-[13.5px] font-medium tracking-wide outline-none placeholder:text-slate-400"
                                    style={{ color: C.ink }}
                                />
                                {loading ? (
                                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" style={{ color: C.muted }} />
                                ) : query ? (
                                    <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                                        <X className="h-3.5 w-3.5" style={{ color: C.muted }} />
                                    </button>
                                ) : null}
                            </div>
                        </div>

                        <div className="min-h-[180px] flex-1 overflow-y-auto border-t" style={{ borderColor: C.hairSoft }}>
                            {term.length < 3 ? (
                                <Hint icon={UserSearch} title="Search for a buyer" hint="Type at least 3 characters of their phone number, email or shop name." />
                            ) : error ? (
                                <Hint icon={X} title="Couldn't search" hint={error} />
                            ) : !loading && results.length === 0 ? (
                                <Hint icon={Search} title="No matching buyers" hint="Only buyers with a finished, verified account can be found." />
                            ) : (
                                <ul className="divide-y" style={{ borderColor: C.hairSoft }}>
                                    {results.map((b) => {
                                        const st = statusOf(b);
                                        const title = b.businessName || b.name || "Buyer";
                                        const sub = [b.businessName ? b.name : null, b.location].filter(Boolean).join(" · ");
                                        const contact = [b.phone && `+91 ${b.phone}`, b.email].filter(Boolean).join("  ·  ");
                                        return (
                                            <li key={b.buyerId}>
                                                <button
                                                    type="button" disabled={st?.disabled} onClick={() => onPick(b)}
                                                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                                                >
                                                    <Avatar name={title} logo={b.logoUrl} />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-[13.5px] font-bold leading-tight tracking-wide" style={{ color: C.ink }}>{title}</span>
                                                        {sub && (
                                                            <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-medium tracking-wide" style={{ color: C.muted }}>
                                                                {b.location && <MapPin className="h-3 w-3 shrink-0" />}
                                                                <span className="tracking-wide">{sub}</span>
                                                            </span>
                                                        )}
                                                        {contact && (
                                                            <span className="mt-0.5 block text-[11.5px] font-medium tabular-nums tracking-wide" style={{ color: C.muted }}>{contact}</span>
                                                        )}
                                                    </span>
                                                    {st ? (
                                                        <span
                                                            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
                                                            style={{ background: st.bg, color: st.fg }}
                                                        >
                                                            <st.icon className="h-3 w-3" strokeWidth={2.5} />
                                                            {st.label}
                                                        </span>
                                                    ) : (
                                                        <span className="shrink-0 rounded-lg bg-black px-3 py-1.5 text-[11.5px] font-bold tracking-wide text-white">Select</span>
                                                    )}
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function Hint({ icon: Icon, title, hint }) {
    return (
        <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 px-6 py-8 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: C.hairSoft }}>
                <Icon className="h-[18px] w-[18px]" style={{ color: C.muted }} />
            </span>
            <p className="text-[14px] font-bold tracking-wide" style={{ color: C.ink }}>{title}</p>
            <p className="max-w-[260px] text-[12.5px] font-medium leading-snug tracking-wide" style={{ color: C.muted }}>{hint}</p>
        </div>
    );
}