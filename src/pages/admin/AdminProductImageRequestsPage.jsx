// pages/admin/AdminProductImageRequestsPage.jsx
// Review queue for seller photo requests, plus the internal history of who changed what.
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, X, History, AlertTriangle } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { adminListImageRequests, adminApproveImageRequest, adminRejectImageRequest, adminImageAuditLog, adminRollbackPreview, adminRollbackImages } from "../../utils/sellerListingApi.js";
import { resizedImageUrl } from "../../utils/imageUrl.js";
import ImageLightbox from "../../components/ImageLightbox.jsx";
import { C } from "../../components/seller/listingForm/FormPrimitives.jsx";

const PAGE = 30;
const TABS = [["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["cancelled", "Cancelled"], ["all", "All"]];
const BADGE = {
    pending: ["Pending", "#fef3c7", "#a16207"], approved: ["Approved", "#dcfce7", "#15803d"],
    rejected: ["Rejected", "#fee2e2", "#b91c1c"], cancelled: ["Cancelled", C.hairSoft, C.muted],
};
const EVENTS = {
    initial_upload: "Uploaded when the product was created", requested: "Seller requested a photo", approved: "Admin approved",
    rejected: "Admin rejected", cancelled: "Seller cancelled", rolled_back: "Admin undid a change", admin_direct_edit: "Admin edited photos directly",
};
const fmtDate = (s) => { try { return new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); } catch { return ""; } };
const th = (u, w = 200) => resizedImageUrl(u, { width: w });
const short = (id) => (id ? String(id).slice(0, 8) : "—");

const Thumb = ({ src, size = 56, ring, label, onClick }) => (
    <button type="button" onClick={onClick} className="relative shrink-0 overflow-hidden rounded-xl bg-white" aria-label={label || "View photo"}
        style={{ width: size, height: size, border: `2px solid ${ring || C.hair}` }}>
        <img src={th(src, size * 3)} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />
    </button>
);

const RequestCard = memo(function RequestCard({ it, busy, onApprove, onReject, onHistory, onOpen }) {
    const [label, bg, fg] = BADGE[it.status] || BADGE.cancelled;
    const live = it.currentImages || [];
    const replacing = it.action === "replace";
    return (
        <div className="rounded-2xl border bg-white p-4" style={{ borderColor: C.hair }}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-[14px] font-bold" style={{ color: C.ink }}>{it.brand?.name || "Product"}</p>
                    <p className="text-[12px] font-semibold" style={{ color: C.muted }}>
                        {it.brand?.brand_name || "No brand"} · Seller: {it.seller_name || short(it.seller_id)} · by {it.requested_by_name || short(it.requested_by)} · {fmtDate(it.created_at)}
                    </p>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: "#e0f2fe", color: "#0369a1" }}>
                        {replacing ? "Replace photo" : "Add photo"}
                    </span>
                    <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: bg, color: fg }}>{label}</span>
                </div>
            </div>

            <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                    <p className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-wide" style={{ color: C.muted }}>
                        Live photos ({live.length}){replacing ? " · red = will be replaced" : ""}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {live.length === 0 && <span className="text-[12px] font-medium" style={{ color: C.muted }}>No photos yet.</span>}
                        {live.map((u, i) => (
                            <Thumb key={u} src={u} ring={replacing && u === it.replace_image_url ? C.danger : undefined}
                                onClick={() => onOpen(live, i)} label={`Live photo ${i + 1}`} />
                        ))}
                    </div>
                </div>
                <div>
                    <p className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-wide" style={{ color: C.secondary }}>Requested</p>
                    <Thumb src={it.image_url} size={112} ring={C.secondary} onClick={() => onOpen([it.image_url], 0)} label="Requested photo" />
                </div>
            </div>

            {it.note && <p className="mt-2 rounded-lg px-3 py-2 text-[12px] font-medium" style={{ background: C.hairSoft, color: C.ink }}>Seller note: {it.note}</p>}
            {it.status === "rejected" && it.rejection_reason && (
                <p className="mt-2 text-[12px] font-semibold" style={{ color: C.danger }}>Rejected: {it.rejection_reason}</p>
            )}
            {it.blocked && (
                <p className="mt-2 flex items-start gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold" style={{ background: "#fef3c7", color: "#a16207" }}>
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {it.blocked === "TARGET_MISSING"
                        ? "The photo this should replace is no longer on the product. Please reject it."
                        : "The product already has the maximum number of photos. Reject this, or remove a photo first."}
                </p>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={() => onHistory(it)} className="mr-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold" style={{ color: C.muted }}>
                    <History className="h-3.5 w-3.5" /> History
                </button>
                {it.status === "pending" && (
                    <>
                        <button type="button" onClick={() => onReject(it.id)} disabled={busy}
                            className="inline-flex items-center gap-1 rounded-lg border px-3.5 py-1.5 text-[12.5px] font-bold disabled:opacity-50" style={{ borderColor: `${C.danger}40`, color: C.danger }}>
                            <X className="h-3.5 w-3.5" /> Reject
                        </button>
                        <button type="button" onClick={() => onApprove(it.id)} disabled={busy || !!it.blocked}
                            className="inline-flex items-center gap-1 rounded-lg px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: C.secondary }}>
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Approve
                        </button>
                    </>
                )}
            </div>
        </div>
    );
});

function UndoPanel({ token, brandItemId, onDone }) {
    const [st, setSt] = useState({ loading: true, data: null });
    const [confirm, setConfirm] = useState(false);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);

    const load = useCallback(async () => {
        try { const r = await adminRollbackPreview(token, brandItemId); setSt({ loading: false, data: r?.success ? r : null }); }
        catch { setSt({ loading: false, data: null }); }
    }, [token, brandItemId]);
    useEffect(() => { load(); }, [load]);

    const run = async () => {
        setBusy(true); setMsg(null);
        try {
            const r = await adminRollbackImages(token, brandItemId, st.data.candidate.id);
            if (r?.success) { setMsg({ ok: true, text: "Undone. The previous photos are live again." }); onDone?.(); }
            else setMsg({ ok: false, text: r?.message || "Couldn't undo." });
        } catch { setMsg({ ok: false, text: "Network error. Please try again." }); }
        setBusy(false); setConfirm(false); load();
    };

    const d = st.data;
    if (st.loading || !d?.candidate) return msg ? <p className="mb-3 text-[12px] font-semibold" style={{ color: msg.ok ? "#15803d" : C.danger }}>{msg.text}</p> : null;
    const strip = (arr) => (
        <div className="flex flex-wrap gap-1">
            {(arr || []).slice(0, 8).map((u) => <img key={u} src={th(u, 96)} alt="" className="h-9 w-9 rounded-md border object-contain" style={{ borderColor: C.hair }} />)}
            {!(arr || []).length && <span className="text-[11px]" style={{ color: C.muted }}>No photos</span>}
        </div>
    );
    return (
        <div className="mb-3 rounded-xl border p-3" style={{ borderColor: C.hair, background: C.hairSoft }}>
            <p className="text-[12px] font-extrabold" style={{ color: C.ink }}>Undo last change</p>
            <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>
                {EVENTS[d.candidate.event]} · {fmtDate(d.candidate.created_at)}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
                <div><p className="mb-1 text-[10.5px] font-bold uppercase" style={{ color: C.muted }}>Live now</p>{strip(d.candidate.images_after)}</div>
                <div><p className="mb-1 text-[10.5px] font-bold uppercase" style={{ color: C.secondary }}>After undo</p>{strip(d.candidate.images_before)}</div>
            </div>
            {d.drifted && <p className="mt-2 text-[11.5px] font-semibold" style={{ color: "#a16207" }}>Photos were changed after this entry, so it can't be undone safely.</p>}
            {msg && <p className="mt-2 text-[11.5px] font-semibold" style={{ color: msg.ok ? "#15803d" : C.danger }}>{msg.text}</p>}
            <div className="mt-2 flex justify-end gap-2">
                {confirm && <button onClick={() => setConfirm(false)} disabled={busy} className="rounded-lg px-3 py-1.5 text-[12px] font-bold" style={{ color: C.muted }}>Keep as is</button>}
                <button onClick={() => (confirm ? run() : setConfirm(true))} disabled={busy || !d.canRollback}
                    className="rounded-lg px-3.5 py-1.5 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: C.danger }}>
                    {busy ? "Undoing…" : confirm ? "Yes, undo it" : "Undo this change"}
                </button>
            </div>
        </div>
    );
}

function HistoryModal({ token, target, onClose, onChanged }) {
    const [state, setState] = useState({ loading: true, items: [], error: "" });

    const reloadHistory = useCallback(() => {
        adminImageAuditLog(token, { brandItemId: target.brand_item_id, limit: 100 })
            .then((r) => setState(r?.success ? { loading: false, items: r.items, error: "" } : { loading: false, items: [], error: r?.message || "Couldn't load history." }))
            .catch(() => setState({ loading: false, items: [], error: "Network error." }));
    }, [token, target.brand_item_id]);
    useEffect(() => { reloadHistory(); }, [reloadHistory]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white" style={{ maxHeight: "85vh" }}>
                <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: C.hairSoft }}>
                    <div className="min-w-0">
                        <h3 className="text-[15px] font-extrabold" style={{ color: C.ink }}>Photo history</h3>
                        <p className="truncate text-[11.5px] font-semibold" style={{ color: C.muted }}>{target.brand?.name}</p>
                    </div>
                    <button onClick={onClose} className="rounded-full p-1.5" style={{ color: C.muted }} aria-label="Close"><X className="h-4 w-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-3" style={{ minHeight: 0 }}>
                    <UndoPanel token={token} brandItemId={target.brand_item_id} onDone={() => { onChanged?.(); reloadHistory(); }} />
                    {state.loading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" style={{ color: C.muted }} /></div>}
                    {state.error && <p className="py-6 text-center text-[13px] font-semibold" style={{ color: C.danger }}>{state.error}</p>}
                    {!state.loading && !state.error && !state.items.length && <p className="py-6 text-center text-[13px]" style={{ color: C.muted }}>No history yet.</p>}
                    <div className="flex flex-col gap-2.5">
                        {state.items.map((e) => (
                            <div key={e.id} className="flex gap-3 rounded-xl border p-3" style={{ borderColor: C.hairSoft }}>
                                {e.image_url ? <img src={th(e.image_url, 120)} alt="" className="h-12 w-12 shrink-0 rounded-lg border object-contain" style={{ borderColor: C.hair }} /> : <div className="h-12 w-12 shrink-0 rounded-lg" style={{ background: C.hairSoft }} />}
                                <div className="min-w-0 text-[12px]">
                                    <p className="font-bold" style={{ color: C.ink }}>{EVENTS[e.event] || e.event}</p>
                                    <p className="font-medium" style={{ color: C.muted }}>
                                        {fmtDate(e.created_at)} · {e.actor_role || "—"} {e.actor_name || short(e.actor_id)}
                                        {e.seller_name ? ` · ${e.seller_name}` : ""}{e.ip ? ` · ${e.ip}` : ""}
                                    </p>
                                    {(e.images_before || e.images_after) && (
                                        <p className="font-medium" style={{ color: C.muted }}>Photos: {e.images_before?.length ?? "—"} → {e.images_after?.length ?? "—"}</p>
                                    )}
                                    {e.detail?.rejection_reason && <p className="font-semibold" style={{ color: C.danger }}>Reason: {e.detail.rejection_reason}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function AdminProductImageRequestsPage() {
    const { token } = useAuth();
    const [status, setStatus] = useState("pending");
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [pendingCount, setPendingCount] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState(null);
    const [rejecting, setRejecting] = useState(null);
    const [reason, setReason] = useState("");
    const [notice, setNotice] = useState(null);
    const [lightbox, setLightbox] = useState(null);
    const [history, setHistory] = useState(null);
    const seq = useRef(0);
    const itemsRef = useRef([]);
    itemsRef.current = items;

    const fetchFirst = useCallback(async ({ silent = false } = {}) => {
        if (!token) return;
        const my = ++seq.current;
        if (!silent) { setLoading(true); setError(""); }
        try {
            const limit = silent ? Math.min(Math.max(itemsRef.current.length, PAGE), 100) : PAGE;
            const r = await adminListImageRequests(token, { status, limit, offset: 0 });
            if (my !== seq.current) return;
            if (r?.success) { setItems(r.items); setTotal(r.total); setHasMore(r.hasMore); setPendingCount(r.pendingCount); setError(""); }
            else if (!silent) setError(r?.message || "Couldn't load requests.");
        } catch { if (my === seq.current && !silent) setError("Network error. Check your connection and try again."); }
        finally { if (my === seq.current && !silent) setLoading(false); }
    }, [token, status]);
    useEffect(() => { fetchFirst(); }, [fetchFirst]);

    useEffect(() => { // pick up new requests when the admin comes back to the tab
        const onVis = () => { if (document.visibilityState === "visible") fetchFirst({ silent: true }); };
        document.addEventListener("visibilitychange", onVis);
        return () => document.removeEventListener("visibilitychange", onVis);
    }, [fetchFirst]);

    const loadMore = async () => {
        if (loadingMore || !hasMore) return;
        const my = seq.current;
        setLoadingMore(true);
        try {
            const r = await adminListImageRequests(token, { status, limit: PAGE, offset: itemsRef.current.length });
            if (my !== seq.current) return;
            if (r?.success) {
                setItems((prev) => { const seen = new Set(prev.map((i) => i.id)); return [...prev, ...r.items.filter((i) => !seen.has(i.id))]; });
                setHasMore(r.hasMore); setTotal(r.total);
            } else setNotice({ ok: false, text: r?.message || "Couldn't load more." });
        } catch { setNotice({ ok: false, text: "Network error while loading more." }); }
        finally { setLoadingMore(false); }
    };

    const dropFromQueue = (id) => {
        if (status !== "pending") return;
        setItems((p) => p.filter((i) => i.id !== id));
        setTotal((t) => Math.max(0, t - 1));
        setPendingCount((c) => Math.max(0, c - 1));
    };

    const approve = useCallback(async (id) => {
        setBusyId(id);
        try {
            const r = await adminApproveImageRequest(token, id);
            if (r?.success) { setNotice({ ok: true, text: "Approved. The photo is now live for buyers." }); dropFromQueue(id); }
            else setNotice({ ok: false, text: r?.message || "Couldn't approve." });
        } catch { setNotice({ ok: false, text: "Network error. Please try again." }); }
        setBusyId(null);
        fetchFirst({ silent: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, fetchFirst, status]);

    const submitReject = async () => {
        if (reason.trim().length < 3) return;
        const id = rejecting;
        setBusyId(id);
        try {
            const r = await adminRejectImageRequest(token, id, reason.trim());
            if (r?.success) { setNotice({ ok: true, text: "Rejected. The seller has been notified." }); dropFromQueue(id); setRejecting(null); setReason(""); }
            else setNotice({ ok: false, text: r?.message || "Couldn't reject." });
        } catch { setNotice({ ok: false, text: "Network error. Please try again." }); }
        setBusyId(null);
        fetchFirst({ silent: true });
    };

    const onReject = useCallback((id) => { setRejecting(id); setReason(""); }, []);
    const onOpen = useCallback((images, index) => setLightbox({ images, index }), []);
    const onHistory = useCallback((it) => setHistory(it), []);

    return (
        <div className="mx-auto min-h-screen max-w-4xl px-4 pb-24 pt-6 sm:px-6" style={{ background: "#FFFFFF" }}>
            <h1 className="text-[20px] font-extrabold sm:text-[22px]" style={{ color: C.ink }}>Product Photo Requests</h1>
            <p className="text-[12.5px] font-medium" style={{ color: C.muted }}>Photos sellers want to add or replace. Nothing goes live until you approve it.</p>

            <div className="mt-5 flex gap-1.5 overflow-x-auto pb-1">
                {TABS.map(([k, l]) => (
                    <button key={k} onClick={() => setStatus(k)} className="shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors"
                        style={{ background: status === k ? C.secondary : C.hairSoft, color: status === k ? "#fff" : C.muted }}>
                        {l}{k === "pending" && pendingCount > 0 ? ` · ${pendingCount}` : ""}
                    </button>
                ))}
            </div>

            {notice && (
                <div role="status" className="mt-3 flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px] font-semibold"
                    style={{ background: notice.ok ? "#dcfce7" : "#fef3c7", color: notice.ok ? "#15803d" : "#a16207" }}>
                    <span className="min-w-0 flex-1">{notice.text}</span>
                    <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
                </div>
            )}

            <div className="mt-4 flex flex-col gap-3">
                {loading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-44 animate-pulse rounded-2xl" style={{ background: C.hairSoft }} />)}
                {!loading && error && (
                    <div className="flex flex-col items-center gap-3 py-14 text-center">
                        <p className="text-[13px] font-semibold" style={{ color: C.danger }}>{error}</p>
                        <button onClick={() => fetchFirst()} className="rounded-lg border px-4 py-2 text-[12.5px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>Try again</button>
                    </div>
                )}
                {!loading && !error && !items.length && <p className="py-14 text-center text-[13px] font-medium" style={{ color: C.muted }}>{status === "pending" ? "All caught up. No photos waiting." : "Nothing here."}</p>}
                {!loading && items.map((it) => (
                    <RequestCard key={it.id} it={it} busy={busyId === it.id} onApprove={approve} onReject={onReject} onHistory={onHistory} onOpen={onOpen} />
                ))}
                {!loading && items.length > 0 && (
                    <div className="flex flex-col items-center gap-2 py-3">
                        {hasMore
                            ? <button onClick={loadMore} disabled={loadingMore} className="rounded-lg border px-4 py-2 text-[12.5px] font-bold disabled:opacity-60" style={{ borderColor: C.hair, color: C.ink }}>
                                {loadingMore ? "Loading…" : `Load more · ${Math.max(0, total - items.length)} left`}
                            </button>
                            : <p className="text-[11.5px] font-medium tabular-nums" style={{ color: C.muted }}>{total} {total === 1 ? "request" : "requests"} · end of list</p>}
                    </div>
                )}
            </div>

            {rejecting && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 px-4 sm:items-center" onClick={() => setRejecting(null)}>
                    <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl">
                        <h3 className="text-[15px] font-bold" style={{ color: C.ink }}>Reject this photo</h3>
                        <p className="mt-1 text-[12.5px]" style={{ color: C.muted }}>The seller will see this reason.</p>
                        <textarea autoFocus rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Image is blurry or shows a different product"
                            className="mt-3 w-full rounded-lg border px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2" style={{ borderColor: C.hair }} />
                        <div className="mt-3 flex justify-end gap-2">
                            <button onClick={() => setRejecting(null)} className="rounded-lg px-3 py-1.5 text-[13px] font-bold" style={{ color: C.muted }}>Cancel</button>
                            <button onClick={submitReject} disabled={reason.trim().length < 3 || busyId === rejecting}
                                className="rounded-lg px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.danger }}>Reject</button>
                        </div>
                    </div>
                </div>
            )}

            {history && <HistoryModal token={token} target={history} onClose={() => setHistory(null)} onChanged={() => fetchFirst({ silent: true })} />}
            {lightbox && <ImageLightbox images={lightbox.images} initialIndex={lightbox.index} alt="" onClose={() => setLightbox(null)} />}
        </div>
    );
}