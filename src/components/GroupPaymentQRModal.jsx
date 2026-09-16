// components/GroupPaymentQRModal.jsx
// Same UX as PaymentQRModal (UPI QR, or a NEFT/RTGS bank-transfer panel),
// but for a whole cart checkout (order group) instead of a single order —
// one payment / one UTR covers all seller orders in the group.
//
// KEYBOARD: same additions as PaymentQRModal — the UTR field submits on
// Enter, and both the UPI/NEFT method tabs and the NEFT/RTGS bank-method
// tabs (inside BankTransferPanel) support Left/Right arrow-key switching
// as a proper tab group.
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
    Loader2, CheckCircle2, Clock, Upload, Smartphone, AlertCircle, X, RefreshCw,
    Landmark, QrCode, Copy, Check, User, Hash, Building2, MapPin, ClipboardList, Zap,
} from "lucide-react";
import { C, EASE } from "./seller/listingForm/FormPrimitives.jsx";
import { motion } from "framer-motion";
import { fetchGroupPaymentInstructions, submitGroupPaymentProof } from "../utils/cartApi.js";
import {
    PAYMENT_SESSION_TTL_MS,
    DEFAULT_PAYMENT_METHOD,
    loadPaymentSession,
    savePaymentSession,
    resetPaymentSession,
    updateUtrDraft,
    updatePaymentMethod,
    clearPaymentSession,
} from "../utils/paymentSession.js";

function isMobileDevice() {
    return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}
function formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------
// Bank transfer panel — identical treatment to PaymentQRModal.jsx: hero
// amount card, a "receipt" of account details with per-field copy, a
// "copy all" action, and a compact numbered guide.
//
// KEYBOARD: NEFT/RTGS pair is a role="tablist" — Left/Right arrows move
// between the two and switch the selection.
// ---------------------------------------------------------------------
function DetailRow({ icon: Icon, label, value, mono = true, onCopy, copied }) {
    if (!value) return null;
    return (
        <div className="group flex items-center gap-3 px-4 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: C.hairSoft, color: C.muted }}>
                <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: C.muted }}>{label}</span>
                <span className={`block truncate text-[14px] font-extrabold ${mono ? "font-mono tabular-nums" : ""}`} style={{ color: C.ink, letterSpacing: mono ? "0.02em" : "0.01em" }}>
                    {value}
                </span>
            </span>
            <button type="button" onClick={onCopy} aria-label={`Copy ${label}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition"
                style={copied ? { background: "#dcfce7", color: "#16a34a" } : { background: "transparent", color: C.muted }}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
        </div>
    );
}

function StepItem({ n, title, isLast }) {
    return (
        <div className="flex gap-3">
            <div className="flex flex-col items-center">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white" style={{ background: C.secondary }}>
                    {n}
                </span>
                {!isLast && <span className="mt-1 w-px flex-1" style={{ background: C.hair, minHeight: 14 }} />}
            </div>
            <p className="pb-3.5 text-[12.5px] font-semibold leading-snug tracking-wide" style={{ color: C.ink }}>{title}</p>
        </div>
    );
}

function BankTransferPanel({ info, bankMethod, setBankMethod, msLeft, hasUpi }) {
    const [copiedField, setCopiedField] = useState(null);
    const b = info.bankDetails;

    const copy = async (field, value) => {
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            setCopiedField(field);
            setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 1500);
        } catch { /* clipboard API unavailable — value is still visible/selectable */ }
    };

    const copyAll = () => {
        const lines = [
            `Account name: ${b.accountName}`,
            `Account number: ${b.accountNumber}`,
            b.ifsc && `IFSC: ${b.ifsc}`,
            b.bankName && `Bank: ${b.bankName}`,
            b.branch && `Branch: ${b.branch}`,
            `Amount: ₹${info.amount.toLocaleString("en-IN")}`,
        ].filter(Boolean).join("\n");
        copy("all", lines);
    };

    const handleBankTabKeyDown = (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const next = bankMethod === "neft" ? "rtgs" : "neft";
        setBankMethod(next);
        e.currentTarget.querySelector(`[data-bank-tab="${next}"]`)?.focus();
    };

    return (
        <>
            <div className="flex flex-col items-center gap-1.5 rounded-2xl border p-6" style={{ borderColor: C.hair, background: `linear-gradient(180deg, ${C.secondary}08 0%, transparent 60%)` }}>
                <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: `${C.secondary}14`, color: C.secondary }}>
                    <Landmark className="h-5 w-5" />
                </span>
                <p className="mt-1 text-[26px] font-extrabold tabular-nums leading-none" style={{ color: C.ink }}>
                    ₹{info.amount.toLocaleString("en-IN")}
                </p>
                <p className="text-[12px] font-semibold tracking-wide" style={{ color: C.muted }}>Transfer to the account below — covers all sellers in this order</p>
            </div>

            <div
                className="grid grid-cols-2 gap-2"
                role="tablist"
                aria-label="Bank transfer method"
                onKeyDown={handleBankTabKeyDown}
            >
                <button
                    data-bank-tab="neft"
                    role="tab"
                    aria-selected={bankMethod === "neft"}
                    onClick={() => setBankMethod("neft")}
                    className="flex flex-col items-start gap-0.5 rounded-xl border-2 px-3.5 py-2.5 text-left transition"
                    style={bankMethod === "neft" ? { borderColor: C.secondary, background: `${C.secondary}0a` } : { borderColor: C.hair, background: "transparent" }}>
                    <span className="flex items-center gap-1.5 text-[13px] font-extrabold tracking-wide" style={{ color: bankMethod === "neft" ? C.secondary : C.ink }}>
                        <ClipboardList className="h-3.5 w-3.5" /> NEFT
                    </span>
                </button>
                <button
                    data-bank-tab="rtgs"
                    role="tab"
                    aria-selected={bankMethod === "rtgs"}
                    onClick={() => setBankMethod("rtgs")}
                    className="flex flex-col items-start gap-0.5 rounded-xl border-2 px-3.5 py-2.5 text-left transition"
                    style={bankMethod === "rtgs" ? { borderColor: C.secondary, background: `${C.secondary}0a` } : { borderColor: C.hair, background: "transparent" }}>
                    <span className="flex items-center gap-1.5 text-[13px] font-extrabold tracking-wide" style={{ color: bankMethod === "rtgs" ? C.secondary : C.ink }}>
                        <Zap className="h-3.5 w-3.5" /> RTGS
                    </span>
                </button>
            </div>

            <div className="overflow-hidden rounded-2xl border" style={{ borderColor: C.hair }}>
                <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: C.hairSoft, background: C.hairSoft }}>
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: C.muted }}>Account details</span>
                    <button type="button" onClick={copyAll}
                        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold transition"
                        style={copiedField === "all" ? { background: "#dcfce7", color: "#16a34a" } : { background: "white", color: C.secondary, border: `1px solid ${C.hair}` }}>
                        {copiedField === "all" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copiedField === "all" ? "Copied" : "Copy all"}
                    </button>
                </div>
                <div className="divide-y" style={{ borderColor: C.hairSoft }}>
                    <DetailRow icon={User} label="Account name" value={b.accountName} mono={false} onCopy={() => copy("name", b.accountName)} copied={copiedField === "name"} />
                    <DetailRow icon={Hash} label="Account number" value={b.accountNumber} onCopy={() => copy("acct", b.accountNumber)} copied={copiedField === "acct"} />
                    <DetailRow icon={Landmark} label="IFSC code" value={b.ifsc} onCopy={() => copy("ifsc", b.ifsc)} copied={copiedField === "ifsc"} />
                    <DetailRow icon={Building2} label="Bank" value={b.bankName} mono={false} onCopy={() => copy("bank", b.bankName)} copied={copiedField === "bank"} />
                    <DetailRow icon={MapPin} label="Branch" value={b.branch} mono={false} onCopy={() => copy("branch", b.branch)} copied={copiedField === "branch"} />
                </div>
            </div>

            <div className="rounded-2xl border px-4 pt-4 pb-1" style={{ borderColor: C.hair }}>
                <StepItem n={1} title="Copy the account details above into your bank's app or netbanking portal." />
                <StepItem n={2} title={`Send exactly ₹${info.amount.toLocaleString("en-IN")} via ${bankMethod.toUpperCase()}.`} />
                <StepItem n={3} title="Come back here and enter the UTR / reference number your bank gives you." isLast />
            </div>

            <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[12px] font-semibold leading-snug" style={{ background: `${C.secondary}0f`, color: C.secondary }}>
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {formatCountdown(msLeft)} left in this window.
                {hasUpi && " Prefer scanning a QR instead? Switch to the UPI tab above."}
            </div>
        </>
    );
}

export default function GroupPaymentQRModal({ token, groupId, onClose, onDoneViewOrders }) {
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [method, setMethod] = useState(DEFAULT_PAYMENT_METHOD); // 'upi' | 'neft'
    const [bankMethod, setBankMethod] = useState("neft"); // 'neft' | 'rtgs', only relevant when method === 'neft'

    const [utr, setUtr] = useState("");
    const [screenshotFile, setScreenshotFile] = useState(null);
    const [screenshotPreview, setScreenshotPreview] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const [startedAt, setStartedAt] = useState(null);
    const [msLeft, setMsLeft] = useState(PAYMENT_SESSION_TTL_MS);
    const [expired, setExpired] = useState(false);

    useEffect(() => {
        let cancelled = false;
        // paymentSession is keyed by id — passing the groupId here works
        // exactly like it does for a single orderId.
        const cached = loadPaymentSession(groupId);

        if (cached) {
            setInfo({
                groupId,
                orderNumber: cached.orderNumber, // group_number
                amount: cached.amount,
                vpa: cached.vpa,
                payeeName: cached.payeeName,
                note: cached.note,
                upiUri: cached.upiUri,
                bankDetails: cached.bankDetails,
                existingProof: null,
            });
            setUtr(cached.utrDraft || "");
            setMethod(cached.method || DEFAULT_PAYMENT_METHOD);
            setStartedAt(cached.startedAt);
            setLoading(false);
        } else {
            setLoading(true);
        }

        (async () => {
            const res = await fetchGroupPaymentInstructions(token, groupId);
            if (cancelled) return;

            if (!res?.success) {
                if (res?.status) {
                    clearPaymentSession();
                    setError(`This order is no longer awaiting payment (status: ${res.status}). Please check your Orders page.`);
                    setInfo(null);
                } else if (!cached) {
                    setError(res?.message || "Couldn't load payment details.");
                }
                setLoading(false);
                return;
            }

            setInfo(res);
            if (res.existingProof?.status === "pending") setSubmitted(true);
            if (res.existingProof?.status === "rejected" && !cached?.utrDraft) setUtr(res.existingProof.utr_number || "");
            if (res.existingProof?.payment_method && !cached?.method) {
                const prev = res.existingProof.payment_method;
                setMethod(prev === "rtgs" || prev === "neft" ? "neft" : "upi");
                if (prev === "rtgs" || prev === "neft") setBankMethod(prev);
            } else if (!cached?.method) {
                setMethod(res.upiUri ? "upi" : "neft");
            }

            const session = savePaymentSession({
                orderId: groupId,
                orderNumber: res.orderNumber,
                amount: res.amount,
                vpa: res.vpa,
                payeeName: res.payeeName,
                note: res.note,
                upiUri: res.upiUri,
                bankDetails: res.bankDetails,
                method: cached?.method,
                utrDraft: cached?.utrDraft,
            });
            setStartedAt(session.startedAt);
            setLoading(false);
        })();

        return () => { cancelled = true; };
    }, [token, groupId]);

    useEffect(() => {
        if (!startedAt || submitted) return;
        const tick = () => {
            const remaining = PAYMENT_SESSION_TTL_MS - (Date.now() - startedAt);
            if (remaining <= 0) { setMsLeft(0); setExpired(true); } else { setMsLeft(remaining); }
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [startedAt, submitted]);

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        setScreenshotFile(file || null);
        setScreenshotPreview(file ? URL.createObjectURL(file) : null);
    };
    const handleUtrChange = (value) => { setUtr(value); updateUtrDraft(groupId, value); };
    const handleMethodChange = (next) => { setMethod(next); updatePaymentMethod(groupId, next); };

    const handleSubmit = async () => {
        if (!utr.trim()) { setError("Please enter the UTR / transaction reference number."); return; }
        setError(null);
        setSubmitting(true);
        const submitMethod = method === "neft" ? bankMethod : method;
        const res = await submitGroupPaymentProof(token, groupId, { utr: utr.trim(), method: submitMethod, screenshotFile });
        setSubmitting(false);
        if (!res?.success) { setError(res?.message || "Couldn't submit payment proof."); return; }
        clearPaymentSession();
        setSubmitted(true);
    };

    // Enter on the UTR field submits directly, same as clicking the
    // submit button, as long as something's typed and we're not already
    // mid-submission.
    const handleUtrKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (utr.trim() && !submitting) handleSubmit();
        }
    };

    const handleOpenUpiApp = () => {
        if (!info?.upiUri) return;
        window.location.href = info.upiUri;
    };

    const handleRefresh = async () => {
        setExpired(false);
        setError(null);
        setLoading(true);
        const res = await fetchGroupPaymentInstructions(token, groupId);
        setLoading(false);
        if (!res?.success) {
            setError(res?.message || "Couldn't load payment details.");
            if (res?.status) clearPaymentSession();
            return;
        }
        setInfo(res);
        if (res.existingProof?.status === "pending") setSubmitted(true);
        const session = resetPaymentSession({
            orderId: groupId, orderNumber: res.orderNumber, amount: res.amount, vpa: res.vpa,
            payeeName: res.payeeName, note: res.note, upiUri: res.upiUri, bankDetails: res.bankDetails,
            method, utrDraft: utr,
        });
        setStartedAt(session.startedAt);
        setMsLeft(PAYMENT_SESSION_TTL_MS);
    };

    const handleClose = () => { clearPaymentSession(); onClose?.(); };

    // Left/Right arrow switches between UPI and NEFT/RTGS and moves focus
    // to whichever tab becomes active — same roving-tab pattern used for
    // the NEFT/RTGS bank-method tabs inside BankTransferPanel.
    const handleMethodTabKeyDown = (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const next = method === "upi" ? "neft" : "upi";
        handleMethodChange(next);
        e.currentTarget.querySelector(`[data-tab="${next}"]`)?.focus();
    };

    const countdownWarn = msLeft <= 2 * 60 * 1000;
    const hasUpi = !!info?.upiUri;
    const hasBank = !!info?.bankDetails;
    const showTabs = hasUpi && hasBank;

    return (
        <motion.div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-[28px] bg-white sm:rounded-[24px]"
                initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}>

                <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: C.hairSoft }}>
                    <div>
                        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: C.secondary }}>Complete payment</p>
                        <h2 className="text-[17px] font-extrabold tracking-wide" style={{ color: C.ink }}>{info?.orderNumber || "Order"}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        {!loading && !submitted && !expired && info && (
                            <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold tabular-nums"
                                style={countdownWarn ? { background: "#fef3c7", color: "#a16207" } : { background: C.hairSoft, color: C.muted }}>
                                <Clock className="h-3 w-3" /> {formatCountdown(msLeft)}
                            </span>
                        )}
                        {onClose && (
                            <button onClick={handleClose} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/[0.04]">
                                <X className="h-4 w-4" style={{ color: C.muted }} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-4 px-5 py-5">
                    {loading ? (
                        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" style={{ color: C.muted }} /></div>
                    ) : error && !info ? (
                        <div className="flex flex-col items-center gap-3 py-6 text-center">
                            <p className="rounded-lg px-3 py-2 text-[13px] font-semibold" style={{ background: "rgba(199,31,17,0.08)", color: C.danger }}>{error}</p>
                            <button onClick={onDoneViewOrders} className="mt-1 w-full rounded-xl px-5 py-2.5 text-[13px] font-bold tracking-wide text-white"
                                style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
                                View my orders
                            </button>
                        </div>
                    ) : submitted ? (
                        <div className="flex flex-col items-center gap-3 py-6 text-center">
                            <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "#fef3c7", color: "#a16207" }}>
                                <Clock className="h-7 w-7" />
                            </span>
                            <h3 className="text-[15px] font-extrabold tracking-wide" style={{ color: C.ink }}>Payment submitted — awaiting verification</h3>
                            <p className="text-[12.5px] font-semibold leading-snug tracking-wide" style={{ color: C.muted }}>
                                We've received your reference number. Once verified, the sellers will be notified and your orders will move forward.
                            </p>
                            <button onClick={onDoneViewOrders} className="mt-2 w-full rounded-xl px-5 py-2.5 text-[13px] font-bold tracking-wide text-white"
                                style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
                                View my orders
                            </button>
                        </div>
                    ) : expired ? (
                        <div className="flex flex-col items-center gap-3 py-8 text-center">
                            <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(199,31,17,0.08)", color: C.danger }}>
                                <Clock className="h-7 w-7" />
                            </span>
                            <h3 className="text-[15px] font-extrabold tracking-wide" style={{ color: C.ink }}>Time's up</h3>
                            <p className="text-[12.5px] font-semibold leading-snug tracking-wide" style={{ color: C.muted }}>
                                This payment window has expired. Refresh to get fresh payment details — already paid? Your reference number is still saved below.
                            </p>
                            <button onClick={handleRefresh}
                                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl px-5 py-2.5 text-[13px] font-bold tracking-wide text-white"
                                style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
                                <RefreshCw className="h-4 w-4" /> Refresh
                            </button>
                        </div>
                    ) : (
                        <>
                            {showTabs && (
                                <div
                                    className="flex rounded-xl p-1"
                                    style={{ background: C.hairSoft }}
                                    role="tablist"
                                    aria-label="Payment method"
                                    onKeyDown={handleMethodTabKeyDown}
                                >
                                    <button
                                        data-tab="upi"
                                        role="tab"
                                        aria-selected={method === "upi"}
                                        onClick={() => handleMethodChange("upi")}
                                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] font-bold tracking-wide transition"
                                        style={method === "upi" ? { background: "white", color: C.ink, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" } : { color: C.muted }}>
                                        <QrCode className="h-3.5 w-3.5" /> UPI
                                    </button>
                                    <button
                                        data-tab="neft"
                                        role="tab"
                                        aria-selected={method === "neft"}
                                        onClick={() => handleMethodChange("neft")}
                                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] font-bold tracking-wide transition"
                                        style={method === "neft" ? { background: "white", color: C.ink, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" } : { color: C.muted }}>
                                        <Landmark className="h-3.5 w-3.5" /> NEFT / RTGS
                                    </button>
                                </div>
                            )}

                            {method === "upi" && hasUpi ? (
                                <>
                                    <div className="flex flex-col items-center gap-2 rounded-2xl border p-5" style={{ borderColor: C.hair }}>
                                        <QRCodeSVG value={info.upiUri} size={200} includeMargin />
                                        <p className="mt-1 text-[20px] font-extrabold tabular-nums" style={{ color: C.ink }}>₹{info.amount.toLocaleString("en-IN")}</p>
                                        <p className="text-[12px] font-semibold tracking-wide" style={{ color: C.muted }}>Pay to {info.vpa}</p>
                                    </div>

                                    {isMobileDevice() && (
                                        <button onClick={handleOpenUpiApp}
                                            className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14px] font-bold tracking-wide text-white"
                                            style={{ background: "linear-gradient(135deg, #006F83 0%, #047084 100%)" }}>
                                            <Smartphone className="h-4 w-4" /> Open in UPI app
                                        </button>
                                    )}

                                    <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12px] font-semibold leading-snug" style={{ background: `${C.secondary}0f`, color: C.secondary }}>
                                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        Scan the QR (or use the button above on mobile), complete the payment, then enter the UTR below. This single payment covers all sellers in this order.
                                        You have {formatCountdown(msLeft)} left in this window.
                                        {hasBank && " Prefer a bank transfer instead? Switch to the NEFT / RTGS tab above."}
                                    </div>
                                </>
                            ) : hasBank ? (
                                <BankTransferPanel info={info} bankMethod={bankMethod} setBankMethod={setBankMethod} msLeft={msLeft} hasUpi={hasUpi} />
                            ) : null}

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: C.muted }}>UTR / transaction reference number</label>
                                <input
                                    value={utr}
                                    onChange={(e) => handleUtrChange(e.target.value)}
                                    onKeyDown={handleUtrKeyDown}
                                    placeholder="e.g. 402312345678"
                                    className="w-full rounded-lg border px-3 py-2.5 text-[14px] font-semibold tracking-wide focus:outline-none focus:ring-2"
                                    style={{ borderColor: C.hair, color: C.ink, ["--tw-ring-color"]: `${C.secondary}22` }} />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: C.muted }}>Payment screenshot (optional)</label>
                                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-4 text-[12.5px] font-bold tracking-wide"
                                    style={{ borderColor: C.hair, color: C.muted }}>
                                    <Upload className="h-4 w-4" />
                                    {screenshotFile ? screenshotFile.name : "Upload screenshot"}
                                    <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                                </label>
                                {screenshotPreview && (
                                    <img src={screenshotPreview} alt="Payment screenshot preview" className="mt-1 max-h-40 rounded-lg border object-contain" style={{ borderColor: C.hair }} />
                                )}
                            </div>

                            {error && (
                                <p className="rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ background: "rgba(199,31,17,0.08)", color: C.danger }}>{error}</p>
                            )}

                            <button onClick={handleSubmit} disabled={submitting}
                                className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14px] font-bold tracking-wide text-white disabled:opacity-50"
                                style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
                                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                {submitting ? "Submitting…" : "I've paid — submit for verification"}
                            </button>
                        </>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}