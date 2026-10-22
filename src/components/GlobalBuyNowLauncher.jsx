// components/GlobalBuyNowLauncher.jsx
//
// Renders BuyNowModal OUTSIDE of any specific page/route, so "Resume" can
// reopen a Buy Now flow no matter what screen the buyer is currently on
// (HomeProductFeed keeps BuyNowModal as page-local state — there is no
// route that owns it, which is exactly why the old navigate("/product/:id")
// approach silently did nothing). Triggered by OrderResumeContext's
// launchOfferId.
import { useEffect, useState } from "react";
import BuyNowModal from "./BuyNowModal.jsx";
import { useOrderResume } from "../context/OrderResumeContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchOfferForResume } from "../utils/api.js"; // see backend note below

export default function GlobalBuyNowLauncher() {
    const { launchOfferId, closeLaunched } = useOrderResume();
    const { token } = useAuth();
    const [payload, setPayload] = useState(null); // { seller, product }
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!launchOfferId) { setPayload(null); return; }
        let cancelled = false;
        setLoading(true);
        fetchOfferForResume(launchOfferId.offerId, token).then((res) => {
            if (cancelled) return;
            setLoading(false);
            if (!res?.success) { closeLaunched(); return; }
            setPayload({ seller: res.seller, product: res.product, intent: launchOfferId });
        });
        return () => { cancelled = true; };
    }, [launchOfferId?.proposalRouteOptionId]);

    if (!launchOfferId) return null;
    if (loading || !payload) return null; // could render a small spinner overlay if desired

    return (
        <BuyNowModal
            seller={payload.seller}
            product={payload.product}
            resumeIntent={payload.intent}
            onClose={closeLaunched}
        />
    );
}