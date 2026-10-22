// src/pages/GrowChatPage.jsx — Messages in the GROW UI.
// Routes: /grow/chat (icon grid) and /grow/chat/:conversationId (thread).
// Desktop: no chat open -> full-width icon grid. Chat open -> compact icon sidebar + thread.
// Phones: icon grid, then the open thread pinned to the visual viewport (keyboard-safe).
// All scroll areas opt out of Lenis (data-lenis-prevent) and Lenis is paused while the pointer is over the card.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Search, MessageSquare, ChevronDown } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useChatContext } from "../context/ChatContext.jsx";
import { fetchApprovedSellers, getOrCreateDirectConversation } from "../utils/chatApi.js";
import { prefetchMessages } from "../hooks/useChat.js";
import GrowChatThread, { ChatAvatar } from "../components/growSeller/GrowChatThread.jsx";
import "../components/growSeller/grow-modules.css";
import { createPortal } from "react-dom";

const collator = new Intl.Collator("en", { sensitivity: "base" });

function useMedia(query) {
    const [match, setMatch] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
    useEffect(() => {
        const mq = window.matchMedia(query);
        const on = () => setMatch(mq.matches);
        on();
        mq.addEventListener?.("change", on);
        return () => mq.removeEventListener?.("change", on);
    }, [query]);
    return match;
}

// Publishes the visual viewport (the area above the keyboard) as CSS variables.
function useVisualViewportVars() {
    useEffect(() => {
        const vv = window.visualViewport;
        const root = document.documentElement;
        const update = () => {
            root.style.setProperty("--vvh", `${vv ? vv.height : window.innerHeight}px`);
            root.style.setProperty("--vvt", `${vv ? vv.offsetTop : 0}px`);
        };
        update();
        vv?.addEventListener("resize", update);
        vv?.addEventListener("scroll", update);
        window.addEventListener("orientationchange", update);
        return () => {
            vv?.removeEventListener("resize", update);
            vv?.removeEventListener("scroll", update);
            window.removeEventListener("orientationchange", update);
            root.style.removeProperty("--vvh");
            root.style.removeProperty("--vvt");
        };
    }, []);
}

// Phone: pins a layer to the visible area above the keyboard.
// Writes straight to the DOM node (no React state), so it never lags behind the keyboard.
function useKeyboardLayer(ref, active) {
    useLayoutEffect(() => {
        const el = ref.current;
        if (!active || !el) return undefined;
        const vv = window.visualViewport;
        let raf = 0;
        const timers = [];

        const apply = () => {
            const h = vv ? vv.height : window.innerHeight;
            const top = vv ? vv.offsetTop : 0;
            el.style.height = `${Math.round(h)}px`;
            el.style.transform = `translate3d(0, ${Math.round(top)}px, 0)`;
            el.dataset.kb = window.innerHeight - h > 120 ? "true" : "false";
        };
        const onChange = () => {
            // the browser tried to pan the page to reveal the input: undo it
            if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
            apply();
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(apply);
        };
        // some browsers report the final size late
        const settle = () => {
            onChange();
            [60, 150, 300, 600].forEach((ms) => timers.push(setTimeout(onChange, ms)));
        };

        apply();
        vv?.addEventListener("resize", onChange);
        vv?.addEventListener("scroll", onChange);
        window.addEventListener("resize", onChange);
        window.addEventListener("orientationchange", settle);
        document.addEventListener("focusin", settle);
        document.addEventListener("focusout", settle);
        return () => {
            cancelAnimationFrame(raf);
            timers.forEach(clearTimeout);
            vv?.removeEventListener("resize", onChange);
            vv?.removeEventListener("scroll", onChange);
            window.removeEventListener("resize", onChange);
            window.removeEventListener("orientationchange", settle);
            document.removeEventListener("focusin", settle);
            document.removeEventListener("focusout", settle);
        };
    }, [ref, active]);
}

// Phone: stop the page behind an open thread from scrolling.
// Phone: freeze the page behind an open thread (no scroll, no jump when the keyboard opens).
function useLockBodyScroll(active) {
    useEffect(() => {
        if (!active || !window.matchMedia("(max-width: 767px)").matches) return undefined;
        const html = document.documentElement;
        const body = document.body;
        const y = window.scrollY;
        const prev = {
            pos: body.style.position, top: body.style.top, left: body.style.left,
            right: body.style.right, width: body.style.width, overscroll: html.style.overscrollBehavior,
        };
        body.style.position = "fixed";
        body.style.top = `-${y}px`;
        body.style.left = "0";
        body.style.right = "0";
        body.style.width = "100%";
        html.style.overscrollBehavior = "none";
        window.lenis?.stop?.();
        return () => {
            body.style.position = prev.pos;
            body.style.top = prev.top;
            body.style.left = prev.left;
            body.style.right = prev.right;
            body.style.width = prev.width;
            html.style.overscrollBehavior = prev.overscroll;
            window.scrollTo(0, y);
            window.lenis?.start?.();
        };
    }, [active]);
}

// Desktop: keep Lenis out of the picture while the pointer is over the chat card.
// Re-asserts after every route change (opening a chat restarts Lenis via the layout's scroll-to-top).
function useLenisHijack(ref, enabled, routeKey) {
    useEffect(() => {
        const el = ref.current;
        if (!el || !enabled) return undefined;
        const lenis = () => window.lenis;
        const stop = () => { const l = lenis(); if (l && !l.isStopped) l.stop(); };
        const start = () => { const l = lenis(); if (l && l.isStopped) l.start(); };

        const onEnter = () => stop();
        const onMove = () => stop();
        const onLeave = () => start();
        // Native wheel listener: events that start inside the card never reach Lenis' window listener.
        const onWheel = (e) => { e.stopPropagation(); stop(); };

        el.addEventListener("pointerenter", onEnter);
        el.addEventListener("pointermove", onMove, { passive: true });
        el.addEventListener("pointerleave", onLeave);
        el.addEventListener("focusin", onEnter);
        el.addEventListener("wheel", onWheel, { passive: true });

        // The pointer is usually already inside the card after a route change: re-stop Lenis once the
        // route's own scroll-to-top / restart has run.
        const timers = [0, 60, 200, 500].map((ms) => setTimeout(() => { if (el.matches(":hover")) stop(); }, ms));

        return () => {
            timers.forEach(clearTimeout);
            el.removeEventListener("pointerenter", onEnter);
            el.removeEventListener("pointermove", onMove);
            el.removeEventListener("pointerleave", onLeave);
            el.removeEventListener("focusin", onEnter);
            el.removeEventListener("wheel", onWheel);
            start();
        };
    }, [ref, enabled, routeKey]);
}

// Tablet / desktop: size the card to the space left on screen. Returns null on phones.
// Desktop: make the card as tall as the space left under it, down to the bottom of the screen.
function useFitHeight(ref, key) {
    const [h, setH] = useState(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const calc = () => {
            if (window.innerWidth < 768) { setH((p) => (p === null ? p : null)); return; }
            const vh = window.visualViewport?.height || window.innerHeight;
            const top = el.getBoundingClientRect().top + window.scrollY;
            const next = Math.max(480, Math.floor(vh - top - 12));
            setH((p) => (p === next ? p : next));
        };
        calc();
        const t = setTimeout(calc, 250);
        window.addEventListener("resize", calc);
        document.fonts?.ready?.then(calc);
        return () => { clearTimeout(t); window.removeEventListener("resize", calc); };
    }, [ref, key]);
    return h;
}

function ChatTile({ logoUrl, name, size, unread = 0, deleted = false, busy = false, active = false, title, index = 0, onClick }) {
    return (
        <button type="button" className={`gc-tile${unread ? " unread" : ""}`} aria-current={active ? "true" : undefined}
            disabled={busy} title={title} style={{ "--i": Math.min(index, 10) }} onClick={onClick}>
            <span className="gc-ava">
                <ChatAvatar logoUrl={logoUrl} name={name} size={size} muted={deleted} busy={busy} />
                {unread > 0 && !busy && <span className="gc-unread" aria-label={`${unread} unread`}>{unread > 9 ? "9+" : unread}</span>}
            </span>
            <span className="n">{name || "Unknown seller"}</span>
            {deleted && <em className="gc-del">Deleted</em>}
        </button>
    );
}

function TileSkeleton({ n = 8 }) {
    return (
        <div className="gc-grid" aria-busy="true">
            {Array.from({ length: n }).map((_, i) => (
                <div key={i} className="gc-sk"><i className="gk-skel c" /><i className="gk-skel b" /></div>
            ))}
        </div>
    );
}

function ConversationList({ conversations, loading, activeId, onSelect, reload, avatarSize, wide }) {
    const { token } = useAuth();
    const [query, setQuery] = useState("");
    const [sellers, setSellers] = useState([]);
    const [sellersLoading, setSellersLoading] = useState(true);
    const [starting, setStarting] = useState(null);
    const [started, setStarted] = useState(() => new Set());
    const [newOpen, setNewOpen] = useState(true);

    useEffect(() => {
        if (!token) return undefined;
        let cancelled = false;
        fetchApprovedSellers(token).then((res) => {
            if (cancelled) return;
            if (res?.success) setSellers(res.sellers);
            setSellersLoading(false);
        });
        return () => { cancelled = true; };
    }, [token]);

    useEffect(() => {
        if (!token || loading) return;
        conversations.slice(0, 5).forEach((c) => prefetchMessages(token, c.id));
    }, [token, loading, conversations]);

    const conversationUserIds = useMemo(
        () => new Set(conversations.filter((c) => c.otherUserId).map((c) => String(c.otherUserId).toLowerCase())),
        [conversations],
    );
    const q = query.trim().toLowerCase();

    const chats = useMemo(() => {
        const byName = (a, b) => collator.compare(a.otherShopName || "", b.otherShopName || "");
        const match = conversations.filter((c) => (c.otherShopName || "").toLowerCase().includes(q));
        return [...match.filter((c) => !c.otherIsDeletedSeller).sort(byName), ...match.filter((c) => c.otherIsDeletedSeller).sort(byName)];
    }, [conversations, q]);

    const newSellers = useMemo(() => sellers
        .filter((s) => { const id = String(s.id).toLowerCase(); return !conversationUserIds.has(id) && !started.has(id); })
        .filter((s) => (s.shopName || "").toLowerCase().includes(q))
        .sort((a, b) => collator.compare(a.shopName || "", b.shopName || "")),
        [sellers, conversationUserIds, started, q]);

    const totalUnread = conversations.reduce((n, c) => n + (Number(c.unreadCount) || 0), 0);

    const startChat = async (seller) => {
        if (starting) return;
        setStarting(seller.id);
        const res = await getOrCreateDirectConversation(token, seller.id);
        if (res?.success) {
            setStarted((prev) => new Set(prev).add(String(seller.id).toLowerCase()));
            onSelect(res.conversationId);
            reload();
        }
        setStarting(null);
    };

    const nothing = !loading && !sellersLoading && chats.length === 0 && newSellers.length === 0;

    return (
        <>
            <div className="gc-top">
                <div className="gc-lh">
                    <h1>Messages</h1>
                    {totalUnread > 0 && <span className="gc-total">{totalUnread} unread</span>}
                </div>
                <label className="gk-search">
                    <Search size={17} />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sellers or chats" aria-label="Search sellers or chats" style={{ fontSize: 16 }} />
                </label>
            </div>

            <div
                className="gc-scroll"
                {...(wide ? {} : {
                    "data-lenis-prevent": "",
                    onWheel: (e) => e.stopPropagation(),
                    onTouchMove: (e) => e.stopPropagation(),
                })}
            >
                {(loading || chats.length > 0) && (
                    <section className="gc-sec">
                        <h2 className="gc-sech">Sellers</h2>
                        {loading ? <TileSkeleton n={10} /> : (
                            <div className="gc-grid">
                                {chats.map((c, i) => (
                                    <ChatTile key={c.id} index={i} size={avatarSize}
                                        logoUrl={c.otherShopLogo} name={c.otherShopName}
                                        unread={Number(c.unreadCount) || 0} deleted={!!c.otherIsDeletedSeller}
                                        active={activeId === c.id}
                                        title={c.lastMessagePreview ? `${c.lastMessageIsMine ? "You: " : ""}${c.lastMessagePreview}` : "No messages yet"}
                                        onClick={() => onSelect(c.id)} />
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {(sellersLoading || newSellers.length > 0) && (
                    <section className="gc-sec">
                        <button type="button" className="gc-sech" aria-expanded={newOpen} onClick={() => setNewOpen((o) => !o)}>
                            Start a new chat{!sellersLoading && <span className="ct">{newSellers.length}</span>}<ChevronDown className="chev" />
                        </button>
                        {newOpen && (sellersLoading ? <TileSkeleton n={8} /> : (
                            <div className="gc-grid">
                                {newSellers.map((s, i) => (
                                    <ChatTile key={s.id} index={i} size={avatarSize} logoUrl={s.logoUrl} name={s.shopName}
                                        busy={starting === s.id} title={`Message ${s.shopName || "seller"}`} onClick={() => startChat(s)} />
                                ))}
                            </div>
                        ))}
                    </section>
                )}

                {!loading && chats.length === 0 && q && newSellers.length > 0 && (
                    <p style={{ color: "var(--k-mute)", fontSize: ".9rem", padding: "10px 4px 0" }}>No chats match “{query}”.</p>
                )}

                {nothing && (
                    <div className="gk-empty" style={{ marginTop: 12 }}>
                        <MessageSquare size={24} />
                        <b>{q ? "No matches" : "No conversations yet"}</b>
                        {q ? "Try a different name." : "Chats with buyers and sellers will appear here."}
                    </div>
                )}
            </div>
        </>
    );
}

export default function GrowChatPage({ basePath = "/grow/chat" }) {
    const { conversationId } = useParams();
    const navigate = useNavigate();
    const { conversations, loading, reload, markLocalRead } = useChatContext();
    const rootRef = useRef(null);
    const desktop = useMedia("(min-width: 768px)");
    const wide = desktop && !conversationId; // desktop with no chat open -> full-width icon grid

    const phoneThread = !desktop && !!conversationId;
    const layerRef = useRef(null);
    useKeyboardLayer(layerRef, phoneThread);

    useVisualViewportVars();
    useLockBodyScroll(!!conversationId);
    // useLenisHijack(rootRef, desktop, conversationId);
    const fitH = useFitHeight(rootRef, `${!!conversationId}`);

    const activeMeta = useMemo(() => conversations.find((c) => c.id === conversationId) || null, [conversations, conversationId]);

    const handleSelect = (id) => {
        markLocalRead(id);
        navigate(`${basePath}/${id}`);
    };

    const avatarSize = wide ? 72 : desktop ? 52 : 58;

    return (
        <div ref={rootRef}
            className={`gk gc${conversationId ? " has-thread" : ""}${wide ? " wide" : ""}`}
            style={!wide && fitH ? { "--gc-h": `${fitH}px` } : undefined}>
            <aside className="gc-list">
                <ConversationList conversations={conversations} loading={loading} activeId={conversationId}
                    onSelect={handleSelect} reload={reload} avatarSize={avatarSize} wide={wide} />
            </aside>
            <section className="gc-pane" data-lenis-prevent>
                {conversationId ? (
                    phoneThread ? null : (
                        <GrowChatThread conversationId={conversationId} meta={activeMeta} onBack={() => navigate(basePath)} />
                    )
                ) : (
                    <div className="gc-blank">
                        <MessageSquare size={30} />
                        <b>Select a conversation</b>
                        <span>Or start a new one from the icons.</span>
                    </div>
                )}
            </section>

            {phoneThread && createPortal(
                <div
                    ref={layerRef}
                    className="gk gct-layer"
                    data-kb="false"
                    style={{
                        position: "fixed", left: 0, right: 0, top: 0, height: "100dvh", zIndex: 1000,
                        display: "flex", flexDirection: "column", overflow: "hidden",
                        overscrollBehavior: "none", background: "var(--k-bg, #F4F8F9)",
                        willChange: "transform, height",
                    }}
                >
                    <GrowChatThread
                        conversationId={conversationId}
                        meta={activeMeta}
                        onBack={() => navigate(basePath)}
                        style={{ flex: 1, minHeight: 0, height: "100%" }}
                    />
                </div>,
                document.body
            )}
        </div>
    );
}