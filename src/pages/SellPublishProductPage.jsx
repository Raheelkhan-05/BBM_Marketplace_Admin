import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { CheckCircle2, Lock, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchSellerAccessStatus, createSellerSubmission, createListingForExistingBrand, updateSellerProductSubmission } from "../utils/api.js";
import { fetchSubmissionDetail } from "../utils/sellerListingApi.js";
import ProductPathPicker from "../components/ProductPathPicker.jsx";
import SellerListingForm, { DEFAULT_LISTING_FORM } from "../components/seller/listingForm/SellerListingForm.jsx";
import Toast from "../components/Toast.jsx";

const C = { ink: "#0B1116", muted: "#667077" };

// Key under which an unsubmittable (not-a-seller-yet) product listing draft is cached
// locally, so the user's work isn't lost while they go complete/await seller onboarding.
export const PENDING_PRODUCT_SUBMISSION_KEY = "bbm_pending_product_submission";

export function savePendingProductSubmission(form) {
    try {
        localStorage.setItem(PENDING_PRODUCT_SUBMISSION_KEY, JSON.stringify({ form, savedAt: Date.now() }));
        return true;
    } catch {
        return false;
    }
}

export function readPendingProductSubmission() {
    try {
        const raw = localStorage.getItem(PENDING_PRODUCT_SUBMISSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.form ? parsed : null;
    } catch {
        return null;
    }
}

export function clearPendingProductSubmission() {
    try {
        localStorage.removeItem(PENDING_PRODUCT_SUBMISSION_KEY);
    } catch {
        /* noop */
    }
}

function rowToFormValues(row) {
    return {
        ...DEFAULT_LISTING_FORM,
        manufacturer: row.manufacturer || "",
        modelNo: row.model_no || "",
        gradeVariant: row.grade_variant || "",
        specifications: row.specifications || [],
        images: row.image ? [row.image] : [],
        basePrice: row.base_price ?? "",
        gstPercent: row.gst_percent ?? 18,
        ratePerPack: row.rate_per_pack ?? "",
        ratePerMasterPack: row.rate_per_master_pack ?? "",
        priceValidityTill: row.price_validity_till || DEFAULT_LISTING_FORM.priceValidityTill,
        moq: row.moq ?? "",
        sampleAvailable: row.sample_available || false,
        samplePrice: row.sample_price ?? "",
        priceSlabs: row.price_slabs || [],
        quantityDiscounts: row.quantity_discounts || [],
        packSize: row.pack_size ?? "",
        unit: row.unit || "",
        unitsPerMasterPack: row.units_per_master_pack ?? "",
        masterPackSize: row.master_pack_size ?? "",
        packagingType: row.packaging_type || "",
        stockQuantity: row.stock_quantity ?? "",
        stockType: row.stock_type || "ready_stock",
        dispatchTimeDays: row.dispatch_time_days ?? "",
        productionLeadTimeDays: row.production_lead_time_days ?? "",
        sellerLocation: row.seller_location || "",
        dispatchLocation: row.dispatch_location || "",
        deliveryTimeline: row.delivery_timeline || "",
        freightTerms: row.freight_terms || DEFAULT_LISTING_FORM.freightTerms,
        // hsnCode: row.hsn_code || "",
        gstRegistrationStatus: row.gst_registration_status || "regular",
        taxInvoiceAvailable: row.tax_invoice_available ?? true,
        paymentTerms: row.payment_terms || "",
        returnPolicy: row.return_policy || "",
        warranty: row.warranty || "",
        qualityCertificates: row.quality_certificates || [],
        tdsMsdsCoa: row.tds_msds_coa || [],
        otherCertifications: row.other_certifications || [],
    };
}

export default function SellPublishProductPage() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const { submissionId } = useParams(); // present only on the /seller/sell/:submissionId/edit route

    const isEdit = Boolean(submissionId);

    // `access` is now only used for (a) the shopSlug shown on the submitted
    // screen and (b) gating the EDIT route, which requires an already-
    // approved seller who owns the listing. It no longer gates the CREATE
    // flow — anyone can open /seller/sell and fill the form; seller status
    // is only checked when they actually hit submit (see handleSubmit).
    const [access, setAccess] = useState(undefined);
    const [path, setPath] = useState(null);
    const [editRecord, setEditRecord] = useState(undefined); // undefined = loading, null = not found
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(null);
    const [shopSlug, setShopSlug] = useState(null);
    const [toastMsg, setToastMsg] = useState(null);

    useEffect(() => {
        if (!token) {
            setAccess({ canPublish: true, guest: true });
            return;
        }
        (async () => {
            const res = await fetchSellerAccessStatus(token);
            setAccess(res?.success ? res : { canPublish: false, reason: "NOT_AUTHENTICATED" });
            if (res?.success && res.shopSlug) setShopSlug(res.shopSlug);
        })();
    }, [token]);

    useEffect(() => {
        if (!isEdit || !token) return;
        fetchSubmissionDetail(token, submissionId).then((res) => {
            setEditRecord(res?.success ? res.submission : null);
        });
    }, [isEdit, token, submissionId]);

    // EDIT route only: bounce away if this seller can't edit listings right
    // now. This is a page-load-time check (not user-triggered), so it's the
    // one case that still runs in an effect. CREATE mode never hits this —
    // it's always allowed to render the form and only gets checked at submit.
    useEffect(() => {
        if (!isEdit || !access || access.canPublish) return;
        if (access.reason === "SELLER_NOT_ONBOARDED") {
            navigate("/seller/listings", { replace: true, state: { toast: "Please set up your store first." } });
        } else if (access.reason === "SELLER_NOT_APPROVED") {
            navigate("/seller/listings", { replace: true });
        }
        // NOT_AUTHENTICATED / anything else falls through to <AccessGate />
        // rendered below.
    }, [isEdit, access, navigate]);

    // Note: auto-submitting any cached draft once the user becomes an approved seller is
    // handled globally by <PendingSubmissionWatcher /> (mounted in App.jsx), so it fires
    // on whatever page the user happens to be on — not just this one. This page only reads
    // the draft below to prefill the form in case it's still awaiting approval.

    const handleSubmit = async (form) => {
        setSubmitting(true);
        try {
            let res;
            if (isEdit) {
                res = await updateSellerProductSubmission(token, submissionId, form);
            } else if (form.genericProductBrandId) {
                // Product already exists in the catalog and was matched/locked
                // (the "Already approved · locked" banner) — this hits the
                // endpoint that resolves the brand item by ID directly instead
                // of re-searching by product/brand name.

                res = await createListingForExistingBrand(token, form);
            } else {
                // Brand-new product — no existing match, backend resolves-or-
                // creates the brand item from productName/brandName itself.
                res = await createSellerSubmission(token, form);
            }
            if (!res?.success) {
                const code = res?.code;

                if (code === "SELLER_NOT_ONBOARDED") {
                    // Not a seller yet — save the filled-in product so it isn't lost,
                    // then send them to set up their shop. The listings page picks up
                    // the toast from router state.
                    const saved = !isEdit ? savePendingProductSubmission(form) : false;
                    navigate("/seller/listings", {
                        replace: true,
                        state: {
                            toast: saved
                                ? "Please set up your store — we've saved your product details and will submit it automatically once you're approved."
                                : "Please set up your store first.",
                        },
                    });
                    return;
                }

                if (code === "NOT_AUTHENTICATED" || code === "SELLER_NOT_APPROVED") {
                    // Everything else — stay right here, don't navigate anywhere, and
                    // don't lose what's been typed. Just surface a toast.
                    if (!isEdit) savePendingProductSubmission(form);
                    const msg = code === "NOT_AUTHENTICATED"
                        ? "Please sign in to submit your listing."
                        : res.sellerStatus === "pending_review"
                            ? "Your shop is still under review — we'll notify you once it's approved."
                            : "Your shop isn't approved yet. Please check your shop status.";
                    setToastMsg(msg);
                    return;
                }

                setToastMsg(res?.message || "Couldn't submit. Please check the required fields.");
                return;
            }
            // Successful submission — clear any stale pending draft.
            clearPendingProductSubmission();
            setSubmitted(res);
        } finally {
            setSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <>
                <SubmittedScreen shopSlug={shopSlug} isEdit={isEdit} />
                <Toast message={toastMsg} show={!!toastMsg} onDone={() => setToastMsg(null)} />
            </>
        );
    }

    // EDIT mode still needs both the access check and the record before it
    // can render anything meaningful.
    if (isEdit && (access === undefined || editRecord === undefined)) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: C.muted }} />
            </div>
        );
    }
    if (isEdit && access && !access.canPublish && access.reason !== "SELLER_NOT_ONBOARDED" && access.reason !== "SELLER_NOT_APPROVED") {
        return (
            <>
                <AccessGate access={access} navigate={navigate} />
                <Toast message={toastMsg} show={!!toastMsg} onDone={() => setToastMsg(null)} />
            </>
        );
    }
    if (isEdit && !editRecord) {
        return (
            <>
                <AccessGate access={{ reason: "NOT_FOUND" }} navigate={navigate} />
                <Toast message={toastMsg} show={!!toastMsg} onDone={() => setToastMsg(null)} />
            </>
        );
    }

    const brandDisplay = isEdit && editRecord?.brand
        ? { name: editRecord.brand.name, brandName: editRecord.brand.brand_name, image: editRecord.brand.image }
        : null;

    const pendingDraft = !isEdit ? readPendingProductSubmission() : null;

    return (
        <div className="mx-auto max-w-4xl min-h-screen px-4 pt-6 sm:px-6 bg-[#FCFBF9]">
            <h1 className="text-[clamp(1.7rem,3.5vw,1.9rem)] font-bold text-slate-900">{isEdit ? "Edit listing" : "List a product"}</h1>
            <p className="mt-1.5 text-[13.5px] tracking-wide font-medium text-slate-500">
                {isEdit
                    ? "Update your commercial terms — buyers see this immediately if it's already approved."
                    : "Everything on one page. Save your Delivery, Tax & Legal, and Commercial Terms as groups once, and every future listing prefills from them."}
            </p>

            {pendingDraft && (
                <div className="mt-4 rounded-xl border border-[#7fb3bd]/40 bg-[#047084]/[0.05] px-4 py-3 text-[12.5px] font-semibold text-slate-600">
                    We found a listing you started earlier that couldn't be submitted yet — your details below have been restored from that draft.
                </div>
            )}

            <div className="mt-6">
                <SellerListingForm
                    mode={isEdit ? "edit" : "create"}
                    identityReadOnly={isEdit}
                    brandDisplay={brandDisplay}
                    initialValues={isEdit ? rowToFormValues(editRecord) : pendingDraft?.form}
                    onSubmit={handleSubmit}
                    submitting={submitting}
                    submitLabel={isEdit ? "Save changes" : "Submit"}
                />
            </div>

            <Toast message={toastMsg} show={!!toastMsg} onDone={() => setToastMsg(null)} />
        </div>
    );
}

function AccessGate({ access, navigate }) {
    const content = {
        NOT_AUTHENTICATED: {
            icon: Lock,
            title: "Sign in to list a product",
            body: "You'll need to sign in to your BBM Marketplace account first.",
            cta: "Sign in",
            action: () => navigate("/login"),
        },
        NOT_FOUND: {
            icon: Lock,
            title: "Listing not found",
            body: "This listing doesn't exist or isn't yours.",
            cta: "Go to my listings",
            action: () => navigate("/seller/listings"),
        },
    }[access.reason] || { icon: Lock, title: "Can't do this right now", body: "Please try again in a moment.", cta: "Go back", action: () => navigate(-1) };
    const Icon = content.icon;
    return (
        <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full text-white" style={{ background: "linear-gradient(135deg,#047084,#7fb3bd)" }}><Icon className="h-6 w-6" /></span>
            <h2 className="mt-4 text-[19px] font-extrabold text-slate-900">{content.title}</h2>
            <p className="mt-2 text-[13.5px] font-medium text-slate-500">{content.body}</p>
            <button type="button" onClick={content.action} className="mt-6 rounded-xl px-5 py-2.5 text-[13.5px] font-bold text-white" style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>{content.cta}</button>
        </div>
    );
}

function SubmittedScreen({ shopSlug, isEdit }) {
    return (
        <div className="mx-auto min-h-screen flex max-w-md flex-col items-center px-6 py-20 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full text-white" style={{ background: "linear-gradient(135deg,#047084,#7fb3bd)" }}><CheckCircle2 className="h-7 w-7" /></span>
            <h2 className="mt-4 text-[20px] font-extrabold text-slate-900">{isEdit ? "Changes saved" : "Submitted for review"}</h2>
            <p className="mt-2 text-[13.5px] font-medium text-slate-500">{isEdit ? "Your listing has been updated." : "We'll notify you once our team approves it — or let you know what to fix if it's rejected."}</p>
            <Link to="/seller/listings" className="mt-6 rounded-xl border border-slate-200 px-5 py-2.5 text-[13.5px] font-bold text-slate-700">
                {shopSlug ? "Go to my shop" : "Go to my listings"}
            </Link>
        </div>
    );
}