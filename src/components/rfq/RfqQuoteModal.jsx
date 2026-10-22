// components/rfq/RfqQuoteModal.jsx
// Seller quote flow: search your catalog -> pick a product -> price -> send.
//  - Only products sold in the SAME unit the buyer asked in can be quoted (Kg vs Pieces cannot be compared).
//  - The buyer asks for ONE total quantity in the individual unit (e.g. 500 Kg). The price starts per INDIVIDUAL UNIT
//    (shown first), and a "Packaging breakdown" block explains the pack / master pack structure of the chosen product:
//    how many units in a pack, how many packs (and units) in a master pack, and what the buyer's quantity comes to.
//  - The seller can still switch the price to per pack / per master pack, with or without GST.
//    It starts at the buyer's custom price (if any), otherwise the regular listing price, converted to per unit.
//  - The breakdown is shown at the seller's MOQ, prices WITHOUT GST first, then GST, then the total.
//  - The final price is also stored as that buyer's custom price (same API GrowBuyerAccess uses), so the buyer's
//    product page, cart and checkout match the quote.
//  - "Sell this" opens the add-product wizard with the product name, brand and image from the ENQUIRY and the unit
//    locked to the enquiry's unit (no catalogue brand lookup).
// Delivery time is never asked or shown here: the server works it out for the buyer.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { X, Send, Check, ChevronRight, Plus, Search, ArrowLeft } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { fmtNum } from "../../utils/rfqUtils.js";
import { enquiryPath } from "../../utils/rfqShare.js";
import { inr, shortDate } from "../../utils/rfqQuoteFmt.js";
import { fetchQuoteOptions, submitQuote, withdrawQuote } from "../../utils/rfqQuoteApi.js";
import { saveCustomPricingForBuyer, deleteCustomPricingForBuyer } from "../../utils/sellerListingApi.js";
import { MIN_UNIT_PRICE } from "../../../shared/customPricing.js";
import { VALIDITY_OPTIONS, nearPrice, round2 } from "../../../shared/rfqQuoteMath.js";
import "./rfqQuoteModal.css";

const GATE_CODES = ["NOT_AUTHENTICATED", "SELLER_NOT_ONBOARDED", "SELLER_NOT_APPROVED"];
const ini = (s) => (s || "?").trim()[0]?.toUpperCase();
const saleLabel = (l) => (l.saleBasis === "per_master_pack" ? "master pack" : l.saleBasis === "per_pack" ? "pack" : l.unit);
const packLine = (l) => [
    l.brandName,
    `1 Pack = ${fmtNum(l.packSize)} ${l.unit}`,
    l.hasMaster ? `1 Master Pack = ${fmtNum(l.masterPackSize)} Packs` : null,
].filter(Boolean).join(" · ");

// How many base units (Pieces / Kg ...) one "unit", one "pack" or one "master pack" holds.
const unitsIn = (l, basis) => {
    const pack = Number(l.packSize) > 0 ? Number(l.packSize) : 1;
    if (basis === "per_pack") return pack;
    if (basis === "per_master_pack") return pack * (l.hasMaster && Number(l.masterPackSize) > 0 ? Number(l.masterPackSize) : 1);
    return 1;
};
const round4 = (n) => Math.round(n * 10000) / 10000;

// "= 25 Packs" when it divides exactly, "≈ 2.5 Packs" when it does not.
const needIn = (n, word) => {
    const r = Math.round(n * 100) / 100;
    return `${Math.abs(n - Math.round(n)) < 0.005 ? "=" : "≈"} ${fmtNum(r)} ${word}${r === 1 ? "" : "s"}`;
};

// "5%", "2.35%", "12.5%": up to 2 decimals, no trailing zeros.
const fmtPct = (p) => `${Number(Math.abs(p).toFixed(2))}%`;

// The enquiry owner (the buyer). Checks every field name this API could plausibly use.
const pickBuyerId = (e) => (e
    ? (e.buyerId ?? e.buyer_id ?? e.userId ?? e.user_id ?? e.ownerId ?? e.owner_id ?? e.createdBy ?? e.created_by
        ?? e.requesterId ?? e.postedBy ?? e.buyer?.id ?? e.buyer?.buyerId ?? e.user?.id ?? e.owner?.id ?? null)
    : null);

const pickBuyerName = (e) => (e
    ? String(e.buyerName ?? e.buyer_name ?? e.shopName ?? e.shop_name ?? e.buyer?.shopName ?? e.buyer?.name ?? e.user?.name ?? "").trim()
    : "");

// The brand typed on the enquiry (string), whatever the API calls it.
const pickBrandName = (e) => {
    if (!e) return "";
    const b = e.brandName ?? e.brand_name ?? e.brand;
    if (typeof b === "string") return b.trim();
    return String(b?.name ?? b?.brandName ?? "").trim();
};

// The product image on the enquiry (URL string), whatever the API calls it.
const pickImage = (e) => {
    if (!e) return "";
    const first = Array.isArray(e.images) ? e.images[0] : null;
    const v = e.image ?? e.imageUrl ?? e.image_url ?? e.productImage ?? e.product_image ?? first ?? null;
    if (typeof v === "string") return v.trim();
    return String(v?.url ?? v?.src ?? "").trim();
};

function Thumb({ src, name }) {
    return <span className="rqm-th">{src ? <img src={src} alt="" loading="lazy" /> : ini(name)}</span>;
}

function PickRow({ l, unit, onPick }) {
    const price = l.customPrice ?? l.listPrice;
    const unitBlocked = l.selectable && !l.unitMatches;
    const can = l.selectable && l.unitMatches;
    return (
        <button type="button" className="rqm-row" disabled={!can} onClick={() => onPick(l)}>
            <Thumb src={l.image} name={l.productName} />
            <span className="rqm-tx">
                <b>{l.productName}</b>
                <small>{packLine(l)}</small>
                {price != null && <small>{inr(price)} / {saleLabel(l)} incl. GST{l.customPrice != null ? " · custom for this buyer" : ""}</small>}
                {l.reason && <em>{l.reason}</em>}
                {unitBlocked && <em>Sold in {l.unit}, but the buyer asked in {unit}. You can only quote products sold in {unit}.</em>}
                {l.quoted && <em className="ok">Quote sent</em>}
            </span>
            {can && <ChevronRight size={18} aria-hidden="true" />}
        </button>
    );
}

export default function RfqQuoteModal({ enquiry, onClose, onDone, initialSubmissionId = null }) {
    const { token, isLoggedIn } = useAuth();
    const nav = useNavigate();
    const loc = useLocation();
    const unit = enquiry.unit || "unit";

    const [view, setView] = useState("loading"); // loading | gate | error | pick | price | done
    const [opts, setOpts] = useState(null);
    const [msg, setMsg] = useState("");
    const [sel, setSel] = useState(null);
    const [f, setF] = useState({ price: "", basis: "per_unit", gstIncl: true, valid: "7d" });
    const [search, setSearch] = useState("");
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    const [quote, setQuote] = useState(null);
    const [wasUpdate, setWasUpdate] = useState(false);
    const [reload, setReload] = useState(0);
    const bodyRef = useRef(null);

    const set = (patch) => { setF((s) => ({ ...s, ...patch })); setErr(""); };
    // The buyer's total quantity, in the individual unit.
    const totalUnits = Number(opts?.enquiry?.totalUnits ?? (Number(enquiry.quantity) * Number(enquiry.packSize))) || 0;

    // lock page scroll (native + Lenis) while open
    useEffect(() => {
        const root = document.documentElement;
        const sw = window.innerWidth - root.clientWidth;
        const { style } = document.body;
        const po = style.overflow, pp = style.paddingRight;
        style.overflow = "hidden";
        if (sw > 0) style.paddingRight = `${sw}px`;
        try { window.lenis?.stop?.(); } catch { /* ignore */ }
        return () => { style.overflow = po; style.paddingRight = pp; try { window.lenis?.start?.(); } catch { /* ignore */ } };
    }, []);

    const closeRef = useRef();
    closeRef.current = () => (view === "done" ? onDone?.(quote, { withdrawn: false }) : onClose?.());
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);

    // The price starts PER INDIVIDUAL UNIT (incl. GST): the buyer's custom price, otherwise the regular listing price.
    // Both are stored per sale unit (unit / pack / master pack), so they are divided down to one individual unit here.
    const choose = (l, mine) => {
        if (!l.unitMatches) return; // different unit from the buyer's: cannot be quoted
        const mq = mine && mine.submissionId === l.submissionId ? mine : null;
        const start = l.customPrice ?? l.listPrice;
        const perUnit = start == null ? null : start / unitsIn(l, l.saleBasis || "per_unit");
        setSel(l);
        setF({
            price: perUnit == null ? "" : String(round4(perUnit)),
            basis: "per_unit",
            gstIncl: true,
            valid: mq?.validityOption || "7d",
        });
        setErr(""); setView("price");
        requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0 }));
    };

    useEffect(() => {
        if (!isLoggedIn || !token) { setView("gate"); return undefined; }
        const ctl = new AbortController();
        setView("loading");
        fetchQuoteOptions(token, enquiry.id, ctl.signal).then((res) => {
            if (ctl.signal.aborted) return;
            if (!res.success) {
                if (res.status === 401 || GATE_CODES.includes(res.code)) { setView("gate"); return; }
                setMsg(res.message || "Couldn't load your catalog."); setView("error"); return;
            }
            setOpts(res);
            const want = initialSubmissionId || res.myQuote?.submissionId;
            const hit = want ? res.listings.find((l) => l.submissionId === want && l.selectable && l.unitMatches) : null;
            if (hit) choose(hit, res.myQuote); else setView("pick");
        }).catch(() => { });
        return () => ctl.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoggedIn, token, enquiry.id, reload]);

    // "Sell this": opens the add-product wizard (/grow) with what the buyer posted: product name, brand, unit and image.
    // The wizard shows them as locked fields. After the listing is created the seller returns here with the
    // new listing preselected (useQuoteResume).
    const enqBrand = pickBrandName(enquiry) || pickBrandName(opts?.enquiry);
    const enqImage = pickImage(enquiry) || pickImage(opts?.enquiry);
    const goSell = () => nav("/grow?start=1", {
        state: {
            from: `${loc.pathname}${loc.search}`,
            enquiry,
            sellPrefill: {
                productName: String(enquiry.productName || "").trim(),
                brandName: enqBrand,
                unit: enquiry.unit || "",
                image: enqImage,
                buyerId: pickBuyerId(enquiry) ?? pickBuyerId(opts?.enquiry) ?? null,
                buyerName: pickBuyerName(enquiry) || pickBuyerName(opts?.enquiry),
            },
        },
    });
    // "Add a new product" (free-form) keeps its own page.
    const goAdd = () => nav(`/grow/enquiry/${enquiry.id}/add-product`, { state: { from: `${loc.pathname}${loc.search}`, enquiry } });
    const goSignIn = () => nav("/grow?start=1", { state: { from: enquiryPath(enquiry.id) } });

    // ---- price maths ----
    // The seller types a price per unit / pack / master pack, with or without GST. Everything is worked out from the
    // price per base unit incl. GST. `saleIncl` is the same price per SALE unit incl. GST that listings and buyer
    // custom prices are stored in.
    const price = parseFloat(f.price) || 0;
    const gstPct = sel ? Number(sel.gstPercent) || 0 : 0;
    const calc = useMemo(() => {
        if (!sel || !(price > 0)) return null;
        const g = 1 + gstPct / 100;
        const inclEntered = f.gstIncl ? price : price * g;                  // per the basis the seller typed
        const perUnitIncl = inclEntered / unitsIn(sel, f.basis);
        const saleUnits = unitsIn(sel, sel.saleBasis || "per_unit");
        const moqBase = Number(sel.moqUnits) > 0 ? Number(sel.moqUnits) : (Number(sel.moq) > 0 ? Number(sel.moq) : 1) * saleUnits;
        const totalIncl = round2(perUnitIncl * moqBase);
        const taxable = round2(totalIncl / g);
        const unitExcl = perUnitIncl / g;
        return {
            saleIncl: round2(perUnitIncl * saleUnits),
            moqBase, totalIncl, taxable, gstAmount: round2(totalIncl - taxable),
            perUnitExcl: unitExcl,
            perPackExcl: unitExcl * unitsIn(sel, "per_pack"),
            perMasterExcl: sel.hasMaster ? unitExcl * unitsIn(sel, "per_master_pack") : null,
        };
    }, [sel, price, f.basis, f.gstIncl, gstPct]);

    // Switching "per unit / pack / master pack" or "incl. / excl. GST" keeps the same real price and re-expresses it.
    const convertTo = (nextBasis, nextIncl) => {
        if (!sel || !(price > 0)) return set({ basis: nextBasis, gstIncl: nextIncl });
        const g = 1 + gstPct / 100;
        const perUnitIncl = (f.gstIncl ? price : price * g) / unitsIn(sel, f.basis);
        const next = (perUnitIncl * unitsIn(sel, nextBasis)) / (nextIncl ? 1 : g);
        set({ basis: nextBasis, gstIncl: nextIncl, price: String(round4(next)) });
    };

    const basisOpts = !sel ? [] : [
        ["per_unit", `Per ${sel.unit}`],
        ...(Number(sel.packSize) > 1 || sel.saleBasis === "per_pack" ? [["per_pack", "Per pack"]] : []),
        ...(sel.hasMaster ? [["per_master_pack", "Per master pack"]] : []),
    ];
    const basisWord = f.basis === "per_pack" ? "pack" : f.basis === "per_master_pack" ? "master pack" : sel?.unit;

    // Packaging breakdown (information only): units in a pack, packs + units in a master pack, and the buyer's quantity.
    const packUnits = sel ? unitsIn(sel, "per_pack") : 1;
    const masterUnits = sel ? unitsIn(sel, "per_master_pack") : 1;
    const needParts = !sel ? [] : [
        ...(packUnits > 1 ? [needIn(totalUnits / packUnits, "Pack")] : []),
        ...(sel.hasMaster && masterUnits > 1 ? [needIn(totalUnits / masterUnits, "Master Pack")] : []),
    ];

    const saleIncl = calc?.saleIncl ?? 0;
    const sameAsList = !!sel && sel.listPrice != null && nearPrice(saleIncl, sel.listPrice);
    const sameAsCustom = !!sel && sel.customPrice != null && nearPrice(saleIncl, sel.customPrice);
    const wantsCustom = saleIncl > 0 && !sameAsList && !sameAsCustom;            // new price -> store as the buyer's price
    const resetCustom = saleIncl > 0 && sameAsList && sel?.customPrice != null;  // back to regular price -> remove override
    const isMine = !!sel && opts?.myQuote?.submissionId === sel.submissionId;
    const belowMoq = !!sel && sel.moqUnits > 0 && totalUnits < sel.moqUnits;     // same unit, so the numbers are comparable
    const buyerId = pickBuyerId(enquiry) ?? pickBuyerId(opts?.enquiry);

    // How far the entered price is from the regular listing price (both per sale unit, incl. GST).
    const pctVsList = sel && sel.listPrice > 0 && saleIncl > 0
        ? ((saleIncl - sel.listPrice) / sel.listPrice) * 100 : null;
    const pctVsCustom = sel && sel.customPrice > 0 && saleIncl > 0 && !sameAsCustom
        ? ((saleIncl - sel.customPrice) / sel.customPrice) * 100 : null;
    const dirTone = pctVsList == null || sameAsList ? "same" : pctVsList < 0 ? "down" : "up";

    const submit = async () => {
        if (busy || !sel) return;
        if (!sel.unitMatches) return setErr(`This product is sold in ${sel.unit}, but the buyer asked in ${unit}. You can't quote it.`);
        if (!(price > 0)) return setErr("Enter your price.");
        if ((wantsCustom || resetCustom) && !buyerId) {
            console.warn("RfqQuoteModal: no buyer id found. enquiry keys:", Object.keys(enquiry),
                "| quote-options enquiry keys:", Object.keys(opts?.enquiry || {}));
        }
        setBusy(true); setErr("");

        if (buyerId && wantsCustom) {
            const r = await saveCustomPricingForBuyer(token, buyerId, [{
                submissionId: sel.submissionId, overrideType: "fixed", value: round2(saleIncl), inputMode: "fixed_price",
            }]);
            if (r?.rejected?.length || (!r?.success && !r?.saved)) {
                setBusy(false);
                console.warn("saveCustomPricingForBuyer response:", r);
                return setErr(r?.rejected?.length
                    ? `That price would go below ₹${MIN_UNIT_PRICE} per unit, so it was not saved.`
                    : (r?.message || "Couldn't save this buyer's price. Please try again."));
            }
        } else if (buyerId && resetCustom) {
            const r = await deleteCustomPricingForBuyer(token, buyerId, sel.submissionId);
            if (!r?.success) {
                setBusy(false);
                return setErr(r?.message || "Couldn't reset this buyer's price. Please try again.");
            }
        }

        const res = await submitQuote(token, enquiry.id, {
            submissionId: sel.submissionId, price, priceBasis: f.basis, gstInclusive: f.gstIncl,
            validity: f.valid,
            // If this modal saved the price itself, the server must not save it again. If there was no buyer id,
            // ask the server to store it (it knows who owns the enquiry).
            saveCustomPrice: !buyerId && wantsCustom,
        });
        setBusy(false);
        if (!res.success) {
            if (res.status === 401 || GATE_CODES.includes(res.code)) return setView("gate");
            return setErr(res.message || "Couldn't send the quote. Please try again.");
        }
        setQuote(res.quote); setWasUpdate(!!res.updated); setView("done");
    };

    const withdraw = async () => {
        if (busy || !window.confirm("Withdraw your quote? The buyer will no longer see it.")) return;
        setBusy(true);
        const res = await withdrawQuote(token, enquiry.id);
        setBusy(false);
        if (!res.success) return setErr(res.message || "Couldn't withdraw the quote.");
        onDone?.(null, { withdrawn: true });
    };

    // ---- catalog search ----
    const q = search.trim().toLowerCase();
    const hit = (l) => !q || `${l.productName} ${l.brandName}`.toLowerCase().includes(q);
    const listings = (opts?.listings || []).filter(hit);
    const matches = listings.filter((l) => l.matches);
    const others = opts?.canAddNew ? listings.filter((l) => !l.matches) : [];
    const anySelectable = (opts?.listings || []).some((l) => l.selectable && l.unitMatches);
    const onlyUnitBlocked = !anySelectable && (opts?.listings || []).some((l) => l.selectable && !l.unitMatches);

    const title = { loading: "Send your quote", gate: "Sign in to quote", error: "Something went wrong", pick: "Choose a product", price: isMine ? "Update your quote" : "Set your price", done: wasUpdate ? "Quote updated" : "Quote sent" }[view];

    return createPortal(
        <div className="rqm" role="presentation">
            <div className="rqm-ov" onMouseDown={(e) => { if (e.target === e.currentTarget) closeRef.current(); }}>
                <div className="rqm-sheet" role="dialog" aria-modal="true" aria-label="Send your quote">
                    <div className="rqm-hd">
                        {view === "price" && (
                            <button type="button" className="rqm-ib" aria-label="Back to products" onClick={() => { setErr(""); setView("pick"); }}><ArrowLeft size={18} /></button>
                        )}
                        <div className="rqm-ht">
                            <h3>{title}</h3>
                            <p>{enquiry.productName} · {fmtNum(totalUnits)} {unit}</p>
                        </div>
                        <button type="button" className="rqm-ib" aria-label="Close" onClick={() => closeRef.current()}><X size={18} /></button>
                    </div>

                    <div className="rqm-bd" ref={bodyRef} data-lenis-prevent>
                        {view === "loading" && <div aria-busy="true"><div className="rqm-sk" /><div className="rqm-sk" /><div className="rqm-sk" /></div>}

                        {view === "gate" && (<>
                            <p className="rqm-p">Quotes are sent from your seller catalog. Sign in or finish setting up your shop and you will come straight back here.</p>
                            <button type="button" className="rqm-btn go blk" onClick={goSignIn}>Continue</button>
                        </>)}

                        {view === "error" && (<>
                            <p className="rqm-p">{msg}</p>
                            <button type="button" className="rqm-btn go blk" onClick={() => setReload((r) => r + 1)}>Try again</button>
                        </>)}

                        {view === "pick" && opts && (<>
                            <label className="rqm-search">
                                <Search size={16} aria-hidden="true" />
                                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your catalog" aria-label="Search your catalog" />
                                {search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")}><X size={14} /></button>}
                            </label>

                            {matches.length > 0 && (
                                <div className="rqm-sec"><p className="rqm-h">From your catalog</p>
                                    {matches.map((l) => <PickRow key={l.submissionId} l={l} unit={unit} onPick={(x) => choose(x, opts.myQuote)} />)}</div>
                            )}
                            {others.length > 0 && (
                                <div className="rqm-sec"><p className="rqm-h">Other products in your catalog</p>
                                    <p className="rqm-n">This buyer accepts an equivalent product.</p>
                                    {others.map((l) => <PickRow key={l.submissionId} l={l} unit={unit} onPick={(x) => choose(x, opts.myQuote)} />)}</div>
                            )}
                            {q && !matches.length && !others.length && <p className="rqm-p">Nothing in your catalog matches "{search}".</p>}
                            {!q && !anySelectable && (
                                <p className="rqm-p">
                                    {onlyUnitBlocked
                                        ? `This buyer asked in ${unit}, and none of your products are sold in ${unit}, so you can't quote on them. Add a product sold in ${unit} below.`
                                        : "You don't have a product in your catalog that fits this enquiry yet. Add one below to send your quote."}
                                </p>
                            )}

                            {/* Sell this: built from the enquiry itself (product name, brand, unit, image), not from catalogue brands. */}
                            <div className="rqm-sec"><p className="rqm-h">Sell this item</p>
                                <div className="rqm-row add">
                                    <Thumb src={enqImage || null} name={enquiry.productName} />
                                    <span className="rqm-tx">
                                        <b>{enquiry.productName}</b>
                                        <small>{[enqBrand, `Sold in ${unit}`].filter(Boolean).join(" · ")}</small>
                                        <small>List it exactly as the buyer asked, then send your quote.</small>
                                    </span>
                                    <button type="button" className="rqm-add" onClick={goSell}>Sell this</button>
                                </div>
                            </div>
                            {opts.canAddNew && <button type="button" className="rqm-new" onClick={goAdd}><Plus size={16} />Add a new product</button>}
                        </>)}

                        {view === "price" && sel && (<>
                            <div className="rqm-card">
                                <div className="rqm-sel">
                                    <Thumb src={sel.image} name={sel.productName} />
                                    <span className="rqm-tx"><b>{sel.productName}</b><small>{sel.brandName || "No brand"}</small></span>
                                </div>
                                <dl className="rqm-kv">
                                    <div><dt>GST on this product</dt><dd>{sel.gstPercent}%</dd></div>
                                    {sel.moq != null && <div><dt>Your MOQ</dt><dd>{fmtNum(sel.moq)} {saleLabel(sel)}{sel.moq === 1 ? "" : "s"} ({fmtNum(sel.moqUnits)} {sel.unit})</dd></div>}
                                    <div><dt>Freight</dt><dd>{sel.freightIncluded ? "Included" : "Extra"}</dd></div>
                                </dl>
                                {belowMoq && <p className="rqm-warn">The buyer's quantity is below your MOQ of {fmtNum(sel.moqUnits)} {sel.unit}. They may not be able to order it at the minimum from your listing.</p>}
                            </div>

                            {/* Information block: how this product is packed, and what the buyer's quantity comes to. */}
                            <div className="rqm-card">
                                <p className="rqm-h">Packaging breakdown</p>
                                <dl className="rqm-kv">
                                    <div><dt>Individual unit</dt><dd>1 {sel.unit} (price is entered per {sel.unit} first)</dd></div>
                                    <div><dt>Pack</dt><dd>1 Pack = {fmtNum(sel.packSize)} {sel.unit}</dd></div>
                                    {sel.hasMaster && <div><dt>Master pack</dt><dd>1 Master Pack = {fmtNum(sel.masterPackSize)} Packs = {fmtNum(masterUnits)} {sel.unit}</dd></div>}
                                    <div><dt>Buyer needs</dt><dd>{fmtNum(totalUnits)} {unit}{needParts.length ? ` (${needParts.join(" · ")})` : ""}</dd></div>
                                </dl>
                            </div>

                            <div className="rqm-f">
                                <label>I am entering the price</label>
                                <div className="rqm-chips" role="group">
                                    {basisOpts.map(([k, l]) => <button key={k} type="button" aria-pressed={f.basis === k} onClick={() => convertTo(k, f.gstIncl)}>{l}</button>)}
                                </div>
                            </div>
                            <div className="rqm-f">
                                <label>Does this price include GST?</label>
                                <div className="rqm-chips" role="group">
                                    <button type="button" aria-pressed={f.gstIncl} onClick={() => convertTo(f.basis, true)}>Includes GST</button>
                                    <button type="button" aria-pressed={!f.gstIncl} onClick={() => convertTo(f.basis, false)}>Excludes GST</button>
                                </div>
                            </div>
                            <div className="rqm-f">
                                <label htmlFor="rqm-price">Price per {basisWord} ({f.gstIncl ? "incl." : "excl."} GST {sel.gstPercent}%)</label>
                                <div className="rqm-inp"><span>₹</span>
                                    <input id="rqm-price" inputMode="decimal" value={f.price}
                                        onChange={(e) => set({ price: e.target.value.replace(/[^\d.]/g, "") })} />
                                </div>
                                {sel.listPrice != null && saleIncl > 0 && (
                                    <div className={`rqm-pc ${dirTone}`} role="status" aria-live="polite">
                                        {sameAsList ? (
                                            <>
                                                <b>Same as your listing price</b>
                                                <span>{inr(sel.listPrice)} per {saleLabel(sel)} (incl. GST). {resetCustom ? "This buyer's custom price will be removed." : "No custom price will be saved."}</span>
                                            </>
                                        ) : (
                                            <>
                                                <b>{pctVsList < 0 ? "▼" : "▲"} {fmtPct(pctVsList)} {pctVsList < 0 ? "lower" : "higher"} than your listing price</b>
                                                <span>
                                                    Listing {inr(sel.listPrice)} → this buyer {inr(saleIncl)} per {saleLabel(sel)} (incl. GST).
                                                    {" "}It is saved as a fixed price for this buyer and will not change if you edit the listing price later.
                                                </span>
                                                {pctVsCustom != null && (
                                                    <span>
                                                        Their current custom price is {inr(sel.customPrice)}; this is {fmtPct(pctVsCustom)} {pctVsCustom < 0 ? "lower" : "higher"} than that.
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                                <p className="rqm-n">
                                    {sel.customPrice != null ? `Started from your custom price for this buyer (${inr(sel.customPrice)} per ${saleLabel(sel)}, incl. GST), shown here per ${sel.unit}. `
                                        : sel.listPrice != null ? `Started from your regular listing price (${inr(sel.listPrice)} per ${saleLabel(sel)}, incl. GST), shown here per ${sel.unit}. ` : ""}
                                    This is the price the buyer pays on your listing, so it is saved for them when you send the quote.
                                </p>
                            </div>

                            <div className="rqm-f">
                                <label>Quote valid for</label>
                                <div className="rqm-chips" role="group">
                                    {VALIDITY_OPTIONS.map((o) => <button key={o.key} type="button" aria-pressed={f.valid === o.key} onClick={() => set({ valid: o.key })}>{o.label}</button>)}
                                </div>
                            </div>

                            <div className="rqm-bk">
                                {calc ? (<>
                                    {pctVsList != null && !sameAsList && (
                                        <div><span>Vs your listing price</span><b>{pctVsList < 0 ? "−" : "+"}{fmtPct(pctVsList)}</b></div>
                                    )}
                                    <div><span>Price per {sel.unit} (excl. GST)</span><b>{inr(calc.perUnitExcl, 2)}</b></div>
                                    {Number(sel.packSize) > 1 && <div><span>Price per pack (excl. GST)</span><b>{inr(calc.perPackExcl, 2)}</b></div>}
                                    {calc.perMasterExcl != null && <div><span>Price per master pack (excl. GST)</span><b>{inr(calc.perMasterExcl, 2)}</b></div>}
                                    <div><span>Your MOQ</span><b>{fmtNum(sel.moq ?? 1)} {saleLabel(sel)}{Number(sel.moq ?? 1) === 1 ? "" : "s"} ({fmtNum(calc.moqBase)} {sel.unit})</b></div>
                                    <div className="ln"><span>Total before GST</span><b>{inr(calc.taxable)}</b></div>
                                    <div><span>GST @ {gstPct}%</span><b>{inr(calc.gstAmount)}</b></div>
                                    <div className="tot"><span>Total at MOQ (incl. GST)</span><b>{inr(calc.totalIncl)}</b></div>
                                </>) : <p className="rqm-n" style={{ margin: 0 }}>Enter your price to see the breakdown at your MOQ.</p>}
                            </div>
                            {err && <p className="rqm-err" role="alert">{err}</p>}
                        </>)}

                        {view === "done" && quote && (<>
                            <div className="rqm-okc"><Check size={28} strokeWidth={3} /></div>
                            <p className="rqm-p ctr">The buyer can now see your quote and buy from your listing.</p>
                            <div className="rqm-bk">
                                <div><span>Product</span><b>{quote.productName}</b></div>
                                <div><span>Total before GST</span><b>{inr(quote.taxableValue)}</b></div>
                                <div><span>GST @ {quote.gstPercent}%</span><b>{inr(quote.gstAmount)}</b></div>
                                <div className="tot"><span>Total incl. GST</span><b>{inr(quote.total)}</b></div>
                                <div><span>Price per pack (incl. GST)</span><b>{inr(quote.price)}</b></div>
                                <div><span>Valid</span><b>{quote.lifetime ? "No expiry" : `Until ${shortDate(quote.validUntil)}`}</b></div>
                            </div>
                        </>)}
                    </div>

                    {view === "price" && sel && (
                        <div className="rqm-ft">
                            <button type="button" className="rqm-btn go blk" disabled={busy || !calc} onClick={submit}>
                                <Send size={16} />{busy ? "Sending…" : isMine ? "Update quote" : "Send quote"}
                            </button>
                            {isMine && <button type="button" className="rqm-lnk" disabled={busy} onClick={withdraw}>Withdraw my quote</button>}
                        </div>
                    )}
                    {view === "done" && (
                        <div className="rqm-ft"><button type="button" className="rqm-btn go blk" onClick={() => onDone?.(quote, { withdrawn: false })}>Done</button></div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}