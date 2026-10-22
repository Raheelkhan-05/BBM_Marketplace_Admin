// src/pages/GrowProductsPage.jsx — "My products" in the new UI.
// Same data and actions as SellerManageListingsPage: fetchMySellerSubmissions, live/paused switch,
// one-tap reactivate, price + promotion editor, full edit form, share, GST toggle, realtime updates.
// Rejected listings are never shown as live: they get a Rejected badge, the reason, and "Edit & resubmit".
// Bulk upload: a "Bulk upload" button, plus a banner that resumes unfinished (soft-saved) bulk products.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import { useListings } from "../context/ListingsContext.jsx";
import { shareProductLink } from "../utils/share.js";
import { useNotifications } from "../context/NotificationsContext.jsx";
import {
    updateSellerProductSubmission, setSellerSubmissionActive, refreshSellerSubmission,
} from "../utils/api.js";
import { fetchAllMySubmissions } from "../utils/sellerListingApi.js";
import { fetchBulkSummary } from "../utils/bulkApi.js";
import ImageLightbox from "../components/ImageLightbox.jsx";
import GrowEditListing from "../components/grow/GrowEditListing.jsx";
import { savePromotionPlan, saveResultMessage } from "../components/seller/listingForm/PromotionPlanModal.jsx";
import { getListingExpiry, formatTimeLeft, formatExpiryDate, validityLabel } from "../shared/listingValidity.js";
import { saleUnitLabel } from "../shared/packUnits.js";
import { resizedImageUrl } from "../utils/imageUrl.js";
import Ic from "../components/growSeller/Ic.jsx";
import { Sheet, Thumb, Empty, ListSkeleton } from "../components/growSeller/ui.jsx";
import EditPriceSheet from "../components/growSeller/EditPriceSheet.jsx";
import { useGrowSeller } from "../context/GrowSellerContext.js";
import {
    fmtQty, inr, toTitleCase, isHiddenLabel, stockState, needsRestock, packagingLabel, compactSaleUnit,
    priceRowsFor, getListingStatus, renewalHoursFor,
} from "../components/growSeller/sellerHelpers.js";

let CACHE = { token: null, items: null };

const FILTERS = [["all", "All"], ["low", "Needs restock"], ["exp", "Expired"], ["soon", "Ending soon"], ["rej", "Rejected"]];

const isRejected = (it) => it.review_status === "rejected";

function ProductCard({
    it, includeGst, nowMs, highlighted, togglingId, savingPriceId, refreshingId,
    onToggleActive, onShare, onEditPrice, onEditSection, onRenew, onOpenImage,
}) {
    const name = it.brand?.name || it.product_name || "Product";
    const brandName = it.brand?.brand_name || it.brand_name;
    const modelNo = it.model_no || it.brand?.model_no;
    const subLabel = [brandName, modelNo].filter(Boolean).join(" · ");
    const categoryLine = [isHiddenLabel(it.category_name) ? null : it.category_name, isHiddenLabel(it.subcategory_name) ? null : it.subcategory_name].filter(Boolean).join(" · ");

    const image = it.image || it.brand?.image;
    const gallery = it.images?.length ? it.images : it.brand?.images?.length ? it.brand.images : image ? [image] : [];

    const rejected = isRejected(it);
    const expiry = getListingExpiry(it, nowMs);
    const isExpired = !rejected && expiry.expired;
    const isActive = !rejected && it.is_active !== false && !isExpired; // a rejected listing is never live
    const isPending = it.review_status === "pending_review";
    const stock = it.stock_quantity;
    const sState = stockState(stock, it.moq);
    const isMTO = it.stock_type === "made_to_order";
    const compact = compactSaleUnit(saleUnitLabel(it.units_per_master_pack));
    const rows = useMemo(() => priceRowsFor(it, includeGst), [it, includeGst]);

    const renewHours = renewalHoursFor(it);
    const canRenew = it.review_status === "approved" && isExpired;
    const renewing = refreshingId === it.id;
    const status = rejected
        ? { label: "Rejected", tone: "red" }
        : canRenew ? null : getListingStatus(it, isActive, sState, isExpired);

    const leadRaw = isMTO ? (it.production_lead_time_days ?? it.lead_time) : (it.dispatch_time_days ?? it.lead_time);
    const leadNum = leadRaw != null && leadRaw !== "" && Number.isFinite(Number(leadRaw)) ? Number(leadRaw) : null;
    const days = (n) => `${n} ${n === 1 ? "day" : "days"}`;
    const lead = isMTO
        ? { label: "Production", icon: "clock", value: leadNum != null ? days(leadNum) : "—" }
        : sState === "out" ? { label: "Dispatch", icon: "clock", value: "Restock first", tone: "red" }
            : leadNum > 0 ? { label: "Dispatch", icon: "clock", value: days(leadNum) }
                : { label: "Dispatch", icon: "bolt", value: "Ready to ship", tone: "green" };

    const promo = it.marketing_commission_percent;
    const promoLegacy = !Array.isArray(it.marketing_services) || !it.marketing_services.length;
    const partial = it.visibility_mode === "restricted";
    const stockCell = isMTO ? { value: "Made to order" }
        : stock == null ? { value: "Not set" }
            : sState === "out" ? { value: "Out of stock", tone: "red" }
                : { value: `${fmtQty(stock)} ${compact}`, tone: sState === "low" ? "amber" : undefined };

    const cells = [
        { key: "stock", section: "fulfilment", label: "Stock", icon: "box", ...stockCell },
        { key: "moq", section: "packaging", label: "MOQ", icon: "tag", value: it.moq != null ? `${fmtQty(it.moq)} ${compact}` : "—" },
        { key: "lead", section: "fulfilment", ...lead },
        { key: "vis", section: "customPricing", label: "Visibility", icon: "eye", value: partial ? "Partial" : "Full", tone: partial ? "amber" : "green" },
        { key: "promo", section: "marketing", label: "Promo budget", icon: "mega", value: promo != null && promo !== "" ? `${promo}%${promoLegacy ? " · legacy" : ""}` : "—", tone: promoLegacy ? "amber" : undefined },
    ];

    const canEditPrice = !isPending && !rejected && rows.length > 0 && it.gst_percent != null;
    const showValidity = !rejected && expiry.tracked && !isExpired;

    return (
        <article className={`card${highlighted ? " hl" : ""}${!isActive ? " dim" : ""}`}>
            <div className="pr">
                <div className="in">
                    <div className="top">
                        <Thumb src={image ? resizedImageUrl(image, { width: 256 }) : null} name={name} zoom={!!gallery.length}
                            onClick={gallery.length ? () => onOpenImage({ images: gallery, index: 0, alt: name }) : undefined} />
                        <div className="in">
                            <h3>{toTitleCase(name)}</h3>
                            {subLabel && <div className="br"><i /><span>{subLabel}</span></div>}
                            {categoryLine && <small>{categoryLine}</small>}
                            <small style={{ marginTop: 4 }}>{packagingLabel(it.pack_size, it.units_per_master_pack, it.unit)}</small>
                            {status && <span className={`bge ${status.tone}`}>{status.label}</span>}
                        </div>
                    </div>
                </div>
                <div className="pb">
                    {rows.length ? rows.map((r) => <b key={r.label}>₹{inr(r.value)} <small>/{r.label}</small></b>) : <b>—</b>}
                    {canEditPrice && (
                        <button type="button" disabled={savingPriceId === it.id} onClick={() => onEditPrice(it)}>
                            {savingPriceId === it.id ? "Saving…" : "Edit price"}
                        </button>
                    )}
                </div>
            </div>

            {rejected && (
                <div className="rej">
                    <p className="tracking-wide" style={{ display: "block" }}>Rejected, not visible to buyers</p>
                    {it.rejection_reason || "Update the listing and submit it again for review."}
                </div>
            )}

            {canRenew && (
                <div className="ex">
                    <div><b>Listing expired</b><small>{it.expires_at ? `Hidden from buyers since ${formatExpiryDate(it.expires_at)}` : "Hidden from buyers"}</small></div>
                    <button className="bt go sm" type="button" disabled={renewing} aria-busy={renewing}
                        aria-label={`Reactivate ${toTitleCase(name)} for ${validityLabel(renewHours)}`} onClick={() => onRenew(it, renewHours)}>
                        <Ic n={renewing ? "spin" : "repeat"} />{renewing ? "Reactivating…" : `Reactivate · ${validityLabel(renewHours)}`}
                    </button>
                </div>
            )}

            <div className="sg">
                {cells.map((c) => (
                    <button key={c.key} type="button" className="sc" aria-label={`Edit ${c.label}`} onClick={() => onEditSection(it.id, c.section)}>
                        <small><Ic n={c.icon} />{c.label}</small>
                        <b className={c.tone ? `tn-${c.tone}` : ""}>{c.value}</b>
                    </button>
                ))}
            </div>

            {showValidity && (
                <div className={`lu${expiry.expiringSoon ? " w" : ""}`} aria-live="polite">
                    <Ic n="clock" />Live until {formatExpiryDate(it.expires_at)} · {formatTimeLeft(expiry.msLeft)} left
                </div>
            )}

            <div className="pf">
                {rejected ? (
                    <button className="bt go sm" type="button" onClick={() => onEditSection(it.id, null)}><Ic n="edit" />Edit &amp; resubmit</button>
                ) : (
                    <>
                        <button className="bt sm" type="button" onClick={() => onShare(it)}><Ic n="share" />Share</button>
                        <button className="bt sm" type="button" onClick={() => onEditSection(it.id, null)}>Edit details <Ic n="chev" /></button>
                    </>
                )}
                {!isPending && !isExpired && !rejected && (
                    <button className="sw push" type="button" role="switch" aria-checked={isActive} disabled={togglingId === it.id}
                        aria-label={`Listing ${isActive ? "live" : "paused"}`} onClick={() => onToggleActive(it.id, !isActive)}>
                        {togglingId === it.id ? "…" : isActive ? "Live" : "Paused"}<i />
                    </button>
                )}
            </div>
        </article>
    );
}

export default function GrowProductsPage() {
    const { token, profile, registerResyncHandler } = useAuth();
    const { socket } = useSocket();
    const nav = useNavigate();
    const location = useLocation();
    const { say, setBadge } = useGrowSeller();
    const { reportRestockCount, markListingsViewed } = useListings();
    // Remember this page so Cancel in the Add Product flow brings the seller back here (keeps the active filter).
    const addProduct = () => nav("/grow?start=1", { state: { from: location.pathname + location.search } });

    const warm = CACHE.token === token && CACHE.items;
    const [items, setItems] = useState(() => (warm ? CACHE.items : []));
    const [loading, setLoading] = useState(!warm);
    const [query, setQuery] = useState("");
    const [pf, setPf] = useState(() => (new URLSearchParams(location.search).get("filter") === "expired" ? "exp" : "all"));
    const [includeGst, setIncludeGst] = useState(true);
    const [togglingId, setTogglingId] = useState(null);
    const [savingPriceId, setSavingPriceId] = useState(null);
    const [refreshingId, setRefreshingId] = useState(null);
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [highlighted, setHighlighted] = useState(() => new Set());
    const [edit, setEdit] = useState(null);      // { id, section }
    const [priceFor, setPriceFor] = useState(null);
    const [lightbox, setLightbox] = useState(null);
    const [bulkPending, setBulkPending] = useState(0); // unfinished bulk-upload products waiting to be submitted

    const { listingApprovalUnreadCount, listingRejectionUnreadCount } = useNotifications();
    const unreadListingNotifs = (listingApprovalUnreadCount || 0) + (listingRejectionUnreadCount || 0);

    useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 60000); return () => clearInterval(t); }, []);

    useEffect(() => {
        if (!token) return undefined;
        let live = true;
        fetchBulkSummary(token).then((r) => { if (live && r?.success) setBulkPending(r.pending || 0); });
        return () => { live = false; };
    }, [token]);

    const reloadSeq = useRef(0);
    const reload = useCallback(() => {
        if (!token) return;
        const seq = ++reloadSeq.current; // an older, slower reload must never overwrite a newer one
        const apply = (list) => {
            if (seq !== reloadSeq.current) return;
            CACHE = { token, items: list };
            setItems(list);
        };
        fetchAllMySubmissions(token, { onFirstPage: (first) => { apply(first); setLoading(false); } }).then((res) => {
            if (res?.success) apply(res.items);
            if (seq === reloadSeq.current) setLoading(false);
        });
    }, [token]);

    useEffect(() => { reload(); }, [reload]);
    useEffect(() => {
        if (!socket) return undefined;
        let t;
        const onChange = () => { clearTimeout(t); t = setTimeout(reload, 800); }; // many events in a row -> one reload
        socket.on("submissions_changed", onChange);
        return () => { clearTimeout(t); socket.off("submissions_changed", onChange); };
    }, [socket, reload]);
    useEffect(() => registerResyncHandler?.(() => { setNowMs(Date.now()); reload(); }), [registerResyncHandler, reload]);

    // Highlight records and bring the first one into view.
    const flash = useCallback((ids) => {
        if (!ids.length) return;
        const strs = ids.map(String);
        setHighlighted((prev) => new Set([...prev, ...strs]));
        setTimeout(() => document.querySelector(".card.hl")?.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
        setTimeout(() => setHighlighted((prev) => {
            const next = new Set(prev); strs.forEach((i) => next.delete(i)); return next;
        }), 6000);
    }, []);

    // 1) Approved / rejected listings that raised a notification: re-runs when they arrive,
    //    so it also works right after a fresh page load.
    useEffect(() => {
        if (!unreadListingNotifs) return;
        markListingsViewed?.().then((ids) => flash(ids || []));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [unreadListingNotifs]);

    // 2) Items that need restock (the other part of the badge): once, after the list has loaded.
    const restockFlashed = useRef(false);
    useEffect(() => {
        if (loading || restockFlashed.current) return;
        restockFlashed.current = true;
        flash(items.filter(needsRestock).map((it) => it.id));
    }, [loading, items, flash]);

    // A rejected listing is never live, expired, ending soon or in need of restocking.
    const stats = useMemo(() => {
        const exp = (it) => (isRejected(it) ? { expired: false, tracked: false, expiringSoon: false } : getListingExpiry(it, nowMs));
        const active = items.filter((it) => !isRejected(it));
        return {
            total: items.length,
            live: items.filter((it) => it.is_active !== false && it.review_status === "approved" && !exp(it).expired).length,
            expired: items.filter((it) => exp(it).expired).length,
            low: active.filter((it) => stockState(it.stock_quantity, it.moq) === "low").length,
            out: active.filter((it) => stockState(it.stock_quantity, it.moq) === "out").length,
            soon: items.filter((it) => { const e = exp(it); return !e.expired && e.tracked && e.expiringSoon; }).length,
            rejected: items.filter(isRejected).length,
        };
    }, [items, nowMs]);

    useEffect(() => { setBadge("prod", stats.expired + stats.rejected); }, [stats.expired, stats.rejected, setBadge]);
    // useEffect(() => { reportRestockCount?.(stats.low + stats.out); }, [stats.low, stats.out, reportRestockCount]);
    useEffect(() => {
        if (loading) return; // don't report "0" while the list is still empty
        reportRestockCount?.(stats.low + stats.out);
    }, [loading, stats.low, stats.out, reportRestockCount]);

    const counts = { all: stats.total, low: stats.low + stats.out, exp: stats.expired, soon: stats.soon, rej: stats.rejected };

    const filtered = useMemo(() => {
        let list = items;
        const expired = (it) => !isRejected(it) && getListingExpiry(it, nowMs).expired;
        if (pf === "low") list = list.filter((it) => !isRejected(it) && ["low", "out"].includes(stockState(it.stock_quantity, it.moq)));
        else if (pf === "exp") list = list.filter(expired);
        else if (pf === "soon") list = list.filter((it) => { if (isRejected(it)) return false; const e = getListingExpiry(it, nowMs); return !e.expired && e.tracked && e.expiringSoon; });
        else if (pf === "rej") list = list.filter(isRejected);
        const term = query.trim().toLowerCase();
        if (term) {
            list = list.filter((it) => {
                const n = (it.brand?.name || it.product_name || "").toLowerCase();
                const b = (it.brand?.brand_name || it.brand_name || "").toLowerCase();
                return n.includes(term) || b.includes(term);
            });
        }
        return list;
    }, [items, pf, query, nowMs]);

    const patchItem = (id, patch) => setItems((prev) => {
        const next = prev.map((it) => (it.id === id ? { ...it, ...patch } : it));
        CACHE = { token, items: next };
        return next;
    });

    async function handleShare(it) {
        const name = it.brand?.name || it.product_name || "Product";
        const sellerName = profile?.shop_name || profile?.name || "this seller";
        const result = await shareProductLink({ submissionId: it.id, productName: name, sellerName });
        if (result === "copied") say("Link copied to clipboard.");
    }

    // Optimistic: the switch flips at once and rolls back if the server refuses.
    async function setActive(id, active) {
        const before = items.find((x) => x.id === id);
        setTogglingId(id);
        patchItem(id, { is_active: active });
        const res = await setSellerSubmissionActive(token, id, active);
        setTogglingId(null);
        if (res?.success) { patchItem(id, res.submission); say(active ? "Listing is live" : "Listing paused"); }
        else { patchItem(id, { is_active: before?.is_active }); say(res?.message || "Couldn't update the listing. Try again."); }
    }

    async function handleSavePrice(it, { basePrice, priceBasis, finalInclusive, priceChanged, promotionServices }) {
        setSavingPriceId(it.id);
        let priceOk = null, promoOk = null, failMsg = null;
        if (priceChanged) {
            const prev = { price: it.price, base_price: it.base_price };
            patchItem(it.id, { price: finalInclusive, base_price: basePrice });
            let res = null;
            try { res = await updateSellerProductSubmission(token, it.id, { basePrice: String(basePrice), priceBasis, gstInclusive: false }); } catch { res = null; }
            priceOk = !!res?.success;
            if (!priceOk) { patchItem(it.id, prev); failMsg = res?.message || "Couldn't update the price. Try again."; }
        }
        if (promotionServices) {
            const r = await savePromotionPlan(token, it.id, promotionServices);
            promoOk = r.ok;
            if (r.ok) patchItem(it.id, r.patch); else failMsg = failMsg || r.message || "Couldn't update the promotion. Try again.";
        }
        setSavingPriceId(null);
        const msg = saveResultMessage({ priceOk, promoOk, failMsg });
        if (msg) say(msg);
        if (priceOk || promoOk) reload();
    }

    async function handleRenew(it, hours) {
        if (refreshingId) return;
        setRefreshingId(it.id);
        let res = null;
        try { res = await refreshSellerSubmission(token, it.id, hours); } catch { res = null; }
        setRefreshingId(null);
        if (res?.success && res.submission) {
            patchItem(it.id, res.submission);
            setNowMs(Date.now());
            say(`Listing renewed. Live until ${formatExpiryDate(res.submission.expires_at)}.`);
            reload();
        } else say(res?.message || "Couldn't renew the listing. Try again.");
    }

    // Saving a rejected listing resubmits it: only claim that when the server actually moved it to review.
    const handleEditSaved = (id, submission, message) => {
        const wasRejected = isRejected(items.find((x) => x.id === id) || {});
        patchItem(id, submission);
        setEdit(null);
        if (wasRejected && submission?.review_status === "pending_review") {
            say("Resubmitted for review. We will let you know once it is approved.");
            if (pf === "rej") setPf("all");
        } else say(message);
        reload();
    };

    const editing = edit ? items.find((x) => x.id === edit.id) : null;

    return (
        <div className="v">

            <div className="sh products-header" style={{ marginTop: 22 }}>
                <div className="products-heading">
                    <h2 className="h2">My products</h2>
                    <p className="sub2">
                        {stats.total} listing{stats.total === 1 ? "" : "s"} · {stats.live} live
                        {stats.expired > 0 && (
                            <> · <span style={{ color: "var(--red)" }}>{stats.expired} expired</span></>
                        )}
                        {stats.rejected > 0 && (
                            <> · <span style={{ color: "var(--red)" }}>{stats.rejected} rejected</span></>
                        )}
                    </p>
                </div>

                <div className="products-actions">
                    <button className="bt" type="button" onClick={() => nav("/grow/bulk")}>
                        Bulk upload
                    </button>
                    <button className="bt go" type="button" onClick={addProduct}>
                        <Ic n="plus" /> Add product
                    </button>
                </div>
            </div>


            {bulkPending > 0 && (
                <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "12px 16px", marginBottom: 12 }}>
                    <div>
                        <b>{bulkPending} product{bulkPending === 1 ? "" : "s"} waiting from your bulk upload</b>
                        <small style={{ display: "block", opacity: 0.7 }}>Saved automatically. Add photos, confirm and submit them one by one.</small>
                    </div>
                    <button className="bt go sm" type="button" onClick={() => nav("/grow/bulk?resume=1")}>Continue bulk upload</button>
                </div>
            )}

            <label className="srch" style={{ marginBottom: 12 }}>
                <Ic n="search" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by product or brand" aria-label="Search your listings" />
                {query && <button type="button" className="clr" aria-label="Clear search" onClick={() => setQuery("")}><Ic n="x" /></button>}
            </label>

            <div className="fl">
                <div className="chs">
                    {FILTERS.filter(([k]) => k !== "rej" || counts.rej > 0 || pf === "rej").map(([k, l]) => (
                        <button key={k} type="button" aria-pressed={pf === k} onClick={() => setPf(k)}>{l}<em>{counts[k]}</em></button>
                    ))}
                    <button type="button" aria-pressed={false} onClick={() => nav("/seller/marketing")}>Marketing</button>
                </div>
                <button className="sw gst" type="button" role="switch" aria-checked={includeGst} aria-label={`GST ${includeGst ? "included" : "excluded"}`} onClick={() => setIncludeGst((v) => !v)}>
                    GST<i />
                </button>
            </div>

            {loading && !items.length ? <ListSkeleton n={4} tall /> : (
                <div className="grid c2">
                    {filtered.map((it) => (
                        <ProductCard key={it.id} it={it} includeGst={includeGst} nowMs={nowMs}
                            highlighted={highlighted.has(String(it.id))} togglingId={togglingId} savingPriceId={savingPriceId} refreshingId={refreshingId}
                            onToggleActive={setActive} onShare={handleShare}
                            onEditPrice={setPriceFor} onEditSection={(id, section) => setEdit({ id, section })}
                            onRenew={handleRenew} onOpenImage={setLightbox} />
                    ))}
                    {!filtered.length && (
                        <Empty title={items.length === 0 ? "You have not listed anything yet" : "Nothing here"}
                            text={items.length === 0 ? "List your first product to start selling." : "No listings match this filter."}>
                            {items.length === 0 && (<><br /><button className="bt go" type="button" onClick={addProduct}><Ic n="plus" />Add product</button></>)}
                        </Empty>
                    )}
                </div>
            )}

            {edit && editing && (
                <Sheet bare wide onClose={() => setEdit(null)}>
                    <GrowEditListing token={token} submissionId={edit.id} key={`${edit.id}-${edit.section || "all"}`}
                        focusSection={edit.section} onClose={() => setEdit(null)} onSaved={handleEditSaved} />
                </Sheet>
            )}
            {priceFor && (
                <EditPriceSheet it={items.find((x) => x.id === priceFor.id) || priceFor} includeGst={includeGst} token={token}
                    onClose={() => setPriceFor(null)} onApply={(payload) => { const it = priceFor; setPriceFor(null); handleSavePrice(it, payload); }} />
            )}
            {lightbox && createPortal(
                <ImageLightbox images={lightbox.images} initialIndex={lightbox.index} alt={lightbox.alt} onClose={() => setLightbox(null)} />,
                document.body
            )}
        </div>
    );
}