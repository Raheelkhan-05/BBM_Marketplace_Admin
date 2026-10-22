// src/components/grow/GrowEditListing.jsx
// GROW-themed replacement for <EditListingModal inline /> inside the products-page <Sheet>.
// Same props, same APIs, same payload shape as the old SellerListingForm edit flow:
//   load   -> fetchSellerSubmissionDetail  -> submissionToInitialValues (exported from EditListingModal)
//   save   -> updateSellerProductSubmission
//   buyers -> GrowBuyerAccessLive (existing per-listing APIs)
// Delivery still uses the legacy DispatchingLocationsPicker (see note in the reply).
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchSellerSubmissionDetail, updateSellerProductSubmission } from "../../utils/api.js";
import { fetchListingPolicyOptions } from "../../utils/sellerListingApi.js";
import { submissionToInitialValues } from "../seller/listingForm/EditListingModal.jsx";
import DispatchingLocationsPicker from "../seller/listingForm/DispatchingLocationsPicker.jsx";
import MarketingServicePicker from "../seller/listingForm/MarketingServicePicker.jsx";
import { VALIDITY_OPTIONS, validityLabel, resolveValidityHours } from "../../shared/listingValidity.js";
import { normalizeServiceKeys } from "../../shared/marketingServices.js";
import { GrowBuyerAccessLive, Seg, YN, Field } from "./GrowBuyerAccess.jsx";
import "./grow-access.css";

const GST_LABEL = "GST is fixed for this product";
const ALIAS = { identity: "identity", dispatch: "delivery", delivery: "delivery", policies: "policies", terms: "policies" };
const TITLES = {
    validity: ["Listing validity", "How long it stays live"],
    identity: ["Product", "Locked once approved"],
    packaging: ["Packaging & minimum order", "MOQ and samples"],
    pricing: ["Tax & pricing", "Price, GST, discounts"],
    fulfilment: ["Fulfilment", "Stock or lead time"],
    delivery: ["Delivery", "Where you ship"],
    policies: ["Terms", "Returns and warranty"],
    marketing: ["Marketing & promotion", "Promotion budget"],
    customPricing: ["Buyer access & pricing", "Who sees it, special prices"],
};
const ORDER = ["validity", "identity", "packaging", "pricing", "fulfilment", "delivery", "policies", "marketing", "customPricing"];

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (s) => String(s).replace(/[^\d.]/g, "");

// price of one sale unit (Pack, or Master Pack when there is an outer pack), GST inclusive
function saleUnitFinal(f) {
    const price = Number(f.basePrice) || 0, gst = Number(f.gstPercent) || 0;
    const pack = Number(f.packSize) > 0 ? Number(f.packSize) : 1;
    const master = Number(f.masterPackSize) > 1 ? Number(f.masterPackSize) : 1;
    const perPack = f.priceBasis === "per_unit" ? price * pack : f.priceBasis === "per_master_pack" ? price / master : price;
    const sale = f.hasOuterPack ? perPack * master : perPack;
    return r2(f.gstInclusive ? sale : sale * (1 + gst / 100));
}
function convertPrice(price, from, to, pack, master) {
    const p = Number(price); if (!(p > 0)) return price;
    const perPack = from === "per_unit" ? p * pack : from === "per_master_pack" ? p / master : p;
    return String(r2(to === "per_unit" ? perPack / pack : to === "per_master_pack" ? perPack * master : perPack));
}

function computeMissing(f, only) {
    const m = [];
    const add = (cond, section, key, label) => { if (cond && (!only || only === section)) m.push({ section, key, label }); };
    add(!(Number(f.validityHours) > 0), "validity", "validityHours", "Listing validity");
    add(!(Number(f.moq) > 0), "packaging", "moq", "MOQ");
    add(f.sampleAvailable == null, "packaging", "sampleAvailable", "Sample availability");
    add(f.sampleAvailable && !(Number(f.sampleQuantity) > 0), "packaging", "sampleQuantity", "Sample quantity");
    add(!(Number(f.basePrice) > 0), "pricing", "basePrice", "Price");
    add(f.gstInclusive == null, "pricing", "gstInclusive", "Price includes GST");
    add(f.freightIncluded == null, "pricing", "freightIncluded", "Freight included");
    add(!f.stockType, "fulfilment", "stockType", "Fulfilment type");
    add(f.stockType === "ready_stock" && (f.stockQuantity === "" || f.stockQuantity == null), "fulfilment", "stockQuantity", "Available stock");
    add(f.stockType === "made_to_order" && (f.productionLeadTimeDays === "" || f.productionLeadTimeDays == null), "fulfilment", "productionLeadTimeDays", "Lead time");
    add(!f.dispatchingLocations?.country, "delivery", "dispatchingLocations", "Dispatching locations");
    add(!f.returnPolicyKey, "policies", "returnPolicyKey", "Return policy");
    add(!f.warrantyKey, "policies", "warrantyKey", "Warranty");
    add(!Array.isArray(f.marketingServices), "marketing", "marketingServices", "Marketing plan");
    return m;
}

function Sec({ id, only, open, setOpen, count, children }) {
    const [t, s] = TITLES[id];
    if (only) return <section id={`gax-${id}`} className="gax-solo">{children}</section>;
    const isOpen = open === id;
    return (
        <section id={`gax-${id}`} className={`gax-sec${isOpen ? " open" : ""}`}>
            <button type="button" className="gax-sh" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? "" : id)}>
                <span><b>{t}</b><small>{s}</small></span>
                {count > 0 && <em className="gax-pill red" style={{ fontStyle: "normal" }}>{count} left</em>}
                <i className="gax-cv" />
            </button>
            {isOpen && <div className="gax-sb">{children}</div>}
        </section>
    );
}

export default function GrowEditListing({ token, submissionId, focusSection, onClose, onSaved }) {
    const only = focusSection ? (ALIAS[focusSection] || focusSection) : null;
    const [phase, setPhase] = useState("loading");
    const [loadErr, setLoadErr] = useState("");
    const [f, setF] = useState(null);
    const [pol, setPol] = useState({ ret: [], war: [] });
    const [open, setOpen] = useState("");
    const [showErr, setShowErr] = useState(false);
    const [banner, setBanner] = useState("");
    const [busy, setBusy] = useState(false);
    const accessRef = useRef(null);
    const bodyRef = useRef(null);
    const rootRef = useRef(null);
    const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

    useEffect(() => {
        let dead = false;
        setPhase("loading"); setLoadErr("");
        fetchSellerSubmissionDetail(token, submissionId).then((res) => {
            if (dead) return;
            if (!res?.success) { setLoadErr(res?.message || "Couldn't load this listing."); setPhase("error"); return; }
            const s = res.submission;
            const iv = submissionToInitialValues(s);
            const hasPackaging = iv.unit && Number(iv.packSize) > 0;
            setF({
                ...iv,
                // sample quantity is stored in base units: edit it in base units
                sampleUnitBasis: "per_unit",
                sampleQuantity: s.sample_quantity != null ? String(s.sample_quantity) : "",
                brandItemMatch: hasPackaging ? { id: iv.genericProductBrandId ?? null, unit: iv.unit, packSize: iv.packSize, masterPackSize: iv.masterPackSize } : null,
                buyerAccessDraft: { mode: "public", buyers: [] },
            });
            setPhase("ready");
        });
        return () => { dead = true; };
    }, [token, submissionId]);

    useEffect(() => {
        fetchListingPolicyOptions("return_policy").then((r) => r?.success && setPol((x) => ({ ...x, ret: r.items })));
        fetchListingPolicyOptions("warranty").then((r) => r?.success && setPol((x) => ({ ...x, war: r.items })));
    }, []);

    // Scroll isolation: the sheet owns the wheel/touch while it is open. Lenis (window-level) never sees these
    // events, and the page behind can never scroll, even when the content is shorter than the sheet.
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return undefined;
        const canScroll = (el, dy) => {
            const oy = getComputedStyle(el).overflowY;
            if ((oy !== "auto" && oy !== "scroll") || el.scrollHeight <= el.clientHeight + 1) return false;
            return dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1;
        };
        const onWheel = (e) => {
            e.stopPropagation();
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
            let el = e.target instanceof Element ? e.target : null;
            while (el) {
                if (canScroll(el, e.deltaY)) return;      // something inside can still scroll: let the browser do it
                if (el === root) break;
                el = el.parentElement;
            }
            e.preventDefault();                           // nothing can scroll: do not leak to the page
        };
        const onTouch = (e) => e.stopPropagation();
        root.addEventListener("wheel", onWheel, { passive: false });
        root.addEventListener("touchmove", onTouch, { passive: true });
        return () => { root.removeEventListener("wheel", onWheel); root.removeEventListener("touchmove", onTouch); };
    }, []);

    const missing = useMemo(() => (f ? computeMissing(f, only) : []), [f, only]);
    const bad = (k) => showErr && missing.some((m) => m.key === k);
    const countFor = (sec) => missing.filter((m) => m.section === sec).length;
    const show = (k) => !only || only === k;
    useEffect(() => { if (!only && phase === "ready" && !open) setOpen(""); }, [phase]); // eslint-disable-line

    const pricing = f ? saleUnitFinal(f) : 0;
    const saleU = f?.hasOuterPack ? "Master Pack" : "Pack";
    const pack = Number(f?.packSize) > 0 ? Number(f.packSize) : 1;
    const master = Number(f?.masterPackSize) > 1 ? Number(f.masterPackSize) : 1;

    const save = async () => {
        setBanner("");
        if (missing.length) {
            setShowErr(true);
            setBanner(`Please complete: ${missing.slice(0, 4).map((m) => m.label).join(", ")}${missing.length > 4 ? `, +${missing.length - 4} more` : ""}.`);
            if (!only) setOpen(missing[0].section);
            setTimeout(() => document.getElementById(`gax-${missing[0].section}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
            return;
        }
        setBusy(true);
        try {
            if (show("customPricing") && accessRef.current?.flushPendingChanges) {
                const r = await accessRef.current.flushPendingChanges();
                if (!r?.success) return; // the buyer section shows its own error
            }
            if (only === "customPricing") { onClose?.(); return; }

            const dl = f.dispatchingLocations;
            let dispatchingLocations = [];
            if (dl?.country) {
                if (dl.mode === "include") {
                    dispatchingLocations = [
                        { type: "country", name: dl.country.name, code: dl.country.code, includeOnly: true },
                        ...(dl.includedStates || []).map((st) => {
                            const c = dl.includedCitiesByState?.[st];
                            return c !== undefined ? { type: "state", name: st, includedCities: c } : { type: "state", name: st };
                        }),
                    ];
                } else {
                    dispatchingLocations = [
                        { type: "country", name: dl.country.name, code: dl.country.code, excludedStates: dl.excludedStates || [] },
                        ...Object.entries(dl.citiesByState || {}).filter(([, c]) => c?.length).map(([st, c]) => ({ type: "state", name: st, excludedCities: c })),
                    ];
                }
            }
            const payload = {
                ...f,
                hasOuterPack: !!f.hasOuterPack, sampleAvailable: !!f.sampleAvailable,
                gstInclusive: !!f.gstInclusive, freightIncluded: !!f.freightIncluded,
                validityHours: resolveValidityHours(f.validityHours),
                marketingServices: Array.isArray(f.marketingServices) ? normalizeServiceKeys(f.marketingServices) : null,
                genericProductBrandId: f.brandItemMatch?.id || null,
                moq: String(Math.max(1, Math.round(Number(f.moq) || 0))),
                pricingTouched: false,
                sampleQuantity: f.sampleAvailable ? String(r2(f.sampleQuantity)) : f.sampleQuantity,
                stockQuantity: f.stockType === "ready_stock" ? String(r2(f.stockQuantity)) : f.stockQuantity,
                dispatchingLocations,
            };
            const res = await updateSellerProductSubmission(token, submissionId, payload);
            if (!res?.success) { setBanner(res?.message || "Couldn't save changes."); return; }
            onSaved(submissionId, res.submission, res.message || "Changes submitted for review.");
        } finally { setBusy(false); }
    };

    const title = only ? (TITLES[only]?.[0] || "Edit listing") : "Edit listing";
    const saveLabel = only === "customPricing" ? "Save buyer prices" : "Save changes";

    return (
        <div className="gax gax-edit" ref={rootRef} data-lenis-prevent="" data-scroll-lock-allow="">
            <div className="gax-eh">
                <div>
                    <h3>{title}</h3>
                    {f?.productName && <p>{f.productName}{f.brandName ? ` · ${f.brandName}` : ""}</p>}
                </div>
            </div>

            <div className="gax-eb" ref={bodyRef} data-lenis-prevent="" data-scroll-lock-allow="">
                {phase === "loading" && <div className="gax-load">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="gax-skel" />)}</div>}
                {phase === "error" && <p className="gax-sum err">{loadErr}</p>}
                {phase === "ready" && (<>
                    {banner && <p className="gax-sum err">{banner}</p>}

                    {show("validity") && (
                        <Sec id="validity" only={only} open={open} setOpen={setOpen} count={countFor("validity")}>
                            <Field label="How long should this stay live? *" bad={bad("validityHours")}
                                cap={Number(f.validityHours) > 0 ? `Live for ${validityLabel(f.validityHours)} from the moment you save. Changing it restarts the countdown.` : "Pick a duration."}>
                                <Seg v={f.validityHours} on={(v) => set("validityHours", Number(v))} o={VALIDITY_OPTIONS.map((o) => [o.hours, o.label])} />
                            </Field>
                        </Sec>
                    )}

                    {show("identity") && (
                        <Sec id="identity" only={only} open={open} setOpen={setOpen} count={0}>
                            <div className="gax-fixed"><small>Product</small><b>{f.productName}</b>{f.brandName && <div style={{ color: "var(--g-blue)", fontWeight: 700, fontSize: ".9rem" }}>{f.brandName}</div>}</div>
                            <p className="gax-cap">Name and brand are locked after approval.</p>
                        </Sec>
                    )}

                    {show("packaging") && (
                        <Sec id="packaging" only={only} open={open} setOpen={setOpen} count={countFor("packaging")}>
                            {f.unit && (
                                <div className="gax-fixed"><small>Fixed by this product</small>
                                    <b>1 Pack = {f.packSize} {f.unit}{f.hasOuterPack ? ` · 1 Master Pack = ${f.masterPackSize} Packs` : ""}</b></div>
                            )}
                            <Field label={`Minimum order (in ${saleU}s) *`} bad={bad("moq")} cap={`The smallest number of ${saleU}s a buyer can order.`}>
                                <div className="gax-inp"><input inputMode="decimal" value={f.moq} placeholder="e.g. 5" onChange={(e) => set("moq", num(e.target.value))} /></div>
                            </Field>
                            <Field label="Sample available? *" bad={bad("sampleAvailable")}>
                                <YN v={f.sampleAvailable} on={(v) => set("sampleAvailable", v)} />
                            </Field>
                            {f.sampleAvailable === true && (
                                <Field label={`Sample quantity (${f.unit || "units"}) *`} bad={bad("sampleQuantity")}>
                                    <div className="gax-inp"><input inputMode="decimal" value={f.sampleQuantity} onChange={(e) => set("sampleQuantity", num(e.target.value))} /></div>
                                </Field>
                            )}
                        </Sec>
                    )}

                    {show("pricing") && (
                        <Sec id="pricing" only={only} open={open} setOpen={setOpen} count={countFor("pricing")}>
                            <div className="gax-fixed"><small>{GST_LABEL}</small><b>{f.gstPercent}% GST applies to this listing</b></div>
                            <Field label="Price is entered per">
                                <Seg v={f.priceBasis}
                                    on={(b) => setF((x) => ({ ...x, priceBasis: b, basePrice: convertPrice(x.basePrice, x.priceBasis, b, pack, master) }))}
                                    o={[["per_unit", f.unit || "Unit"], ["per_pack", "Pack"], ...(f.hasOuterPack ? [["per_master_pack", "Master Pack"]] : [])]} />
                            </Field>
                            <Field label="Price *" bad={bad("basePrice")} cap={pricing > 0 ? `Buyers pay about ₹${pricing.toLocaleString("en-IN")} per ${saleU} including GST.` : ""}>
                                <div className="gax-inp"><span className="pre">₹</span><input inputMode="decimal" value={f.basePrice} onChange={(e) => set("basePrice", num(e.target.value))} /></div>
                            </Field>
                            <Field label="Price includes GST? *" bad={bad("gstInclusive")}><YN v={f.gstInclusive} on={(v) => set("gstInclusive", v)} /></Field>
                            <Field label="Freight included? *" bad={bad("freightIncluded")}><YN v={f.freightIncluded} on={(v) => set("freightIncluded", v)} /></Field>
                            <div className="gax-f">
                                <label>Quantity discounts (optional)</label>
                                {f.priceSlabs.map((x, i) => {
                                    const d = Number(x.discountPercent);
                                    const sp = pricing > 0 && d > 0 && d < 100 && Number(x.minQty) > 0 ? pricing * (1 - d / 100) : 0;
                                    const upd = (k, v) => set("priceSlabs", f.priceSlabs.map((r, j) => (j === i ? { ...r, [k]: num(v) } : r)));
                                    return (
                                        <div className="gax-slab" key={i}>
                                            <div><span>Min {saleU}s</span><div className="gax-inp"><input inputMode="decimal" value={x.minQty ?? ""} onChange={(e) => upd("minQty", e.target.value)} /></div></div>
                                            <div><span>Discount %</span><div className="gax-inp"><input inputMode="decimal" value={x.discountPercent ?? ""} onChange={(e) => upd("discountPercent", e.target.value)} /></div></div>
                                            <button type="button" className="gax-x" aria-label={`Remove slab ${i + 1}`} onClick={() => set("priceSlabs", f.priceSlabs.filter((_, j) => j !== i))}>×</button>
                                            {sp > 0 && <p>From {x.minQty} {saleU}{Number(x.minQty) === 1 ? "" : "s"}: ₹{sp.toLocaleString("en-IN", { maximumFractionDigits: 2 })} per {saleU}</p>}
                                        </div>
                                    );
                                })}
                                {f.priceSlabs.length < 5 && <button type="button" className="gax-dash" onClick={() => set("priceSlabs", [...f.priceSlabs, { minQty: "", discountPercent: "" }])}>+ Add slab</button>}
                            </div>
                        </Sec>
                    )}

                    {show("fulfilment") && (
                        <Sec id="fulfilment" only={only} open={open} setOpen={setOpen} count={countFor("fulfilment")}>
                            <Field label="How soon can you dispatch? *" bad={bad("stockType")}>
                                <Seg v={f.stockType} on={(v) => set("stockType", v)} o={[["ready_stock", "Ready stock"], ["made_to_order", "Made-to-order"]]} />
                            </Field>
                            {f.stockType === "ready_stock" && (
                                <Field label={`Available stock (in ${saleU}s) *`} bad={bad("stockQuantity")}>
                                    <div className="gax-inp"><input inputMode="decimal" value={f.stockQuantity} onChange={(e) => set("stockQuantity", num(e.target.value))} /></div>
                                </Field>
                            )}
                            {f.stockType === "made_to_order" && (
                                <Field label="Lead time (days) *" bad={bad("productionLeadTimeDays")}>
                                    <div className="gax-inp"><input inputMode="numeric" value={f.productionLeadTimeDays} onChange={(e) => set("productionLeadTimeDays", e.target.value.replace(/\D/g, ""))} /></div>
                                </Field>
                            )}
                        </Sec>
                    )}

                    {show("delivery") && (
                        <Sec id="delivery" only={only} open={open} setOpen={setOpen} count={countFor("delivery")}>
                            {bad("dispatchingLocations") && <p className="gax-sum err">Choose where you deliver.</p>}
                            <div className="gax-legacy"><DispatchingLocationsPicker value={f.dispatchingLocations} onChange={(v) => set("dispatchingLocations", v)} /></div>
                        </Sec>
                    )}

                    {show("policies") && (
                        <Sec id="policies" only={only} open={open} setOpen={setOpen} count={countFor("policies")}>
                            <Field label="Return / replacement policy *" bad={bad("returnPolicyKey")}>
                                <Seg v={f.returnPolicyKey} on={(v) => set("returnPolicyKey", v)} o={pol.ret.map((o) => [o.key, o.label])} />
                            </Field>
                            <Field label="Warranty *" bad={bad("warrantyKey")}>
                                <Seg v={f.warrantyKey} on={(v) => set("warrantyKey", v)} o={pol.war.map((o) => [o.key, o.label])} />
                            </Field>
                        </Sec>
                    )}

                    {show("marketing") && (
                        <Sec id="marketing" only={only} open={open} setOpen={setOpen} count={countFor("marketing")}>
                            <MarketingServicePicker value={f.marketingServices} onChange={(v) => set("marketingServices", v)}
                                legacyPercent={f.marketingLegacyPercent} exampleOrderValue={pricing * (Number(f.moq) || 1)} error={bad("marketingServices")} />
                        </Sec>
                    )}

                    {show("customPricing") && (
                        <Sec id="customPricing" only={only} open={open} setOpen={setOpen} count={0}>
                            <GrowBuyerAccessLive ref={accessRef} token={token} submissionId={submissionId} />
                        </Sec>
                    )}
                </>)}
            </div>

            <div className="gax-ef">
                <button type="button" className="gax-gh" onClick={onClose}>Cancel</button>
                <button type="button" className="gax-go" disabled={busy || phase !== "ready"} onClick={save}>{busy ? "Saving…" : saveLabel}</button>
            </div>
        </div>
    );
}