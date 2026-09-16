// src/pages/SharedProductPage.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, PackageX } from "lucide-react";
import BuyNowModal from "../components/BuyNowModal.jsx";
import LandingPage from "./LandingPage.jsx";
import { fetchSharedProductLink } from "../utils/api.js";

const C = { ink: "#0B1116", muted: "#667077", secondary: "#006F83" };

function toBuyerSellerPayload(s) {
    return {
        offerId: s.submission_id,
        sellerId: s.seller_id,
        display_name: s.display_name,
        unit: s.unit,
        moq: s.moq,
        price: s.price,
        gstPercent: s.gst_percent,
        availableStock: s.stock_quantity ?? null,
        stockType: s.stock_type,
        leadTime: s.stock_type === "made_to_order" ? s.production_lead_time_days : s.dispatch_time_days,
        dispatchTimeDays: s.dispatch_time_days,
        productionLeadTimeDays: s.production_lead_time_days,
        priceSlabs: s.price_slabs || [],
        quantityDiscounts: s.quantity_discounts || [],
        paymentTerms: s.payment_terms,
        returnPolicy: s.return_policy,
        warranty: s.warranty,
        deliveryTimeline: s.delivery_timeline,
        freightIncluded: s.freight_included,
        priceBasis: s.price_basis,
        dispatchOrigin: [s.dispatch_district, s.dispatch_state].filter(Boolean).join(", ") || null,
        dispatchPincode: s.dispatch_pincode,
        dispatchState: s.dispatch_state,
        packSize: s.pack_size,
        masterPackSize: s.units_per_master_pack,
        sampleAvailable: s.sample_available || false,
        sampleQuantity: s.sample_quantity ?? null,
        samplePrice: s.sample_price ?? null,
    };
}

export default function SharedProductPage() {
    const { submissionId } = useParams();
    const navigate = useNavigate();
    const [state, setState] = useState({ loading: true, error: null, data: null });
    const [showModal, setShowModal] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetchSharedProductLink(submissionId).then((res) => {
            if (cancelled) return;
            if (!res?.success) {
                setState({ loading: false, error: res?.message || "This link is no longer available.", data: null });
                return;
            }
            setState({ loading: false, error: null, data: res });
        });
        return () => { cancelled = true; };
    }, [submissionId]);

    // Loading and error states still get the real landing page behind
    // them — never a blank collapsed header/footer.
    if (state.loading) {
        return (
            <>
                <LandingPage />
                <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/20">
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
            </>
        );
    }

    if (state.error) {
        return (
            <>
                <LandingPage />
                <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 px-6" onClick={() => navigate("/")}>
                    <div onClick={(e) => e.stopPropagation()} className="flex max-w-xs flex-col items-center gap-2 rounded-2xl bg-white p-6 text-center">
                        <PackageX className="h-6 w-6" style={{ color: C.muted }} />
                        <p className="text-[14px] font-bold" style={{ color: C.ink }}>{state.error}</p>
                        <button onClick={() => navigate("/")} className="mt-2 text-[13px] font-bold" style={{ color: C.secondary }}>
                            Browse other products
                        </button>
                    </div>
                </div>
            </>
        );
    }

    const { product, seller } = state.data;

    return (
        <>
            <LandingPage />
            {showModal && (
                <BuyNowModal
                    seller={toBuyerSellerPayload(seller)}
                    product={{ name: product.name, brand_name: product.brandName }}
                    onClose={() => { setShowModal(false); navigate("/"); }}
                />
            )}
        </>
    );
}