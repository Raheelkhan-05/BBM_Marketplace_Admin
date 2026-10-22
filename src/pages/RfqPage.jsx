// pages/RfqPage.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Plus, Upload, Search, X, Lock, FileText, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { C } from "../components/seller/listingForm/FormPrimitives.jsx";
import RfqCard from "../components/rfq/RfqCard.jsx";
import RfqFormModal from "../components/rfq/RfqFormModal.jsx";
import RfqBulkUploadModal from "../components/rfq/RfqBulkUploadModal.jsx";
import RfqQuoteModal from "../components/rfq/RfqQuoteModal.jsx";
import Toast from "../components/Toast.jsx";
import useInfiniteScrollSentinel from "../hooks/useInfiniteScrollSentinel";
import { fetchRfqList, closeRfq } from "../utils/rfqApi.js";

const FONT_BODY = "'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Public Sans', Roboto, sans-serif";
const PAGE = 12;

const STATUS_FILTERS = [
    { value: "", label: "All" },
    { value: "pending_review", label: "In review" },
    { value: "approved", label: "Live" },
    { value: "rejected", label: "Needs changes" },
    { value: "closed", label: "Closed" },
];

function mergeUnique(prev, incoming) {
    const seen = new Set(prev.map((i) => i.id));
    return [...prev, ...incoming.filter((i) => !seen.has(i.id))];
}

function CardSkeleton() {
    return (
        <div className="flex flex-col gap-3 rounded-2xl border bg-white p-3" style={{ borderColor: C.hair }}>
            <div className="flex gap-3">
                <div className="h-20 w-16 animate-pulse rounded-xl" style={{ background: C.hairSoft }} />
                <div className="flex-1 space-y-2">
                    <div className="h-3 w-3/5 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                    <div className="h-2.5 w-2/5 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                </div>
            </div>
            <div className="h-2.5 w-4/5 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
        </div>
    );
}

export default function RfqPage() {
    const navigate = useNavigate();
    const { token, effectiveLoggedIn } = useAuth();
    const [params, setParams] = useSearchParams();

    const tab = params.get("tab") === "mine" ? "mine" : "all";
    const setTab = (t) => {
        const next = new URLSearchParams(params);
        if (t === "mine") next.set("tab", "mine"); else next.delete("tab");
        setParams(next, { replace: true });
    };

    const [qInput, setQInput] = useState("");
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("");
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);

    const [formState, setFormState] = useState(null); // { mode, initial }
    const [bulkOpen, setBulkOpen] = useState(false);
    const [quoteFor, setQuoteFor] = useState(null);
    const [toast, setToast] = useState(null);

    const abortRef = useRef(null);
    const seqRef = useRef(0);

    useEffect(() => {
        const t = setTimeout(() => setQ(qInput.trim()), 300);
        return () => clearTimeout(t);
    }, [qInput]);

    const load = useCallback(async (offset, append) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const seq = ++seqRef.current;
        (append ? setLoadingMore : setLoading)(true);
        if (!append) setError(null);
        try {
            const res = await fetchRfqList(token, {
                scope: tab, q, status: tab === "mine" ? status : "", limit: PAGE, offset, signal: controller.signal,
            });
            if (seq !== seqRef.current) return;
            if (!res.success) {
                if (!append) { setItems([]); setTotal(0); }
                setHasMore(false);
                setError(res.message || "Couldn't load enquiries.");
                return;
            }
            setItems((prev) => (append ? mergeUnique(prev, res.items || []) : res.items || []));
            setTotal(res.total ?? 0);
            setHasMore(!!res.hasMore);
        } catch (e) {
            if (e?.name !== "AbortError" && seq === seqRef.current) setHasMore(false);
        } finally {
            if (seq === seqRef.current) { setLoading(false); setLoadingMore(false); }
        }
    }, [token, tab, q, status]);

    useEffect(() => {
        if (!effectiveLoggedIn || !token) { setLoading(false); return; }
        load(0, false);
        return () => abortRef.current?.abort();
    }, [load, reloadKey, effectiveLoggedIn, token]);

    const sentinelRef = useInfiniteScrollSentinel(
        () => !loadingMore && hasMore && load(items.length, true),
        { lookahead: 600, disabled: loading || loadingMore || !hasMore }
    );

    const requireLogin = () => navigate("/login", { state: { from: "/rfq" } });

    const openPost = () => (effectiveLoggedIn ? setFormState({ mode: "create", initial: null }) : requireLogin());
    const openBulk = () => (effectiveLoggedIn ? setBulkOpen(true) : requireLogin());

    const afterSubmit = (message) => {
        setToast(message);
        if (tab !== "mine") setTab("mine");
        setStatus("");
        setReloadKey((k) => k + 1);
    };

    const handleClose = async (item) => {
        if (!window.confirm(`Close the enquiry for "${item.productName}"? Suppliers will no longer see it.`)) return;
        const res = await closeRfq(token, item.id);
        if (!res.success) { setToast(res.message || "Couldn't close this enquiry."); return; }
        setToast("Enquiry closed.");
        setReloadKey((k) => k + 1);
    };

    return (
        <div className="min-h-screen bg-[#FFFFFF] text-slate-900 antialiased" style={{ fontFamily: FONT_BODY }}>
            <main className="mx-auto max-w-7xl px-2.5 pb-24 pt-4 sm:px-4 lg:px-6">
                <div className="flex flex-wrap items-end justify-between gap-3 px-1">
                    <div>
                        <h1 className="text-[clamp(1.7rem,3.5vw,1.9rem)] font-bold tracking-wide text-slate-900">Requests for Quotation</h1>
                        <p className="mt-0.5 text-[12.5px] font-medium tracking-wide" style={{ color: C.muted }}>
                            Post what you need and get quotes from suppliers, or quote on live enquiries.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={openBulk}
                            className="flex h-10 items-center gap-1.5 rounded-xl border bg-white px-3.5 text-[12.5px] font-bold tracking-wide transition-colors hover:bg-black/[0.03] active:scale-[0.98]"
                            style={{ borderColor: C.hair, color: C.ink }}>
                            <Upload className="h-3.5 w-3.5" strokeWidth={2.4} /> Bulk upload
                        </button>
                        <button type="button" onClick={openPost}
                            className="flex h-10 items-center gap-1.5 rounded-xl px-4 text-[12.5px] font-bold tracking-wide text-white transition-transform active:scale-[0.98]"
                            style={{ background: "#D84315" }}>
                            <Plus className="h-4 w-4" strokeWidth={2.6} /> Post enquiry
                        </button>
                    </div>
                </div>

                {!effectiveLoggedIn ? (
                    <div className="mx-auto mt-14 flex max-w-sm flex-col items-center gap-2 text-center">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: C.hairSoft }}>
                            <Lock className="h-5 w-5" style={{ color: C.muted }} />
                        </span>
                        <p className="text-[15px] font-extrabold tracking-wide" style={{ color: C.ink }}>Login to view enquiries</p>
                        <p className="text-[12.5px] font-medium leading-snug" style={{ color: C.muted }}>Sign in to browse live enquiries, post your own and send quotes.</p>
                        <button type="button" onClick={requireLogin} className="mt-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-white" style={{ background: C.primary }}>Login</button>
                    </div>
                ) : (
                    <>
                        <div className="mt-4 flex flex-wrap items-center gap-2 px-1">
                            <div className="flex gap-1 rounded-full p-0.5" style={{ background: C.hairSoft }}>
                                {[{ v: "all", l: "All enquiries" }, { v: "mine", l: "My enquiries" }].map((t) => (
                                    <button key={t.v} type="button" onClick={() => setTab(t.v)}
                                        className="rounded-full px-3.5 py-1.5 text-[12px] font-bold tracking-wide transition-colors duration-150"
                                        style={tab === t.v ? { background: C.secondary, color: "#fff" } : { color: C.muted }}>
                                        {t.l}
                                    </button>
                                ))}
                            </div>
                            <div className="relative min-w-[180px] flex-1 sm:max-w-sm">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: C.muted }} />
                                <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Search enquiries…"
                                    className="w-full rounded-xl border bg-white py-2 pl-9 pr-8 text-[13.5px] font-semibold tracking-wide placeholder:font-normal placeholder:text-slate-300 focus:outline-none focus:ring-2"
                                    style={{ borderColor: C.hair, color: C.ink, ["--tw-ring-color"]: `${C.secondary}22` }} />
                                {qInput && (
                                    <button type="button" onClick={() => setQInput("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-black/[0.05]">
                                        <X className="h-3 w-3" style={{ color: C.muted }} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {tab === "mine" && (
                            <div className="mt-2.5 flex gap-1.5 overflow-x-auto px-1 pb-1">
                                {STATUS_FILTERS.map((s) => (
                                    <button key={s.value} type="button" onClick={() => setStatus(s.value)}
                                        className="shrink-0 rounded-full border px-3 py-1 text-[11.5px] font-bold tracking-wide transition-colors"
                                        style={status === s.value ? { borderColor: C.ink, background: "rgba(11,17,22,0.06)", color: C.ink } : { borderColor: C.hair, color: C.muted, background: "#fff" }}>
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {!loading && !error && (
                            <p className="mt-3 px-1 text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                {total} enquir{total === 1 ? "y" : "ies"}
                            </p>
                        )}

                        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" style={{ opacity: loading && items.length ? 0.55 : 1, transition: "opacity .15s ease" }}>
                            {loading && items.length === 0
                                ? Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)
                                : items.map((item) => (
                                    <RfqCard key={item.id} item={item}
                                        onQuote={setQuoteFor}
                                        onEdit={(it) => setFormState({ mode: "edit", initial: it })}
                                        onClose={handleClose} />
                                ))}
                        </div>

                        {!loading && error && (
                            <div className="flex flex-col items-center gap-2 py-16 text-center">
                                <p className="text-[13px] font-bold" style={{ color: C.ink }}>{error}</p>
                                <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="rounded-full px-4 py-2 text-[12px] font-extrabold text-white" style={{ background: C.primary }}>Try again</button>
                            </div>
                        )}

                        {!loading && !error && items.length === 0 && (
                            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                                <FileText className="h-6 w-6" style={{ color: C.hair }} />
                                <p className="text-[13px] font-bold" style={{ color: C.ink }}>
                                    {q ? "No enquiries match that search" : tab === "mine" ? "You haven't posted any enquiries yet" : "No live enquiries right now"}
                                </p>
                                {tab === "mine" && !q && (
                                    <button type="button" onClick={openPost} className="mt-2 rounded-full px-4 py-2 text-[12px] font-extrabold tracking-wide text-white" style={{ background: C.primary }}>Post your first enquiry</button>
                                )}
                            </div>
                        )}

                        {loadingMore && (
                            <div className="flex justify-center py-5"><Loader2 className="h-5 w-5 animate-spin" style={{ color: C.muted }} /></div>
                        )}
                        {hasMore && !loading && <div ref={sentinelRef} className="h-1" />}
                    </>
                )}
            </main>

            <AnimatePresence>
                {formState && (
                    <RfqFormModal key="form" mode={formState.mode} initial={formState.initial} token={token}
                        onClose={() => setFormState(null)}
                        onSubmitted={(res) => { setFormState(null); afterSubmit(res.message || "Submitted for review."); }} />
                )}
                {bulkOpen && (
                    <RfqBulkUploadModal key="bulk" token={token} onClose={() => setBulkOpen(false)}
                        onUploaded={(res, skipped) => {
                            setBulkOpen(false);
                            afterSubmit(`${res.message}${skipped ? ` ${skipped} row${skipped === 1 ? " was" : "s were"} skipped.` : ""}`);
                        }} />
                )}
                {quoteFor && (
                    <RfqQuoteModal key="quote" enquiry={quoteFor} onClose={() => setQuoteFor(null)}
                        onDone={() => { setQuoteFor(null); setToast("Quote preview submitted."); }} />
                )}
            </AnimatePresence>

            <Toast message={toast} show={!!toast} onDone={() => setToast(null)} />
        </div>
    );
}