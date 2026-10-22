// src/components/grow/BulkItemForm.jsx
// The editable review form for ONE bulk-uploaded product. Same fields, rules and components
// as the add-product wizard, laid out as stacked sections. Fully controlled: the page owns the data.
//
// Guidance model (so the seller always knows what to do):
//   - every problem is shown on its OWN field (red) with a one-line message in simple words
//   - the first thing still missing is marked "Fill this next"
//   - fields that only matter after another answer (outer pack count, sample quantity, stock, days to make,
//     master-pack price) stay hidden until that answer is given, so they cannot be filled by mistake
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uploadSellerFile } from "../../utils/api.js";
import { findBrandItemMatch } from "../../utils/sellerListingApi.js";
import { applyMatch, packagingDiffers, UNITS, GST } from "../../utils/bulkSchema.js";
import { derivePriceBreakdown } from "../../../shared/customPricing.js";
import { VALIDITY_OPTIONS } from "../../shared/listingValidity.js";
import MarketingServicePicker from "../seller/listingForm/MarketingServicePicker.jsx";
import GrowBrandField from "./GrowBrandField.jsx";
import GrowDeliveryPicker, { summarizeDelivery } from "./GrowDeliveryPicker.jsx";
import { GrowBuyerAccessDraft } from "./GrowBuyerAccess.jsx";
import { useDrop } from "./growUi.js";

const VALIDITY = VALIDITY_OPTIONS.filter((o) => o.hours >= 24);
const CERT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.txt,image/*";
const certOk = (f) => /\.(pdf|docx?|xlsx?|txt)$/i.test(f.name || "") || !!f.type?.startsWith("image/");
const isImg = (f) => !!f.type?.startsWith("image/");
const num = (s) => String(s).replace(/[^\d.]/g, "");

// A field row. `k` ties it to a validation field: red + message when it has a problem, "Fill this next" when it is first.
// (Defined at module level on purpose: a component defined inside another would remount its inputs on every keystroke.)
function F({ k, st, l, c, children }) {
    const msg = k ? st.by.get(k) : null;
    const bad = !!msg && (k !== "im" || st.show);
    const next = !!k && st.next === k;
    return (
        <div id={k ? `bk-f-${k}` : undefined} className={`f${bad ? " bk-bad" : ""}${next ? " bk-next" : ""}`}>
            {l && <label>{l}</label>}
            {next && <span className="bk-nx">Fill this next</span>}
            {children}
            {bad ? <p className="cap err">{msg}</p> : c && <p className="cap">{c}</p>}
        </div>
    );
}
const In = ({ v, on, ...r }) => <div className="inp"><input value={v ?? ""} onChange={(e) => on(e.target.value)} {...r} /></div>;
const Chips = ({ v, on, o }) => (
    <div className="chips">{o.map(([k, t]) => (
        <button key={String(k)} type="button" className="chip" aria-pressed={String(v) === String(k)} onClick={() => on(k)}>{t}</button>
    ))}</div>
);
const YN = ({ v, on }) => <Chips v={v === true ? "y" : v === false ? "n" : ""} on={(k) => on(k === "y")} o={[["y", "Yes"], ["n", "No"]]} />;

function Sec({ id, title, sub, bad, children }) {
    return (
        <section className={`pn bk-sec${bad ? " bad" : ""}`} id={`bk-${id}`}>
            <div className="bk-sh">
                <div><h3>{title}</h3><p>{sub}</p></div>
                {bad && <span className="bk-flag">Needs your answer</span>}
            </div>
            {children}
        </section>
    );
}

export default function BulkItemForm({ token, P, onChange, say, geo, policy, errors, showErrors }) {
    const ref = useRef(P);
    ref.current = P;
    const cbRef = useRef(onChange);
    cbRef.current = onChange;
    const patch = useCallback((o) => { ref.current = { ...ref.current, ...o }; cbRef.current(ref.current); }, []);

    const [match, setMatch] = useState(null);
    const [up, setUp] = useState(false);

    // validation state shared with every field
    const st = useMemo(() => {
        const by = new Map();
        errors.forEach((e) => { if (!by.has(e.field)) by.set(e.field, e.msg); });
        return { by, next: errors[0]?.field || null, show: !!showErrors };
    }, [errors, showErrors]);
    const secBad = (id) => errors.some((e) => e.section === id && (e.field !== "im" || showErrors));

    // Existing catalogue product? Its unit / pack / GST are fixed.
    useEffect(() => {
        const n = P.n.trim(), b = P.b.trim();
        if (n.length < 2 || (!P.nb && !b)) { setMatch(null); return undefined; }
        let live = true;
        const t = setTimeout(async () => {
            const r = await findBrandItemMatch(token, { productName: n, brandName: b, brandNotApplicable: P.nb });
            if (!live || !r?.success) return;
            setMatch(r.match || null);
            if (r.match) {
                const applied = applyMatch(ref.current, r.match);
                if (packagingDiffers(ref.current, applied)) patch(applied);
            }
        }, 400);
        return () => { live = false; clearTimeout(t); };
    }, [P.n, P.b, P.nb, token, patch]);

    /* uploads */
    const addFiles = async (files, kind) => {
        let list = Array.from(files || []);
        if (!list.length || up) return;
        if (kind === "im") {
            const imgs = list.filter(isImg);
            if (!imgs.length) return say("Please choose photos (JPG, PNG, etc.).");
            const room = 5 - ref.current.im.length;
            if (room <= 0) return say("You can add up to 5 photos.");
            if (imgs.length > room) say(`Only ${room} more photo${room === 1 ? "" : "s"} fit. The extra files were skipped.`);
            list = imgs.slice(0, room);
        } else {
            const good = list.filter(certOk);
            if (!good.length) return say("This file type is not supported. Use PDF, Word, Excel, text or a photo.");
            list = good;
        }
        setUp(true);
        try {
            for (const file of list) {
                const r = await uploadSellerFile(token, file, kind === "im" ? "listings" : "certificates");
                if (!r?.success) { say("Upload failed. Please try again."); continue; }
                if (kind === "im") patch({ im: [...ref.current.im, r.url].slice(0, 5) });
                else patch({ cert: [...ref.current.cert, { name: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim(), url: r.url }] });
            }
        } finally { setUp(false); }
    };
    const imgDrop = useDrop((files) => addFiles(files, "im"), { disabled: up });
    const certDrop = useDrop((files) => addFiles(files, "cert"), { disabled: up });

    /* derived */
    const outer = P.op === true && Number(P.mps) >= 2;
    const saleU = P.op ? "Master Pack" : "Pack";
    const price = Number(P.price) || 0, packSz = Number(P.ps) || 0, mpsN = Number(P.mps) || 1;
    const pk = price > 0 && packSz > 0
        ? (P.basis === "per_unit" ? price * packSz : P.basis === "per_master_pack" ? price / mpsN : P.basis === "per_pack" ? price : 0) : 0;
    const salePrice = pk ? (P.op ? pk * mpsN : pk) : 0;
    const gstLocked = !!match && P.gst !== "" && P.gst != null;

    const buyerProduct = useMemo(() => {
        const gstN = Number(P.gst) || 0;
        const final = salePrice > 0 ? Math.round((P.inc ? salePrice : salePrice * (1 + gstN / 100)) * 100) / 100 : 0;
        const mp = outer ? mpsN : 1, ps = packSz || 1;
        return {
            defaultPrice: final,
            defaultBreakdown: final > 0 ? derivePriceBreakdown(final, ps, mp) : { perBaseUnit: 0, perPack: 0, perMasterPack: null },
            gstPercent: gstN, packSize: ps, masterPackSize: mp, unit: P.u,
            hasMasterPack: outer,
        };
    }, [salePrice, P.inc, P.gst, outer, mpsN, packSz, P.u]);

    const setOuter = (v) => {
        if (P.op === v) return;
        patch({ op: v, mps: "", moq: "", stock: "", basis: P.basis === "per_master_pack" ? "" : P.basis });
    };
    const policyOk = policy?.ret?.length && policy?.war?.length;

    return (
        <div className="bk-form">
            {/* ---------------- product ---------------- */}
            <Sec id="product" title="Product" sub="Name, brand, photos and documents." bad={secBad("product")}>
                <F k="n" st={st} l="Product name *"><In v={P.n} on={(v) => patch({ n: v })} placeholder="e.g. Premium Stainless Steel Hinges" /></F>
                <F k="b" st={st} l="Brand *">
                    <GrowBrandField token={token} value={P.b} image={P.bi} notApplicable={P.nb} isNew={false} say={say}
                        onChange={({ b, bi, nb }) => patch({ b, bi, nb })} />
                </F>
                {match && <p className="cap">This product is already on BBM Marketplace, so its unit, packing and GST cannot be changed.</p>}

                <F k="im" st={st}>
                    <div className="lb">Product photos * <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, color: "var(--mute)" }}>up to 5</span></div>
                    {/* the frame (not the inner box) carries the highlight, so there is no stray gap under the tiles */}
                    <div className="bk-photo">
                        <div className={`ph gx-dz${imgDrop.active ? " on" : ""}`} {...imgDrop.bind}>
                            {P.im.map((u, i) => (
                                <div className="th" key={u} style={{ backgroundImage: `url(${u})` }}>
                                    <button type="button" className="x" aria-label="Remove photo" onClick={() => patch({ im: P.im.filter((_, j) => j !== i) })}>×</button>
                                </div>
                            ))}
                            {P.im.length < 5 && (
                                <label className="add">{up ? "…" : "+ Add"}
                                    <input type="file" accept="image/*" multiple hidden disabled={up} onChange={(e) => { addFiles(e.target.files, "im"); e.target.value = ""; }} />
                                </label>
                            )}
                        </div>
                    </div>
                    <p className="cap" style={{ marginTop: 8 }}>Tap Add, or drag and drop photos here.</p>
                </F>

                <F st={st} l="Quality papers and documents (optional)">
                    {P.cert.map((c, i) => (
                        <div className="gx-cert" key={c.url}>
                            <span className="gx-ext" aria-hidden="true">doc</span>
                            <div className="inp"><input value={c.name} maxLength={80} aria-label="Document name"
                                onChange={(e) => patch({ cert: P.cert.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)) })} /></div>
                            <div className="gx-acts">
                                <a className="gx-act" href={c.url} target="_blank" rel="noreferrer">Open</a>
                                <button type="button" className="gx-act del" onClick={() => patch({ cert: P.cert.filter((_, j) => j !== i) })}>Remove</button>
                            </div>
                        </div>
                    ))}
                    <label className={`gx-drop${certDrop.active ? " on" : ""}${up ? " off" : ""}`} {...certDrop.bind}>
                        {up ? "Uploading…" : <><span>Drag and drop files here or <b>browse</b></span><em>PDF, Word, Excel, text or photo</em></>}
                        <input type="file" accept={CERT_ACCEPT} multiple hidden disabled={up} onChange={(e) => { addFiles(e.target.files, "cert"); e.target.value = ""; }} />
                    </label>
                </F>
                <F st={st} l="Note for us (optional)"><textarea value={P.note} onChange={(e) => patch({ note: e.target.value })} placeholder="Anything our team should know?" /></F>
            </Sec>

            {/* ---------------- packaging ---------------- */}
            <Sec id="packaging" title="Packing and minimum order" sub="Pack size and minimum order decide every price." bad={secBad("packaging")}>
                {match
                    ? <div className="brk"><div><span>Fixed for this product</span><b>1 Pack = {P.ps} {P.u}{outer ? ` · 1 Master Pack = ${P.mps} Packs` : ""}</b></div></div>
                    : (<>
                        <F k="u" st={st} l="Unit *" c="The smallest measure you sell in."><Chips v={P.u} on={(v) => patch({ u: v })} o={UNITS.map((u) => [u, u])} /></F>
                        <F k="ps" st={st} l={P.u ? `How many ${P.u} are in 1 Pack? *` : "Items in 1 Pack *"}><In v={P.ps} on={(v) => patch({ ps: num(v) })} inputMode="decimal" placeholder="e.g. 4" /></F>
                        <F k="op" st={st} l="Is there an outer pack? *" c="A bigger box (Master Pack) that holds several Packs."><YN v={P.op} on={setOuter} /></F>
                        {P.op === true && <F k="mps" st={st} l="How many Packs are in 1 outer pack? *"><In v={P.mps} on={(v) => patch({ mps: v.replace(/\D/g, "") })} inputMode="numeric" placeholder="e.g. 4" /></F>}
                    </>)}
                <F k="moq" st={st} l={`Minimum order (in ${saleU}s) *`} c={`The smallest number of ${saleU}s a buyer can order.`}><In v={P.moq} on={(v) => patch({ moq: num(v) })} inputMode="decimal" placeholder="e.g. 5" /></F>
                <F k="sm" st={st} l="Can buyers get a sample? *"><YN v={P.sm} on={(v) => patch({ sm: v, ...(v ? {} : { sq: "" }) })} /></F>
                {P.sm === true && <F k="sq" st={st} l={`Sample quantity (${P.u || "units"}) *`}><In v={P.sq} on={(v) => patch({ sq: num(v) })} inputMode="decimal" /></F>}
            </Sec>

            {/* ---------------- price ---------------- */}
            <Sec id="price" title="Price" sub="Simple and valid for as long as you choose." bad={secBad("price")}>
                {gstLocked ? <p className="cap" style={{ marginTop: 0 }}>GST {P.gst}% is fixed for this product.</p>
                    : <F k="gst" st={st} l="GST % *"><Chips v={P.gst} on={(v) => patch({ gst: Number(v) })} o={GST.map((g) => [g, `${g}%`])} /></F>}
                <F k="basis" st={st} l="My price is for *">
                    <Chips v={P.basis} on={(v) => patch({ basis: v })} o={[["per_unit", `1 ${P.u || "Unit"}`], ["per_pack", "1 Pack"], ...(outer ? [["per_master_pack", "1 Master Pack"]] : [])]} />
                </F>
                <F k="price" st={st} l="Price *" c={pk ? `Works out to ₹${pk.toLocaleString("en-IN", { maximumFractionDigits: 2 })} per Pack.` : ""}>
                    <div className="inp"><span className="pre">₹</span><input type="number" min="0" inputMode="decimal" value={P.price} onChange={(e) => patch({ price: e.target.value })} /></div>
                </F>
                <F k="inc" st={st} l="Is GST already in your price? *"><YN v={P.inc} on={(v) => patch({ inc: v })} /></F>
                <F k="fr" st={st} l="Is the delivery charge already in your price? *"><YN v={P.fr} on={(v) => patch({ fr: v })} /></F>
                <F k="val" st={st} l="How long is the price valid? *" c="After this the listing pauses. You can renew it in one tap.">
                    <Chips v={P.val} on={(v) => patch({ val: v })} o={VALIDITY.map((o) => [o.hours, o.label])} />
                </F>
            </Sec>

            {/* ---------------- delivery ---------------- */}
            <Sec id="delivery" title="Delivery" sub="How soon you can send, and where." bad={secBad("delivery")}>
                <F k="ful" st={st} l="Do you have it in stock? *"><Chips v={P.ful} on={(v) => patch({ ful: v })} o={[["ready_stock", "Ready stock"], ["made_to_order", "Made after order"]]} /></F>
                {P.ful === "ready_stock" && <F k="stock" st={st} l={`Stock you have (in ${saleU}s) *`}><In v={P.stock} on={(v) => patch({ stock: num(v) })} inputMode="decimal" /></F>}
                {P.ful === "made_to_order" && <F k="lead" st={st} l="Days you need to make it *"><In v={P.lead} on={(v) => patch({ lead: v.replace(/\D/g, "") })} inputMode="numeric" /></F>}
                <F k="dl" st={st} l="Where do you deliver? *" c={P.dl.mode ? summarizeDelivery(P.dl) : ""}>
                    <GrowDeliveryPicker value={P.dl} onChange={(v) => patch({ dl: v })} states={geo.states} status={geo.status} onRetry={geo.reload} />
                </F>
            </Sec>

            {/* ---------------- terms ---------------- */}
            <Sec id="terms" title="Returns and warranty" sub="Tell buyers your rules before the sale." bad={secBad("terms")}>
                {policyOk ? (<>
                    <F k="ret" st={st} l="Return / replacement policy *"><Chips v={P.ret} on={(v) => patch({ ret: v })} o={policy.ret.map((o) => [o.key, o.label])} /></F>
                    <F k="war" st={st} l="Warranty *"><Chips v={P.war} on={(v) => patch({ war: v })} o={policy.war.map((o) => [o.key, o.label])} /></F>
                </>) : <p className="cap">Loading options…</p>}
            </Sec>

            {/* ---------------- promotion ---------------- */}
            <Sec id="promo" title="Reach and promotion" sub="Charged only when an order is placed." bad={false}>
                <MarketingServicePicker value={P.ms} onChange={(v) => patch({ ms: v })} legacyPercent={null} exampleOrderValue={pk * (Number(P.moq) || 1)} error={false} />
            </Sec>

            {/* ---------------- buyer access ---------------- */}
            <Sec id="access" title="Who can buy, and at what price?" sub="Optional. Choose who can see this product and give some buyers their own price." bad={secBad("access")}>
                <div id="bk-f-ba" className={`${st.by.has("ba") ? "bk-bad-box" : ""}`}>
                    {st.by.has("ba") && <p className="cap err" style={{ marginTop: 0 }}>{st.by.get("ba")}</p>}
                    <GrowBuyerAccessDraft token={token} product={buyerProduct} value={P.ba} onChange={(v) => patch({ ba: v })} />
                </div>
            </Sec>
        </div>
    );
}