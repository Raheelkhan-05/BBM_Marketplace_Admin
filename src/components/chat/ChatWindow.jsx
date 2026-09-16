// components/chat/ChatWindow.jsx
//
// The whole message-thread experience — header, banner, bubbles,
// composer — lives in this one file.
//
// THIS PASS ADDS:
//   - Credit limit is now actually passed through on approval
//     (CreditApprovalDialog -> handleConfirmApproval -> decide()).
//   - New CreditLimitDialog for sellers responding to a buyer's
//     "request more credit" ask, wired to update_credit_limit via
//     the useCredit hook's `updateLimit`.
//   - MessageBubble renders `credit_limit_request` messages with an
//     "Update limit" action instead of Approve/Decline.
//
// NOTE: this assumes useCredit() (in hooks/useChat.js) exposes an
// `updateLimit(creditId, newLimit, resetUsed?)` function alongside the
// existing `decide`, `request`, `toggle` — wired to your
// updateCreditLimit(token, creditId, newLimit, resetUsed) API client call,
// the same way `decide` already wraps decideCredit(). If that isn't in
// useChat.js yet, add it there before this will work end-to-end.
import { useEffect, useLayoutEffect, useRef, useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowDown, CreditCard, Loader2, Pencil, Check, CheckCheck, Clock3, AlertCircle, MoreVertical, Ban, Send, MessageCircle, X, ShieldOff } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useNavigate } from "react-router-dom";
import useChatMessages, { usePresence, useCredit } from "../../hooks/useChat.js";
import { useChatContext } from "../../context/ChatContext.jsx";

import { formatLastSeen } from "../../utils/formatLastSeen.js";

// Single token system for the whole module — every color used anywhere
// below comes from here, so a status (warn/ok/danger) always looks the
// same regardless of which bar or bubble is showing it.
const C = {
    ink: "#0B1116", muted: "#667077",
    primary: "#D2462B", secondary: "#006F83",
    hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)",
    ok: "#059669", okBg: "#EAF7F2",
    warn: "#a16207", warnBg: "#FDF3D8",
    danger: "#C71F11", dangerBg: "rgba(199,31,17,0.07)", dangerSoft: "#B23A28",
    surface: "#fff", canvas: "#F7F6F3",
};
const EASE = [0.16, 1, 0.3, 1];
const GROUP_GAP_MS = 3 * 60 * 1000; // same-sender messages within this window render as one visual group
const NEAR_BOTTOM_PX = 140;

const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function initials(name) {
    return (name || "?").trim().split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function PendingCreditBanner({ buyerLabel, onClick }) {
    return (
        <button
            onClick={onClick}
            className="flex w-full items-center gap-2 border-b px-3.5 py-2 text-left transition-colors hover:brightness-95"
            style={{ borderColor: C.hair, background: C.warnBg }}
        >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: "#fff" }}>
                <CreditCard className="h-3.5 w-3.5" style={{ color: C.warn }} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold tracking-wide" style={{ color: C.warn }}>
                Credit request from {buyerLabel} needs your decision
            </span>
            <span className="shrink-0 text-[10.5px] font-bold tracking-wide underline underline-offset-2" style={{ color: C.warn }}>
                Review
            </span>
        </button>
    );
}

function dayLabel(iso) {
    const d = new Date(iso), now = new Date();
    const diffDays = Math.round((now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
}

// stable identity for a message row regardless of optimistic → confirmed swap
function rowKey(m) {
    return m.client_message_id || m.id;
}

// small inline tag — same visual language as the one in ConversationList,
// used next to the shop name in the header when the seller is deleted.
function DeletedTag() {
    return (
        <span className="shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide" style={{ background: "#fdecea", color: "#c71f11" }}>
            Deleted
        </span>
    );
}

// ---- header -----------------------------------------------------------

function TypingDots({ color = C.secondary, size = "h-1.5 w-1.5" }) {
    return (
        <span className="inline-flex items-center gap-0.5">
            {[0, 1, 2].map((i) => (
                <motion.span
                    key={i}
                    className={`inline-block rounded-full ${size}`}
                    style={{ background: color }}
                    animate={prefersReducedMotion ? {} : { y: [0, -3, 0] }}
                    transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                />
            ))}
        </span>
    );
}

function StatusStrip({
    credit, viewerRole, buyerInfo, otherName,
    onRequestCredit, onToggleCredit, onDecideCredit, requestingCredit,
    onRequestIncrease, requestingIncrease, // NEW
    disabled,
}) {
    const [decidingCredit, setDecidingCredit] = useState(null);
    const [togglingCredit, setTogglingCredit] = useState(false);

    const handleDecideCredit = async (id, decision) => {
        setDecidingCredit(decision);
        await onDecideCredit(id, decision);
        setDecidingCredit(null);
    };
    const handleToggleCredit = async (enabled) => {
        setTogglingCredit(true);
        await onToggleCredit(enabled);
        setTogglingCredit(false);
    };

    const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

    let creditCell = null;
    if (viewerRole === "buyer") {
        const cooldownActive = credit?.status === "rejected" && credit.cooldown_until && new Date(credit.cooldown_until) > new Date();
        if (!credit || credit.status === "revoked" || (credit.status === "rejected" && !cooldownActive)) {
            creditCell = ( /* unchanged "Buy on credit" button */
                <button onClick={onRequestCredit} disabled={requestingCredit || disabled}
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-60"
                    style={{ background: `${C.secondary}10`, color: C.secondary }}>
                    {requestingCredit ? <Loader2 className="h-3 w-3 animate-spin" /> : <CreditCard className="h-3 w-3" />}
                    {requestingCredit ? "Requesting…" : "Buy on credit"}
                </button>
            );
        } else if (credit.status === "pending") {
            creditCell = ( /* unchanged */
                <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: C.warnBg, color: C.warn }} title={`Waiting for ${otherName}'s approval`}>
                    <Clock3 className="h-3 w-3" /> Credit pending
                </span>
            );
        } else if (credit.status === "approved") {
            const limitAmt = Number(credit.credit_limit || 0);
            const used = Number(credit.credit_used || 0);
            const remaining = Math.max(limitAmt - used, 0);
            const isOut = limitAmt > 0 && remaining <= 0;
            const limitPending = !!credit.limit_increase_request_message_id;
            const limitCooldownActive = credit.limit_increase_cooldown_until && new Date(credit.limit_increase_cooldown_until) > new Date();

            creditCell = (
                <>
                    <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: C.okBg, color: C.ok }}
                        title={`Approved by ${otherName}`}>
                        <Check className="h-3 w-3" /> {fmt(remaining)} left of {fmt(limitAmt)}
                    </span>

                    {isOut && !limitPending && !limitCooldownActive && (
                        <button onClick={() => onRequestIncrease(credit.id)} disabled={requestingIncrease || disabled}
                            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-60"
                            style={{ background: `${C.secondary}10`, color: C.secondary }}>
                            {requestingIncrease ? <Loader2 className="h-3 w-3 animate-spin" /> : <CreditCard className="h-3 w-3" />}
                            {requestingIncrease ? "Requesting…" : "Ask for higher limit"}
                        </button>
                    )}
                    {isOut && limitPending && (
                        <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: C.warnBg, color: C.warn }}>
                            <Clock3 className="h-3 w-3" /> Increase requested
                        </span>
                    )}
                    {isOut && limitCooldownActive && (
                        <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: C.hairSoft, color: C.muted }}
                            title="Seller declined your last request">
                            Declined · retry {new Date(credit.limit_increase_cooldown_until).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </span>
                    )}
                </>
            );
        } else if (cooldownActive) {
            /* unchanged */
            const retryDate = new Date(credit.cooldown_until);
            creditCell = (
                <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: C.hairSoft, color: C.muted }}
                    title={`Declined — you can request again after ${retryDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}>
                    Credit declined · retry {retryDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
            );
        }
    } else if (viewerRole === "seller" && credit && (credit.status === "approved" || credit.status === "revoked")) {
        const on = credit.status === "approved";
        const limitAmt = Number(credit.credit_limit || 0);
        const used = Number(credit.credit_used || 0);
        const remaining = Math.max(limitAmt - used, 0);
        creditCell = (
            <>
                <button onClick={() => handleToggleCredit(!on)} disabled={togglingCredit || disabled}
                    className="flex items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5 text-[11px] font-bold tracking-wide transition-colors disabled:opacity-60"
                    style={{ background: on ? C.okBg : C.hairSoft, color: on ? C.ok : C.muted, border: `1px solid ${on ? "transparent" : C.hair}` }}
                    title={on ? `Credit enabled for ${otherName}` : `Credit off for ${otherName}`}>
                    <CreditCard className="h-3 w-3" /> Credit {on ? "enabled" : "off"}
                    {togglingCredit ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                        <span className="relative ml-0.5 h-4 w-7 rounded-full transition-colors" style={{ background: on ? C.ok : "#CBD2D6" }}>
                            <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all" style={{ left: on ? "14px" : "2px" }} />
                        </span>
                    )}
                </button>
                {on && limitAmt > 0 && (
                    <span className="text-[11px] font-semibold" style={{ color: C.muted }}>
                        {fmt(remaining)} of {fmt(limitAmt)} left
                    </span>
                )}
            </>
        );
    }

    if (!creditCell) return null;

    return (
        <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5" style={{ borderColor: C.hair, background: C.surface }}>
            {creditCell}
        </div>
    );
}

function ChatHeader({ meta, otherPresence, otherTyping, onBack }) {
    const isDeleted = !!meta?.otherIsDeletedSeller;
    return (
        <div className="flex items-center gap-3 border-b px-3.5 py-2.5" style={{ borderColor: C.hair, background: C.surface }}>
            <button onClick={onBack} className="rounded-full p-1.5 transition-colors hover:bg-black/5 sm:hidden">
                <ArrowLeft className="h-4 w-4" style={{ color: C.ink }} />
            </button>
            <div className="relative shrink-0">
                {meta?.otherShopLogo ? (
                    <img
                        src={meta.otherShopLogo}
                        alt={meta.otherShopName || "Shop"}
                        className="h-10 w-10 rounded-full object-cover shadow-sm"
                        style={{ border: `1px solid ${C.hair}`, filter: isDeleted ? "grayscale(1)" : "none", opacity: isDeleted ? 0.6 : 1 }}
                        onError={(e) => {
                            e.currentTarget.style.display = "none";
                            e.currentTarget.nextSibling.style.display = "flex";
                        }}
                    />
                ) : null}
                <span
                    className="flex h-10 w-10 items-center justify-center rounded-full text-[12.5px] font-extrabold tracking-wide text-white shadow-sm"
                    style={{
                        display: meta?.otherShopLogo ? "none" : "flex",
                        background: isDeleted ? "#9AA3A8" : "linear-gradient(135deg, #006F83 0%, #4FA3B0 100%)",
                    }}
                >
                    {meta ? initials(meta.otherShopName) : ""}
                </span>
                {otherPresence?.online && !isDeleted && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2" style={{ background: "#1FAE5C", borderColor: C.surface }} />
                )}
            </div>
            <div className="min-w-0 flex-1">
                {meta ? (
                    <>
                        <span className="flex min-w-0 items-center gap-1.5">
                            <p className="truncate text-[14.5px] font-extrabold tracking-wide" style={{ color: isDeleted ? C.muted : C.ink }}>{meta.otherShopName}</p>
                            {isDeleted && <DeletedTag />}
                        </span>
                        <AnimatePresence mode="wait" initial={false}>
                            {isDeleted ? (
                                <motion.p
                                    key="deleted"
                                    initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: 0.12 }}
                                    className="text-[10.5px] font-semibold uppercase tracking-wide"
                                    style={{ color: C.muted }}
                                >
                                    Account no longer active
                                </motion.p>
                            ) : otherTyping ? (
                                <motion.p
                                    key="typing"
                                    initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: 0.12 }}
                                    className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide"
                                    style={{ color: C.secondary }}
                                >
                                    typing <TypingDots size="h-1 w-1" />
                                </motion.p>
                            ) : (
                                <motion.p
                                    key="status"
                                    initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: 0.12 }}
                                    className="text-[10.5px] font-semibold uppercase tracking-wide"
                                    style={{ color: otherPresence?.online ? C.secondary : C.muted }}
                                >
                                    {otherPresence?.online ? "Online" : formatLastSeen(otherPresence?.lastSeenAt)}
                                </motion.p>
                            )}
                        </AnimatePresence>
                    </>
                ) : (
                    <>
                        <div className="h-3 w-28 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                        <div className="mt-1.5 h-2.5 w-16 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                    </>
                )}
            </div>
        </div>
    );
}

function TypingBubble() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.15, ease: EASE }}
            className="mb-3 flex justify-start"
        >
            <div className="flex items-center rounded-2xl px-4 py-3" style={{ background: C.surface, border: `1px solid ${C.hair}`, borderBottomLeftRadius: 4, boxShadow: "0 1px 2px rgba(11,17,22,0.04)" }}>
                <TypingDots size="h-1.5 w-1.5" />
            </div>
        </motion.div>
    );
}

// Notice shown above the composer whenever sending is blocked because the
// other party's account is deleted. Non-dismissible by design.
function DeletedSellerNotice({ shopName }) {
    return (
        <div className="flex items-start gap-2 border-t px-3.5 py-2.5" style={{ borderColor: C.hair, background: C.dangerBg }}>
            <ShieldOff className="mt-[1px] h-3.5 w-3.5 shrink-0" style={{ color: C.danger }} />
            <p className="text-[12px] font-semibold leading-snug" style={{ color: C.danger }}>
                {shopName || "This seller"}'s account has been deleted. You can no longer send messages here — this thread is kept for your records only.
            </p>
        </div>
    );
}

// ---- FIXED: onConfirm now passes the numeric limit up, and the button
// is disabled until a positive limit is entered.
function CreditApprovalDialog({ open, onClose, onConfirm, buyerLabel, confirming }) {
    const [limit, setLimit] = useState("");
    const numericLimit = Number(limit);
    const canConfirm = numericLimit > 0;

    // reset the input each time the dialog is opened for a new request
    useEffect(() => {
        if (open) setLimit("");
    }, [open]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-[999] flex items-end justify-center bg-black/40 sm:items-center"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                    onClick={onClose}
                >
                    <motion.div
                        className="w-full rounded-t-2xl bg-white p-5 sm:max-w-[420px] sm:rounded-2xl"
                        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: C.okBg, color: C.ok }}>
                                <CreditCard className="h-5 w-5" />
                            </span>
                            <div className="min-w-0 flex-1 pt-0.5">
                                <p className="text-[15px] font-extrabold tracking-wide" style={{ color: C.ink }}>Approve credit for {buyerLabel}?</p>
                                <p className="mt-0.5 text-[12px] font-medium leading-snug tracking-wide" style={{ color: C.muted }}>
                                    They'll be able to place orders with you on credit terms you arrange directly.
                                </p>
                            </div>
                            <button onClick={onClose} className="shrink-0 rounded-full p-1 transition-colors hover:bg-black/5">
                                <X className="h-4 w-4" style={{ color: C.muted }} />
                            </button>
                        </div>

                        <div className="mt-3">
                            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                                Monthly credit limit for {buyerLabel}
                            </label>
                            <div className="mt-1 flex items-center gap-1.5 rounded-xl border px-3 py-2.5" style={{ borderColor: C.hair }}>
                                <span className="text-[13px] font-bold" style={{ color: C.muted }}>₹</span>
                                <input
                                    type="number" inputMode="decimal" value={limit}
                                    onChange={(e) => setLimit(e.target.value)}
                                    placeholder="e.g. 30000"
                                    className="w-full bg-transparent text-[14px] font-bold tabular-nums outline-none"
                                />
                            </div>
                            <p className="mt-1 text-[11px] font-medium tracking-wider" style={{ color: C.muted }}>
                                {buyerLabel} can order up to this much on credit per calendar month, across any number of orders. Resets automatically each month.
                            </p>
                        </div>

                        <div className="mt-4 rounded-xl px-3.5 py-3" style={{ background: C.canvas, border: `1px solid ${C.hair}` }}>
                            <p className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: C.muted }}>Before you approve</p>
                            <p className="mt-1.5 text-[12px] font-medium leading-relaxed tracking-wide" style={{ color: C.ink }}>
                                Credit terms, repayment, and any dispute arising from a credit sale are strictly between you and the buyer.
                                BBM Marketplace does not process, hold, or guarantee any payment made under a credit arrangement, and is not
                                a party to it. BBM Marketplace shall not be liable for any loss, non-payment, delay, or dispute connected with
                                credit extended under this feature. Approving this request is your independent business decision.
                            </p>
                        </div>

                        <div className="mt-4 flex gap-2.5">
                            <button onClick={onClose} disabled={confirming}
                                className="flex flex-1 items-center justify-center rounded-xl border py-2.5 text-[12.5px] font-bold tracking-wide transition-colors hover:bg-black/[0.03] disabled:opacity-60"
                                style={{ borderColor: C.hair, color: C.muted }}>
                                Cancel
                            </button>
                            {/* FIXED: was onClick={onConfirm} with no arg, and missing !canConfirm in disabled */}
                            <button onClick={() => onConfirm(numericLimit)} disabled={confirming || !canConfirm}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12.5px] font-bold tracking-wide text-white transition-transform active:scale-[0.97] disabled:opacity-60"
                                style={{ background: C.ok }}>
                                {confirming && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                I understand, approve
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// NEW — the seller-side "respond to a limit-increase request" dialog.
// Same shape as CreditApprovalDialog but no legal disclaimer (terms were
// already accepted at initial approval) and it prefills the current limit.
function CreditLimitDialog({ open, onClose, onConfirm, buyerLabel, currentLimit, confirming }) {
    const [limit, setLimit] = useState("");
    const numericLimit = Number(limit);
    const canConfirm = numericLimit > 0;

    useEffect(() => {
        if (open) setLimit(currentLimit != null ? String(currentLimit) : "");
    }, [open, currentLimit]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-[999] flex items-end justify-center bg-black/40 sm:items-center"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                    onClick={onClose}
                >
                    <motion.div
                        className="w-full rounded-t-2xl bg-white p-5 sm:max-w-[420px] sm:rounded-2xl"
                        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: `${C.secondary}12`, color: C.secondary }}>
                                <CreditCard className="h-5 w-5" />
                            </span>
                            <div className="min-w-0 flex-1 pt-0.5">
                                <p className="text-[15px] font-extrabold tracking-wide" style={{ color: C.ink }}>Update credit limit for {buyerLabel}?</p>
                                <p className="mt-0.5 text-[12px] font-medium leading-snug tracking-wide" style={{ color: C.muted }}>
                                    {buyerLabel} asked you to reconsider their monthly credit limit.
                                </p>
                            </div>
                            <button onClick={onClose} className="shrink-0 rounded-full p-1 transition-colors hover:bg-black/5">
                                <X className="h-4 w-4" style={{ color: C.muted }} />
                            </button>
                        </div>

                        <div className="mt-3">
                            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                                New monthly credit limit for {buyerLabel}
                            </label>
                            <div className="mt-1 flex items-center gap-1.5 rounded-xl border px-3 py-2.5" style={{ borderColor: C.hair }}>
                                <span className="text-[13px] font-bold" style={{ color: C.muted }}>₹</span>
                                <input
                                    type="number" inputMode="decimal" value={limit}
                                    onChange={(e) => setLimit(e.target.value)}
                                    placeholder="e.g. 50000"
                                    className="w-full bg-transparent text-[14px] font-bold tabular-nums outline-none"
                                />
                            </div>
                            <p className="mt-1 text-[11px] font-medium" style={{ color: C.muted }}>
                                Current limit: {currentLimit != null ? `₹${currentLimit}` : "not set"}. Updating resets this month's usage to zero.
                            </p>
                        </div>

                        <div className="mt-4 flex gap-2.5">
                            <button onClick={onClose} disabled={confirming}
                                className="flex flex-1 items-center justify-center rounded-xl border py-2.5 text-[12.5px] font-bold tracking-wide transition-colors hover:bg-black/[0.03] disabled:opacity-60"
                                style={{ borderColor: C.hair, color: C.muted }}>
                                Cancel
                            </button>
                            <button onClick={() => onConfirm(numericLimit)} disabled={confirming || !canConfirm}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12.5px] font-bold tracking-wide text-white transition-transform active:scale-[0.97] disabled:opacity-60"
                                style={{ background: C.secondary }}>
                                {confirming && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Update limit
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// ---- message bubble -----------------------------------------------------

function TickIcon({ status, onRetry }) {
    if (status === "sending") return <Clock3 className="h-3 w-3" style={{ color: "rgba(255,255,255,0.7)" }} />;
    if (status === "failed") return (
        <button onClick={onRetry} className="flex items-center gap-0.5 text-[10px] font-bold underline decoration-dotted underline-offset-2" style={{ color: "#ffd6d1" }} title="Tap to retry">
            <AlertCircle className="h-3 w-3" /> Retry
        </button>
    );
    if (status === "read") return <CheckCheck className="h-3.5 w-3.5" style={{ color: "#6FD3FF" }} />;
    if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.7)" }} />;
    return <Check className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.7)" }} />;
}

const MessageBubble = memo(function MessageBubble({
    message, isMine, groupPos, onDelete, onRetry,
    credit, buyerInfo, onDecideCredit, onRequestApproval,
    onRequestLimitUpdate, onDeclineLimitIncrease,
    disabled,
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [decidingAction, setDecidingAction] = useState(null);
    const [decliningIncrease, setDecliningIncrease] = useState(false);
    const [decidingCredit, setDecidingCredit] = useState(null); // 'approved' | 'rejected' | null, local to this bubble
    const menuRef = useRef(null);


    if (message.message_type === "credit_request" || message.message_type === "credit_limit_request") {
        const isLimitRequest = message.message_type === "credit_limit_request";

        const isLiveRequest = isLimitRequest
            ? credit?.limit_increase_request_message_id === message.id
            : credit?.request_message_id === message.id;

        const frozenStatus = message.metadata?.finalStatus;
        // a limit-increase message doesn't have its own status field on `credit` —
        // it's "live" for as long as limit_increase_request_message_id still
        // points at it; once handled it just stops being the live pointer.
        const status = frozenStatus || (isLiveRequest ? (isLimitRequest ? "pending" : credit?.status) : null);

        const statusStyle = {
            pending: { color: C.warn, bg: C.warnBg, label: isLimitRequest ? "Awaiting response" : "Pending" },
            approved: { color: C.ok, bg: C.okBg, label: "Approved" },
            rejected: { color: C.danger, bg: C.dangerBg, label: "Declined by seller" },
            revoked: { color: C.muted, bg: C.hairSoft, label: "Turned off by seller" },
        }[status] || { color: C.muted, bg: C.hairSoft, label: "Requested" };

        const time = new Date(message.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

        // Superseded by a newer cycle — collapses to a slim reference line.
        if (!isLiveRequest) {
            return (
                <div className={`mb-2 flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-wide" style={{ background: C.hairSoft, color: C.muted }}>
                        <CreditCard className="h-3 w-3 shrink-0" style={{ color: statusStyle.color, opacity: 0.7 }} />
                        <span>{isLimitRequest ? "Credit limit increase" : "Credit request"}</span>
                        <span aria-hidden style={{ opacity: 0.35 }}>•</span>
                        <span style={{ color: statusStyle.color, fontWeight: 700 }}>{statusStyle.label}</span>
                        <span aria-hidden style={{ opacity: 0.35 }}>•</span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{time}</span>
                    </div>
                </div>
            );
        }

        const handleDeclineIncrease = async () => {
            setDecliningIncrease(true);
            await onDeclineLimitIncrease(credit.id);
            setDecliningIncrease(false);
        };


        const buyerLabel = buyerInfo?.businessName || buyerInfo?.name;
        const needsDecision = !isMine && isLiveRequest && status === "pending" && !disabled;

        const handleDecline = async () => {
            setDecidingCredit("rejected");
            await onDecideCredit(credit.id, "rejected");
            setDecidingCredit(null);
        };

        return (
            <div className={`mb-3 flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div
                    className="w-full max-w-[320px] overflow-hidden rounded-2xl border"
                    style={{ borderColor: needsDecision ? `${C.warn}35` : C.hair, background: C.surface, boxShadow: "0 1px 3px rgba(11,17,22,0.06)" }}
                >
                    {/* header row */}
                    <div className="flex items-center gap-2.5 px-3.5 pb-2.5 pt-3.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: `${C.secondary}12`, color: C.secondary }}>
                            <CreditCard className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] font-extrabold tracking-wide" style={{ color: C.ink }}>
                                {isLimitRequest ? "Credit limit increase" : "Credit request"}
                            </p>
                            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
                                {isMine ? "You requested" : "Requested to you"}
                            </p>
                        </div>
                        <span className="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ background: statusStyle.bg, color: statusStyle.color }}>
                            {statusStyle.label}
                        </span>
                    </div>

                    {/* buyer identity — only shown to the seller, only while this card is the one that matters */}
                    {!isMine && buyerLabel && (
                        <div className="mx-3.5 mb-3 rounded-xl px-3 py-2.5" style={{ background: C.canvas, border: `1px solid ${C.hair}` }}>
                            <div className="flex items-center gap-2.5">
                                <span className="relative h-8 w-8 shrink-0">
                                    {buyerInfo?.logoUrl ? (
                                        <img
                                            src={buyerInfo.logoUrl}
                                            alt={buyerLabel || "Buyer"}
                                            className="h-8 w-8 rounded-full object-cover"
                                            style={{ border: `1px solid ${C.hair}` }}
                                            onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.nextSibling.style.display = "flex"; }}
                                        />
                                    ) : null}
                                    <span
                                        className="flex h-8 w-8 items-center justify-center rounded-full text-[10.5px] font-extrabold tracking-wide text-white"
                                        style={{ display: buyerInfo?.logoUrl ? "none" : "flex", background: "linear-gradient(135deg, #006F83 0%, #4FA3B0 100%)" }}
                                    >
                                        {initials(buyerLabel)}
                                    </span>
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[12px] font-bold tracking-wide" style={{ color: C.ink }}>{buyerLabel}</p>
                                    {buyerInfo?.name && buyerInfo.businessName && (
                                        <p className="truncate text-[10.5px] font-medium tracking-wider" style={{ color: C.muted }}>{buyerInfo.name}</p>
                                    )}
                                </div>
                            </div>
                            {(buyerInfo?.phone || buyerInfo?.email || buyerInfo?.location || buyerInfo?.gstin || buyerInfo?.memberSince) && (
                                <div className="mt-2.5 grid grid-cols-1 gap-1.5 border-t pt-2.5" style={{ borderColor: C.hair }}>
                                    {buyerInfo.phone && (
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>Phone</span>
                                            <span className="text-[11px] font-semibold tracking-wide" style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{buyerInfo.phone}</span>
                                        </div>
                                    )}
                                    {buyerInfo.email && (
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>Email</span>
                                            <span className="truncate text-[11px] font-semibold tracking-wide" style={{ color: C.ink }}>{buyerInfo.email}</span>
                                        </div>
                                    )}
                                    {buyerInfo.location && (
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>Location</span>
                                            <span className="truncate text-[11px] font-semibold tracking-wide" style={{ color: C.ink }}>{buyerInfo.location}</span>
                                        </div>
                                    )}
                                    {buyerInfo.gstin && (
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>GSTIN</span>
                                            <span className="text-[11px] font-semibold tracking-wide" style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{buyerInfo.gstin}</span>
                                        </div>
                                    )}
                                    {buyerInfo.memberSince && (
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>On BBM since</span>
                                            <span className="text-[11px] font-semibold tracking-wide" style={{ color: C.ink }}>
                                                {new Date(buyerInfo.memberSince).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* decision — Approve/Decline for a fresh request, Update limit for a limit-increase ask */}
                    {needsDecision && (
                        isLimitRequest ? (
                            <div className="flex gap-2 px-3.5 pb-3.5">
                                <button onClick={() => onRequestLimitUpdate(credit.id, buyerLabel || "this buyer", credit.credit_limit)}
                                    disabled={decliningIncrease}
                                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[11.5px] font-bold tracking-wide text-white transition-transform active:scale-[0.97] disabled:opacity-60"
                                    style={{ background: C.secondary }}>
                                    <CreditCard className="h-3.5 w-3.5" /> Update limit
                                </button>
                                <button onClick={handleDeclineIncrease} disabled={decliningIncrease}
                                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-[11.5px] font-bold tracking-wide transition-colors hover:bg-black/[0.03] disabled:opacity-60"
                                    style={{ borderColor: C.hair, color: C.muted }}>
                                    {decliningIncrease && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                    Decline
                                </button>
                            </div>
                        ) : (
                            isLimitRequest ? (
                                <div className="flex gap-2 px-3.5 pb-3.5">
                                    <button
                                        onClick={() => onRequestLimitUpdate(credit.id, buyerLabel || "this buyer", credit.credit_limit)}
                                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[11.5px] font-bold tracking-wide text-white transition-transform active:scale-[0.97]"
                                        style={{ background: C.secondary }}
                                    >
                                        <CreditCard className="h-3.5 w-3.5" /> Update limit
                                    </button>
                                </div>
                            ) : (
                                <div className="flex gap-2 px-3.5 pb-3.5">
                                    <button onClick={() => onRequestApproval(credit.id, buyerLabel || "this buyer")} disabled={!!decidingCredit}
                                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[11.5px] font-bold tracking-wide text-white transition-transform active:scale-[0.97] disabled:opacity-60"
                                        style={{ background: C.ok }}>
                                        <Check className="h-3.5 w-3.5" /> Approve
                                    </button>
                                    <button onClick={handleDecline} disabled={!!decidingCredit}
                                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-[11.5px] font-bold tracking-wide transition-colors hover:bg-black/[0.03] disabled:opacity-60"
                                        style={{ borderColor: C.hair, color: C.muted }}>
                                        {decidingCredit === "rejected" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                        Decline
                                    </button>
                                </div>
                            )
                        )
                    )}
                    <div className="flex items-center justify-end px-3.5 pb-3">
                        <span className="text-[10px] font-semibold" style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}>{time}</span>
                    </div>
                </div>
            </div>
        );
    }

    const time = new Date(message.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    const isDeleted = !!message.deleted_at;
    const isFailed = message.status === "failed";
    const isOuterEdge = groupPos === "last" || groupPos === "only";

    const tailRadius = isMine
        ? { borderBottomRightRadius: isOuterEdge ? 4 : 16 }
        : { borderBottomLeftRadius: isOuterEdge ? 4 : 16 };

    return (
        <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className={`group relative flex items-center gap-1 ${isMine ? "justify-end" : "justify-start"} ${isOuterEdge ? "mb-3" : "mb-0.5"}`}
        >
            {isMine && !isDeleted && (
                <div className="relative opacity-0 transition-opacity group-hover:opacity-100" ref={menuRef}>
                    <button onClick={() => setMenuOpen((v) => !v)} className="rounded-full p-1 hover:bg-black/5">
                        <MoreVertical className="h-3.5 w-3.5" style={{ color: C.muted }} />
                    </button>
                    <AnimatePresence>
                        {menuOpen && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.96, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: -4 }} transition={{ duration: 0.12 }}
                                className="absolute right-0 top-6 z-10 w-40 overflow-hidden rounded-xl border bg-white py-1 shadow-lg" style={{ borderColor: C.hair }}
                            >
                                <button onClick={() => { setMenuOpen(false); onDelete(message.id, "me"); }} className="flex w-full items-center px-3 py-2 text-left text-[12.5px] font-semibold transition-colors hover:bg-black/5" style={{ color: C.ink }}>
                                    Delete for me
                                </button>
                                <button onClick={() => { setMenuOpen(false); onDelete(message.id, "everyone"); }} className="flex w-full items-center px-3 py-2 text-left text-[12.5px] font-semibold transition-colors hover:bg-rose-50" style={{ color: C.danger }}>
                                    Delete for everyone
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            <div
                className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug tracking-wide sm:max-w-[65%] ${isDeleted ? "italic" : ""}`}
                style={{
                    ...(isDeleted
                        ? { background: "rgba(11,17,22,0.04)", color: C.muted, border: `1px dashed ${C.hair}` }
                        : isMine
                            ? { background: isFailed ? C.dangerSoft : "linear-gradient(135deg, #006F83 0%, #0B8A93 100%)", color: "#fff", boxShadow: "0 1px 2px rgba(11,17,22,0.08)" }
                            : { background: C.surface, color: C.ink, border: `1px solid ${C.hair}`, boxShadow: "0 1px 2px rgba(11,17,22,0.04)" }),
                    ...tailRadius,
                }}
            >
                {isDeleted ? (
                    <p className="flex items-center gap-1.5"><Ban className="h-3 w-3" /> This message was deleted</p>
                ) : (
                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
                )}
                <div className={`mt-1 flex items-center gap-1.5 ${isMine ? "justify-end" : "justify-start"}`}>
                    <span className="text-[10px] font-semibold" style={{ color: isMine && !isDeleted ? "rgba(255,255,255,0.75)" : C.muted }}>{time}</span>
                    {isMine && !isDeleted && <TickIcon status={message.status} onRetry={() => onRetry(message.id)} />}
                </div>
            </div>
        </motion.div>
    );
}, (prev, next) => (
    prev.message === next.message &&
    prev.isMine === next.isMine &&
    prev.groupPos === next.groupPos &&
    prev.credit === next.credit &&
    prev.buyerInfo === next.buyerInfo &&
    prev.onDecideCredit === next.onDecideCredit &&
    prev.onRequestApproval === next.onRequestApproval &&
    prev.onRequestLimitUpdate === next.onRequestLimitUpdate &&
    prev.onDeclineLimitIncrease === next.onDeclineLimitIncrease &&
    prev.disabled === next.disabled
));

// ---- composer -----------------------------------------------------------

function ChatComposer({ onSend, sending, onTypingChange, disabled }) {
    const [value, setValue] = useState("");
    const textareaRef = useRef(null);

    const autoGrow = (e) => {
        setValue(e.target.value);
        onTypingChange?.(e.target.value.length > 0);
        e.target.style.height = "auto";
        e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
    };
    const submit = () => {
        if (!value.trim() || disabled) return;
        onSend(value);
        onTypingChange?.(false);
        setValue("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
    };
    const onKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
    };

    if (disabled) {
        return (
            <div className="flex items-center justify-center gap-2 border-t px-3 py-2.5 sm:px-4" style={{ borderColor: C.hair, background: C.hairSoft }}>
                <ShieldOff className="h-3.5 w-3.5" style={{ color: C.muted }} />
            </div>
        );
    }

    return (
        <div className="flex items-end gap-2 border-t px-3 py-2.5 sm:px-4" style={{ borderColor: C.hair, background: C.surface }}>
            <textarea
                ref={textareaRef}
                value={value}
                onChange={autoGrow}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Type a message…"
                className="max-h-[120px] flex-1 resize-none rounded-2xl border bg-[#FAFAF9] px-3.5 py-2.5 text-[13.5px] font-medium leading-snug tracking-wide outline-none transition-colors placeholder:text-slate-400 focus:border-[#006F83] focus:bg-white"
                style={{ borderColor: C.hair, color: C.ink }}
            />
            <button
                onClick={submit}
                disabled={!value.trim() || sending}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-transform active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                style={{ background: C.secondary }}
            >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
        </div>
    );
}

// ---- skeleton (initial load) ---------------------------------------------

function ThreadSkeleton() {
    const widths = ["55%", "38%", "62%", "44%"];
    return (
        <div className="flex flex-1 flex-col justify-end gap-2 px-4 py-3">
            {widths.map((w, i) => (
                <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                    <div className="h-9 animate-pulse rounded-2xl" style={{ width: w, background: C.hairSoft }} />
                </div>
            ))}
        </div>
    );
}

// ---- main -----------------------------------------------------------------

export default function ChatWindow({ conversationId, meta, onBack }) {
    const { profile } = useAuth();
    const { markLocalRead } = useChatContext();
    const scrollRef = useRef(null);
    const bottomRef = useRef(null);
    const presence = usePresence(meta?.otherUserId ? [meta.otherUserId] : []);
    const otherPresence = meta?.otherUserId ? presence[meta.otherUserId] : null;

    // ---- credit approval dialog ----
    const [approvalDialog, setApprovalDialog] = useState(null); // { creditId, buyerLabel } | null
    const [confirmingApproval, setConfirmingApproval] = useState(false);

    const handleRequestApproval = useCallback((creditId, buyerLabel) => {
        setApprovalDialog({ creditId, buyerLabel });
    }, []);

    // FIXED: now accepts and forwards the numeric limit typed into the dialog
    const handleConfirmApproval = async (limit) => {
        if (!approvalDialog) return;
        setConfirmingApproval(true);
        await decide(approvalDialog.creditId, "approved", limit);
        setConfirmingApproval(false);
        setApprovalDialog(null);
    };

    // ---- NEW: credit limit-update dialog (seller responding to a buyer's ask) ----
    const [limitDialog, setLimitDialog] = useState(null); // { creditId, buyerLabel, currentLimit } | null
    const [confirmingLimit, setConfirmingLimit] = useState(false);

    const handleRequestLimitUpdate = useCallback((creditId, buyerLabel, currentLimit) => {
        setLimitDialog({ creditId, buyerLabel, currentLimit });
    }, []);

    const handleConfirmLimitUpdate = async (newLimit) => {
        if (!limitDialog) return;
        setConfirmingLimit(true);
        await updateLimit(limitDialog.creditId, newLimit);
        setConfirmingLimit(false);
        setLimitDialog(null);
    };

    // `updateLimit` must be exposed by useCredit() the same way `decide` is —
    // see the NOTE at the top of this file.
    const { credit, viewerRole, buyerInfo, request, decide, toggle, updateLimit, requestIncrease, declineIncrease } = useCredit(meta?.otherUserId);
    const [requestingCredit, setRequestingCredit] = useState(false);
    const [requestingIncrease, setRequestingIncrease] = useState(false); // NEW

    const handleRequestIncrease = useCallback(async () => {
        if (!credit?.id) return;
        setRequestingIncrease(true);
        await requestIncrease(credit.id);
        setRequestingIncrease(false);
    }, [credit?.id, requestIncrease]);

    const handleDeclineLimitIncrease = useCallback(async (creditId) => {
        await declineIncrease(creditId);
    }, [declineIncrease]);


    const handleRequestCredit = async () => {
        setRequestingCredit(true);
        await request();
        setRequestingCredit(false);
    };

    const {
        messages, loading, loadingOlder, hasMore, loadOlder,
        send, retry, deleteMessage, sending, otherTyping, notifyTyping, connected,
        canSend,
        sendError,
    } = useChatMessages(conversationId, meta?.otherUserId);

    const isLockedOut = !!meta?.otherIsDeletedSeller || canSend === false;

    // ---- scroll behavior ---------------------------------------------
    const [isNearBottom, setIsNearBottom] = useState(true);
    const [newIncoming, setNewIncoming] = useState(0);

    const scrollStateRef = useRef({ convId: null, placedAtBottom: false });
    const lastMessageIdRef = useRef(null);
    const isPrependingRef = useRef(false);
    const prevScrollHeightRef = useRef(0);

    const messageRefs = useRef(new Map());
    const [highlightedMessageId, setHighlightedMessageId] = useState(null);
    const highlightTimeoutRef = useRef(null);

    const scrollToMessage = useCallback((messageId) => {
        const el = messageRefs.current.get(messageId);
        if (!el) return;
        el.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
        clearTimeout(highlightTimeoutRef.current);
        setHighlightedMessageId(messageId);
        highlightTimeoutRef.current = setTimeout(() => setHighlightedMessageId(null), 2200);
    }, []);

    useEffect(() => () => clearTimeout(highlightTimeoutRef.current), []);

    const jumpToBottom = useCallback((smooth = false) => {
        bottomRef.current?.scrollIntoView(smooth && !prefersReducedMotion ? { behavior: "smooth", block: "end" } : { block: "end" });
    }, []);

    useEffect(() => {
        if (scrollStateRef.current.convId !== conversationId) {
            scrollStateRef.current = { convId: conversationId, placedAtBottom: false };
            lastMessageIdRef.current = null;
            setIsNearBottom(true);
            setNewIncoming(0);
        }
    }, [conversationId]);

    useEffect(() => {
        if (conversationId) markLocalRead(conversationId);
    }, [conversationId, markLocalRead]);

    useEffect(() => {
        const last = messages[messages.length - 1];
        if (last && last.sender_id !== profile?.id) markLocalRead(conversationId);
    }, [messages, profile?.id, conversationId, markLocalRead]);

    useLayoutEffect(() => {
        if (loading) return;
        if (scrollStateRef.current.convId !== conversationId) return;
        if (scrollStateRef.current.placedAtBottom) return;
        scrollStateRef.current.placedAtBottom = true;
        const last = messages[messages.length - 1];
        lastMessageIdRef.current = last ? rowKey(last) : null;
        jumpToBottom(false);
    }, [loading, messages, conversationId, jumpToBottom]);

    const handleLoadOlder = useCallback(() => {
        if (!scrollRef.current || loadingOlder || !hasMore) return;
        isPrependingRef.current = true;
        prevScrollHeightRef.current = scrollRef.current.scrollHeight;
        loadOlder();
    }, [loadOlder, loadingOlder, hasMore]);

    useLayoutEffect(() => {
        if (isPrependingRef.current && scrollRef.current) {
            const el = scrollRef.current;
            el.scrollTop += el.scrollHeight - prevScrollHeightRef.current;
            isPrependingRef.current = false;
        }
    }, [messages]);

    useLayoutEffect(() => {
        if (!scrollStateRef.current.placedAtBottom) return;
        const last = messages[messages.length - 1];
        if (!last) return;
        const key = rowKey(last);
        if (key === lastMessageIdRef.current) return;
        lastMessageIdRef.current = key;

        const mine = last.sender_id === profile?.id;
        if (mine || isNearBottom) {
            jumpToBottom(false);
            setNewIncoming(0);
        } else {
            setNewIncoming((n) => n + 1);
        }
    }, [messages, isNearBottom, profile?.id, jumpToBottom]);

    useLayoutEffect(() => {
        if (otherTyping && isNearBottom) jumpToBottom(false);
    }, [otherTyping, isNearBottom, jumpToBottom]);

    const pinnedRef = useRef(true);
    useEffect(() => { pinnedRef.current = isNearBottom; }, [isNearBottom]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => {
            if (pinnedRef.current) jumpToBottom(false);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [jumpToBottom]);

    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        const nearBottom = distanceFromBottom < NEAR_BOTTOM_PX;
        setIsNearBottom(nearBottom);
        if (nearBottom) setNewIncoming(0);
        if (el.scrollTop < 80 && hasMore && !loadingOlder) handleLoadOlder();
    };

    const handleJumpToBottomClick = () => {
        jumpToBottom(false);
        setNewIncoming(0);
    };

    const stopScrollPropagation = useCallback((e) => { e.stopPropagation(); }, []);

    let lastDay = null;

    return (
        <div className="flex h-full flex-col" style={{ background: C.canvas }}>
            {!connected && (
                <div className="px-4 py-1.5 text-center text-[11px] font-bold text-white" style={{ background: C.danger }}>
                    Reconnecting…
                </div>
            )}

            <ChatHeader meta={meta} otherPresence={otherPresence} otherTyping={otherTyping} onBack={onBack} />

            {viewerRole === "seller" && credit?.status === "pending" && credit?.request_message_id && (
                <PendingCreditBanner
                    buyerLabel={buyerInfo?.businessName || buyerInfo?.name || "a buyer"}
                    onClick={() => scrollToMessage(credit.request_message_id)}
                />
            )}

            <StatusStrip
                credit={credit} viewerRole={viewerRole} otherName={meta?.otherShopName || meta?.title || "them"}
                onToggleCredit={toggle}
                onRequestCredit={handleRequestCredit} requestingCredit={requestingCredit}
                onRequestIncrease={handleRequestIncrease} requestingIncrease={requestingIncrease}
                disabled={isLockedOut}
            />

            <div className="relative min-h-0 flex-1">
                <div
                    ref={scrollRef}
                    onScroll={onScroll}
                    data-lenis-prevent
                    onWheel={stopScrollPropagation}
                    onTouchStart={stopScrollPropagation}
                    onTouchMove={stopScrollPropagation}
                    className="h-full overflow-y-auto px-3 py-3 sm:px-4"
                >
                    {loadingOlder && (
                        <div className="flex justify-center py-2"><Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: C.muted }} /></div>
                    )}
                    {loading ? (
                        <ThreadSkeleton />
                    ) : messages.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                            <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: C.hairSoft }}>
                                <MessageCircle className="h-5 w-5" style={{ color: C.muted }} />
                            </span>
                            <p className="text-[13px] font-bold" style={{ color: C.ink }}>Say hello 👋</p>
                            <p className="max-w-[220px] text-[11.5px] font-medium" style={{ color: C.muted }}>Your messages with {meta?.otherShopName || meta?.title || "them"} start here.</p>
                        </div>
                    ) : (
                        <AnimatePresence initial={false}>
                            {messages.map((m, i) => {
                                const day = dayLabel(m.created_at);
                                const showDay = day !== lastDay;
                                lastDay = day;

                                const prev = messages[i - 1];
                                const next = messages[i + 1];
                                const withinPrevGroup = !showDay && prev && prev.sender_id === m.sender_id && (new Date(m.created_at) - new Date(prev.created_at)) < GROUP_GAP_MS;
                                const withinNextGroup = next && next.sender_id === m.sender_id && dayLabel(next.created_at) === day && (new Date(next.created_at) - new Date(m.created_at)) < GROUP_GAP_MS;
                                const groupPos = withinPrevGroup && withinNextGroup ? "middle" : withinPrevGroup ? "last" : withinNextGroup ? "first" : "only";

                                return (
                                    <div
                                        key={rowKey(m)}
                                        ref={(el) => {
                                            if (el) messageRefs.current.set(m.id, el);
                                            else messageRefs.current.delete(m.id);
                                        }}
                                        className="rounded-2xl transition-colors duration-500"
                                        style={highlightedMessageId === m.id ? { background: `${C.secondary}0f`, boxShadow: `0 0 0 2px ${C.secondary}30` } : undefined}
                                    >
                                        {showDay && (
                                            <div className="my-3 flex items-center justify-center">
                                                <span className="rounded-full px-3 py-1 text-[10.5px] font-bold tracking-wide" style={{ background: "rgba(11,17,22,0.05)", color: C.muted }}>
                                                    {day}
                                                </span>
                                            </div>
                                        )}
                                        <MessageBubble
                                            message={m}
                                            isMine={m.sender_id === profile?.id}
                                            groupPos={groupPos}
                                            onDelete={deleteMessage}
                                            onRetry={retry}
                                            credit={credit}
                                            buyerInfo={buyerInfo}
                                            onDecideCredit={decide}
                                            onRequestApproval={handleRequestApproval}
                                            onRequestLimitUpdate={handleRequestLimitUpdate}
                                            onDeclineLimitIncrease={handleDeclineLimitIncrease}
                                            disabled={isLockedOut}
                                        />
                                    </div>
                                );
                            })}
                        </AnimatePresence>
                    )}
                    <AnimatePresence>
                        {otherTyping && !isLockedOut && <TypingBubble key="typing-bubble" />}
                    </AnimatePresence>
                    <div ref={bottomRef} />
                </div>

                <AnimatePresence>
                    {newIncoming > 0 && (
                        <motion.button
                            initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }} transition={{ duration: 0.15, ease: EASE }}
                            onClick={handleJumpToBottomClick}
                            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-bold text-white shadow-lg"
                            style={{ background: C.secondary }}
                        >
                            {newIncoming} new message{newIncoming > 1 ? "s" : ""} <ArrowDown className="h-3.5 w-3.5" />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>

            {sendError && !isLockedOut && (
                <div className="px-3.5 py-1.5 text-[11.5px] font-semibold" style={{ color: C.danger, background: C.dangerBg }}>
                    {sendError}
                </div>
            )}

            {isLockedOut && <DeletedSellerNotice shopName={meta?.otherShopName} />}

            <ChatComposer
                onSend={send}
                sending={sending}
                onTypingChange={notifyTyping}
                disabled={isLockedOut}
            />

            <CreditApprovalDialog
                open={!!approvalDialog}
                onClose={() => setApprovalDialog(null)}
                onConfirm={handleConfirmApproval}
                buyerLabel={approvalDialog?.buyerLabel}
                confirming={confirmingApproval}
            />

            <CreditLimitDialog
                open={!!limitDialog}
                onClose={() => setLimitDialog(null)}
                onConfirm={handleConfirmLimitUpdate}
                buyerLabel={limitDialog?.buyerLabel}
                currentLimit={limitDialog?.currentLimit}
                confirming={confirmingLimit}
            />
        </div>
    );
}