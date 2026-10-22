// components/.../SellThisItemModal.jsx — catalogue "I want to sell this", rebuilt on the GROW add-product wizard.
// Brand, product name and product image are locked (the catalogue item is already approved).
// Submits through createSellerListingForBrand, which the backend auto-approves.
// Rendered in a portal on <body> so the home page <Layout> styles / transforms can't leak into the GROW wizard UI.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { fetchSellerAccessStatus, createSellerListingForBrand, fetchBrandItemDetail } from "../../utils/api.js";
import GrowCheckSkeleton from "../grow/GrowCheckSkeleton.jsx";
import { EASE } from "../catalog/tokens.js";

// Loaded only when the modal opens. The overrides CSS is imported AFTER the wizard (and its stylesheets) so it wins.
const Wizard = lazy(async () => {
    const m = await import("../../pages/GrowStartPage.jsx");
    await import("../grow/grow.css");
    // await import("../grow/grow-sell-modal.css");
    return { default: m.Wizard };
});

export default function SellThisItemModal({ brand, onClose }) {
    const { token, isLoggedIn, profile, clearSession } = useAuth();
    const navigate = useNavigate();
    const [access, setAccess] = useState(undefined);
    const [done, setDone] = useState(null);
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(true);
    const [toast, setToast] = useState("");
    const scrollRef = useRef(null);
    const toastTimer = useRef(null);

    const say = (m) => { setToast(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 2800); };
    useEffect(() => () => clearTimeout(toastTimer.current), []);

    useEffect(() => {
        let cancelled = false;
        if (!brand?.id) { setDetailLoading(false); return; }
        fetchBrandItemDetail(brand.id).then((res) => { if (!cancelled && res?.success) setDetail(res.item); })
            .finally(() => { if (!cancelled) setDetailLoading(false); });
        return () => { cancelled = true; };
    }, [brand?.id]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            // Not logged in at all — no need to hit the network.
            if (!isLoggedIn || !token) {
                if (!cancelled) setAccess({ canPublish: false, reason: "NOT_AUTHENTICATED" });
                return;
            }
            // Logged in but never finished setup — same gate the header/nav
            // already enforce elsewhere, applied here too so a stray deep
            // link or race can't open a listing form for an incomplete account.
            if (profile && profile.onboarding_step !== "done") {
                if (!cancelled) setAccess({ canPublish: false, reason: "NOT_AUTHENTICATED" });
                return;
            }
            const res = await fetchSellerAccessStatus(token);
            if (cancelled) return;
            if (!res?.success) {
                // A 401 here means the token is stale — expired, or the
                // account behind it has since been deleted. Clear the local
                // session so the header/app state catches up immediately,
                // instead of silently leaving a dead session lying around.
                if (res?.status === 401) await clearSession();
                setAccess({ canPublish: false, reason: "NOT_AUTHENTICATED" });
                return;
            }
            setAccess(res);
        })();
        return () => { cancelled = true; };
    }, [token, isLoggedIn, profile, clearSession]);

    useEffect(() => {
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        const { style } = document.body;
        const prevOverflow = style.overflow, prevPaddingRight = style.paddingRight;
        style.overflow = "hidden";
        if (scrollbarWidth > 0) style.paddingRight = `${scrollbarWidth}px`;
        return () => { style.overflow = prevOverflow; style.paddingRight = prevPaddingRight; };
    }, []);

    // Fixed identity + packaging, taken from the catalogue item (detail wins over the card data).
    const locked = useMemo(() => ({
        id: detail?.id || brand?.id,
        productName: detail?.name || brand?.name || "",
        brandName: detail?.brand_name || brand?.brand_name || "",
        image: detail?.image || brand?.image || "",
        unit: detail?.unit || "",
        packSize: detail?.packSize ?? null,
        masterPackSize: detail?.unitsPerMasterPack ?? null,
        gstPercent: detail?.gstPercent ?? null,
    }), [detail, brand]);

    // Same call and body as before: { genericProductId, ...formValues }.
    const submitFn = (payload) => createSellerListingForBrand(token, { genericProductId: brand.id, ...payload });

    const gateContent = {
        NOT_AUTHENTICATED: { title: "Sign in to sell this", body: "You'll need to sign in first.", cta: "Sign in", action: () => navigate("/login") },
        SELLER_NOT_ONBOARDED: { title: "Set up your seller shop first", body: "Listing a product requires an approved seller shop.", cta: "Set up my shop", action: () => navigate("/seller/onboarding") },
        SELLER_NOT_APPROVED: { title: "Your shop isn't approved yet", body: "Check your shop status or contact support.", cta: "Check my shop status", action: () => navigate("/seller/status") },
    }[access?.reason] || { title: "Can't list right now", body: "Please try again in a moment.", cta: "Close", action: onClose };

    const stillLoading = access === undefined || detailLoading;
    const live = done?.submission?.review_status === "approved";

    return createPortal(
        <div className="gs-portal">
            <motion.div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
                <motion.div
                    className="gs-sheet relative flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] bg-white sm:rounded-[24px]"
                    initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}
                    onClick={(e) => e.stopPropagation()}>

                    <div className="gs-top">
                        <div>
                            <p>I want to sell this</p>
                            <h2>{locked.productName}</h2>
                        </div>
                        <button type="button" className="gs-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
                    </div>

                    <div ref={scrollRef} data-lenis-prevent className="gs-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
                        <div className="gs gs-modal">
                            <div className="app">
                                {done ? (
                                    <section className="scr ctr">
                                        <div className="big" aria-hidden="true">✓</div>
                                        <h2>{live ? "Your listing is live" : "Your listing is submitted"}</h2>
                                        <p className="sub">{done.message || (live ? "Buyers can now see it." : "We will let you know once it is live for buyers.")}</p>
                                        <Link className="sbtn" to="/grow/products" onClick={onClose}>Go to my products</Link>
                                        <button className="sbtn gh" type="button" onClick={onClose}>Done</button>
                                    </section>
                                ) : stillLoading ? (
                                    <GrowCheckSkeleton />
                                ) : !access.canPublish ? (
                                    <section className="scr ctr">
                                        <h2>{gateContent.title}</h2>
                                        <p className="sub">{gateContent.body}</p>
                                        <button className="sbtn" type="button" onClick={gateContent.action}>{gateContent.cta}</button>
                                    </section>
                                ) : (
                                    <Suspense fallback={<GrowCheckSkeleton />}>
                                        <Wizard
                                            token={token}
                                            say={say}
                                            locked={locked}
                                            submitFn={submitFn}
                                            onStep={() => scrollRef.current?.scrollTo({ top: 0 })}
                                            onExit={onClose}
                                            onNeedOnboarding={() => setAccess({ canPublish: false, reason: "SELLER_NOT_ONBOARDED" })}
                                            onNeedLogin={async () => { await clearSession(); setAccess({ canPublish: false, reason: "NOT_AUTHENTICATED" }); }}
                                            onSubmitted={(_card, res) => setDone(res || {})}
                                        />
                                    </Suspense>
                                )}
                            </div>
                            <div className={`toast${toast ? " on" : ""}`} role="status">{toast}</div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </div>,
        document.body
    );
}