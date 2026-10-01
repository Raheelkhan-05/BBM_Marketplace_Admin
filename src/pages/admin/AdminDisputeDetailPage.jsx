// pages/admin/AdminDisputeDetailPage.jsx — everything the admin needs to decide a dispute fairly
import { useState, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft, Loader2, ExternalLink } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { C } from "../../components/catalog/tokens";
import {
    fetchAdminDispute, adminStartDisputeReview, adminPostDisputeMessage, adminResolveDispute,
} from "../../utils/api.disputes.js";
import { Chip, EvidenceList, fmtDateTime, inr } from "../../components/orders/disputeUi.jsx";
import {
    DISPUTE_CATEGORIES, DESIRED_RESOLUTIONS, DISPUTE_STATUS_LABELS, RESOLUTION_LABELS, findCategory, labelFor,
} from "../../../shared/disputeConfig.js";

const STATUS_TONE = { open: "warn", under_review: "info", resolved: "success" };
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function Card({ title, children, right }) {
    return (
        <div className="mt-4 rounded-2xl border bg-white p-4" style={{ borderColor: C.hair }}>
            <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-extrabold uppercase tracking-[0.08em]" style={{ color: "#4A535B" }}>{title}</p>
                {right}
            </div>
            <div className="mt-3">{children}</div>
        </div>
    );
}
function KV({ label, children }) {
    if (children == null || children === "") return null;
    return (
        <div className="flex items-start justify-between gap-4 py-1 text-[12.5px] tracking-wide">
            <span className="shrink-0 font-semibold" style={{ color: C.muted }}>{label}</span>
            <span className="min-w-0 break-words text-right font-bold" style={{ color: C.ink }}>{children}</span>
        </div>
    );
}
const Link = ({ href, children }) => href
    ? <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline" style={{ color: C.secondary }}>{children}<ExternalLink className="h-3 w-3" /></a>
    : null;

function addressLine(a = {}) {
    return [a.address_line1, a.address_line2, a.city, a.state].filter(Boolean).join(", ") + (a.pincode ? ` - ${a.pincode}` : "");
}

function ResolutionForm({ data, onDone }) {
    const { token } = useAuth();
    const { dispute, order } = data;
    const applicable = order.settlement_status === "disputed";
    const gross = Number(order.settlement_gross) || 0;
    const sellerAmt = Number(order.settlement_seller_amount) || 0;

    const [preset, setPreset] = useState(applicable ? "" : "none");
    const [refund, setRefund] = useState("0");
    const [payout, setPayout] = useState("0");
    const [note, setNote] = useState("");
    const [internal, setInternal] = useState(dispute.admin_internal_note || "");
    const [reverse, setReverse] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const applyPreset = (p) => {
        setPreset(p);
        if (p === "release") { setRefund("0"); setPayout(String(sellerAmt)); setReverse(false); }
        if (p === "refund") { setRefund(String(gross)); setPayout("0"); setReverse(true); }
        if (p === "split") { setRefund(String(round2(gross / 2))); setPayout(String(round2(sellerAmt / 2))); setReverse(false); }
        if (p === "custom") { /* keep current numbers */ }
    };

    const r = Number(refund) || 0, p = Number(payout) || 0;
    const retained = round2(gross - r - p);
    let problem = null;
    if (applicable) {
        if (r < 0 || p < 0 || r + p <= 0) problem = "Enter amounts — at least one must be above zero.";
        else if (r > gross + 0.005) problem = `Refund can't exceed ₹${inr(gross)} (what the buyer paid).`;
        else if (p > sellerAmt + 0.005) problem = `Seller payout can't exceed ₹${inr(sellerAmt)} (the seller's receivable).`;
        else if (r + p > gross + 0.005) problem = `Refund + payout can't exceed ₹${inr(gross)}.`;
    }
    const ready = (!applicable || (!!preset && !problem)) && note.trim().length >= 5 && !busy;

    const submit = async () => {
        if (!ready) return;
        const summary = applicable
            ? `Refund buyer ₹${inr(r)}, pay seller ₹${inr(p)}${retained > 0.005 ? `, marketplace retains ₹${inr(retained)}` : ""}.`
            : "Close this dispute with no financial action.";
        if (!window.confirm(`${summary}\n\nThis can't be undone and both parties will be notified. Continue?`)) return;
        setBusy(true); setError(null);
        const res = await adminResolveDispute(token, dispute.id, {
            refundAmount: applicable ? r : 0, sellerPayoutAmount: applicable ? p : 0,
            resolutionNote: note.trim(), internalNote: internal.trim(), reverseCommission: applicable && reverse && r > 0,
        });
        setBusy(false);
        if (!res?.success) { setError(res?.message || "Couldn't resolve the dispute."); return; }
        onDone();
    };

    const presetBtn = (key, label) => (
        <button key={key} type="button" onClick={() => applyPreset(key)} className="rounded-full border px-3 py-1.5 text-[11.5px] font-bold tracking-wide"
            style={{ borderColor: preset === key ? C.secondary : C.hair, background: preset === key ? `${C.secondary}12` : "#fff", color: preset === key ? C.secondary : C.muted }}>{label}</button>
    );
    const numInput = (value, set, label, max) => (
        <div className="flex-1">
            <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>{label}</label>
            <input type="text" inputMode="decimal" value={value} disabled={busy}
                onChange={(e) => { set(e.target.value.replace(/[^\d.]/g, "")); setPreset("custom"); }}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-[13.5px] font-bold tabular-nums" style={{ borderColor: C.hair }} />
            <p className="mt-0.5 text-[10.5px] font-medium" style={{ color: C.muted }}>max ₹{inr(max)}</p>
        </div>
    );

    return (
        <Card title="Resolve dispute">
            {applicable ? (
                <>
                    <p className="text-[12px] font-medium" style={{ color: C.muted }}>
                        Buyer paid <b style={{ color: C.ink }}>₹{inr(gross)}</b> · seller's receivable <b style={{ color: C.ink }}>₹{inr(sellerAmt)}</b>. Pick a starting point, then adjust.
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {presetBtn("release", "Release full to seller")}{presetBtn("refund", "Full refund to buyer")}{presetBtn("split", "Split 50/50")}{presetBtn("custom", "Custom")}
                    </div>
                    <div className="mt-3 flex gap-3">
                        {numInput(refund, setRefund, "Refund to buyer (₹)", gross)}
                        {numInput(payout, setPayout, "Pay to seller (₹)", sellerAmt)}
                    </div>
                    <p className="mt-2 text-[12px] font-semibold" style={{ color: problem ? "#c71f11" : C.muted }}>
                        {problem || (retained > 0.005 ? `Marketplace retains ₹${inr(retained)}.` : "Fully allocated.")}
                    </p>
                    <label className="mt-3 flex items-start gap-2 text-[12.5px] font-semibold" style={{ color: C.ink }}>
                        <input type="checkbox" checked={reverse} disabled={busy || r <= 0} onChange={(e) => setReverse(e.target.checked)} className="mt-0.5" />
                        <span>Also reverse the seller's Promotion & Visibility fee for this order (wallet) <span style={{ color: C.muted }}>— usually for full refunds.</span></span>
                    </label>
                </>
            ) : (
                <p className="rounded-lg px-3 py-2.5 text-[12.5px] font-semibold" style={{ background: "#fafbfb", color: C.muted }}>
                    No marketplace funds are held for this order (credit / non-marketplace payment), so resolving records the decision only.
                </p>
            )}

            <label className="mt-4 block text-[12px] font-bold tracking-wide" style={{ color: C.ink }}>Decision note — shown to BOTH buyer and seller</label>
            <textarea value={note} rows={4} disabled={busy} onChange={(e) => setNote(e.target.value)} placeholder="Explain what you reviewed and why you decided this way."
                className="mt-1.5 w-full resize-none rounded-xl border px-3 py-2.5 text-[13px] font-medium outline-none" style={{ borderColor: C.hair }} />
            <label className="mt-3 block text-[12px] font-bold tracking-wide" style={{ color: C.muted }}>Internal note — admin only</label>
            <textarea value={internal} rows={2} disabled={busy} onChange={(e) => setInternal(e.target.value)}
                className="mt-1.5 w-full resize-none rounded-xl border px-3 py-2.5 text-[13px] font-medium outline-none" style={{ borderColor: C.hair }} />

            {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{error}</p>}
            <button type="button" disabled={!ready} onClick={submit} className="mt-3 flex w-full items-center justify-center rounded-xl px-4 py-3 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.secondary }}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm resolution"}
            </button>
        </Card>
    );
}

export default function AdminDisputeDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { token } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [actionError, setActionError] = useState(null);

    const load = useCallback(async () => {
        const res = await fetchAdminDispute(token, id);
        if (res?.success) { setData(res); setError(null); } else setError(res?.message || "Couldn't load this dispute.");
        setLoading(false);
    }, [token, id]);
    useEffect(() => { load(); }, [load]);

    const timeline = useMemo(() => {
        if (!data) return [];
        const items = [
            ...data.orderEvents.map((e) => ({ at: e.created_at, kind: "Order", tone: "neutral", text: `Status → ${String(e.to_status || "").replace(/_/g, " ")}${e.note ? ` — ${e.note}` : ""}` })),
            ...data.disputeEvents.map((e) => ({ at: e.created_at, kind: "Dispute", tone: "warn", text: `${e.actor_role}: ${e.event_type.replace(/_/g, " ")}${e.note ? ` — ${e.note}` : ""}` })),
            ...data.walletTransactions.map((t) => ({ at: t.created_at, kind: "Wallet", tone: "violet", text: `${String(t.type || "").replace(/_/g, " ")} ₹${inr(t.amount)}${t.note ? ` — ${t.note}` : ""}` })),
            ...data.ledger.map((l) => ({ at: l.created_at, kind: "Ledger", tone: "success", text: `${l.entry_type === "seller_payout" ? "Payout to seller" : "Refund to buyer"} ₹${inr(l.amount)} · ${l.reference}` })),
        ];
        return items.sort((a, b) => new Date(a.at) - new Date(b.at));
    }, [data]);

    if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: C.muted }} /></div>;
    if (!data) return <div className="px-4 py-16 text-center text-[13px] font-semibold" style={{ color: C.muted }}>{error || "Not found."}<div><button onClick={() => navigate("/disputes")} className="mt-3 font-bold" style={{ color: C.secondary }}>Back to disputes</button></div></div>;

    const { dispute, order, buyer, seller } = data;
    const category = findCategory(dispute.category);
    const resolved = dispute.status === "resolved";
    const addr = order.shipping_address_snapshot || {};
    const sellerShop = seller.shop || {};
    const rate = seller.deliveredOrderCount ? Math.round((seller.disputeCount / seller.deliveredOrderCount) * 1000) / 10 : null;
    const wallet = seller.wallet || {};

    const startReview = async () => {
        setBusy(true); setActionError(null);
        const res = await adminStartDisputeReview(token, id);
        setBusy(false);
        if (!res?.success) setActionError(res?.message || "Couldn't start review.");
        load();
    };
    const sendMessage = async () => {
        if (message.trim().length < 3 || busy) return;
        setBusy(true); setActionError(null);
        const res = await adminPostDisputeMessage(token, id, message.trim());
        setBusy(false);
        if (!res?.success) { setActionError(res?.message || "Couldn't send the message."); return; }
        setMessage(""); load();
    };

    return (
        <div className="mx-auto min-h-screen max-w-3xl px-2.5 pb-16 pt-3 sm:px-4">
            <div className="mt-3 flex items-center gap-3">
                <button onClick={() => navigate("/disputes")} className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: C.hair, color: C.ink }} aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate font-extrabold tracking-wide" style={{ color: C.ink, fontSize: "clamp(17px,1.6vw,22px)" }}>{dispute.dispute_number}</h1>
                    <p className="font-mono text-[12px] font-semibold" style={{ color: C.muted }}>Order {order.order_number} · raised {fmtDateTime(dispute.created_at)}</p>
                </div>
                <Chip tone={STATUS_TONE[dispute.status]}>{DISPUTE_STATUS_LABELS[dispute.status]}</Chip>
            </div>
            {actionError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{actionError}</p>}

            {dispute.status === "open" && (
                <button onClick={startReview} disabled={busy} className="mt-4 w-full rounded-xl border px-4 py-2.5 text-[13px] font-bold disabled:opacity-50" style={{ borderColor: C.secondary, color: C.secondary }}>
                    {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Start review (assign to me)"}
                </button>
            )}

            <Card title="Money">
                <KV label="Buyer paid">₹{inr(order.settlement_gross ?? order.total_amount)}</KV>
                <KV label="Seller's receivable">₹{inr(order.settlement_seller_amount ?? order.subtotal_amount)}</KV>
                <KV label="Settlement status"><Chip tone={order.settlement_status === "disputed" ? "warn" : "neutral"}>{String(order.settlement_status).replace(/_/g, " ")}</Chip></KV>
                <KV label="Payment">{[order.payment_method, order.payment_status].filter(Boolean).join(" · ")}</KV>
                {data.orderGroup && <KV label="Paid in group">#{data.orderGroup.group_number} (group total ₹{inr(data.orderGroup.total_amount)}, {data.orderGroup.payment_status})</KV>}
                <KV label="Platform fee">{order.platform_fee_percent != null ? `${order.platform_fee_percent}% · ₹${inr(order.platform_fee_amount)} (seller wallet)` : null}</KV>
                <KV label="Delivered">{fmtDateTime(order.delivered_at)}</KV>
                <KV label="Dispute window ended">{fmtDateTime(order.dispute_window_ends_at)}</KV>
            </Card>

            <Card title="Buyer's complaint">
                <p className="text-[14px] font-extrabold tracking-wide" style={{ color: C.ink }}>{labelFor(DISPUTE_CATEGORIES, dispute.category)}</p>
                <p className="text-[12.5px] font-semibold" style={{ color: C.muted }}>{category?.subReasons.find((s) => s.code === dispute.sub_reason)?.label}</p>
                {(category?.detailFields || []).map((f) => {
                    const v = dispute.details?.[f.key];
                    return v ? <KV key={f.key} label={f.label}>{f.type === "select" ? (f.options.find((o) => o.value === v)?.label || v) : v}</KV> : null;
                })}
                <p className="mt-2 whitespace-pre-wrap text-[13px] font-medium leading-relaxed" style={{ color: C.ink }}>{dispute.description}</p>
                <EvidenceList items={dispute.evidence_urls} />
                <p className="mt-2 text-[12px] font-semibold" style={{ color: C.muted }}>Wants: {labelFor(DESIRED_RESOLUTIONS, dispute.desired_resolution)}</p>
            </Card>

            <Card title="Seller's response">
                {dispute.seller_response ? (
                    <>
                        <p className="whitespace-pre-wrap text-[13px] font-medium leading-relaxed" style={{ color: C.ink }}>{dispute.seller_response}</p>
                        <EvidenceList items={dispute.seller_response_evidence} />
                        <p className="mt-2 text-[11.5px] font-semibold" style={{ color: C.muted }}>Responded {fmtDateTime(dispute.seller_responded_at)}</p>
                    </>
                ) : <p className="text-[12.5px] font-semibold" style={{ color: C.muted }}>The seller hasn't responded yet.</p>}
            </Card>

            <div className="grid gap-0 sm:grid-cols-2 sm:gap-4">
                <Card title="Buyer">
                    <KV label="Name">{buyer.profile?.name || order.buyer_contact_name}</KV>
                    <KV label="Email">{buyer.profile?.email}</KV>
                    <KV label="Phone">{buyer.profile?.phone || order.buyer_contact_phone}</KV>
                    <KV label="Verified">{[buyer.profile?.email_verified && "email", buyer.profile?.phone_verified && "phone"].filter(Boolean).join(", ") || "no"}</KV>
                    <KV label="Business">{buyer.business?.trade_name || buyer.business?.legal_name || order.buyer_business_name}</KV>
                    <KV label="GSTIN">{buyer.business?.gstin || order.buyer_gstin}{order.buyer_gst_verified ? " ✓" : ""}</KV>
                    <KV label="Deliver to">{[addr.contact_name, addressLine(addr)].filter(Boolean).join(" · ")}</KV>
                    <KV label="Disputes raised (all time)">{buyer.disputeCount}</KV>
                    {buyer.pastDisputes.map((d) => <KV key={d.id} label={d.dispute_number}>{labelFor(DISPUTE_CATEGORIES, d.category)} · {RESOLUTION_LABELS[d.resolution_type] || d.status}</KV>)}
                </Card>
                <Card title="Seller">
                    <KV label="Shop">{sellerShop.display_name}</KV>
                    <KV label="Location">{[sellerShop.city, sellerShop.state].filter(Boolean).join(", ")}</KV>
                    <KV label="Contact">{seller.user?.name}</KV>
                    <KV label="Email">{seller.user?.email}</KV>
                    <KV label="Phone">{seller.user?.phone}</KV>
                    <KV label="Business">{seller.business?.trade_name || seller.business?.legal_name}</KV>
                    <KV label="GSTIN">{seller.business?.gstin}</KV>
                    <KV label="Wallet">{wallet.is_blocked ? "Blocked" : "Active"}{wallet.balance_due != null ? ` · ₹${inr(wallet.balance_due)} due` : ""}</KV>
                    <KV label="Delivered orders">{seller.deliveredOrderCount}</KV>
                    <KV label="Disputes (all time)">{seller.disputeCount}{rate != null ? ` · ${rate}% of delivered` : ""}</KV>
                    {seller.pastDisputes.map((d) => <KV key={d.id} label={d.dispute_number}>{labelFor(DISPUTE_CATEGORIES, d.category)} · {RESOLUTION_LABELS[d.resolution_type] || d.status}</KV>)}
                </Card>
            </div>

            <Card title="Order & shipment">
                {(order.items || []).map((it) => (
                    <div key={it.id} className="flex items-center gap-3 border-b py-2 last:border-b-0" style={{ borderColor: C.hairSoft }}>
                        {it.image_snapshot && <img src={it.image_snapshot} alt="" className="h-10 w-10 rounded-lg border object-cover" style={{ borderColor: C.hair }} />}
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-bold" style={{ color: C.ink }}>{it.product_name_snapshot}</p>
                            <p className="text-[11.5px] font-semibold" style={{ color: C.muted }}>{it.pack_quantity_snapshot ?? it.quantity} × ₹{inr(it.unit_price)} · {it.quantity} {it.unit}</p>
                        </div>
                        <p className="text-[13px] font-extrabold tabular-nums" style={{ color: C.ink }}>₹{inr(it.line_total)}</p>
                    </div>
                ))}
                <div className="mt-2">
                    <KV label="Transport">{order.transport_mode ? String(order.transport_mode).replace(/_/g, " ") : null}</KV>
                    {order.transport_fields && Object.entries(order.transport_fields).filter(([, v]) => v).map(([k, v]) => <KV key={k} label={k.replace(/_/g, " ")}>{String(v)}</KV>)}
                    <KV label="LR / tracking no.">{order.ship_lr_number}</KV>
                    <KV label="LR notes">{order.ship_lr_notes}</KV>
                    <KV label="LR document"><Link href={order.ship_lr_proof_url}>Open</Link></KV>
                    <KV label="Bill"><Link href={order.ship_bill_url}>Open</Link></KV>
                    <KV label="Buyer's note to seller">{order.buyer_notes}</KV>
                </div>
            </Card>

            <Card title="Complete log">
                <div className="flex flex-col gap-2.5">
                    {timeline.map((t, i) => (
                        <div key={i} className="flex gap-2.5">
                            <Chip tone={t.tone} className="h-fit shrink-0">{t.kind}</Chip>
                            <div className="min-w-0">
                                <p className="break-words text-[12.5px] font-semibold leading-snug" style={{ color: C.ink }}>{t.text}</p>
                                <p className="text-[11px] font-medium" style={{ color: C.muted }}>{fmtDateTime(t.at)}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            {!resolved && (
                <Card title="Message both parties">
                    <textarea value={message} rows={2} maxLength={1000} disabled={busy} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Please share the LR delivery proof by tomorrow."
                        className="w-full resize-none rounded-xl border px-3 py-2.5 text-[13px] font-medium outline-none" style={{ borderColor: C.hair }} />
                    <button onClick={sendMessage} disabled={busy || message.trim().length < 3} className="mt-2 rounded-lg border px-4 py-2 text-[12.5px] font-bold disabled:opacity-50" style={{ borderColor: C.hair, color: C.secondary }}>Send to buyer & seller</button>
                </Card>
            )}

            {resolved ? (
                <Card title="Resolution">
                    <KV label="Decision">{RESOLUTION_LABELS[dispute.resolution_type]}</KV>
                    <KV label="Refunded to buyer">{Number(dispute.refund_amount) > 0 ? `₹${inr(dispute.refund_amount)}` : null}</KV>
                    <KV label="Released to seller">{Number(dispute.seller_payout_amount) > 0 ? `₹${inr(dispute.seller_payout_amount)}` : null}</KV>
                    <KV label="Retained by marketplace">{Number(dispute.retained_amount) > 0 ? `₹${inr(dispute.retained_amount)}` : null}</KV>
                    <KV label="Resolved">{fmtDateTime(dispute.resolved_at)}</KV>
                    <p className="mt-2 whitespace-pre-wrap text-[12.5px] font-medium" style={{ color: C.ink }}>{dispute.resolution_note}</p>
                    {dispute.admin_internal_note && <p className="mt-2 rounded-lg px-3 py-2 text-[12px] font-medium" style={{ background: "#fafbfb", color: C.muted }}>Internal: {dispute.admin_internal_note}</p>}
                </Card>
            ) : <ResolutionForm data={data} onDone={load} />}
        </div>
    );
}