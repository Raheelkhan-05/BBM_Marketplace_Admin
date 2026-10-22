// components/orders/DisputePanel.jsx
//
//  <DisputePanel order viewer="buyer"|"seller" onChanged />   — order DETAIL pages
//  <SellerOrderCardNote order />                               — seller order LIST card
//
// The panel owns its own data (GET /orders/:id/dispute or /seller/orders/:id/dispute) and
// refetches whenever the order's status / dispute / settlement state changes (the order
// itself arrives through useRealtimeOrder, so this stays live).
import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldAlert, Clock, Wallet, CheckCircle2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { C } from "../catalog/tokens.js";
import { fetchBuyerDispute, fetchSellerDispute, respondToDispute } from "../../utils/api.disputes.js";
import RaiseDisputeModal from "./RaiseDisputeModal.jsx";
import { Chip, EvidenceList, FilePicker, fmtDateTime, formatRemaining, inr, useNow } from "./disputeUi.jsx";
import {
    CANCEL_REASONS, DESIRED_RESOLUTIONS, DISPUTE_STATUS_LABELS, RESOLUTION_LABELS,
    findCategory, labelFor, MIN_DESCRIPTION_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_EVIDENCE_FILES, MAX_EVIDENCE_BYTES, EVIDENCE_MIME_TYPES,
} from "../../../shared/disputeConfig.js";

const STATUS_TONE = { open: "warn", under_review: "info", resolved: "success" };
const EVENT_LABELS = {
    raised: "Dispute raised by buyer",
    seller_responded: "Seller responded",
    under_review: "Review started",
    admin_message: "Message from our team",
    resolved: "Dispute resolved",
};
const ACTOR_LABELS = { buyer: "Buyer", seller: "Seller", admin: "Admin team", system: "System" };

function Section({ title, children, className = "" }) {
    return (
        <div className={`mt-4 rounded-2xl border bg-white p-4 ${className}`} style={{ borderColor: C.hair }}>
            {title && <p className="text-[12px] font-extrabold uppercase tracking-[0.08em]" style={{ color: "#4A535B" }}>{title}</p>}
            <div className={title ? "mt-3" : ""}>{children}</div>
        </div>
    );
}

function Row({ label, children }) {
    return (
        <div className="flex items-start justify-between gap-4 py-1 text-[12.5px] tracking-wide">
            <span className="shrink-0 font-semibold" style={{ color: C.muted }}>{label}</span>
            <span className="text-right font-bold" style={{ color: C.ink }}>{children}</span>
        </div>
    );
}

function CancelReasonCard({ order }) {
    if (!order.cancel_reason_code) return null;
    return (
        <Section title="Cancellation reason">
            <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>{labelFor(CANCEL_REASONS, order.cancel_reason_code)}</p>
            {order.cancel_reason_text && <p className="mt-1.5 text-[12.5px] font-medium italic leading-relaxed tracking-wide" style={{ color: C.muted }}>"{order.cancel_reason_text}"</p>}
        </Section>
    );
}

function SettlementLine({ order, viewer, now }) {
    const amount = inr(order.settlement_seller_amount);
    const msLeft = order.dispute_window_ends_at ? new Date(order.dispute_window_ends_at).getTime() - now : 0;
    const base = "flex items-start gap-2 rounded-xl px-3.5 py-3 text-[12.5px] font-semibold leading-snug tracking-wide";

    if (order.settlement_status === "held") {
        return (
            <div className={base} style={{ background: "#0B72850D", color: C.ink }}>
                <Clock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#0B7285" }} />
                <span>
                    {viewer === "seller"
                        ? <>Your payout of <b>₹{amount}</b> is on hold for the buyer's dispute window. It's released to your bank account automatically {msLeft > 0 ? <>in <b>{formatRemaining(msLeft)}</b> </> : null}if no dispute is raised.</>
                        : <>The seller is paid only after the dispute window closes{msLeft > 0 ? <> in <b>{formatRemaining(msLeft)}</b></> : null}.</>}
                </span>
            </div>
        );
    }
    if (order.settlement_status === "disputed") {
        return (
            <div className={base} style={{ background: "#f59e0b1a", color: "#92600A" }}>
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{viewer === "seller" ? "Your payout for this order is on hold until our team resolves the dispute." : "The seller's payment is on hold until our team resolves this dispute."}</span>
            </div>
        );
    }
    if (order.settlement_status === "released" && viewer === "seller") {
        return (
            <div className={base} style={{ background: "#05966912", color: "#047857" }}>
                <Wallet className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Payout of <b>₹{amount}</b> released{order.settlement_released_at ? ` on ${fmtDateTime(order.settlement_released_at)}` : ""}.</span>
            </div>
        );
    }
    return null;
}

function SellerResponseForm({ order, onSent }) {
    const { token } = useAuth();
    const [text, setText] = useState("");
    const [files, setFiles] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const ok = text.trim().length >= MIN_DESCRIPTION_LENGTH && !busy;

    const submit = async () => {
        if (!ok) return;
        setBusy(true); setError(null);
        const fd = new FormData();
        fd.append("response", text.trim());
        files.forEach((f) => fd.append("evidence", f));
        const res = await respondToDispute(token, order.id, fd);
        setBusy(false);
        if (!res?.success) { setError(res?.message || "Couldn't submit your response."); return; }
        setText(""); setFiles([]);
        onSent();
    };

    return (
        <div className="mt-4 border-t pt-4" style={{ borderColor: C.hairSoft }}>
            <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>Your response</p>
            <p className="mt-0.5 text-[11.5px] font-medium tracking-wide" style={{ color: C.muted }}>Share your side with proof (LR, delivery photo, chat history). Our team reviews both sides before deciding.</p>
            <textarea value={text} rows={4} maxLength={MAX_DESCRIPTION_LENGTH} disabled={busy} onChange={(e) => setText(e.target.value)}
                className="mt-2 w-full resize-none rounded-xl border px-3 py-2.5 text-[13px] font-medium outline-none focus:border-[#0B7285]" style={{ borderColor: C.hair, color: C.ink }} />
            <div className="mt-2.5">
                <FilePicker files={files} onChange={setFiles} max={MAX_EVIDENCE_FILES} maxBytes={MAX_EVIDENCE_BYTES} accept={EVIDENCE_MIME_TYPES} disabled={busy} />
            </div>
            {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{error}</p>}
            <button type="button" disabled={!ok} onClick={submit}
                className="mt-3 flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.secondary }}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit response"}
            </button>
        </div>
    );
}

function DisputeDetails({ order, dispute, events, viewer, onReload }) {
    const category = findCategory(dispute.category);
    const subLabel = category?.subReasons.find((s) => s.code === dispute.sub_reason)?.label;
    const detailRows = (category?.detailFields || [])
        .map((f) => {
            const v = dispute.details?.[f.key];
            if (!v) return null;
            return { label: f.label, value: f.type === "select" ? (f.options.find((o) => o.value === v)?.label || v) : v };
        }).filter(Boolean);
    const resolved = dispute.status === "resolved";

    return (
        <Section>
            <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-extrabold uppercase tracking-[0.08em]" style={{ color: "#4A535B" }}>Dispute {dispute.dispute_number}</p>
                <Chip tone={STATUS_TONE[dispute.status]}>{DISPUTE_STATUS_LABELS[dispute.status]}</Chip>
            </div>

            <div className="mt-3">
                <p className="text-[14px] font-extrabold tracking-wide" style={{ color: C.ink }}>{category?.label || dispute.category}</p>
                {subLabel && <p className="text-[12.5px] font-semibold tracking-wide" style={{ color: C.muted }}>{subLabel}</p>}
                {detailRows.map((r) => <Row key={r.label} label={r.label}>{r.value}</Row>)}
                <p className="mt-2 whitespace-pre-wrap text-[12.5px] font-medium leading-relaxed tracking-wide" style={{ color: C.ink }}>{dispute.description}</p>
                <EvidenceList items={dispute.evidence_urls} />
                <p className="mt-2 text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                    Buyer is asking for: {labelFor(DESIRED_RESOLUTIONS, dispute.desired_resolution)} · raised {fmtDateTime(dispute.created_at)}
                </p>
            </div>

            {dispute.seller_response && (
                <div className="mt-4 rounded-xl px-3.5 py-3" style={{ background: "#fafbfb" }}>
                    <p className="text-[11.5px] font-extrabold uppercase tracking-[0.06em]" style={{ color: C.muted }}>Seller's response · {fmtDateTime(dispute.seller_responded_at)}</p>
                    <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] font-medium leading-relaxed tracking-wide" style={{ color: C.ink }}>{dispute.seller_response}</p>
                    <EvidenceList items={dispute.seller_response_evidence} />
                </div>
            )}

            {resolved && (
                <div className="mt-4 rounded-xl px-3.5 py-3" style={{ background: "#05966910" }}>
                    <p className="flex items-center gap-1.5 text-[13px] font-extrabold tracking-wide" style={{ color: "#047857" }}>
                        <CheckCircle2 className="h-4 w-4" /> {RESOLUTION_LABELS[dispute.resolution_type] || "Resolved"}
                    </p>
                    {dispute.resolution_type !== "no_financial_action" && (
                        <div className="mt-1.5">
                            {Number(dispute.refund_amount) > 0 && <Row label="Refunded to buyer">₹{inr(dispute.refund_amount)}</Row>}
                            {Number(dispute.seller_payout_amount) > 0 && <Row label="Released to seller">₹{inr(dispute.seller_payout_amount)}</Row>}
                        </div>
                    )}
                    {dispute.resolution_note && <p className="mt-2 whitespace-pre-wrap text-[12.5px] font-medium leading-relaxed tracking-wide" style={{ color: C.ink }}>{dispute.resolution_note}</p>}
                    <p className="mt-1.5 text-[11px] font-semibold tracking-wide" style={{ color: C.muted }}>Decided {fmtDateTime(dispute.resolved_at)} by our admin team</p>
                </div>
            )}

            {events.length > 0 && (
                <div className="mt-4">
                    <p className="text-[11.5px] font-extrabold uppercase tracking-[0.06em]" style={{ color: C.muted }}>Activity</p>
                    <div className="mt-2 flex flex-col gap-2.5">
                        {events.map((e) => (
                            <div key={e.id} className="flex gap-2.5">
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.secondary }} />
                                <div className="min-w-0">
                                    <p className="text-[12.5px] font-bold tracking-wide" style={{ color: C.ink }}>
                                        {EVENT_LABELS[e.event_type] || e.event_type}
                                        <span className="ml-1.5 font-medium" style={{ color: C.muted }}>· {ACTOR_LABELS[e.actor_role]} · {fmtDateTime(e.created_at)}</span>
                                    </p>
                                    {e.event_type === "admin_message" && e.note && <p className="mt-0.5 text-[12.5px] font-medium leading-relaxed tracking-wide" style={{ color: C.muted }}>{e.note}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {viewer === "seller" && !resolved && <SellerResponseForm order={order} onSent={onReload} />}
        </Section>
    );
}

export default function DisputePanel({ order, viewer, onChanged }) {
    const { token } = useAuth();
    const now = useNow(30000);
    const [state, setState] = useState({ loading: false, dispute: null, events: [] });
    const [raiseOpen, setRaiseOpen] = useState(false);
    const [raised, setRaised] = useState(false);

    const eligible = order?.status === "delivered" && order?.order_type !== "sample";

    const load = useCallback(async () => {
        if (!order?.id || !eligible) return;
        const res = viewer === "seller" ? await fetchSellerDispute(token, order.id) : await fetchBuyerDispute(token, order.id);
        if (res?.success) setState({ loading: false, dispute: res.dispute, events: res.events || [] });
        else setState((s) => ({ ...s, loading: false }));
    }, [token, order?.id, eligible, viewer]);

    useEffect(() => {
        if (!eligible) { setState({ loading: false, dispute: null, events: [] }); return; }
        setState((s) => ({ ...s, loading: s.dispute === null }));
        load();
    }, [load, eligible, order?.dispute_status, order?.settlement_status, order?.updated_at]);

    if (!order) return null;
    if (order.status === "cancelled") return <CancelReasonCard order={order} />;
    if (!eligible) return null;

    const afterChange = () => { load(); onChanged?.(); };
    const msLeft = order.dispute_window_ends_at ? new Date(order.dispute_window_ends_at).getTime() - now : 0;
    const windowOpen = msLeft > 0;

    if (state.loading && !state.dispute) {
        return <div className="mt-4 flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" style={{ color: C.muted }} /></div>;
    }

    if (state.dispute) {
        return (
            <>
                <div className="mt-4"><SettlementLine order={order} viewer={viewer} now={now} /></div>
                <DisputeDetails order={order} dispute={state.dispute} events={state.events} viewer={viewer} onReload={afterChange} />
            </>
        );
    }

    // No dispute yet
    return (
        <>
            {viewer === "seller" ? (
                <div className="mt-4"><SettlementLine order={order} viewer="seller" now={now} /></div>
            ) : (
                <Section>
                    {windowOpen ? (
                        <>
                            <p className="text-[14px] font-extrabold tracking-wide" style={{ color: C.ink }}>Something wrong with your order?</p>
                            <p className="mt-1 text-[12.5px] font-medium leading-relaxed tracking-wide" style={{ color: C.muted }}>
                                You can report a problem until <b style={{ color: C.ink }}>{fmtDateTime(order.dispute_window_ends_at)}</b> ({formatRemaining(msLeft)} left). The seller's payment stays on hold until then.
                            </p>
                            <button type="button" onClick={() => setRaiseOpen(true)}
                                className="mt-3 w-full rounded-xl px-4 py-2.5 text-[13px] font-bold text-white" style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
                                Report an issue
                            </button>
                        </>
                    ) : order.dispute_window_ends_at ? (
                        <p className="text-[12.5px] font-semibold tracking-wide" style={{ color: C.muted }}>The dispute window for this order closed on {fmtDateTime(order.dispute_window_ends_at)}.</p>
                    ) : null}
                </Section>
            )}
            {raiseOpen && (
                <RaiseDisputeModal order={order} onSubmitted={() => setRaised(true)}
                    onClose={() => { setRaiseOpen(false); if (raised) { setRaised(false); afterChange(); } }} />
            )}
        </>
    );
}

// One-line status for the seller's order LIST card.
export function SellerOrderCardNote({ order }) {
    if (order.status === "cancelled" && order.cancel_reason_code) {
        return (
            <p className="mt-2.5 text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                Cancelled by buyer · {labelFor(CANCEL_REASONS, order.cancel_reason_code)}{order.cancel_reason_text ? ` — "${order.cancel_reason_text}"` : ""}
            </p>
        );
    }
    if (order.status !== "delivered") return null;
    const amount = `₹${inr(order.settlement_seller_amount)}`;
    const map = {
        held: { tone: "info", text: `Payout ${amount} on hold until ${fmtDateTime(order.dispute_window_ends_at)}` },
        disputed: { tone: "warn", text: `Dispute ${order.dispute_status === "under_review" ? "under review" : "raised"} · payout ${amount} on hold` },
        released: { tone: "success", text: `Payout ${amount} released` },
        refunded: { tone: "neutral", text: "Dispute resolved · buyer refunded" },
        partially_settled: { tone: "neutral", text: "Dispute resolved · split settlement" },
    };
    const item = map[order.settlement_status];
    if (!item) return null;
    return <div className="mt-2.5"><Chip tone={item.tone}>{item.text}</Chip></div>;
}