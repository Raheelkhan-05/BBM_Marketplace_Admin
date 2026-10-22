// components/orders/PurchaseCardActions.jsx
//
//  <PurchaseCardActions order onChanged />   footer of a buyer order card in the list
//  <CancelOrderControl  order onCancelled /> full-width cancel button for the detail page
//
// Both open CancelOrderModal (reason required) — the buyer can cancel only
// while the order is awaiting payment / awaiting the seller's confirmation.
import { useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { C } from "../catalog/tokens.js";
import { cancelMyOrderWithReason } from "../../utils/api.disputes.js";
import CancelOrderModal from "./CancelOrderModal.jsx";
import RaiseDisputeModal from "./RaiseDisputeModal.jsx";
import { Chip, useNow, formatRemaining } from "./disputeUi.jsx";
import { CANCELLABLE_STATUSES } from "../../../shared/disputeConfig.js";

const DISPUTE_CHIPS = {
    open: { tone: "warn", label: "Dispute open" },
    under_review: { tone: "info", label: "Dispute under review" },
    resolved: { tone: "success", label: "Dispute resolved" },
};

function useCancelFlow(order, onDone) {
    const { token } = useAuth();
    const [open, setOpen] = useState(false);
    const confirm = async ({ reasonCode, reasonText }) => {
        const res = await cancelMyOrderWithReason(token, order.id, { reasonCode, reasonText });
        if (res?.success) { setOpen(false); onDone?.(); }
        return res;
    };
    return { open, setOpen, confirm };
}

export function PurchaseCardActions({ order, onChanged }) {
    const now = useNow(30000);
    const cancel = useCancelFlow(order, onChanged);
    const [disputeOpen, setDisputeOpen] = useState(false);
    const [disputeSubmitted, setDisputeSubmitted] = useState(false);

    const canCancel = CANCELLABLE_STATUSES.includes(order.status);
    const eligibleForDispute = order.status === "delivered" && order.order_type !== "sample" && !!order.dispute_window_ends_at;
    const msLeft = eligibleForDispute ? new Date(order.dispute_window_ends_at).getTime() - now : 0;
    const canDispute = eligibleForDispute && !order.dispute_status && msLeft > 0;
    const disputeChip = eligibleForDispute ? DISPUTE_CHIPS[order.dispute_status] : null;

    const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
    const showFooter = canCancel || canDispute || !!disputeChip;

    return (
        <>
            {showFooter && (
                <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5" style={{ borderColor: C.hairSoft }}>
                    <div className="min-w-0">
                        {canDispute && (
                            <p className="text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                Dispute window closes in <span className="font-extrabold tabular-nums" style={{ color: C.ink }}>{formatRemaining(msLeft)}</span>
                            </p>
                        )}
                        {disputeChip && <Chip tone={disputeChip.tone}>{disputeChip.label}</Chip>}
                    </div>
                    {canCancel && (
                        <button type="button" onClick={stop(() => cancel.setOpen(true))}
                            className="rounded-lg border px-3 py-1.5 text-[12.5px] font-bold tracking-wide" style={{ borderColor: C.hair, color: C.primary }}>
                            Cancel order
                        </button>
                    )}
                    {canDispute && (
                        <button type="button" onClick={stop(() => setDisputeOpen(true))}
                            className="rounded-lg border px-3 py-1.5 text-[12.5px] font-bold tracking-wide" style={{ borderColor: C.hair, color: C.primary }}>
                            Report an issue
                        </button>
                    )}
                </div>
            )}

            {cancel.open && <CancelOrderModal order={order} onClose={() => cancel.setOpen(false)} onConfirm={cancel.confirm} />}
            {disputeOpen && (
                <RaiseDisputeModal order={order}
                    onSubmitted={() => setDisputeSubmitted(true)}
                    onClose={() => { setDisputeOpen(false); if (disputeSubmitted) { setDisputeSubmitted(false); onChanged?.(); } }} />
            )}
        </>
    );
}

export function CancelOrderControl({ order, onCancelled, className = "" }) {
    const cancel = useCancelFlow(order, onCancelled);
    if (!CANCELLABLE_STATUSES.includes(order.status)) return null;
    return (
        <>
            <button type="button" onClick={() => cancel.setOpen(true)}
                className={`w-full rounded-xl border px-5 py-3 text-[13px] font-bold tracking-wide ${className}`} style={{ borderColor: C.hair, color: C.primary }}>
                Cancel order
            </button>
            {cancel.open && <CancelOrderModal order={order} onClose={() => cancel.setOpen(false)} onConfirm={cancel.confirm} />}
        </>
    );
}

export default PurchaseCardActions;