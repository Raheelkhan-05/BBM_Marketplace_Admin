import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Send, Search, X, ChevronDown, Pencil, XCircle, MapPin, Package, Clock, Truck } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import useInfiniteScrollSentinel from "../hooks/useInfiniteScrollSentinel";
import useSalesRealtime from "../hooks/useSalesRealtime.js";
import useRfqLive from "../hooks/useRfqLive.js";
import SavePostWizard from "../components/save/SavePostWizard.jsx";
import ImageLightbox from "../components/ImageLightbox.jsx";
import { STATUS_LABEL } from "../components/save/SaveEnquiryInfoModal.jsx";
import { fetchSalesEnquiries, createSalesEnquiry, updateSalesEnquiry, closeSalesEnquiry } from "../utils/salesEnquiryApi.js";
import { etaText, validText, inr as inrFmt } from "../utils/rfqQuoteFmt.js";
import { fmtNum, timeAgo, paymentLabel } from "../utils/rfqUtils.js";
import "../components/sales/sales-enquiries.css";
// IMPORTANT: the wizard is styled by the Save module's stylesheet. Import the same file SaveLayout imports, e.g.:
// import "../components/save/save.css";

const PAGE = 12;
const MAX_PAGE = 50;
const FILTERS = [["", "All"], ["pending_review", "In review"], ["approved", "Live"], ["rejected", "Needs changes"], ["closed", "Closed"]];
const PILL = { pending_review: "var(--k-or)", approved: "var(--k-gt)", rejected: "var(--k-red)", closed: "var(--k-mute)" };
const WIZARD_API = { create: createSalesEnquiry, update: updateSalesEnquiry };

const mergeUnique = (prev, inc) => { const s = new Set(prev.map((i) => i.id)); return [...prev, ...inc.filter((i) => !s.has(i.id))]; };
const toTitle = (s = "") => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const inrUnit = (n) => "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const quotesOf = (it) => (Array.isArray(it.quotes) ? it.quotes : []);
const quoteCountOf = (it) => Number(it.quotesCount ?? it.quoteCount ?? quotesOf(it).length) || 0;
const totalUnitsOf = (it) => Math.round(it.quantity * it.packSize * 1e6) / 1e6;
const unitPriceOf = (q, units) => {
    for (const k of ["pricePerUnit", "price_per_unit", "unitPrice", "perUnitPrice"]) { const v = Number(q[k]); if (v > 0) return v; }
    const t = Number(q.total);
    return t > 0 && units > 0 ? t / units : null;
};

function QuoteItem({ q, unit, units }) {
    const place = [q.city, q.state].filter(Boolean).join(", ");
    const product = [q.productName, q.brandName].filter(Boolean).join(" · ");
    const up = unitPriceOf(q, units);
    return (
        <div className="se-q">
            <div className="se-q-l">
                <b>{q.sellerName || "Supplier"}</b>
                {product && <small>{product}</small>}
                {place && <small><MapPin size={12} />{place}</small>}
                <div className="se-chips">
                    {q.moq != null && <span><Package size={12} />MOQ {fmtNum(q.moq)}</span>}
                    {q.deliveryDays != null && <span><Clock size={12} />{etaText(q)}</span>}
                    {q.freightIncluded != null && <span><Truck size={12} />{q.freightIncluded ? "Freight included" : "Freight extra"}</span>}
                    <span>{validText(q)}</span>
                </div>
            </div>
            <div className="se-q-r">
                {up != null ? <><b>{inrUnit(up)}</b><small>per {unit} · incl. GST</small></> : <><b>{inrFmt(q.price)}</b><small>per pack · incl. GST</small></>}
                <small>Total {inrFmt(q.total)}</small>
            </div>
        </div>
    );
}

function EnquiryCard({ it, open, onToggle, onEdit, onClose, onZoom }) {
    const units = totalUnitsOf(it);
    const count = quoteCountOf(it);
    const quotes = quotesOf(it);
    const canEdit = it.postedByMe && ["pending_review", "rejected"].includes(it.status);
    const canClose = it.postedByMe && ["pending_review", "approved"].includes(it.status);
    const where = [it.deliveryCity, it.deliveryState].filter(Boolean).join(", ");
    const images = (it.images || []).filter(Boolean);
    const hasImage = images.length > 0;

    let note = null;
    if (it.status === "pending_review") note = ["Waiting for review", "Suppliers can send quotes once our team approves this RFQ."];
    else if (it.status === "closed") note = ["This RFQ is closed", "Suppliers can no longer send quotes."];
    else if (!quotes.length) note = count > 0 ? [`${count} quote${count === 1 ? "" : "s"} received`, "Refresh in a moment to see them."] : ["No quotes yet", "Quotes appear here as soon as suppliers send them."];

    // The thumbnail lives inside the card's toggle button, so it is a span (a button inside a button is invalid).
    const zoom = (e) => { e.stopPropagation(); onZoom(images, 0, toTitle(it.productName)); };
    const zoomKey = (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onZoom(images, 0, toTitle(it.productName)); }
    };

    return (
        <article className={`gk-card se-card${open ? " open" : ""}`}>
            <button type="button" className="se-head" aria-expanded={open} onClick={onToggle}>
                <span
                    className="gd-th"
                    {...(hasImage ? {
                        role: "button", tabIndex: 0, "aria-label": `View image of ${it.productName}`,
                        onClick: zoom, onKeyDown: zoomKey, style: { cursor: "zoom-in" },
                    } : {})}
                >
                    {hasImage ? <img src={images[0]} alt="" loading="lazy" /> : (it.productName || "?").trim()[0]?.toUpperCase()}
                </span>
                <span className="se-t">
                    <b>{toTitle(it.productName)}</b>
                    <small>{fmtNum(units)} {it.unit}{where ? ` · ${where}` : ""}</small>
                    <span className="se-meta">
                        <span className="gk-pill" style={{ "--a": PILL[it.status] || "var(--k-mute)" }}>{STATUS_LABEL[it.status] || it.status}</span>
                        <span className={`se-qc${count ? " has" : ""}`}>{count} quote{count === 1 ? "" : "s"}</span>
                        <span className="se-by">{it.postedByMe ? "Posted by you" : "Posted by team"} · {timeAgo(it.publishedAt || it.createdAt)}</span>
                    </span>
                </span>
                <ChevronDown className="se-chv" size={18} aria-hidden="true" />
            </button>

            {open && (
                <div className="se-dd">
                    {it.status === "rejected" && it.reviewNote && <p className="se-rej">{it.reviewNote}</p>}
                    {quotes.length > 0 && <div className="se-qs" data-lenis-prevent>{quotes.map((q, i) => <QuoteItem key={q.id ?? i} q={q} unit={it.unit} units={units} />)}</div>}
                    {note && it.status !== "rejected" && <div className="se-note"><b>{note[0]}</b>{note[1]}</div>}
                    <dl className="se-dl">
                        <div><dt>Payment</dt><dd>{paymentLabel(it) || "–"}</dd></div>
                        <div><dt>Equivalents</dt><dd>{it.acceptEquivalent ? "Acceptable" : "Same product only"}</dd></div>
                    </dl>
                    {(canEdit || canClose) && (
                        <div className="se-act">
                            {canEdit && <button type="button" className="gk-btn" onClick={onEdit}><Pencil size={15} />{it.status === "rejected" ? "Fix & resubmit" : "Edit"}</button>}
                            {canClose && <button type="button" className="gk-btn" onClick={onClose}><XCircle size={15} />Close</button>}
                        </div>
                    )}
                </div>
            )}
        </article>
    );
}

export default function SalesEnquiriesPage() {
    const { token, profile } = useAuth();
    const { say, company } = useOutletContext();
    const [sp, setSp] = useSearchParams();

    const [qInput, setQInput] = useState("");
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("");
    const [scope, setScope] = useState("all"); // all | mine
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState({ all: 0, mine: 0 });
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const [openId, setOpenId] = useState(null);
    const [wizard, setWizard] = useState(null); // { mode, initial }
    const [lightbox, setLightbox] = useState(null); // { images, index, alt }

    const abortRef = useRef(null);
    const seqRef = useRef(0);
    const timerRef = useRef(null);
    const itemsRef = useRef([]); itemsRef.current = items;

    useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 300); return () => clearTimeout(t); }, [qInput]);
    useEffect(() => { if (sp.get("new") === "1") { setWizard({ mode: "create", initial: null }); setSp({}, { replace: true }); } }, [sp, setSp]);

    const load = useCallback(async (offset, append, silent = false) => {
        abortRef.current?.abort();
        const ctl = new AbortController(); abortRef.current = ctl;
        const my = ++seqRef.current;
        if (append) setLoadingMore(true);
        else if (!silent) { setError(""); setLoading(true); setItems([]); setHasMore(false); }
        try {
            // a silent refresh re-reads what is on screen, so scrolled pages don't collapse
            const limit = silent && !append ? Math.min(Math.max(PAGE, itemsRef.current.length), MAX_PAGE) : PAGE;
            const res = await fetchSalesEnquiries(token, { q, status, mine: scope === "mine", limit, offset, signal: ctl.signal });
            if (my !== seqRef.current) return;
            if (!res.success) { if (!silent) { setError(res.message || "Couldn't load RFQs."); setHasMore(false); } return; }
            setItems(append ? mergeUnique(itemsRef.current, res.items || []) : res.items || []);
            setTotal(res.total ?? 0); setHasMore(!!res.hasMore);
            if (res.counts) setCounts(res.counts);
            setError("");
        } catch (e) {
            if (e?.name !== "AbortError" && !silent && my === seqRef.current) setHasMore(false);
        } finally {
            if (my === seqRef.current) { setLoading(false); setLoadingMore(false); }
        }
    }, [token, q, status, scope]);

    const loadRef = useRef(load); loadRef.current = load;
    useEffect(() => { if (!token) return undefined; load(0, false); return () => abortRef.current?.abort(); }, [load, token]);

    // Real time: several signals can fire together, so they are merged into one silent refresh.
    const refreshSoon = useCallback(() => {
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => loadRef.current(0, false, true), 200);
    }, []);
    useEffect(() => () => clearTimeout(timerRef.current), []);
    useSalesRealtime(refreshSoon);                          // posted / edited / closed
    useRfqLive(refreshSoon, { enabled: !!token });          // a supplier sent a quote
    useEffect(() => {                                       // safety net: admin review, other devices, missed sockets
        const vis = () => { if (document.visibilityState === "visible") refreshSoon(); };
        const iv = setInterval(vis, 45000);
        document.addEventListener("visibilitychange", vis);
        window.addEventListener("focus", vis);
        return () => { clearInterval(iv); document.removeEventListener("visibilitychange", vis); window.removeEventListener("focus", vis); };
    }, [refreshSoon]);

    const sentinelRef = useInfiniteScrollSentinel(
        () => !loadingMore && hasMore && load(items.length, true),
        { lookahead: 600, disabled: loading || loadingMore || !hasMore },
    );

    const afterSubmit = (res) => { say(res?.message || "Submitted for review."); setStatus(""); refreshSoon(); };
    const handleClose = async (it) => {
        if (!window.confirm(`Close "${it.productName}"? Suppliers will no longer see it.`)) return;
        const res = await closeSalesEnquiry(token, it.id);
        if (!res.success) return say(res.message || "Couldn't close this RFQ.");
        say("RFQ closed.");
        refreshSoon();
    };

    const openLightbox = useCallback((images, index, alt) => setLightbox({ images, index, alt }), []);
    const closeLightbox = useCallback(() => setLightbox(null), []);

    const scopes = [["all", "All RFQs", counts.all], ["mine", "Posted by me", counts.mine]];

    return (
        <div className="gd">
            <div className="gk-ph" style={{ marginTop: 22 }}>
                <div><h1>RFQs</h1><p>Price requests posted for {company}.</p></div>
                <button type="button" className="gk-btn or" onClick={() => setWizard({ mode: "create", initial: null })}><Send size={16} />Post RFQ</button>
            </div>

            <div className="gk-search" style={{ marginTop: 14 }}>
                <Search size={16} />
                <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Search by product name" aria-label="Search RFQs" />
                {qInput && <button type="button" className="gk-icbtn" style={{ width: 28, height: 28, border: 0 }} aria-label="Clear search" onClick={() => setQInput("")}><X size={14} /></button>}
            </div>

            <div className="gd-ranges" role="group" aria-label="Whose RFQs" style={{ marginTop: 12 }}>
                {scopes.map(([v, l, n]) => <button key={v} type="button" aria-pressed={scope === v} onClick={() => setScope(v)}>{l} · {n}</button>)}
            </div>
            <div className="gd-ranges" role="group" aria-label="Status" style={{ marginTop: 8 }}>
                {FILTERS.map(([v, l]) => <button key={v || "all"} type="button" aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>)}
            </div>

            {!loading && !error && <p className="gd-note">{total} RFQ{total === 1 ? "" : "s"}</p>}

            {loading && items.length === 0 ? (
                <div className="se-list">{[0, 1, 2].map((i) => <div key={i} className="gk-skel" style={{ height: 112 }} />)}</div>
            ) : (
                <div className="se-list">
                    {items.map((it) => (
                        <EnquiryCard key={it.id} it={it} open={openId === it.id}
                            onToggle={() => setOpenId((c) => (c === it.id ? null : it.id))}
                            onEdit={() => setWizard({ mode: "edit", initial: it })}
                            onClose={() => handleClose(it)}
                            onZoom={openLightbox} />
                    ))}
                    {!loading && !error && items.length === 0 && (
                        <div className="gk-empty" style={{ gridColumn: "1 / -1" }}>
                            <b>{q ? "No RFQs match your search" : scope === "mine" ? "You haven't posted any RFQs yet" : "No RFQs yet"}</b>
                            {q ? "Try a different product name." : "Post an RFQ for a product the company needs and suppliers will send their prices."}
                        </div>
                    )}
                </div>
            )}

            {!loading && error && <div className="gk-empty"><b>{error}</b><button type="button" className="gk-btn go" onClick={() => load(0, false)}>Try again</button></div>}
            {hasMore && !loading && <div ref={sentinelRef} style={{ height: 4 }} />}

            {wizard && (
                <SavePostWizard
                    key={wizard.initial?.id || "new"}
                    token={token}
                    mode={wizard.mode}
                    initial={wizard.initial}
                    api={WIZARD_API}
                    allowImages={false}
                    defaultAddress={profile?.businessProfile || null}
                    defaultAddressSource="team"
                    onClose={() => setWizard(null)}
                    onSubmitted={afterSubmit}
                />
            )}

            {/* Portal on <body>: the cards animate with transforms, which would break a fixed fullscreen layer inside them. */}
            {createPortal(
                <AnimatePresence>
                    {lightbox && (
                        <ImageLightbox
                            key="lightbox"
                            images={lightbox.images}
                            initialIndex={lightbox.index}
                            alt={lightbox.alt}
                            onClose={closeLightbox}
                        />
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
}