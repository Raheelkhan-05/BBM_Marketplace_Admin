// src/pages/GrowEnquiryDetailPage.jsx — one shareable enquiry (route: /grow/enquiry/:id).
//   Anyone can OPEN this page (guests included). Login / seller checks only happen when someone tries to quote.
//   Buyer (owner): requirement + every quote received, sortable, with a Buy button per quote.
//   Seller:        requirement + clear "quote sent" state + quote / edit action.
//   Visitor:       requirement + sign-in prompt.
// Product images (the big one and the ones on quote cards) open full screen in ImageLightbox.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import {
    Share2, Send, Shuffle, Equal, Wallet, Repeat, MapPin, Clock, Check, Package, Truck, Building2,
    ShoppingCart, ChevronDown, BadgeCheck, Zap, Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import RfqQuoteModal from "../components/rfq/RfqQuoteModal.jsx";
import ImageLightbox from "../components/ImageLightbox.jsx";
import * as rfqApi from "../utils/rfqApi.js";
import useRfqLive from "../hooks/useRfqLive.js";
import useQuoteResume from "../hooks/useQuoteResume.js";
import { loadAccess } from "../components/grow/growAccess.js";
import { isSellerReady } from "../components/growSeller/growSeller.js";
import { fmtNum, timeAgo, paymentLabel, consumptionLabel, locationSummary } from "../utils/rfqUtils.js";
import { inr, validText, etaText, shortDate } from "../utils/rfqQuoteFmt.js";
import { toTitleCase } from "../components/growSeller/sellerHelpers.js";
import { shareEnquiry } from "../utils/rfqShare.js";
import SmartLink from "../components/SmartLink.jsx";
import "../components/rfq/rfqEnquiryPage.css";

const STATUS_LABEL = { pending_review: "In review", approved: "Live", rejected: "Needs changes", closed: "Closed" };
const WHY = [
    ["More buyers", "Reach relevant B2B buyers beyond your network.", Users],
    ["Quote in a tap", "Answer live enquiries with your price, in about a minute.", Zap],
    ["Pay on orders", "Fees start at 0.25%, charged only when an order is generated.", BadgeCheck],
];

async function findEnquiry(token, id, signal) {
    if (typeof rfqApi.fetchRfqById === "function") return rfqApi.fetchRfqById(token, id, { signal });
    return { success: false, message: "Couldn't load this enquiry." };
}

// What kind of failure is this? Decides the message and which buttons are shown.
const isAuthFail = (res) => res?.status === 401 || res?.status === 403 || /session|unauthor|sign in|log in|login|token/i.test(res?.message || "");
const isMissing = (res) => res?.status === 404 || /not found|no longer|doesn't exist|does not exist/i.test(res?.message || "");

function QuoteCard({ q, tags, enquiryId, onZoom }) {
    const place = [q.city, q.state].filter(Boolean).join(", ");
    const zoomName = [q.productName, q.brandName].filter(Boolean).join(" · ") || q.sellerName;
    return (
        <article className="rqp-q">
            <div className="rqp-qh">
                {q.image ? (
                    <button
                        type="button"
                        className="rqp-qav"
                        aria-label={`View image of ${zoomName}`}
                        style={{ cursor: "zoom-in", border: 0, padding: 0 }}
                        onClick={() => onZoom([q.image], 0, zoomName)}
                    >
                        <img src={q.image} alt="" loading="lazy" />
                    </button>
                ) : (
                    <span className="rqp-qav">{(q.sellerName || "S")[0].toUpperCase()}</span>
                )}
                <div className="rqp-qwho">
                    <b>{q.sellerName}</b>
                    {place && <small><MapPin size={12} />{place}</small>}
                </div>
                <div className="rqp-qtags">{tags.map((t) => <span key={t} className="rqp-tag">{t}</span>)}</div>
            </div>

            <div className="rqp-qm">
                <div className="rqp-qprod">
                    <b>{q.productName || "Product"}{q.brandName ? ` · ${q.brandName}` : ""}</b>
                    {q.listingPackSize && (
                        <small>
                            1 Pack = {fmtNum(q.listingPackSize)} {q.listingUnit || q.unit}
                            {q.listingMasterPackSize > 1 ? ` · 1 Master Pack = ${fmtNum(q.listingMasterPackSize)} Packs` : ""}
                        </small>
                    )}
                </div>
                <div className="rqp-qprice">
                    <b>{inr(q.price)}</b><small>per pack · incl. GST</small>
                    <strong>{inr(q.total)}</strong><small>total for {fmtNum(q.totalUnits)} {q.unit}</small>
                </div>
            </div>

            <div className="rqp-chips">
                {q.deliveryDays != null && <span className="rqp-chip"><Clock size={13} />{etaText(q)}</span>}
                {q.moq != null && <span className="rqp-chip"><Package size={13} />MOQ {fmtNum(q.moq)}</span>}
                {q.freightIncluded != null && <span className={`rqp-chip${q.freightIncluded ? " ok" : ""}`}><Truck size={13} />{q.freightIncluded ? "Freight included" : "Freight extra"}</span>}
                <span className="rqp-chip">{validText(q)}</span>
            </div>

            <details className="rqp-bk">
                <summary>Price breakdown <ChevronDown size={15} /></summary>
                <dl>
                    <div><dt>Base price per {q.unit} (excl. GST)</dt><dd>{inr(q.unitPriceExGst, 4)}</dd></div>
                    <div><dt>Quantity</dt><dd>{fmtNum(q.totalUnits)} {q.unit}</dd></div>
                    <div><dt>Total before GST</dt><dd>{inr(q.taxableValue)}</dd></div>
                    <div><dt>GST @ {q.gstPercent}%</dt><dd>{inr(q.gstAmount)}</dd></div>
                    <div className="t"><dt>Total incl. GST</dt><dd>{inr(q.total)}</dd></div>
                </dl>
            </details>

            <div className="rqp-qf">
                {q.submissionId
                    ? <Link className="rqp-btn go" to={`/p/${q.submissionId}`} state={{ fromEnquiry: enquiryId }}><ShoppingCart size={16} />Buy this product</Link>
                    : <span className="rqp-note">This listing is no longer available.</span>}
                {!q.checkoutMatches && <small className="rqp-note">Final price at checkout follows the seller's listing.</small>}
            </div>
        </article>
    );
}

export default function GrowEnquiryDetailPage() {
    const { id } = useParams();
    const location = useLocation();
    const nav = useNavigate();
    const { token, isLoggedIn, needsOnboarding, initializing, profile } = useAuth();
    const [resume, clearResume] = useQuoteResume();

    const goToStart = () => nav("/grow?start=1", { state: { from: `${location.pathname}${location.search}` } });

    const seeded = location.state?.enquiry && String(location.state.enquiry.id) === String(id) ? location.state.enquiry : null;
    const [item, setItem] = useState(seeded);
    const [loading, setLoading] = useState(!seeded);
    const [error, setError] = useState(null); // null | { kind: "auth" | "missing" | "retry", message }
    const [reloadKey, setReloadKey] = useState(0);
    const [quoteOpen, setQuoteOpen] = useState(null); // null | { submissionId }
    const [checking, setChecking] = useState(false);  // seller check in progress after "Quote now"
    const [toast, setToast] = useState("");
    const [sort, setSort] = useState("price");
    const [imgIdx, setImgIdx] = useState(0);
    const [lightbox, setLightbox] = useState(null); // { images, index, alt }
    const toastTimer = useRef(null);
    const abortRef = useRef(null);

    const say = (m) => { setToast(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 2400); };
    useEffect(() => () => clearTimeout(toastTimer.current), []);

    useEffect(() => {
        const prev = document.title;
        document.title = item ? `${toTitleCase(item.productName)} · Quote request | GROW` : "Quote request | GROW";
        return () => { document.title = prev; };
    }, [item]);

    // The router-state snapshot may lack myQuote, so always refetch. silent = never flash skeleton/error.
    // If the signed-in request is refused because of the session (expired token), retry once as a guest,
    // so anyone can still open the page. Login is only asked for when they try to quote.
    const loadItem = useCallback(async ({ silent = false } = {}) => {
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        if (!silent) { setLoading(true); setError(null); }
        try {
            let res = await findEnquiry(token, id, ctrl.signal);
            if (ctrl.signal.aborted) return;
            if (!res?.success && token && isAuthFail(res)) {
                res = await findEnquiry(null, id, ctrl.signal);
                if (ctrl.signal.aborted) return;
            }
            if (res?.success && res.item) { setItem(res.item); setError(null); }
            else if (!silent) {
                setItem(null);
                if (isAuthFail(res)) setError({ kind: "auth", message: "This enquiry can only be viewed after you log in." });
                else if (isMissing(res)) setError({ kind: "missing", message: "This enquiry was removed or the link is not correct." });
                else setError({ kind: "retry", message: res?.message || "Something went wrong while loading this enquiry." });
            }
        } catch (e) {
            if (e?.name === "AbortError") return;
            if (!silent) { setItem(null); setError({ kind: "retry", message: "Couldn't load this enquiry. Check your connection and try again." }); }
        } finally { if (!ctrl.signal.aborted) setLoading(false); }
    }, [id, token]);

    useEffect(() => {
        loadItem({ silent: !!seeded });
        return () => abortRef.current?.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadItem, reloadKey]);
    useRfqLive(() => loadItem({ silent: true }), { enabled: !!token });

    // Back from "add a product" for this quote: reopen the popup with it preselected.
    useEffect(() => {
        if (!resume || !item) return;
        setQuoteOpen({ submissionId: resume.submissionId || null });
        clearResume();
    }, [resume, item, clearResume]);

    const onShare = async () => {
        const r = await shareEnquiry(item || { id });
        if (r === "copied") say("Link copied");
        else if (r === "failed") say("Copy the page address to share");
    };

    // All the checks happen here, only when someone actually wants to quote.
    const onQuoteClick = async () => {
        if (initializing || checking) return;
        // 1. must be logged in and finished onboarding (comes back to this page afterwards)
        if (!isLoggedIn || needsOnboarding) return goToStart();
        // 2. sales accounts work for a company's buying side and cannot quote
        if (profile?.team?.role === "salesperson") return say("Sales accounts can't send quotes.");
        // 3. must be an approved, ready seller (same rule as the Grow seller area)
        if (!isSellerReady(profile, token)) {
            setChecking(true);
            let ok = false;
            try { const a = await loadAccess(token); ok = !!a?.canPublish; } catch { ok = false; }
            setChecking(false);
            if (!ok) { say("Set up your seller account to send quotes."); return goToStart(); }
        }
        setQuoteOpen({ submissionId: null });
    };

    const onQuoteDone = (quote, meta) => {
        setQuoteOpen(null);
        say(meta?.withdrawn ? "Quote withdrawn" : "Quote saved");
        setItem((it) => (it ? { ...it, myQuote: meta?.withdrawn ? null : quote || it.myQuote } : it));
        loadItem({ silent: true });
    };

    const openLightbox = useCallback((images, index, alt) => setLightbox({ images, index, alt }), []);
    const closeLightbox = useCallback(() => setLightbox(null), []);

    const isMine = !!item?.isMine;
    const live = item?.status === "approved";
    const closed = item?.status === "closed";
    const myQuote = item && !isMine ? item.myQuote || null : null;
    const total = item ? Number(item.quantity) * Number(item.packSize) : 0;
    const published = item ? item.publishedAt || item.createdAt : null;
    const images = (item?.images || []).filter(Boolean);
    const quoteBusy = initializing || checking;

    const quotes = useMemo(() => {
        const list = isMine ? [...(item?.quotes || [])] : [];
        if (sort === "delivery") list.sort((a, b) => (a.deliveryDays ?? 1e9) - (b.deliveryDays ?? 1e9) || a.total - b.total);
        else if (sort === "newest") list.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
        else list.sort((a, b) => a.total - b.total);
        return list;
    }, [item, isMine, sort]);
    const lowest = useMemo(() => Math.min(...quotes.map((q) => q.total), Infinity), [quotes]);
    const fastest = useMemo(() => Math.min(...quotes.map((q) => q.deliveryDays ?? Infinity), Infinity), [quotes]);
    const tagsFor = (q) => [
        ...(quotes.length > 1 && q.total === lowest ? ["Lowest price"] : []),
        ...(quotes.length > 1 && q.deliveryDays != null && q.deliveryDays === fastest ? ["Fastest"] : []),
    ];

    const pill = closed ? ["Closed", "off"]
        : isMine ? [STATUS_LABEL[item?.status] || "", live ? "ok" : "warn"]
            : myQuote ? ["Quote sent", "ok"]
                : live ? ["Open for quotes", "ok"] : [STATUS_LABEL[item?.status] || "", "warn"];

    const facts = item ? [
        [Wallet, "Payment", paymentLabel(item)],
        [Repeat, "Consumption", consumptionLabel(item)],
        [MapPin, "Deliver to", isMine
            ? [item.deliveryAddress, item.deliveryCity, item.deliveryState, item.deliveryPincode].filter(Boolean).join(", ")
            : `${item.deliveryCity}, ${item.deliveryState}`],
        [Building2, "Suppliers from", locationSummary(item.supplierLocations)],
        [item.acceptEquivalent ? Shuffle : Equal, "Product match", item.acceptEquivalent ? "Equivalent products accepted" : "Same product only"],
    ] : [];

    const quoteLabel = checking ? "Checking…" : isLoggedIn ? "Quote now" : "Sign in to quote";

    // The primary action, reused in the sidebar and the mobile bar.
    const action = !item ? null : isMine ? (
        <>
            <div className="rqp-ac-n"><b>{quotes.length}</b><span>quote{quotes.length === 1 ? "" : "s"} received</span></div>
            {live && <button type="button" className="rqp-btn" onClick={onShare}><Share2 size={16} />Share with suppliers</button>}
            <Link className="rqp-btn" to="/save">Back to my price list</Link>
        </>
    ) : closed ? (
        <p className="rqp-note">This enquiry is closed and no longer takes quotes.</p>
    ) : !live ? (
        <p className="rqp-note">This enquiry isn't open for quotes right now.</p>
    ) : myQuote ? (
        <>
            <div className="rqp-done"><Check size={18} />You have quoted on this enquiry</div>
            <button type="button" className="rqp-btn" disabled={quoteBusy} onClick={onQuoteClick}>{checking ? "Checking…" : "Edit quote"}</button>
        </>
    ) : (
        <>
            <p className="rqp-note" style={{ margin: 0 }}>{isLoggedIn ? "Send your best price in about a minute." : "Sign in as a seller to send your price."}</p>
            <button type="button" className="rqp-btn go" disabled={quoteBusy} onClick={onQuoteClick}><Send size={16} />{quoteLabel}</button>
        </>
    );

    const mainImage = images[imgIdx] || null;
    const zoomMain = () => { if (images.length) openLightbox(images, imgIdx, item ? toTitleCase(item.productName) : ""); };

    // Error card: message and buttons depend on what went wrong (retrying only makes sense for network / server errors).
    const errorView = error && (
        <div className="rqp-card rqp-empty" role="alert">
            <h2>
                {error.kind === "auth" ? "Log in to view this enquiry"
                    : error.kind === "missing" ? "This enquiry isn't available"
                        : "We couldn't open this enquiry"}
            </h2>
            <p>{error.message}</p>
            <div className="rqp-row">
                {error.kind === "auth" && <button type="button" className="rqp-btn go" onClick={goToStart}>Log in</button>}
                {error.kind === "retry" && <button type="button" className="rqp-btn go" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>}
                {error.kind === "missing" && (
                    isLoggedIn
                        ? <button type="button" className="rqp-btn go" onClick={() => nav("/grow/enquiries")}>See all enquiries</button>
                        : <button type="button" className="rqp-btn go" onClick={() => nav("/")}>Go to home</button>
                )}
                {error.kind === "retry" && !isLoggedIn && <button type="button" className="rqp-btn" onClick={goToStart}>Log in</button>}
            </div>
        </div>
    );

    return (
        <div className="rqp">
            <header className="rqp-hd">
                <div className="rqp-hdi">
                    <SmartLink to="/" aria-label="BBM home" className="rqp-logo">
                        <img src="/Logo.png" alt="BBM" /><span>BBM</span>
                    </SmartLink>
                    <span style={{ flex: 1 }} />
                    <button type="button" className="rqp-pill" onClick={onShare}><Share2 size={15} />Share</button>
                </div>
            </header>

            <div className="rqp-w">
                {loading && <div className="rqp-card rqp-skel" aria-busy="true"><i /><i /><i /></div>}

                {!loading && errorView}

                {!loading && item && (
                    <>
                        <div className="rqp-title">
                            <span className={`rqp-st ${pill[1]}`}><i />{pill[0]}</span>
                            <h1>{toTitleCase(item.productName)}</h1>
                            <p>Posted {timeAgo(published)}{published ? ` · ${shortDate(published)}` : ""}</p>
                        </div>

                        <div className="rqp-grid">
                            <main className="rqp-main">
                                <section className="rqp-card">
                                    <div className="rqp-prod">
                                        <div className="rqp-gal">
                                            {mainImage ? (
                                                <div
                                                    className="rqp-img"
                                                    role="button"
                                                    tabIndex={0}
                                                    aria-label="View image full screen"
                                                    style={{ cursor: "zoom-in" }}
                                                    onClick={zoomMain}
                                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); zoomMain(); } }}
                                                >
                                                    <img src={mainImage} alt={item.productName} />
                                                </div>
                                            ) : (
                                                <div className="rqp-img"><Package size={40} aria-hidden="true" /></div>
                                            )}
                                            {images.length > 1 && (
                                                <div className="rqp-thumbs">
                                                    {images.map((src, i) => (
                                                        <button key={src + i} type="button" aria-label={`Image ${i + 1}`} aria-pressed={i === imgIdx} onClick={() => setImgIdx(i)}><img src={src} alt="" loading="lazy" /></button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="rqp-req">
                                            <p className="rqp-cap">Requirement</p>
                                            <div className="rqp-stats">
                                                <div><b>{fmtNum(item.quantity)}</b><span>pack{Number(item.quantity) === 1 ? "" : "s"}</span></div>
                                                <div><b>{fmtNum(item.packSize)}</b><span>{item.unit} per pack</span></div>
                                                <div className="hl"><b>{fmtNum(total)}</b><span>{item.unit} in total</span></div>
                                            </div>
                                            {item.specifications && (<><p className="rqp-cap" style={{ marginTop: 16 }}>Specifications</p><p className="rqp-spec">{item.specifications}</p></>)}
                                        </div>
                                    </div>

                                    <dl className="rqp-facts">
                                        {facts.map(([Icon, k, v]) => (
                                            <div key={k}><Icon size={17} aria-hidden="true" /><dt>{k}</dt><dd>{v || "–"}</dd></div>
                                        ))}
                                    </dl>

                                    {isMine && item.status === "rejected" && item.reviewNote && <p className="rqp-alert">{item.reviewNote}</p>}
                                    {isMine && item.status === "pending_review" && <p className="rqp-alert info">Our team is reviewing this. It will go live once approved.</p>}
                                </section>

                                {myQuote && (
                                    <section className="rqp-card">
                                        <div className="rqp-sh"><h2>Your quote</h2><span className="rqp-st ok"><i />Sent</span></div>
                                        <dl className="rqp-bkt">
                                            <div><dt>Product</dt><dd>{myQuote.productName}{myQuote.brandName ? ` · ${myQuote.brandName}` : ""}</dd></div>
                                            <div><dt>Price per pack (incl. GST)</dt><dd>{inr(myQuote.price)}</dd></div>
                                            <div><dt>Base price per {myQuote.unit} (excl. GST)</dt><dd>{inr(myQuote.unitPriceExGst, 4)}</dd></div>
                                            <div><dt>Quantity</dt><dd>{fmtNum(myQuote.totalUnits)} {myQuote.unit}</dd></div>
                                            <div><dt>Total before GST</dt><dd>{inr(myQuote.taxableValue)}</dd></div>
                                            <div><dt>GST @ {myQuote.gstPercent}%</dt><dd>{inr(myQuote.gstAmount)}</dd></div>
                                            <div className="t"><dt>Total incl. GST</dt><dd>{inr(myQuote.total)}</dd></div>
                                            <div><dt>Validity</dt><dd>{validText(myQuote)}</dd></div>
                                        </dl>
                                    </section>
                                )}

                                {isMine && (
                                    <section className="rqp-card">
                                        <div className="rqp-sh">
                                            <div><h2>Quotes received</h2><p>{quotes.length ? "Compare suppliers, then buy from the one you like." : "Suppliers' quotes will appear here as soon as they send them."}</p></div>
                                            {quotes.length > 1 && (
                                                <div className="rqp-seg" role="group" aria-label="Sort quotes">
                                                    {[["price", "Lowest price"], ["delivery", "Fastest"], ["newest", "Newest"]].map(([k, l]) => (
                                                        <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {quotes.length === 0 ? (
                                            <div className="rqp-none"><Send size={22} /><b>No quotes yet</b><span>{live ? "Share this enquiry to get quotes faster." : "Quotes open once the enquiry is live."}</span></div>
                                        ) : (
                                            <div className="rqp-qs">{quotes.map((q) => <QuoteCard key={q.id} q={q} tags={tagsFor(q)} enquiryId={item.id} onZoom={openLightbox} />)}</div>
                                        )}
                                    </section>
                                )}
                            </main>

                            <aside className="rqp-side">
                                <div className="rqp-card rqp-ac">{action}</div>
                                {!isMine && (
                                    <div className="rqp-card">
                                        <p className="rqp-cap">Why sellers join</p>
                                        <div className="rqp-why mt-3">
                                            {WHY.map(([t, d, Icon]) => (<div key={t}><span><Icon size={16} /></span><div><b>{t}</b><small>{d}</small></div></div>))}
                                        </div>
                                    </div>
                                )}
                            </aside>
                        </div>
                    </>
                )}

                <footer className="rqp-ft"><b>BBM Marketplace</b> · More buyers. More business. Less selling effort.</footer>
            </div>

            {!loading && item && !isMine && live && (
                <div className="rqp-bar">
                    {myQuote
                        ? <><span className="rqp-done"><Check size={16} />Quote sent</span><button type="button" className="rqp-btn" disabled={quoteBusy} onClick={onQuoteClick}>{checking ? "Checking…" : "Edit quote"}</button></>
                        : <button type="button" className="rqp-btn go blk" disabled={quoteBusy} onClick={onQuoteClick}><Send size={16} />{quoteLabel}</button>}
                </div>
            )}

            <div className={`rqp-toast${toast ? " on" : ""}`} role="status">{toast}</div>

            {quoteOpen && item && (
                <RfqQuoteModal key="quote" enquiry={item} initialSubmissionId={quoteOpen.submissionId}
                    onClose={() => setQuoteOpen(null)} onDone={onQuoteDone} />
            )}

            {/* Portal on <body> so the fullscreen layer is never trapped inside a transformed parent. */}
            {createPortal(
                <AnimatePresence>
                    {lightbox && (
                        <ImageLightbox key="lightbox" images={lightbox.images} initialIndex={lightbox.index} alt={lightbox.alt} onClose={closeLightbox} />
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
}