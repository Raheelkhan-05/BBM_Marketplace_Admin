// pages/SellerWalletPage.jsx
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Wallet, Loader2, AlertTriangle, IndianRupee, Clock, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchWalletStatus, fetchWalletTransactions, fetchWalletPayments } from "../utils/walletApi.js";
import { C } from "../components/catalog/tokens";
import WalletPaymentQRModal from "../components/WalletPaymentQRModal.jsx";

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
    commission_accrued: { label: "Commission + GST deducted", color: "#c71f11", sign: -1 },
    commission_reversed: { label: "Commission reversed", color: "#059669", sign: 1 },
    payment_made: { label: "Credits added", color: "#059669", sign: 1 },
    manual_adjustment: { label: "Adjustment", color: C.muted, sign: null }, // unknown intent — show raw
};

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
    const [wallet, setWallet] = useState(null);
    const [txns, setTxns] = useState([]);
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);

    const [payAmount, setPayAmount] = useState("");
    const [showQrModal, setShowQrModal] = useState(false);
    const [amountError, setAmountError] = useState(null);
    const [notice, setNotice] = useState(null);

    const load = useCallback(async () => {
        const [w, t, p] = await Promise.all([fetchWalletStatus(token), fetchWalletTransactions(token), fetchWalletPayments(token)]);
        if (w?.success) setWallet(w.wallet);
        if (t?.success) setTxns(t.transactions);
        if (p?.success) setPayments(p.payments);
        setLoading(false);
    }, [token]);

    useEffect(() => {
        if (!token) return; // don't fire wallet calls before auth is ready
        load();
    }, [load, token]);

    const handleProceedToPay = () => {
        setAmountError(null);
        if (!(Number(payAmount) > 0)) { setAmountError("Enter a valid amount."); return; }
        setShowQrModal(true);
    };

    const handlePaymentSubmitted = () => {
        setPayAmount("");
        setNotice("Credits submitted for verification.");
        load();
    };

    if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: C.muted }} /></div>;

    const isBlocked = wallet?.is_blocked;
    const isThreshold = wallet.billing_mode === "threshold";

    return (
        <div className="mx-auto min-h-screen max-w-3xl px-2.5 pb-16 pt-3 sm:px-4">
            <div className="mt-3 flex items-center gap-3">
                <button onClick={() => navigate('/seller/listings')} className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: C.hair, color: C.ink }}><ArrowLeft className="h-4 w-4" /></button>
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
                        <input type="text" inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value.replace(/[^\d.]/g, ""))}
                            placeholder={isThreshold ? `e.g. ₹${inr(wallet.threshold_amount)}` : `Up to ₹${inr(wallet.balance_due)}`}
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-[13.5px] font-bold tabular-nums" style={{ borderColor: C.hair }} />
                    </div>
                    {amountError && <p className="text-[11.5px] font-semibold" style={{ color: "#c71f11" }}>{amountError}</p>}
                    <p className="text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                        Test mode — payment is simulated. You'll get a QR code on the next step to pay and submit your UTR.
                    </p>
                    <button onClick={handleProceedToPay}
                        className="rounded-xl px-4 py-2.5 text-[13px] font-bold text-white" style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
                        Proceed to pay
                    </button>
                </div>
            </Card>

            {notice && <p className="mt-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ background: `${C.secondary}10`, color: C.secondary }}>{notice}</p>}

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
            <Card title="Transaction ledger">
                {txns.length === 0 ? (
                    <p className="text-[12.5px] font-semibold tracking-wide" style={{ color: C.muted }}>No transactions yet.</p>
                ) : (
                    <div className="flex flex-col gap-2.5">
                        {txns.map((t) => {
                            const meta = TXN_LABEL[t.type] || { label: t.type, color: C.muted };
                            return (
                                <div key={t.id} className="flex items-center justify-between border-b pb-2.5 last:border-b-0 last:pb-0" style={{ borderColor: C.hairSoft }}>
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>{meta.label}</p>
                                        <p className="truncate text-[11.5px] font-medium tracking-wider" style={{ color: C.muted }}>{t.note}</p>
                                        <p className="text-[11px] font-semibold tracking-wider" style={{ color: C.muted }}>{new Date(t.created_at).toLocaleString("en-IN")}</p>
                                    </div>
                                    <p className="shrink-0 text-[15px] font-extrabold tabular-nums" style={{ color: meta.color }}>
                                        {meta.sign === null
                                            ? `${t.amount > 0 ? "+" : ""}₹${inr(t.amount)}`
                                            : `${meta.sign > 0 ? "+" : "−"}₹${inr(Math.abs(t.amount))}`}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>

            {showQrModal && (
                <WalletPaymentQRModal
                    token={token}
                    amount={Number(payAmount)}
                    onClose={() => setShowQrModal(false)}
                    onSubmitted={handlePaymentSubmitted}
                />
            )}
        </div>
    );
}