// components/.../SellThisItemModal.jsx — REWRITTEN to use the new SellerListingForm
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Loader2, CheckCircle2, Lock, Package, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { fetchSellerAccessStatus, createSellerListingForBrand, fetchBrandItemDetail } from "../../utils/api.js";
import SellerListingForm from "../seller/listingForm/SellerListingForm.jsx";
import { C, EASE } from "../catalog/tokens.js";

export default function SellThisItemModal({ brand, onClose }) {
    const { token, isLoggedIn, profile, clearSession } = useAuth();
    const navigate = useNavigate();
    const [access, setAccess] = useState(undefined);
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(null);
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(true);

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

    const merged = {
        name: detail?.name || brand?.name,
        brand_name: detail?.brand_name || brand?.brand_name,
        image: detail?.image || brand?.image,
    };

    // NEW — Unit / Pack Size / Master Pack Size are a fixed property of the
    // catalog product itself. Pull them from the brand item detail so the
    // form can show them as locked, instead of always asking the seller to
    // re-enter data that's already on file. Only genuinely older catalog
    // items (created before this was tracked) will have these blank, and
    // only those will still prompt for input.
    const packagingInitialValues = {
        genericProductBrandId: detail?.id || brand?.id,
        unit: detail?.unit || "",
        packSize: detail?.packSize != null ? String(detail.packSize) : "",
        masterPackSize: detail?.unitsPerMasterPack != null ? String(detail.unitsPerMasterPack) : "",
    };

    const handleSubmit = async (formValues) => {
        setSubmitting(true);
        try {
            console.log("formValues", formValues);
            const res = await createSellerListingForBrand(token, { genericProductId: brand.id, ...formValues });

            if (!res?.success) {
                if (res?.status === 401 || res?.code === "NOT_AUTHENTICATED") {
                    await clearSession();
                    setAccess({ canPublish: false, reason: "NOT_AUTHENTICATED" });
                    return;
                }
                if (["SELLER_NOT_ONBOARDED", "SELLER_NOT_APPROVED"].includes(res?.code)) {
                    setAccess({ canPublish: false, reason: res.code, sellerStatus: res.sellerStatus });
                    return;
                }
                window.alert(res?.message || "Couldn't submit. Please check the required fields.");
                return;
            }
            setDone(res);
        } finally { setSubmitting(false); }
    };

    const gateContent = {
        NOT_AUTHENTICATED: { icon: Lock, title: "Sign in to sell this", body: "You'll need to sign in first.", cta: "Sign in", action: () => navigate("/login") },
        SELLER_NOT_ONBOARDED: { icon: Package, title: "Set up your seller shop first", body: "Listing a product requires an approved seller shop.", cta: "Set up my shop", action: () => navigate("/seller/onboarding") },
        SELLER_NOT_APPROVED: { icon: Clock, title: "Your shop isn't approved yet", body: "Check your shop status or contact support.", cta: "Check my shop status", action: () => navigate("/seller/status") },
    }[access?.reason] || { icon: Lock, title: "Can't list right now", body: "Please try again in a moment.", cta: "Close", action: onClose };

    const stillLoading = access === undefined || detailLoading;

    return (
        <motion.div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
            <motion.div data-lenis-prevent
                className="max-h-[92vh] w-full max-w-4xl overflow-y-auto overscroll-contain rounded-t-[28px] bg-white p-5 sm:rounded-[24px] sm:p-6"
                initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}
                onClick={(e) => e.stopPropagation()}>
                {done ? (
                    <div className="flex flex-col items-center py-6 text-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-full text-white" style={{ background: "linear-gradient(135deg,#047084,#7fb3bd)" }}><CheckCircle2 className="h-7 w-7" /></span>
                        <h2 className="mt-4 text-[18px] font-extrabold" style={{ color: C.ink }}>Submitted for review</h2>
                        <p className="mt-2 text-[13px] font-medium" style={{ color: C.muted }}>{done.message}</p>
                        <button onClick={onClose} className="mt-6 rounded-xl border px-5 py-2.5 text-[13px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>Done</button>
                    </div>
                ) : stillLoading ? (
                    <div className="flex items-center justify-center py-14"><Loader2 className="h-6 w-6 animate-spin" style={{ color: C.muted }} /></div>
                ) : !access.canPublish ? (
                    <div className="flex flex-col items-center py-4 text-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-full text-white" style={{ background: "linear-gradient(135deg,#047084,#7fb3bd)" }}><gateContent.icon className="h-6 w-6" /></span>
                        <h2 className="mt-4 text-[18px] font-extrabold" style={{ color: C.ink }}>{gateContent.title}</h2>
                        <p className="mt-2 text-[13px] font-medium" style={{ color: C.muted }}>{gateContent.body}</p>
                        <button onClick={gateContent.action} className="mt-6 rounded-xl px-5 py-2.5 text-[13.5px] font-bold text-white" style={{ background: `linear-gradient(135deg, ${C.primary} 0%, #c71f11 100%)` }}>{gateContent.cta}</button>
                    </div>
                ) : (
                    <>
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: C.secondary }}>I want to sell this</p>
                                <h2 className="mt-0.5 truncate text-[18px] font-extrabold tracking-wider" style={{ color: C.ink }}>{merged.name}</h2>
                            </div>
                            <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.04]"><X className="h-4 w-4" style={{ color: C.muted }} /></button>
                        </div>
                        <p className="mt-2 mb-4 text-[12.5px] font-medium tracking-wider" style={{ color: C.muted }}>
                            The product identity is already approved - just add your commercial terms below.
                        </p>
                        <SellerListingForm
                            identityLocked
                            lockedIdentity={{ productName: merged.name, brandName: merged.brand_name, image: merged.image }}
                            initialValues={packagingInitialValues}
                            onSubmit={handleSubmit}
                            submitting={submitting}
                            submitLabel="Submit for review"
                            stickyBottomClassName="-bottom-6"
                        />
                    </>
                )}
            </motion.div>
        </motion.div>
    );
}