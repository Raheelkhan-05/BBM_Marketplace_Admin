// src/components/grow/GrowBuyerAccess.jsx
// Buyer visibility + per-buyer custom pricing in the GROW look.
//  - GrowBuyerAccessDraft : create flow (no submission yet). All state lives in `value` ({ mode, buyers }),
//                           sent as `buyerAccessDraft` exactly like the old SellerListingForm did.
//  - GrowBuyerAccessLive  : edit flow. Uses the existing per-listing APIs, same as the old BuyerAccessPricing.
// Both share the same price editor and the same shared/customPricing.js math as the old UI,
// so a price set here resolves to the same stored number.
// BuyerPriceEditor / Seg / Field / emptyDraft are exported so GrowCustomerPricing (per-buyer, many products,
// opened from the Customers page) uses the exact same editor and math.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
    searchEligibleBuyers, fetchListingAccess, setListingVisibilityMode, addListingVisibilityBuyer,
    removeListingVisibilityBuyer, saveCustomPricingForBuyer, deleteCustomPricingForBuyer,
} from "../../utils/sellerListingApi.js";
import {
    derivePriceBreakdown, percentFromCustomPrice, priceFromLevel, violatesMinUnitPrice,
    MIN_UNIT_PRICE, LEVEL_LABEL, LEVEL_FIELD, levelsFor,
} from "../../../shared/customPricing.js";
import "./grow-access.css";

/* ---------------- tiny shared bits (also used by GrowEditListing) ---------------- */
export const Seg = ({ v, on, o, disabled, fill }) => (
    <div className={`gax-chips${fill ? " fill" : ""}`}>{o.map(([k, t, tone]) => (
        <button key={String(k)} type="button" disabled={disabled} className={`gax-chip${tone ? ` ${tone}` : ""}`}
            aria-pressed={String(v) === String(k)} onClick={() => on(k)}>{t}</button>
    ))}</div>
);
export const YN = ({ v, on, disabled }) => (
    <Seg v={v === true ? "y" : v === false ? "n" : ""} on={(k) => on(k === "y")} disabled={disabled} o={[["y", "Yes"], ["n", "No"]]} />
);
export const Field = ({ label, cap, bad, children }) => (
    <div className={`gax-f${bad ? " bad" : ""}`}>{label && <label>{label}</label>}{children}{cap && <p className={`gax-cap${bad ? " err" : ""}`}>{cap}</p>}</div>
);

const inr = (n) => (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const round2 = (n) => (n == null ? n : Math.round(n * 100) / 100);
const initials = (name) => (name || "?").trim().split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
const byName = (a, b) => (a.shopName || a.name || "").localeCompare(b.shopName || b.name || "");
const MODES = [["public", "Everyone can see it"], ["restricted", "Selected buyers only"]];

export const emptyDraft = () => ({
    mode: "amount", gstMode: "incl", amounts: { unit: "", pack: "", master_pack: "" },
    percentValue: "", percentDirection: "decrease", canonicalPrice: null,
});

function draftFromOverride(buyer, product) {
    const canonical = buyer.effectivePrice;
    const bd = buyer.effectiveBreakdown || {};
    const pct = percentFromCustomPrice(product.defaultPrice, canonical);
    return {
        mode: "amount", gstMode: "incl", canonicalPrice: canonical,
        percentValue: String(pct), percentDirection: pct < 0 ? "increase" : "decrease",
        amounts: { unit: String(bd.perBaseUnit ?? ""), pack: String(bd.perPack ?? ""), master_pack: bd.perMasterPack != null ? String(bd.perMasterPack) : "" },
    };
}

/* ---------------- price editor (same math as the old BuyerPriceEditor) ---------------- */
export function BuyerPriceEditor({ product, draft, setDraft }) {
    const levels = levelsFor(product);
    const gst = Number(product.gstPercent) || 0;
    const gstMode = draft.gstMode || "incl";
    const hasPct = draft.percentValue !== "" && draft.percentValue != null;
    const direction = draft.percentDirection ?? (hasPct && Number(draft.percentValue) < 0 ? "increase" : "decrease");
    const pctAbs = hasPct ? String(draft.percentValue).replace("-", "") : "";
    // not a positive number, or below the minimum per-unit price the backend accepts
    const invalid = draft.canonicalPrice != null
        && (!(draft.canonicalPrice > 0) || violatesMinUnitPrice(draft.canonicalPrice, product.packSize, product.masterPackSize));
    const preview = draft.canonicalPrice != null && !invalid ? derivePriceBreakdown(draft.canonicalPrice, product.packSize, product.masterPackSize) : null;
    const applied = draft.canonicalPrice != null ? percentFromCustomPrice(product.defaultPrice, draft.canonicalPrice) : null;

    const toIncl = (raw) => (gstMode === "excl" ? Number(raw) * (1 + gst / 100) : Number(raw));
    const fromIncl = (v) => (gstMode === "excl" ? v / (1 + gst / 100) : v);
    const amountsFrom = (bd, conv) => ({
        unit: String(round2(conv(bd.perBaseUnit)) ?? ""),
        pack: String(round2(conv(bd.perPack)) ?? ""),
        master_pack: bd.perMasterPack != null ? String(round2(conv(bd.perMasterPack))) : "",
    });

    const changeGstMode = (next) => setDraft((prev) => {
        if (prev.canonicalPrice == null) return { ...prev, gstMode: next };
        const bd = derivePriceBreakdown(prev.canonicalPrice, product.packSize, product.masterPackSize);
        return { ...prev, gstMode: next, amounts: amountsFrom(bd, (x) => (next === "excl" ? x / (1 + gst / 100) : x)) };
    });

    const setFromAmount = (level, raw) => setDraft((prev) => {
        const typed = { ...prev.amounts, [level]: raw };
        if (raw === "" || raw == null || !(Number(raw) > 0)) return { ...prev, amounts: typed, canonicalPrice: raw === "" ? null : prev.canonicalPrice };
        const canonical = priceFromLevel(toIncl(raw), level, product.packSize, product.masterPackSize);
        const bd = derivePriceBreakdown(canonical, product.packSize, product.masterPackSize);
        const pct = percentFromCustomPrice(product.defaultPrice, canonical);
        const derived = amountsFrom(bd, fromIncl);
        return {
            ...prev, canonicalPrice: canonical, percentValue: String(pct),
            percentDirection: pct < 0 ? "increase" : pct > 0 ? "decrease" : (prev.percentDirection ?? "decrease"),
            amounts: { unit: level === "unit" ? raw : derived.unit, pack: level === "pack" ? raw : derived.pack, master_pack: level === "master_pack" ? raw : derived.master_pack },
        };
    });

    const setFromPct = (nextDir, absRaw) => setDraft((prev) => {
        if (absRaw === "" || absRaw == null) return { ...prev, percentDirection: nextDir, percentValue: "", canonicalPrice: null };
        const abs = Math.abs(Number(absRaw)) || 0;
        const signed = nextDir === "increase" ? -abs : abs;
        const canonical = Math.round(product.defaultPrice * (1 - signed / 100) * 100) / 100;
        const bd = derivePriceBreakdown(canonical, product.packSize, product.masterPackSize);
        return {
            ...prev, percentDirection: nextDir, canonicalPrice: canonical, amounts: amountsFrom(bd, fromIncl),
            percentValue: abs > 0 && nextDir === "increase" ? `-${absRaw}` : String(absRaw),
        };
    });

    return (
        <div className="gax-ed">
            <Seg fill v={draft.mode} on={(m) => setDraft((p) => ({ ...p, mode: m }))} o={[["amount", "Set a price"], ["percent", "Set a % change"]]} />

            {draft.mode === "amount" ? (
                <>
                    <Seg fill v={gstMode} on={changeGstMode} o={[["incl", "Incl. GST"], ["excl", "Excl. GST"]]} />
                    <div className="gax-grid">
                        {levels.map((level) => {
                            const refIncl = product.defaultBreakdown?.[LEVEL_FIELD[level]];
                            const ref = gstMode === "excl" ? fromIncl(refIncl) : refIncl;
                            return (
                                <Field key={`${level}-${gstMode}`} label={`${LEVEL_LABEL[level](product.unit)}`}>
                                    <div className="gax-inp"><span className="pre">₹</span>
                                        <input inputMode="decimal" value={draft.amounts[level] ?? ""} placeholder={ref != null ? String(round2(ref)) : ""}
                                            aria-label={`Price ${LEVEL_LABEL[level](product.unit)}`}
                                            onChange={(e) => setFromAmount(level, e.target.value.replace(/[^\d.]/g, ""))} /></div>
                                </Field>
                            );
                        })}
                    </div>
                </>
            ) : (
                <>
                    <Seg fill v={direction} on={(d) => setFromPct(d, pctAbs)} o={[["decrease", "Decrease", "ok"], ["increase", "Increase", "warn"]]} />
                    <Field cap={direction === "increase" ? "0% or more." : "Between 0% and 99%."}>
                        <div className="gax-inp">
                            <input inputMode="decimal" value={pctAbs} placeholder="e.g. 5" aria-label="Percent change"
                                onChange={(e) => {
                                    let r = e.target.value.replace(/[^\d.]/g, "");
                                    if (direction === "decrease" && Number(r) > 99) r = "99";
                                    setFromPct(direction, r);
                                }}
                                onBlur={() => { if (pctAbs !== "") setFromPct(direction, String(Number(pctAbs))); }} />
                            <span className="suf">%</span>
                        </div>
                    </Field>
                </>
            )}

            {invalid && <p className="gax-sum err">That works out to below ₹{MIN_UNIT_PRICE} per {product.unit || "unit"}.</p>}

            {preview && (
                <div className="gax-prev" style={{ gridTemplateColumns: `repeat(${levels.length}, minmax(0,1fr))` }}>
                    {levels.map((level) => (
                        <div key={level}>
                            <small>{LEVEL_LABEL[level](product.unit)}</small>
                            <s>₹{inr(product.defaultBreakdown?.[LEVEL_FIELD[level]])}</s>
                            <b className={applied < 0 ? "up" : ""}>₹{inr(preview[LEVEL_FIELD[level]])}</b>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ---------------- search ---------------- */
function BuyerSearch({ token, submissionId = null, exclude, placeholder, onPick }) {
    const [q, setQ] = useState("");
    const [res, setRes] = useState([]);
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(false);
    const timer = useRef(null);
    const excl = exclude.join("|");

    useEffect(() => {
        clearTimeout(timer.current);
        if (q.trim().length < 2) { setRes([]); setOpen(false); return undefined; }
        setBusy(true); setOpen(true);
        timer.current = setTimeout(async () => {
            const r = await searchEligibleBuyers(token, q.trim(), submissionId);
            const skip = new Set(excl ? excl.split("|") : []);
            setRes(r?.success ? r.buyers.filter((b) => !skip.has(String(b.buyer_id))) : []);
            setBusy(false);
        }, 300);
        return () => clearTimeout(timer.current);
    }, [q, token, submissionId, excl]);

    return (
        <div>
            <div className="gax-search">
                <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Search buyers" autoComplete="off" />
                {q && <button type="button" className="gax-x" aria-label="Clear search" onClick={() => { setQ(""); setOpen(false); }}>×</button>}
            </div>
            {open && (
                <div className="gax-pop"><div className="gax-list">
                    {busy ? <p className="gax-msg">Searching…</p>
                        : !res.length ? <p className="gax-msg">No matching buyers.</p>
                            : res.map((b) => (
                                <button key={b.buyer_id} type="button" className="gax-opt" onClick={() => { setQ(""); setOpen(false); onPick(b); }}>
                                    <span className="gax-av" style={{ width: 34, height: 34, borderRadius: 10 }}>{initials(b.shop_name || b.name)}</span>
                                    <span className="t"><b>{b.shop_name || b.name || "Buyer"}</b><small>{[b.phone, b.email].filter(Boolean).join(" · ") || "—"}</small></span>
                                    <span className="plus">+</span>
                                </button>
                            ))}
                </div></div>
            )}
        </div>
    );
}

/* ---------------- one buyer ---------------- */
function BuyerCard({ buyer, product, mode, open, onToggle, draft, setDraft, onClearPrice, onRemove, removeLabel, clearing, removing, unsaved, stale }) {
    const name = buyer.shopName || buyer.name || "Buyer";
    const pct = buyer.override ? percentFromCustomPrice(product.defaultPrice, buyer.effectivePrice) : null;
    const showRemove = mode === "restricted" || !buyer.override;
    return (
        <div className={`gax-card${open ? " open" : ""}`}>
            <button type="button" className="gax-ch" aria-expanded={open} onClick={onToggle}>
                <span className="gax-av">{initials(name)}</span>
                <span className="t">
                    <b>{name}{unsaved && <span className="gax-pill">Unsaved</span>}{stale && <span className="gax-pill red">Re-check price</span>}</b>
                    <small>{buyer.phone || buyer.email || "—"}</small>
                    {buyer.override && (
                        <small className={`pr${pct < 0 ? " up" : ""}`}>
                            ₹{inr(buyer.effectiveBreakdown?.perPack)}/pack · {pct >= 0 ? `${Math.round(pct)}% off` : `${Math.abs(Math.round(pct))}% up`}
                        </small>
                    )}
                </span>
                <i className="gax-cv" />
            </button>
            {open && (
                <div className="gax-cb">
                    {stale && <p className="gax-sum warn">The listing price changed after this price was set. Re-enter it to be sure it is right.</p>}
                    <BuyerPriceEditor product={product} draft={draft} setDraft={setDraft} />
                    {(buyer.override || showRemove) && (
                        <div className="gax-acts">
                            {buyer.override && (
                                <button type="button" className="gax-btn del" disabled={clearing} onClick={onClearPrice}>{clearing ? "Removing…" : "Remove custom price"}</button>
                            )}
                            {showRemove && (
                                <button type="button" className="gax-btn del" disabled={removing} onClick={onRemove}>{removing ? "Removing…" : removeLabel}</button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const Intro = () => (
    <p className="gax-sum info tracking-wide">Choose who can see this listing and give specific buyers their own price. Everyone else pays the listing price.</p>
);
const SlabNote = () => (
    <p className="gax-sum warn">A custom price switches off quantity discounts for that buyer. They pay exactly this price, however much they order.</p>
);

/* ---------------- DRAFT (create flow) ---------------- */
export function GrowBuyerAccessDraft({ token, product, value, onChange, quickBuyer = null }) {
    const [openId, setOpenId] = useState(null);
    const [drafts, setDrafts] = useState({});
    const mode = value?.mode || "public";
    const buyers = value?.buyers || [];
    const set = (patch) => onChange({ mode, buyers, ...patch });

    const onlyQuick = !!quickBuyer && mode === "restricted"
        && buyers.length === 1 && String(buyers[0].buyerId) === String(quickBuyer.buyerId);

    const showOnlyToEnquirer = () => {
        onChange({
            mode: "restricted",
            buyers: [{
                buyerId: quickBuyer.buyerId, name: quickBuyer.name || "Buyer", shopName: quickBuyer.name || "",
                phone: null, email: null, override: null,
            }],
        });
        setOpenId(null);
    };

    const openBuyer = (b) => {
        setDrafts((d) => ({ ...d, [b.buyerId]: d[b.buyerId] || (b.override ? { ...emptyDraft(), ...b.override } : emptyDraft()) }));
        setOpenId(b.buyerId);
    };
    const toggle = (b) => (openId === b.buyerId ? setOpenId(null) : openBuyer(b));

    const pick = (c) => {
        const exist = buyers.find((b) => b.buyerId === c.buyer_id);
        if (exist) { openBuyer(exist); return; }
        const nb = { buyerId: c.buyer_id, name: c.name, phone: c.phone, email: c.email, shopName: c.shop_name, override: null, ...(mode === "public" ? { pendingPricing: true } : {}) };
        set({ buyers: [...buyers, nb].sort(byName) });
        if (mode === "public") openBuyer(nb);
    };

    const update = (id, updater) => {
        const next = updater(drafts[id] || emptyDraft());
        setDrafts((d) => ({ ...d, [id]: next }));
        set({ buyers: buyers.map((b) => (b.buyerId === id ? { ...b, override: next.canonicalPrice != null ? next : null, basedOnPrice: product.defaultPrice } : b)) });
    };
    const clearPrice = (id) => {
        set({ buyers: buyers.map((b) => (b.buyerId === id ? { ...b, override: null } : b)) });
        setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
    };
    const remove = (id) => {
        set({ buyers: buyers.filter((b) => b.buyerId !== id) });
        setOpenId((x) => (x === id ? null : x));
        setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
    };

    const list = mode === "restricted" ? buyers : buyers.filter((b) => b.override || b.pendingPricing);

    return (
        <div className="gax gax-stack">
            <Intro />
            {quickBuyer && (
                onlyQuick ? (
                    <p className="gax-sum info">Only {quickBuyer.name || "the buyer who posted this enquiry"} can see this listing.</p>
                ) : (
                    <button type="button" className="gax-btn" onClick={showOnlyToEnquirer}>
                        Show only to {quickBuyer.name || "the buyer who posted this enquiry"}
                    </button>
                )
            )}
            <Field label="Who can see this listing?"><Seg fill v={mode} on={(m) => set({ mode: m })} o={MODES} /></Field>

            {mode === "restricted" && !buyers.length && (
                <p className="gax-sum err">No buyers added yet. The listing stays invisible to everyone until you add at least one.</p>
            )}

            <BuyerSearch token={token} exclude={buyers.map((b) => String(b.buyerId))}
                placeholder={mode === "restricted" ? "Search buyers to give access" : "Search a buyer to set a custom price"} onPick={pick} />

            {list.some((b) => b.override) && <SlabNote />}

            {!list.length ? (
                <p className="gax-empty">{mode === "restricted" ? "Add a buyer above to give access." : "No custom prices set yet. This step is optional."}</p>
            ) : (
                <div className="gax-cards">
                    {list.map((b) => {
                        const bd = b.override ? derivePriceBreakdown(b.override.canonicalPrice, product.packSize, product.masterPackSize) : product.defaultBreakdown;
                        const enriched = { ...b, effectivePrice: b.override?.canonicalPrice ?? product.defaultPrice, effectiveBreakdown: bd };
                        const stale = !!b.override && b.basedOnPrice != null && Math.abs(b.basedOnPrice - product.defaultPrice) > 0.005;
                        return (
                            <BuyerCard key={b.buyerId} buyer={enriched} product={product} mode={mode}
                                open={openId === b.buyerId} onToggle={() => toggle(b)}
                                draft={drafts[b.buyerId] || emptyDraft()} setDraft={(u) => update(b.buyerId, u)}
                                onClearPrice={() => clearPrice(b.buyerId)} onRemove={() => remove(b.buyerId)}
                                removeLabel={mode === "restricted" ? "Remove buyer" : "Remove"} stale={stale} />
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ---------------- LIVE (edit flow, existing APIs) ---------------- */
export const GrowBuyerAccessLive = forwardRef(function GrowBuyerAccessLive({ token, submissionId }, ref) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [removingId, setRemovingId] = useState(null);
    const [openId, setOpenId] = useState(null);
    const [drafts, setDrafts] = useState({});

    const load = useCallback((opts = {}) => {
        if (!opts.silent) setLoading(true);
        fetchListingAccess(token, submissionId).then((res) => {
            if (res?.success) { setData(res); setError(null); } else setError(res?.message || "Couldn't load buyer access.");
            if (!opts.silent) setLoading(false);
        });
    }, [token, submissionId]);
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [submissionId]);

    const openBuyer = (b) => {
        setDrafts((d) => ({ ...d, [b.buyerId]: d[b.buyerId] || (b.override ? draftFromOverride(b, data.submission) : emptyDraft()) }));
        setOpenId(b.buyerId);
    };
    const toggle = (b) => (openId === b.buyerId ? setOpenId(null) : openBuyer(b));
    const setDraftFor = (id, updater) => setDrafts((p) => ({ ...p, [id]: updater(p[id] || emptyDraft()) }));

    const changeMode = (m) => {
        const prev = data;
        setData((d) => ({ ...d, submission: { ...d.submission, visibilityMode: m } }));
        setListingVisibilityMode(token, submissionId, m).then((res) => { if (res?.success) load({ silent: true }); else setData(prev); });
    };

    const synth = (c, grant) => ({
        buyerId: c.buyer_id, name: c.name, phone: c.phone, email: c.email, shopName: c.shop_name,
        hasVisibilityGrant: grant, grantedAt: grant ? new Date().toISOString() : null, override: null,
        effectivePrice: data.submission.defaultPrice, effectiveBreakdown: data.submission.defaultBreakdown,
        ...(grant ? {} : { pendingPricing: true }),
    });

    const pick = (c) => {
        const mode = data.submission.visibilityMode;
        const exist = data.buyers.find((b) => b.buyerId === c.buyer_id);
        if (exist) { openBuyer(exist); return; }
        const prev = data;
        if (mode === "restricted") {
            setData((d) => ({ ...d, buyers: [...d.buyers, synth(c, true)].sort(byName) }));
            addListingVisibilityBuyer(token, submissionId, c.buyer_id).then((res) => { if (res?.success) load({ silent: true }); else setData(prev); });
        } else {
            const nb = synth(c, false);
            setData((d) => ({ ...d, buyers: [...d.buyers, nb].sort(byName) }));
            openBuyer(nb);
        }
    };

    const removeAccess = (id) => {
        const prev = data;
        const had = !!data.buyers.find((b) => b.buyerId === id)?.override;
        setRemovingId(id);
        setData((d) => ({ ...d, buyers: d.buyers.filter((b) => b.buyerId !== id) }));
        setOpenId((x) => (x === id ? null : x));
        setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
        const calls = [removeListingVisibilityBuyer(token, submissionId, id)];
        if (had) calls.push(deleteCustomPricingForBuyer(token, id, submissionId));
        Promise.all(calls).then((rs) => {
            setRemovingId(null);
            if (rs.every((r) => r?.success)) load({ silent: true });
            else { setData(prev); setError("Couldn't remove this buyer's access. Please try again."); }
        });
    };

    const clearPrice = (id) => {
        const prev = data;
        setDeletingId(id);
        setData((d) => ({
            ...d,
            buyers: d.buyers
                .map((b) => (b.buyerId === id ? { ...b, override: null, effectivePrice: d.submission.defaultPrice, effectiveBreakdown: d.submission.defaultBreakdown } : b))
                .filter((b) => b.buyerId !== id || b.hasVisibilityGrant),
        }));
        setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
        deleteCustomPricingForBuyer(token, id, submissionId).then((res) => {
            setDeletingId(null);
            if (res?.success) load({ silent: true }); else setData(prev);
        });
    };

    const discard = (id) => {
        setData((d) => ({ ...d, buyers: d.buyers.filter((b) => b.buyerId !== id) }));
        setOpenId((x) => (x === id ? null : x));
        setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
    };

    // Called by the sheet's Save button. Only pushes buyers whose draft price differs from what is stored.
    const flushPendingChanges = useCallback(async () => {
        const ids = Object.keys(drafts).filter((id) => {
            const d = drafts[id];
            if (!d?.canonicalPrice) return false;
            const b = data?.buyers.find((x) => String(x.buyerId) === String(id));
            return !b || b.effectivePrice !== d.canonicalPrice;
        });
        if (!ids.length) return { success: true };
        let allOk = true;
        for (const id of ids) {
            const d = drafts[id];
            const isIncrease = Number(d.canonicalPrice) > Number(data.submission.defaultPrice);
            const asFixed = d.mode === "amount" || isIncrease;
            const item = {
                submissionId, overrideType: asFixed ? "fixed" : "percent",
                value: asFixed ? d.canonicalPrice : Number(d.percentValue), inputMode: asFixed ? "fixed_price" : "percent",
            };
            const res = await saveCustomPricingForBuyer(token, data.buyers.find((x) => String(x.buyerId) === String(id))?.buyerId ?? id, [item]);
            if (res?.rejected?.length || (!res?.success && !res?.saved)) {
                allOk = false;
                setError(res?.rejected?.length
                    ? `That price would go below ₹${MIN_UNIT_PRICE}/unit for one or more buyers. Nothing was saved for them.`
                    : (res?.message || "Couldn't save one or more buyer prices."));
            }
        }
        setOpenId(null);
        load({ silent: true });
        return { success: allOk };
    }, [drafts, data, submissionId, token, load]);
    useImperativeHandle(ref, () => ({ flushPendingChanges }), [flushPendingChanges]);

    if (loading) return <div className="gax gax-load"><div className="gax-skel" /><div className="gax-skel" /></div>;
    if (error && !data) return <div className="gax"><p className="gax-sum err">{error}</p></div>;

    const mode = data.submission.visibilityMode;
    const granted = data.buyers.filter((b) => b.hasVisibilityGrant);
    const list = mode === "restricted" ? data.buyers : data.buyers.filter((b) => b.override || b.pendingPricing);

    return (
        <div className="gax gax-stack">
            <Intro />
            <SlabNote />
            <Field label="Who can see this listing?"><Seg fill v={mode} on={changeMode} o={MODES} /></Field>
            {error && <p className="gax-sum err">{error}</p>}
            {mode === "restricted" && !granted.length && (
                <p className="gax-sum err">No buyers added yet. This listing is invisible to everyone until you add at least one.</p>
            )}

            <BuyerSearch token={token} submissionId={submissionId} exclude={data.buyers.map((b) => String(b.buyerId))}
                placeholder={mode === "restricted" ? "Search buyers to give access" : "Search a buyer to set a custom price"} onPick={pick} />

            {!list.length ? (
                <p className="gax-empty">{mode === "restricted" ? "Add a buyer above to give access." : "No custom prices set for any buyer yet."}</p>
            ) : (
                <div className="gax-cards">
                    {list.map((b) => (
                        <BuyerCard key={b.buyerId} buyer={b} product={data.submission} mode={mode}
                            open={openId === b.buyerId} onToggle={() => toggle(b)}
                            draft={drafts[b.buyerId] || emptyDraft()} setDraft={(u) => setDraftFor(b.buyerId, u)}
                            onClearPrice={() => clearPrice(b.buyerId)}
                            onRemove={() => (mode === "restricted" ? removeAccess(b.buyerId) : discard(b.buyerId))}
                            removeLabel={mode === "restricted" ? "Remove access" : "Remove"}
                            clearing={deletingId === b.buyerId} removing={removingId === b.buyerId}
                            unsaved={drafts[b.buyerId]?.canonicalPrice != null && drafts[b.buyerId].canonicalPrice !== b.effectivePrice} />
                    ))}
                </div>
            )}
        </div>
    );
});

export default GrowBuyerAccessDraft;