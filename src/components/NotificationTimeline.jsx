// components/NotificationTimeline.jsx
//
// The Console's notification list, drawn as a timeline.
//
//   - Newest first, grouped by calendar date. Every date has its OWN continuous line on the left
//     (Today / Yesterday / Mon, 12 Oct ...), and every notification sits on it as a dot with its
//     time next to it.
//   - Every card is compact:  [tag: where it belongs]  /  title  /  one-line description
//     ("View more" smoothly expands it only when the text does not fit)  /  quick actions (if any).
//   - Paginated in memory: only PAGE rows are rendered at first; more are added by an
//     IntersectionObserver sentinel as you scroll (the "Show more" button is the sentinel itself,
//     so it also works by tap). Rows are memoised, so a new notification or a decision on one card
//     never re-renders the other cards.
//
// Drop-in replacement for the old <NotificationsPane /> (same props).
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BellOff, CheckCheck, ChevronDown } from "lucide-react";

import { useNotificationActions } from "../context/NotificationActionsContext.jsx";
import NotificationActionBar from "./NotificationActionBar.jsx";
import {
    notificationCategory, stampOf, formatTime, dateKeyOf, dateLabelOf,
} from "../utils/notificationDisplay.js";

const C = { ink: "#141B22", muted: "#5B6672", secondary: "#0B7285", hair: "rgba(20,27,34,0.09)", tile: "rgba(20,27,34,0.06)", rail: "rgba(20,27,34,0.14)", unread: "#d2462b" };

const PAGE = 20;          // rows rendered per page
const TIME_W = 44;        // px, time column
const RAIL_W = 12;        // px, line/dot column
const GAP = 8;            // px, column gap
const DOT = 10;           // px, timeline dot
const DOT_Y = 17;         // px, dot centre measured from the top of a row
const BODY_LINE = 18;     // px, one line of description text (matches leading-[18px])
const GRID = `${TIME_W}px ${RAIL_W}px minmax(0,1fr)`;

const countLabel = (n) => (n > 99 ? "99+" : n);

/* ---------------------------------------------------------------- date header */

function DateHeader({ label }) {
    return (
        <h4
            className="px-1 pb-1.5 pt-3 text-[18px] font-extrabold leading-tight tracking-tight md:text-[19px]"
            style={{ color: C.ink }}
        >
            {label}
        </h4>
    );
}

/* ----------------------------------------------------------------------- row */

function sameAction(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    return a.key === b.key && a.outcome === b.outcome && a.expired === b.expired && a.order === b.order && a.proposal === b.proposal;
}

const Row = memo(function Row({ n, action, onOpen, isLast }) {
    const reduce = useReducedMotion();
    const cat = notificationCategory(n);
    const Icon = cat.Icon;
    const time = formatTime(stampOf(n));
    const text = (n.body || n.message || "").trim();

    const [expanded, setExpanded] = useState(false);
    // `wrap` keeps the text un-truncated while it expands AND while it collapses, so the ellipsis only
    // comes back once the height animation has finished (no flicker mid-animation).
    const [wrap, setWrap] = useState(false);
    const [overflow, setOverflow] = useState(false);
    const bodyRef = useRef(null);

    useLayoutEffect(() => {
        const el = bodyRef.current;
        if (!el || wrap) return undefined;
        const check = () => setOverflow(el.scrollWidth > el.clientWidth + 1);
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [text, wrap]);

    const toggle = (e) => {
        e.stopPropagation();
        if (!expanded) setWrap(true);
        setExpanded((v) => !v);
    };

    const stop = (e) => e.stopPropagation();
    const dur = reduce ? 0 : 0.22;

    return (
        <div className="grid" style={{ gridTemplateColumns: GRID, columnGap: GAP }}>
            {/* time */}
            <time
                className="select-none text-right text-[10.5px] font-semibold tabular-nums leading-none"
                style={{ color: C.muted, paddingTop: DOT_Y - 6 }}
            >
                {time}
            </time>

            {/* line + dot */}
            <div className="relative" aria-hidden="true">
                <span
                    className="absolute left-1/2 top-0 w-[2px] -translate-x-1/2 rounded-full"
                    style={{ background: C.rail, height: isLast ? DOT_Y : "100%" }}
                />
                <span
                    className="absolute left-1/2 -translate-x-1/2 rounded-full border-2 transition-colors duration-200"
                    style={{
                        top: DOT_Y - DOT / 2, width: DOT, height: DOT, boxSizing: "border-box",
                        borderColor: cat.color, background: n.read ? "#fff" : cat.color,
                    }}
                />
            </div>

            {/* card */}
            <div className="min-w-0 pb-1">
                <div
                    onClick={() => onOpen(n)}
                    className="cursor-pointer rounded-xl px-2.5 py-2 transition-colors duration-150 hover:bg-black/[0.035] active:bg-black/[0.05]"
                    style={{ background: n.read ? "transparent" : "rgba(11,114,133,0.06)" }}
                >
                    {/* line 1: where it belongs */}
                    <div className="flex items-center gap-2">
                        <span
                            className="inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-[2px] text-[10.5px] font-bold leading-[14px]"
                            style={{ background: `color-mix(in srgb, ${cat.color} 12%, transparent)`, color: cat.color }}
                        >
                            <Icon className="h-3 w-3 shrink-0" strokeWidth={2.4} aria-hidden="true" />
                            <span className="truncate">{cat.label}</span>
                        </span>
                        {!n.read && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.unread }} role="img" aria-label="Unread" />}
                    </div>

                    {/* line 2: title */}
                    <button
                        type="button"
                        className={`mt-1 block w-full rounded text-left text-[13px] leading-snug tracking-wide line-clamp-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B7285]/40 ${n.read ? "font-semibold" : "font-extrabold"}`}
                        style={{ color: C.ink }}
                    >
                        {n.title}
                    </button>

                    {/* line 3: description, one line; expands smoothly */}
                    {text && (
                        <>
                            <motion.div
                                initial={false}
                                animate={{ height: expanded ? "auto" : BODY_LINE }}
                                transition={{ duration: dur, ease: "easeOut" }}
                                onAnimationComplete={() => { if (!expanded) setWrap(false); }}
                                style={{ overflow: "hidden" }}
                            >
                                <p
                                    ref={bodyRef}
                                    className={`text-[12px] font-medium tracking-wide ${wrap ? "whitespace-normal break-words" : "truncate"}`}
                                    style={{ color: C.muted, lineHeight: `${BODY_LINE}px` }}
                                >
                                    {text}
                                </p>
                            </motion.div>

                            {(overflow || wrap) && (
                                <button
                                    type="button" onClick={toggle} aria-expanded={expanded}
                                    className="mt-0.5 inline-flex items-center gap-0.5 rounded text-[11.5px] font-bold tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B7285]/40"
                                    style={{ color: C.secondary }}
                                >
                                    {expanded ? "View less" : "View more"}
                                    <ChevronDown
                                        className="h-3.5 w-3.5 transition-transform duration-200"
                                        style={{ transform: expanded ? "rotate(180deg)" : "none" }}
                                        strokeWidth={2.6} aria-hidden="true"
                                    />
                                </button>
                            )}
                        </>
                    )}

                    {/* quick actions (only while a decision is waiting, or the one-line result) */}
                    {action && (
                        <div className="mt-2" onClick={stop}>
                            <NotificationActionBar action={action} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}, (a, b) => a.n === b.n && a.isLast === b.isLast && a.onOpen === b.onOpen && sameAction(a.action, b.action));

/* ---------------------------------------------------------------------- pane */

export default function NotificationTimeline({ items, unreadCount, onOpen, onMarkAll, scrollProps, className = "" }) {
    const { getAction } = useNotificationActions();
    const [filter, setFilter] = useState("all"); // all | unread | todo
    const [limit, setLimit] = useState(PAGE);
    const scrollRef = useRef(null);
    const sentinelRef = useRef(null);

    // Which notifications still wait for a decision (live: changes as soon as anything is decided).
    const todoCount = useMemo(
        () => items.reduce((c, n) => { const a = getAction(n); return a && !a.outcome ? c + 1 : c; }, 0),
        [items, getAction]
    );

    const shown = useMemo(() => {
        if (filter === "unread") return items.filter((n) => !n.read);
        if (filter === "todo") return items.filter((n) => { const a = getAction(n); return a && !a.outcome; });
        return items;
    }, [items, filter, getAction]);

    const visible = useMemo(() => shown.slice(0, limit), [shown, limit]);
    const hasMore = shown.length > limit;

    // One group (and one line) per calendar date; order is already newest first.
    const groups = useMemo(() => {
        const out = [];
        for (const n of visible) {
            const stamp = stampOf(n);
            const key = dateKeyOf(stamp);
            const last = out[out.length - 1];
            if (last && last.key === key) last.items.push(n);
            else out.push({ key, label: dateLabelOf(stamp), items: [n] });
        }
        return out;
    }, [visible]);

    const loadMore = useCallback(() => setLimit((l) => l + PAGE), []);

    // Auto-load the next page shortly before the end of the list is reached.
    useEffect(() => {
        const el = sentinelRef.current;
        if (!hasMore || !el || typeof IntersectionObserver === "undefined") return undefined;
        const io = new IntersectionObserver(
            (entries) => { if (entries.some((e) => e.isIntersecting)) loadMore(); },
            { root: scrollRef.current, rootMargin: "0px 0px 240px 0px" }
        );
        io.observe(el);
        return () => io.disconnect(); // re-created after each page, so a still-visible sentinel keeps loading
    }, [hasMore, limit, loadMore]);

    const changeFilter = (k) => {
        setFilter(k);
        setLimit(PAGE);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
    };

    const tabs = [["all", "All"], ["unread", "Unread"], ...(todoCount > 0 || filter === "todo" ? [["todo", todoCount > 0 ? `To do ${todoCount}` : "To do"]] : [])];

    return (
        <section className={className} aria-label="Notifications">
            <div className="shrink-0 px-5 pb-2 pt-3 md:px-7 md:pb-3 md:pt-4">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
                    <h3 className="flex items-center gap-2 text-[15px] font-extrabold tracking-wide md:text-[16px]" style={{ color: C.ink }}>
                        Notifications
                        {unreadCount > 0 && (
                            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[9.5px] font-bold text-white" style={{ background: C.unread }}>
                                {countLabel(unreadCount)}
                            </span>
                        )}
                    </h3>

                    <div className="flex items-center gap-1.5">
                        <div role="group" aria-label="Filter notifications" className="flex gap-1 rounded-full p-0.5" style={{ background: C.tile }}>
                            {tabs.map(([k, l]) => (
                                <button
                                    key={k} type="button" aria-pressed={filter === k}
                                    onClick={() => changeFilter(k)}
                                    className="rounded-full px-3 py-1 text-[11.5px] font-bold tracking-wide transition-colors duration-150"
                                    style={filter === k ? { background: "#000", color: "#fff" } : { color: C.muted }}
                                >
                                    {l}
                                </button>
                            ))}
                        </div>

                        <button
                            type="button" onClick={onMarkAll} disabled={unreadCount === 0}
                            aria-label="Mark all as read" title="Mark all as read"
                            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11.5px] font-bold tracking-wide transition-colors hover:bg-black/5 disabled:opacity-40 disabled:hover:bg-transparent"
                            style={{ color: C.secondary }}
                        >
                            <CheckCheck className="h-4 w-4" strokeWidth={2.4} />
                            <span className="hidden sm:inline">Mark all read</span>
                        </button>
                    </div>
                </div>
            </div>

            <div
                ref={scrollRef}
                className="min-h-[min(380px,50dvh)] flex-1 overflow-y-auto px-3 pb-[var(--sheet-pb)] md:min-h-0 md:px-5 md:pb-6"
                style={{ overscrollBehavior: "contain" }}
                {...scrollProps}
            >
                {visible.length === 0 ? (
                    <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: C.tile }}>
                            <BellOff className="h-5 w-5" style={{ color: C.muted }} />
                        </span>
                        <p className="text-[13px] font-bold" style={{ color: C.ink }}>
                            {filter === "unread" || filter === "todo" ? "You're all caught up" : "No notifications yet"}
                        </p>
                        <p className="max-w-[240px] text-[11.5px] font-medium leading-snug" style={{ color: C.muted }}>
                            {filter === "unread" ? "Nothing unread right now."
                                : filter === "todo" ? "Nothing is waiting for your decision."
                                    : "Order, credit and account updates will stay here so you can read them later."}
                        </p>
                    </div>
                ) : (
                    <div>
                        {groups.map((g) => (
                            <div key={g.key} className="mb-1.5">
                                <DateHeader label={g.label} />
                                {g.items.map((n, i) => (
                                    <Row
                                        key={n.id}
                                        n={n}
                                        action={getAction(n)}
                                        onOpen={onOpen}
                                        isLast={i === g.items.length - 1}
                                    />
                                ))}
                            </div>
                        ))}

                        {hasMore && (
                            <div className="flex justify-center py-2">
                                <button
                                    ref={sentinelRef}
                                    type="button" onClick={loadMore}
                                    className="h-9 rounded-full border px-4 text-[12px] font-bold tracking-wide transition-colors hover:bg-black/[0.03]"
                                    style={{ borderColor: C.hair, color: C.ink }}
                                >
                                    Show more
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}