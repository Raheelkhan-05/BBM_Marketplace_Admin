// pages/SellerWalletPage.jsx
// Top-ups are paid on JioPay's hosted checkout: "Proceed to pay" redirects there and the seller comes
// back through /payment/return, which shows the verified result and links back here.
import { useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Wallet, Loader2, AlertTriangle, IndianRupee, Clock, ShieldCheck, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchWalletStatus, fetchWalletTransactions, fetchWalletPayments } from "../utils/walletApi.js";
import { startWalletPayment, redirectToGateway } from "../utils/paymentsApi.js";
import { C } from "../components/catalog/tokens";

// Module-scoped — survives unmount/remount as you navigate away and back,
// but resets on a hard page reload (which is fine; a hard reload should
// fetch fresh anyway). Keyed by nothing since this page is per-seller and
// the token implicitly scopes it — swap to a Map keyed by seller id if
// this page is ever reused across accounts without a full remount.
let walletCache = null; // { wallet, txns, payments }

function inr(n) { return (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }

function Card({ title, children, right }) {
    return (
        <div className="mt-4 rounded-2xl border bg-white p-4" style={{ borderColor: C.hair }}>
            <div className="flex items-center justify-between">
                <p className="text-[12px] font-extrabold uppercase tracking-[0.08em]" style={{ color: "#4A535B" }}>{title}</p>
                {right}
            </div>
            <div className="mt-3">{children}</div>
        </div>
    );
}

// `sign` is the semantic effect on the seller's credits, NOT the raw sign
// stored in the DB row — wallet_verify_payment still writes payment_made
// as a negative amount (legacy from the old debt model, where a payment
// reduced a debt total). Deriving sign from type instead of trusting
// t.amount's sign keeps the ledger readable without needing a DB migration.
const TXN_LABEL = {
    commission_accrued: { label: "Marketing & promotion (incl. GST)", color: "#c71f11", sign: -1 },
    commission_reversed: { label: "Marketing charges reversed", color: "#059669", sign: 1 },
    payment_made: { label: "Credits added", color: "#059669", sign: 1 },
    signup_credit: { label: "Welcome credits", color: "#059669", sign: 1 },
    manual_adjustment: { label: "Adjustment", color: C.muted, sign: null },
};

function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

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

function BreakdownPanel({ t }) {
    const b = t.breakdown;
    const services = Array.isArray(b.services) ? b.services : [];
    const fee = Number(b.feeAmount) || 0, gst = Number(b.gstAmount) || 0, total = Number(b.total) || 0;
    const row = "flex items-center justify-between gap-2 text-[12px] font-semibold tracking-wide";
    return (
        <div className="mt-2 rounded-xl border p-2.5" style={{ borderColor: C.hairSoft, background: "#FCFBF9" }}>
            {b.orderValue != null && (
                <p className="mb-1.5 text-[11px] font-semibold tabular-nums tracking-wide" style={{ color: C.muted }}>
                    Order value ₹{inr(b.orderValue)} × {b.feePercent}% = ₹{inr(fee)}
                </p>
            )}
            <div className="flex flex-col gap-1">
                {services.map((s) => (
                    <div key={s.key} className={row} style={{ color: C.muted }}>
                        <span className="min-w-0 truncate">{s.label}{s.percent != null ? ` (${s.percent}%)` : ""}</span>
                        <span className="tabular-nums font-bold" style={{ color: C.ink }}>₹{inr(s.amount)}</span>
                    </div>
                ))}
                <div className={`${row} border-t pt-1`} style={{ color: C.muted, borderColor: C.hairSoft }}>
                    <span>Fee</span><span className="tabular-nums font-bold" style={{ color: C.ink }}>₹{inr(fee)}</span>
                </div>
                <div className={row} style={{ color: C.muted }}>
                    <span>GST on fee ({b.gstPercent}%)</span><span className="tabular-nums font-bold" style={{ color: C.ink }}>₹{inr(gst)}</span>
                </div>
                <div className={`${row} border-t pt-1`} style={{ borderColor: C.hair }}>
                    <span className="font-extrabold uppercase" style={{ color: C.ink }}>Total</span>
                    <span className="tabular-nums font-extrabold" style={{ color: C.ink }}>₹{inr(total)}</span>
                </div>
            </div>
        </div>
    );
}

function TxnRow({ t, navigate }) {
    const [open, setOpen] = useState(false);
    const meta = TXN_LABEL[t.type] || { label: t.type, color: C.muted, sign: null };
    const hasOrder = !!t.order_id;
    const hasNote = !!(t.note && t.note.trim());
    const hasBreakdown = !!t.breakdown && Array.isArray(t.breakdown.services);
    return (
        <div className="border-b pb-2.5 last:border-b-0 last:pb-0" style={{ borderColor: C.hairSoft }}>
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>{meta.label}</p>
                    {hasNote && <p className="mt-0.5 overflow-hidden whitespace-pre-wrap text-[11.5px] font-medium tracking-wide" style={{ color: C.muted }}>{t.note}</p>}
                    <p className="mt-0.5 text-[11px] font-semibold tracking-wider" style={{ color: C.muted }}>{new Date(t.created_at).toLocaleString("en-IN")}</p>
                    <div className="mt-1 flex items-center gap-3">
                        {hasBreakdown && (
                            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
                                className="flex items-center gap-1 text-[11px] font-bold" style={{ color: C.ink }}>
                                {open ? "Hide breakdown" : "View breakdown"}
                                <ChevronDown className="h-3 w-3 transition-transform duration-200" style={{ transform: open ? "rotate(180deg)" : "none" }} />
                            </button>
                        )}
                        {hasOrder && (
                            <button type="button" onClick={() => navigate(`/seller/orders/${t.order_id}`)} className="text-[11px] font-bold underline" style={{ color: C.muted }}>
                                View order
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <p className="text-[15px] font-extrabold tabular-nums" style={{ color: meta.color }}>
                        {meta.sign === null ? `${t.amount > 0 ? "+" : ""}₹${inr(t.amount)}` : `${meta.sign > 0 ? "+" : "−"}₹${inr(Math.abs(t.amount))}`}
                    </p>
                    <p className="text-[10.5px] font-semibold tabular-nums tracking-wide" style={{ color: C.muted }}>Bal: ₹{inr(t.closingBalance)}</p>
                </div>
            </div>
            {hasBreakdown && open && <BreakdownPanel t={t} />}
        </div>
    );
}

function balanceGradient(balance, threshold) {
    const ratio = threshold > 0 ? Math.max(0, Math.min(1, balance / threshold)) : 1;
    if (ratio <= 0) return "linear-gradient(135deg, #a11a10 0%, #c71f11 100%)";
    if (ratio <= 0.25) return "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)";
    if (ratio <= 0.5) return "linear-gradient(135deg, #b8860b 0%, #d99a1f 100%)";
    return "linear-gradient(135deg, #047084 0%, #0B7285 100%)";
}

export default function SellerWalletPage() {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [wallet, setWallet] = useState(walletCache?.wallet ?? null);
    const [txns, setTxns] = useState(walletCache?.txns ?? []);
    const [payments, setPayments] = useState(walletCache?.payments ?? []);
    // Only block on the spinner if we have NOTHING to show yet — a
    // background refresh should never re-show a full-page loader.
    const [loading, setLoading] = useState(!walletCache);

    const [payAmount, setPayAmount] = useState("");
    const [paying, setPaying] = useState(false);
    const [amountError, setAmountError] = useState(null);

    const load = useCallback(async ({ background = false } = {}) => {
        if (!background) setLoading(true);
        const [w, t, p] = await Promise.all([fetchWalletStatus(token), fetchWalletTransactions(token), fetchWalletPayments(token)]);
        const next = {
            wallet: w?.success ? w.wallet : walletCache?.wallet ?? null,
            txns: t?.success ? t.transactions : walletCache?.txns ?? [],
            payments: p?.success ? p.payments : walletCache?.payments ?? [],
        };
        walletCache = next;
        setWallet(next.wallet);
        setTxns(next.txns);
        setPayments(next.payments);
        setLoading(false);
    }, [token]);

    const annotatedTxns = useMemo(
        () => withClosingBalances(txns, wallet?.balance_due),
        [txns, wallet?.balance_due]
    );

    useEffect(() => {
        if (!token) return;
        // If we already have cached data, render it instantly and refresh
        // quietly in the background instead of blocking on a fresh fetch.
        load({ background: !!walletCache });
    }, [load, token]);

    // Back/forward cache: if the seller presses Back from the payment page, unfreeze the button.
    useEffect(() => {
        const onShow = (e) => { if (e.persisted) setPaying(false); };
        window.addEventListener("pageshow", onShow);
        return () => window.removeEventListener("pageshow", onShow);
    }, []);

    const handleProceedToPay = async () => {
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
        // On success the window navigates to JioPay; keep the button busy until it does.
    };

    if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: C.muted }} /></div>;

    // The wallet request failed and there is nothing cached to show.
    if (!wallet) {
        return (
            <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
                <p className="text-[14px] font-bold" style={{ color: C.ink }}>Couldn't load your wallet</p>
                <p className="mt-1 text-[12.5px] font-medium" style={{ color: C.muted }}>Check your connection and try again.</p>
                <button onClick={() => load()} className="mt-4 rounded-xl px-5 py-2.5 text-[13px] font-bold text-white" style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>Try again</button>
            </div>
        );
    }

    const isBlocked = wallet?.is_blocked;
    const isThreshold = wallet.billing_mode === "threshold";

    return (
        <div className="mx-auto min-h-screen max-w-3xl px-2.5 pb-16 pt-3 sm:px-4">
            <div className="mt-3 flex items-center gap-3">
                <button onClick={() => navigate('/seller/products')} className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: C.hair, color: C.ink }}><ArrowLeft className="h-4 w-4" /></button>
                <h1 className="flex items-center gap-2 font-extrabold tracking-wide" style={{ color: C.ink, fontSize: "clamp(20px,1.8vw,26px)" }}>
                    <Wallet className="h-5 w-5" style={{ color: C.secondary }} /> Wallet
                </h1>
            </div>

            {isBlocked && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex items-start gap-2.5 rounded-2xl border p-3.5" style={{ borderColor: "#c71f1140", background: "#c71f1108" }}>
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#c71f11" }} />
                    <div>
                        <p className="text-[13px] font-extrabold tracking-wide" style={{ color: "#c71f11" }}>New orders are paused</p>
                        <p className="mt-0.5 text-[12.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                            {wallet.blocked_reason === "monthly_unpaid"
                                ? "You have an unpaid balance from a previous month. Clear it below to start receiving orders again."
                                : "You've run out of order credits. Add credits below to start receiving orders again."}
                        </p>
                    </div>
                </motion.div>
            )}

            {/* ---- Balance summary ---- */}
            <div className="mt-4 rounded-2xl p-4 text-white" style={{ background: balanceGradient(wallet.balance_due, wallet.threshold_amount) }}>
                <p className="text-[12px] font-bold uppercase tracking-[0.15em] opacity-90">Available credits</p>
                <p className="mt-1 flex items-center text-[34px] font-extrabold tabular-nums"><IndianRupee className="h-6 w-6" />{inr(wallet.balance_due)}</p>
                <div className="mt-1 flex items-center gap-2 text-[12.5px] font-semibold opacity-90 tracking-wider">
                    {isThreshold ? (
                        <><ShieldCheck className="h-3.5 w-3.5" />Recharge before it hits ₹0, to smoothly receive orders</>
                    ) : (
                        <><Clock className="h-3.5 w-3.5" /> Monthly mode · settle by the 1st of next month</>
                    )}
                </div>
            </div>

            {/* ---- Add credits ---- */}
            <Card title={isThreshold ? "Add credits" : "Pay platform commission"}>
                <div className="flex flex-col gap-2.5">
                    <div>
                        <label className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>Amount</label>
                        <input type="text" inputMode="decimal" value={payAmount} disabled={paying}
                            onChange={(e) => { setPayAmount(e.target.value.replace(/[^\d.]/g, "")); setAmountError(null); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleProceedToPay(); } }}
                            placeholder={isThreshold ? `e.g. ₹${inr(wallet.threshold_amount)}` : `Up to ₹${inr(wallet.balance_due)}`}
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-[13.5px] font-bold tabular-nums" style={{ borderColor: C.hair }} />
                    </div>
                    {amountError && <p className="text-[11.5px] font-semibold" style={{ color: "#c71f11" }}>{amountError}</p>}
                    <p className="text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                        You'll be taken to JioPay's secure page to pay by card, UPI or net banking. Credits are added automatically as soon as the payment is confirmed.
                    </p>
                    <button onClick={handleProceedToPay} disabled={paying}
                        className="rounded-xl px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-60" style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
                        {paying ? "Redirecting to JioPay…" : "Proceed to pay"}
                    </button>
                </div>
            </Card>

            {/* ---- Payment history ---- */}
            {payments.length > 0 && (
                <Card title="Payment history">
                    <div className="flex flex-col gap-2.5">
                        {payments.map((p) => (
                            <div key={p.id} className="flex items-center justify-between">
                                <div>
                                    <p className="text-[15px] font-bold tabular-nums tracking-wide" style={{ color: C.ink }}>₹{inr(p.amount)}</p>
                                    <p className="text-[11.5px] font-semibold tracking-wider" style={{ color: C.muted }}>{p.billing_period} · {new Date(p.created_at).toLocaleDateString("en-IN")}</p>
                                </div>
                                <span className="rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide"
                                    style={p.status === "verified" ? { background: "#05966912", color: "#059669" } : p.status === "rejected" ? { background: "#c71f1112", color: "#c71f11" } : { background: "#f59e0b12", color: "#a16207" }}>
                                    {p.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* ---- Ledger ---- */}
            <Card
                title="Transaction ledger"
                right={
                    annotatedTxns.length > 0 && (
                        <span className="text-[10.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                            Latest balance: ₹{inr(annotatedTxns[0].closingBalance)}
                        </span>
                    )
                }
            >
                {annotatedTxns.length === 0 ? (
                    <p className="text-[12.5px] font-semibold tracking-wide" style={{ color: C.muted }}>No transactions yet.</p>
                ) : (
                    <>
                        <div className="flex flex-col gap-2.5">
                            {annotatedTxns.map((t) => <TxnRow key={t.id} t={t} navigate={navigate} />)}
                        </div>

                        {/* Opening balance — what the balance was BEFORE the oldest
                transaction shown, so the ledger reads as a closed loop
                rather than just "closing balance per row" floating with
                no anchor at the bottom. */}
                        <div className="mt-3 border-t pt-2.5" style={{ borderColor: C.hairSoft }}>
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>
                                    Opening balance
                                </span>
                                <span className="text-[12px] font-extrabold tabular-nums" style={{ color: C.ink }}>
                                    ₹{inr(
                                        annotatedTxns[annotatedTxns.length - 1].closingBalance
                                        - effectOnBalance(annotatedTxns[annotatedTxns.length - 1])
                                    )}
                                </span>
                            </div>
                        </div>

                        {/* This page's ledger endpoint returns at most 100 rows — a
                seller with more history than that would otherwise see
                the list just stop with no indication why. */}
                        {txns.length >= 100 && (
                            <p className="mt-2 text-[11px] font-medium" style={{ color: C.muted }}>
                                Showing your most recent 100 transactions.
                            </p>
                        )}
                    </>
                )}
            </Card>
        </div>
    );
}