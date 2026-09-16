import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchSellerSubmissionDetail, updateSellerProductSubmission } from "../utils/api.js";
import SellerListingForm from "../components/seller/listingForm/SellerListingForm.jsx";
import { C } from "../components/seller/listingForm/FormPrimitives.jsx";

// Maps a raw seller_product_submissions row (as returned by
// fetchSellerSubmissionDetail) into the shape SellerListingForm's
// `initialValues` expects. Mirrors the field-name translation
// updateSubmission() already does server-side, just in reverse and
// for display instead of for persistence.
function submissionToInitialValues(s) {
    const packSize = Number(s.pack_size) || 1;
    const masterPackSize = Number(s.units_per_master_pack) || 1;
    const hasOuterPack = masterPackSize > 1;

    return {
        productName: s.product_name || s.brand?.name || "",
        brandName: s.brand_name || s.brand?.brand_name || "",
        brandImage: s.brand?.image || null,
        brandNotApplicable: !s.brand_name,
        images: s.images?.length ? s.images : (s.image ? [s.image] : []),
        qualityCertificates: s.quality_certificates || [],
        noteToAdmin: s.note_to_admin || "",

        unit: s.unit || "",
        packSize: String(packSize),
        hasOuterPack,
        masterPackSize: hasOuterPack ? String(masterPackSize) : "0",

        hsnCode: s.hsn_code || "",
        gstPercent: s.gst_percent ?? 18,

        // base_price is stored per SALE UNIT (see toListingRow) — the form's
        // priceBasis just tells it which of the three display fields to
        // treat as "what the seller typed"; per_pack is a safe default
        // whenever hasOuterPack is false, since sale unit === Pack then.
        basePrice: s.base_price != null ? String(s.base_price) : "",
        priceBasis: s.price_basis || (hasOuterPack ? "per_master_pack" : "per_pack"),
        gstInclusive: Boolean(s.gst_inclusive_input),
        freightIncluded: Boolean(s.freight_included),

        sampleAvailable: Boolean(s.sample_available),
        // sample_quantity is stored in base UNITS on the backend — convert
        // to whichever basis it was originally entered in, defaulting to
        // per_unit (the form's own default) since we don't persist which
        // basis a sample qty was entered under.
        sampleQuantity: s.sample_quantity != null ? String(s.sample_quantity) : "",
        sampleUnitBasis: s.sample_unit_basis || "per_unit",

        priceSlabs: s.quantity_discounts || [],

        stockType: s.stock_type || "ready_stock",
        // stock_quantity is stored in Packs (or sale units) — show as-is in
        // "per_pack" basis, the form's own default for this field.
        stockQuantity: s.stock_quantity != null ? String(s.stock_quantity) : "",
        stockQuantityBasis: "per_pack",
        productionLeadTimeDays: s.production_lead_time_days != null ? String(s.production_lead_time_days) : "",

        // moq is stored in Packs — SellerListingForm's own constructor
        // logic converts this to Master Packs for display when
        // hasOuterPack is true (see its useState initializer), so pass
        // the raw Packs value through as-is here.
        moq: s.moq != null ? String(s.moq) : "",

        dispatchDistrict: s.dispatch_district || "",
        dispatchState: s.dispatch_state || "",
        dispatchPincode: s.dispatch_pincode || "",
        dispatchingLocations: s.dispatching_locations || null, // form unflattens this itself only via the templates-prefill path — see note below

        returnPolicyKey: s.return_policy_key || "",
        warrantyKey: s.warranty_key || "",
    };
}

export default function SellerEditListingPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { token } = useAuth();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [initialValues, setInitialValues] = useState(null);
    const [brandDisplay, setBrandDisplay] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        fetchSellerSubmissionDetail(token, id).then((res) => {
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
    }, [token, id]);

    const handleSubmit = async (payload) => {
        setSubmitting(true);
        setSubmitError(null);
        const res = await updateSellerProductSubmission(token, id, payload);
        setSubmitting(false);
        if (!res?.success) { setSubmitError(res?.message || "Couldn't save changes."); return; }
        navigate("/seller/manage-listings", { state: { toast: res.message || "Changes submitted for review." } });
    };

    if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: C.muted }} /></div>;
    if (error) return (
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
            <p className="text-[14px] font-bold tracking-wide" style={{ color: C.ink }}>{error}</p>
            <button onClick={() => navigate("/seller/manage-listings")} className="mt-4 text-[12.5px] font-bold tracking-wide" style={{ color: C.secondary }}>
                Back to your listings
            </button>
        </div>
    );

    return (
        <div className="mx-auto min-h-screen max-w-3xl px-2.5 pb-10 pt-3 sm:px-4">
            <div className="mt-3 flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: C.hair, color: C.ink }}>
                    <ArrowLeft className="h-4 w-4" />
                </button>
                <h1 className="font-extrabold tracking-[-0.01em]" style={{ color: C.ink, fontSize: "clamp(20px, 1.8vw, 26px)" }}>Edit listing</h1>
            </div>

            {submitError && (
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{submitError}</p>
            )}

            <div className="mt-4">
                <SellerListingForm
                    mode="edit"
                    identityReadOnly
                    brandDisplay={brandDisplay}
                    initialValues={initialValues}
                    onSubmit={handleSubmit}
                    submitting={submitting}
                    submitLabel="Save the changes?"
                />
            </div>
        </div>
    );
}