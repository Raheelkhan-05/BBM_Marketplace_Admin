// src/components/save/SaveEnquiryInfoModal.jsx
// Full details of one enquiry (opened from the "i" button on a row of the Save home list).
// Uses the same overlay/dialog styles as the post wizard, and the same Lenis-safe scrolling.
// Quantity is shown as ONE total in the individual unit (older enquiries saved as packs x pack size are totalled).
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ExternalLink, Share2, Pencil, XCircle } from "lucide-react";
import { fmtNum, timeAgo, paymentLabel, consumptionLabel, locationSummary } from "../../utils/rfqUtils.js";

export const STATUS_LABEL = { pending_review: "In review", approved: "Live", rejected: "Needs changes", closed: "Closed" };

const getLenis = () => (typeof window !== "undefined" ? window.lenis || window.__lenis || null : null);
const stopEvent = (e) => e.stopPropagation();

export default function SaveEnquiryInfoModal({ item, quoteCount = 0, onClose, onOpenPage, onShare, onEdit, onCloseEnquiry }) {
    const closeRef = useRef();
    closeRef.current = onClose;

    useEffect(() => { // lock page scroll (native + Lenis) while open
        const root = document.documentElement;
        const sw = window.innerWidth - root.clientWidth;
        const { style } = document.body;
        const prevO = style.overflow, prevP = style.paddingRight, prevR = root.style.overflow;
        style.overflow = "hidden";
        root.style.overflow = "hidden";
        if (sw > 0) style.paddingRight = `${sw}px`;
        try { getLenis()?.stop?.(); } catch { /* ignore */ }
        return () => {
            style.overflow = prevO;
            style.paddingRight = prevP;
            root.style.overflow = prevR;
            try { getLenis()?.start?.(); } catch { /* ignore */ }
        };
    }, []);

    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") closeRef.current?.(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);

    const total = Math.round(item.quantity * item.packSize * 1e6) / 1e6;
    const live = item.status === "approved";
    const canEdit = ["pending_review", "rejected"].includes(item.status);
    const canClose = ["pending_review", "approved"].includes(item.status);
    const images = (item.images || []).filter(Boolean);
    const rows = [
        ["Quantity needed", `${fmtNum(total)} ${item.unit}`],
        ["Equivalent products", item.acceptEquivalent ? "Acceptable" : "Same product only"],
        ["Payment", paymentLabel(item)],
        ["Consumption", consumptionLabel(item)],
        ["Deliver to", [item.deliveryAddress, item.deliveryCity, item.deliveryState, item.deliveryPincode].filter(Boolean).join(", ")],
        ["Suppliers", locationSummary(item.supplierLocations)],
        ["Quotes received", String(quoteCount)],
        ["Posted", timeAgo(item.publishedAt || item.createdAt)],
    ];

    return createPortal(
        <div className="sv sh-portal">
            <div
                className="sh-ov"
                data-lenis-prevent
                onWheel={stopEvent}
                onTouchMove={stopEvent}
                onMouseDown={(e) => { if (e.target === e.currentTarget) closeRef.current?.(); }}
            >
                <div className="sh-wz" role="dialog" aria-modal="true" aria-label={`Details of ${item.productName}`}>
                    <div className="sh-wh">
                        <h2>{item.productName}</h2>
                        <span className={`sh-st ${item.status}`}><i />{STATUS_LABEL[item.status] || item.status}</span>
                        <button type="button" className="sh-ib" aria-label="Close" onClick={() => closeRef.current?.()}><X size={18} /></button>
                    </div>

                    <div className="sh-wb" data-lenis-prevent>
                        {images.length > 0 && (
                            <div className="sh-gal">{images.map((src, i) => <img key={src + i} src={src} alt="" loading="lazy" />)}</div>
                        )}

                        {item.status === "rejected" && item.reviewNote && <p className="sh-rej" style={{ marginTop: 14 }}>{item.reviewNote}</p>}
                        {item.status === "pending_review" && <p className="sh-cap" style={{ marginTop: 14 }}>Our team is reviewing this. It will go live once approved.</p>}

                        <dl className="sh-dl">
                            {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || "–"}</dd></div>)}
                        </dl>

                        {item.specifications && (<>
                            <h3 className="sh-sch">Specifications</h3>
                            <p style={{ marginTop: 6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.specifications}</p>
                        </>)}
                    </div>

                    <div className="sh-wf">
                        <button type="button" className="sh-btn go" onClick={onOpenPage}><ExternalLink size={16} />Open enquiry page</button>
                        {live && <button type="button" className="sh-btn" onClick={onShare}><Share2 size={16} />Share</button>}
                        {canEdit && <button type="button" className="sh-btn" onClick={onEdit}><Pencil size={16} />{item.status === "rejected" ? "Fix & resubmit" : "Edit"}</button>}
                        {canClose && <button type="button" className="sh-btn" onClick={onCloseEnquiry}><XCircle size={16} />Close</button>}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}