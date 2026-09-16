// components/catalog/ListNewBrandModal.jsx
//
// Sibling to SellThisItemModal, used when the brand being listed does
// NOT already exist under this generic product. Identity fields
// (product/brand name etc.) are editable here — createSellerSubmission
// finds-or-creates the brand row server-side (see findOrCreateBrand in
// sellerCatalogListings.controller.js), so a near-duplicate name is
// deduped automatically rather than creating a second brand entity.
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Loader2, CheckCircle2, Lock, Package, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { fetchSellerAccessStatus, createSellerSubmission } from "../../utils/api.js";
import SellerListingForm from "../seller/listingForm/SellerListingForm.jsx";
import { C, EASE } from "./tokens";

export default function ListNewBrandModal({ genericProduct, onClose }) {
    const { token, isLoggedIn, profile, clearSession } = useAuth();
    const navigate = useNavigate();
    const [access, setAccess] = useState(undefined);
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!isLoggedIn || !token) {
                if (!cancelled) setAccess({ canPublish: false, reason: "NOT_AUTHENTICATED" });
                return;
            }
            if (profile && profile.onboarding_step !== "done") {
                if (!cancelled) setAccess({ canPublish: false, reason: "NOT_AUTHENTICATED" });
                return;
            }
            const res = await fetchSellerAccessStatus(token);
            if (cancelled) return;
            if (!res?.success) {
                if (res?.status === 401) await clearSession();
                setAccess({ canPublish: false, reason: "NOT_AUTHENTICATED" });
                return;
            }
            setAccess(res);
        })();
        return () => { cancelled = true; };
    }, [token, isLoggedIn, profile, clearSession]);

    const handleSubmit = async (form) => {
        setSubmitting(true);
        try {
            const res = await createSellerSubmission(token, { genericProductId: genericProduct.id, ...form });
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
        } finally {
            setSubmitting(false);
        }
    };

    const gateContent = {
        NOT_AUTHENTICATED: { icon: Lock, title: "Sign in to sell this", body: "You'll need to sign in to your BBM Marketplace account first.", cta: "Sign in", action: () => navigate("/login") },
        SELLER_NOT_ONBOARDED: { icon: Package, title: "Set up your seller shop first", body: "Listing a product requires an approved seller shop. It only takes a few minutes.", cta: "Set up my shop", action: () => navigate("/seller/onboarding") },
        SELLER_NOT_APPROVED: {
            icon: Clock,
            title: access?.sellerStatus === "pending_review" ? "Your shop is under review" : "Your shop isn't approved yet",
            body: access?.sellerStatus === "pending_review" ? "We're verifying your details. You'll be able to list products once your shop is approved." : "Please check your shop status or contact support.",
            cta: "Check my shop status",
            action: () => navigate("/seller/status"),
        },
    }[access?.reason] || { icon: Lock, title: "Can't list right now", body: "Please try again in a moment.", cta: "Close", action: onClose };

    return (
        <motion.div
            className="fixed inset-0 z-[999] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-[28px] bg-white p-5 sm:rounded-[24px] sm:p-6"
                initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}
                onClick={(e) => e.stopPropagation()}
            >
                {done ? (
                    <div className="flex flex-col items-center py-6 text-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-full text-white" style={{ background: "linear-gradient(135deg,#047084,#7fb3bd)" }}>
                            <CheckCircle2 className="h-7 w-7" />
                        </span>
                        <h2 className="mt-4 text-[18px] font-extrabold" style={{ color: C.ink }}>Submitted for review</h2>
                        <p className="mt-2 text-[13px] font-medium" style={{ color: C.muted }}>{done.message || "We'll notify you once it's approved."}</p>
                        <button onClick={onClose} className="mt-6 rounded-xl border px-5 py-2.5 text-[13px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>Done</button>
                    </div>
                ) : access === undefined ? (
                    <div className="flex items-center justify-center py-14"><Loader2 className="h-6 w-6 animate-spin" style={{ color: C.muted }} /></div>
                ) : !access.canPublish ? (
                    <div className="flex flex-col items-center py-4 text-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-full text-white" style={{ background: "linear-gradient(135deg,#047084,#7fb3bd)" }}>
                            <gateContent.icon className="h-6 w-6" />
                        </span>
                        <h2 className="mt-4 text-[18px] font-extrabold" style={{ color: C.ink }}>{gateContent.title}</h2>
                        <p className="mt-2 text-[13px] font-medium" style={{ color: C.muted }}>{gateContent.body}</p>
                        <button onClick={gateContent.action} className="mt-6 rounded-xl px-5 py-2.5 text-[13.5px] font-bold text-white" style={{ background: `linear-gradient(135deg, ${C.primary} 0%, #c71f11 100%)` }}>{gateContent.cta}</button>
                    </div>
                ) : (
                    <>
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: C.secondary }}>List a new brand</p>
                                <h2 className="mt-0.5 truncate text-[17px] font-extrabold" style={{ color: C.ink }}>{genericProduct.name}</h2>
                            </div>
                            <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.04]"><X className="h-4 w-4" style={{ color: C.muted }} /></button>
                        </div>
                        <p className="mt-3 text-[12.5px] font-medium" style={{ color: C.muted }}>
                            This is a new brand under {genericProduct.name} — fill in the product identity and your commercial terms below.
                        </p>
                        <div className="mt-5">
                            <SellerListingForm
                                mode="create"
                                initialValues={{ productName: genericProduct.name }}
                                stickyFooter={false}
                                onSubmit={handleSubmit}
                                submitting={submitting}
                                submitLabel="Submit for review"
                            />
                        </div>
                    </>
                )}
            </motion.div>
        </motion.div>
    );
}