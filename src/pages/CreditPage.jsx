// pages/CreditPage.jsx
//
// Credit hub — compact, full-viewport-height layout.
//
//   Tabs
//     Approved sellers : Requests · Approved · Sellers
//     Everyone else    : Approved · Sellers
//
//   Requests  : incoming buyer requests. Filter chips (All / Pending / Active / Declined).
//               Sellers can also "Add buyer": search any verified buyer and approve credit directly.
//               Declined / turned-off buyers have a Credit switch so a mistaken decline can be undone.
//   Approved  : ONLY sellers who approved your credit. Filter chips (All / Available / Limit reached)
//   Sellers   : compact directory of every other shop. Filter chips (All / Not requested / Pending / Approved)
//
// LAYOUT: the page is at least one viewport tall (min-h-screen) and the list card
// stretches to fill it; the page itself scrolls when there are many rows.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    History, ArrowLeft, CreditCard, Search, Loader2, Clock3, Check, X,
    ChevronDown, Ban, TrendingUp, AlertCircle, Store, UserPlus,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import { useNotifications } from "../context/NotificationsContext.jsx";
import useCreditCenter from "../hooks/useCreditCenter.js";
import LimitDialog from "../components/credit/LimitDialog.jsx";
import BuyerSearchDialog from "../components/credit/BuyerSearchDialog.jsx";
import { C, EASE, fmtINR, initials, shortDate, timeLabel, dayLabel } from "../components/credit/tokens.js";

// Row separator: a touch stronger than the card border so rows read clearly.
const SEP = "rgba(11,17,22,0.2)";

// ── primitives ────────────────────────────────────────────────────────────

const TONES = {
    ok: { bg: C.okBg, fg: C.ok },
    warn: { bg: C.warnBg, fg: C.warn },
    danger: { bg: C.dangerBg, fg: C.danger },
    muted: { bg: C.hairSoft, fg: C.muted },
    accent: { bg: "#006F8314", fg: C.accent },
};

function Pill({ tone = "muted", icon: Icon, children }) {
    const t = TONES[tone];
    return (
        <span className="inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide" style={{ background: t.bg, color: t.fg }}>
            {Icon && <Icon className="h-3 w-3 shrink-0" strokeWidth={2.5} />}
            {children}
        </span>
    );
}

function Btn({ variant = "solid", size = "md", busy, disabled, onClick, icon: Icon, children, className = "" }) {
    const solid = variant === "solid";
    const dim = size === "sm" ? "h-8 px-3 text-[11.5px]" : "h-9 px-4 text-[12.5px]";
    return (
        <button
            type="button" onClick={onClick} disabled={busy || disabled}
            className={`inline-flex ${dim} items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-bold tracking-wide transition-transform active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${solid ? "bg-black text-white hover:bg-black/90" : "border bg-white hover:bg-black/[0.03]"} ${className}`}
            style={solid ? undefined : { borderColor: C.hair, color: C.ink }}
        >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={2.4} /> : null}
            {children}
        </button>
    );
}

function Tile({ name, logo, size = 44 }) {
    const [broken, setBroken] = useState(false);
    useEffect(() => { setBroken(false); }, [logo]);
    return (
        <span
            className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl"
            style={{ width: size, height: size, background: C.imgBg, border: `1px solid ${C.hairSoft}` }}
        >
            {logo && !broken ? (
                <img src={logo} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="h-full w-full object-cover" />
            ) : (
                <span className="font-extrabold tracking-wide" style={{ color: C.ink, fontSize: size <= 36 ? 11 : 13 }}>{initials(name)}</span>
            )}
        </span>
    );
}

function PillTabs({ options, value, onChange, layoutId, fill }) {
    return (
        <div role="tablist" className={`relative inline-flex rounded-full p-0.5 ${fill ? "w-full sm:w-auto" : ""}`} style={{ background: C.hairSoft }}>
            {options.map((o) => {
                const active = value === o.value;
                return (
                    <button
                        key={o.value} type="button" role="tab" aria-selected={active}
                        onClick={() => onChange(o.value)}
                        className={`relative rounded-full px-3.5 py-1.5 text-[12px] font-bold tracking-wide transition-colors duration-150 ${fill ? "flex-1 sm:flex-none" : ""}`}
                        style={{ color: active ? "#fff" : C.muted }}
                    >
                        {active && (
                            <motion.span
                                layoutId={layoutId} className="absolute inset-0 rounded-full" style={{ background: C.primary }}
                                transition={{ type: "spring", stiffness: 500, damping: 38 }}
                            />
                        )}
                        <span className="relative flex items-center justify-center gap-1.5">
                            {o.label}
                            {o.count > 0 && (
                                <span
                                    className="flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 text-[9.5px] font-bold text-white"
                                    style={{ background: active ? "rgba(255,255,255,0.22)" : C.badge }}
                                >
                                    {o.count}
                                </span>
                            )}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

// Clickable filter chips (tap again on the active chip to go back to "All").
function FilterBar({ options, value, onChange, summary }) {
    return (
        <div className="flex items-center gap-2 pb-2.5">
            <div
                role="group" aria-label="Filter list"
                className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                {options.map((o) => {
                    const active = value === o.value;
                    const alert = o.alert && o.count > 0;
                    return (
                        <button
                            key={o.value} type="button" aria-pressed={active}
                            onClick={() => onChange(active && o.value !== "all" ? "all" : o.value)}
                            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-bold tracking-wide transition-all active:scale-95"
                            style={active
                                ? { background: C.primary, borderColor: C.primary, color: "#fff" }
                                : { background: "#fff", borderColor: C.hair, color: C.ink }}
                        >
                            {o.label}
                            <span
                                className="flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 text-[9.5px] font-bold tabular-nums"
                                style={active
                                    ? { background: "rgba(255,255,255,0.22)", color: "#fff" }
                                    : alert ? { background: C.badge, color: "#fff" } : { background: C.hairSoft, color: C.muted }}
                            >
                                {o.count}
                            </span>
                        </button>
                    );
                })}
            </div>
            {summary && (
                <div className="hidden shrink-0 text-right leading-tight sm:block">
                    <p className="text-[8.5px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>{summary.label}</p>
                    <p className="text-[13px] font-extrabold tabular-nums" style={{ color: C.ink }}>{summary.value}</p>
                </div>
            )}
        </div>
    );
}

function CreditSwitch({ on, busy, onChange }) {
    return (
        <button
            type="button" role="switch" aria-checked={on} aria-label={`Credit ${on ? "enabled" : "off"}`}
            disabled={busy} onClick={() => onChange(!on)}
            className="inline-flex cursor-pointer items-center gap-2.5 disabled:opacity-60"
        >
            <span className="relative flex h-5 w-10 shrink-0 items-center rounded-full p-0.5 transition-all duration-200" style={{ backgroundColor: on ? C.primary : "#D9DEE2" }}>
                <span
                    className="h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-transform duration-200"
                    style={{ transform: on ? "translateX(20px)" : "translateX(0px)" }}
                />
            </span>
            <span className="flex flex-col items-start leading-none">
                <span className="text-[11px] font-bold tracking-[0.02em]" style={{ color: C.ink }}>Credit</span>
                <span className="mt-0.5 text-[10px] font-medium tracking-wide" style={{ color: on ? C.ok : "#7B858C" }}>
                    {busy ? "Updating…" : on ? "Enabled" : "Off"}
                </span>
            </span>
        </button>
    );
}

function UsageBar({ used, limit }) {
    const remaining = Math.max(limit - used, 0);
    const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    const color = limit > 0 && remaining <= 0 ? C.danger : pct >= 75 ? C.warn : C.ok;
    return (
        <div className="mt-2.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: C.hairSoft }}>
                <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, background: color }} />
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] font-semibold tracking-wide tabular-nums" style={{ color: C.muted }}>
                <span>Used {fmtINR(used)}</span>
                <span>Limit {fmtINR(limit)}</span>
            </div>
        </div>
    );
}

// Bordered card that stretches to fill the remaining height.
function Shell({ children }) {
    return (
        <div className="-mx-3 flex flex-1 flex-col overflow-hidden border-y bg-white sm:mx-0 sm:rounded-2xl sm:border" style={{ borderColor: C.hair }}>
            {children}
        </div>
    );
}

function RowGrid({ count, cols = 2, children }) {
    return (
        <div className={`grid grid-cols-1 gap-px ${cols === 2 ? "lg:grid-cols-2" : ""}`} style={{ background: SEP }}>
            {children}
            {cols === 2 && count % 2 === 1 && <div className="hidden bg-white lg:block" aria-hidden="true" />}
        </div>
    );
}

// Each record is its own bordered card with a gap between cards, so two
// records are never confused at a glance (used for Requests and Approved).
function CardList({ children }) {
    return (
        <div className="flex flex-col gap-2.5 p-2.5 sm:p-3 lg:grid lg:grid-cols-2 [&>article]:overflow-hidden [&>article]:rounded-xl [&>article]:border [&>article]:border-[rgba(11,17,22,0.18)] [&>article]:shadow-[0_1px_2px_rgba(11,17,22,0.06)]">
            {children}
        </div>
    );
}

function Band({ title, count, alert }) {
    return (
        <div className="flex items-center gap-2 border-b bg-white px-3 py-2 sm:px-4" style={{ borderColor: SEP }}>
            {alert && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.badge }} />}
            <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: C.ink }}>{title}</span>
            {count != null && (
                <span
                    className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1.5 text-[9.5px] font-bold"
                    style={alert ? { background: C.badge, color: "#fff" } : { background: C.hairSoft, color: C.muted }}
                >
                    {count}
                </span>
            )}
        </div>
    );
}

function SearchField({ value, onChange, placeholder, className = "" }) {
    return (
        <div className={`flex h-9 items-center gap-2 rounded-full border bg-white px-3.5 ${className}`} style={{ borderColor: C.hair }}>
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: C.muted }} />
            <input
                value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
                className="w-full min-w-0 bg-transparent text-[13px] font-medium tracking-wide outline-none placeholder:text-slate-400 sm:text-[13px]"
                style={{ color: C.ink }}
            />
            {value && (
                <button type="button" onClick={() => onChange("")} aria-label="Clear search">
                    <X className="h-3.5 w-3.5" style={{ color: C.muted }} />
                </button>
            )}
        </div>
    );
}

function Empty({ icon: Icon, title, hint, action }) {
    return (
        <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: C.hairSoft }}>
                <Icon className="h-5 w-5" style={{ color: C.muted }} />
            </span>
            <p className="text-[13px] font-bold" style={{ color: C.ink }}>{title}</p>
            {hint && <p className="max-w-[260px] text-[11.5px] font-medium leading-snug" style={{ color: C.muted }}>{hint}</p>}
            {action}
        </div>
    );
}

function RowSkeleton({ compact }) {
    const s = compact ? "h-9 w-9" : "h-11 w-11";
    return (
        <div className={`flex items-center gap-3 bg-white px-3 sm:px-4 ${compact ? "py-2.5" : "py-3.5"}`}>
            <div className={`${s} shrink-0 animate-pulse rounded-xl`} style={{ background: C.hairSoft }} />
            <div className="flex-1 space-y-2">
                <div className="h-3 w-2/5 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                <div className="h-2.5 w-1/4 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
            </div>
            <div className="h-7 w-16 shrink-0 animate-pulse rounded-lg" style={{ background: C.hairSoft }} />
        </div>
    );
}

function SkeletonList({ compact, cols = 2 }) {
    return (
        <RowGrid count={8} cols={cols}>
            {Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} compact={compact} />)}
        </RowGrid>
    );
}

// ── buyer side ────────────────────────────────────────────────────────────

function buyerState(credit) {
    if (!credit) return { kind: "none" };
    const now = new Date();
    switch (credit.status) {
        case "pending": return { kind: "pending" };
        case "approved": {
            const limit = Number(credit.credit_limit || 0);
            const used = Number(credit.credit_used || 0);
            const remaining = Math.max(limit - used, 0);
            return {
                kind: "approved", limit, used, remaining,
                isOut: limit > 0 && remaining <= 0,
                increasePending: !!credit.limit_increase_request_message_id,
                increaseCooldown: credit.limit_increase_cooldown_until && new Date(credit.limit_increase_cooldown_until) > now
                    ? credit.limit_increase_cooldown_until : null,
            };
        }
        case "rejected":
            return credit.cooldown_until && new Date(credit.cooldown_until) > now
                ? { kind: "cooldown", until: credit.cooldown_until }
                : { kind: "retry" };
        case "revoked": return { kind: "revoked" };
        default: return { kind: "none" };
    }
}

const CAPTIONS = {
    none: { text: "No credit yet", color: C.muted },
    pending: { text: "Waiting for the seller", color: C.warn },
    approved: { text: "Credit approved", color: C.ok },
    cooldown: { text: "Request declined", color: C.danger },
    retry: { text: "Last request declined", color: C.muted },
    revoked: { text: "Turned off by seller", color: C.muted },
};

const canRequest = (k) => k === "none" || k === "retry" || k === "revoked";

// Compact directory row (Sellers tab).
function CompactSellerRow({ seller, st, busyRequest, onRequest }) {
    const cap = CAPTIONS[st.kind];
    return (
        <article id={seller.credit?.id ? `credit-${seller.credit.id}` : undefined} className="flex items-center gap-3 bg-white px-3 py-2.5 sm:px-4">
            <Tile name={seller.shopName} logo={seller.logoUrl} size={36} />
            <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold leading-tight tracking-wide" style={{ color: C.ink }}>{seller.shopName || "Seller"}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide" style={{ color: cap.color }}>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cap.color }} />
                    <span className="truncate">
                        {cap.text}
                    </span>
                </p>
            </div>
            <div className="shrink-0">
                {canRequest(st.kind) && (
                    <Btn size="sm" busy={busyRequest} onClick={onRequest}>{st.kind === "none" ? "Request" : "Request again"}</Btn>
                )}
                {st.kind === "pending" && <Pill tone="warn" icon={Clock3}>Pending</Pill>}
                {st.kind === "cooldown" && <Pill tone="muted" icon={Ban}>Retry {shortDate(st.until)}</Pill>}
                {st.kind === "approved" && <Pill tone={st.isOut ? "danger" : "ok"} icon={Check}>{st.isOut ? "Limit reached" : "Approved"}</Pill>}
            </div>
        </article>
    );
}

// Detailed row (Approved tab): remaining balance, usage bar, ask-for-higher-limit.
function ApprovedRow({ seller, st, busyIncrease, onAskIncrease }) {
    return (
        <article id={seller.credit?.id ? `credit-${seller.credit.id}` : undefined} className="bg-white px-3 py-3 sm:px-4">
            <div className="flex items-center gap-3">
                <Tile name={seller.shopName} logo={seller.logoUrl} />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold leading-tight tracking-wide" style={{ color: C.ink }}>{seller.shopName || "Seller"}</p>
                    <p className="mt-1 text-[10.5px] font-semibold tracking-wide" style={{ color: st.isOut ? C.danger : C.ok }}>
                        {st.isOut ? "Limit reached" : "Credit active"}
                    </p>
                </div>
                <div className="shrink-0 text-right">
                    <p className="text-[15px] font-extrabold leading-tight tabular-nums" style={{ color: st.isOut ? C.danger : C.ink }}>{fmtINR(st.remaining)}</p>
                    <p className="text-[9.5px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>left</p>
                </div>
            </div>

            {st.limit > 0 && <UsageBar used={st.used} limit={st.limit} />}

            {st.isOut && (
                <div className="mt-2.5">
                    {!st.increasePending && !st.increaseCooldown && (
                        <Btn variant="outline" size="sm" icon={TrendingUp} busy={busyIncrease} onClick={onAskIncrease} className="w-full sm:w-auto">
                            Ask for higher limit
                        </Btn>
                    )}
                    {st.increasePending && <Pill tone="warn" icon={Clock3}>Higher limit requested</Pill>}
                    {!st.increasePending && st.increaseCooldown && (
                        <Pill tone="muted" icon={Ban}>Higher limit declined · retry {shortDate(st.increaseCooldown)}</Pill>
                    )}
                </div>
            )}
        </article>
    );
}

// ── seller side: incoming requests ────────────────────────────────────────

function needsAction(credit) {
    return credit.status === "pending" || (credit.status === "approved" && !!credit.limit_increase_request_message_id);
}

function DetailRow({ label, value, mono }) {
    if (!value) return null;
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>{label}</span>
            <span className="truncate text-[11.5px] font-semibold tracking-wide" style={{ color: C.ink, fontVariantNumeric: mono ? "tabular-nums" : undefined }}>
                {value}
            </span>
        </div>
    );
}

// Request rows are designed around ONE question: "what does the seller need to do?"
// Visual weight follows importance, so the eye lands on decisions first:
//   • Needs action  → accent stripe, decision facts inline, big Approve / Decline buttons
//   • Active credit → the balance is the hero number; controls are quiet secondary links
//   • Declined/off  → dimmed, single line; the Credit switch lets the seller undo a mistake
const fmtDate = (d) => d && new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function DetailsPanel({ buyerInfo }) {
    return (
        <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }} className="overflow-hidden"
        >
            <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1.5 border-t pt-3 sm:grid-cols-2" style={{ borderColor: C.hair }}>
                <DetailRow label="Phone" value={buyerInfo.phone} mono />
                <DetailRow label="Email" value={buyerInfo.email} />
                <DetailRow label="Location" value={buyerInfo.location} />
                <DetailRow label="GSTIN" value={buyerInfo.gstin} mono />
                <DetailRow label="On BBM since" value={fmtDate(buyerInfo.memberSince)} />
            </div>
        </motion.div>
    );
}

function TextAction({ icon: Icon, children, onClick, disabled }) {
    return (
        <button
            type="button" onClick={onClick} disabled={disabled}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11.5px] font-bold tracking-wide transition-colors hover:bg-black/5 disabled:opacity-50"
            style={{ color: C.accent }}
        >
            {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />}
            {children}
        </button>
    );
}

function RequestRow({ item, busy, onApprove, onDecline, onUpdateLimit, onDeclineIncrease, onToggle, onReenable }) {
    const { credit, buyerInfo } = item;
    const name = buyerInfo?.businessName || buyerInfo?.name || "Buyer";
    const person = buyerInfo?.businessName ? buyerInfo?.name : null;
    const [open, setOpen] = useState(false);

    const pending = credit.status === "pending";
    const approved = credit.status === "approved";
    const limitAsk = approved && !!credit.limit_increase_request_message_id;
    const attention = pending || limitAsk;

    const limit = Number(credit.credit_limit || 0);
    const used = Number(credit.credit_used || 0);
    const left = Math.max(limit - used, 0);
    const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    const barColor = limit > 0 && left <= 0 ? C.danger : pct >= 75 ? C.warn : C.ok;

    const hasDetails = !!buyerInfo && !!(buyerInfo.phone || buyerInfo.email || buyerInfo.location || buyerInfo.gstin || buyerInfo.memberSince);
    const details = (
        <AnimatePresence initial={false}>{open && hasDetails && <DetailsPanel buyerInfo={buyerInfo} />}</AnimatePresence>
    );

    // ── 1 · needs your action ──
    if (attention) {
        const facts = [person, buyerInfo?.location, buyerInfo?.memberSince && `On BBM since ${fmtDate(buyerInfo.memberSince)}`].filter(Boolean);
        return (
            <article id={`credit-${credit.id}`} className="relative bg-white px-3 py-3.5 pl-4 sm:px-4 sm:pl-5">
                <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: limitAsk ? C.warn : C.badge }} />
                <div className="flex flex-col gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Tile name={name} logo={buyerInfo?.logoUrl} size={44} />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <p className="truncate text-[14px] font-bold leading-tight tracking-wide" style={{ color: C.ink }}>{name}</p>
                                <Pill tone="warn" icon={limitAsk ? TrendingUp : Clock3}>{limitAsk ? "Wants higher limit" : "New request"}</Pill>
                            </div>
                            <p className="mt-1 truncate text-[11px] font-medium tracking-wide" style={{ color: C.muted }}>
                                {facts.length ? facts.join("  ·  ") : "Wants to buy on credit"}
                            </p>
                        </div>
                        {hasDetails && (
                            <button
                                type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Buyer details"
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5"
                            >
                                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} style={{ color: C.accent }} strokeWidth={2.4} />
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Btn icon={Check} busy={busy} onClick={pending ? onApprove : onUpdateLimit} className="flex-[1.4]">
                            {pending ? "Approve" : "Update limit"}
                        </Btn>
                        <Btn variant="outline" busy={busy} onClick={pending ? onDecline : onDeclineIncrease} className="flex-1">Decline</Btn>
                    </div>
                </div>
                {limitAsk && limit > 0 && (
                    <div className="mt-3">
                        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: C.hairSoft }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
                        </div>
                        <p className="mt-1 text-[10.5px] font-semibold tabular-nums tracking-wide" style={{ color: C.muted }}>
                            Used {fmtINR(used)} of {fmtINR(limit)} this month
                        </p>
                    </div>
                )}
                {details}
            </article>
        );
    }

    // ── 2 · active credit ──
    if (approved) {
        return (
            <article id={`credit-${credit.id}`} className="bg-white px-3 py-3.5 sm:px-4">
                <div className="flex items-center gap-3">
                    <Tile name={name} logo={buyerInfo?.logoUrl} size={40} />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-bold leading-tight tracking-wide" style={{ color: C.ink }}>{name}</p>
                        <p className="mt-0.5 truncate text-[10.5px] font-medium tracking-wide" style={{ color: C.muted }}>
                            {[person, buyerInfo?.location].filter(Boolean).join(" · ") || "Credit enabled"}
                        </p>
                    </div>
                    {limit > 0 && (
                        <div className="shrink-0 text-right">
                            <p className="text-[16px] font-extrabold leading-tight tabular-nums" style={{ color: left <= 0 ? C.danger : C.ink }}>{fmtINR(left)}</p>
                            <p className="text-[9.5px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>left</p>
                        </div>
                    )}
                </div>
                {limit > 0 && (
                    <div className="mt-3">
                        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: C.hairSoft }}>
                            <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, background: barColor }} />
                        </div>
                        <div className="mt-1 flex justify-between text-[10.5px] font-semibold tabular-nums tracking-wide" style={{ color: C.muted }}>
                            <span>Used {fmtINR(used)}</span>
                            <span>Limit {fmtINR(limit)}</span>
                        </div>
                    </div>
                )}
                <div className="mt-2.5 flex items-center gap-1 border-t pt-2.5" style={{ borderColor: C.hairSoft }}>
                    <CreditSwitch on busy={busy} onChange={onToggle} />
                    <div className="flex-1" />
                    {hasDetails && (
                        <TextAction onClick={() => setOpen((v) => !v)}>
                            Details <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} strokeWidth={2.5} />
                        </TextAction>
                    )}
                    <TextAction icon={CreditCard} disabled={busy} onClick={onUpdateLimit}>Change limit</TextAction>
                </div>
                {details}
            </article>
        );
    }

    // ── 3 · declined / turned off ──
    // Both get the Credit switch. A turned-off buyer keeps their old arrangement,
    // so the switch simply turns it back on. A declined buyer has no limit yet,
    // so switching on opens the limit dialog and approves them straight away
    // (no cooldown wait) — this is the "I declined by mistake" escape hatch.
    const off = credit.status === "revoked";
    return (
        <article id={`credit-${credit.id}`} className="flex items-center gap-3 bg-white px-3 py-3 sm:px-4">
            <div className="opacity-60"><Tile name={name} logo={buyerInfo?.logoUrl} size={36} /></div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold leading-tight tracking-wide" style={{ color: C.muted }}>{name}</p>
                <p className="mt-0.5 truncate text-[10.5px] font-medium tracking-wide" style={{ color: C.muted }}>
                    {off ? "Credit turned off" : "Declined · switch on if this was a mistake"}
                </p>
            </div>
            <CreditSwitch on={false} busy={busy} onChange={off ? onToggle : onReenable} />
        </article>
    );
}

// ── history ───────────────────────────────────────────────────────────────

function describe(e) {
    const who = e.counterpartName || (e.myRole === "seller" ? "A buyer" : "The seller");
    const me = e.actorIsMe;
    const lim = e.creditLimit != null ? fmtINR(e.creditLimit) : null;
    switch (e.eventType) {
        case "requested":
            return { icon: CreditCard, tone: "accent", text: me ? `You requested credit from ${who}` : `${who} requested credit from you` };
        case "approved":
            return { icon: Check, tone: "ok", text: me ? `You approved credit for ${who}` : `${who} approved your credit request`, extra: lim && `Limit ${lim}` };
        case "rejected":
            return { icon: X, tone: "danger", text: me ? `You declined ${who}'s credit request` : `${who} declined your credit request` };
        case "revoked":
            return { icon: Ban, tone: "muted", text: me ? `You turned off credit for ${who}` : `${who} turned off your credit` };
        case "enabled":
            return { icon: Check, tone: "ok", text: me ? `You turned credit back on for ${who}` : `${who} turned your credit back on` };
        case "limit_updated":
            return { icon: CreditCard, tone: "accent", text: me ? `You set ${who}'s credit limit` : `${who} updated your credit limit`, extra: lim && `New limit ${lim}` };
        case "limit_increase_requested":
            return { icon: TrendingUp, tone: "warn", text: me ? `You asked ${who} for a higher limit` : `${who} asked for a higher credit limit` };
        case "limit_increase_declined":
            return { icon: X, tone: "danger", text: me ? `You declined ${who}'s higher-limit request` : `${who} declined your higher-limit request` };
        default:
            return { icon: CreditCard, tone: "muted", text: "Credit update" };
    }
}

function HistoryView({ c, isSeller, role, setRole, onBack }) {
    const groups = useMemo(() => {
        const out = [];
        for (const e of c.history) {
            const day = dayLabel(e.createdAt);
            const last = out[out.length - 1];
            if (last && last.day === day) last.events.push(e);
            else out.push({ day, events: [e] });
        }
        return out;
    }, [c.history]);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                    <button onClick={onBack} aria-label="Back to credit" className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-black/5">
                        <ArrowLeft className="h-4 w-4" style={{ color: C.ink }} />
                    </button>
                    <h2 className="text-[16px] font-extrabold tracking-wide" style={{ color: C.ink }}>History</h2>
                </div>
                {isSeller && (
                    <PillTabs
                        fill layoutId="credit-history-pill" value={role} onChange={setRole}
                        options={[{ value: "all", label: "All" }, { value: "buyer", label: "As buyer" }, { value: "seller", label: "As seller" }]}
                    />
                )}
            </div>

            <Shell>
                {c.historyLoading ? (
                    <div className="divide-y" style={{ borderColor: C.hairSoft }}>
                        {Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} compact />)}
                    </div>
                ) : c.history.length === 0 ? (
                    <Empty icon={History} title="No activity yet" hint="Requests, approvals and limit changes will be logged here." />
                ) : (
                    <>
                        {groups.map((g, gi) => (
                            <section key={g.day + gi}>
                                <div className={`border-b bg-white px-3 py-2 sm:px-4 ${gi > 0 ? "border-t" : ""}`} style={{ borderColor: SEP }}>
                                    <span className="text-[10.5px] font-extrabold uppercase tracking-wider" style={{ color: C.muted }}>{g.day}</span>
                                </div>
                                <div className="divide-y" style={{ borderColor: C.hairSoft }}>
                                    {g.events.map((e) => {
                                        const d = describe(e);
                                        const t = TONES[d.tone];
                                        const Icon = d.icon;
                                        return (
                                            <div key={e.id} className="flex items-start gap-3 bg-white px-3 py-2.5 sm:px-4">
                                                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: t.bg, color: t.fg }}>
                                                    <Icon className="h-4 w-4" strokeWidth={2.4} />
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[12.5px] font-semibold leading-snug tracking-wide" style={{ color: C.ink }}>{d.text}</p>
                                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                        {d.extra && <Pill tone="muted">{d.extra}</Pill>}
                                                        {isSeller && (
                                                            <span className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                                                                {e.myRole === "seller" ? "As seller" : "As buyer"}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className="shrink-0 pt-1 text-[10.5px] font-semibold tabular-nums" style={{ color: C.muted }}>{timeLabel(e.createdAt)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        ))}
                        {c.historyHasMore && (
                            <div className="flex justify-center border-t bg-white py-3" style={{ borderColor: C.hair }}>
                                <button
                                    onClick={c.loadMoreHistory} disabled={c.historyLoadingMore}
                                    className="flex h-9 items-center gap-1.5 rounded-full border px-4 text-[12px] font-bold tracking-wide transition-colors hover:bg-black/[0.03] disabled:opacity-60"
                                    style={{ borderColor: C.hair, color: C.ink }}
                                >
                                    {c.historyLoadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Load older
                                </button>
                            </div>
                        )}
                    </>
                )}
            </Shell>
        </div>
    );
}

// ── page ──────────────────────────────────────────────────────────────────

export default function CreditPage() {
    const { profile } = useAuth();
    const { connected } = useSocket();
    const { creditUnreadCount, markCreditViewed } = useNotifications();

    const isApprovedSeller = profile?.seller_status === "approved";
    const isSeller = false; // seller inbox moved to Customers; this page is the buyer view for everyone
    const navigate = useNavigate();
    const [tabState, setTabState] = useState(null);
    const [filter, setFilter] = useState("all");
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyRole, setHistoryRole] = useState("all");
    const [query, setQuery] = useState("");
    // { kind: "approve" | "update", credit, label } for existing rows,
    // { kind: "grant", buyerId, label } for a buyer approved directly — picked from
    // the search dialog, or a previously declined buyer being re-enabled.
    const [dialog, setDialog] = useState(null);
    const [buyerSearchOpen, setBuyerSearchOpen] = useState(false);

    // Sellers land on Requests; everyone else lands on Approved.
    const tab = tabState === "requests" && !isSeller ? "approved" : tabState ?? (isSeller ? "requests" : "approved");

    const c = useCreditCenter({ isSeller, historyOpen, historyRole });

    // ── notification deep link: /credit?tab=requests|approved|sellers&highlight=<creditId> ──
    const [searchParams, setSearchParams] = useSearchParams();
    const [pendingHighlight, setPendingHighlight] = useState(null);

    useEffect(() => {
        const t = searchParams.get("tab");
        const hl = searchParams.get("highlight");
        if (!t && !hl) return;
        if (!profile) return; // wait for the profile so we know if "requests" is allowed
        if (t === "approved" || t === "sellers" || (t === "requests" && isSeller)) setTabState(t);
        setFilter("all");
        setQuery("");
        setHistoryOpen(false);
        if (hl) setPendingHighlight(hl);
        setSearchParams({}, { replace: true }); // so tapping the same notification again works
    }, [searchParams, profile, isSeller, setSearchParams]);

    // Scroll to the record and flash it. Retries automatically until the row exists
    // (data may still be loading / refetching after the realtime ping), then gives up after 5s.
    useEffect(() => {
        if (!pendingHighlight || historyOpen) return;
        const loaded = tab === "requests" ? c.incomingLoaded : c.sellersLoaded;
        if (!loaded) return;
        const el = document.getElementById(`credit-${pendingHighlight}`);
        if (!el) return;
        setPendingHighlight(null);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.animate(
            [
                { boxShadow: `0 0 0 3px ${C.accent}`, backgroundColor: "#E6F1F3" },
                { boxShadow: `0 0 0 3px ${C.accent}`, backgroundColor: "#E6F1F3", offset: 0.75 },
                { boxShadow: "0 0 0 3px rgba(0,111,131,0)", backgroundColor: "#FFFFFF" },
            ],
            { duration: 3600, easing: "ease-out" }
        );
    }, [pendingHighlight, tab, historyOpen, c.incomingLoaded, c.sellersLoaded, c.incoming, c.sellers]);

    useEffect(() => {
        if (!pendingHighlight) return;
        const t = setTimeout(() => setPendingHighlight(null), 5000);
        return () => clearTimeout(t);
    }, [pendingHighlight]);

    useEffect(() => {
        const mark = () => { if (document.visibilityState === "visible") markCreditViewed(); };
        if (creditUnreadCount > 0) mark();
        document.addEventListener("visibilitychange", mark);
        return () => document.removeEventListener("visibilitychange", mark);
    }, [creditUnreadCount, markCreditViewed]);

    useEffect(() => {
        if (!c.error) return;
        const t = setTimeout(c.clearError, 4500);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [c.error]);

    const q = query.trim().toLowerCase();

    const ownSellers = useMemo(
        () => c.sellers.filter((s) => s.sellerUserId !== profile?.id),
        [c.sellers, profile?.id]
    );

    // Every seller paired with its derived buyer-side state (computed once).
    const buyerRows = useMemo(
        () => ownSellers
            .map((s) => ({ seller: s, st: buyerState(s.credit) }))
            .sort((a, b) => (a.seller.shopName || "").localeCompare(b.seller.shopName || "")),
        [ownSellers]
    );

    const matchName = (s) => !q || (s.shopName || "").toLowerCase().includes(q);

    // Approved tab: ONLY sellers that approved my credit.
    const approvedAll = useMemo(() => buyerRows.filter((r) => r.st.kind === "approved"), [buyerRows]);
    const approvedList = useMemo(
        () => approvedAll.filter((r) => matchName(r.seller)
            && (filter === "all" || (filter === "available" && !r.st.isOut) || (filter === "out" && r.st.isOut))),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [approvedAll, q, filter]
    );

    // Sellers tab: compact directory.
    // Approved sellers live in the Approved tab, so they are never listed here.
    const directoryAll = useMemo(() => buyerRows.filter((r) => r.st.kind !== "approved"), [buyerRows]);

    const sellersList = useMemo(
        () => directoryAll.filter((r) => matchName(r.seller) && (
            filter === "all"
            || (filter === "open" && (canRequest(r.st.kind) || r.st.kind === "cooldown"))
            || (filter === "pending" && r.st.kind === "pending")
        )),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [directoryAll, q, filter]
    );

    const sellerCounts = useMemo(() => ({
        all: directoryAll.length,
        open: directoryAll.filter((r) => canRequest(r.st.kind) || r.st.kind === "cooldown").length,
        pending: directoryAll.filter((r) => r.st.kind === "pending").length,
    }), [directoryAll]);

    const approvedCounts = useMemo(() => ({
        all: approvedAll.length,
        available: approvedAll.filter((r) => !r.st.isOut).length,
        out: approvedAll.filter((r) => r.st.isOut).length,
    }), [approvedAll]);

    const availableTotal = useMemo(() => approvedAll.reduce((n, r) => n + r.st.remaining, 0), [approvedAll]);

    // Requests tab (seller side).
    const requestCounts = useMemo(() => {
        let action = 0, active = 0, other = 0, used = 0;
        for (const r of c.incoming) {
            if (needsAction(r.credit)) action += 1;
            else if (r.credit.status === "approved") active += 1;
            else if (r.credit.status === "rejected" || r.credit.status === "revoked") other += 1;
            if (r.credit.status === "approved") used += Number(r.credit.credit_used || 0);
        }
        return { all: c.incoming.length, action, active, other, used };
    }, [c.incoming]);

    const sections = useMemo(() => {
        const label = (r) => (r.buyerInfo?.businessName || r.buyerInfo?.name || "").toLowerCase();
        const filtered = c.incoming.filter((r) => {
            if (!q) return true;
            const b = r.buyerInfo;
            return [b?.businessName, b?.name, b?.phone, b?.location].filter(Boolean).join(" ").toLowerCase().includes(q);
        });
        const sorted = [...filtered].sort((a, b) => label(a).localeCompare(label(b)));
        return [
            { key: "action", title: "Needs your action", list: sorted.filter((r) => needsAction(r.credit)), alert: true },
            { key: "active", title: "Active credit", list: sorted.filter((r) => r.credit.status === "approved" && !needsAction(r.credit)) },
            { key: "other", title: "Declined or turned off", list: sorted.filter((r) => r.credit.status === "rejected" || r.credit.status === "revoked") },
        ].filter((g) => (filter === "all" || filter === g.key) && g.list.length > 0);
    }, [c.incoming, q, filter]);

    const confirmDialog = async (limit) => {
        if (!dialog) return;
        let res;
        if (dialog.kind === "grant") res = await c.grantCredit(dialog.buyerId, limit);
        else if (dialog.kind === "approve") res = await c.approve(dialog.credit, limit);
        else res = await c.setLimit(dialog.credit, limit);

        if (res?.success) {
            // A buyer approved directly (from search, or a declined buyer re-enabled):
            // jump to their row so the change is visible.
            if (dialog.kind === "grant" && res.creditId) {
                setTabState("requests");
                setFilter("all");
                setQuery("");
                setPendingHighlight(res.creditId);
            }
            setDialog(null);
        }
    };

    const dialogBusy = dialog
        ? dialog.kind === "grant"
            ? !!c.busy[`b:${dialog.buyerId}`]
            : !!c.busy[`c:${dialog.credit.id}`]
        : false;

    const pickBuyer = (buyer) => {
        setBuyerSearchOpen(false);
        setDialog({
            kind: "grant",
            buyerId: buyer.buyerId,
            label: buyer.businessName || buyer.name || "this buyer",
            credit: buyer.credit || null,
        });
    };

    const labelOf = (item) => item.buyerInfo?.businessName || item.buyerInfo?.name || "this buyer";

    const switchTab = (v) => { setTabState(v); setQuery(""); setFilter("all"); };

    const tabOptions = isSeller
        ? [
            { value: "requests", label: "Requests", count: requestCounts.action },
            { value: "approved", label: "Approved" },
            { value: "sellers", label: "Sellers" },
        ]
        : [
            { value: "approved", label: "Approved" },
            { value: "sellers", label: "Sellers" },
        ];

    const filterConfig = {
        requests: {
            options: [
                { value: "all", label: "All", count: requestCounts.all },
                { value: "action", label: "Pending", count: requestCounts.action, alert: true },
                { value: "active", label: "Active", count: requestCounts.active },
                { value: "other", label: "Declined", count: requestCounts.other },
            ],
            summary: { label: "Used this month", value: fmtINR(requestCounts.used) },
        },
        approved: {
            options: [
                { value: "all", label: "All", count: approvedCounts.all },
                { value: "available", label: "Available", count: approvedCounts.available },
                { value: "out", label: "Limit reached", count: approvedCounts.out },
            ],
            summary: { label: "Total available", value: fmtINR(availableTotal) },
        },
        sellers: {
            options: [
                { value: "all", label: "All", count: sellerCounts.all },
                { value: "open", label: "Not requested", count: sellerCounts.open },
                { value: "pending", label: "Pending", count: sellerCounts.pending },
            ],
        },
    }[tab];

    return (
        <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-3 pb-28 pt-3 sm:px-4 md:pb-10">
            {!connected && (
                <div className="mb-2 flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold text-white" style={{ background: C.danger }}>
                    <Loader2 className="h-3 w-3 animate-spin" /> Reconnecting…
                </div>
            )}

            <header className="flex items-center justify-between gap-3 pb-3">
                <div className="min-w-0">
                    <h1 className="text-[20px] font-extrabold leading-tight tracking-wide" style={{ color: C.ink }}>Credit</h1>
                    <p className="mt-0.5 truncate text-[12px] font-medium leading-snug tracking-wide" style={{ color: C.muted }}>
                        {isSeller ? "Manage buyer requests and your credit with sellers." : "Request credit from sellers and track your limits."}
                    </p>
                </div>
                <button
                    onClick={() => setHistoryOpen((v) => !v)}
                    aria-label="Credit history" aria-pressed={historyOpen} title="History"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors"
                    style={historyOpen ? { background: C.primary, color: "#fff", borderColor: C.primary } : { background: "#fff", color: C.ink, borderColor: C.hair }}
                >
                    <History className="h-[17px] w-[17px]" strokeWidth={2.2} />
                </button>
            </header>

            {historyOpen ? (
                <HistoryView c={c} isSeller={isSeller} role={historyRole} setRole={setHistoryRole} onBack={() => setHistoryOpen(false)} />
            ) : (
                <>
                    <div className="flex flex-col gap-2 pb-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <PillTabs fill layoutId="credit-tab-pill" value={tab} onChange={switchTab} options={tabOptions} />
                        <div className="flex w-full items-center gap-2 sm:w-auto">
                            <SearchField
                                value={query} onChange={setQuery}
                                placeholder={tab === "requests" ? "Search buyers…" : "Search sellers…"}
                                className="min-w-0 flex-1 sm:w-[260px] sm:flex-none"
                            />
                            {tab === "requests" && isSeller && (
                                <Btn icon={UserPlus} onClick={() => setBuyerSearchOpen(true)} className="shrink-0">Add buyer</Btn>
                            )}
                        </div>
                    </div>

                    <FilterBar options={filterConfig.options} value={filter} onChange={setFilter} summary={filterConfig.summary} />

                    {/* ── Requests (approved sellers only) ── */}
                    {tab === "requests" && isSeller && (
                        <Shell>
                            {!c.incomingLoaded ? <SkeletonList /> : c.incoming.length === 0 ? (
                                <Empty
                                    icon={CreditCard} title="No credit requests yet"
                                    hint="When a buyer asks to buy on credit from your shop, it shows up here instantly. You can also approve a buyer directly."
                                    action={<Btn size="sm" icon={UserPlus} onClick={() => setBuyerSearchOpen(true)}>Add buyer</Btn>}
                                />
                            ) : sections.length === 0 ? (
                                <Empty icon={Search} title="No matching buyers" hint={filter !== "all" ? "Tap the active filter again to clear it." : undefined} />
                            ) : (
                                sections.map((g, i) => (
                                    <section key={g.key} className={i > 0 ? "border-t" : ""} style={{ borderColor: C.hair }}>
                                        <Band title={g.title} count={g.list.length} alert={g.alert} />
                                        <CardList>
                                            {g.list.map((item) => (
                                                <RequestRow
                                                    key={item.credit.id}
                                                    item={item}
                                                    busy={!!(c.busy[`c:${item.credit.id}`] || c.busy[`b:${item.credit.buyer_id}`])}
                                                    onApprove={() => setDialog({ kind: "approve", credit: item.credit, label: labelOf(item) })}
                                                    onDecline={() => c.decline(item.credit)}
                                                    onUpdateLimit={() => setDialog({ kind: "update", credit: item.credit, label: labelOf(item) })}
                                                    onDeclineIncrease={() => c.declineIncrease(item.credit)}
                                                    onToggle={(enabled) => c.setEnabled(item.credit, enabled)}
                                                    // Declined by mistake: approve directly with a fresh limit (no cooldown wait).
                                                    onReenable={() => setDialog({ kind: "grant", buyerId: item.credit.buyer_id, label: labelOf(item), credit: null })}
                                                />
                                            ))}
                                        </CardList>
                                    </section>
                                ))
                            )}
                        </Shell>
                    )}

                    {/* ── Approved: only sellers who approved my credit ── */}
                    {tab === "approved" && (
                        <Shell>
                            {!c.sellersLoaded ? <SkeletonList /> : approvedAll.length === 0 ? (
                                <Empty
                                    icon={Store} title="No approved sellers yet"
                                    hint="Sellers who approve your credit request will appear here with your remaining limit."
                                    action={<Btn size="sm" onClick={() => switchTab("sellers")}>Browse sellers</Btn>}
                                />
                            ) : approvedList.length === 0 ? (
                                <Empty icon={Search} title="No matching sellers" hint={q ? "Try a different name." : "Tap the active filter again to clear it."} />
                            ) : (
                                <CardList>
                                    {approvedList.map(({ seller, st }) => (
                                        <ApprovedRow
                                            key={seller.sellerId} seller={seller} st={st}
                                            busyIncrease={!!(seller.credit?.id && c.busy[`c:${seller.credit.id}`])}
                                            onAskIncrease={() => c.askIncrease(seller.credit)}
                                        />
                                    ))}
                                </CardList>
                            )}
                        </Shell>
                    )}

                    {/* ── Sellers: compact directory ── */}
                    {tab === "sellers" && (
                        <Shell>
                            {!c.sellersLoaded ? <SkeletonList compact cols={1} /> : sellersList.length === 0 ? (
                                <Empty
                                    icon={Search}
                                    title={q || filter !== "all" ? "No matching sellers" : "No sellers available yet"}
                                    hint={q ? "Try a different name." : filter !== "all" ? "Tap the active filter again to clear it." : undefined}
                                />
                            ) : (
                                <RowGrid count={sellersList.length}>
                                    {sellersList.map(({ seller, st }) => (
                                        <CompactSellerRow
                                            key={seller.sellerId} seller={seller} st={st}
                                            busyRequest={!!c.busy[`s:${seller.sellerId}`]}
                                            onRequest={() => c.requestFrom(seller)}
                                        />
                                    ))}
                                </RowGrid>
                            )}
                        </Shell>
                    )}
                </>
            )}

            <BuyerSearchDialog
                open={buyerSearchOpen}
                onClose={() => setBuyerSearchOpen(false)}
                onSearch={c.searchBuyers}
                onPick={pickBuyer}
            />

            <LimitDialog
                open={!!dialog}
                mode={dialog?.kind === "grant" ? "approve" : dialog?.kind}
                buyerLabel={dialog?.label}
                currentLimit={dialog?.credit?.credit_limit}
                confirming={dialogBusy}
                onClose={() => setDialog(null)}
                onConfirm={confirmDialog}
            />

            <div className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-[80] flex justify-center px-4 md:bottom-6">
                <AnimatePresence>
                    {c.error && (
                        <motion.div
                            role="alert"
                            initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.96 }}
                            transition={{ duration: 0.18, ease: EASE }}
                            className="pointer-events-auto flex max-w-md items-center gap-2 rounded-full bg-black py-1.5 pl-3.5 pr-1.5 text-[12px] font-bold text-white shadow-lg"
                        >
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            <span className="min-w-0 flex-1 leading-snug">{c.error}</span>
                            <button onClick={c.clearError} aria-label="Dismiss" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/25">
                                <X className="h-3 w-3" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}