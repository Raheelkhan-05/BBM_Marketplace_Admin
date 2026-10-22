// src/pages/GrowSellItemPage.jsx — "I want to sell this" in the GROW UI (route: /grow/sell/:brandId).
// Same wizard as the add-product flow, with the catalogue item's brand / name / image (and packaging + GST when
// on file) locked. Submits through createSellerListingForBrand, which the backend auto-approves.
// Runs under GrowProviders + GrowLayout, so it gets exactly the same styling environment as /grow.
//
// Enquiry flow: RfqQuoteModal sends the seller here with state { from, enquiry }. After the listing is created, the
// seller goes back to `from` with state { resumeQuote: { enquiry, submissionId } }; the host page (useQuoteResume)
// re-opens the quote popup with the new listing preselected.
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchSellerAccessStatus, createSellerListingForBrand, fetchBrandItemDetail } from "../utils/api.js";
import { Wizard } from "./GrowStartPage.jsx";
import GrowCheckSkeleton from "../components/grow/GrowCheckSkeleton.jsx";
import { useDropGuard } from "../components/grow/growUi.js";
import "../components/grow/grow-sell-item.css"; // keep AFTER the GrowStartPage import (its CSS loads first)

export default function GrowSellItemPage() {
    const { brandId } = useParams();
    const nav = useNavigate();
    const location = useLocation();
    const { token, isLoggedIn, profile, initializing, clearSession } = useAuth();

    // Where the seller came from (set by SellThisItemModal / RfqQuoteModal). Falls back to the home page.
    const [from] = useState(() => {
        const f = location.state?.from;
        return typeof f === "string" && f.startsWith("/") ? f : "/home";
    });
    // Set when the seller came from an enquiry's quote popup.
    const [enquiry] = useState(() => location.state?.enquiry || null);

    const [access, setAccess] = useState(undefined);
    const [detail, setDetail] = useState(null);
    const [detailState, setDetailState] = useState("loading"); // loading | ready | error
    const [done, setDone] = useState(null);
    const [toast, setToast] = useState("");
    useDropGuard(); // a file dropped just outside a drop zone must not navigate the tab away

    const say = (m) => {
        setToast(m);
        clearTimeout(say.t);
        say.t = setTimeout(() => setToast(""), 2800);
    };

    // Catalogue item (name, brand, image, packaging, GST).
    useEffect(() => {
        let cancelled = false;
        setDetailState("loading");
        fetchBrandItemDetail(brandId).then((res) => {
            if (cancelled) return;
            if (res?.success && res.item) { setDetail(res.item); setDetailState("ready"); } else setDetailState("error");
        }).catch(() => { if (!cancelled) setDetailState("error"); });
        return () => { cancelled = true; };
    }, [brandId]);

    // Same access gate as the old modal.
    useEffect(() => {
        if (initializing) return undefined; // wait for the profile of an existing session
        let cancelled = false;
        (async () => {
            if (!isLoggedIn || !token) {
                if (!cancelled) setAccess({ canPublish: false, reason: "NOT_AUTHENTICATED" });
                return;
            }
            // Logged in but never finished setup: same gate the header/nav already enforce.
            if (profile && profile.onboarding_step !== "done") {
                if (!cancelled) setAccess({ canPublish: false, reason: "NOT_AUTHENTICATED" });
                return;
            }
            const res = await fetchSellerAccessStatus(token);
            if (cancelled) return;
            if (!res?.success) {
                // A 401 means a stale token (expired, or the account is gone): clear it so the app catches up.
                if (res?.status === 401) await clearSession();
                setAccess({ canPublish: false, reason: "NOT_AUTHENTICATED" });
                return;
            }
            setAccess(res);
        })();
        return () => { cancelled = true; };
    }, [token, isLoggedIn, profile, initializing, clearSession]);

    const locked = useMemo(() => (detail ? {
        id: detail.id || brandId,
        productName: detail.name || "",
        brandName: detail.brandName || detail.brand_name || "",
        image: detail.image || "",
        unit: detail.unit || "",
        packSize: detail.packSize ?? null,
        masterPackSize: detail.unitsPerMasterPack ?? null,
        gstPercent: detail.gstPercent ?? null,
    } : null), [detail, brandId]);

    // Same call and body as before: { genericProductId, ...formValues }.
    const submitFn = (payload) => createSellerListingForBrand(token, { genericProductId: brandId, ...payload });

    const exit = () => {
        if (window.history.state?.idx > 0) nav(-1);
        else nav(from, { replace: true });
    };

    // Back to the enquiry and re-open the quote popup with the listing that was just created.
    const backToQuote = () => nav(from, {
        replace: true,
        state: { resumeQuote: { enquiry, submissionId: done?.submission?.id || null } },
    });

    const gate = {
        NOT_AUTHENTICATED: { title: "Sign in to sell this", body: "You'll need to sign in first.", cta: "Sign in", action: () => nav("/login") },
        SELLER_NOT_ONBOARDED: { title: "Set up your seller shop first", body: "Listing a product requires an approved seller shop.", cta: "Set up my shop", action: () => nav("/seller/onboarding") },
        SELLER_NOT_APPROVED: { title: "Your shop isn't approved yet", body: "Check your shop status or contact support.", cta: "Check my shop status", action: () => nav("/seller/status") },
    }[access?.reason] || { title: "Can't list right now", body: "Please try again in a moment.", cta: "Go back", action: exit };

    const loading = initializing || access === undefined || detailState === "loading";
    const live = done?.submission?.review_status === "approved";

    let body;
    if (done) {
        body = (
            <section className="scr ctr">
                <div className="big" aria-hidden="true">✓</div>
                <h2>{live ? "Your listing is live" : "Your listing is submitted"}</h2>
                <p className="sub">
                    {enquiry && live
                        ? "Now send your quote to the buyer with this product."
                        : (done.message || (live ? "Buyers can now see it." : "We will let you know once it is live for buyers."))}
                </p>
                {enquiry && (
                    <button className="sbtn" type="button" onClick={backToQuote} disabled={!live}>Continue to your quote</button>
                )}
                {enquiry && !live && <p className="cap">You can send your quote once this listing is approved.</p>}
                <Link className={enquiry ? "sbtn gh" : "sbtn"} to="/grow/products">Go to my products</Link>
                {!enquiry && <button className="sbtn gh" type="button" onClick={() => nav(from, { replace: true })}>Back to browsing</button>}
                {enquiry && !live && <button className="sbtn gh" type="button" onClick={() => nav(from, { replace: true })}>Back to the enquiry</button>}
            </section>
        );
    } else if (loading) {
        body = <GrowCheckSkeleton />;
    } else if (detailState === "error" || !locked) {
        body = (
            <section className="scr ctr">
                <h2>Couldn't load this product</h2>
                <p className="sub">Check your connection and try again.</p>
                <button className="sbtn" type="button" onClick={() => nav(from, { replace: true })}>Go back</button>
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
            <div className={`app${!done && !loading && access?.canPublish && locked ? " hb" : ""}`}>{body}</div>
            <div className={`toast${toast ? " on" : ""}`} role="status">{toast}</div>
        </div>
    );
}