// components/home/SellerQuickManageListings.jsx
//
// v6 — adds a read-only "view full listing" modal (mirrors the
// sections shown in AdminSellerSubmissionsPage's ViewSubmissionModal)
// that opens when the seller clicks/taps a row. Editing and
// deactivating/activating are untouched — the row's inline edit +
// deactivate-confirm panels, all state, and all API calls are exactly
// as in v5. The only new wiring is: row click -> fetch full record ->
// show it read-only, with a "Edit this listing" button that hands off
// to the existing inline editor.

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    Pencil, Trash2, Check, X, Loader2, ImageIcon, ChevronRight,
    PackageSearch, AlertTriangle, MoreVertical, PowerOff, Power,
    Package, IndianRupee, Boxes, Archive, Truck, FileText, Handshake, ShieldCheck,
} from "lucide-react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useLenis } from "../../providers/SmoothScrollProvider.jsx";
import {
    fetchMySellerSubmissions,
    updateSellerProductSubmission,
    deleteSellerProductSubmission,
    setSellerSubmissionActive,
    fetchSellerSubmissionDetail,
} from "../../utils/api.js";
import ImageLightbox from "../ImageLightbox.jsx";
import StackedImagePreview from "../StackedImagePreview.jsx";
import { supabase } from "../../utils/supabaseClient.js";


const C = {
    ink: "#0B1116",
    muted: "#667077",
    primary: "#D2462B",
    secondary: "#006F83",
    hair: "rgba(11,17,22,0.09)",
    hairSoft: "rgba(11,17,22,0.05)",
};
const EASE = [0.16, 1, 0.3, 1];
const LOW_STOCK_THRESHOLD = 10;
const LIST_MAX_HEIGHT = 428; // px — roughly 5 rows before it scrolls

/* ---------------- shared primitives ---------------- */

function FieldInput({ label, ...props }) {
    return (
        <label className="block">
            <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.muted }}>
                {label}
            </span>
            <input
                {...props}
                className="mt-1 w-full rounded-lg border bg-white px-2.5 py-2 text-[13.5px] font-bold focus:outline-none focus:ring-2"
                style={{ borderColor: C.hair, color: C.ink, ["--tw-ring-color"]: `${C.secondary}33` }}
            />
        </label>
    );
}

// Add a helper to summarize dispatching_locations jsonb into one line —
// place near the other small helpers at the top of the file.
function summarizeDispatchLocations(locations) {
    if (!Array.isArray(locations) || !locations.length) return null;
    const country = locations.find((l) => l.type === "country");
    if (!country) return null;
    const excludedStates = country.excludedStates?.length ? ` (excl. ${country.excludedStates.length} state${country.excludedStates.length === 1 ? "" : "s"})` : "";
    return `${country.name}${excludedStates}`;
}

function SectionHeader({ title, subtitle }) {
    const navigate = useNavigate();
    return (
        <div className="flex items-center justify-between pt-1 mb-0">
            <div>
                <h2
                    className="text-left font-extrabold leading-tight tracking-[-0.01em]"
                    style={{ color: C.ink, fontSize: "clamp(19px, 1.8vw, 27px)" }}
                >
                    {title}
                </h2>
                {subtitle && (
                    <p className="mt-0.5 max-w-xs text-[12.5px] font-medium leading-relaxed" style={{ color: C.muted }}>
                        {subtitle}
                    </p>
                )}
            </div>
            <button
                onClick={() => navigate("/categories")}
                className="group flex hidden items-center gap-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide transition-colors duration-150"
                style={{ color: C.primary }}
            >
                See all
                <ChevronRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
            </button>
        </div>
    );
}

// Tracks scroll position on a *vertical* scroller so we can fade the
// top/bottom edges only when there's actually more list past them —
// same idea as the old left/right fade, rotated 90°.
function useVerticalScrollFades(deps) {
    const scrollRef = useRef(null);
    const [showTopFade, setShowTopFade] = useState(false);
    const [showBottomFade, setShowBottomFade] = useState(false);

    const updateFades = () => {
        const el = scrollRef.current;
        if (!el) return;
        const { scrollTop, scrollHeight, clientHeight } = el;
        setShowTopFade(scrollTop > 0);
        setShowBottomFade(scrollTop + clientHeight < scrollHeight - 8);
    };

    useEffect(() => {
        const raf = requestAnimationFrame(updateFades);
        const el = scrollRef.current;
        if (!el) return () => cancelAnimationFrame(raf);
        el.addEventListener("scroll", updateFades, { passive: true });
        window.addEventListener("resize", updateFades);
        return () => {
            cancelAnimationFrame(raf);
            el.removeEventListener("scroll", updateFades);
            window.removeEventListener("resize", updateFades);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return { scrollRef, showTopFade, showBottomFade };
}

// Locks background page scroll while a fixed-position overlay (modal,
// lightbox, action sheet) is mounted.
//
// Two separate mechanisms need to be paused, not one:
//  1) Native body scroll — `overflow: hidden` handles this.
//  2) Lenis — the smooth-scroll library listens for wheel events on
//     its own and animates the page via RAF/transforms, completely
//     independent of `body`'s overflow CSS. Locking body scroll alone
//     does nothing to stop Lenis, which is why the page kept "scrolling"
//     behind the modal even after (1). Lenis exposes stop()/start()
//     for exactly this, so we pause it for as long as the overlay is
//     mounted and resume it on unmount.
function useLockBodyScroll() {
    const lenis = useLenis();
    useEffect(() => {
        const { overflow } = document.body.style;
        document.body.style.overflow = "hidden";
        lenis?.stop();
        return () => {
            document.body.style.overflow = overflow;
            lenis?.start();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lenis]);
}

function useCanHover() {
    const [canHover, setCanHover] = useState(
        () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches
    );
    useEffect(() => {
        const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
        const handler = (e) => setCanHover(e.matches);
        mq.addEventListener?.("change", handler);
        return () => mq.removeEventListener?.("change", handler);
    }, []);
    return canHover;
}

/* ---------------- mobile action sheet ---------------- */
function ListingActionSheet({ open, name, isActive, onEdit, onToggleActive, onClose }) {
    if (typeof document === "undefined") return null;
    return createPortal(
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[90] bg-black/40"
                    />
                    <motion.div
                        key="sheet"
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ duration: 0.28, ease: EASE }}
                        className="fixed inset-x-0 bottom-0 z-[91] rounded-t-[20px] bg-white p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_-8px_rgba(11,17,22,0.25)]"
                    >
                        <div className="mx-auto mb-3 mt-1 h-1 w-9 rounded-full" style={{ background: C.hair }} />
                        <p className="px-3 pb-2 text-[11px] font-mono font-semibold uppercase tracking-[0.14em]" style={{ color: C.muted }}>
                            {name}
                        </p>
                        <button
                            onClick={onEdit}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[14.5px] font-bold transition-colors duration-150 active:bg-black/[0.04]"
                            style={{ color: C.ink }}
                        >
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${C.secondary}12`, color: C.secondary }}>
                                <Pencil className="h-4 w-4" />
                            </span>
                            Edit listing
                        </button>
                        {isActive ? (
                            <button
                                onClick={onToggleActive}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[14.5px] font-bold transition-colors duration-150 active:bg-red-50"
                                style={{ color: "#c71f11" }}
                            >
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "rgba(199,31,17,0.1)" }}>
                                    <PowerOff className="h-4 w-4" />
                                </span>
                                Deactivate listing
                            </button>
                        ) : (
                            <button
                                onClick={onToggleActive}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[14.5px] font-bold transition-colors duration-150 active:bg-black/[0.04]"
                                style={{ color: C.secondary }}
                            >
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${C.secondary}12` }}>
                                    <Power className="h-4 w-4" />
                                </span>
                                Activate listing
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="mt-1 flex w-full items-center justify-center rounded-xl py-3 text-[13.5px] font-bold"
                            style={{ background: C.hairSoft, color: C.muted }}
                        >
                            Cancel
                        </button>
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}

/* ---------------- read-only detail modal ---------------- */

function ReadRow({ label, value }) {
    if (value === "" || value === null || value === undefined) return null;
    return (
        <div className="flex items-baseline justify-between gap-3 py-1 text-[12px]">
            <span className="shrink-0 font-semibold" style={{ color: C.muted }}>{label}</span>
            <span className="text-right font-bold" style={{ color: C.ink }}>{String(value)}</span>
        </div>
    );
}

function ReadRowsList({ rows, columns }) {
    if (!rows?.length) return null;
    return (
        <div className="mt-1 flex flex-col gap-1">
            {rows.map((row, i) => (
                <div
                    key={i}
                    className="rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold"
                    style={{ background: C.hairSoft, color: C.ink }}
                >
                    {columns.map((c) => row[c.key]).filter(Boolean).join(" — ")}
                </div>
            ))}
        </div>
    );
}

function SectionBlock({ icon: Icon, title, children }) {
    return (
        <div className="border-t pt-3 first:border-t-0 first:pt-0" style={{ borderColor: C.hairSoft }}>
            <div className="mb-1.5 flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" style={{ color: C.secondary }} />
                <span className="text-[11.5px] font-extrabold uppercase tracking-wide" style={{ color: C.muted }}>
                    {title}
                </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4">{children}</div>
        </div>
    );
}

// Fetches the full commercial-spec record for one listing and renders
// it read-only — same section layout as the admin's view-details
// modal, minus anything admin-only (approve, fix mapping, seller
// name). "Edit this listing" hands off to the existing inline editor
// in the row below, so nothing about editing changes.
function ListingDetailModal({ token, submissionId, onClose, onEdit, onImageClick }) {
    useLockBodyScroll();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        fetchSellerSubmissionDetail(token, submissionId).then((res) => {
            if (cancelled) return;
            if (res?.success) setData(res.submission);
            else setError(res?.message || "Couldn't load this listing.");
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [token, submissionId]);

    const s = data;
    const images = s?.images?.length ? s.images : (s?.image ? [s.image] : []);
    const name = s?.brand?.name || "Product";
    const brandName = s?.brand?.brand_name;
    const finalPrice = s ? Math.round(Number(s.base_price || 0) * (1 + Number(s.gst_percent || 0) / 100) * 100) / 100 : 0;
    const gp = s?.brand?.generic_product;
    const crumb = [gp?.subcategory?.category?.name, gp?.subcategory?.name, gp?.name].filter(Boolean).join(" › ");

    return (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div
                onClick={(e) => e.stopPropagation()}
                className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white"
                style={{ height: "88vh" }}
            >
                <div className="flex shrink-0 items-center justify-between border-b px-5 py-3.5" style={{ borderColor: C.hairSoft }}>
                    <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-extrabold" style={{ color: C.ink }}>{name}</h3>
                        {!s?.brand?.brand_not_applicable && brandName && (
                            <p className="text-[11.5px] font-semibold" style={{ color: C.muted }}>{brandName}</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="shrink-0 rounded-full p-1.5 transition-colors duration-150 hover:bg-black/[0.05]"
                        style={{ color: C.muted }}
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {loading && (
                    <div className="flex flex-1 items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin" style={{ color: C.muted }} />
                    </div>
                )}
                {!loading && error && (
                    <p className="flex-1 px-5 py-8 text-center text-[13px] font-semibold" style={{ color: "#c71f11" }}>{error}</p>
                )}

                {!loading && s && (
                    <div
                        data-lenis-prevent
                        className="flex-1 overflow-y-auto px-5 py-3.5"
                        style={{ minHeight: 0, overscrollBehavior: "contain" }}
                    >
                        {/* status + hierarchy */}
                        <div className="flex flex-wrap items-center gap-1.5 pb-3">
                            <span
                                className="rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                                style={{
                                    background: s.review_status === "approved" ? "#dcfce7" : s.review_status === "rejected" ? "#fee2e2" : "#fef3c7",
                                    color: s.review_status === "approved" ? "#15803d" : s.review_status === "rejected" ? "#b91c1c" : "#a16207",
                                }}
                            >
                                {s.review_status === "approved" ? "Approved" : s.review_status === "rejected" ? "Rejected" : "Pending review"}
                            </span>
                            {s.is_active === false && (
                                <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: C.hairSoft, color: C.muted }}>
                                    Hidden from buyers
                                </span>
                            )}
                        </div>
                        {s.rejection_reason && (
                            <p className="mb-3 rounded-lg px-3 py-2 text-[11.5px] font-semibold" style={{ background: "rgba(199,31,17,0.08)", color: "#c71f11" }}>
                                Rejected: {s.rejection_reason}
                            </p>
                        )}

                        {crumb && (
                            <div className="mb-3 rounded-lg px-3 py-2" style={{ background: C.hairSoft }}>
                                <p className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>Catalog mapping</p>
                                <p className="text-[12px] font-bold break-words" style={{ color: C.ink }}>{crumb}</p>
                            </div>
                        )}

                        <div className="flex flex-col gap-1 pt-1">
                            <SectionBlock icon={Package} title="Product">
                                <ReadRow label="Manufacturer" value={s.manufacturer} />
                                <ReadRow label="Model / Part No." value={s.model_no} />
                                <ReadRow label="Grade / Variant" value={s.grade_variant} />
                            </SectionBlock>
                            {(s.specifications?.length > 0 || images.length > 0) && (
                                <div className="-mt-1">
                                    {s.specifications?.length > 0 && (
                                        <ReadRowsList rows={s.specifications} columns={[{ key: "key" }, { key: "value" }]} />
                                    )}
                                    {images.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {images.map((src, i) => (
                                                <button
                                                    key={src + i}
                                                    onClick={() => onImageClick?.({ images, index: i, alt: name })}
                                                    className="relative h-14 w-14"
                                                >
                                                    <img src={src} alt="" className="h-full w-full rounded-md border object-cover" style={{ borderColor: C.hair }} />
                                                    {i === 0 && (
                                                        <span className="absolute bottom-0 left-0 right-0 rounded-b-md bg-black/60 py-0.5 text-center text-[7.5px] font-bold text-white">
                                                            Cover
                                                        </span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <SectionBlock icon={IndianRupee} title="Pricing">
                                <ReadRow label="Base price" value={s.base_price != null ? `₹${s.base_price}` : null} />
                                <ReadRow label="GST %" value={s.gst_percent != null ? `${s.gst_percent}%` : null} />
                                <ReadRow label="Final price" value={`₹${finalPrice.toLocaleString("en-IN")}`} />
                                <ReadRow label="Priced as" value={s.price_basis ? { per_unit: "Per unit", per_pack: "Per pack", per_master_pack: "Per master pack" }[s.price_basis] : null} />
                                <ReadRow label="GST" value={s.gst_inclusive_input != null ? (s.gst_inclusive_input ? "Included in entered price" : "Added on top") : null} />
                                <ReadRow label="Freight" value={s.freight_included != null ? (s.freight_included ? "Included" : "Extra, buyer pays") : null} />
                                <ReadRow label="Valid till" value={s.price_validity_till} />
                            </SectionBlock>

                            <SectionBlock icon={Boxes} title="Quantity">
                                <ReadRow label="MOQ" value={s.moq != null ? `${s.moq} ${s.unit || ""}` : null} />
                                <ReadRow
                                    label="Sample"
                                    value={
                                        s.sample_available
                                            ? `${s.sample_quantity || ""} ${s.sample_unit_basis ? { per_unit: "unit(s)", per_pack: "pack(s)", per_master_pack: "master pack(s)" }[s.sample_unit_basis] : ""}`.trim() || "Available"
                                            : "Not available"
                                    }
                                />
                            </SectionBlock>
                            {(s.price_slabs?.length > 0 || s.quantity_discounts?.length > 0) && (
                                <div className="-mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <ReadRowsList rows={s.price_slabs} columns={[{ key: "minQty" }, { key: "maxQty" }, { key: "price" }]} />
                                    <ReadRowsList rows={s.quantity_discounts} columns={[{ key: "minQty" }, { key: "discountPercent" }]} />
                                </div>
                            )}

                            <SectionBlock icon={Archive} title="Packaging">
                                <ReadRow label="Pack size" value={s.pack_size} />
                                <ReadRow label="Units/master pack" value={s.units_per_master_pack} />
                                <ReadRow label="Master pack size" value={s.master_pack_size} />
                                <ReadRow label="Packaging type" value={s.packaging_type} />
                            </SectionBlock>

                            <SectionBlock icon={Boxes} title="Availability">
                                <ReadRow label="Stock" value={s.stock_quantity} />
                                <ReadRow label="Fulfilment" value={s.stock_type === "made_to_order" ? "Made-to-order" : "Ready stock"} />
                            </SectionBlock>

                            <SectionBlock icon={Truck} title="Delivery">
                                <ReadRow label="Dispatch pincode" value={s.dispatch_pincode} />
                                <ReadRow label="Dispatch district" value={s.dispatch_district} />
                                <ReadRow label="Dispatch state" value={s.dispatch_state} />
                                <ReadRow label="Fulfilment" value={s.stock_type === "made_to_order" ? "Made-to-order" : "Ready stock"} />
                                <ReadRow label="Lead time" value={s.stock_type === "made_to_order" ? (s.production_lead_time_days != null ? `${s.production_lead_time_days}d` : null) : (s.dispatch_time_days != null ? `${s.dispatch_time_days}d` : null)} />
                            </SectionBlock>
                            {summarizeDispatchLocations(s.dispatching_locations) && (
                                <ReadRow label="Delivers to" value={summarizeDispatchLocations(s.dispatching_locations)} />
                            )}
                            {/* legacy fields — only render if an older submission still has them, so pre-migration listings keep showing what they had */}
                            <ReadRow label="Seller location" value={s.seller_location} />
                            <ReadRow label="Freight terms " value={s.freight_terms} />

                            <SectionBlock icon={FileText} title="Tax & Legal">
                                <ReadRow label="HSN Code" value={s.hsn_code} />
                                <ReadRow label="GST status " value={s.gst_registration_status} />
                                <ReadRow label="Tax invoice " value={s.tax_invoice_available != null ? (s.tax_invoice_available ? "Yes" : "No") : null} />
                            </SectionBlock>

                            <SectionBlock icon={Handshake} title="Commercial Terms" />
                            <ReadRow label="Warranty" value={s.warranty} />
                            <ReadRow label="Payment terms" value={s.payment_terms} />
                            <ReadRow label="Return policy" value={s.return_policy} />
                            {s.note_to_admin && (
                                <div className="border-t pt-3" style={{ borderColor: C.hairSoft }}>
                                    <p className="mb-1 text-[11.5px] font-extrabold uppercase tracking-wide" style={{ color: C.muted }}>Your note to admin</p>
                                    <p className="text-[12px] font-medium leading-relaxed" style={{ color: C.ink }}>{s.note_to_admin}</p>
                                </div>
                            )}

                            {(s.quality_certificates?.length > 0 || s.tds_msds_coa?.length > 0 || s.other_certifications?.length > 0) && (
                                <SectionBlock icon={ShieldCheck} title="Quality & Certifications">
                                    <div className="col-span-2 flex flex-col gap-1.5">
                                        <ReadRowsList rows={s.quality_certificates} columns={[{ key: "name" }, { key: "url" }]} />
                                        <ReadRowsList rows={s.tds_msds_coa} columns={[{ key: "type" }, { key: "url" }]} />
                                        <ReadRowsList rows={s.other_certifications} columns={[{ key: "name" }, { key: "url" }]} />
                                    </div>
                                </SectionBlock>
                            )}
                        </div>
                    </div>
                )}

                {!loading && s && (
                    <div className="flex shrink-0 items-center justify-end gap-2 border-t px-5 py-3" style={{ borderColor: C.hairSoft }}>
                        <button
                            onClick={onClose}
                            className="rounded-lg px-3.5 py-2 text-[12.5px] font-bold"
                            style={{ color: C.muted }}
                        >
                            Close
                        </button>
                        <button
                            onClick={onEdit}
                            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-bold text-white transition-opacity duration-150"
                            style={{ background: C.secondary }}
                        >
                            <Pencil className="h-3.5 w-3.5" /> Edit this listing
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ---------------- listing row ---------------- */
function ListingRow({
    it, i, canHover, isEditing, isConfirming, form, setForm, saving, togglingId, highlighted,
    onEdit, onCancelEdit, onSave, onAskDeactivate, onCancelDeactivate, onConfirmDeactivate, onActivate, onOpenImage,
    onOpenDetail,
}) {
    const [sheetOpen, setSheetOpen] = useState(false);
    const name = it.brand?.name || it.product_name || "Product";
    const brandName = it.brand?.brand_name || it.brand_name;
    const image = it.image || it.brand?.image;
    const gallery = it.images?.length ? it.images : (it.brand?.images?.length ? it.brand.images : (image ? [image] : []));
    const stock = it.stock_quantity;
    const lowStock = stock != null && stock <= LOW_STOCK_THRESHOLD;
    const outOfStock = stock != null && stock <= 0;
    const isActive = it.is_active !== false; // treat undefined as active for safety

    const statusColor = !isActive ? C.muted : outOfStock ? "#c71f11" : lowStock ? "#b45309" : C.secondary;
    const stockLabel = outOfStock ? "Out of stock" : stock != null ? `${stock} ${it.unit} left` : "Stock —";
    const isExpanded = isEditing || isConfirming;

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(i * 0.025, 0.25), ease: EASE }}
            className="relative"
            style={{ background: highlighted ? `${C.secondary}0d` : "transparent" }}
        >
            {highlighted && (
                <motion.div
                    layoutId="row-highlight-ring"
                    className="pointer-events-none absolute inset-0 rounded-xl"
                    style={{ boxShadow: `inset 0 0 0 2px ${C.secondary}` }}
                />
            )}

            {/* row body — clicking it (outside the interactive bits below)
                opens the read-only detail modal. Disabled while the row
                itself is expanded into edit/confirm mode. */}
            <div
                onClick={() => { if (!isExpanded) onOpenDetail(it); }}
                className="group relative flex items-center gap-3 px-3 py-3 sm:px-4 transition-opacity duration-200"
                style={{ opacity: isActive ? 1 : 0.55, cursor: isExpanded ? "default" : "pointer" }}
            >
                {/* status accent bar */}
                <span
                    aria-hidden
                    className="absolute inset-y-2 left-0 w-[3px] rounded-full"
                    style={{ background: statusColor, opacity: !isActive || lowStock || outOfStock ? 1 : 0 }}
                />

                <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                    <StackedImagePreview
                        images={gallery}
                        name={name}
                        size="h-12 w-12"
                        onOpen={(idx) => onOpenImage({ images: gallery, index: idx, alt: name })}
                    />
                    {!isActive && (
                        <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 rounded-xl"
                            style={{ background: "rgba(255,255,255,0.5)" }}
                        />
                    )}
                </div>

                {/* name / brand / specs column */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <p className="truncate text-[14px] font-bold leading-tight tracking-[-0.005em]" style={{ color: C.ink }}>
                            {name}
                        </p>
                        {!isActive && (
                            <span
                                className="shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide"
                                style={{ background: C.hairSoft, color: C.muted }}
                            >
                                Deactivated
                            </span>
                        )}
                        {isActive && it.review_status === "pending_review" && (
                            <span
                                className="shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-bold"
                                style={{ background: "#fef3c7", color: "#b45309" }}
                            >
                                Pending
                            </span>
                        )}
                        {isActive && it.review_status === "rejected" && (
                            <span
                                className="shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-bold"
                                style={{ background: "#fee2e2", color: "#c71f11" }}
                            >
                                Rejected
                            </span>
                        )}
                    </div>
                    <p className="mt-0.5 truncate text-[11.5px] font-medium" style={{ color: C.muted }}>
                        {brandName ? `${brandName} · ` : ""}MOQ {it.moq} {it.unit} · Lead {it.lead_time}
                    </p>
                </div>

                {/* price / stock "quote" column */}
                {!isExpanded && (
                    <div className="flex shrink-0 flex-col items-end pl-2 text-right">
                        <p className="leading-none">
                            <span className="text-[15.5px] font-bold tracking-[-0.01em] tabular-nums" style={{ color: C.ink }}>
                                ₹{it.price}
                            </span>
                            <span className="ml-0.5 text-[10.5px] font-semibold" style={{ color: C.muted }}>
                                /{it.unit}
                            </span>
                        </p>
                        <p className="mt-1 whitespace-nowrap text-[10.5px] font-bold tabular-nums" style={{ color: statusColor }}>
                            {isActive ? stockLabel : "Hidden from buyers"}
                        </p>
                    </div>
                )}

                {/* actions */}
                {!isExpanded && it.review_status !== "pending_review" && (
                    canHover ? (
                        <div
                            onClick={(e) => e.stopPropagation()}
                            className="flex shrink-0 items-center gap-1 overflow-hidden pl-1 opacity-0 transition-all duration-200 ease-out max-w-0 group-hover:max-w-[80px] group-hover:opacity-100"
                        >
                            {isActive ? (
                                <>
                                    <button
                                        onClick={() => onEdit(it)}
                                        aria-label="Edit listing"
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-black/[0.05]"
                                        style={{ color: C.ink }}
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        onClick={() => onAskDeactivate(it.id)}
                                        aria-label="Deactivate listing"
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-red-50"
                                        style={{ color: "#c71f11" }}
                                    >
                                        <PowerOff className="h-3.5 w-3.5" />
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={() => onActivate(it.id)}
                                    disabled={togglingId === it.id}
                                    aria-label="Activate listing"
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-black/[0.05] disabled:opacity-50"
                                    style={{ color: C.secondary }}
                                >
                                    {togglingId === it.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                                </button>
                            )}
                        </div>
                    ) : (
                        <button
                            onClick={(e) => { e.stopPropagation(); setSheetOpen(true); }}
                            aria-label="Listing actions"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg pl-1 transition-colors duration-150 active:bg-black/[0.05]"
                            style={{ color: C.muted }}
                        >
                            <MoreVertical className="h-4 w-4" />
                        </button>
                    )
                )}
            </div>

            {/* rejection note */}
            {!isExpanded && isActive && it.review_status === "rejected" && it.rejection_reason && (
                <div className="mx-3 mb-2.5 rounded-lg px-2.5 py-2 text-[11.5px] font-semibold leading-snug sm:mx-4" style={{ background: "rgba(199,31,17,0.08)", color: "#c71f11" }}>
                    Rejected: {it.rejection_reason} — edit and save to resubmit.
                </div>
            )}

            <AnimatePresence mode="wait">
                {isEditing ? (
                    <motion.div
                        key="edit"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden px-3 pb-3 sm:px-4"
                    >
                        <div className="space-y-2.5 rounded-xl border p-3" style={{ borderColor: C.hair, background: C.hairSoft }}>
                            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                                <FieldInput
                                    label="Price (₹)"
                                    type="number" min="0" step="0.01"
                                    value={form.price}
                                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                                />
                                <FieldInput
                                    label={`Stock (${it.unit})`}
                                    type="number" min="0" step="0.01"
                                    placeholder="—"
                                    value={form.stock_quantity}
                                    onChange={(e) => setForm((f) => ({ ...f, stock_quantity: e.target.value }))}
                                />
                                <FieldInput
                                    label={`MOQ (${it.unit})`}
                                    type="number" min="0" step="0.01"
                                    value={form.moq}
                                    onChange={(e) => setForm((f) => ({ ...f, moq: e.target.value }))}
                                />
                                <FieldInput
                                    label="Lead time (days)"
                                    type="number" min="0" step="1"
                                    value={form.lead_time}
                                    onChange={(e) => setForm((f) => ({ ...f, lead_time: e.target.value }))}
                                />
                            </div>
                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={() => onSave(it.id)}
                                    disabled={saving}
                                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] font-bold text-white transition-opacity duration-150 disabled:opacity-50 sm:flex-none sm:px-6"
                                    style={{ background: C.secondary }}
                                >
                                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                    {it.review_status === "rejected" ? "Resubmit" : "Save"}
                                </button>
                                <button
                                    onClick={onCancelEdit}
                                    className="flex items-center justify-center rounded-lg border bg-white px-3 transition-colors duration-150 hover:bg-black/[0.03]"
                                    style={{ borderColor: C.hair }}
                                >
                                    <X className="h-3.5 w-3.5" style={{ color: C.muted }} />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                ) : isConfirming ? (
                    <motion.div
                        key="confirm"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden px-3 pb-3 sm:px-4"
                    >
                        <div className="rounded-xl p-3" style={{ background: "rgba(199,31,17,0.06)" }}>
                            <div className="flex items-center justify-between gap-3">
                                <p className="flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: C.ink }}>
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "#c71f11" }} /> Deactivate this listing? Buyers won't see it until you reactivate.
                                </p>
                                <div className="flex shrink-0 gap-2">
                                    <button
                                        onClick={() => onConfirmDeactivate(it.id)}
                                        disabled={togglingId === it.id}
                                        className="flex items-center justify-center gap-1.5 rounded-lg bg-[#c71f11] px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
                                    >
                                        {togglingId === it.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Yes, deactivate"}
                                    </button>
                                    <button
                                        onClick={onCancelDeactivate}
                                        className="flex items-center justify-center rounded-lg border bg-white px-3 transition-colors duration-150 hover:bg-black/[0.03]"
                                        style={{ borderColor: C.hair }}
                                    >
                                        <X className="h-3.5 w-3.5" style={{ color: C.muted }} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            <div className="h-px w-full" style={{ background: C.hairSoft }} />

            <ListingActionSheet
                open={sheetOpen}
                name={name}
                isActive={isActive}
                onClose={() => setSheetOpen(false)}
                onEdit={() => { setSheetOpen(false); onEdit(it); }}
                onToggleActive={() => {
                    setSheetOpen(false);
                    if (isActive) onAskDeactivate(it.id);
                    else onActivate(it.id);
                }}
            />
        </motion.div>
    );
}

/* ---------------- main ---------------- */

export default function SellerQuickManageListings() {
    const { token, profile, subscribeUserEvent, registerResyncHandler } = useAuth();

    const canHover = useCanHover();
    const [searchParams, setSearchParams] = useSearchParams();
    // const [highlightId, setHighlightId] = useState(searchParams.get("highlight"));
    const [highlightId, setHighlightId] = useState(null);
    const itemRefs = useRef(new Map());

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({ price: "", moq: "", lead_time: "", stock_quantity: "" });
    const [saving, setSaving] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const [confirmDeactivateId, setConfirmDeactivateId] = useState(null);
    const [togglingId, setTogglingId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [lightboxImage, setLightboxImage] = useState(null); // { src, alt } | null
    const [viewingId, setViewingId] = useState(null); // id of listing shown in the read-only detail modal

    const isApprovedSeller = profile?.seller_status === "approved";

    const { scrollRef, showTopFade, showBottomFade } = useVerticalScrollFades([items, editingId, confirmDeleteId, loading]);

    const reload = useCallback(() => {
        if (!token || !isApprovedSeller) return;
        fetchMySellerSubmissions(token).then((res) => {
            if (res?.success) setItems(res.items || []); // see fix #2 — no longer filtering out rejected
        });
    }, [token, isApprovedSeller]);

    useEffect(() => {
        const id = searchParams.get("highlight");
        if (id) setHighlightId(id);
    }, [searchParams]);

    useEffect(() => {
        if (!highlightId) return;
        let cancelled = false;
        let attempts = 0;
        function tryScroll() {
            if (cancelled) return;
            const el = itemRefs.current.get(highlightId);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                setTimeout(() => {
                    if (cancelled) return;
                    setHighlightId(null);
                    const next = new URLSearchParams(searchParams);
                    next.delete("highlight");
                    setSearchParams(next, { replace: true });
                }, 2500);
                return;
            }
            attempts += 1;
            if (attempts < 40) setTimeout(tryScroll, 100); // polls for ~4s
        }
        tryScroll();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [highlightId]);

    useEffect(() => {
        return subscribeUserEvent("submissions_changed", reload);
    }, [subscribeUserEvent, reload]);

    useEffect(() => {
        if (!token || !isApprovedSeller) { setLoading(false); return; }
        let cancelled = false;
        fetchMySellerSubmissions(token).then((res) => {
            if (cancelled) return;
            if (res?.success) {
                // Show everything buyers could eventually see: approved + pending.
                // Rejected listings aren't surfaced here — the seller manages
                // those from the full dashboard's Products tab instead.
                // setItems((res.items || []).filter((it) => it.review_status !== "rejected"));
                setItems(res.items || []);
            }
            setLoading(false);
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, isApprovedSeller]);

    // resync registration instead — same safety-net pattern
    // as the notifications hook, so a dropped socket doesn't leave stale
    // listings sitting on screen until a manual refresh:
    useEffect(() => {
        return registerResyncHandler(reload);
    }, [registerResyncHandler, reload]);

    if (!isApprovedSeller) return null;
    if (!loading && items.length === 0) return null;

    function startEdit(it) {
        setConfirmDeleteId(null);
        setEditingId(it.id);
        setForm({
            price: it.price ?? "",
            moq: it.moq ?? "",
            lead_time: it.lead_time ?? "",
            stock_quantity: it.stock_quantity ?? "",
        });
    }

    async function activateListing(id) {
        setTogglingId(id);
        const res = await setSellerSubmissionActive(token, id, true);
        setTogglingId(null);
        if (res?.success) {
            setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...res.submission } : it)));
        }
    }

    async function confirmDeactivate(id) {
        setTogglingId(id);
        const res = await setSellerSubmissionActive(token, id, false);
        setTogglingId(null);
        if (res?.success) {
            setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...res.submission } : it)));
            setConfirmDeactivateId(null);
        }
    }

    function cancelEdit() {
        setEditingId(null);
    }
    async function saveEdit(id) {
        setSaving(true);
        const res = await updateSellerProductSubmission(token, id, {
            price: Number(form.price),
            moq: Number(form.moq),
            lead_time: form.lead_time,
            stock_quantity: form.stock_quantity === "" ? null : Number(form.stock_quantity),
        });
        setSaving(false);
        if (res?.success) {
            setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...res.submission } : it)));
            setEditingId(null);
        }
    }
    async function confirmDelete(id) {
        setDeletingId(id);
        const res = await deleteSellerProductSubmission(token, id);
        setDeletingId(null);
        if (res?.success) {
            setItems((prev) => prev.filter((it) => it.id !== id));
            setConfirmDeleteId(null);
        }
    }

    return (
        <div className="space-y-4">
            <SectionHeader
                title="Manage your listings"
                subtitle="Price, MOQ, lead time & stock — updated live"
            />

            {/* single bordered container, vertical list inside. Top/bottom
                mask reacts to scroll state so the fade only shows on an
                edge when there's actually more content past it. */}
            <div
                className="relative overflow-hidden rounded-[20px] border bg-white"
                style={{ borderColor: C.hair }}
            >
                <div
                    ref={scrollRef}
                    className="divide-y overflow-y-auto"
                    style={{
                        maxHeight: LIST_MAX_HEIGHT,
                        maskImage: `linear-gradient(to bottom, transparent 0%, black 3%, black 97%, transparent 100%)`,
                        WebkitMaskImage: `linear-gradient(to bottom, transparent 0%, black 3%, black 97%, transparent 100%)`,
                    }}
                >
                    {loading
                        ? Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 border-b px-3 py-3 sm:px-4" style={{ borderColor: C.hairSoft }}>
                                <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl" style={{ background: C.hairSoft }} />
                                <div className="flex-1 space-y-2">
                                    <div className="h-3.5 w-2/5 animate-pulse rounded" style={{ background: C.hairSoft }} />
                                    <div className="h-2.5 w-3/5 animate-pulse rounded" style={{ background: C.hairSoft }} />
                                </div>
                                <div className="h-8 w-16 shrink-0 animate-pulse rounded-lg" style={{ background: C.hairSoft }} />
                            </div>
                        ))
                        : items.map((it, i) => (
                            <div key={it.id} ref={(el) => { if (el) itemRefs.current.set(it.id, el); }}>
                                <ListingRow
                                    it={it}
                                    i={i}
                                    canHover={canHover}
                                    isEditing={editingId === it.id}
                                    // isConfirming={confirmDeleteId === it.id}
                                    isConfirming={confirmDeactivateId === it.id}
                                    togglingId={togglingId}
                                    onAskDeactivate={(id) => {
                                        setEditingId(null); setConfirmDeactivateId(id)
                                    }}
                                    onCancelDeactivate={() => setConfirmDeactivateId(null)}
                                    onConfirmDeactivate={confirmDeactivate}
                                    onActivate={activateListing}
                                    form={form}
                                    setForm={setForm}
                                    saving={saving}
                                    onEdit={startEdit}
                                    onCancelEdit={cancelEdit}
                                    onSave={saveEdit}
                                    onOpenImage={setLightboxImage}
                                    onOpenDetail={(item) => setViewingId(item.id)}
                                    highlighted={highlightId === it.id}
                                />
                            </div>
                        ))}
                </div>

                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-6 transition-opacity duration-500 ease-out"
                    style={{
                        opacity: showTopFade ? 1 : 0,
                        background: "linear-gradient(to bottom, #ffffff 0%, rgba(255,255,255,0) 100%)",
                    }}
                />
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-8 transition-opacity duration-500 ease-out"
                    style={{
                        opacity: showBottomFade ? 1 : 0,
                        background: "linear-gradient(to top, #ffffff 0%, rgba(255,255,255,0) 100%)",
                    }}
                />

                {lightboxImage && createPortal(
                    <ImageLightbox
                        images={lightboxImage.images}
                        initialIndex={lightboxImage.index}
                        alt={lightboxImage.alt}
                        onClose={() => setLightboxImage(null)}
                    />,
                    document.body
                )}
            </div>

            {viewingId && createPortal(
                <ListingDetailModal
                    token={token}
                    submissionId={viewingId}
                    onClose={() => setViewingId(null)}
                    onImageClick={setLightboxImage}
                    onEdit={() => {
                        const item = items.find((it) => it.id === viewingId);
                        setViewingId(null);
                        if (item) startEdit(item);
                    }}
                />,
                document.body
            )}
        </div>
    );
}