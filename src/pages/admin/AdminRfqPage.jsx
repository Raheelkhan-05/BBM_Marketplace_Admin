// pages/admin/AdminRfqPage.jsx — review queue for RFQ enquiries
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X, Loader2, AlertTriangle, Package } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { C, EASE } from "../../components/seller/listingForm/FormPrimitives.jsx";
import RfqFormFields from "../../components/rfq/RfqFormFields.jsx";
import RfqHierarchyPicker from "../../components/rfq/RfqHierarchyPicker.jsx";
import { StatusBadge } from "../../components/rfq/RfqCard.jsx";
import Toast from "../../components/Toast.jsx";
import {
    adminListRfq, adminSaveRfq, adminApproveRfq, adminRejectRfq, adminGetRfqSettings, adminSetRfqSettings,
} from "../../utils/rfqApi.js";
import { validateRfqForm, toPayload, fromDto, fmtNum, timeAgo } from "../../utils/rfqUtils.js";

const FONT_BODY = "'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Public Sans', Roboto, sans-serif";
const PAGE = 20;
const TABS = [
    { value: "pending_review", label: "Pending" },
    { value: "approved", label: "Live" },
    { value: "rejected", label: "Rejected" },
    { value: "closed", label: "Closed" },
    { value: "all", label: "All" },
];

function ReviewModal({ token, enquiry, requireHierarchy, onClose, onChanged }) {
    const [form, setForm] = useState(() => fromDto(enquiry));
    const [hier, setHier] = useState(enquiry.hierarchy || { category: null, subcategory: null, genericProduct: null });
    const [note, setNote] = useState("");
    const [rejecting, setRejecting] = useState(false);
    const [reason, setReason] = useState("");
    const [attempted, setAttempted] = useState(false);
    const [busy, setBusy] = useState(null); // "save" | "approve" | "reject"
    const [error, setError] = useState(null);

    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, []);

    const errors = useMemo(() => (attempted ? validateRfqForm(form) : {}), [attempted, form]);
    const isPending = ["pending_review", "rejected"].includes(enquiry.status);
    const canReject = ["pending_review", "approved"].includes(enquiry.status);
    const hierComplete = !!(hier.category && hier.subcategory && hier.genericProduct);

    const hierBody = () => ({
        genericProductId: hier.genericProduct?.id || null,
        subcategoryId: hier.subcategory?.id || null,
        categoryId: hier.category?.id || null,
    });

    const validate = () => {
        setAttempted(true);
        const errs = validateRfqForm(form);
        const first = Object.keys(errs)[0];
        if (first) {
            setError("Please fix the highlighted fields.");
            document.getElementById(`rfq-field-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            return false;
        }
        setError(null);
        return true;
    };

    const run = async (kind, fn, doneMsg) => {
        setBusy(kind);
        const res = await fn();
        setBusy(null);
        if (!res.success) { setError(res.message || "Something went wrong."); return; }
        onChanged(doneMsg);
    };

    const save = () => validate() && run("save", () => adminSaveRfq(token, enquiry.id, { edits: toPayload(form), ...hierBody() }), "Changes saved.");
    const approve = () => {
        if (!validate()) return;
        if (requireHierarchy && !hierComplete) { setError("Hierarchy is compulsory: choose category, subcategory and generic product."); return; }
        run("approve", () => adminApproveRfq(token, enquiry.id, { edits: toPayload(form), ...hierBody(), note }), "Enquiry approved and the buyer was notified.");
    };
    const reject = () => {
        if (!reason.trim()) { setError("Enter a reason for the buyer."); return; }
        run("reject", () => adminRejectRfq(token, enquiry.id, reason.trim()), "Enquiry rejected and the buyer was notified.");
    };

    return (
        <motion.div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={busy ? undefined : onClose}>
            <motion.div data-lenis-prevent className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] bg-[#F7F7F8] sm:rounded-[24px]"
                initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 border-b bg-white px-4 py-3.5 sm:px-5" style={{ borderColor: C.hair }}>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="truncate text-[17px] font-extrabold tracking-wide" style={{ color: C.ink }}>Review enquiry</p>
                            <StatusBadge status={enquiry.status} />
                        </div>
                        <p className="mt-0.5 text-[11.5px] font-medium tracking-wide" style={{ color: C.muted }}>
                            Submitted {timeAgo(enquiry.createdAt)} · buyer {String(enquiry.buyerId).slice(0, 8)}
                        </p>
                    </div>
                    <button onClick={onClose} disabled={!!busy} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.05]">
                        <X className="h-4 w-4" style={{ color: C.muted }} />
                    </button>
                </div>

                <div data-lenis-prevent className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5">
                    {enquiry.status === "rejected" && enquiry.reviewNote && (
                        <p className="rounded-xl px-3.5 py-3 text-[12.5px] font-semibold" style={{ background: "rgba(199,31,17,0.08)", color: C.danger }}>
                            Rejected: {enquiry.reviewNote}
                        </p>
                    )}
                    <RfqFormFields form={form} setForm={setForm} errors={errors} token={token} />

                    <div className="flex flex-col gap-2.5 rounded-2xl border bg-white p-3" style={{ borderColor: C.hair }}>
                        <div>
                            <p className="text-[14.5px] font-extrabold tracking-wide" style={{ color: C.ink }}>Catalog hierarchy {requireHierarchy ? "(required)" : "(optional)"}</p>
                            <p className="text-[12px] font-medium tracking-wide" style={{ color: C.muted }}>Maps this enquiry into the catalog so it can be matched to suppliers.</p>
                        </div>
                        <RfqHierarchyPicker value={hier} onChange={setHier} token={token} required={requireHierarchy} />
                    </div>

                    {isPending && (
                        <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: C.muted }}>Note to buyer (optional)</span>
                            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="Shown to the buyer with the approval"
                                className="w-full resize-none rounded-lg border bg-white px-3 py-2 text-[14px] font-medium focus:outline-none" style={{ borderColor: C.hair, color: C.ink }} />
                        </div>
                    )}

                    {rejecting && (
                        <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: C.danger }}>Reason for rejection (sent to the buyer) *</span>
                            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} autoFocus
                                className="w-full resize-none rounded-lg border bg-white px-3 py-2 text-[14px] font-medium focus:outline-none" style={{ borderColor: "#f2b3ab", color: C.ink }} />
                        </div>
                    )}
                </div>

                <div className="border-t bg-white px-4 py-3 sm:px-5" style={{ borderColor: C.hair }}>
                    {error && (
                        <p className="mb-2 flex items-start gap-1.5 text-[12px] font-semibold" style={{ color: C.danger }}>
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
                        </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={save} disabled={!!busy}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-[13px] font-bold tracking-wide disabled:opacity-60" style={{ borderColor: C.hair, color: C.ink }}>
                            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
                        </button>
                        {canReject && (rejecting ? (
                            <button type="button" onClick={reject} disabled={!!busy}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold tracking-wide text-white disabled:opacity-60" style={{ background: C.danger }}>
                                {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm reject"}
                            </button>
                        ) : (
                            <button type="button" onClick={() => { setRejecting(true); setError(null); }} disabled={!!busy}
                                className="flex flex-1 items-center justify-center rounded-xl border px-4 py-2.5 text-[13px] font-bold tracking-wide disabled:opacity-60" style={{ borderColor: "#f2b3ab", color: C.danger }}>
                                {enquiry.status === "approved" ? "Take down" : "Reject"}
                            </button>
                        ))}
                        {isPending && (
                            <button type="button" onClick={approve} disabled={!!busy}
                                className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold tracking-wide text-white disabled:opacity-60"
                                style={{ background: "linear-gradient(135deg, #2e2e2eff 0%, #000000 100%)" }}>
                                {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve & publish"}
                            </button>
                        )}
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

export default function AdminRfqPage() {
    const { token } = useAuth();
    const [tab, setTab] = useState("pending_review");
    const [qInput, setQInput] = useState("");
    const [q, setQ] = useState("");
    const [items, setItems] = useState([]);
    const [counts, setCounts] = useState({});
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selected, setSelected] = useState(null);
    const [requireHierarchy, setRequireHierarchy] = useState(false);
    const [savingSetting, setSavingSetting] = useState(false);
    const [toast, setToast] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);
    const seqRef = useRef(0);

    useEffect(() => {
        const t = setTimeout(() => setQ(qInput.trim()), 300);
        return () => clearTimeout(t);
    }, [qInput]);

    useEffect(() => {
        if (!token) return;
        adminGetRfqSettings(token).then((r) => { if (r.success) setRequireHierarchy(!!r.requireHierarchy); });
    }, [token]);

    const load = useCallback(async (from, append) => {
        const seq = ++seqRef.current;
        setLoading(true);
        if (!append) setError(null);
        const res = await adminListRfq(token, { status: tab === "all" ? "" : tab, q, limit: PAGE, offset: from });
        if (seq !== seqRef.current) return;
        setLoading(false);
        if (!res.success) { setError(res.message || "Couldn't load enquiries."); return; }
        setItems((prev) => (append ? [...prev, ...res.items.filter((i) => !prev.some((p) => p.id === i.id))] : res.items));
        setTotal(res.total); setCounts(res.counts || {}); setHasMore(res.hasMore); setOffset(from + res.items.length);
    }, [token, tab, q]);

    useEffect(() => { if (token) load(0, false); }, [load, reloadKey, token]);

    const toggleSetting = async () => {
        const next = !requireHierarchy;
        setSavingSetting(true);
        const res = await adminSetRfqSettings(token, next);
        setSavingSetting(false);
        if (res.success) { setRequireHierarchy(next); setToast(next ? "Hierarchy is now compulsory for approval." : "Hierarchy is now optional."); }
        else setToast(res.message || "Couldn't update the setting.");
    };

    return (
        <div className="min-h-screen bg-white text-slate-900 antialiased" style={{ fontFamily: FONT_BODY }}>
            <main className="mx-auto max-w-5xl px-3 pb-20 pt-5 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-[clamp(1.6rem,3.5vw,1.9rem)] font-bold tracking-wide">RFQ review</h1>
                        <p className="mt-0.5 text-[12.5px] font-medium tracking-wide" style={{ color: C.muted }}>Review, edit and publish buyer enquiries.</p>
                    </div>
                    <button type="button" role="switch" aria-checked={requireHierarchy} onClick={toggleSetting} disabled={savingSetting}
                        className="flex items-center gap-2.5 rounded-xl border bg-white px-3 py-2 disabled:opacity-60" style={{ borderColor: C.hair }}>
                        <span className="relative flex h-5 w-10 shrink-0 items-center rounded-full p-0.5 transition-all" style={{ background: requireHierarchy ? C.secondary : "#D9DEE2" }}>
                            <span className="h-4 w-4 rounded-full bg-white shadow transition-transform duration-200" style={{ transform: requireHierarchy ? "translateX(20px)" : "translateX(0)" }} />
                        </span>
                        <span className="flex flex-col items-start leading-tight">
                            <span className="text-[12px] font-extrabold tracking-wide" style={{ color: C.ink }}>Hierarchy mapping</span>
                            <span className="text-[10.5px] font-semibold tracking-wide" style={{ color: C.muted }}>{requireHierarchy ? "Compulsory to approve" : "Optional"}</span>
                        </span>
                    </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <div className="flex gap-1 overflow-x-auto rounded-full p-0.5" style={{ background: C.hairSoft }}>
                        {TABS.map((t) => (
                            <button key={t.value} type="button" onClick={() => setTab(t.value)}
                                className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold tracking-wide transition-colors"
                                style={tab === t.value ? { background: C.secondary, color: "#fff" } : { color: C.muted }}>
                                {t.label}
                                {t.value !== "all" && counts[t.value] > 0 && (
                                    <span className="rounded-full px-1.5 text-[10px] font-extrabold" style={tab === t.value ? { background: "rgba(255,255,255,0.25)" } : { background: C.hair, color: C.ink }}>{counts[t.value]}</span>
                                )}
                            </button>
                        ))}
                    </div>
                    <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: C.muted }} />
                        <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Search product…"
                            className="w-full rounded-xl border bg-white py-2 pl-9 pr-3 text-[13.5px] font-semibold focus:outline-none" style={{ borderColor: C.hair, color: C.ink }} />
                    </div>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                    {items.map((it) => (
                        <button key={it.id} type="button" onClick={() => setSelected(it)}
                            className="flex items-center gap-3 rounded-2xl border bg-white p-3 text-left transition-colors hover:bg-black/[0.02]" style={{ borderColor: C.hair }}>
                            <span className="flex h-14 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl" style={{ background: C.hairSoft }}>
                                {it.images?.[0] ? <img src={it.images[0]} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Package className="h-4 w-4" style={{ color: C.muted }} />}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[14px] font-bold tracking-wide" style={{ color: C.ink }}>{it.productName}</span>
                                <span className="block truncate text-[12px] font-semibold tracking-wide tabular-nums" style={{ color: C.muted }}>
                                    {fmtNum(it.quantity)} × {fmtNum(it.packSize)} {it.unit} · {it.deliveryCity}, {it.deliveryState}
                                </span>
                                <span className="block text-[11px] font-medium tracking-wide" style={{ color: C.muted }}>
                                    {timeAgo(it.createdAt)}{it.hierarchy?.genericProduct ? ` · ${it.hierarchy.genericProduct.name}` : ""}
                                </span>
                            </span>
                            <StatusBadge status={it.status} />
                        </button>
                    ))}
                    {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" style={{ color: C.muted }} /></div>}
                    {!loading && error && <p className="py-10 text-center text-[13px] font-bold" style={{ color: C.danger }}>{error}</p>}
                    {!loading && !error && items.length === 0 && <p className="py-14 text-center text-[13px] font-bold" style={{ color: C.muted }}>Nothing here.</p>}
                    {!loading && hasMore && (
                        <button type="button" onClick={() => load(offset, true)} className="mx-auto mt-1 rounded-full border px-4 py-2 text-[12px] font-extrabold tracking-wide" style={{ borderColor: C.hair, color: C.ink }}>
                            Load more ({total - items.length} left)
                        </button>
                    )}
                </div>
            </main>

            <AnimatePresence>
                {selected && (
                    <ReviewModal key={selected.id} token={token} enquiry={selected} requireHierarchy={requireHierarchy}
                        onClose={() => setSelected(null)}
                        onChanged={(msg) => { setSelected(null); setToast(msg); setReloadKey((k) => k + 1); }} />
                )}
            </AnimatePresence>
            <Toast message={toast} show={!!toast} onDone={() => setToast(null)} />
        </div>
    );
}