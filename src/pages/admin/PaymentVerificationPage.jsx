// pages/admin/PaymentVerificationPage.jsx
//
// UNIFIED admin review queue — was order-payments only, now has a second
// top-level tab for wallet top-ups (seller credit recharges) so admin can
// verify everything money-related from this one screen.
//
//   Order payments  -> GET/POST /api/admin/payment-proofs...   (unchanged)
//   Wallet top-ups  -> GET/POST /api/admin/wallet/payments...  (NEW — see
//                      admin.routes.js fix: these existed in the
//                      controller but were never mounted before)
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    Loader2, CheckCircle2, XCircle, Clock, ImageOff, ExternalLink,
    ZoomIn, X, AlertCircle, RefreshCw, Receipt, Wallet,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { C } from "../../components/seller/listingForm/FormPrimitives.jsx";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

async function apiGet(path, token) {
    const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try { message = (await res.json())?.message || message; } catch { }
        return { success: false, message };
    }
    return res.json();
}
async function apiPost(path, token, body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    return res.json();
}

const ORDER_TABS = [
    { value: "pending", label: "Pending", icon: Clock },
    { value: "verified", label: "Verified", icon: CheckCircle2 },
    { value: "rejected", label: "Rejected", icon: XCircle },
];
const QUEUE_TABS = [
    { value: "orders", label: "Order Payments", icon: Receipt },
    { value: "wallet", label: "Wallet Top-ups", icon: Wallet },
];

function formatDateTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function StatusPill({ status }) {
    const map = {
        pending: { bg: "#fef3c7", fg: "#a16207", label: "Pending" },
        verified: { bg: "#dcfce7", fg: "#15803d", label: "Verified" },
        rejected: { bg: "rgba(199,31,17,0.08)", fg: C.danger, label: "Rejected" },
    };
    const s = map[status] || map.pending;
    return (
        <span className="rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-wide" style={{ background: s.bg, color: s.fg }}>
            {s.label}
        </span>
    );
}

function ImageLightbox({ src, onClose }) {
    if (!src) return null;
    return (
        <motion.div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
            <button className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
                <X className="h-5 w-5" />
            </button>
            <img src={src} alt="Payment screenshot" className="max-h-[85vh] max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        </motion.div>
    );
}

function RejectPanel({ onCancel, onConfirm, submitting }) {
    const [note, setNote] = useState("");
    return (
        <div className="mt-2 flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: C.hair, background: C.hairSoft }}>
            <label className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: C.muted }}>
                Reason (shown to the buyer/seller)
            </label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                placeholder="e.g. UTR doesn't match any received payment, or screenshot amount doesn't match."
                className="w-full resize-none rounded-lg border bg-white px-3 py-2 text-[13px] font-medium tracking-wide focus:outline-none focus:ring-2"
                style={{ borderColor: C.hair, color: C.ink, ["--tw-ring-color"]: `${C.secondary}22` }} />
            <div className="flex justify-end gap-2">
                <button onClick={onCancel} className="rounded-lg border px-3 py-1.5 text-[12px] font-bold tracking-wide" style={{ borderColor: C.hair, color: C.muted }}>
                    Cancel
                </button>
                <button onClick={() => onConfirm(note)} disabled={!note.trim() || submitting}
                    className="rounded-lg px-3 py-1.5 text-[12px] font-bold tracking-wide text-white disabled:opacity-50"
                    style={{ background: C.danger }}>
                    {submitting ? "Rejecting…" : "Confirm reject"}
                </button>
            </div>
        </div>
    );
}

// ---------------- Order payment proof card (unchanged behavior) ----------------
function OrderProofCard({ proof, onVerify, onReject, onZoom, actioning, highlighted }) {
    const [rejecting, setRejecting] = useState(false);
    const order = proof.order;

    return (
        <div id={`payment-row-${proof.id}`}
            className="flex flex-col gap-3 rounded-2xl border p-4 transition-colors duration-700"
            style={{
                borderColor: highlighted ? C.secondary : C.hair,
                background: highlighted ? `${C.secondary}0d` : "transparent",
            }}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-[14px] font-extrabold tracking-wide" style={{ color: C.ink }}>{order?.order_number || "—"}</p>
                    <p className="text-[12px] font-semibold tracking-wide" style={{ color: C.muted }}>
                        {order?.buyer_contact_name} · {order?.buyer_contact_phone}
                    </p>
                    {order?.seller?.display_name && (
                        <p className="text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                            Seller: {order.seller.display_name}
                        </p>
                    )}
                </div>
                <div className="flex flex-col items-end gap-1">
                    <StatusPill status={proof.status} />
                    <span className="text-[16px] font-extrabold tabular-nums" style={{ color: C.ink }}>
                        ₹{Number(order?.total_amount ?? proof.amount_claimed ?? 0).toLocaleString("en-IN")}
                    </span>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-lg p-2.5" style={{ background: C.hairSoft }}>
                <div className="min-w-0 flex-1">
                    <p className="text-[10.5px] font-extrabold uppercase tracking-[0.08em]" style={{ color: C.muted }}>UTR / reference</p>
                    <p className="font-mono text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>{proof.utr_number}</p>
                </div>
                <div>
                    <p className="text-[10.5px] font-extrabold uppercase tracking-[0.08em]" style={{ color: C.muted }}>Submitted</p>
                    <p className="text-[12px] font-bold tracking-wide" style={{ color: C.ink }}>{formatDateTime(proof.created_at)}</p>
                </div>
                {proof.screenshot_url ? (
                    <button onClick={() => onZoom(proof.screenshot_url)}
                        className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-bold tracking-wide"
                        style={{ borderColor: C.hair, color: C.secondary }}>
                        <ZoomIn className="h-3.5 w-3.5" /> View screenshot
                    </button>
                ) : (
                    <span className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                        <ImageOff className="h-3.5 w-3.5" /> No screenshot
                    </span>
                )}
                {order?.id && (
                    <a href={`/seller/orders/${order.id}`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 text-[11.5px] font-bold tracking-wide" style={{ color: C.muted }}>
                        Order details <ExternalLink className="h-3 w-3" />
                    </a>
                )}
            </div>

            {proof.status === "rejected" && proof.admin_note && (
                <p className="rounded-lg px-2.5 py-2 text-[12px] font-semibold" style={{ background: "rgba(199,31,17,0.08)", color: C.danger }}>
                    Rejected: {proof.admin_note}
                </p>
            )}

            {proof.status === "pending" && (
                rejecting ? (
                    <RejectPanel
                        submitting={actioning === proof.id}
                        onCancel={() => setRejecting(false)}
                        onConfirm={(note) => onReject(proof.id, note)}
                    />
                ) : (
                    <div className="flex gap-2">
                        <button onClick={() => onVerify(proof.id)} disabled={actioning === proof.id}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-bold tracking-wide text-white disabled:opacity-50"
                            style={{ background: "linear-gradient(135deg,#15803d,#22c55e)" }}>
                            {actioning === proof.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Verify & notify seller
                        </button>
                        <button onClick={() => setRejecting(true)} disabled={actioning === proof.id}
                            className="flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-bold tracking-wide disabled:opacity-50"
                            style={{ borderColor: C.danger, color: C.danger }}>
                            <XCircle className="h-3.5 w-3.5" /> Reject
                        </button>
                    </div>
                )
            )}
        </div>
    );
}

// ---------------- Wallet top-up card (NEW) ----------------
// Amount here is the SELLER's own entered figure (wallet_payments.amount),
// not derived from an order — shown prominently since it's the number the
// admin is actually verifying against the UTR/screenshot.
function WalletProofCard({ proof, onVerify, onReject, onZoom, actioning, highlighted }) {
    const [rejecting, setRejecting] = useState(false);

    return (
        <div id={`payment-row-${proof.id}`}
            className="flex flex-col gap-3 rounded-2xl border p-4 transition-colors duration-700"
            style={{
                borderColor: highlighted ? C.secondary : C.hair,
                background: highlighted ? `${C.secondary}0d` : "transparent",
            }}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-[14px] font-extrabold tracking-wide" style={{ color: C.ink }}>
                        {proof.seller?.display_name || "Seller"}
                    </p>
                    <p className="text-[12px] font-semibold tracking-wide" style={{ color: C.muted }}>
                        {proof.seller?.shop_slug ? `/${proof.seller.shop_slug}` : "—"} · Wallet credit top-up
                    </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <StatusPill status={proof.status} />
                    <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide" style={{ background: "#7c3aed14", color: "#7c3aed" }}>
                        <Wallet className="h-3 w-3" /> Seller-entered amount
                    </span>
                    <span className="text-[16px] font-extrabold tabular-nums" style={{ color: C.ink }}>
                        ₹{Number(proof.amount || 0).toLocaleString("en-IN")}
                    </span>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-lg p-2.5" style={{ background: C.hairSoft }}>
                <div className="min-w-0 flex-1">
                    <p className="text-[10.5px] font-extrabold uppercase tracking-[0.08em]" style={{ color: C.muted }}>UTR / reference</p>
                    <p className="font-mono text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>{proof.utr || "—"}</p>
                </div>
                <div>
                    <p className="text-[10.5px] font-extrabold uppercase tracking-[0.08em]" style={{ color: C.muted }}>Submitted</p>
                    <p className="text-[12px] font-bold tracking-wide" style={{ color: C.ink }}>{formatDateTime(proof.created_at)}</p>
                </div>
                {proof.screenshot_url ? (
                    <button onClick={() => onZoom(proof.screenshot_url)}
                        className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-bold tracking-wide"
                        style={{ borderColor: C.hair, color: C.secondary }}>
                        <ZoomIn className="h-3.5 w-3.5" /> View screenshot
                    </button>
                ) : (
                    <span className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                        <ImageOff className="h-3.5 w-3.5" /> No screenshot
                    </span>
                )}
            </div>

            {proof.status === "rejected" && proof.rejection_reason && (
                <p className="rounded-lg px-2.5 py-2 text-[12px] font-semibold" style={{ background: "rgba(199,31,17,0.08)", color: C.danger }}>
                    Rejected: {proof.rejection_reason}
                </p>
            )}

            {proof.status === "pending" && (
                rejecting ? (
                    <RejectPanel
                        submitting={actioning === proof.id}
                        onCancel={() => setRejecting(false)}
                        onConfirm={(note) => onReject(proof.id, note)}
                    />
                ) : (
                    <div className="flex gap-2">
                        <button onClick={() => onVerify(proof.id)} disabled={actioning === proof.id}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-bold tracking-wide text-white disabled:opacity-50"
                            style={{ background: "linear-gradient(135deg,#15803d,#22c55e)" }}>
                            {actioning === proof.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Verify & add credits
                        </button>
                        <button onClick={() => setRejecting(true)} disabled={actioning === proof.id}
                            className="flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-bold tracking-wide disabled:opacity-50"
                            style={{ borderColor: C.danger, color: C.danger }}>
                            <XCircle className="h-3.5 w-3.5" /> Reject
                        </button>
                    </div>
                )
            )}
        </div>
    );
}

export default function PaymentVerificationPage() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();

    // Notification deep-links land here as /admin/payments?queue=wallet&
    // status=pending&highlight=<id> — read them once on mount so the page
    // opens on the right queue/tab instead of always defaulting to orders/pending.
    const [queue, setQueue] = useState(searchParams.get("queue") === "wallet" ? "wallet" : "orders");
    const [tab, setTab] = useState(searchParams.get("status") || "pending");
    const [highlightId, setHighlightId] = useState(searchParams.get("highlight") || null);

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actioning, setActioning] = useState(null);
    const [zoomSrc, setZoomSrc] = useState(null);

    useEffect(() => {
        if (!highlightId) return;
        const timer = setTimeout(() => {
            setHighlightId(null);
            const next = new URLSearchParams(searchParams);
            next.delete("highlight");
            setSearchParams(next, { replace: true });
        }, 3000);
        return () => clearTimeout(timer);
    }, [highlightId]); // eslint-disable-line react-hooks/exhaustive-deps

    const load = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        setError(null);
        try {
            const res = queue === "orders"
                ? await apiGet(`/admin/payment-proofs?status=${tab}`, token)
                : await apiGet(`/admin/wallet/payments?status=${tab}`, token);
            if (!res?.success) setError(res?.message || "Couldn't load payments.");
            else setItems(queue === "orders" ? (res.proofs || []) : (res.payments || []));
        } catch {
            setError("Couldn't reach the server. Please try again.");
        } finally {
            setLoading(false);
        }
    }, [token, queue, tab]);

    useEffect(() => { load(); }, [load]);

    const handleVerify = async (id) => {
        setActioning(id);
        const res = queue === "orders"
            ? await apiPost(`/admin/payment-proofs/${id}/verify`, token, { note: null })
            : await apiPost(`/admin/wallet/payments/${id}/verify`, token, { approve: true });
        setActioning(null);
        if (!res?.success) { setError(res?.message || "Couldn't verify this payment."); return; }
        setItems((prev) => prev.filter((p) => p.id !== id));
    };

    const handleReject = async (id, note) => {
        setActioning(id);
        const res = queue === "orders"
            ? await apiPost(`/admin/payment-proofs/${id}/reject`, token, { note })
            : await apiPost(`/admin/wallet/payments/${id}/verify`, token, { approve: false, rejectionReason: note });
        setActioning(null);
        if (!res?.success) { setError(res?.message || "Couldn't reject this payment."); return; }
        setItems((prev) => prev.filter((p) => p.id !== id));
    };

    return (
        <div className="mx-auto min-h-screen max-w-3xl px-4 py-6 sm:px-6">
            <div className="mb-5 flex items-center justify-between">
                <div>
                    <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: C.secondary }}>Admin</p>
                    <h1 className="text-[20px] font-extrabold tracking-wide" style={{ color: C.ink }}>Payment verification</h1>
                </div>
                <button onClick={load} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-bold tracking-wide" style={{ borderColor: C.hair, color: C.muted }}>
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </button>
            </div>

            {/* Which queue: order payments vs wallet top-ups */}
            <div className="mb-3 flex gap-1 rounded-xl p-1" style={{ background: C.hairSoft }}>
                {QUEUE_TABS.map(({ value, label, icon: Icon }) => (
                    <button key={value} onClick={() => { setQueue(value); setTab("pending"); }}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-bold tracking-wide transition-colors duration-150"
                        style={queue === value ? { background: C.ink, color: "#fff" } : { color: C.muted }}>
                        <Icon className="h-3.5 w-3.5" /> {label}
                    </button>
                ))}
            </div>

            {/* Status within that queue */}
            <div className="mb-4 flex gap-1 rounded-xl p-1" style={{ background: C.hairSoft }}>
                {ORDER_TABS.map(({ value, label, icon: Icon }) => (
                    <button key={value} onClick={() => setTab(value)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-bold tracking-wide transition-colors duration-150"
                        style={tab === value ? { background: C.secondary, color: "#fff" } : { color: C.muted }}>
                        <Icon className="h-3.5 w-3.5" /> {label}
                    </button>
                ))}
            </div>

            {error && (
                <p className="mb-4 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ background: "rgba(199,31,17,0.08)", color: C.danger }}>
                    <AlertCircle className="h-3.5 w-3.5" /> {error}
                </p>
            )}

            {loading ? (
                <div className="flex justify-center py-14"><Loader2 className="h-6 w-6 animate-spin" style={{ color: C.muted }} /></div>
            ) : items.length === 0 ? (
                <p className="rounded-2xl border py-14 text-center text-[13px] font-semibold tracking-wide" style={{ borderColor: C.hair, color: C.muted }}>
                    Nothing here right now.
                </p>
            ) : (
                <div className="flex flex-col gap-3">
                    {items.map((item) => (
                        queue === "orders" ? (
                            <OrderProofCard key={item.id} proof={item} actioning={actioning} highlighted={item.id === highlightId}
                                onVerify={handleVerify} onReject={handleReject} onZoom={setZoomSrc} />
                        ) : (
                            <WalletProofCard key={item.id} proof={item} actioning={actioning} highlighted={item.id === highlightId}
                                onVerify={handleVerify} onReject={handleReject} onZoom={setZoomSrc} />
                        )
                    ))}
                </div>
            )}

            <AnimatePresence>
                {zoomSrc && <ImageLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />}
            </AnimatePresence>
        </div>
    );
}