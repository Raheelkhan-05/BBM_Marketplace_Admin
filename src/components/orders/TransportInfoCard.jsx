// components/orders/TransportInfoCard.jsx
//
// NOTE: this repo already imports a TransportInfoCard in
// OrderDetailPage.jsx and SellerOrderDetailPage.jsx, but its source
// wasn't in scope for this pass. This is a fresh implementation covering
// what's new: the pre-agreed transport preference (order.transport_mode /
// transport_fields, set at place_order time from the Transport Library)
// plus, once shipped, the LR number/notes and downloadable LR + bill
// files (order.ship_lr_number / ship_lr_notes / ship_lr_proof_url /
// ship_bill_url). Merge this with whatever your existing card already
// shows (e.g. buyer_transport_mode "requested" note) rather than
// replacing it outright if it has other responsibilities.
import { Truck, FileText, Receipt, Download, Clock3 } from "lucide-react";
import { routeOptionSummary, routeTransportModeLabel } from "../../../shared/routeTransportFields.js";
import { transportLabel } from "../../../shared/transportOptions.js";

const C = { ink: "#0B1116", muted: "#667077", secondary: "#006F83", hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)" };

function Row({ icon: Icon, label, value }) {
    if (!value) return null;
    return (
        <div className="flex items-center gap-2.5">
            <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: C.secondary }} />
            <div className="min-w-0">
                <p className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>{label}</p>
                <p className="truncate text-[12.5px] font-bold tracking-wide" style={{ color: C.ink }}>{value}</p>
            </div>
        </div>
    );
}

function DownloadLink({ href, label }) {
    if (!href) return null;
    return (
        <a href={href} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-bold"
            style={{ borderColor: C.hair, color: C.secondary }}>
            <Download className="h-3.5 w-3.5" /> {label}
        </a>
    );
}

export default function TransportInfoCard({ order }) {
    if (!order?.transport_mode && !order?.buyer_transport_mode) return null;

    const agreedSummary = order.transport_mode ? routeOptionSummary(order.transport_mode, order.transport_fields || {}) : null;
    const isShipped = !!order.ship_details_confirmed_at;

    return (
        <div className="mt-4 rounded-2xl border bg-white p-4" style={{ borderColor: C.hair }}>
            <p className="text-[12px] font-extrabold uppercase tracking-[0.08em]" style={{ color: "#4A535B" }}>Transport</p>

            <div className="mt-3 flex flex-col gap-2.5">
                {agreedSummary && (
                    <Row icon={Truck} label="Agreed transport" value={`${agreedSummary} · ${routeTransportModeLabel(order.transport_mode)}`} />
                )}
                {!order.transport_mode && order.buyer_transport_mode && (
                    <Row icon={Clock3} label="Requested" value={transportLabel(order.buyer_transport_mode)} />
                )}

                {isShipped && (
                    <>
                        <div className="h-px" style={{ background: C.hairSoft }} />
                        <Row icon={FileText} label="LR / tracking number" value={order.ship_lr_number} />
                        {order.ship_lr_notes && <Row icon={FileText} label="Notes" value={order.ship_lr_notes} />}
                        <div className="mt-1 flex flex-wrap gap-2">
                            <DownloadLink href={order.ship_lr_proof_url} label="Download LR" />
                            <DownloadLink href={order.ship_bill_url} label="Download bill" />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}