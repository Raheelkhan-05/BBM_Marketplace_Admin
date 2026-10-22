// src/pages/SaveHomePage.jsx — buyer home for logged-in users (route: /save, via SaveEntry).
// Same backend as the old RFQ page: fetchRfqList / closeRfq, plus the existing post, edit and bulk-upload flows.
// Layout mirrors GrowEnquiriesPage: greeting, summary tiles, quick links, then the searchable list of cards.
// Quotes are real now: every row carries the quotes sellers sent (item.quotes / item.quotesCount from the API), and the
// page refreshes itself when a quote arrives (socket event, focus, light poll) - no manual refresh needed.
// Each row shows ONE quantity: the total in the individual unit (e.g. 500 Kg), not packs x pack size.
// Quote prices are shown per individual unit too (e.g. ₹2.47 / Kg), with the total for the buyer's quantity below.
// The product image on each row opens full screen (ImageLightbox) when tapped.
//
// Delivery autofill: the page is wrapped in BuyerAddressProvider (safe to nest), so the wizard can always read the
// buyer's saved address from BuyerAddressContext and prefill the delivery location by itself.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
    Send, ArrowRight, Upload, Share2, Pencil, XCircle, Search, X, ShoppingCart, Package, ChevronRight,
    ChevronDown, Info, ExternalLink, MapPin, Clock, Truck,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { BuyerAddressProvider } from "../context/BuyerAddressContext.jsx";
import useInfiniteScrollSentinel from "../hooks/useInfiniteScrollSentinel";
import { inr as inrFmt, etaText, validText } from "../utils/rfqQuoteFmt.js";
import useRfqLive from "../hooks/useRfqLive.js";
import RfqBulkUploadModal from "../components/rfq/RfqBulkUploadModal.jsx";
import SavePostWizard from "../components/save/SavePostWizard.jsx";
import SaveEnquiryInfoModal, { STATUS_LABEL } from "../components/save/SaveEnquiryInfoModal.jsx";
import ImageLightbox from "../components/ImageLightbox.jsx";
import { fetchRfqList, closeRfq } from "../utils/rfqApi.js";
import { fmtNum, timeAgo } from "../utils/rfqUtils.js";
import { shareEnquiry, enquiryPath } from "../utils/rfqShare.js";
import { MENU_ROUTES } from "../components/menuItems.js";

const PAGE = 12;
const MAX_PAGE = 30; // server cap
const FILTERS = [
    ["", "All"], ["pending_review", "In review"], ["approved", "Live"], ["rejected", "Needs changes"], ["closed", "Closed"],
];

const mergeUnique = (prev, incoming) => {
    const seen = new Set(prev.map((i) => i.id));
    return [...prev, ...incoming.filter((i) => !seen.has(i.id))];
};
const CACHE = new Map();

const EASE = [0.16, 1, 0.3, 1];
const toTitle = (str = "") => str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const inr = (n) => (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
// A price per single unit can be small (e.g. ₹2.4691), so up to 4 decimals are kept, at least 2 are shown.
const inrUnit = (n) => "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");

// Quotes for one enquiry, as sent by the API (rfq.controller attaches them to the buyer's own rows):
//   item.quotes      -> [{ id, sellerName, city, state, productName, brandName, price (per pack), total, moq,
//                          deliveryDays, freightIncluded, validUntil }]  (cheapest first)
//   item.quotesCount -> number of live quotes
const quotesOf = (item) => (Array.isArray(item.quotes) ? item.quotes : []);
const quoteCountOf = (item) => Number(item.quotesCount ?? item.quoteCount ?? quotesOf(item).length) || 0;

// The quote's price per INDIVIDUAL unit (incl. GST). The quote's own `price` is per pack, so it is not used here.
// Uses a per-unit field when the API sends one; otherwise the quote's total for the buyer's quantity divided by that
// quantity (both incl. GST). Returns null when neither is available.
const unitPriceOf = (quote, totalUnits) => {
    if (!quote) return null;
    for (const k of ["pricePerUnit", "price_per_unit", "unitPrice", "perUnitPrice"]) {
        const v = Number(quote[k]);
        if (v > 0) return v;
    }
    const t = Number(quote.total);
    if (t > 0 && totalUnits > 0) return t / totalUnits;
    return null;
};

function useColumnCount() {
    const get = () => (typeof window !== "undefined" && window.innerWidth >= 768 ? 2 : 1);
    const [n, setN] = useState(get);
    useEffect(() => {
        const on = () => setN(get());
        window.addEventListener("resize", on);
        return () => window.removeEventListener("resize", on);
    }, []);
    return n;
}

// Round-robin into independent columns so opening a dropdown never reflows the neighbouring column.
const bucket = (list, n) => {
    const cols = Array.from({ length: n }, () => []);
    list.forEach((it, i) => cols[i % n].push(it));
    return cols;
};

function QuoteItem({ q, unit, totalUnits }) {
    const place = [q.city, q.state].filter(Boolean).join(", ");
    const product = [q.productName, q.brandName].filter(Boolean).join(" · ");
    const unitPrice = unitPriceOf(q, totalUnits);
    return (
        <div className="sh-qt">
            <div>
                <b>{q.sellerName || "Supplier"}</b>
                {product && <small>{product}</small>}
                {place && <small><MapPin size={12} />{place}</small>}
                <div className="sh-chips">
                    {q.moq != null && <span className="sh-chip"><Package size={12} />MOQ {fmtNum(q.moq)}</span>}
                    {q.deliveryDays != null && <span className="sh-chip"><Clock size={12} />{etaText(q)}</span>}
                    {q.freightIncluded != null && (
                        <span className={`sh-chip${q.freightIncluded ? " ok" : ""}`}><Truck size={12} />{q.freightIncluded ? "Freight included" : "Freight extra"}</span>
                    )}
                    <span className="sh-chip">{validText(q)}</span>
                </div>
                {q.submissionId && <Link className="sh-btn sm go" style={{ marginTop: 10 }} to={`/p/${q.submissionId}`}><ShoppingCart size={14} />Buy this product</Link>}
            </div>
            <div className="sh-qp">
                {unitPrice != null ? (<>
                    <b>{inrUnit(unitPrice)}</b>
                    <small>per {unit} · incl. GST</small>
                </>) : (<>
                    <b>{inrFmt(q.price)}</b>
                    <small>per pack · incl. GST</small>
                </>)}
                <small>Total {inrFmt(q.total)}</small>
            </div>
        </div>
    );
}

function QuotesDropdown({ item, onInfo, onOpenPage, onShare, onEdit, onClose }) {
    const quotes = quotesOf(item);
    const count = quoteCountOf(item);
    const live = item.status === "approved";
    const canEdit = ["pending_review", "rejected"].includes(item.status);
    const canClose = ["pending_review", "approved"].includes(item.status);
    const totalUnits = Math.round(item.quantity * item.packSize * 1e6) / 1e6; // the buyer's quantity in the individual unit

    let message = null;
    if (item.status === "pending_review") message = ["Waiting for review", "Suppliers can send quotes once our team approves this item."];
    else if (item.status === "closed") message = ["This item is closed", "Suppliers can no longer send quotes."];
    else if (!quotes.length) {
        message = count > 0
            ? [`${count} quote${count === 1 ? "" : "s"} received`, "Open the enquiry page to compare them."]
            : ["No quotes yet", "Quotes from suppliers will appear here as soon as they send them."];
    }

    return (
        <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="sh-dd"
        >
            <div className="sh-ddi">
                <div className="sh-ddh"><span>Quotes from suppliers</span><span>{timeAgo(item.publishedAt || item.createdAt)}</span></div>

                {item.status === "rejected" && item.reviewNote && <p className="sh-rej">{item.reviewNote}</p>}
                {quotes.length > 0 && (
                    <div className="sh-qts" data-lenis-prevent>
                        {quotes.map((q, i) => <QuoteItem key={q.id ?? i} q={q} unit={item.unit} totalUnits={totalUnits} />)}
                    </div>
                )}
                {message && item.status !== "rejected" && <div className="sh-ddm"><b>{message[0]}</b>{message[1]}</div>}

                <div className="sh-dda">
                    <button type="button" className="sh-btn sm" onClick={onInfo}><Info size={15} />Details</button>
                    <button type="button" className="sh-btn sm" onClick={onOpenPage}><ExternalLink size={15} />Enquiry page</button>
                    {live && <button type="button" className="sh-btn sm" onClick={onShare}><Share2 size={15} />Share</button>}
                    {canEdit && <button type="button" className="sh-btn sm" onClick={onEdit}><Pencil size={15} />{item.status === "rejected" ? "Fix & resubmit" : "Edit"}</button>}
                    {canClose && <button type="button" className="sh-btn sm" onClick={onClose}><XCircle size={15} />Close</button>}
                </div>
            </div>
        </motion.div>
    );
}

function Row({ item, isOpen, onToggle, onInfo, onOpenPage, onShare, onEdit, onClose, onZoom }) {
    const total = Math.round(item.quantity * item.packSize * 1e6) / 1e6; // one quantity, in the individual unit
    const count = quoteCountOf(item);
    const images = (item.images || []).filter(Boolean);
    const hasImage = images.length > 0;
    const toggleKey = (e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); }
    };

    // The thumbnail sits inside the row's toggle (also a role="button"), so it stops the click from toggling the row.
    const zoom = (e) => { e.stopPropagation(); onZoom(images, 0, toTitle(item.productName)); };
    const zoomKey = (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onZoom(images, 0, toTitle(item.productName)); }
    };

    return (
        <div className={`sh-row${isOpen ? " open" : ""}`}>
            <div className="sh-rh" role="button" tabIndex={0} aria-expanded={isOpen} onClick={onToggle} onKeyDown={toggleKey}>
                <div
                    className="sh-th"
                    {...(hasImage ? {
                        role: "button", tabIndex: 0, "aria-label": `View image of ${item.productName}`,
                        onClick: zoom, onKeyDown: zoomKey, style: { cursor: "zoom-in" },
                    } : {})}
                >
                    {hasImage ? <img src={images[0]} alt="" loading="lazy" /> : (item.productName || "?").trim()[0]?.toUpperCase()}
                </div>
                <div className="sh-in">
                    <p className="sh-rn">{toTitle(item.productName)}</p>
                    <p className="sh-rq">{fmtNum(total)} {item.unit}</p>
                    <div className="sh-rqt">
                        <span>Quotes received<b className={count > 0 ? "has" : ""}>{count}</b></span>
                        <span className={`sh-st ${item.status}`}><i />{STATUS_LABEL[item.status] || item.status}</span>
                    </div>
                </div>
                <div className="sh-rt">
                    <button type="button" className="sh-ic" aria-label={`Details of ${item.productName}`} onClick={(e) => { e.stopPropagation(); onInfo(); }}>
                        <Info size={18} />
                    </button>
                    <ChevronDown className="sh-chv" size={18} aria-hidden="true" style={{ color: "var(--mute)" }} />
                </div>
            </div>
            <AnimatePresence initial={false}>
                {isOpen && (
                    <QuotesDropdown item={item} onInfo={onInfo} onOpenPage={onOpenPage} onShare={onShare} onEdit={onEdit} onClose={onClose} />
                )}
            </AnimatePresence>
        </div>
    );
}

function SaveHomePageInner() {
    const nav = useNavigate();
    const { token } = useAuth();

    const columnCount = useColumnCount();

    const [qInput, setQInput] = useState("");
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("");
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [liveTick, setLiveTick] = useState(0);
    const [openCount, setOpenCount] = useState(null);
    const [quotesTotal, setQuotesTotal] = useState(null);

    const [openId, setOpenId] = useState(null);   // row whose quotes dropdown is open
    const [infoId, setInfoId] = useState(null);   // enquiry shown in the details modal (kept by id so it stays fresh)
    const [infoSnap, setInfoSnap] = useState(null);
    const [wizard, setWizard] = useState(null); // { mode, initial }
    const [bulkOpen, setBulkOpen] = useState(false);
    const [lightbox, setLightbox] = useState(null); // { images, index, alt }
    const [toast, setToast] = useState("");
    const [searchParams, setSearchParams] = useSearchParams();
    useEffect(() => {
        if (searchParams.get("new")) {
            setWizard({ mode: "create", initial: null });
            setSearchParams({}, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    const abortRef = useRef(null);
    const seqRef = useRef(0);
    const itemsRef = useRef([]);
    const loadRef = useRef(null);
    const tt = useRef(null);
    const listRef = useRef(null);
    itemsRef.current = items;

    const say = (m) => { setToast(m); clearTimeout(tt.current); tt.current = setTimeout(() => setToast(""), 2600); };
    useEffect(() => () => clearTimeout(tt.current), []);

    useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 300); return () => clearTimeout(t); }, [qInput]);

    // silent = background refresh (new quote arrived): no skeleton, errors ignored, keeps the rows already loaded.
    const load = useCallback(async (offset, append, silent = false) => {
        const key = `${token}|${q}|${status}`;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const seq = ++seqRef.current;

        if (append) setLoadingMore(true);
        else if (!silent) {
            setError(null);
            const hit = CACHE.get(key);
            if (hit) { setItems(hit.items); setTotal(hit.total); setHasMore(hit.hasMore); setLoading(false); }
            else { setItems([]); setTotal(0); setHasMore(false); setLoading(true); }
        }
        try {
            const res = await fetchRfqList(token, {
                scope: "mine", q, status,
                limit: silent ? Math.min(MAX_PAGE, Math.max(PAGE, itemsRef.current.length)) : PAGE,
                offset, signal: controller.signal,
            });
            if (seq !== seqRef.current) return;
            if (!res.success) {
                if (silent) return;
                if (!append && !CACHE.get(key)) { setItems([]); setTotal(0); }
                setHasMore(false);
                setError(res.message || "Couldn't load your price list.");
                return;
            }
            const merged = append ? mergeUnique(itemsRef.current, res.items || []) : res.items || [];
            setItems(merged);
            setTotal(res.total ?? 0);
            setHasMore(!!res.hasMore);
            setError(null);
            if (res.quotesTotal != null) setQuotesTotal(res.quotesTotal);
            CACHE.set(key, { items: merged, total: res.total ?? 0, hasMore: !!res.hasMore });
        } catch (e) {
            if (!silent && e?.name !== "AbortError" && seq === seqRef.current) setHasMore(false);
        } finally {
            if (seq === seqRef.current) { setLoading(false); setLoadingMore(false); }
        }
    }, [token, q, status]);
    loadRef.current = load;

    useEffect(() => {
        if (!token) { setLoading(false); return undefined; }
        load(0, false);
        return () => abortRef.current?.abort();
    }, [load, reloadKey, token]);

    // "Open" = live to suppliers (status approved). Same total the Live filter shows.
    useEffect(() => {
        if (!token) return undefined;
        let live = true;
        Promise.resolve(fetchRfqList(token, { scope: "mine", q: "", status: "approved", limit: 1, offset: 0 }))
            .then((r) => { if (live) setOpenCount(r?.success ? r.total ?? 0 : null); })
            .catch(() => { if (live) setOpenCount(null); });
        return () => { live = false; };
    }, [token, reloadKey, liveTick]);

    // Realtime: a seller sent / updated / withdrew a quote -> refresh the list, the tiles and any open dialog.
    useRfqLive(() => { CACHE.clear(); loadRef.current?.(0, false, true); setLiveTick((t) => t + 1); }, { enabled: !!token });

    const sentinelRef = useInfiniteScrollSentinel(
        () => !loadingMore && hasMore && load(items.length, true),
        { lookahead: 600, disabled: loading || loadingMore || !hasMore }
    );

    const refresh = () => { CACHE.clear(); setReloadKey((k) => k + 1); };

    const afterSubmit = (res) => {
        say(res?.message || "Submitted for review.");
        setStatus("");
        refresh();
    };

    const handleClose = async (item) => {
        if (!window.confirm(`Remove "${item.productName}" from your price list? Suppliers will no longer see it.`)) return;
        const res = await closeRfq(token, item.id);
        if (!res.success) return say(res.message || "Couldn't close this item.");
        say("Removed from your price list.");
        refresh();
    };

    const handleShare = async (item) => {
        const r = await shareEnquiry(item);
        if (r === "copied") say("Link copied.");
        else if (r === "failed") say("Couldn't copy the link.");
    };

    const openFilter = () => {
        setStatus("approved");
        listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const startPost = () => setWizard({ mode: "create", initial: null });

    const openPage = (item) => nav(enquiryPath(item.id), { state: { enquiry: item } });
    const showInfo = (item) => { setInfoId(item.id); setInfoSnap(item); };
    const editItem = (item) => { setInfoId(null); setWizard({ mode: "edit", initial: item }); };
    const closeItem = async (item) => { await handleClose(item); setInfoId(null); };
    const shareItem = (item) => handleShare(item);
    const openLightbox = useCallback((images, index, alt) => setLightbox({ images, index, alt }), []);
    const closeLightbox = useCallback(() => setLightbox(null), []);
    const columns = bucket(items, columnCount);

    // The details dialog follows the live list, so its quote count updates while it is open.
    const infoItem = infoId ? (items.find((i) => i.id === infoId) || infoSnap) : null;

    // Tile total: the server's count across ALL enquiries; falls back to what is loaded on screen.
    const quotesTile = quotesTotal ?? (items.length ? items.reduce((s, it) => s + quoteCountOf(it), 0) : null);

    return (
        <div className="sh-w">
            <div className="sh-sec" style={{ marginTop: 22 }}>
                <div>
                    <h1 className="sh-pt">RFQs</h1>
                    <p className="sh-sub" style={{ marginTop: 4 }}>Ask suppliers for prices and compare their quotes.</p>
                </div>
            </div>

            <div className="sh-kp">
                <button type="button" style={{ "--a": "var(--or)" }} onClick={openFilter}>
                    <b>{openCount ?? "–"}</b><span>Open RFQs</span>
                </button>
                <button type="button" style={{ "--a": "var(--bl)" }} onClick={openFilter}>
                    <b>{quotesTile ?? "–"}</b><span>Quotes received</span>
                </button>
            </div>

            <div className="sh-act">
                <button type="button" className="sh-post" onClick={startPost}>
                    <span className="pi"><Send size={22} strokeWidth={2.4} /></span>
                    <span className="tx"><b>Add to my price list</b><small>Tell suppliers what you need and get their prices.</small></span>
                    <ArrowRight className="ar" size={22} />
                </button>
                <button type="button" className="sh-btn" onClick={() => setBulkOpen(true)}><Upload size={17} />Bulk upload</button>
                <Link className="sh-btn" to={MENU_ROUTES.home}>Explore products<ArrowRight size={17} /></Link>
            </div>

            <div className="sh-sec" ref={listRef}>
                <div>
                    <h2>My purchase price list</h2>
                    <p className="sh-sub" style={{ marginTop: 4 }}>Everything you have asked suppliers to price.</p>
                </div>
                {!loading && !error && <span className="sh-cntp">{total} item{total === 1 ? "" : "s"}</span>}
            </div>

            <div className="sh-tb">
                <label className="sh-srch">
                    <Search size={18} />
                    <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Search your price list" aria-label="Search your price list" />
                    {qInput && <button type="button" aria-label="Clear search" onClick={() => setQInput("")}><X size={16} /></button>}
                </label>
                <div className="sh-chs">
                    {FILTERS.map(([v, l]) => (
                        <button key={v || "all"} type="button" aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>
                    ))}
                </div>
            </div>

            {loading && items.length === 0 ? (
                <div className="sh-grid">{[0, 1, 2].map((i) => <div className="sh-sk tall" key={i} />)}</div>
            ) : (
                <>
                    {items.length > 0 && (
                        <div className="sh-lw">
                            {columns.map((col, ci) => (
                                <div className="sh-lc" key={ci}>
                                    {col.map((it) => (
                                        <Row
                                            key={it.id}
                                            item={it}
                                            isOpen={openId === it.id}
                                            onToggle={() => setOpenId((cur) => (cur === it.id ? null : it.id))}
                                            onInfo={() => showInfo(it)}
                                            onOpenPage={() => openPage(it)}
                                            onShare={() => shareItem(it)}
                                            onEdit={() => editItem(it)}
                                            onClose={() => handleClose(it)}
                                            onZoom={openLightbox}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                    {!loading && !error && items.length === 0 && (
                        <div className="sh-emp">
                            <b>{q ? "Nothing matches your search" : status ? "Nothing here yet" : "Your price list is empty"}</b>
                            {q ? "Try a different word." : "Add a product you buy and suppliers will price it."}
                            <br />
                            {!q && !status && (
                                <button type="button" className="sh-btn go" style={{ marginTop: 16 }} onClick={startPost}>
                                    <Send size={16} />Add to my price list
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}

            {!loading && error && (
                <div className="sh-emp"><b>{error}</b><button type="button" className="sh-btn go" style={{ marginTop: 14 }} onClick={refresh}>Try again</button></div>
            )}
            {hasMore && !loading && <div ref={sentinelRef} style={{ height: 4 }} />}

            {infoItem && (
                <SaveEnquiryInfoModal
                    item={infoItem}
                    quoteCount={quoteCountOf(infoItem)}
                    onClose={() => setInfoId(null)}
                    onOpenPage={() => { const it = infoItem; setInfoId(null); openPage(it); }}
                    onShare={() => shareItem(infoItem)}
                    onEdit={() => editItem(infoItem)}
                    onCloseEnquiry={() => closeItem(infoItem)}
                />
            )}

            {wizard && (
                <SavePostWizard
                    key={wizard.initial?.id || "new"}
                    token={token}
                    mode={wizard.mode}
                    initial={wizard.initial}
                    onClose={() => setWizard(null)}
                    onSubmitted={afterSubmit}
                />
            )}
            {createPortal(
                <AnimatePresence>
                    {bulkOpen && (
                        <RfqBulkUploadModal key="bulk" token={token} onClose={() => setBulkOpen(false)}
                            onUploaded={(res, skipped) => {
                                setBulkOpen(false);
                                afterSubmit({ message: `${res.message}${skipped ? ` ${skipped} row${skipped === 1 ? " was" : "s were"} skipped.` : ""}` });
                            }} />
                    )}
                    {lightbox && (
                        <ImageLightbox key="lightbox" images={lightbox.images} initialIndex={lightbox.index} alt={lightbox.alt} onClose={closeLightbox} />
                    )}
                </AnimatePresence>,
                document.body
            )}

            <div className={`sh-toast${toast ? " on" : ""}`} role="status">{toast}</div>
        </div>
    );
}

// BuyerAddressProvider is safe to nest: if the app already mounts it higher up, this just renders the page.
export default function SaveHomePage() {
    return (
        <BuyerAddressProvider>
            <SaveHomePageInner />
        </BuyerAddressProvider>
    );
}