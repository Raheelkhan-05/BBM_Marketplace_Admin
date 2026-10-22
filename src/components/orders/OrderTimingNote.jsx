// components/orders/OrderTimingNote.jsx
//
//  <OrderTimingNote order viewer="buyer"|"seller" className="mt-2.5" />
//
// - While an order waits for the seller: a live countdown to the deadline.
// - After the seller missed it: a clear "not accepted" notice (+ refund line for the buyer).
// Renders nothing in every other state. The countdown timer only runs for orders
// that are actually waiting, so long lists don't spin up a timer per card.
import { Clock, XCircle } from "lucide-react";
import { useNow, formatRemaining, inr } from "./disputeUi.jsx";
import { SELLER_RESPONSE_WINDOW_LABEL } from "../../../shared/disputeConfig.js";

const isCredit = (o) => String(o?.payment_method || "").toLowerCase() === "credit";

function Box({ tone, icon: Icon, children, className }) {
    const t = tone === "urgent"
        ? { background: "#f59e0b1a", color: "#92600A" }
        : tone === "bad"
            ? { background: "#D2462B12", color: "#b4351f" }
            : { background: "#0B72850D", color: "#0B7285" };
    return (
        <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12px] font-semibold leading-snug tracking-wide ${className}`} style={t}>
            <Icon className="mt-[1px] h-3.5 w-3.5 shrink-0" />
            <span>{children}</span>
        </div>
    );
}

function Countdown({ order, viewer, className }) {
    const now = useNow(30000);
    const msLeft = new Date(order.seller_response_due_at).getTime() - now;
    const urgent = msLeft < 3 * 3600 * 1000;
    const tone = urgent ? "urgent" : "info";

    if (viewer === "seller") {
        return (
            <Box tone={tone} icon={Clock} className={className}>
                {msLeft > 0
                    ? <>Accept or reject within <b className="tabular-nums">{formatRemaining(msLeft)}</b>. If you don't, the order is marked not accepted{isCredit(order) ? "." : " and the buyer is refunded."}</>
                    : "The response time has ended — this order is being marked as not accepted."}
            </Box>
        );
    }
    return (
        <Box tone={tone} icon={Clock} className={className}>
            {msLeft > 0
                ? <>The seller has <b className="tabular-nums">{formatRemaining(msLeft)}</b> left to accept. If they don't, the order is cancelled automatically{isCredit(order) ? "." : " and you get a full refund."}</>
                : "The seller didn't respond in time — your order is being cancelled automatically."}
        </Box>
    );
}

function AutoRejected({ order, viewer, className }) {
    const refund = Number(order.auto_refund_amount) || 0;
    if (viewer === "seller") {
        return (
            <Box tone="bad" icon={XCircle} className={className}>
                You didn't accept this order within {SELLER_RESPONSE_WINDOW_LABEL}, so it was marked not accepted{refund > 0 ? " and the buyer was refunded" : ""}.
            </Box>
        );
    }
    return (
        <Box tone="bad" icon={XCircle} className={className}>
            The seller didn't accept this order within {SELLER_RESPONSE_WINDOW_LABEL}, so it was cancelled automatically.{" "}
            {refund > 0
                ? <>A full refund of <b>₹{inr(refund)}</b> has been initiated.</>
                : isCredit(order) ? "Your credit has been released." : "You haven't been charged."}
        </Box>
    );
}

export default function OrderTimingNote({ order, viewer = "buyer", className = "mt-2.5" }) {
    if (!order) return null;
    if (order.auto_rejected_at) return <AutoRejected order={order} viewer={viewer} className={className} />;
    if (order.status === "pending_confirmation" && order.seller_response_due_at) {
        return <Countdown order={order} viewer={viewer} className={className} />;
    }
    return null;
}