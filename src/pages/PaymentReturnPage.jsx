// pages/PaymentReturnPage.jsx  — route: /payment/return?ref=BBM...
//
// JioPay sends the buyer's browser to the backend (/pay/return), which redirects here. This page
// credits NOTHING: it only asks the backend (which verifies with JioPay) what happened and shows it.
//
// Rendered as a standalone, focused screen (own slim header, no site nav / footer / dock), so the
// route should sit under <AppShell> but NOT under <Layout> (see App.jsx / AppShell.jsx notes).
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
    Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, RotateCcw, Copy, Check, ShieldCheck,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useCart } from "../context/CartContext.jsx";
import {
    fetchPaymentStatus, startOrderPayment, startGroupPayment, redirectToGateway, takePaymentReturnPath,
} from "../utils/paymentsApi.js";

const REF_RE = /^BBM[0-9A-F]{17}$/;
const POLL_MS = 2500;
const MAX_POLL_MS = 3 * 60 * 1000;
const SLOW_AFTER_MS = 20 * 1000;

// Same palette as the dock / wallet / grow screens.
const INK = "#141B22";
const MUTED = "#5B6672";
const HAIR = "rgba(20,27,34,0.09)";
const PRIMARY = "#0B5563";   // main action colour (same as the Menu button)
const PAGE_BG = "#F5F8F9";

const TONE = {
    good: { bg: "#E7F6EE", fg: "#12794A", ring: "rgba(34,160,107,.18)", pill: "Successful" },
    bad: { bg: "#FDECEA", fg: "#B3261E", ring: "rgba(179,38,30,.14)", pill: "Not completed" },
    warn: { bg: "#FEF6E7", fg: "#92600A", ring: "rgba(217,154,31,.2)", pill: "Needs attention" },
    wait: { bg: "#E6F3F5", fg: "#0B7285", ring: "rgba(11,114,133,.16)", pill: "In progress" },
};

// The cart provider may not wrap this route in every layout — never let that break the page.
function useCartSafe() {
    try { return useCart() || null; } catch { return null; }
}

const inr = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/* ------------------------------------------------------------------ pieces */

function Steps({ current }) {
    const steps = ["Payment sent", "Bank confirming", "Done"];
    return (
        <ol className="mx-auto mt-6 flex w-full max-w-[300px] items-start justify-between" aria-label="Payment progress">
            {steps.map((label, i) => {
                const done = i < current;
                const active = i === current;
                return (
                    <li key={label} className="relative flex flex-1 flex-col items-center">
                        {i > 0 && (
                            <span
                                aria-hidden="true"
                                className="absolute right-1/2 top-[11px] h-[2px] w-full"
                                style={{ background: i <= current ? "#0B7285" : HAIR }}
                            />
                        )}
                        <span
                            className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${active ? "animate-pulse" : ""}`}
                            style={{
                                background: done || active ? "#0B7285" : "#fff",
                                color: done || active ? "#fff" : MUTED,
                                border: done || active ? "none" : `2px solid ${HAIR}`,
                            }}
                        >
                            {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                        </span>
                        <span className="mt-1.5 text-[11px] font-semibold" style={{ color: done || active ? INK : MUTED }}>{label}</span>
                    </li>
                );
            })}
        </ol>
    );
}

function Row({ label, children }) {
    return (
        <div className="flex items-center justify-between gap-4 py-2.5">
            <span className="text-[12.5px] font-semibold" style={{ color: MUTED }}>{label}</span>
            <span className="min-w-0 truncate text-right text-[13.5px] font-bold" style={{ color: INK }}>{children}</span>
        </div>
    );
}

/* -------------------------------------------------------------------- page */

export default function PaymentReturnPage() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { token } = useAuth();
    const cart = useCartSafe();

    const ref = params.get("ref") || "";
    const validRef = REF_RE.test(ref);

    const [payment, setPayment] = useState(null);
    const [error, setError] = useState(null);
    const [timedOut, setTimedOut] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const [authWaited, setAuthWaited] = useState(false);
    const [slow, setSlow] = useState(false);
    const [copied, setCopied] = useState(false);
    const startedAt = useRef(Date.now());
    const cartReloaded = useRef(false);

    // takePaymentReturnPath() consumes the stored path, so read it ONCE (calling it on every render
    // returned null after the first poll update and always fell back to /grow/wallet).
    const [walletPath] = useState(() => takePaymentReturnPath() || "/grow/wallet");

    // Give the session a moment to restore after the full-page return from the gateway.
    useEffect(() => {
        const t = setTimeout(() => setAuthWaited(true), 4000);
        return () => clearTimeout(t);
    }, []);

    // "Taking longer than usual" hint while we are still waiting.
    useEffect(() => {
        const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        if (!validRef || !token) return undefined;
        let cancelled = false;
        let timer;

        const tick = async () => {
            const res = await fetchPaymentStatus(token, ref);
            if (cancelled) return;
            if (res?.success && res.payment) {
                setPayment(res.payment);
                setError(null);
                if (res.payment.final) return;
            } else {
                setError(res?.message || "Couldn't check the payment status.");
            }
            if (Date.now() - startedAt.current > MAX_POLL_MS) { setTimedOut(true); return; }
            timer = setTimeout(tick, POLL_MS);
        };
        tick();
        return () => { cancelled = true; clearTimeout(timer); };
    }, [ref, token, validRef]);

    // A paid cart is cleared server-side; refresh the badge once.
    useEffect(() => {
        if (payment?.status === "success" && payment.purpose === "order_group" && !cartReloaded.current) {
            cartReloaded.current = true;
            cart?.reload?.();
        }
    }, [payment, cart]);

    const retry = async () => {
        if (!payment || retrying) return;
        setRetrying(true);
        setError(null);
        const res = payment.purpose === "order_group"
            ? await startGroupPayment(token, payment.groupId)
            : await startOrderPayment(token, payment.orderId);
        if (!res?.success || !redirectToGateway(res.redirectUrl)) {
            setRetrying(false);
            setError(res?.message || "Couldn't start the payment. Please try again.");
        }
    };

    const copyRef = async () => {
        try {
            await navigator.clipboard.writeText(ref);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch { /* clipboard blocked: ignore */ }
    };

    /* --------------------------------------------------------------- states */
    const forWallet = payment?.purpose === "wallet_topup";
    const ordersPath = "/save/orders";
    let view;
    if (!validRef) {
        view = { tone: "bad", icon: XCircle, title: "Invalid payment link", text: "This payment reference isn't valid.", actions: [["Go to my orders", () => navigate(ordersPath), true]] };
    } else if (!token) {
        view = authWaited
            ? { tone: "warn", icon: AlertTriangle, title: "Please sign in", text: "Sign in to see the result of your payment.", actions: [["Sign in", () => navigate("/login", { state: { from: location.pathname + location.search } }), true]] }
            : { tone: "wait", icon: Loader2, spin: true, title: "Checking your session…", text: "" };
    } else if (!payment) {
        view = timedOut
            ? { tone: "warn", icon: Clock, title: "Still waiting", text: error || "We couldn't load the payment yet.", actions: [["Go to my orders", () => navigate(ordersPath), true]] }
            : { tone: "wait", icon: Loader2, spin: true, title: "Confirming your payment…", text: "Please don't pay again or close this page.", steps: 1 };
    } else if (payment.status === "success") {
        view = {
            tone: "good", icon: CheckCircle2,
            title: forWallet ? "Credits added" : "Payment received",
            text: forWallet
                ? `${inr(payment.amount)} has been added to your wallet.`
                : `We received ${inr(payment.amount)}${payment.orderNumber ? ` for order ${payment.orderNumber}` : payment.groupNumber ? ` for ${payment.groupNumber}` : ""}. The seller has been notified.`,
            actions: forWallet
                ? [["Back to wallet", () => navigate(walletPath), true]]
                : [[payment.orderId ? "View order" : "View my orders", () => navigate(payment.orderId ? `/save/orders/${payment.orderId}` : ordersPath), true]],
        };
    } else if (payment.status === "refunded") {
        view = {
            tone: "warn", icon: AlertTriangle, title: "Payment received, but it can't be used",
            text: `We received ${inr(payment.amount)}, but this order was already cancelled, paid, or changed. A full refund is being sent to your original payment method automatically.`,
            actions: [["Go to my orders", () => navigate(ordersPath), true]],
        };
    } else if (payment.status === "review") {
        view = {
            tone: "warn", icon: Clock, title: "We're verifying your payment",
            text: "The amount confirmed by the bank needs a quick manual check. Our team will resolve it shortly — you don't need to pay again.",
            actions: [["Go to my orders", () => navigate(ordersPath), true]],
        };
    } else if (payment.status === "failed" || payment.status === "expired") {
        view = {
            tone: "bad", icon: XCircle,
            title: payment.status === "expired" ? "Payment session expired" : "Payment didn't go through",
            text: "No money was taken. If an amount was deducted, it will be confirmed or refunded automatically.",
            actions: forWallet
                ? [["Back to wallet", () => navigate(walletPath), true]]
                : [[retrying ? "Starting…" : "Try again", retry, true, RotateCcw], ["Go to my orders", () => navigate(ordersPath), false]],
        };
    } else if (timedOut) {
        view = {
            tone: "warn", icon: Clock, title: "Still waiting for the bank",
            text: "We haven't received a final answer yet. If money was deducted it will be confirmed automatically — check your orders in a few minutes. You don't need to pay again.",
            actions: [["Go to my orders", () => navigate(forWallet ? walletPath : ordersPath), true]],
        };
    } else {
        view = { tone: "wait", icon: Loader2, spin: true, title: "Confirming your payment…", text: "Waiting for the bank's confirmation. Please don't pay again or close this page.", steps: 1 };
    }

    const tone = TONE[view.tone];
    const Icon = view.icon;
    const waiting = view.tone === "wait";
    const forText = payment
        ? (forWallet ? "Wallet top-up" : payment.orderNumber ? `Order ${payment.orderNumber}` : payment.groupNumber ? `Cart ${payment.groupNumber}` : "Order payment")
        : null;

    return (
        <div className="min-h-[100dvh]" style={{ background: PAGE_BG, color: INK }}>
            {/* slim header, same look as the seller / buyer headers */}
            <header className="sticky top-0 z-10 border-b bg-white" style={{ borderColor: HAIR, paddingTop: "env(safe-area-inset-top, 0px)" }}>
                <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
                    <span className="flex items-center gap-2">
                        <img src="/Logo.png" alt="BBM" className="block h-7 w-auto object-contain" />
                        <span className="text-[18px] font-extrabold leading-none tracking-wide" style={{ fontFamily: '"Bricolage Grotesque", "Figtree", system-ui, sans-serif' }}>BBM</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: "#12794A" }}>
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />Secure payment
                    </span>
                </div>
            </header>

            <main className="mx-auto w-full max-w-md px-4 pb-10 pt-8 sm:pt-12">
                <section
                    role="status"
                    aria-live="polite"
                    className="rounded-[28px] border bg-white px-5 pb-6 pt-8 text-center sm:px-7"
                    style={{ borderColor: HAIR, boxShadow: "0 18px 40px -22px rgba(8,34,43,.25)" }}
                >
                    {/* icon with soft halo */}
                    <span className="relative mx-auto flex h-[84px] w-[84px] items-center justify-center rounded-full" style={{ background: tone.ring }}>
                        <span className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: tone.bg, color: tone.fg }}>
                            <Icon className={`h-8 w-8 ${view.spin ? "animate-spin" : ""}`} aria-hidden="true" />
                        </span>
                    </span>

                    <div className="mt-4">
                        <span
                            className="inline-block rounded-full px-2.5 py-[3px] text-[10.5px] font-extrabold uppercase tracking-[0.06em]"
                            style={{ background: tone.bg, color: tone.fg }}
                        >
                            {tone.pill}
                        </span>
                    </div>

                    <h1 className="mt-3 text-[21px] font-extrabold leading-tight tracking-tight">{view.title}</h1>
                    {view.text && <p className="mx-auto mt-2 max-w-[340px] text-[13.5px] font-medium leading-relaxed" style={{ color: MUTED }}>{view.text}</p>}

                    {waiting && view.steps != null && <Steps current={view.steps} />}
                    {waiting && slow && (
                        <p className="mx-auto mt-4 max-w-[320px] rounded-xl px-3 py-2 text-[12.5px] font-semibold" style={{ background: "#E6F3F5", color: "#0B5563" }}>
                            The bank is taking longer than usual. It's safe to wait here.
                        </p>
                    )}

                    {error && payment && (
                        <p
                            className="mx-auto mt-4 max-w-[340px] rounded-xl px-3 py-2 text-[12.5px] font-semibold"
                            style={payment.final ? { background: "#FDECEA", color: "#B3261E" } : { background: "#FEF6E7", color: "#92600A" }}
                        >
                            {error}
                        </p>
                    )}

                    {/* details */}
                    {validRef && payment && (
                        <div className="mt-6 divide-y rounded-2xl border px-4 text-left" style={{ borderColor: HAIR, background: "#FBFCFC" }}>
                            <Row label="Amount">{inr(payment.amount)}</Row>
                            {forText && <Row label="For">{forText}</Row>}
                            <div className="flex items-center justify-between gap-3 py-2.5">
                                <span className="text-[12.5px] font-semibold" style={{ color: MUTED }}>Reference</span>
                                <button
                                    type="button"
                                    onClick={copyRef}
                                    aria-label="Copy payment reference"
                                    className="flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 active:opacity-60"
                                >
                                    <span className="truncate font-mono text-[12px] font-semibold">{ref}</span>
                                    {copied
                                        ? <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "#12794A" }} aria-hidden="true" />
                                        : <Copy className="h-3.5 w-3.5 shrink-0" style={{ color: MUTED }} aria-hidden="true" />}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* actions */}
                    {view.actions && (
                        <div className="mt-6 flex w-full flex-col gap-2.5">
                            {view.actions.map(([label, onClick, primary, ActionIcon]) => (
                                <button
                                    key={label}
                                    type="button"
                                    onClick={onClick}
                                    disabled={retrying}
                                    className="flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[14.5px] font-bold transition-opacity active:opacity-70 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B7285]/40"
                                    style={primary
                                        ? { background: PRIMARY, color: "#fff" }
                                        : { border: `1px solid ${HAIR}`, color: INK, background: "#fff" }}
                                >
                                    {retrying && primary
                                        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                        : ActionIcon && <ActionIcon className="h-4 w-4" aria-hidden="true" />}
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                </section>

                {/* reference for the cases where there is no details card yet */}
                {validRef && !payment && (
                    <p className="mt-5 text-center font-mono text-[11px] font-semibold" style={{ color: MUTED }}>Ref {ref}</p>
                )}
                <p className="mx-auto mt-5 max-w-[320px] text-center text-[11.5px] font-medium leading-relaxed" style={{ color: MUTED }}>
                    Payments are processed securely by JioPay. We never see or store your card or bank details.
                </p>
            </main>
        </div>
    );
}