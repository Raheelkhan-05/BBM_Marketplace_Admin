// src/pages/GrowWalletPage.jsx — seller wallet in the new GROW UI.
// Same data and logic as SellerWalletPage (status, ledger with closing balances, breakdowns, payments).
// Top-ups are paid on JioPay's hosted checkout: "Proceed to pay" redirects there and the seller comes
// back through /payment/return, which shows the verified result and links back here.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchWalletStatus, fetchWalletTransactions, fetchWalletPayments } from "../utils/walletApi.js";
import { startWalletPayment, redirectToGateway } from "../utils/paymentsApi.js";
import Ic from "../components/growSeller/Ic.jsx";
import { Empty } from "../components/growSeller/ui.jsx";
import { useGrowSeller } from "../context/GrowSellerContext.js";
import { inr, dateTime } from "../components/growSeller/sellerHelpers.js";
import "../components/growSeller/grow-wallet.css";

// Module-scoped: survives navigating away and back, resets on a hard reload.
const PAGE = 20;
let walletCache = null; // { wallet, txns, nextCursor, hasMore, payments }

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// `sign` is the effect on the seller's credits, not the raw sign stored in the DB row
// (payment_made is still stored negative from the old debt model).
const TXN_LABEL = {
    commission_accrued: { label: "Marketing & promotion (incl. GST)", sign: -1, icon: "mega" },
    commission_reversed: { label: "Marketing charges reversed", sign: 1, icon: "repeat" },
    payment_made: { label: "Credits added", sign: 1, icon: "plus" },
    signup_credit: { label: "Welcome credits", sign: 1, icon: "plus" },
    manual_adjustment: { label: "Adjustment", sign: null, icon: "edit" },
};

function effectOnBalance(t) {
    const meta = TXN_LABEL[t.type];
    if (!meta || meta.sign === null) return Number(t.amount) || 0;
    return meta.sign * Math.abs(Number(t.amount) || 0);
}

function withClosingBalances(txns, currentBalance) {
    let running = Number(currentBalance) || 0;
    return txns.map((t) => {
        const closingBalance = running;
        running = round2(running - effectOnBalance(t));
        return { ...t, closingBalance };
    });
}

function balanceGradient(balance, threshold) {
    const ratio = threshold > 0 ? Math.max(0, Math.min(1, balance / threshold)) : 1;
    if (ratio <= 0) return "linear-gradient(135deg, #a11a10 0%, #c71f11 100%)";
    if (ratio <= 0.25) return "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)";
    if (ratio <= 0.5) return "linear-gradient(135deg, #b8860b 0%, #d99a1f 100%)";
    return "linear-gradient(135deg, #047084 0%, #0B7285 100%)";
}

function Breakdown({ t }) {
    const b = t.breakdown;
    const services = Array.isArray(b.services) ? b.services : [];
    const fee = Number(b.feeAmount) || 0, gst = Number(b.gstAmount) || 0, total = Number(b.total) || 0;
    return (
        <div className="wx-bd">
            {b.orderValue != null && <p>Order value ₹{inr(b.orderValue)} × {b.feePercent}% = ₹{inr(fee)}</p>}
            {services.map((s) => (
                <div key={s.key}>
                    <span>{s.label}{s.percent != null ? ` (${s.percent}%)` : ""}</span>
                    <b>₹{inr(s.amount)}</b>
                </div>
            ))}
            <div className="t" style={{ marginTop: services.length ? 4 : 0 }}><span style={{ textTransform: "none", letterSpacing: 0, fontSize: ".86rem", fontWeight: 600, color: "var(--mute)" }}>Fee</span><b>₹{inr(fee)}</b></div>
            <div><span>GST on fee ({b.gstPercent}%)</span><b>₹{inr(gst)}</b></div>
            <div className="t"><span>Total</span><b>₹{inr(total)}</b></div>
        </div>
    );
}

function TxnRow({ t, onOrder }) {
    const [open, setOpen] = useState(false);
    const meta = TXN_LABEL[t.type] || { label: t.type, sign: null, icon: "receipt" };
    const effect = effectOnBalance(t);
    const kind = meta.sign === null ? (effect > 0 ? "in" : effect < 0 ? "out" : "neu") : meta.sign > 0 ? "in" : "out";
    const hasNote = !!(t.note && t.note.trim());
    const hasBreakdown = !!t.breakdown && Array.isArray(t.breakdown.services);
    const amountText = meta.sign === null
        ? `${t.amount > 0 ? "+" : t.amount < 0 ? "−" : ""}₹${inr(Math.abs(t.amount))}`
        : `${meta.sign > 0 ? "+" : "−"}₹${inr(Math.abs(t.amount))}`;
    return (
        <div className="wx-row">
            <div className="wx-top">
                <span className={`wx-ic ${kind}`}><Ic n={meta.icon} /></span>
                <div className="wx-main">
                    <b>{meta.label}</b>
                    {hasNote && <p className="wx-note">{t.note}</p>}
                    <p className="wx-date">{dateTime(t.created_at)}</p>
                    {(hasBreakdown || t.order_id) && (
                        <div className="wx-acts">
                            {hasBreakdown && (
                                <button type="button" className="wx-link" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                                    {open ? "Hide breakdown" : "View breakdown"}<Ic n="chev" />
                                </button>
                            )}
                            {t.order_id && <button type="button" className="wx-link mu" onClick={() => onOrder(t.order_id)}>View order</button>}
                        </div>
                    )}
                </div>
                <div className="wx-amt">
                    <b className={kind === "neu" ? "" : kind}>{amountText}</b>
                    <small>Bal ₹{inr(t.closingBalance)}</small>
                </div>
            </div>
            {hasBreakdown && open && <Breakdown t={t} />}
        </div>
    );
}

export default function GrowWalletPage() {
    const nav = useNavigate();
    const { token } = useAuth();
    const { refreshWallet } = useGrowSeller();
    const [wallet, setWallet] = useState(walletCache?.wallet ?? null);
    const [txns, setTxns] = useState(walletCache?.txns ?? []);
    const [payments, setPayments] = useState(walletCache?.payments ?? []);
    const [loading, setLoading] = useState(!walletCache);
    const [payAmount, setPayAmount] = useState("");
    const [paying, setPaying] = useState(false);
    const [amountError, setAmountError] = useState(null);
    const [filter, setFilter] = useState("all");
    const [nextCursor, setNextCursor] = useState(walletCache?.nextCursor ?? null);
    const [hasMore, setHasMore] = useState(walletCache?.hasMore ?? false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [moreError, setMoreError] = useState(false);
    const moreLock = useRef(false);

    // Only block on the skeleton if there is nothing to show yet; refreshes happen quietly.
    const load = useCallback(async ({ background = false } = {}) => {
        if (!background) setLoading(true);
        const [w, t, p] = await Promise.all([
            fetchWalletStatus(token),
            fetchWalletTransactions(token, { limit: PAGE }),
            fetchWalletPayments(token),
        ]);
        const next = {
            wallet: w?.success ? w.wallet : walletCache?.wallet ?? null,
            txns: t?.success ? t.transactions : walletCache?.txns ?? [],
            nextCursor: t?.success ? t.nextCursor ?? null : walletCache?.nextCursor ?? null,
            hasMore: t?.success ? !!t.hasMore : walletCache?.hasMore ?? false,
            payments: p?.success ? p.payments : walletCache?.payments ?? [],
        };
        walletCache = next;
        setWallet(next.wallet);
        setTxns(next.txns);
        setNextCursor(next.nextCursor);
        setHasMore(next.hasMore);
        setPayments(next.payments);
        setMoreError(false);
        setLoading(false);
    }, [token]);

    const loadMore = useCallback(async () => {
        if (moreLock.current || !hasMore || !nextCursor) return;
        moreLock.current = true;
        setLoadingMore(true);
        setMoreError(false);
        const res = await fetchWalletTransactions(token, { limit: PAGE, cursor: nextCursor });
        if (res?.success) {
            const seen = new Set(txns.map((t) => t.id));
            const merged = [...txns, ...(res.transactions || []).filter((t) => !seen.has(t.id))];
            walletCache = { ...walletCache, txns: merged, nextCursor: res.nextCursor ?? null, hasMore: !!res.hasMore };
            setTxns(merged);
            setNextCursor(res.nextCursor ?? null);
            setHasMore(!!res.hasMore);
        } else {
            setMoreError(true); // stops auto-loading until the seller taps "Try again"
        }
        setLoadingMore(false);
        moreLock.current = false;
    }, [token, hasMore, nextCursor, txns]);

    useEffect(() => {
        if (!token) return;
        // After a JioPay top-up the seller lands back here: refresh the page data and the header balance once.
        load({ background: !!walletCache }).then(() => refreshWallet?.());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, token]);

    // Back/forward cache: if the seller presses Back from the payment page, unfreeze the button.
    useEffect(() => {
        const onShow = (e) => { if (e.persisted) setPaying(false); };
        window.addEventListener("pageshow", onShow);
        return () => window.removeEventListener("pageshow", onShow);
    }, []);

    const annotated = useMemo(() => withClosingBalances(txns, wallet?.balance_due), [txns, wallet?.balance_due]);
    const shown = useMemo(() => annotated.filter((t) => {
        if (filter === "all") return true;
        const e = effectOnBalance(t);
        return filter === "in" ? e > 0 : e < 0;
    }), [annotated, filter]);

    const sentinelRef = useRef(null);
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || !hasMore || loadingMore || moreError) return undefined;
        const io = new IntersectionObserver(
            (entries) => { if (entries[0].isIntersecting) loadMore(); },
            { rootMargin: "300px 0px" } // start loading a little before the bottom is reached
        );
        io.observe(el);
        return () => io.disconnect();
        // shown.length re-arms the observer, so a short filtered list keeps loading until it fills the screen
    }, [hasMore, loadingMore, moreError, loadMore, shown.length]);

    const proceed = async () => {
        if (paying) return;
        setAmountError(null);
        const raw = String(payAmount).trim();
        if (!/^\d+(\.\d{1,2})?$/.test(raw) || !(Number(raw) > 0)) { setAmountError("Enter a valid amount (up to 2 decimals)."); return; }
        if (Number(raw) < 1 || Number(raw) > 1000000) { setAmountError("Amount must be between ₹1 and ₹10,00,000."); return; }

        setPaying(true);
        const res = await startWalletPayment(token, raw);
        if (!res?.success || !redirectToGateway(res.redirectUrl)) {
            setPaying(false);
            setAmountError(res?.message || "Couldn't start the payment. Please try again.");
        }
        // On success the window navigates to JioPay; keep the button in its busy state until it does.
    };

    if (loading) {
        return (
            <div className="v" aria-busy="true">
                <div className="sk line" style={{ marginTop: 28, width: "40%" }} />
                <div className="sk tall" style={{ marginTop: 18 }} />
                <div className="sk" style={{ marginTop: 14 }} />
            </div>
        );
    }

    if (!wallet) {
        return (
            <div className="v" style={{ marginTop: 28 }}>
                <Empty title="Couldn't load your wallet" text="Check your connection and try again.">
                    <br /><button className="bt go" type="button" onClick={() => load()}>Try again</button>
                </Empty>
            </div>
        );
    }

    const isBlocked = !!wallet.is_blocked;
    const isThreshold = wallet.billing_mode === "threshold";
    const quick = [500, 1000, 5000, ...(Number(wallet.threshold_amount) > 0 ? [Math.round(Number(wallet.threshold_amount))] : [])]
        .filter((v, i, a) => a.indexOf(v) === i);

    return (
        <div className="v">
            <div className="back">
                {/* <button className="ib" type="button" aria-label="Back to products" onClick={() => nav("/grow/products")}><Ic n="back" /></button> */}
                <div className="hh">
                    <h1>Wallet</h1>
                    <div className="live"><i />Credits, charges and payments</div>
                </div>
            </div>

            <div className="dgrid">
                <div className="dcol">
                    {isBlocked && (
                        <div className="wx-blk" role="alert">
                            <Ic n="alert" />
                            <div>
                                <b>New orders are paused</b>
                                <span>
                                    {wallet.blocked_reason === "monthly_unpaid"
                                        ? "You have an unpaid balance from a previous month. Clear it below to start receiving orders again."
                                        : "You've run out of order credits. Add credits below to start receiving orders again."}
                                </span>
                            </div>
                        </div>
                    )}

                    <div className="wx-hero" style={{ background: balanceGradient(wallet.balance_due, wallet.threshold_amount) }}>
                        <div className="wx-lab">Available credits</div>
                        <div className="wx-bal"><span>₹</span>{inr(wallet.balance_due)}</div>
                        <div className="wx-sub">
                            {isThreshold
                                ? <><Ic n="lock" />Recharge before it hits ₹0, to smoothly receive orders</>
                                : <><Ic n="clock" />Monthly mode · settle by the 1st of next month</>}
                        </div>
                    </div>

                    <div className="card">
                        <div className="ctl">{isThreshold ? "Add credits" : "Pay platform commission"}</div>
                        <div className="f" style={{ marginTop: 0 }}>
                            <label htmlFor="wx-amt">Amount</label>
                            <div className="inp">
                                <span className="pre">₹</span>
                                <input id="wx-amt" type="text" inputMode="decimal" value={payAmount} disabled={paying}
                                    placeholder={isThreshold ? `e.g. ${inr(wallet.threshold_amount)}` : `Up to ${inr(wallet.balance_due)}`}
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); proceed(); } }}
                                    onChange={(e) => { setPayAmount(e.target.value.replace(/[^\d.]/g, "")); setAmountError(null); }} />
                            </div>
                        </div>
                        {isThreshold && (
                            <div className="wx-quick" role="group" aria-label="Quick amounts">
                                {quick.map((v) => (
                                    <button key={v} type="button" aria-pressed={Number(payAmount) === v} disabled={paying} onClick={() => { setPayAmount(String(v)); setAmountError(null); }}>
                                        ₹{v.toLocaleString("en-IN")}
                                    </button>
                                ))}
                            </div>
                        )}
                        {amountError && <p className="wx-err">{amountError}</p>}
                        <p className="wx-hint">You'll be taken to JioPay's secure page to pay by card, UPI or net banking. Credits are added automatically as soon as the payment is confirmed.</p>
                        <button className="bt go blk" type="button" style={{ marginTop: 14 }} onClick={proceed} disabled={paying}>
                            {paying ? "Redirecting to JioPay…" : "Proceed to pay"}
                        </button>
                    </div>

                    {payments.length > 0 && (
                        <div className="card">
                            <div className="ctl">Payment history</div>
                            {payments.map((p) => (
                                <div className="wx-pay" key={p.id}>
                                    <div>
                                        <b>₹{inr(p.amount)}</b>
                                        <small>{[p.billing_period, new Date(p.created_at).toLocaleDateString("en-IN")].filter(Boolean).join(" · ")}</small>
                                    </div>
                                    <span className={`stt ${p.status === "verified" ? "delivered" : p.status === "rejected" ? "rejected" : "pending_confirmation"}`}>{p.status}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="dcol">
                    <div className="card">
                        <div className="wx-head">
                            <div className="ctl">Transaction ledger</div>
                            {annotated.length > 0 && <small>Latest balance<br />₹{inr(annotated[0].closingBalance)}</small>}
                        </div>

                        {annotated.length === 0 ? (
                            <p className="sub2" style={{ marginTop: 0 }}>No transactions yet.</p>
                        ) : (
                            <>
                                <div className="wx-fil" role="group" aria-label="Filter transactions">
                                    {[["all", "All"], ["in", "Credits added"], ["out", "Charges"]].map(([k, l]) => (
                                        <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
                                    ))}
                                </div>

                                {shown.length === 0 ? (
                                    <p className="sub2" style={{ margin: "14px 0 4px" }}>Nothing in this view.</p>
                                ) : shown.map((t) => <TxnRow key={t.id} t={t} onOrder={(id) => nav(`/grow/orders/${id}`)} />)}

                                {/* Scroll trigger + loading / error state */}
                                {hasMore && (
                                    <div ref={sentinelRef} style={{ padding: "14px 0", textAlign: "center" }}>
                                        {moreError ? (
                                            <>
                                                <p className="wx-hint" style={{ margin: "0 0 8px" }}>Couldn't load more transactions.</p>
                                                <button className="bt sm" type="button" onClick={loadMore}>Try again</button>
                                            </>
                                        ) : (
                                            <small aria-live="polite">{loadingMore ? "Loading more…" : " "}</small>
                                        )}
                                    </div>
                                )}

                                {/* Opening balance only makes sense once the oldest transaction is loaded. */}
                                {!hasMore && (
                                    <div className="wx-open">
                                        <span>Opening balance</span>
                                        <b>₹{inr(annotated[annotated.length - 1].closingBalance - effectOnBalance(annotated[annotated.length - 1]))}</b>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}