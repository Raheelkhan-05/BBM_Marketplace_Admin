// src/pages/GrowEnquiriesPage.jsx — the RFQ / enquiry module (the greeting and KPIs now live on the dashboard).
// Same backend as RfqPage: fetchRfqList / closeRfq + the existing post, bulk-upload modals.
// Live enquiries can be opened on their own page (/grow/enquiry/:id) and shared with the share button.
// Quotes are real now: "Submit quote" opens RfqQuoteModal (pick a catalog product -> price -> send). The list keeps
// itself fresh (socket event, focus, light poll) so a sent / updated / withdrawn quote shows up without a refresh.
// Each card shows ONE quantity at the top: the buyer's total in the individual unit (e.g. 500 Kg), with the price basis
// per individual unit. The pack / master pack breakdown is shown inside the quote popup, where the seller's product is known.
// Prices are always shown per individual unit, including the "Quote sent" chip (e.g. ₹2.47/Kg).
// The product image opens full screen (ImageLightbox) when tapped.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Share2 } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import RfqFormModal from "../components/rfq/RfqFormModal.jsx";
import RfqBulkUploadModal from "../components/rfq/RfqBulkUploadModal.jsx";
import RfqQuoteModal from "../components/rfq/RfqQuoteModal.jsx";
import ImageLightbox from "../components/ImageLightbox.jsx";
import useInfiniteScrollSentinel from "../hooks/useInfiniteScrollSentinel";
import useRfqLive from "../hooks/useRfqLive.js";
import useQuoteResume from "../hooks/useQuoteResume.js";
import { fetchRfqList, closeRfq } from "../utils/rfqApi.js";
import { fmtNum, timeAgo, paymentLabel, consumptionLabel, locationSummary } from "../utils/rfqUtils.js";
import { shareEnquiry, enquiryPath } from "../utils/rfqShare.js";
import Ic from "../components/growSeller/Ic.jsx";
import { Thumb, Empty, ListSkeleton } from "../components/growSeller/ui.jsx";
import { useGrowSeller } from "../context/GrowSellerContext.js";
import { toTitleCase, H } from "../components/growSeller/sellerHelpers.js";
import "../components/growSeller/grow-store.css";

const PAGE = 12;
const MAX_PAGE = 30; // server cap
const STATUS_FILTERS = [
    { value: "", label: "All" },
    { value: "pending_review", label: "In review" },
    { value: "approved", label: "Live" },
    { value: "rejected", label: "Needs changes" },
    { value: "closed", label: "Closed" },
];
const STATUS_LABEL = { pending_review: "In review", approved: "Live", rejected: "Needs changes", closed: "Closed" };

// Wrapper that makes the thumbnail tappable without changing how it looks.
const ZOOM_BTN = { border: 0, background: "none", padding: 0, margin: 0, cursor: "zoom-in", flex: "none", display: "block", borderRadius: 18 };

const mergeUnique = (prev, incoming) => {
    const seen = new Set(prev.map((i) => i.id));
    return [...prev, ...incoming.filter((i) => !seen.has(i.id))];
};

// Last result per (token, tab, search, status): switching tabs paints instantly, then revalidates silently.
const CACHE = new Map();

const inr = (n) => "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
// A price per single unit can be small (e.g. ₹2.4691), so up to 4 decimals are kept, at least 2 are shown.
const inrUnit = (n) => "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

// The seller's quote price per INDIVIDUAL unit (incl. GST). The quote's own `price` is per pack, so it is not used here.
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

function EnquiryCard({ item, onQuote, onEdit, onClose, onShare, onZoom }) {
    const mine = item.isMine;
    const total = Math.round(item.quantity * item.packSize * 1e6) / 1e6; // the buyer's quantity in the individual unit
    const published = item.publishedAt || item.createdAt;
    const isNew = published && Date.now() - new Date(published).getTime() < H;
    const live = item.status === "approved";
    const myQuote = item.myQuote || null;
    const myUnitPrice = unitPriceOf(myQuote, total);
    const images = (item.images || []).filter(Boolean);
    return (
        <article className="card">
            <div className="top">
                {images.length > 0 ? (
                    <button
                        type="button"
                        style={ZOOM_BTN}
                        aria-label={`View image of ${item.productName}`}
                        onClick={() => onZoom(images, 0, toTitleCase(item.productName))}
                    >
                        <Thumb src={images[0]} name={item.productName} />
                    </button>
                ) : (
                    <Thumb src={item.images?.[0]} name={item.productName} />
                )}
                <div className="in">
                    <h3>
                        <Link to={enquiryPath(item.id)} state={{ enquiry: item }} style={{ color: "inherit", textDecoration: "none" }}>
                            {toTitleCase(item.productName)}
                        </Link>
                        {mine && <span className={`stt rfq ${item.status}`}>{STATUS_LABEL[item.status] || item.status}</span>}
                        {!mine && isNew && <span className="nw">NEW</span>}
                    </h3>
                    <b className="q">{fmtNum(total)} {item.unit}</b>
                    <small>Price per unit ({item.unit})</small>
                    <span className="eq">
                        {item.acceptEquivalent ? <><Ic n="shuffle" />Equivalent OK</> : <><Ic n="equal" />Same product only</>}
                    </span>
                </div>
            </div>
            {item.specifications && <p className="ds">{item.specifications}</p>}
            <ul className="mt" style={{ marginTop: item.specifications ? 0 : 14 }}>
                <li><Ic n="wallet" /><span>{paymentLabel(item)}</span></li>
                <li><Ic n="repeat" /><span>{consumptionLabel(item)}</span></li>
                <li><Ic n="pin" /><span>Deliver to {item.deliveryCity}, {item.deliveryState}</span></li>
                <li><Ic n="pin" /><span>Suppliers: {locationSummary(item.supplierLocations)}</span></li>
            </ul>
            {mine && item.status === "rejected" && item.reviewNote && <p className="rej">{item.reviewNote}</p>}
            {mine && item.status === "pending_review" && <p className="pend">Our team is reviewing this. It will go live once approved.</p>}
            <div className="rf">
                <div className="tm"><Ic n="clock" /><span><b>{timeAgo(published)}</b></span></div>
                <div className="rowa">
                    {live && (
                        <button type="button" className="bt sm" aria-label={`Share enquiry for ${item.productName}`} onClick={() => onShare(item)}>
                            <Share2 size={15} strokeWidth={2.2} />Share
                        </button>
                    )}
                    {mine && ["pending_review", "rejected"].includes(item.status) && (
                        <button type="button" className="bt sm" onClick={() => onEdit(item)}><Ic n="edit" />{item.status === "rejected" ? "Fix & resubmit" : "Edit"}</button>
                    )}
                    {mine && ["pending_review", "approved"].includes(item.status) && (
                        <button type="button" className="bt sm" onClick={() => onClose(item)}><Ic n="x" />Close</button>
                    )}
                    {!mine && live && (
                        myQuote ? (
                            <>
                                <span className="qd">
                                    <Ic n="check" />Quote sent · {myUnitPrice != null ? `${inrUnit(myUnitPrice)}/${item.unit}` : `${inr(myQuote.price)}/pack`}
                                </span>
                                <button type="button" className="bt sm" onClick={() => onQuote(item)}><Ic n="edit" />Edit quote</button>
                            </>
                        ) : (
                            <button type="button" className="bt go" onClick={() => onQuote(item)}><Ic n="send" />Submit quote</button>
                        )
                    )}
                </div>
            </div>
        </article>
    );
}

export default function GrowEnquiriesPage() {
    const { token } = useAuth();
    const { say } = useGrowSeller();
    const [resume, clearResume] = useQuoteResume();

    const tab = "all";
    const setTab = (t) => {
        const next = new URLSearchParams(params);
        if (t === "mine") next.set("tab", "mine"); else next.delete("tab");
        setParams(next, { replace: true });
    };

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

    const [formState, setFormState] = useState(null); // { mode, initial }
    const [bulkOpen, setBulkOpen] = useState(false);
    const [quoteFor, setQuoteFor] = useState(null);   // { enquiry, submissionId }
    const [lightbox, setLightbox] = useState(null);   // { images, index, alt }

    const abortRef = useRef(null);
    const seqRef = useRef(0);
    const itemsRef = useRef([]);
    const loadRef = useRef(null);
    itemsRef.current = items;

    useEffect(() => {
        const t = setTimeout(() => setQ(qInput.trim()), 300);
        return () => clearTimeout(t);
    }, [qInput]);

    // silent = background refresh: no skeleton, no flicker, errors ignored, keeps as many rows as are already shown.
    const load = useCallback(async (offset, append, silent = false) => {
        const key = `${token}|${tab}|${q}|${tab === "mine" ? status : ""}`;
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
                scope: tab, q, status: tab === "mine" ? status : "",
                limit: silent ? Math.min(MAX_PAGE, Math.max(PAGE, itemsRef.current.length)) : PAGE,
                offset, signal: controller.signal,
            });
            if (seq !== seqRef.current) return;
            if (!res.success) {
                if (silent) return;
                if (!append && !CACHE.get(key)) { setItems([]); setTotal(0); }
                setHasMore(false);
                setError(res.message || "Couldn't load enquiries.");
                return;
            }
            const incoming = (res.items || []).filter((i) => !i.isMine);
            const merged = append ? mergeUnique(itemsRef.current, incoming) : incoming;
            setItems(merged);
            setTotal(res.total ?? 0);
            setHasMore(!!res.hasMore);
            setError(null);
            CACHE.set(key, { items: merged, total: res.total ?? 0, hasMore: !!res.hasMore });
        } catch (e) {
            if (!silent && e?.name !== "AbortError" && seq === seqRef.current) setHasMore(false);
        } finally {
            if (seq === seqRef.current) { setLoading(false); setLoadingMore(false); }
        }
    }, [token, tab, q, status]);
    loadRef.current = load;

    useEffect(() => {
        if (!token) { setLoading(false); return undefined; }
        load(0, false);
        return () => abortRef.current?.abort();
    }, [load, reloadKey, token]);

    // Realtime: a quote was sent / updated / withdrawn (or the tab came back): refresh quietly.
    useRfqLive(() => { CACHE.clear(); loadRef.current?.(0, false, true); }, { enabled: !!token });

    // Came back from "add a product" for a quote: re-open the popup with that product preselected.
    useEffect(() => {
        if (!resume) return;
        setQuoteFor({ enquiry: resume.enquiry, submissionId: resume.submissionId || null });
        clearResume();
    }, [resume, clearResume]);

    const sentinelRef = useInfiniteScrollSentinel(
        () => !loadingMore && hasMore && load(items.length, true),
        { lookahead: 600, disabled: loading || loadingMore || !hasMore }
    );

    const afterSubmit = (message) => {
        say(message);
        setStatus("");
        CACHE.clear();
        setReloadKey((k) => k + 1);
    };

    const handleClose = async (item) => {
        if (!window.confirm(`Close the enquiry for "${item.productName}"? Suppliers will no longer see it.`)) return;
        const res = await closeRfq(token, item.id);
        if (!res.success) { say(res.message || "Couldn't close this enquiry."); return; }
        say("Enquiry closed.");
        CACHE.clear();
        setReloadKey((k) => k + 1);
    };

    const handleShare = async (item) => {
        const r = await shareEnquiry(item);
        if (r === "copied") say("Enquiry link copied.");
        else if (r === "failed") say("Couldn't copy the link.");
    };

    const handleQuoteDone = (quote, meta) => {
        setQuoteFor(null);
        say(meta?.withdrawn ? "Quote withdrawn." : "Quote sent.");
        CACHE.clear();
        load(0, false, true);
    };

    const openLightbox = useCallback((images, index, alt) => setLightbox({ images, index, alt }), []);
    const closeLightbox = useCallback(() => setLightbox(null), []);

    return (
        <div className="v">
            <h2 className="h2" style={{ marginTop: 22 }}>Requests for quotation</h2>
            <p className="sub2">Quote on live enquiries from buyers.</p>

            {/* <div className="act">
                <button className="bt" type="button" onClick={() => setBulkOpen(true)}><Ic n="upload" />Bulk upload</button>
                <button className="bt or" type="button" onClick={() => setFormState({ mode: "create", initial: null })}><Ic n="plus" />Post enquiry</button>
            </div> */}

            <div className="tb" style={{ marginTop: 14 }}>
                <label className="srch">
                    <Ic n="search" />
                    <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Search enquiries" aria-label="Search enquiries" />
                    {qInput && <button type="button" className="clr" aria-label="Clear search" onClick={() => setQInput("")}><Ic n="x" /></button>}
                </label>
            </div>

            {!loading && !error && <p className="cnt">{total} enquir{total === 1 ? "y" : "ies"}</p>}

            {loading && items.length === 0 ? <ListSkeleton n={4} tall /> : (
                <div className="grid c3">
                    {items.map((item) => (
                        <EnquiryCard key={item.id} item={item}
                            onQuote={(it) => setQuoteFor({ enquiry: it, submissionId: null })}
                            onEdit={(it) => setFormState({ mode: "edit", initial: it })}
                            onClose={handleClose}
                            onShare={handleShare}
                            onZoom={openLightbox} />
                    ))}
                </div>
            )}

            {!loading && error && (
                <div className="errb"><b>{error}</b><button type="button" className="bt go" onClick={() => setReloadKey((k) => k + 1)}>Try again</button></div>
            )}
            {loadingMore && <div className="more"><Ic n="spin" /></div>}
            {hasMore && !loading && <div ref={sentinelRef} style={{ height: 4 }} />}

            {createPortal(
                <AnimatePresence>
                    {formState && (
                        <RfqFormModal key="form" mode={formState.mode} initial={formState.initial} token={token}
                            onClose={() => setFormState(null)}
                            onSubmitted={(res) => { setFormState(null); afterSubmit(res.message || "Submitted for review."); }} />
                    )}
                    {bulkOpen && (
                        <RfqBulkUploadModal key="bulk" token={token} onClose={() => setBulkOpen(false)}
                            onUploaded={(res, skipped) => {
                                setBulkOpen(false);
                                afterSubmit(`${res.message}${skipped ? ` ${skipped} row${skipped === 1 ? " was" : "s were"} skipped.` : ""}`);
                            }} />
                    )}
                    {quoteFor && (
                        <RfqQuoteModal key="quote" enquiry={quoteFor.enquiry} initialSubmissionId={quoteFor.submissionId}
                            onClose={() => setQuoteFor(null)} onDone={handleQuoteDone} />
                    )}
                    {lightbox && (
                        <ImageLightbox key="lightbox" images={lightbox.images} initialIndex={lightbox.index} alt={lightbox.alt} onClose={closeLightbox} />
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
}