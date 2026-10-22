// src/pages/SharedProductPage.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Loader2, PackageX, Lock } from "lucide-react";
import BuyNowModal from "../components/BuyNowModal.jsx";
import HomePage from "./HomePage.jsx";
import { fetchSharedProductLink, fetchBrandItemSellers } from "../utils/api.js";
import { toBuyerSellerPayload } from "../utils/buyerSellerPayload";
import { useAuth } from "../context/AuthContext.jsx";

const C = { ink: "#0B1116", muted: "#667077", secondary: "#006F83" };

// If the shared-link payload is a leaner row than the home feed's seller list
// (no pack size / slabs / sample fields), fill the gaps from the same seller
// list the home page uses, so the modal is identical. Runs inside the single
// loading phase; failures are ignored (we just use what we have).
const FULL_ROW_KEYS = ["pack_size", "units_per_master_pack", "price_slabs", "quantity_discounts"];
async function hydrateSeller(seller, productId, token) {
    const isFull = FULL_ROW_KEYS.every((k) => Object.prototype.hasOwnProperty.call(seller, k));
    if (isFull || !productId) return seller;
    try {
        const res = await fetchBrandItemSellers(productId, { sort: "price_asc", limit: 30, offset: 0, token });
        const full = res?.success ? (res.items || []).find((r) => r.submission_id === seller.submission_id) : null;
        return full ? { ...seller, ...full } : seller;
    } catch {
        return seller;
    }
}

function Overlay({ onBackdrop, children }) {
    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 px-6" onClick={onBackdrop}>
            <div onClick={(e) => e.stopPropagation()} className="flex max-w-xs flex-col items-center gap-2 rounded-2xl bg-white p-6 text-center">
                {children}
            </div>
        </div>
    );
}

export default function SharedProductPage() {
    const { submissionId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const auth = useAuth();
    const { token, effectiveLoggedIn } = auth;
    // Auth is still hydrating on a cold open. Adjust to whatever flag your AuthContext exposes.
    const authLoading = !!(auth.loading ?? auth.authLoading ?? auth.initializing ?? auth.isLoading);

    const [state, setState] = useState({ loading: true, error: null, code: null, data: null });
    const [showModal, setShowModal] = useState(true);

    useEffect(() => {
        if (authLoading) return; // don't decide anything until we know who the user is

        if (!effectiveLoggedIn) {
            setState({ loading: false, error: null, code: "LOGIN_REQUIRED", data: null });
            return;
        }

        let cancelled = false;
        (async () => {
            const res = await fetchSharedProductLink(submissionId, token);
            if (cancelled) return;
            if (!res?.success) {
                setState({ loading: false, error: res?.message || "This link is no longer available.", code: res?.code || null, data: null });
                return;
            }
            const productId = res.product?.id ?? res.product?.brandItemId ?? res.product?.brand_item_id ?? null;
            const seller = await hydrateSeller(res.seller, productId, token);
            if (cancelled) return;
            setState({ loading: false, error: null, code: null, data: { ...res, seller } });
        })();
        return () => { cancelled = true; };
    }, [submissionId, token, effectiveLoggedIn, authLoading]);

    const goHome = () => navigate("/", { replace: true });
    const loading = authLoading || state.loading;

    let overlay = null;
    let modal = null;

    if (loading) {
        // ONE loader for the whole wait (auth + fetch), then straight into the modal.
        overlay = (
            <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
        );
    } else if (state.code === "LOGIN_REQUIRED") {
        const back = `${location.pathname}${location.search}`;
        overlay = (
            <Overlay onBackdrop={goHome}>
                <Lock className="h-6 w-6" style={{ color: C.muted }} />
                <p className="text-[14px] font-bold tracking-wide" style={{ color: C.ink }}>Login to view this product</p>
                <p className="text-[12px] font-medium tracking-wide" style={{ color: C.muted }}>This link needs you to be signed in first.</p>
                <button
                    onClick={() => navigate("/login", { state: { from: back, returnTo: location.pathname } })}
                    className="mt-2 rounded-xl px-4 py-2 text-[13px] font-bold tracking-wide text-white"
                    style={{ background: C.secondary }}>
                    Login
                </button>
            </Overlay>
        );
    } else if (state.code === "RESTRICTED") {
        overlay = (
            <Overlay onBackdrop={goHome}>
                <Lock className="h-6 w-6" style={{ color: C.muted }} />
                <p className="text-[14px] font-bold tracking-wide" style={{ color: C.ink }}>Not available for your account</p>
                <p className="text-[12px] font-medium tracking-wide" style={{ color: C.muted }}>{state.error}</p>
                <button onClick={goHome} className="mt-2 text-[13px] font-bold tracking-wide" style={{ color: C.secondary }}>Browse other products</button>
            </Overlay>
        );
    } else if (state.error) {
        overlay = (
            <Overlay onBackdrop={goHome}>
                <PackageX className="h-6 w-6" style={{ color: C.muted }} />
                <p className="text-[14px] font-bold tracking-wide" style={{ color: C.ink }}>{state.error}</p>
                <button onClick={goHome} className="mt-2 text-[13px] font-bold tracking-wide" style={{ color: C.secondary }}>Browse other products</button>
            </Overlay>
        );
    } else if (state.data && showModal) {
        const { product, seller } = state.data;
        // Same product shape HomeProductFeed passes to BuyNowModal.
        modal = (
            <BuyNowModal
                deferPriceUntilConfirmed
                seller={toBuyerSellerPayload(seller)}
                product={{
                    id: product.id ?? product.brandItemId ?? product.brand_item_id ?? null,
                    name: product.name,
                    brand_name: product.brand_name ?? product.brandName,
                    brand_image: product.brand_image ?? product.brandImage,
                    image: product.image ?? product.images?.[0] ?? null,
                    model_no: product.model_no ?? product.modelNo,
                    category_name: product.category_name ?? product.categoryName,
                    subcategory_name: product.subcategory_name ?? product.subcategoryName,
                }}
                onClose={() => { setShowModal(false); goHome(); }}
            />
        );
    }

    // HomePage is rendered once, in a stable position, so it never remounts between states.
    return (
        <>
            <HomePage />
            {overlay}
            {modal}
        </>
    );
}