// src/components/grow/GrowCustomerPricing.jsx
// Per-BUYER custom pricing across MANY products, opened from the Customers page.
// (Replaces the deprecated chat-module CustomPricingModal. Same APIs, same shared/customPricing.js math,
//  same editor and look as GrowBuyerAccess, which is the per-PRODUCT, many-buyers view.)
//
// Flow: product list (search, All / Custom tabs) -> tap a product to edit its price -> bulk % on selected
// products if wanted -> one "Save" at the bottom. Removing a custom price is immediate, like in GrowBuyerAccessLive.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { fetchCustomPricing, saveCustomPricing, bulkClearCustomPricing } from "../../utils/api.js";
import { derivePriceBreakdown, percentFromCustomPrice, violatesMinUnitPrice, MIN_UNIT_PRICE } from "../../../shared/customPricing.js";
import { Seg, BuyerPriceEditor, emptyDraft } from "./GrowBuyerAccess.jsx";
import "./grow-access.css";
import "./grow-customer-pricing.css"; // keep AFTER grow-access.css

const inr = (n) => (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

// Draft for a product that already has a custom price (same shape GrowBuyerAccessLive builds).
function draftFromRow(row) {
    if (!row.override) return emptyDraft();
    const canonical = row.effectivePrice;
    const bd = row.effectiveBreakdown || {};
    const pct = percentFromCustomPrice(row.defaultPrice, canonical);
    return {
        mode: "amount", gstMode: "incl", canonicalPrice: canonical,
        percentValue: String(pct), percentDirection: pct < 0 ? "increase" : "decrease",
        amounts: { unit: String(bd.perBaseUnit ?? ""), pack: String(bd.perPack ?? ""), master_pack: bd.perMasterPack != null ? String(bd.perMasterPack) : "" },
    };
}

const isInvalid = (row, d) => d?.canonicalPrice != null
    && (!(d.canonicalPrice > 0) || violatesMinUnitPrice(d.canonicalPrice, row.packSize, row.masterPackSize));
// a draft only counts as a change when it differs from what is stored
const isDirty = (row, d) => d?.canonicalPrice != null && (!row.override || d.canonicalPrice !== row.effectivePrice);

export default function GrowCustomerPricing({ open, onClose, token, buyerId, buyerLabel = "this customer", say }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [query, setQuery] = useState("");
    const [tab, setTab] = useState("all");
    const [openId, setOpenId] = useState(null);
    const [drafts, setDrafts] = useState({});
    const [selected, setSelected] = useState(() => new Set());
    const [bulkDir, setBulkDir] = useState("decrease");
    const [bulkPct, setBulkPct] = useState("");
    const [bulkSkipped, setBulkSkipped] = useState(0);
    const [saving, setSaving] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [warning, setWarning] = useState(null);

    const load = useCallback(async (silent = false) => {
        if (!buyerId) return;
        if (!silent) { setLoading(true); setError(null); }
        try {
            const res = await fetchCustomPricing(token, buyerId);
            if (res?.success) { setRows(res.items || []); setError(null); }
            else setError(res?.message || "Couldn't load the products.");
        } catch { setError("Network problem. Please try again."); }
        if (!silent) setLoading(false);
    }, [token, buyerId]);

    // fresh state every time the sheet opens
    useEffect(() => {
        if (!open) return;
        setRows([]); setQuery(""); setTab("all"); setOpenId(null); setDrafts({}); setSelected(new Set());
        setBulkDir("decrease"); setBulkPct(""); setBulkSkipped(0); setWarning(null);
        load();
    }, [open, load]);

    const rowById = useMemo(() => Object.fromEntries(rows.map((r) => [r.submissionId, r])), [rows]);
    const dirtyRows = useMemo(() => rows.filter((r) => isDirty(r, drafts[r.submissionId])), [rows, drafts]);
    const anyInvalid = dirtyRows.some((r) => isInvalid(r, drafts[r.submissionId]));
    const customCount = rows.filter((r) => r.override).length;

    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
        if (tab === "custom" && !r.override) return false;
        if (q && !r.name?.toLowerCase().includes(q) && !r.brandName?.toLowerCase().includes(q)) return false;
        return true;
    });
    const filteredIds = filtered.map((r) => r.submissionId);
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

    const requestClose = useCallback(() => {
        if (dirtyRows.length && !window.confirm("Discard your unsaved price changes?")) return;
        onClose();
    }, [dirtyRows.length, onClose]);

    // Esc closes, and the page behind doesn't scroll while the sheet is open
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === "Escape") requestClose(); };
        document.addEventListener("keydown", onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
    }, [open, requestClose]);

    const setDraftFor = (id, updater) => setDrafts((p) => ({ ...p, [id]: updater(p[id] || emptyDraft()) }));
    const dropDraft = (id) => setDrafts((p) => { const n = { ...p }; delete n[id]; return n; });

    const toggleOpen = (row) => {
        if (openId === row.submissionId) { setOpenId(null); return; }
        setDrafts((d) => (d[row.submissionId] ? d : { ...d, [row.submissionId]: draftFromRow(row) }));
        setOpenId(row.submissionId);
    };

    const toggleSelect = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const toggleSelectAll = () => setSelected((s) => {
        const n = new Set(s);
        filteredIds.forEach((id) => (allSelected ? n.delete(id) : n.add(id)));
        return n;
    });

    // ---- bulk % on the selected products (sets drafts only, nothing is saved until "Save") ----
    const applyBulk = () => {
        let abs = Math.abs(Number(bulkPct));
        if (!Number.isFinite(abs) || abs <= 0) return;
        if (bulkDir === "decrease" && abs > 99) abs = 99;
        const pct = bulkDir === "increase" ? -abs : abs;
        let skipped = 0;
        const next = {};
        [...selected].forEach((id) => {
            const row = rowById[id];
            if (!row) return;
            const canonical = Math.round(row.defaultPrice * (1 - pct / 100) * 100) / 100;
            if (!(canonical > 0) || violatesMinUnitPrice(canonical, row.packSize, row.masterPackSize)) { skipped += 1; return; } // never silently write a bad price
            const bd = derivePriceBreakdown(canonical, row.packSize, row.masterPackSize);
            next[id] = {
                mode: "percent", gstMode: "incl", canonicalPrice: canonical, percentValue: String(pct), percentDirection: bulkDir,
                amounts: { unit: String(bd.perBaseUnit ?? ""), pack: String(bd.perPack ?? ""), master_pack: bd.perMasterPack != null ? String(bd.perMasterPack) : "" },
            };
        });
        setDrafts((p) => ({ ...p, ...next }));
        setBulkSkipped(skipped);
        setWarning(null);
    };

    // ---- removing custom prices (immediate, like GrowBuyerAccessLive) ----
    const clearPrices = async (ids, okMsg) => {
        setClearing(true);
        let res;
        try { res = await bulkClearCustomPricing(token, buyerId, ids); } catch { res = { success: false }; }
        setClearing(false);
        if (res?.success === false) say?.(res.message || "Couldn't remove the custom prices. Please try again.");
        else say?.(okMsg);
        if (ids) ids.forEach(dropDraft); else setDrafts({});
        setSelected(new Set());
        setOpenId(null);
        await load(true);
    };
    const clearOne = (row) => clearPrices([row.submissionId], "Custom price removed.");
    const clearSelected = () => {
        const ids = [...selected].filter((id) => rowById[id]?.override);
        if (!ids.length) { say?.("None of the selected products have a custom price."); return; }
        clearPrices(ids, "Custom prices removed.");
    };
    const clearAll = () => {
        if (!window.confirm(`Remove all custom prices for ${buyerLabel}?`)) return;
        clearPrices(undefined, "All custom prices removed.");
    };

    // ---- save ----
    const save = async () => {
        if (!dirtyRows.length || anyInvalid) return;
        // same rule as GrowBuyerAccessLive: typed amounts and increases are stored as fixed prices, discounts typed as % as percent
        const items = dirtyRows.map((row) => {
            const d = drafts[row.submissionId];
            const asFixed = d.mode === "amount" || Number(d.canonicalPrice) > Number(row.defaultPrice);
            return {
                submissionId: row.submissionId,
                overrideType: asFixed ? "fixed" : "percent",
                value: asFixed ? d.canonicalPrice : Number(d.percentValue),
                inputMode: asFixed ? "fixed_price" : "percent",
            };
        });
        setSaving(true);
        let res;
        try { res = await saveCustomPricing(token, buyerId, items); } catch { res = { success: false, message: "Network problem. Please try again." }; }
        setSaving(false);
        if (res?.rejected?.length) {
            setWarning(`${res.rejected.length} product${res.rejected.length === 1 ? "" : "s"} couldn't be saved. The price would go below ₹${MIN_UNIT_PRICE} per unit.`);
        } else if (res?.success === false && !res?.saved) {
            setWarning(res.message || "Couldn't save the prices. Please try again.");
            return; // keep the drafts so nothing typed is lost
        } else {
            setWarning(null);
            say?.(`Custom price${items.length === 1 ? "" : "s"} saved.`);
        }
        setDrafts({}); setOpenId(null); setSelected(new Set()); setBulkSkipped(0);
        await load(true);
    };

    if (!open || typeof document === "undefined") return null;

    // Portal to <body>: the seller layout's sticky header + GrowTabs live in their own stacking context,
    // so a fixed layer rendered inside the page can end up underneath them.
    return createPortal(
        <div className="gcp-ov" onClick={requestClose} role="presentation">
            <div className="gax gcp" role="dialog" aria-modal="true" aria-label={`Custom pricing for ${buyerLabel}`} onClick={(e) => e.stopPropagation()}>
                <div className="gax-eh">
                    <div>
                        <p>{buyerLabel}</p>
                        <h3>Custom pricing</h3>
                    </div>
                    <button type="button" className="gax-x" aria-label="Close" onClick={requestClose}>×</button>
                </div>

                <div className="gax-eb">
                    {loading ? (
                        <div className="gax-load"><div className="gax-skel" /><div className="gax-skel" /><div className="gax-skel" /></div>
                    ) : error ? (
                        <div className="gax-stack">
                            <p className="gax-sum err">{error}</p>
                            <button type="button" className="gax-btn" onClick={() => load()}>Try again</button>
                        </div>
                    ) : (
                        <div className="gax-stack">
                            <p className="gax-sum info">Set prices just for {buyerLabel}. Every other buyer keeps the listing price. {customCount} of {rows.length} product{rows.length === 1 ? "" : "s"} custom priced.</p>
                            <p className="gax-sum warn">A custom price switches off quantity discounts for this buyer on that product. They pay exactly this price, however much they order.</p>

                            <div className="gax-search">
                                <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" aria-label="Search products" autoComplete="off" />
                                {query && <button type="button" className="gax-x" aria-label="Clear search" onClick={() => setQuery("")}>×</button>}
                            </div>

                            <Seg fill v={tab} on={setTab} o={[["all", `All (${rows.length})`], ["custom", `Custom (${customCount})`]]} />

                            {(filteredIds.length > 0 || customCount > 0) && (
                                <div className="gcp-tools">
                                    {filteredIds.length > 0 && (
                                        <label className="gcp-sa">
                                            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                                            {allSelected ? "Deselect all" : "Select all"}
                                        </label>
                                    )}
                                    {customCount > 0 && (
                                        <button type="button" className="gax-btn del" disabled={clearing} onClick={clearAll}>Remove all custom prices</button>
                                    )}
                                </div>
                            )}

                            {selected.size > 0 && (
                                <div className="gcp-bulk">
                                    <div className="gcp-bt">
                                        <b>{selected.size} selected</b>
                                        <button type="button" className="gcp-link" onClick={() => setSelected(new Set())}>Clear selection</button>
                                    </div>
                                    <Seg fill v={bulkDir} on={setBulkDir} o={[["decrease", "Decrease", "ok"], ["increase", "Increase", "warn"]]} />
                                    <div className="gcp-bi">
                                        <div className="gax-inp">
                                            <input inputMode="decimal" value={bulkPct} placeholder="e.g. 10" aria-label="Percent for all selected"
                                                onChange={(e) => setBulkPct(e.target.value.replace(/[^\d.]/g, ""))} />
                                            <span className="suf">%</span>
                                        </div>
                                        <button type="button" className="gax-btn" disabled={!(Number(bulkPct) > 0)} onClick={applyBulk}>Apply</button>
                                    </div>
                                    <p className="gax-cap">Fills in the selected products below. Nothing is saved until you press Save.</p>
                                    <button type="button" className="gax-btn del" disabled={clearing} onClick={clearSelected}>Remove their custom prices</button>
                                </div>
                            )}

                            {bulkSkipped > 0 && (
                                <p className="gax-sum warn">Skipped {bulkSkipped} product{bulkSkipped === 1 ? "" : "s"}. That percentage would take {bulkSkipped === 1 ? "it" : "them"} below ₹{MIN_UNIT_PRICE} per unit. Set {bulkSkipped === 1 ? "it" : "those"} individually.</p>
                            )}
                            {warning && (
                                <p className="gax-sum warn">
                                    <span style={{ flex: 1 }}>{warning}</span>
                                    <button type="button" className="gcp-link" onClick={() => setWarning(null)}>Dismiss</button>
                                </p>
                            )}

                            {filtered.length === 0 ? (
                                <p className="gax-empty">{rows.length === 0 ? "You have no live products to price yet." : tab === "custom" && !q ? "No custom prices set for this buyer yet." : "No products match."}</p>
                            ) : (
                                <div className="gax-cards">
                                    {filtered.map((row) => {
                                        const id = row.submissionId;
                                        const isOpen = openId === id;
                                        const draft = drafts[id] || emptyDraft();
                                        const dirty = isDirty(row, drafts[id]);
                                        const bad = dirty && isInvalid(row, drafts[id]);
                                        const pct = row.override ? percentFromCustomPrice(row.defaultPrice, row.effectivePrice) : null;
                                        return (
                                            <div key={id} className={`gax-card${isOpen ? " open" : ""}`}>
                                                <div className="gcp-rowh">
                                                    <label className="gcp-ck" aria-label={`Select ${row.name}`}>
                                                        <input type="checkbox" checked={selected.has(id)} onChange={() => toggleSelect(id)} />
                                                    </label>
                                                    <button type="button" className="gax-ch" aria-expanded={isOpen} onClick={() => toggleOpen(row)}>
                                                        <span className="gcp-th">{row.image ? <img src={row.image} alt="" /> : (row.name || "?").trim()[0]?.toUpperCase()}</span>
                                                        <span className="t">
                                                            <b>{row.name}{dirty && !bad && <span className="gax-pill">Unsaved</span>}{bad && <span className="gax-pill red">Below minimum</span>}</b>
                                                            {row.brandName && <small>{row.brandName}</small>}
                                                            {row.override ? (
                                                                <small className={`pr${pct < 0 ? " up" : ""}`}>
                                                                    ₹{inr(row.effectiveBreakdown?.perPack)}/pack · {pct >= 0 ? `${Math.round(pct)}% off` : `${Math.abs(Math.round(pct))}% up`}
                                                                </small>
                                                            ) : (
                                                                <small>
                                                                    ₹{inr(row.defaultBreakdown?.perPack)}/pack
                                                                    {row.hasMasterPack ? ` · ₹${inr(row.defaultBreakdown?.perMasterPack)}/master pack` : ""}
                                                                </small>
                                                            )}
                                                        </span>
                                                        <i className="gax-cv" />
                                                    </button>
                                                </div>
                                                {isOpen && (
                                                    <div className="gax-cb">
                                                        {row.override && (
                                                            <p className="gax-sum info">Listing price ₹{inr(row.defaultBreakdown?.perPack)}/pack. {buyerLabel} currently pays ₹{inr(row.effectiveBreakdown?.perPack)}/pack.</p>
                                                        )}
                                                        <BuyerPriceEditor product={row} draft={draft} setDraft={(u) => setDraftFor(id, u)} />
                                                        {(dirty || row.override) && (
                                                            <div className="gax-acts">
                                                                {dirty && (
                                                                    <button type="button" className="gax-btn" onClick={() => setDrafts((p) => ({ ...p, [id]: draftFromRow(row) }))}>Discard changes</button>
                                                                )}
                                                                {row.override && (
                                                                    <button type="button" className="gax-btn del" disabled={clearing} onClick={() => clearOne(row)}>{clearing ? "Removing…" : "Remove custom price"}</button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="gax-ef">
                    {dirtyRows.length > 0 ? (
                        <>
                            <button type="button" className="gax-gh" disabled={saving} onClick={() => { setDrafts({}); setOpenId(null); setBulkSkipped(0); }}>Discard</button>
                            <button type="button" className="gax-go" disabled={saving || anyInvalid} onClick={save}>
                                {saving ? "Saving…" : anyInvalid ? `Fix prices below ₹${MIN_UNIT_PRICE} first` : `Save ${dirtyRows.length} change${dirtyRows.length === 1 ? "" : "s"}`}
                            </button>
                        </>
                    ) : (
                        <button type="button" className="gax-gh" onClick={requestClose}>Done</button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}