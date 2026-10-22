// src/pages/GrowQuoteProductPage.jsx
// Routes (register next to /grow/sell/:brandId, same layout):
//   /grow/enquiry/:enquiryId/add-product            -> add a completely new product (equivalent products allowed)
//   /grow/enquiry/:enquiryId/add-product/:brandId   -> "sell this item": catalogue item locked, only price / stock / delivery
// Opened from the quote popup (RfqQuoteModal) with state { from, enquiry }. When the listing is saved the seller goes
// back to `from` with state.resumeQuote so the popup re-opens with the new product preselected.
//
// New products are sent with rfqEnquiryId: the server maps the product to the enquiry's generic product itself
// (see the createBrandItem patch), so duplicates can be merged later. The seller is not told about any matching.
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
    fetchSellerAccessStatus, createSellerListingForBrand, createListingForExistingBrand, createSellerSubmission, fetchBrandItemDetail,
} from "../utils/api.js";
import { enquiryPath } from "../utils/rfqShare.js";
import { Wizard } from "./GrowStartPage.jsx";
import GrowCheckSkeleton from "../components/grow/GrowCheckSkeleton.jsx";
import { useDropGuard } from "../components/grow/growUi.js";
import "../components/grow/grow-sell-item.css"; // keep AFTER the GrowStartPage import (its CSS loads first)

export default function GrowQuoteProductPage() {
    const { enquiryId, brandId } = useParams();
    const nav = useNavigate();
    const location = useLocation();
    const { token, isLoggedIn, profile, initializing, clearSession } = useAuth();

    const [from] = useState(() => {
        const f = location.state?.from;
        return typeof f === "string" && f.startsWith("/") ? f : enquiryPath(enquiryId);
    });
    const enquiry = location.state?.enquiry || null;

    const [access, setAccess] = useState(undefined);
    const [detail, setDetail] = useState(null);
    const [detailState, setDetailState] = useState(brandId ? "loading" : "ready"); // loading | ready | error
    const [done, setDone] = useState(null);
    const [toast, setToast] = useState("");
    useDropGuard();

    const say = (m) => {
        setToast(m);
        clearTimeout(say.t);
        say.t = setTimeout(() => setToast(""), 2800);
    };

    // Locked mode: load the catalogue item.
    useEffect(() => {
        if (!brandId) return undefined;
        let cancelled = false;
        setDetailState("loading");
        fetchBrandItemDetail(brandId).then((res) => {
            if (cancelled) return;
            if (res?.success && res.item) { setDetail(res.item); setDetailState("ready"); } else setDetailState("error");
        }).catch(() => { if (!cancelled) setDetailState("error"); });
        return () => { cancelled = true; };
    }, [brandId]);

    // Same access gate as GrowSellItemPage.
    useEffect(() => {
        if (initializing) return undefined;
        let cancelled = false;
        (async () => {
            if (!isLoggedIn || !token) { if (!cancelled) setAccess({ canPublish: false, reason: "NOT_AUTHENTICATED" }); return; }
            if (profile && profile.onboarding_step !== "done") { if (!cancelled) setAccess({ canPublish: false, reason: "NOT_AUTHENTICATED" }); return; }
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
    }, [token, isLoggedIn, profile, initializing, clearSession]);

    const locked = useMemo(() => (brandId && detail ? {
        id: detail.id || brandId,
        productName: detail.name || "",
        brandName: detail.brandName || detail.brand_name || "",
        image: detail.image || "",
        unit: detail.unit || "",
        packSize: detail.packSize ?? null,
        masterPackSize: detail.unitsPerMasterPack ?? null,
        gstPercent: detail.gstPercent ?? null,
    } : null), [detail, brandId]);

    const submitFn = (payload) => {
        if (brandId) return createSellerListingForBrand(token, { genericProductId: brandId, ...payload });
        const body = { ...payload, rfqEnquiryId: enquiryId };
        return payload.genericProductBrandId ? createListingForExistingBrand(token, body) : createSellerSubmission(token, body);
    };

    const exit = () => {
        if (window.history.state?.idx > 0) nav(-1);
        else nav(from, { replace: true });
    };
    const backToQuote = () => nav(from, {
        replace: true,
        state: enquiry ? { resumeQuote: { enquiry, submissionId: done?.submission?.id || null } } : null,
    });

    const gate = {
        NOT_AUTHENTICATED: { title: "Sign in to continue", body: "You'll need to sign in first.", cta: "Sign in", action: () => nav("/grow?start=1", { state: { from: enquiryPath(enquiryId) } }) },
        SELLER_NOT_ONBOARDED: { title: "Set up your seller shop first", body: "Listing a product requires an approved seller shop.", cta: "Set up my shop", action: () => nav("/grow?start=1", { state: { from: enquiryPath(enquiryId) } }) },
        SELLER_NOT_APPROVED: { title: "Your shop isn't approved yet", body: "Check your shop status or contact support.", cta: "Check my shop status", action: () => nav("/seller/status") },
    }[access?.reason] || { title: "Can't list right now", body: "Please try again in a moment.", cta: "Go back", action: exit };

    const loading = initializing || access === undefined || detailState === "loading";
    // createSubmission / createListingForExistingBrand only return { id, created_at, price }, so also read the message.
    const live = done?.submission?.review_status === "approved" || /live immediately/i.test(done?.message || "");
    const wizardReady = !done && !loading && access?.canPublish && (brandId ? !!locked : true);

    let body;
    if (done) {
        body = (
            <section className="scr ctr">
                <div className="big" aria-hidden="true">✓</div>
                <h2>{live ? "Your listing is live" : "Your listing is submitted"}</h2>
                <p className="sub">{live ? "Now send your quote to the buyer." : (done.message || "We will let you know once it is live. You can send your quote then.")}</p>
                <button className="sbtn" type="button" onClick={backToQuote}>{live ? "Continue to quote" : "Back to the enquiry"}</button>
            </section>
        );
    } else if (loading) {
        body = <GrowCheckSkeleton />;
    } else if (detailState === "error" || (brandId && !locked)) {
        body = (
            <section className="scr ctr">
                <h2>Couldn't load this product</h2>
                <p className="sub">Check your connection and try again.</p>
                <button className="sbtn" type="button" onClick={exit}>Go back</button>
            </section>
        );
    } else if (!access.canPublish) {
        body = (
            <section className="scr ctr">
                <h2>{gate.title}</h2>
                <p className="sub">{gate.body}</p>
                <button className="sbtn" type="button" onClick={gate.action}>{gate.cta}</button>
            </section>
        );
    } else {
        body = (
            <Wizard
                token={token}
                say={say}
                locked={locked}
                quiet
                submitFn={submitFn}
                onExit={exit}
                onNeedOnboarding={() => setAccess({ canPublish: false, reason: "SELLER_NOT_ONBOARDED" })}
                onNeedLogin={async () => { await clearSession(); setAccess({ canPublish: false, reason: "NOT_AUTHENTICATED" }); }}
                onSubmitted={(_card, res) => setDone(res || {})}
            />
        );
    }

    return (
        <div className="gs">
            <div className={`app${wizardReady ? " hb" : ""}`}>{body}</div>
            <div className={`toast${toast ? " on" : ""}`} role="status">{toast}</div>
        </div>
    );
}