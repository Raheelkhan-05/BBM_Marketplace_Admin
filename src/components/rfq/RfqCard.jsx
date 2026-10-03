// components/rfq/RfqCard.jsx
import { Package, MapPin, Repeat, Wallet, Clock, Pencil, XCircle, Send, Shuffle, Equal } from "lucide-react";
import { C } from "../seller/listingForm/FormPrimitives.jsx";
import { fmtNum, timeAgo, paymentLabel, consumptionLabel, locationSummary } from "../../utils/rfqUtils.js";

export const STATUS_STYLE = {
    pending_review: { label: "In review", bg: "#FEF3C7", fg: "#A16207" },
    approved: { label: "Live", bg: "#DCFCE7", fg: "#15803D" },
    rejected: { label: "Needs changes", bg: "#FDECEC", fg: "#B3261E" },
    closed: { label: "Closed", bg: "#F1F1F1", fg: "#667077" },
};

export function StatusBadge({ status }) {
    const s = STATUS_STYLE[status] || STATUS_STYLE.closed;
    return (
        <span className="inline-flex shrink-0 items-center rounded-full px-2 py-[3px] text-[10px] font-extrabold uppercase tracking-wider" style={{ background: s.bg, color: s.fg }}>
            {s.label}
        </span>
    );
}

function Fact({ icon: Icon, children }) {
    return (
        <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
            <Icon className="h-3 w-3 shrink-0" strokeWidth={2.4} />
            <span className="truncate">{children}</span>
        </span>
    );
}

export default function RfqCard({ item, onQuote, onEdit, onClose }) {
    const mine = item.isMine;
    const total = item.quantity * item.packSize;
    const toTitle = (s = "") => s.replace(/\b\w/g, (c) => c.toUpperCase());

    return (
        <div className="flex flex-col gap-2.5 rounded-2xl border bg-white p-3" style={{ borderColor: C.hair }}>
            <div className="flex items-start gap-3">
                <span className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl" style={{ background: C.hairSoft }}>
                    {item.images?.[0]
                        ? <img src={item.images[0]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                        : <Package className="h-5 w-5" style={{ color: C.muted }} />}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-[14.5px] font-bold leading-tight tracking-wide" style={{ color: C.ink, overflowWrap: "anywhere" }}>
                            {toTitle(item.productName)}
                        </p>
                        {mine && <StatusBadge status={item.status} />}
                    </div>
                    <p className="mt-1 text-[13px] font-extrabold tracking-wide tabular-nums" style={{ color: "#006F83" }}>
                        {fmtNum(item.quantity)} Pack{item.quantity === 1 ? "" : "s"} × {fmtNum(item.packSize)} {item.unit}
                    </p>
                    <p className="text-[11.5px] font-semibold tracking-wide tabular-nums" style={{ color: C.muted }}>
                        Total {fmtNum(total)} {item.unit}
                    </p>
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[10px] font-bold tracking-wide"
                        style={{ background: C.hairSoft, color: C.ink }}>
                        {item.acceptEquivalent ? <><Shuffle className="h-2.5 w-2.5" strokeWidth={2.5} /> Equivalent OK</> : <><Equal className="h-2.5 w-2.5" strokeWidth={2.5} /> Same product only</>}
                    </span>
                </div>
            </div>

            {item.specifications && (
                <p className="line-clamp-2 text-[12px] font-medium leading-snug tracking-wide" style={{ color: C.ink }}>{item.specifications}</p>
            )}

            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                <Fact icon={Wallet}>{paymentLabel(item)}</Fact>
                <Fact icon={Repeat}>{consumptionLabel(item)}</Fact>
                <Fact icon={MapPin}>Deliver to {item.deliveryCity}, {item.deliveryState}</Fact>
                <Fact icon={MapPin}>Suppliers: {locationSummary(item.supplierLocations)}</Fact>
            </div>

            {mine && item.status === "rejected" && item.reviewNote && (
                <p className="rounded-lg px-2.5 py-2 text-[12px] font-semibold leading-snug tracking-wide" style={{ background: "#FDECEC", color: "#B3261E" }}>
                    {item.reviewNote}
                </p>
            )}
            {mine && item.status === "pending_review" && (
                <p className="text-[11.5px] font-medium tracking-wide" style={{ color: C.muted }}>Our team is reviewing this. It will go live once approved.</p>
            )}

            <div className="mt-auto flex items-center justify-between gap-2 border-t pt-2.5" style={{ borderColor: C.hairSoft }}>
                <span className="flex items-center gap-1 text-[11px] font-semibold tracking-wide" style={{ color: C.muted }}>
                    <Clock className="h-3 w-3" /> {timeAgo(item.publishedAt || item.createdAt)}
                </span>
                <div className="flex items-center gap-1.5">
                    {mine && ["pending_review", "rejected"].includes(item.status) && (
                        <button type="button" onClick={() => onEdit(item)} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] font-bold tracking-wide" style={{ borderColor: C.hair, color: C.ink }}>
                            <Pencil className="h-3 w-3" /> {item.status === "rejected" ? "Fix & resubmit" : "Edit"}
                        </button>
                    )}
                    {mine && ["pending_review", "approved"].includes(item.status) && (
                        <button type="button" onClick={() => onClose(item)} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] font-bold tracking-wide" style={{ borderColor: C.hair, color: C.muted }}>
                            <XCircle className="h-3 w-3" /> Close
                        </button>
                    )}
                    {!mine && item.status === "approved" && (
                        <button type="button" onClick={() => onQuote(item)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold tracking-wide text-white" style={{ background: C.primary }}>
                            <Send className="h-3 w-3" /> Submit quote
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}