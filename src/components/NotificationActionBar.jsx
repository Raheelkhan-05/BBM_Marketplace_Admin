// components/NotificationActionBar.jsx
//
// Quick actions shown under a Console notification (order: Confirm / Reject, transport proposal:
// Approve / Decline). Rendered only while the order / proposal is still waiting for the seller
// (see NotificationActionsContext); after the decision, from here or from the page, it turns into
// a one-line result and never offers the buttons again.
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, X } from "lucide-react";
import { useNotificationActions } from "../context/NotificationActionsContext.jsx";
import { routeTransportModeLabel } from "../../shared/routeTransportFields.js";
import { inr, toTitleCase } from "./growSeller/sellerHelpers.js";

const C = { ink: "#141B22", muted: "#5B6672", hair: "rgba(20,27,34,0.12)", green: "#22A06B", greenDark: "#1B8559", danger: "#B42318", amber: "#9A6700" };

const COPY = {
    order: {
        yes: "Confirm order", no: "Reject", noSubmit: "Reject order",
        reason: "Reason for rejecting (optional, shown to the buyer)",
        outcomes: { confirmed: "You confirmed this order", rejected: "You rejected this order" },
    },
    proposal: {
        yes: "Approve", no: "Decline", noSubmit: "Decline route",
        reason: "Reason for declining (optional, shown to the buyer)",
        outcomes: { approved: "You approved this route", declined: "You declined this route" },
    },
};

const BTN = "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-[12.5px] font-bold tracking-wide transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1";

function timeLeft(ms) {
    const mins = Math.max(1, Math.round(ms / 60000));
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

function Summary({ action }) {
    if (action.kind === "order") {
        const o = action.order || {};
        const buyer = o.buyer_business_name || o.buyer_contact_name;
        const count = Array.isArray(o.items) ? o.items.length : 0;
        const amount = o.order_type === "sample" ? "Free sample" : o.subtotal_amount != null ? `₹${inr(o.subtotal_amount)}` : null;
        const parts = [buyer, count ? `${count} item${count === 1 ? "" : "s"}` : null, amount].filter(Boolean);
        const dueAt = o.seller_response_due_at ? Date.parse(o.seller_response_due_at) : NaN;
        const left = Number.isFinite(dueAt) ? dueAt - Date.now() : null;
        return (
            <>
                {parts.length > 0 && <p className="text-[12px] font-semibold leading-snug" style={{ color: C.muted }}>{parts.join(" · ")}</p>}
                {action.expired
                    ? <p className="mt-0.5 text-[11.5px] font-semibold" style={{ color: C.amber }}>The response time has ended. This order is being marked as not accepted.</p>
                    : left != null && left > 0 && <p className="mt-0.5 text-[11.5px] font-semibold" style={{ color: left < 6 * 3600 * 1000 ? C.amber : C.muted }}>Respond within {timeLeft(left)}</p>}
            </>
        );
    }
    const p = action.proposal || {};
    const route = [toTitleCase(p.origin_city || ""), toTitleCase(p.dest_city || "")].filter(Boolean).join(" → ");
    return (
        <>
            <p className="text-[12px] font-semibold leading-snug" style={{ color: C.muted }}>
                {[routeTransportModeLabel(p.mode), route].filter(Boolean).join(" · ")}
            </p>
            {p.proposal_note && <p className="mt-0.5 line-clamp-2 text-[12px] font-medium italic leading-snug" style={{ color: C.muted }}>“{p.proposal_note}”</p>}
        </>
    );
}

export default function NotificationActionBar({ action }) {
    const act = useNotificationActions();
    const copy = COPY[action.kind];
    const [rejecting, setRejecting] = useState(false);
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const [pending, setPending] = useState(null); // "yes" | "no"

    // Already decided (from here or from the page): a quiet result line, no buttons.
    if (action.outcome) {
        const bad = action.outcome === "rejected" || action.outcome === "declined";
        return (
            <p className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: bad ? C.muted : C.greenDark }} role="status">
                {bad ? <X className="h-3.5 w-3.5" strokeWidth={2.6} /> : <Check className="h-3.5 w-3.5" strokeWidth={2.6} />}
                {copy.outcomes[action.outcome] || "Done"}
            </p>
        );
    }

    const working = !!act.busy[action.key];
    const disabled = working || !!action.expired;

    const run = async (which) => {
        if (disabled) return;
        setError("");
        setPending(which);
        let res;
        if (action.kind === "order") res = which === "yes" ? await act.confirmOrder(action.id) : await act.rejectOrder(action.id, reason);
        else res = which === "yes" ? await act.approveProposal(action.id) : await act.rejectProposal(action.id, reason);
        setPending(null);
        if (!res.ok && res.message) setError(res.message);
    };

    return (
        <div>
            <Summary action={action} />

            {!action.expired && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                        type="button" disabled={disabled}
                        onClick={() => { setError(""); setRejecting((v) => !v); }}
                        aria-expanded={rejecting}
                        className={`${BTN} border bg-white hover:bg-black/[0.03] focus-visible:ring-[#B42318]/40`}
                        style={{ borderColor: C.hair, color: C.danger }}
                    >
                        {copy.no}
                    </button>
                    <button
                        type="button" disabled={disabled} onClick={() => run("yes")}
                        className={`${BTN} text-white hover:brightness-95 focus-visible:ring-[#22A06B]/50`}
                        style={{ background: C.green }}
                    >
                        {pending === "yes" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />}
                        {copy.yes}
                    </button>
                </div>
            )}

            <AnimatePresence initial={false}>
                {rejecting && !action.expired && (
                    <motion.div
                        key="reason"
                        initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        style={{ overflow: "hidden" }}
                    >
                        <div className="pt-2.5">
                            <label className="sr-only" htmlFor={`rsn-${action.key}`}>{copy.reason}</label>
                            <textarea
                                id={`rsn-${action.key}`} rows={2} maxLength={300} autoFocus
                                value={reason} onChange={(e) => setReason(e.target.value)} disabled={working}
                                placeholder={copy.reason}
                                className="w-full resize-none rounded-xl border bg-white px-3 py-2 text-[12.5px] font-medium leading-snug outline-none focus:border-[#0B7285] focus:ring-2 focus:ring-[#0B7285]/20 disabled:opacity-60"
                                style={{ borderColor: C.hair, color: C.ink }}
                            />
                            <div className="mt-2 flex items-center gap-2">
                                <button
                                    type="button" disabled={working} onClick={() => { setRejecting(false); setReason(""); setError(""); }}
                                    className={`${BTN} hover:bg-black/[0.04] focus-visible:ring-black/30`}
                                    style={{ color: C.muted }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button" disabled={working} onClick={() => run("no")}
                                    className={`${BTN} text-white hover:brightness-95 focus-visible:ring-[#B42318]/50`}
                                    style={{ background: C.danger }}
                                >
                                    {pending === "no" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                                    {copy.noSubmit}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {error && <p className="mt-2 text-[12px] font-semibold leading-snug" style={{ color: C.danger }} role="alert">{error}</p>}
        </div>
    );
}