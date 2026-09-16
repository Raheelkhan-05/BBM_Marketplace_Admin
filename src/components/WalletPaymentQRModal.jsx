// components/WalletPaymentQRModal.jsx
//
// Same dummy-payment UX as PaymentQRModal (QR -> UTR -> submit -> awaiting
// verification), but for a seller topping up their wallet credits instead
// of paying for a specific order. Key differences from PaymentQRModal:
//   - Amount is chosen by the seller beforehand (passed in as a prop),
//     not fixed by a server-side order — so there's no order to expire out
//     from under the seller, and no 10-minute countdown/session recovery
//     needed. If they close this modal, they just re-enter the amount.
//   - Submits to POST /api/seller/wallet/payments (wallet_payments row),
//     not an order's payment-proof endpoint.
//
// KEYBOARD: pressing Enter in the UTR field now submits directly (as long
// as a UTR has been typed and a submission isn't already in flight),
// matching the same "Enter submits" behavior added to PaymentQRModal /
// GroupPaymentQRModal.
//
// TODO(confirm): screenshot upload here is sent as multipart to match the
// order flow's submitPaymentProof pattern. This assumes the wallet payments
// route/controller accepts multipart + a file the same way — see the
// accompanying wallet.controller.js note. If your actual screenshot storage
// helper differs, the upload wiring below needs to match it.
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, CheckCircle2, Upload, Smartphone, AlertCircle, X } from "lucide-react";
import { motion } from "framer-motion";
import { C, EASE } from "./seller/listingForm/FormPrimitives.jsx";
import { fetchWalletPaymentInstructions, submitWalletPaymentWithProof } from "../utils/walletApi.js";

function isMobileDevice() {
    return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function WalletPaymentQRModal({ token, amount, onClose, onSubmitted }) {
    const [info, setInfo] = useState(null); // { vpa, payeeName, note, upiUri }
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [utr, setUtr] = useState("");
    const [screenshotFile, setScreenshotFile] = useState(null);
    const [screenshotPreview, setScreenshotPreview] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const res = await fetchWalletPaymentInstructions(token, amount);
            if (cancelled) return;
            if (!res?.success) { setError(res?.message || "Couldn't load payment details."); setLoading(false); return; }
            setInfo(res);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [token, amount]);

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        setScreenshotFile(file || null);
        setScreenshotPreview(file ? URL.createObjectURL(file) : null);
    };

    const handleOpenUpiApp = () => {
        if (!info?.upiUri) return;
        window.location.href = info.upiUri;
    };

    const handleSubmit = async () => {
        if (!utr.trim()) { setError("Please enter the UTR / transaction reference number."); return; }
        setError(null);
        setSubmitting(true);
        const res = await submitWalletPaymentWithProof(token, { amount, utr: utr.trim(), screenshotFile });
        setSubmitting(false);
        if (!res?.success) { setError(res?.message || "Couldn't submit payment proof."); return; }
        setSubmitted(true);
    };

    // Enter on the UTR field submits directly — same convenience as
    // clicking the submit button — as long as there's something typed and
    // we're not already mid-submission.
    const handleUtrKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (utr.trim() && !submitting) handleSubmit();
        }
    };

    return (
        <motion.div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
                // data-lenis-prevent hands scroll control back to this
                // native container the instant the cursor/touch is over
                // it, instead of the page's Lenis smooth-scroll eating the
                // wheel/touch event — same pattern used by the seller
                // dropdown list in HomeProductFeed.jsx and the notification
                // bell dropdown. Without it, this modal's own overflow-y-
                // auto never actually gets to scroll on desktop.
                data-lenis-prevent
                className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white sm:rounded-[24px]"
                initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}>

                <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: C.hairSoft }}>
                    <div>
                        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: C.secondary }}>Add credits</p>
                        <h2 className="text-[17px] font-extrabold tracking-wide" style={{ color: C.ink }}>₹{Number(amount).toLocaleString("en-IN")}</h2>
                    </div>
                    <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/[0.04]">
                        <X className="h-4 w-4" style={{ color: C.muted }} />
                    </button>
                </div>

                <div className="flex flex-col gap-4 px-5 py-5">
                    {loading ? (
                        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" style={{ color: C.muted }} /></div>
                    ) : error && !info ? (
                        <div className="flex flex-col items-center gap-3 py-6 text-center">
                            <p className="rounded-lg px-3 py-2 text-[13px] font-semibold" style={{ background: "rgba(199,31,17,0.08)", color: C.danger }}>{error}</p>
                            <button onClick={onClose} className="mt-1 w-full rounded-xl px-5 py-2.5 text-[13px] font-bold tracking-wide text-white"
                                style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
                                Close
                            </button>
                        </div>
                    ) : submitted ? (
                        <div className="flex flex-col items-center gap-3 py-6 text-center">
                            <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "#fef3c7", color: "#a16207" }}>
                                <CheckCircle2 className="h-7 w-7" />
                            </span>
                            <h3 className="text-[15px] font-extrabold tracking-wide" style={{ color: C.ink }}>Submitted — awaiting verification</h3>
                            <p className="text-[12.5px] font-semibold leading-snug tracking-wide" style={{ color: C.muted }}>
                                We've received your UTR. Credits are added to your wallet once our team verifies the payment.
                            </p>
                            <button onClick={() => { onSubmitted?.(); onClose(); }} className="mt-2 w-full rounded-xl px-5 py-2.5 text-[13px] font-bold tracking-wide text-white"
                                style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
                                Done
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-col items-center gap-2 rounded-2xl border p-5" style={{ borderColor: C.hair }}>
                                <QRCodeSVG value={info.upiUri} size={200} includeMargin />
                                <p className="mt-1 text-[20px] font-extrabold tabular-nums" style={{ color: C.ink }}>₹{Number(amount).toLocaleString("en-IN")}</p>
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
                                Test mode — payment is simulated. Scan the QR (or use the button on mobile), then enter the UTR below.
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: C.muted }}>UTR / transaction reference number</label>
                                <input
                                    value={utr}
                                    onChange={(e) => setUtr(e.target.value)}
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