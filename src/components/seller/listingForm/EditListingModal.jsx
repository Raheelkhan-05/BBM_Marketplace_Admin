import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import { useLenis } from "../../../providers/SmoothScrollProvider.jsx";
import { fetchSellerSubmissionDetail, updateSellerProductSubmission } from "../../../utils/api.js";
import { round2 } from "../../../shared/packUnits.js";
import SellerListingForm, { unflattenDispatchingLocations } from "./SellerListingForm.jsx";
import { DEFAULT_VALIDITY_HOURS } from "../../../shared/listingValidity.js";

const C = {
    ink: "#0B1116", muted: "#667077",
    hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)",
};

// Includes the keys SellerManageListingsPage's chips use
// ("customPricing", "delivery") alongside the form's own keys.
// NOTE: the page uses "delivery"; this file previously used "dispatch".
// Make sure SellerListingForm's `onlySection` understands whichever
// key the page actually sends.
const SECTION_LABELS = {
    identity: "Identity", packaging: "Packaging", pricing: "Tax & Pricing",
    customPricing: "Buyer Access & Pricing",
    fulfilment: "Fulfilment", dispatch: "Delivery", delivery: "Delivery",
    validity: "Listing validity",
    marketing: "Marketing & Promotion",
    policies: "Policies",
};
function getSectionLabel(key) { return SECTION_LABELS[key] || ""; }

function baseUnitsToBasisQty(baseUnits, basis, packSize, masterPackSize) {
    const units = Number(baseUnits) || 0;
    const pack = Number(packSize) > 0 ? Number(packSize) : 1;
    const master = Number(masterPackSize) > 0 ? Number(masterPackSize) : 1;
    if (basis === "per_pack") return round2(units / pack);
    if (basis === "per_master_pack") return round2(units / (pack * master));
    return round2(units);
}

export function submissionToInitialValues(s) {
    const packSize = Number(s.pack_size) || 1;
    const masterPackSize = Number(s.units_per_master_pack) || 1;
    const hasOuterPackLocal = masterPackSize > 1;
    const sampleBasis = s.sample_unit_basis || "per_unit";

    return {
        productName: s.product_name || s.brand?.name || "",
        brandName: s.brand_name || s.brand?.brand_name || "",
        brandImage: s.brand?.image || null,
        brandNotApplicable: !s.brand_name,
        images: s.images?.length ? s.images : (s.image ? [s.image] : []),
        qualityCertificates: s.quality_certificates || [],
        noteToAdmin: s.note_to_admin || "",
        genericProductBrandId: s.generic_product_brand_id ?? null,
        unit: s.unit || "",
        packSize: String(packSize),
        hasOuterPack: hasOuterPackLocal,
        masterPackSize: hasOuterPackLocal ? String(masterPackSize) : "0",
        hsnCode: s.hsn_code || "",
        gstPercent: s.gst_percent ?? 18,
        basePrice: s.base_price != null ? String(s.base_price) : "",
        priceBasis: hasOuterPackLocal ? "per_master_pack" : "per_pack",
        gstInclusive: false,
        freightIncluded: Boolean(s.freight_included),
        validityHours: s.validity_hours ?? DEFAULT_VALIDITY_HOURS,
        marketingServices: Array.isArray(s.marketing_services) && s.marketing_services.length ? s.marketing_services : null, // null = legacy
        marketingLegacyPercent: s.marketing_legacy_percent ?? (Array.isArray(s.marketing_services) && s.marketing_services.length ? null : s.marketing_commission_percent ?? null),
        sampleAvailable: Boolean(s.sample_available),
        sampleQuantity: s.sample_quantity != null
            ? String(baseUnitsToBasisQty(s.sample_quantity, sampleBasis, packSize, masterPackSize)) : "",
        sampleUnitBasis: sampleBasis,
        priceSlabs: s.quantity_discounts || [],
        stockType: s.stock_type || "ready_stock",
        stockQuantity: s.stock_quantity != null ? String(s.stock_quantity) : "",
        stockQuantityBasis: hasOuterPackLocal ? "per_master_pack" : "per_pack",
        productionLeadTimeDays: s.production_lead_time_days != null ? String(s.production_lead_time_days) : "",
        moq: s.moq != null ? String(s.moq) : "",
        dispatchDistrict: s.dispatch_district || "",
        dispatchState: s.dispatch_state || "",
        dispatchPincode: s.dispatch_pincode || "",
        dispatchingLocations: unflattenDispatchingLocations(s.dispatching_locations),
        returnPolicyKey: s.return_policy_key || "",
        warrantyKey: s.warranty_key || "",
    };
}

// `enabled` lets inline mode opt out without breaking the rules of hooks
// (the hook is still called every render; the effect just does nothing).
function useLenisScrollLock(enabled = true) {
    const lenis = useLenis();
    useEffect(() => {
        if (!enabled) return undefined;
        if (lenis) lenis.stop();
        const isAllowed = (e) => !!e.target?.closest?.("[data-lenis-prevent], [data-scroll-lock-allow]");
        const blockScroll = (e) => { if (!isAllowed(e)) e.preventDefault(); };
        window.addEventListener("wheel", blockScroll, { passive: false, capture: true });
        window.addEventListener("touchmove", blockScroll, { passive: false, capture: true });
        return () => {
            if (lenis) lenis.start();
            window.removeEventListener("wheel", blockScroll, { capture: true });
            window.removeEventListener("touchmove", blockScroll, { capture: true });
        };
    }, [lenis, enabled]);
}

function EditListingModalSkeleton() {
    return (
        <div className="flex flex-col gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i}>
                    <span className="mb-1.5 block h-2.5 w-24 animate-pulse rounded-md" style={{ background: C.hairSoft }} />
                    <span className="block h-9 animate-pulse rounded-md" style={{ background: C.hairSoft }} />
                </div>
            ))}
        </div>
    );
}

export default function EditListingModal({ token, submissionId, focusSection, onClose, onSaved, inline = false }) {
    // Inline mode lives inside the page's normal scroll flow, so the
    // modal-style scroll lock must NOT run.
    useLenisScrollLock(!inline);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [initialValues, setInitialValues] = useState(null);
    const [brandDisplay, setBrandDisplay] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true); setError("");
        fetchSellerSubmissionDetail(token, submissionId).then((res) => {
            if (cancelled) return;
            if (!res?.success) { setError(res?.message || "Couldn't load this listing."); setLoading(false); return; }
            const s = res.submission;
            setInitialValues(submissionToInitialValues(s));
            setBrandDisplay({
                name: s.product_name || s.brand?.name,
                brandName: s.brand_name || s.brand?.brand_name,
                image: s.image || s.brand?.image,
            });
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [token, submissionId]);

    const handleSubmit = async (payload) => {
        setSubmitting(true);
        setSubmitError(null);
        const res = await updateSellerProductSubmission(token, submissionId, payload);
        setSubmitting(false);
        if (!res?.success) { setSubmitError(res?.message || "Couldn't save changes."); return; }
        onSaved(submissionId, res.submission, res.message || "Changes submitted for review.");
    };

    // Shared by modal and inline modes.
    const content = (
        <AnimatePresence mode="wait" initial={false}>
            {loading ? (
                <motion.div key="skeleton" exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                    <EditListingModalSkeleton />
                </motion.div>
            ) : error ? (
                <motion.p key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="py-8 text-center text-[13px] font-semibold" style={{ color: "#c71f11" }}>
                    {error}
                </motion.p>
            ) : initialValues ? (
                <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
                    {submitError && (
                        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{submitError}</p>
                    )}
                    <SellerListingForm
                        mode="edit"
                        identityReadOnly
                        brandDisplay={brandDisplay}
                        initialValues={initialValues}
                        onClose={onClose}
                        onSubmit={handleSubmit}
                        submitting={submitting}
                        submitLabel="Update"
                        stickyBottomClassName={inline ? "bottom-0" : "-bottom-4"}
                        onlySection={focusSection || null}
                        submissionId={submissionId}
                    />
                </motion.div>
            ) : null}
        </AnimatePresence>
    );

    /* ---------------- inline (dropdown under the row) ---------------- */
    if (inline) {
        return (
            <div className="w-full">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-[12px] font-extrabold uppercase tracking-wide" style={{ color: C.muted }}>
                        {focusSection ? `Editing ${getSectionLabel(focusSection)}` : "Edit listing"}
                    </p>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close editor"
                        className="shrink-0 rounded-full p-1.5 transition-colors duration-150 hover:bg-black/[0.05]"
                        style={{ color: C.muted }}
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                {content}
            </div>
        );
    }

    /* ---------------- modal (unchanged) ---------------- */
    return (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-2.5 sm:p-4" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white" style={{ height: "92vh" }}>
                <div className="flex shrink-0 items-center justify-between border-b px-5 py-3.5" style={{ borderColor: C.hairSoft }}>
                    <div className="min-w-0">
                        <h3 className="text-[15px] font-extrabold" style={{ color: C.ink }}>Edit listing</h3>
                        {focusSection && (
                            <p className="mt-0.5 text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                Editing {getSectionLabel(focusSection)}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="shrink-0 rounded-full p-1.5 hover:bg-black/[0.05]" style={{ color: C.muted }}>
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div
                    className="flex-1 overflow-y-auto px-5 py-4"
                    style={{ minHeight: 0, overscrollBehavior: "contain" }}
                    data-scroll-lock-allow=""
                    data-lenis-prevent=""
                >
                    {content}
                </div>
            </div>
        </div>
    );
}