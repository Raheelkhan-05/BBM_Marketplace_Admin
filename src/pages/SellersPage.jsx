// src/pages/SellersPage.jsx
//
// Logo grid of every seller, with search and infinite scroll. Tapping a seller
// opens the Home feed scoped to that store: /home?shop=<slug>. The feed applies
// all the usual rules (wallet, visibility, custom prices, expiry) server-side.

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { ArrowLeft, ArrowUp, Search, X, Loader2, Store } from "lucide-react";
import { fetchSellersPage } from "../utils/api";
import useInfiniteScrollSentinel from "../hooks/useInfiniteScrollSentinel";
import { resizedImageUrl } from "../utils/imageUrl";
import { useAuth } from "../context/AuthContext.jsx";

const INK = "#0B1116";
const MUTED = "#667077";
const HAIR_SOFT = "rgba(11,17,22,0.05)";
const ACCENT = "#53344D";
const PAGE = 48;
const DEBOUNCE_MS = 250;
const CACHE_TTL_MS = 5 * 60 * 1000;
const BACK_TO_TOP_AFTER_PX = 1200;

// key: search term → { sellers, hasMore, scrollY, ts }
const listCache = new Map();

function readCache(key) {
    const entry = listCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
        listCache.delete(key);
        return null;
    }
    return entry;
}

function HighlightedName({ name, term }) {
    const t = term.trim();
    if (!t) return <>{name}</>;
    const idx = name.toLowerCase().indexOf(t.toLowerCase());
    if (idx === -1) return <>{name}</>;
    return (
        <>
            {name.slice(0, idx)}
            <mark className="rounded-sm bg-transparent" style={{ color: ACCENT, textDecoration: "underline", textUnderlineOffset: 2, textDecorationThickness: 1.5 }}>
                {name.slice(idx, idx + t.length)}
            </mark>
            {name.slice(idx + t.length)}
        </>
    );
}

function SellerLogo({ src, name }) {
    const [failed, setFailed] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const imgRef = useRef(null);

    useEffect(() => {
        setFailed(false);
        setLoaded(false);
        const el = imgRef.current;
        if (el && el.complete && el.naturalWidth > 0) setLoaded(true);
    }, [src]);

    const showImage = !!src && !failed;

    return (
        <div
            className="relative aspect-square w-full max-w-[84px] overflow-hidden rounded-full sm:max-w-[92px] lg:max-w-[100px]"
            style={{ background: HAIR_SOFT, boxShadow: "inset 0 0 0 1px rgba(11,17,22,0.06)" }}
        >
            {showImage ? (
                <>
                    {!loaded && <div className="absolute inset-0 animate-pulse motion-reduce:animate-none" style={{ background: HAIR_SOFT }} />}
                    <img
                        ref={imgRef}
                        src={resizedImageUrl(src, { width: 240 })}
                        srcSet={[120, 240, 360].map((w) => `${resizedImageUrl(src, { width: w })} ${w}w`).join(", ")}
                        sizes="100px"
                        alt={`${name} logo`}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onLoad={() => setLoaded(true)}
                        onError={() => setFailed(true)}
                        className={`h-full w-full object-cover transition-opacity duration-300 motion-reduce:transition-none ${loaded ? "opacity-100" : "opacity-0"}`}
                    />
                </>
            ) : (
                <span
                    className="flex h-full w-full items-center justify-center text-[15px] font-extrabold tracking-wide sm:text-[17px]"
                    style={{ color: ACCENT }}
                    aria-label={`${name} logo`}
                >
                    {name.trim().slice(0, 2).toUpperCase()}
                </span>
            )}
        </div>
    );
}

function SellerCardSkeleton() {
    return (
        <div className="flex flex-col items-center">
            <div className="aspect-square w-full max-w-[84px] animate-pulse rounded-full sm:max-w-[92px] lg:max-w-[100px] motion-reduce:animate-none" style={{ background: HAIR_SOFT }} />
            <div className="mt-2 h-2.5 w-3/5 animate-pulse rounded-full motion-reduce:animate-none" style={{ background: HAIR_SOFT }} />
            <div className="mt-1 h-2 w-2/5 animate-pulse rounded-full motion-reduce:animate-none" style={{ background: HAIR_SOFT }} />
        </div>
    );
}

const GRID = "grid grid-cols-4 gap-x-4 gap-y-4 sm:grid-cols-5 sm:gap-x-5 md:grid-cols-6 lg:grid-cols-6 lg:gap-x-6 xl:grid-cols-8";

export default function SellersPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { profile, token } = useAuth();
    const myShopSlug = profile?.shop_slug || null;
    const tokenKey = token ? token.slice(-16) : "anon";
    const cacheKeyFor = (term) => `${tokenKey}::${term}`;

    const initialQ = (searchParams.get("q") || "").trim();
    const initialCache = useRef(readCache(cacheKeyFor(initialQ))).current;

    const [input, setInput] = useState(initialQ);
    const [q, setQ] = useState(initialQ);
    const [sellers, setSellers] = useState(initialCache?.sellers ?? []);
    const [loading, setLoading] = useState(!initialCache);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(initialCache?.hasMore ?? true);
    const [error, setError] = useState(null);
    const [moreError, setMoreError] = useState(false);
    const [showTop, setShowTop] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    const abortRef = useRef(null);
    const seqRef = useRef(0);
    const listRef = useRef(initialCache?.sellers ?? []);
    const qRef = useRef(initialQ);
    const scrollYRef = useRef(0);
    const firstRunRef = useRef(true);
    const inputRef = useRef(null);

    qRef.current = q;

    const tokenKeyRef = useRef(tokenKey);
    tokenKeyRef.current = tokenKey;

    useEffect(() => {
        const t = setTimeout(() => setQ(input.trim()), DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [input]);

    useEffect(() => {
        const current = (searchParams.get("q") || "").trim();
        if (current === q) return;
        const next = new URLSearchParams(searchParams);
        if (q) next.set("q", q);
        else next.delete("q");
        setSearchParams(next, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q]);

    const load = useCallback((offset, append) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const seq = ++seqRef.current;
        (append ? setLoadingMore : setLoading)(true);
        setError(null);
        setMoreError(false);

        fetchSellersPage({ q, limit: PAGE, offset, signal: controller.signal, token })
            .then((res) => {
                if (seq !== seqRef.current) return;
                if (!res?.success) throw new Error("bad response");
                const incoming = res.sellers || [];
                let next;
                if (!append) {
                    next = incoming;
                } else {
                    const seen = new Set(listRef.current.map((s) => s.shop_slug));
                    next = [...listRef.current, ...incoming.filter((s) => !seen.has(s.shop_slug))];
                }
                listRef.current = next;
                setSellers(next);
                setHasMore(!!res.hasMore);
                listCache.set(`${tokenKey}::${q}`, { sellers: next, hasMore: !!res.hasMore, scrollY: 0, ts: Date.now() });
            })
            .catch((err) => {
                if (err?.name === "AbortError") return;
                if (seq !== seqRef.current) return;
                if (append) {
                    setMoreError(true);
                } else {
                    setError("Couldn't load sellers.");
                    setHasMore(false);
                }
            })
            .finally(() => {
                if (seq !== seqRef.current) return;
                setLoading(false);
                setLoadingMore(false);
            });
    }, [q, token, tokenKey]);

    useEffect(() => {
        const isFirst = firstRunRef.current;
        firstRunRef.current = false;

        const cached = readCache(cacheKeyFor(q));
        if (cached) {
            // Cancel anything in flight so a late response can't overwrite the cached list.
            abortRef.current?.abort();
            seqRef.current += 1;
            listRef.current = cached.sellers;
            setSellers(cached.sellers);
            setHasMore(cached.hasMore);
            setLoading(false);
            setLoadingMore(false);
            setError(null);
            setMoreError(false);
            if (isFirst && cached.scrollY > 0) {
                requestAnimationFrame(() => window.scrollTo(0, cached.scrollY));
            } else if (!isFirst) {
                window.scrollTo({ top: 0 });
            }
            return;
        }

        if (!isFirst) window.scrollTo({ top: 0 });
        setHasMore(true);
        load(0, false);
        return () => abortRef.current?.abort();
    }, [q, load]);

    useEffect(() => {
        let ticking = false;
        const onScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                scrollYRef.current = window.scrollY;
                setShowTop(window.scrollY > BACK_TO_TOP_AFTER_PX);
                setScrolled(window.scrollY > 4);
                ticking = false;
            });
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
            const key = `${tokenKeyRef.current}::${qRef.current}`;
            const entry = listCache.get(key);
            if (entry) listCache.set(key, { ...entry, scrollY: scrollYRef.current });
        };
    }, [token, tokenKey]);

    const sentinelRef = useInfiniteScrollSentinel(
        () => !loadingMore && hasMore && load(listRef.current.length, true),
        { lookahead: 600, disabled: loading || loadingMore || !hasMore || !!error || moreError }
    );

    const handleKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            setQ(input.trim());
            e.currentTarget.blur();
        } else if (e.key === "Escape" && input) {
            setInput("");
        }
    };

    const clearSearch = () => {
        setInput("");
        inputRef.current?.focus();
    };

    const showSkeleton = loading && sellers.length === 0;
    const refreshing = loading && sellers.length > 0;

    return (
        <div className="min-h-screen bg-white text-slate-900 antialiased">
            <Seo
                title="Sellers on BBM – Verified wholesale suppliers"
                description="Find verified wholesale sellers and suppliers on BBM. See their products, MOQs and delivery locations."
                path="/sellers"
                noindex={!!q}
            />
            <header
                className={`sticky top-0 z-30 bg-white/95 backdrop-blur transition-shadow duration-200 ${scrolled ? "shadow-[0_6px_16px_-12px_rgba(11,17,22,0.35)]" : ""}`}
                style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
            >
                <div className="mx-auto max-w-7xl px-3 pb-3 pt-3 sm:px-4 lg:px-6">
                    <div className="flex items-center gap-2">
                        <Link
                            to="/home"
                            aria-label="Back to products"
                            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                            style={{ outlineColor: ACCENT }}
                        >
                            <ArrowLeft className="h-5 w-5" strokeWidth={2.2} style={{ color: INK }} />
                        </Link>
                        <h1 className="text-[17px] font-extrabold tracking-wide" style={{ color: INK }}>Sellers</h1>
                        <p className="mt-1 px-1 text-[12px] font-medium sr-only" style={{ color: MUTED }}>
                            Browse wholesale products by brand and compare verified sellers on BBM.
                        </p>
                    </div>

                    <div className="relative mt-3" role="search">
                        {refreshing ? (
                            <Loader2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin" style={{ color: ACCENT }} />
                        ) : (
                            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: MUTED }} />
                        )}
                        <input
                            ref={inputRef}
                            type="search"
                            inputMode="search"
                            enterKeyHint="search"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Search sellers…"
                            aria-label="Search sellers"
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            className="h-11 w-full rounded-full border-0 pl-10 pr-10 text-[13px] tracking-wide outline-none transition-shadow focus:shadow-[0_0_0_2px_rgba(83,52,77,0.35)] [&::-webkit-search-cancel-button]:hidden"
                            style={{ background: HAIR_SOFT, color: INK }}
                        />
                        {input && (
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={clearSearch}
                                aria-label="Clear search"
                                className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full hover:bg-black/[0.06]"
                            >
                                <X className="h-3.5 w-3.5" style={{ color: MUTED }} />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-3 pb-16 pt-4 sm:px-4 lg:px-6" aria-busy={loading}>
                <p className="sr-only" role="status" aria-live="polite">
                    {loading ? "Loading sellers" : sellers.length ? `${sellers.length} sellers shown` : ""}
                </p>

                {showSkeleton ? (
                    <div className={GRID}>
                        {Array.from({ length: 18 }).map((_, i) => <SellerCardSkeleton key={i} />)}
                    </div>
                ) : error && sellers.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-20 text-center">
                        <p className="text-[13px] font-bold" style={{ color: INK }}>{error}</p>
                        <p className="text-[11.5px] font-medium" style={{ color: MUTED }}>Check your connection and try again.</p>
                        <button
                            type="button"
                            onClick={() => { setHasMore(true); load(0, false); }}
                            className="rounded-full px-4 py-2 text-[12px] font-extrabold tracking-wide text-white"
                            style={{ background: ACCENT }}
                        >
                            Try again
                        </button>
                    </div>
                ) : sellers.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-20 text-center">
                        <Store className="h-6 w-6" style={{ color: MUTED }} />
                        <p className="text-[13px] font-bold" style={{ color: INK }}>
                            {q ? `No sellers match “${q}”` : "No sellers available yet"}
                        </p>
                        {q && (
                            <>
                                <p className="text-[11.5px] font-medium" style={{ color: MUTED }}>Check the spelling or try a shorter name.</p>
                                <button
                                    type="button"
                                    onClick={clearSearch}
                                    className="mt-2 rounded-full px-4 py-2 text-[12px] font-extrabold tracking-wide"
                                    style={{ background: HAIR_SOFT, color: ACCENT }}
                                >
                                    Clear search
                                </button>
                            </>
                        )}
                    </div>
                ) : (
                    <div className={`${GRID} transition-opacity duration-200 motion-reduce:transition-none ${refreshing ? "opacity-50" : "opacity-100"}`}>
                        {sellers.map((s) => {
                            const isMine = !!myShopSlug && s.shop_slug === myShopSlug;
                            const place = [s.city, s.state].filter(Boolean).join(", ");
                            return (
                                <Link
                                    key={s.shop_slug}
                                    to={`/sellers/${encodeURIComponent(s.shop_slug)}`}
                                    className="group flex min-w-0 flex-col items-center rounded-xl text-center transition-transform duration-200 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                                    style={{ outlineColor: ACCENT }}
                                >
                                    <div className="flex w-full items-center justify-center p-1.5 transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100 sm:p-2">
                                        <SellerLogo src={s.logo_url} name={s.display_name} />
                                    </div>
                                    <p className="mt-0.5 w-full line-clamp-2 px-0.5 text-[12px] leading-tight font-extrabold capitalize tracking-wide sm:text-[13px]" style={{ color: INK }}>
                                        <HighlightedName name={s.display_name} term={q} />
                                    </p>
                                    <p
                                        className="w-full mt-0.5 truncate px-0.5 text-[10.5px] font-medium tracking-wider"
                                        style={{ color: isMine ? ACCENT : MUTED, fontWeight: isMine ? 800 : 500 }}
                                    >
                                        {isMine ? "Your shop" : place || "\u00A0"}
                                    </p>
                                </Link>
                            );
                        })}
                    </div>
                )}

                {loadingMore && (
                    <div className="mt-3">
                        <div className={GRID}>
                            {Array.from({ length: 6 }).map((_, i) => <SellerCardSkeleton key={i} />)}
                        </div>
                    </div>
                )}

                {moreError && (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                        <p className="text-[12px] font-bold" style={{ color: INK }}>Couldn't load more sellers.</p>
                        <button
                            type="button"
                            onClick={() => load(listRef.current.length, true)}
                            className="rounded-full px-4 py-2 text-[12px] font-extrabold tracking-wide text-white"
                            style={{ background: ACCENT }}
                        >
                            Try again
                        </button>
                    </div>
                )}

                {!hasMore && !loading && sellers.length > PAGE && (
                    <p className="py-8 text-center text-[11.5px] font-medium tracking-wide" style={{ color: MUTED }}>
                        You've seen all {sellers.length} sellers
                    </p>
                )}

                {hasMore && !loading && !moreError && <div ref={sentinelRef} className="h-1" />}
            </main>

            <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
                aria-label="Back to top"
                tabIndex={showTop ? 0 : -1}
                className={`fixed right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg shadow-black/20 transition-[opacity,transform] duration-200 motion-reduce:transition-none ${showTop ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
                style={{ background: ACCENT, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}
            >
                <ArrowUp className="h-5 w-5" strokeWidth={2.4} />
            </button>
        </div>
    );
}