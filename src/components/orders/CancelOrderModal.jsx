// components/orders/CancelOrderModal.jsx
import { useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { C } from "../catalog/tokens.js";
import { ModalShell } from "./disputeUi.jsx";
import { CANCEL_REASONS, MAX_CANCEL_TEXT } from "../../../shared/disputeConfig.js";

// onConfirm({ reasonCode, reasonText }) must resolve to { success, message }.
export default function CancelOrderModal({ order, onClose, onConfirm }) {
    const [reasonCode, setReasonCode] = useState("");
    const [reasonText, setReasonText] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const unpaid = order.status === "awaiting_payment";
    const inGroup = unpaid && !!order.order_group_id;
    const needsText = reasonCode === "other";
    const canSubmit = !!reasonCode && (!needsText || reasonText.trim().length >= 3) && !busy;

    const submit = async () => {
        if (!canSubmit) return;
        setBusy(true); setError(null);
        const res = await onConfirm({ reasonCode, reasonText: reasonText.trim() });
        setBusy(false);
        if (!res?.success) setError(res?.message || "Couldn't cancel the order. Please try again.");
    };

    return (
        <ModalShell title="Cancel this order?" subtitle={order.order_number} onClose={onClose} busy={busy}
            footer={
                <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={onClose}
                        className="flex-1 rounded-xl border px-4 py-2.5 text-[13px] font-bold tracking-wide disabled:opacity-50" style={{ borderColor: C.hair, color: C.ink }}>
                        Keep order
                    </button>
                    <button type="button" disabled={!canSubmit} onClick={submit}
                        className="flex flex-1 items-center justify-center rounded-xl px-4 py-2.5 text-[13px] font-bold tracking-wide text-white disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel order"}
                    </button>
                </div>
            }>
            {inGroup && (
                <div className="mb-3 flex items-start gap-2 rounded-lg px-3 py-2.5" style={{ background: "#FEF6E7" }}>
                    <AlertCircle className="mt-[1px] h-3.5 w-3.5 shrink-0" style={{ color: "#92600A" }} />
                    <p className="text-[11.5px] font-semibold leading-snug tracking-wide" style={{ color: "#92600A" }}>
                        This order is part of one cart payment. Cancelling it cancels every unpaid order in that payment.
                    </p>
                </div>
            )}

            <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>Why are you cancelling?</p>
            <div className="mt-2.5 flex flex-col gap-2" role="radiogroup" aria-label="Cancellation reason">
                {CANCEL_REASONS.map((r) => {
                    const active = reasonCode === r.code;
                    return (
                        <button key={r.code} type="button" role="radio" aria-checked={active} disabled={busy} onClick={() => setReasonCode(r.code)}
                            className="flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors"
                            style={active ? { borderColor: C.secondary, background: `${C.secondary}0F` } : { borderColor: C.hair }}>
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2" style={{ borderColor: active ? C.secondary : C.hair }}>
                                {active && <span className="h-2 w-2 rounded-full" style={{ background: C.secondary }} />}
                            </span>
                            <span className="text-[13px] font-semibold tracking-wide" style={{ color: C.ink }}>{r.label}</span>
                        </button>
                    );
                })}
            </div>

            <label className="mt-4 block text-[12px] font-bold tracking-wide" style={{ color: C.muted }}>
                {needsText ? "Tell us more (required)" : "Anything you'd like to add? (optional)"}
            </label>
            <textarea value={reasonText} disabled={busy} maxLength={MAX_CANCEL_TEXT} rows={3}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="Describe your situation — this helps us improve the experience."
                className="mt-1.5 w-full resize-none rounded-xl border px-3 py-2.5 text-[13px] font-medium outline-none focus:border-[#0B7285]" style={{ borderColor: C.hair, color: C.ink }} />
            <p className="mt-1 text-right text-[10.5px] font-semibold tabular-nums" style={{ color: C.muted }}>{reasonText.length}/{MAX_CANCEL_TEXT}</p>

            {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{error}</p>}
        </ModalShell>
    );
}