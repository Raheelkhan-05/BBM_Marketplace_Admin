// src/pages/GrowStartPage.jsx
// New default /grow experience (the compact HTML design) wired to the existing backend.
// land -> Start selling -> (login | seller onboarding | add-product wizard)
//
// Return flow: a page can send someone here with nav("/grow?start=1", { state: { from: "/grow/enquiry/12" } }).
// When `from` is an enquiry page (list or single enquiry) the flow does login -> onboarding -> straight back to that
// exact page, instead of opening the add-product wizard.
//
// "Sell this" from an enquiry quote popup sends { from, enquiry, sellPrefill: { productName, brandName, unit, image } }.
// Then the wizard opens with that product name, brand, unit and image shown as locked fields, and the enquiry id is
// sent with the listing so the backend approves it directly. When the listing comes back live, the seller is sent
// straight back to the enquiry with the quote popup re-opened on the new listing (resumeQuote). If it is not live
// (for example the product already existed and is still pending review), a "listing submitted" screen is shown.
//
// The Wizard is also exported: SellThisItemModal reuses it in "locked" mode (brand / name / image fixed, own submit fn).
import { useEffect, useMemo, useRef, useState } from "react";   // add useMemo
import { derivePriceBreakdown } from "../../shared/customPricing.js";
import { GrowBuyerAccessDraft } from "../components/grow/GrowBuyerAccess.jsx";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
    saveSellerProgress, submitSellerOnboarding, saveSellerBankDetails,
    uploadSellerFile, createSellerSubmission, createListingForExistingBrand,
} from "../utils/api.js";
import {
    findBrandItemMatch, lookupPincode, fetchListingPolicyOptions,
    fetchDefaultListingTemplates, fetchGeoCountries, fetchGeoStates,
} from "../utils/sellerListingApi.js";
import useSellerProfileStatus from "../hooks/useSellerProfileStatus.js";
import { WEEKDAYS, guessBusinessType } from "../components/seller/fieldConfigs.js";
import { TRANSPORT_OPTIONS } from "../../shared/transportOptions.js";
import { VALIDITY_OPTIONS, resolveValidityHours } from "../shared/listingValidity.js";
import { normalizeServiceKeys } from "../shared/marketingServices.js";
import { extractColorsFromImage } from "../utils/colorExtract.js";
import MarketingServicePicker from "../components/seller/listingForm/MarketingServicePicker.jsx";
import GrowAuthFlow, { toTop } from "../components/grow/GrowAuthFlow.jsx";
import GrowBrandField from "../components/grow/GrowBrandField.jsx";
import GrowDeliveryPicker, { blankDelivery, validateDelivery, buildDispatching, summarizeDelivery } from "../components/grow/GrowDeliveryPicker.jsx";
import GrowCheckSkeleton from "../components/grow/GrowCheckSkeleton.jsx";
import { safeFrom, isEnquiryPath } from "../components/grow/growReturn.js";
import { useDrop, useDropGuard } from "../components/grow/growUi.js";
import { peekAccess, loadAccess, setAccess } from "../components/grow/growAccess.js";
import "../components/grow/grow-start.css";
import "../components/grow/grow-extras.css"; // keep AFTER grow-start.css
import "../components/grow/grow-access.css"; // after grow-extras.css
import "../components/grow/grow-transitions.css"; // after grow-access.css
import "../components/grow/grow-sell-item.css"; // after grow-access.css

const UNITS = ["Pieces", "Kg", "Grams", "Litres", "Millilitres", "Dozen", "Tons"]; // same list as SellerListingForm
const GST = [0, 0.25, 3, 5, 12, 18, 28];
const num = (s) => String(s).replace(/[^\d.]/g, "");
const CERT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.txt,image/*";
const certOk = (f) => /\.(pdf|docx?|xlsx?|txt)$/i.test(f.name || "") || !!f.type?.startsWith("image/");
const isImg = (f) => !!f.type?.startsWith("image/");
const ICON = {
    gst: { d: "M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9 12l2 2 4-4", s: { background: "#E6F0FB", color: "#0F63B5" } },
    contact: { d: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c0-4 4-6 8-6s8 2 8 6", s: { background: "#FDE9E2", color: "#C23A0B" } },
    ops: { d: "M3 6h11v10H3zM14 10h4l3 3v3h-7M7 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4M17 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4", s: { background: "#E3F5EC", color: "#12794A" } },
    bank: { d: "M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18", s: { background: "#FFF4C2", color: "#8A6500" } },
};

/* ---------- small field helpers ---------- */
const F = ({ l, c, children }) => <div className="f"><label>{l}</label>{children}{c && <p className="cap">{c}</p>}</div>;
const In = ({ v, on, ...r }) => <div className="inp"><input value={v ?? ""} onChange={(e) => on(e.target.value)} {...r} /></div>;
const Chips = ({ v, on, o }) => (
    <div className="chips">{o.map(([k, t]) => (
        <button key={String(k)} type="button" className="chip" aria-pressed={String(v) === String(k)} onClick={() => on(k)}>{t}</button>
    ))}</div>
);
const YN = ({ v, on }) => <Chips v={v} on={(k) => on(k === "y")} o={[["y", "Yes"], ["n", "No"]]} />;
// Chips compare String(v) to the key. true/false map to y/n, and null/undefined stay EMPTY (nothing preselected).
const yn = (b) => (b === true ? "y" : b === false ? "n" : "");
const sameUnitText = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/* ================================ PAGE ================================ */
export default function GrowStartPage() {
    const { token, isLoggedIn, profile, needsOnboarding, initializing, refreshProfile } = useAuth();
    const nav = useNavigate();
    const [sp] = useSearchParams();

    const location = useLocation();
    // Page the seller came from (e.g. "/grow/products" or "/grow/enquiry/12"). Captured once, because the ?start=1
    // redirect below drops it.
    const [returnTo] = useState(() => safeFrom(location.state?.from));
    // "Sell this" from an enquiry: the enquiry itself, and what the buyer posted (product name, brand, unit, image).
    const [enquiry] = useState(() => location.state?.enquiry || null);
    const [sellPrefill] = useState(() => {
        const p = location.state?.sellPrefill;
        return p && (p.productName || p.brandName || p.unit || p.image) ? p : null;
    });
    // Came from an enquiry page: after login / onboarding go straight back there instead of the add-product wizard.
    // Not when the seller pressed "Sell this": then they must land in the wizard.
    const resumeBack = isEnquiryPath(returnTo) && !sellPrefill;

    // land | auth | check | onb | prod | pdone
    // Coming from "Add your products" (?start=1): never flash the landing screen. If the access check was
    // already warmed up by the details page, open the wizard on the very first render.
    const [view, setView] = useState(() => {
        if (sp.get("start") !== "1") return "land";
        if (!resumeBack && !initializing && isLoggedIn && !needsOnboarding && peekAccess(token)?.canPublish) return "prod";
        return "check";
    });
    const [toast, setToast] = useState("");
    const [last, setLast] = useState(null);
    const [lastRes, setLastRes] = useState(null);
    const auto = useRef(false), pend = useRef(false), startRef = useRef(null), tt = useRef(null);
    useDropGuard(); // a file dropped just outside a drop zone must not navigate the tab away

    const say = (m) => { setToast(m); clearTimeout(tt.current); tt.current = setTimeout(() => setToast(""), 2800); };
    useEffect(() => { toTop(); }, [view]);

    // Prefetch access status so "Start selling" resolves instantly.
    useEffect(() => { if (token && !needsOnboarding) loadAccess(token); }, [token, needsOnboarding]);

    // Send the seller back to the enquiry page they came from. Keep the loading screen up meanwhile, so the
    // hand-over is one smooth fade instead of a flash of the landing / wizard screen.
    const goBack = () => {
        setView("check");
        nav(returnTo, { replace: true });
    };
    const finishFlow = () => (resumeBack ? goBack() : setView("prod"));

    // After "Sell this": back to the enquiry with the quote popup re-opened on the new listing.
    const toQuote = (res) => nav(returnTo, {
        replace: true,
        state: { resumeQuote: { enquiry, submissionId: res?.submission?.id || null } },
    });
    const backToQuote = () => toQuote(lastRes);

    // The listing was just created. From an enquiry and live (approved): go straight back to the enquiry, with the
    // loading screen up meanwhile. Otherwise show the "listing submitted" screen.
    const onListed = (card, res) => {
        setLast(card);
        setLastRes(res || null);
        if (enquiry && returnTo && res?.submission?.review_status === "approved" && res?.submission?.id) {
            setView("check");
            toQuote(res);
            return;
        }
        setView("pdone");
    };

    const route = (a) => {
        if (a?.canPublish) return finishFlow();
        if (a?.reason === "SELLER_NOT_ONBOARDED") return setView("onb");
        if (a?.reason === "SELLER_NOT_APPROVED") {

            if (a.sellerStatus === "pending_review") { setView("land"); return say("Your shop is still under review. We will notify you once it is approved."); }
            if (a.sellerStatus === "rejected") { setView("land"); return say("Your shop application was not approved. Please contact support."); }
            return setView("onb"); // draft / not submitted: let them finish and submit properly
        }
        setView("auth");
    };
    const proceed = async (tk) => {
        const hit = peekAccess(tk);
        if (hit) return route(hit); // already known: no waiting screen at all
        setView("check");
        route(await loadAccess(tk)); // joins the in-flight prefetch if there is one
    };
    const start = () => {
        if (initializing) { pend.current = true; setView("check"); return; } // wait for the profile to load
        if (!isLoggedIn || needsOnboarding) return setView("auth");     // sign in / finish sign-up right here
        proceed(token);
    };
    startRef.current = start;
    useEffect(() => { if (!initializing && pend.current) { pend.current = false; startRef.current(); } }, [initializing]);
    useEffect(() => { // /grow?start=1 (from the details page) goes straight into the flow
        if (sp.get("start") !== "1" || auto.current) return;
        auto.current = true; nav("/grow", { replace: true }); startRef.current();
    }, [sp]); // eslint-disable-line

    // Cancel on the first Add Product step: go back where the seller came from, otherwise show the landing screen.
    const exitWizard = () => {
        if (!returnTo) return nav("/grow/details");   // was: setView("land")
        if (window.history.state?.idx > 0) nav(-1);
        else nav(returnTo, { replace: true });
    };

    const live = lastRes?.submission?.review_status === "approved";
    const hasBar = view === "onb" || view === "prod";
    return (
        <div className="gs">
            <div className={`app${view === "land" ? " wide" : ""}${hasBar ? " hb" : ""}`}>
                {view === "land" && (
                    <Landing onStart={start}
                        backLabel={resumeBack ? (returnTo.startsWith("/grow/enquiry/") ? "Back to the enquiry" : "Back to enquiries") : ""}
                        onBack={resumeBack ? () => nav(returnTo, { replace: true }) : null} />
                )}
                {view === "auth" && <GrowAuthFlow onAuthed={proceed} say={say} />}
                {view === "check" && <GrowCheckSkeleton />}
                {view === "onb" && (
                    <Onboarding token={token} profile={profile} refreshProfile={refreshProfile} say={say}
                        onDone={() => { setAccess(token, { canPublish: true, success: true }); finishFlow(); }} />
                )}
                {view === "prod" && (
                    <Wizard token={token} say={say} onExit={exitWizard} prefill={sellPrefill} enquiryId={sellPrefill ? (enquiry?.id || null) : null}
                        enquiryBuyer={sellPrefill?.buyerId ? { buyerId: sellPrefill.buyerId, name: sellPrefill.buyerName || "" } : null}
                        onNeedOnboarding={() => setView("onb")} onNeedLogin={() => setView("auth")}
                        onSubmitted={onListed} />
                )}
                {view === "pdone" && (
                    <section className="scr ctr">
                        <div className="big" aria-hidden="true">✓</div>
                        <h2>{enquiry && live ? "Your listing is live" : "Your listing is submitted"}</h2>
                        <p className="sub">
                            {enquiry && live
                                ? "Now send your quote to the buyer with this product."
                                : "We will review it and let you know once it is live for buyers."}
                        </p>
                        {last && <div className="pv" style={{ textAlign: "left", marginBottom: 22 }}>
                            <div className="th" style={last.img ? { backgroundImage: `url(${last.img})` } : undefined}>{last.img ? "" : "✓"}</div>
                            <div><b>{last.name}</b><small>{last.meta}</small></div></div>}
                        {enquiry && (
                            <button className="sbtn" type="button" onClick={backToQuote} disabled={!live}>Continue to your quote</button>
                        )}
                        {enquiry && !live && <p className="cap">You can send your quote once this listing is approved.</p>}
                        {!enquiry && <button className="sbtn" type="button" onClick={() => setView("prod")}>Add another product</button>}
                        <Link className="sbtn gh" to="/grow/products">Go to my products</Link>
                        {enquiry
                            ? !live && <button className="sbtn gh" type="button" onClick={() => nav(returnTo, { replace: true })}>Back to the enquiry</button>
                            : <Link className="sbtn gh" to="/grow/details">Back to the seller page</Link>}
                    </section>
                )}
            </div>
            <div className={`toast${toast ? " on" : ""}`} role="status">{toast}</div>
        </div>
    );
}

function Landing({ onStart, onBack, backLabel }) {
    const V = [
        ["#F4511E", "More buyers", "Reach relevant B2B buyers beyond your network.", "M9 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM2.5 20c0-3.6 3-5.5 6.5-5.5s6.5 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.5 2.2 3.5 5.2"],
        ["#1E78D6", "More inquiries", "Get requirements for products you actually sell.", "M4 5h16v11H9l-5 4z"],
        ["#22A06B", "More sales", "Confirm, dispatch and deliver in one place.", "M3 17l6-6 4 4 8-8M15 7h6v6"],
    ];
    return (
        <section className="scr land">
            <div className="l-head">
                <p className="kick">Seller onboarding</p>
                <h1>Sell B2B with <em>confidence</em>.</h1>
                <p className="ld">Reach beyond your network and turn opportunities into orders. Verify your business in three quick steps and you are ready to list.</p>
            </div>
            <div className="l-cards">
                {V.map(([bg, t, s, d]) => (
                    <div className="val" key={t}><span className="d" style={{ background: bg }}><svg viewBox="0 0 24 24"><path d={d} /></svg></span><div><b>{t}</b><span>{s}</span></div></div>
                ))}
                <div className="need">You will need: <span>Mobile number</span><span>Email</span><span>GST number</span></div>
                <p className="feen">Transaction fees start as low as <b>0.25%</b>.</p>
            </div>
            <div className="l-cta">
                <button className="sbtn" type="button" onClick={onStart}>Start selling</button>
                {onBack && <button className="sbtn gh" type="button" onClick={onBack}>{backLabel}</button>}
                <Link className="sbtn gh" to="/grow/details">See the full seller page</Link>
            </div>
        </section>
    );
}

/* ============================ ONBOARDING ============================ */
function Card({ id, open, setOpen, done, title, sub, children }) {
    const ic = ICON[id], isOpen = open === id;
    return (
        <div id={`ob-${id}`} className={`cd${isOpen ? " open" : ""}${done ? " done" : ""}`}>
            <button className="ch" type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? "" : id)}>
                <span className="ico" style={ic.s}><svg viewBox="0 0 24 24"><path d={ic.d} /></svg></span>
                <span><b>{title}</b><small>{sub}</small></span><span className="cv" />
            </button>
            {isOpen && <div className="bd">{children}</div>}
        </div>
    );
}

function Onboarding({ token, profile, refreshProfile, onDone, say }) {
    const { business: gst, seller, loading } = useSellerProfileStatus(token);
    const [f, setF] = useState({
        contact_person: "", logo_url: "", working_days: [...WEEKDAYS], transport_options: [],
        order_acceptance_start: "09:00", order_acceptance_end: "18:00",
        dispatch_pincode: "", dispatch_district: "", dispatch_state: "", bank_account_number: "", bank_ifsc_code: "",
    });
    const [open, setOpenRaw] = useState("gst");
    const setOpen = (id) => { // open a card and bring it to the top of the screen
        setOpenRaw(id);
        if (id) setTimeout(() => document.getElementById(`ob-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 90);
    };
    const [busy, setBusy] = useState(false);
    const [logoBusy, setLogoBusy] = useState(false);
    const [pinMsg, setPinMsg] = useState("");
    const hydrated = useRef(false);
    const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
    const toggle = (k, v) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((i) => i !== v) : [...x[k], v] }));

    useEffect(() => { // hydrate once from existing seller draft / GST profile (same sources as SellerOnboardingForm)
        if (loading || hydrated.current) return; hydrated.current = true;
        const sep = gst?.dispatch_same_as_registered === false && !!gst?.dispatch_pincode;
        const pin = seller?.dispatch_pincode || (sep ? gst.dispatch_pincode : gst?.pincode) || "";
        setF((x) => ({
            ...x,
            contact_person: profile?.name || seller?.contact_person || "",
            logo_url: seller?.logo_url || "",
            working_days: seller?.working_days?.length ? seller.working_days : x.working_days,
            transport_options: seller?.transport_options || [],
            order_acceptance_start: (seller?.order_acceptance_start || x.order_acceptance_start).slice(0, 5),
            order_acceptance_end: (seller?.order_acceptance_end || x.order_acceptance_end).slice(0, 5),
            dispatch_pincode: String(pin),
            dispatch_district: seller?.dispatch_district || (sep ? "" : gst?.district || ""),
            dispatch_state: seller?.dispatch_state || (sep ? gst?.dispatch_state || gst?.state || "" : gst?.state || ""),
            bank_account_number: seller?.bank_account_number || "", bank_ifsc_code: seller?.bank_ifsc_code || "",
        }));
    }, [loading]); // eslint-disable-line

    useEffect(() => { // resolve district/state from pincode
        const p = f.dispatch_pincode;
        if (!/^\d{6}$/.test(p)) { setPinMsg(""); return; }
        if (f.dispatch_district && f.dispatch_state) { setPinMsg(`Currently: ${f.dispatch_district}, ${f.dispatch_state}`); return; }
        let live = true;
        lookupPincode(p).then((r) => {
            if (!live) return;
            if (r?.success) { setF((x) => ({ ...x, dispatch_district: r.district, dispatch_state: r.state })); }
            else setPinMsg("Could not verify this pincode, you can still continue.");
        });
        return () => { live = false; };
    }, [f.dispatch_pincode, f.dispatch_district, f.dispatch_state]);

    const pickLogo = async (file) => {
        if (!file) return;
        if (!isImg(file)) return say("Please choose an image file.");
        setLogoBusy(true);
        try {
            const r = await uploadSellerFile(token, file, "logo");
            if (r?.success) {
                set("logo_url", r.url);
                try { const c = await extractColorsFromImage(r.url); setF((x) => ({ ...x, primary_color: c.primary, secondary_color: c.secondary, accent_color: c.accent })); } catch { /* keep defaults */ }
            } else say("Logo upload failed. Try again.");
        } finally { setLogoBusy(false); }
    };
    // drag & drop for the logo (hook stays above the loading early-return below)
    const logoDrop = useDrop((files) => pickLogo(files.find(isImg) || files[0]), { disabled: logoBusy });

    const ok = {
        gst: !!gst,
        // contact: f.contact_person.trim().length >= 2 && !!f.logo_url,
        contact: f.contact_person.trim().length >= 2,
        ops: f.working_days.length > 0 && f.transport_options.length > 0 && !!f.order_acceptance_start && !!f.order_acceptance_end && /^\d{6}$/.test(f.dispatch_pincode),
        bank: /^\d{9,18}$/.test(f.bank_account_number) && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.bank_ifsc_code),
    };
    const n = Object.values(ok).filter(Boolean).length;

    const finish = async () => {
        setBusy(true);
        try {
            const form = {
                country: "India", primary_color: "#047084", secondary_color: "#d2462b",
                whatsapp_number: profile?.phone || "", whatsapp_verified: !!profile?.phone_verified,
                original_verified_number: profile?.phone_verified ? profile.phone : null,
                address: gst?.registered_address || "", pincode: gst?.pincode || "", city: gst?.district || "", state: gst?.state || "", pan: gst?.pan || "",
                display_name: gst?.trade_name || gst?.legal_name || "", business_type: guessBusinessType(gst?.nature_of_business),
                ...(seller || {}), ...f,
                logo_url: f.logo_url || null,
            };
            const s1 = await saveSellerProgress(token, { ...form, onboarding_step: "review" });
            const merged = { ...form, ...(s1?.success ? s1.seller : {}), ...f, logo_url: f.logo_url || null };
            const b = await saveSellerBankDetails(token, { account_number: f.bank_account_number, ifsc_code: f.bank_ifsc_code });
            if (!b?.success) return say(b?.message || "Could not save bank details.");
            const r = await submitSellerOnboarding(token, merged);
            if (!r?.success) return say(r?.message || "Could not submit. Please check the required fields.");
            await refreshProfile?.();
            onDone(r.seller);
        } finally { setBusy(false); }
    };

    if (loading) return <GrowCheckSkeleton />;
    const G = gst || {};
    const rows = [["Legal name", G.legal_name], ["Trade name", G.trade_name], ["GSTIN", G.gstin], ["Status", G.gstin_status], ["PAN", G.pan], ["State", G.state], ["District", G.district], ["Pincode", G.pincode], ["Registered address", G.registered_address]];

    return (
        <>
            <section className="scr on">
                <p className="kick">Seller profile</p>
                <h2>Set up your seller profile</h2>
                <p className="sub">Four short sections. Your GST details are already filled in.</p>

                <Card id="gst" open={open} setOpen={setOpen} done={ok.gst} title="GST registration" sub="Taken from your GST record">
                    <span className="tg">READ ONLY</span>
                    {rows.filter((r) => r[1]).map(([k, v]) => <div className="row" key={k}><small>{k}</small><b>{v}</b></div>)}
                    <button className="sbtn" type="button" style={{ marginTop: 16 }} onClick={() => setOpen("contact")}>Looks right, continue</button>
                </Card>

                <Card id="contact" open={open} setOpen={setOpen} done={ok.contact} title="Contact" sub="Who buyers and our team reach out to">
                    <F l="Contact person"><In v={f.contact_person} on={(v) => set("contact_person", v)} placeholder="Full name" autoComplete="name" /></F>
                    <F l="Contact number"><div className="inp ro"><input readOnly value={profile?.phone ? `+91 ${profile.phone}` : ""} /></div></F>
                    <F l="Email"><div className="inp ro"><input readOnly value={profile?.email || ""} /></div></F>
                    <F l="Company logo (optional)" c="No logo yet? You can skip this and add it later. If you add one, your shop colours are picked from it. You can also drag and drop an image here.">
                        <div className={`ph gx-dz${logoDrop.active ? " on" : ""}`} {...logoDrop.bind}>
                            {f.logo_url && (
                                <div className="th" style={{ backgroundImage: `url(${f.logo_url})` }}>
                                    <button type="button" className="x" aria-label="Remove logo" onClick={() => set("logo_url", "")}>×</button>
                                </div>
                            )}
                            <label className="add" style={{ width: 76, height: 76, borderRadius: 16 }}>
                                {logoBusy ? "…" : f.logo_url ? "Replace" : "+ Add"}
                                <input type="file" accept="image/*" hidden disabled={logoBusy} onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ""; }} />
                            </label>
                        </div>
                    </F>
                    <button className="sbtn sm" type="button" disabled={!ok.contact} onClick={() => setOpen("ops")}>Save and continue</button>
                </Card>

                <Card id="ops" open={open} setOpen={setOpen} done={ok.ops} title="Operations" sub="Working days, transport and dispatch">
                    <div className="lb" style={{ marginTop: 18 }}>Working days</div>
                    <div className="chips">{WEEKDAYS.map((d) => <button key={d} type="button" className="chip" aria-pressed={f.working_days.includes(d)} onClick={() => toggle("working_days", d)}>{d.slice(0, 3)}</button>)}</div>
                    <div className="lb">Transport channels you can service</div>
                    <div className="chips">{TRANSPORT_OPTIONS.map((t) => <button key={t.key} type="button" className="chip" aria-pressed={f.transport_options.includes(t.key)} onClick={() => toggle("transport_options", t.key)}>{t.label}</button>)}</div>
                    <div className="two">
                        <F l="Orders from"><In type="time" v={f.order_acceptance_start} on={(v) => set("order_acceptance_start", v)} /></F>
                        <F l="Orders until"><In type="time" v={f.order_acceptance_end} on={(v) => set("order_acceptance_end", v)} /></F>
                    </div>
                    <F l="Dispatch pincode" c={pinMsg}>
                        <In v={f.dispatch_pincode} inputMode="numeric" maxLength={6}
                            on={(v) => setF((x) => ({ ...x, dispatch_pincode: v.replace(/\D/g, "").slice(0, 6), dispatch_district: "", dispatch_state: "" }))} />
                    </F>
                    <button className="sbtn sm" type="button" disabled={!ok.ops} onClick={() => setOpen("bank")}>Save and continue</button>
                </Card>

                <Card id="bank" open={open} setOpen={setOpen} done={ok.bank} title="Bank details" sub="Where your order payouts are sent">
                    <F l="Account number"><In v={f.bank_account_number} inputMode="numeric" maxLength={18} placeholder="9 to 18 digits" autoComplete="off" on={(v) => set("bank_account_number", v.replace(/\D/g, ""))} /></F>
                    <F l="IFSC code"><In v={f.bank_ifsc_code} maxLength={11} placeholder="e.g. ABCD0123456" autoComplete="off" on={(v) => set("bank_ifsc_code", v.toUpperCase().replace(/[^0-9A-Z]/g, ""))} /></F>
                    <p className="cap">Used only to send your order payouts.</p>
                </Card>
            </section>

            <div className="bar"><div>
                <p><span>{n} of 4 complete</span><span className="prog"><i style={{ width: `${n * 25}%` }} /></span></p>
                <button className="sbtn sm" type="button" disabled={n < 4 || busy} onClick={finish}>{busy ? "Saving…" : "Finish setup"}</button>
            </div></div>
        </>
    );
}

/* ============================== WIZARD ============================== */
// Nothing here is preselected: Yes/No, price basis, fulfilment and delivery all start empty.
const blank = () => ({
    n: "", b: "", bi: null, nb: false, bnew: false, im: [], cert: [], note: "", match: null,
    u: "", ps: "", op: null, mps: "", moq: "", sm: null, sq: "",
    gst: "", price: "", basis: "", inc: null, fr: null, val: "", sl: [],
    ful: "", stock: "", lead: "", dp: "", dd: "", ds: "", dl: blankDelivery(),
    ret: "", war: "", ms: normalizeServiceKeys([]),
    ba: { mode: "public", buyers: [] },
});
// when a catalogue match is lost, the fields it had locked go back to empty
const unlock = (x) => (x.match ? { ...x, match: null, u: "", ps: "", op: null, mps: "", gst: "" } : x);

// NEW (enquiry prefill): product name, brand, unit and image come from the enquiry the seller is answering.
// All four stay fixed; pack size, price, stock etc. are the seller's to fill in.
const prefillBlank = (R) => ({
    ...blank(),
    n: R.productName || "", b: R.brandName || "", nb: !R.brandName,
    u: R.unit || "",
    im: R.image ? [R.image] : [],
});

// NEW (locked mode): starting values for a catalogue item whose identity is fixed (SellThisItemModal).
// Packaging is fixed too when the catalogue item has it on file; older items without it stay editable.
const lockedBlank = (L) => {
    const hasPack = !!L.unit && Number(L.packSize) > 0;
    const outer = hasPack && Number(L.masterPackSize) > 1;
    return {
        ...blank(),
        n: L.productName || "", b: L.brandName || "", nb: !L.brandName,
        im: L.image ? [L.image] : [],
        u: hasPack ? L.unit : "", ps: hasPack ? String(L.packSize) : "",
        op: hasPack ? outer : null, mps: outer ? String(L.masterPackSize) : "",
        gst: L.gstPercent ?? "",
        match: hasPack ? { id: L.id, unit: L.unit, packSize: L.packSize, masterPackSize: outer ? L.masterPackSize : 1, gstPercent: L.gstPercent ?? null } : null,
    };
};

function CertRow({ c, busy, onRename, onReplace, onRemove }) {
    const [edit, setEdit] = useState(false);
    const [draft, setDraft] = useState(c.name || "");
    const ext = (String(c.url || "").split("?")[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] || "file").slice(0, 4);
    const start = () => { setDraft(c.name || ""); setEdit(true); };
    const cancel = () => { setDraft(c.name || ""); setEdit(false); };
    const save = () => { const v = draft.trim(); if (v) onRename(v); else setDraft(c.name || ""); setEdit(false); };
    return (
        <div className="gx-cert">
            <span className="gx-ext" aria-hidden="true">{ext}</span>
            {edit
                ? <div className="inp"><input autoFocus value={draft} maxLength={80} aria-label="Certificate name" onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } else if (e.key === "Escape") cancel(); }} /></div>
                : <a className="gx-cn" href={c.url} target="_blank" rel="noreferrer" title="Open file">{c.name || "Certificate"}</a>}
            <div className="gx-acts">
                {edit ? (<>
                    <button type="button" className="gx-act" onClick={save}>Save</button>
                    <button type="button" className="gx-act" onClick={cancel}>Cancel</button>
                </>) : (<>
                    <button type="button" className="gx-act" onClick={start}>Rename</button>
                    <label className={`gx-act${busy ? " off" : ""}`}>Replace
                        <input type="file" accept={CERT_ACCEPT} hidden disabled={busy} onChange={(e) => { onReplace(e.target.files?.[0]); e.target.value = ""; }} />
                    </label>
                    <button type="button" className="gx-act del" onClick={onRemove}>Remove</button>
                </>)}
            </div>
        </div>
    );
}

// Props for reuse (SellThisItemModal):
//   locked    - { id, productName, brandName, image, unit, packSize, masterPackSize, gstPercent }
//               brand / name / image are fixed; packaging + GST are fixed when the catalogue item has them.
//   prefill   - { productName, brandName, unit, image } from an enquiry ("Sell this"): name, brand, unit and image are
//               shown as locked fields, exactly what the buyer posted. A catalogue match is only used when it has the
//               same unit. If the enquiry has no image, the normal photo upload is shown instead.
//   enquiryId - id of that enquiry. It is sent as rfqEnquiryId so the backend approves the listing directly.
//   submitFn  - async (payload) => response. Replaces the default create call (e.g. createSellerListingForBrand).
//   onStep    - called with the step index whenever it changes (lets a host scroll its own container to the top).
// onSubmitted(card, res) receives the raw API response as a 2nd argument.
export function Wizard({ token, say, onExit, onNeedOnboarding, onNeedLogin, onSubmitted, locked = null, prefill = null, enquiryId = null, enquiryBuyer = null, submitFn = null, onStep, quiet = false }) {
    const { seller } = useSellerProfileStatus(token);
    const [P, setP] = useState(() => (locked ? lockedBlank(locked) : prefill ? prefillBlank(prefill) : blank()));
    const [ps, setPs] = useState(0);
    const [busy, setBusy] = useState(false);
    const [up, setUp] = useState(false);
    const [pol, setPol] = useState({ ret: [], war: [] });
    const [states, setStates] = useState([]); // [{ id, name }]
    const [stStatus, setStStatus] = useState("idle"); // idle | loading | ready | error
    const [dpMsg, setDpMsg] = useState("");
    const india = useRef(null);
    const dpInit = useRef(false);
    useEffect(() => { toTop(); onStep?.(ps); }, [ps]); // eslint-disable-line
    const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
    const fixedEnq = !locked && !!prefill; // name / brand / unit fixed to the enquiry
    const fixedImg = fixedEnq && !!prefill.image; // the enquiry's image is locked too

    // like `unlock`, but with an enquiry the unit stays what the buyer asked in
    const unlockP = (x) => (x.match ? { ...x, match: null, u: fixedEnq ? (prefill.unit || "") : "", ps: "", op: null, mps: "", gst: "" } : x);

    // Policy options + the seller's last-used defaults (same sources as SellerListingForm)
    useEffect(() => {
        fetchListingPolicyOptions("return_policy").then((r) => r?.success && setPol((x) => ({ ...x, ret: r.items })));
        fetchListingPolicyOptions("warranty").then((r) => r?.success && setPol((x) => ({ ...x, war: r.items })));
        fetchDefaultListingTemplates(token).then((r) => {
            if (!r?.success) return;
            const d = r.defaults || {}, t = d.tax_legal?.data || {}, c = d.commercial_terms?.data || {};
            setP((x) => ({
                ...x, ret: t.returnPolicyKey ?? x.ret, war: t.warrantyKey ?? x.war,
                ms: Array.isArray(c.marketingServices) ? normalizeServiceKeys(c.marketingServices) : x.ms,
            }));
        });
    }, [token]);

    // Dispatch location starts from the seller profile, and stays editable on the delivery step.
    useEffect(() => {
        if (!seller || dpInit.current) return;
        dpInit.current = true;
        setP((x) => (x.dp ? x : { ...x, dp: String(seller.dispatch_pincode || ""), dd: seller.dispatch_district || "", ds: seller.dispatch_state || "" }));
    }, [seller]);

    useEffect(() => { // resolve district/state for the dispatch pincode
        const p = P.dp;
        if (!/^\d{6}$/.test(p)) { setDpMsg(""); return; }
        if (P.dd && P.ds) { setDpMsg(`${P.dd}, ${P.ds}`); return; }
        let live = true;
        setDpMsg("Checking pincode…");
        lookupPincode(p).then((r) => {
            if (!live) return;
            if (r?.success) setP((x) => (x.dp === p ? { ...x, dd: r.district, ds: r.state } : x));
            else setDpMsg("Could not verify this pincode, you can still continue.");
        });
        return () => { live = false; };
    }, [P.dp, P.dd, P.ds]);

    // Existing catalogue product? Lock unit / pack / GST like the real form.
    // (Skipped in locked mode: the catalogue item is already known.)
    // With an enquiry prefill a match is only used when its unit equals the enquiry's unit.
    useEffect(() => {
        if (locked) return undefined;
        const productName = P.n.trim(), brandName = P.b.trim();
        if (productName.length < 2 || (!P.nb && !brandName)) { setP(unlockP); return; }
        const t = setTimeout(async () => {
            const r = await findBrandItemMatch(token, { productName, brandName, brandNotApplicable: P.nb });
            if (!r?.success) return;
            setP((x) => {
                if (x.n.trim() !== productName || x.b.trim() !== brandName || x.nb !== P.nb) return x;
                if (!r.match) return unlockP(x);
                const m = r.match, outer = Number(m.masterPackSize) > 1;
                if (fixedEnq && prefill.unit && !sameUnitText(m.unit, prefill.unit)) return unlockP(x); // different unit: don't use it
                return { ...x, match: m, u: m.unit, ps: String(m.packSize), op: outer, mps: outer ? String(m.masterPackSize) : "", gst: m.gstPercent ?? x.gst };
            });
        }, 400);
        return () => clearTimeout(t);
    }, [P.n, P.b, P.nb, token]); // eslint-disable-line

    const loadIndia = async () => {
        if (india.current) return india.current;
        const r = await fetchGeoCountries();
        india.current = r?.items?.find((c) => c.name?.toLowerCase() === "india") || null;
        return india.current;
    };
    const loadStates = async () => {
        setStStatus("loading");
        try {
            const c = await loadIndia();
            if (!c) throw new Error("no country");
            const r = await fetchGeoStates(c.id, "");
            if (!r?.success) throw new Error("no states");
            setStates(r.items.map((s) => ({ id: s.id, name: s.name })));
            setStStatus("ready");
        } catch { setStStatus("error"); }
    };
    useEffect(() => { // the states list is only needed when the seller picks specific places
        if ((P.dl.mode === "exclude" || P.dl.mode === "include") && !states.length && stStatus !== "loading") loadStates();
    }, [P.dl.mode]); // eslint-disable-line

    /* ---------- uploads (click or drag & drop) ---------- */
    const addFiles = async (files, kind) => {
        let list = Array.from(files || []);
        if (!list.length || up) return;
        if (kind === "im") {
            const imgs = list.filter(isImg);
            if (!imgs.length) return say("Please choose image files (JPG, PNG, etc.).");
            const room = 5 - P.im.length;
            if (room <= 0) return say("You can add up to 5 images.");
            if (imgs.length > room) say(`Only ${room} more image${room === 1 ? "" : "s"} fit. Extra files were skipped.`);
            list = imgs.slice(0, room);
        } else {
            const good = list.filter(certOk);
            if (!good.length) return say("Unsupported file. Use PDF, Word, Excel, text or an image.");
            list = good;
        }
        setUp(true);
        try {
            for (const file of list) {
                const r = await uploadSellerFile(token, file, kind === "im" ? "listings" : "certificates");
                if (!r?.success) { say("Upload failed. Try again."); continue; }
                setP((x) => kind === "im"
                    ? { ...x, im: [...x.im, r.url].slice(0, 5) }
                    : { ...x, cert: [...x.cert, { name: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim(), url: r.url }] });
            }
        } finally { setUp(false); }
    };
    const replaceCert = async (i, file) => {
        if (!file || up) return;
        if (!certOk(file)) return say("Unsupported file. Use PDF, Word, Excel, text or an image.");
        setUp(true);
        try {
            const r = await uploadSellerFile(token, file, "certificates");
            if (!r?.success) return say("Upload failed. Try again.");
            setP((x) => ({ ...x, cert: x.cert.map((c, j) => (j === i ? { ...c, url: r.url } : c)) }));
        } finally { setUp(false); }
    };
    // hooks must live at the top level of the component, never inside a step renderer
    const imgDrop = useDrop((files) => addFiles(files, "im"), { disabled: up });
    const certDrop = useDrop((files) => addFiles(files, "cert"), { disabled: up });

    /* ---------- derived values ---------- */
    const outer = P.op === true && Number(P.mps) >= 2;
    const saleU = P.op ? "Master Pack" : "Pack";
    const price = Number(P.price) || 0, packSz = Number(P.ps) || 0, mpsN = Number(P.mps) || 1;
    const pk = price > 0 && packSz > 0
        ? (P.basis === "per_unit" ? price * packSz : P.basis === "per_master_pack" ? price / mpsN : P.basis === "per_pack" ? price : 0) : 0;
    const salePrice = pk ? (P.op ? pk * mpsN : pk) : 0; // price of one sale unit (Pack or Master Pack)
    const slabBad = P.sl.some((s) => (s.minQty || s.discountPercent)
        && !(Number(s.minQty) > 0 && Number(s.discountPercent) > 0 && Number(s.discountPercent) < 100));
    const delErr = validateDelivery(P.dl, states.length);
    // GST is shown as fixed only when the catalogue item actually carries a value.
    const gstLocked = !!P.match && P.gst !== "" && P.gst != null;

    const buyerProduct = useMemo(() => {
        const gstN = Number(P.gst) || 0;
        const final = salePrice > 0 ? Math.round((P.inc ? salePrice : salePrice * (1 + gstN / 100)) * 100) / 100 : 0;
        const mp = outer ? mpsN : 1, ps = packSz || 1;
        return {
            defaultPrice: final,
            defaultBreakdown: final > 0 ? derivePriceBreakdown(final, ps, mp) : { perBaseUnit: 0, perPack: 0, perMasterPack: null },
            gstPercent: gstN, packSize: ps, masterPackSize: mp, unit: P.u,
        };
    }, [salePrice, P.inc, P.gst, outer, mpsN, packSz, P.u]);

    const setOuter = (v) => setP((x) => (x.op === v ? x : {
        ...x, op: v, mps: "", moq: "", sl: [], stock: "", // these are all measured in the sale unit, which just changed
        basis: x.basis === "per_master_pack" ? "" : x.basis,
    }));
    const setSlab = (i, k, v) => setP((x) => ({ ...x, sl: x.sl.map((r, j) => (j === i ? { ...r, [k]: num(v) } : r)) }));

    // Certificates block, shared by the normal and the locked first step.
    const certField = (
        <F l="Quality & certifications (optional)">
            {P.cert.map((c, i) => (
                <CertRow key={c.url} c={c} busy={up}
                    onRename={(name) => setP((x) => ({ ...x, cert: x.cert.map((r, j) => (j === i ? { ...r, name } : r)) }))}
                    onReplace={(file) => replaceCert(i, file)}
                    onRemove={() => setP((x) => ({ ...x, cert: x.cert.filter((_, j) => j !== i) }))} />
            ))}
            <label className={`gx-drop${certDrop.active ? " on" : ""}${up ? " off" : ""}`} {...certDrop.bind}>
                {up ? "Uploading…" : <><span>Drag and drop files here or <b>browse</b></span><em>PDF, Word, Excel, text or image</em></>}
                <input type="file" accept={CERT_ACCEPT} multiple hidden disabled={up} onChange={(e) => { addFiles(e.target.files, "cert"); e.target.value = ""; }} />
            </label>
        </F>
    );

    const S = [
        locked ? {
            t: "Confirm your product", s: "This product is already approved on GROW, so its name, brand and photo are locked.",
            ok: true,
            h: () => (<>
                <div className="gx-lock">
                    <div className="gx-lth" style={P.im[0] ? { backgroundImage: `url(${P.im[0]})` } : undefined}>{P.im[0] ? "" : (P.n.trim()[0] || "?").toUpperCase()}</div>
                    <div className="gx-lin">
                        <small>Product</small>
                        <b>{P.n}</b>
                        {!P.nb && P.b && <span>{P.b}</span>}
                    </div>
                    <span className="gx-lk">Locked</span>
                </div>
                <p className="cap" style={{ marginTop: 10, marginBottom: 10 }}>Next, add your own price, stock and delivery terms.</p>
                {certField}
            </>)
        } : {
            t: "What are you selling?",
            s: fixedEnq
                ? (fixedImg ? "Product name, brand, unit and photo come from the buyer's enquiry." : "Product name, brand and unit come from the buyer's enquiry.")
                : "Start with the basics buyers see first.",
            ok: P.n.trim().length >= 2 && (P.nb || P.b.trim()) && P.im.length > 0,
            h: () => (<>
                {fixedEnq ? (<>
                    <div className="gx-lock">
                        <div className="gx-lth" style={P.im[0] ? { backgroundImage: `url(${P.im[0]})` } : undefined}>{P.im[0] ? "" : (P.n.trim()[0] || "?").toUpperCase()}</div>
                        <div className="gx-lin">
                            <small>Product</small>
                            <b>{P.n}</b>
                            <span>{P.nb ? "No brand" : P.b}</span>
                            {P.u && <span>Sold in {P.u}</span>}
                        </div>
                        <span className="gx-lk">Locked</span>
                    </div>
                    <p className="cap" style={{ marginTop: 10, marginBottom: 10 }}>
                        {fixedImg ? "These come from the buyer's enquiry and can't be changed. " : "These come from the buyer's enquiry and can't be changed. The enquiry has no photo, so add your own below. "}
                        Next, add your own price, stock and delivery terms.
                    </p>
                </>) : (<>
                    <F l="Product name *"><In v={P.n} on={(v) => set("n", v)} placeholder="e.g. Premium Stainless Steel Hinges" /></F>
                    <F l="Brand *">
                        <GrowBrandField token={token} value={P.b} image={P.bi} notApplicable={P.nb} isNew={P.bnew} say={say}
                            onChange={({ b, bi, nb, isNew }) => setP((x) => ({ ...x, b, bi, nb, bnew: !!isNew }))} />
                    </F>
                </>)}
                {P.match && !quiet && <p className="cap">This product already exists on BBM Marketplace. Its packaging and GST are fixed.</p>}
                {!fixedImg && (<>
                    <div className="lb">Product images * <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, color: "var(--mute)" }}>up to 5</span></div>
                    <div className={`ph gx-dz${imgDrop.active ? " on" : ""}`} {...imgDrop.bind}>
                        {P.im.map((u, i) => <div className="th" key={u} style={{ backgroundImage: `url(${u})` }}><button type="button" className="x" aria-label="Remove image" onClick={() => setP((x) => ({ ...x, im: x.im.filter((_, j) => j !== i) }))}>×</button></div>)}
                        {P.im.length < 5 && <label className="add">{up ? "…" : "+ Add"}<input type="file" accept="image/*" multiple hidden disabled={up} onChange={(e) => { addFiles(e.target.files, "im"); e.target.value = ""; }} /></label>}
                    </div>
                    <p className="cap" style={{ marginTop: 8 }}>Tap Add or drag and drop photos here.</p>
                </>)}
                {certField}
                <F l="Note to admin (optional)"><textarea value={P.note} onChange={(e) => set("note", e.target.value)} placeholder="Anything our team should know?" /></F>
            </>)
        },

        {
            t: "How is it packed?", s: "Pack size and minimum order shape every price you set next.",
            ok: (P.match || (P.u && Number(P.ps) > 0 && P.op !== null && (!P.op || Number(P.mps) >= 2))) && Number(P.moq) > 0 && P.sm !== null && (!P.sm || Number(P.sq) > 0),
            h: () => (<>
                {P.match
                    ? <div className="brk"><div><span>Fixed by this product</span><b>1 Pack = {P.ps} {P.u}{outer ? ` · 1 Master Pack = ${P.mps} Packs` : ""}</b></div></div>
                    : (<>
                        {fixedEnq
                            ? <F l="Selling unit" c="Fixed to the unit the buyer asked in."><div className="inp ro"><input readOnly value={P.u} /></div></F>
                            : <F l="Selling unit *" c="Smallest measure this product is sold in."><Chips v={P.u} on={(v) => set("u", v)} o={UNITS.map((u) => [u, u])} /></F>}
                        <F l={P.u ? `How many ${P.u} in a Pack? *` : "Pack size *"}><In v={P.ps} on={(v) => set("ps", num(v))} inputMode="decimal" placeholder="e.g. 4" /></F>
                        <F l="Does it have an outer pack? *" c="A larger Master Pack holding several Packs."><YN v={yn(P.op)} on={setOuter} /></F>
                        {P.op === true && <F l="Packs in one outer pack *"><In v={P.mps} on={(v) => set("mps", v.replace(/\D/g, ""))} inputMode="numeric" placeholder="e.g. 4" /></F>}
                    </>)}
                <F l={`Minimum order (in ${saleU}s) *`} c={`The smallest number of ${saleU}s a buyer can order.`}><In v={P.moq} on={(v) => set("moq", num(v))} inputMode="decimal" placeholder="e.g. 5" /></F>
                <F l="Sample available? *"><YN v={yn(P.sm)} on={(v) => set("sm", v)} /></F>
                {P.sm === true && <F l={`Sample quantity (${P.u || "units"}) *`}><In v={P.sq} on={(v) => set("sq", num(v))} inputMode="decimal" /></F>}
            </>)
        },

        {
            t: "Set your price", s: "Clear, simple and valid for as long as you choose.",
            ok: P.gst !== "" && P.gst != null && !!P.basis && price > 0 && P.inc !== null && P.fr !== null && Number(P.val) > 0 && !slabBad,
            h: () => (<>
                {gstLocked ? <p className="cap">GST {P.gst}% is fixed for this product.</p>
                    : <F l="Applicable GST % *"><Chips v={P.gst} on={(v) => set("gst", Number(v))} o={GST.map((g) => [g, `${g}%`])} /></F>}
                <F l="Price is entered per *">
                    <Chips v={P.basis} on={(v) => set("basis", v)} o={[["per_unit", P.u || "Unit"], ["per_pack", "Pack"], ...(outer ? [["per_master_pack", "Master Pack"]] : [])]} />
                </F>
                <F l="Price *" c={pk ? `Works out to ₹${pk.toLocaleString("en-IN", { maximumFractionDigits: 2 })} per Pack.` : ""}>
                    <div className="inp"><span className="pre">₹</span><input type="number" min="0" inputMode="decimal" value={P.price} onChange={(e) => set("price", e.target.value)} /></div>
                </F>
                <F l="Price includes GST? *"><YN v={yn(P.inc)} on={(v) => set("inc", v)} /></F>
                <F l="Freight included? *"><YN v={yn(P.fr)} on={(v) => set("fr", v)} /></F>
                <F l="Price valid for *" c="After this the listing pauses and you can renew it in one tap.">
                    <Chips v={P.val} on={(v) => set("val", v)} o={VALIDITY_OPTIONS.map((o) => [o.hours, o.label])} />
                </F>
                <div className="f">
                    <label>Quantity discounts (optional)</label>
                    {P.sl.map((x, i) => {
                        const d = Number(x.discountPercent);
                        const sp = salePrice > 0 && d > 0 && d < 100 && Number(x.minQty) > 0 ? salePrice * (1 - d / 100) : 0;
                        return (
                            <div className="gx-slab" key={i}>
                                <div className="gx-sf"><span>Min {saleU}s</span>
                                    <div className="inp"><input inputMode="decimal" placeholder="e.g. 10" value={x.minQty} aria-label={`Slab ${i + 1} minimum ${saleU}s`} onChange={(e) => setSlab(i, "minQty", e.target.value)} /></div></div>
                                <div className="gx-sf"><span>Discount %</span>
                                    <div className="inp"><input inputMode="decimal" placeholder="e.g. 5" value={x.discountPercent} aria-label={`Slab ${i + 1} discount percent`} onChange={(e) => setSlab(i, "discountPercent", e.target.value)} /></div></div>
                                <button type="button" className="gx-x" aria-label={`Remove slab ${i + 1}`} onClick={() => setP((p) => ({ ...p, sl: p.sl.filter((_, j) => j !== i) }))}>×</button>
                                {sp > 0 && <p className="gx-sp">From {x.minQty} {saleU}{Number(x.minQty) === 1 ? "" : "s"}: ₹{sp.toLocaleString("en-IN", { maximumFractionDigits: 2 })} per {saleU}</p>}
                            </div>
                        );
                    })}
                    {P.sl.length < 3 && <button type="button" className="dash" onClick={() => setP((p) => ({ ...p, sl: [...p.sl, { minQty: "", discountPercent: "" }] }))}>+ Add slab</button>}
                    <p className={`cap${slabBad ? " err" : ""}`}>{slabBad ? "Fill both fields for each slab. The discount must be below 100%." : `Buyers ordering at least this many ${saleU}s get the discount.`}</p>
                </div>
            </>)
        },

        {
            t: "How will you deliver?", s: "Dispatch speed and where you can ship.",
            ok: !!P.ful && (P.ful === "ready_stock" ? P.stock !== "" : P.lead !== "") && /^\d{6}$/.test(P.dp) && !delErr,
            h: () => (<>
                <F l="How soon can you dispatch? *"><Chips v={P.ful} on={(v) => set("ful", v)} o={[["ready_stock", "Ready stock"], ["made_to_order", "Made-to-order"]]} /></F>
                {P.ful === "ready_stock" && <F l={`Available stock (in ${saleU}s) *`}><In v={P.stock} on={(v) => set("stock", num(v))} inputMode="decimal" /></F>}
                {P.ful === "made_to_order" && <F l="Lead time (days) *"><In v={P.lead} on={(v) => set("lead", v.replace(/\D/g, ""))} inputMode="numeric" /></F>}
                <F l="Dispatching from (pincode) *" c={dpMsg || "The pincode your goods leave from. You can change it for this listing."}>
                    <In v={P.dp} inputMode="numeric" maxLength={6} placeholder="6-digit pincode" autoComplete="postal-code"
                        on={(v) => setP((x) => ({ ...x, dp: v.replace(/\D/g, "").slice(0, 6), dd: "", ds: "" }))} />
                </F>
                <F l="Where do you deliver? *">
                    <GrowDeliveryPicker value={P.dl} onChange={(v) => set("dl", v)} states={states} status={stStatus} onRetry={loadStates} />
                </F>
            </>)
        },

        {
            t: "Your terms", s: "Returns and warranty, set before the sale.",
            ok: !!P.ret && !!P.war,
            h: () => (<>
                <F l="Return / replacement policy *"><Chips v={P.ret} on={(v) => set("ret", v)} o={pol.ret.map((o) => [o.key, o.label])} /></F>
                <F l="Warranty *"><Chips v={P.war} on={(v) => set("war", v)} o={pol.war.map((o) => [o.key, o.label])} /></F>
            </>)
        },

        {
            t: "Reach and promotion", s: "Choose how much to promote. Charged only when an order is generated.",
            ok: Array.isArray(P.ms),
            h: () => <MarketingServicePicker value={P.ms} onChange={(v) => set("ms", v)} legacyPercent={null} exampleOrderValue={pk * (Number(P.moq) || 1)} error={false} />
        },

        {
            t: "Who can buy, and at what price?", s: "Optional. Control who sees this listing and give chosen buyers their own price.",
            ok: P.ba.mode === "public" || P.ba.buyers.length > 0,
            h: () => <GrowBuyerAccessDraft token={token} product={buyerProduct} value={P.ba} onChange={(v) => set("ba", v)}
                quickBuyer={fixedEnq ? enquiryBuyer : null} />
        },

        {
            t: "Review and submit", s: "One last look. You can edit any section.", ok: true,
            h: () => {
                const R = (i, l, v) => <div className="rv" key={i}><div><small>{l}</small><b>{v}</b></div><button type="button" className="lnk" onClick={() => setPs(i)}>Edit</button></div>;
                const vh = VALIDITY_OPTIONS.find((o) => o.hours === Number(P.val));
                return (<>
                    {R(0, "Product", `${P.n} · ${P.nb ? "No brand" : P.b} · ${P.im.length} photo${P.im.length === 1 ? "" : "s"}${P.cert.length ? ` · ${P.cert.length} certificate${P.cert.length === 1 ? "" : "s"}` : ""}`)}
                    {R(1, "Packaging", `1 Pack = ${P.ps} ${P.u}${outer ? ` · ${P.mps} Packs per outer pack` : ""} · MOQ ${P.moq} ${saleU}(s)${P.sm ? " · samples available" : ""}`)}
                    {R(2, "Price", `₹${P.price} per ${P.basis === "per_unit" ? P.u : P.basis === "per_pack" ? "Pack" : "Master Pack"} · GST ${P.gst}%${P.inc ? " included" : " extra"} · valid ${vh?.label || ""}${P.sl.length ? ` · ${P.sl.length} slab(s)` : ""}`)}
                    {R(3, "Delivery", `${P.ful === "ready_stock" ? "Ready stock" : "Made-to-order"} · from ${P.dp}${P.dd ? ` (${P.dd})` : ""} · ${summarizeDelivery(P.dl)}`)}
                    {R(4, "Terms", `${pol.ret.find((o) => o.key === P.ret)?.label || ""} · ${pol.war.find((o) => o.key === P.war)?.label || ""}`)}
                    {R(5, "Promotion", `${Array.isArray(P.ms) ? P.ms.length : 0} service(s) selected`)}
                    {R(6, "Buyer access", P.ba.mode === "restricted"
                        ? `Selected buyers only · ${P.ba.buyers.length} buyer(s)`
                        : `Everyone · ${P.ba.buyers.filter((b) => b.override).length} custom price(s)`)}
                </>);
            }
        },
    ];

    const submit = async () => {
        setBusy(true);
        try {
            const c = await loadIndia();
            if (!c) return say("Could not load delivery regions. Please try again.");
            const dispatchingLocations = buildDispatching(P.dl, c);
            const made = P.ful === "made_to_order";
            const payload = {
                productName: P.n.trim(), brandName: P.nb ? "" : P.b.trim(), brandImage: P.bi, brandNotApplicable: P.nb,
                images: P.im, qualityCertificates: P.cert, noteToAdmin: P.note,
                unit: P.u, packSize: String(P.ps), hasOuterPack: !!P.op,
                masterPackSize: P.op ? String(P.mps) : (P.match ? "1" : "0"),
                // locked mode always points at the catalogue item, even when its packaging wasn't on file
                brandItemMatch: P.match, genericProductBrandId: locked ? (locked.id || null) : (P.match?.id || null), hsnCode: "", gstPercent: Number(P.gst),
                basePrice: String(P.price), priceBasis: P.basis, gstInclusive: !!P.inc, freightIncluded: !!P.fr,
                validityHours: resolveValidityHours(P.val),
                marketingServices: Array.isArray(P.ms) ? normalizeServiceKeys(P.ms) : null, marketingLegacyPercent: null,
                sampleAvailable: !!P.sm, sampleQuantity: P.sm ? String(P.sq) : "", sampleUnitBasis: "per_unit",
                priceSlabs: P.sl.filter((s) => s.minQty && s.discountPercent),
                stockType: P.ful, stockQuantity: made ? "" : String(P.stock), stockQuantityBasis: P.op ? "per_master_pack" : "per_pack",
                productionLeadTimeDays: made ? String(P.lead) : "",
                moq: String(Math.max(1, Math.round(Number(P.moq) || 0))),
                dispatchDistrict: P.dd, dispatchState: P.ds, dispatchPincode: P.dp,
                dispatchingLocations, returnPolicyKey: P.ret, warrantyKey: P.war,
                buyerAccessDraft: {
                    mode: P.ba.mode,
                    buyers: (P.ba.mode === "restricted" ? P.ba.buyers : P.ba.buyers.filter((b) => b.override))
                        .map(({ pendingPricing, basedOnPrice, ...b }) => b),
                },
                // "Sell this" from an enquiry: the backend checks this enquiry is open and approves the listing directly.
                ...(fixedEnq && enquiryId ? { rfqEnquiryId: enquiryId } : {}),
            };
            const res = submitFn
                ? await submitFn(payload)
                : payload.genericProductBrandId ? await createListingForExistingBrand(token, payload) : await createSellerSubmission(token, payload);
            if (!res?.success) {
                const code = res?.code;
                if (code === "SELLER_NOT_ONBOARDED") return onNeedOnboarding();
                if (code === "NOT_AUTHENTICATED" || res?.status === 401) { say("Please sign in to submit your listing."); return onNeedLogin(); }
                if (code === "SELLER_NOT_APPROVED") return say(res.sellerStatus === "pending_review" ? "Your shop is still under review. We will notify you once it is approved." : "Your shop is not approved yet.");
                return say(res?.message || "Could not submit. Please check the required fields.");
            }
            onSubmitted({ name: P.n.trim(), img: P.im[0], meta: [P.nb ? "No brand" : P.b, pk ? `₹${pk.toLocaleString("en-IN")} / pack` : ""].filter(Boolean).join(" · ") }, res);
        } finally { setBusy(false); }
    };

    const s = S[ps], lastStep = ps === S.length - 1;
    const goto = (i) => setPs(i);
    const submitText = locked ? (busy ? "Publishing…" : "Publish listing") : (busy ? "Submitting…" : "Submit for review");
    return (
        <>
            <section className="scr on">
                <p className="kick">Add product · {ps + 1} of {S.length}</p>
                <div className="pv" aria-live="polite">
                    <div className="th" style={P.im[0] ? { backgroundImage: `url(${P.im[0]})` } : undefined}>{P.im[0] ? "" : (P.n.trim()[0] || "+").toUpperCase()}</div>
                    <div><b>{P.n.trim() || "Your product"}</b><small>{[P.nb ? "No brand" : P.b.trim(), pk ? `₹${pk.toLocaleString("en-IN")} / pack` : ""].filter(Boolean).join(" · ") || "Your listing preview builds as you go"}</small></div>
                </div>
                <div className="sg" aria-hidden="true">{S.map((_, i) => <i key={i} className={i < ps ? "on" : i === ps ? "cur" : ""} />)}</div>
                <div key={ps} className="in">
                    <h2>{s.t}</h2><p className="sub">{s.s}</p>
                    <div className="pn" style={{ marginTop: 18 }}>{s.h()}</div>
                </div>
            </section>
            <div className="bar"><div>
                <button className="sbtn gh sm" type="button" onClick={() => (ps ? goto(ps - 1) : onExit())}>{ps ? "Back" : "Cancel"}</button>
                <button className="sbtn" type="button" disabled={!s.ok || busy || up} onClick={() => (lastStep ? submit() : goto(ps + 1))}>
                    {lastStep ? submitText : "Continue"}
                </button>
            </div></div>
        </>
    );
}