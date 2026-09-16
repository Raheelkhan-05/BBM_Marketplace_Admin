// pages/GenericProductBrandsPage.jsx
//
// Step 2 of the drill-down: the hs_generic_product_brands under one
// hs_generic_products row. Tapping a row now opens BuySellChoiceSheet
// (same pattern as BrowsePage) so Buy/Sell are equally-weighted actions;
// Buy goes to the existing sellers page, Sell opens SellThisItemModal.
// Tapping the (i) still opens BrandItemDetailModal without leaving the
// list (so comparing two brands doesn't cost a page nav).

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Search, Info, ChevronRight, Package } from "lucide-react";
import { fetchGenericProductBrands } from "../utils/api";
import BrandItemDetailModal from "../components/catalog/BrandItemDetailModal";
import BuySellChoiceSheet from "../components/catalog/BuySellChoiceSheet";
import SellThisItemModal from "../components/catalog/SellThisItemModal";
import ImageLightbox from "../components/ImageLightbox.jsx";
import useInfiniteScrollSentinel from "../hooks/useInfiniteScrollSentinel";

const C = {
    ink: "#0B1116", muted: "#667077", primary: "#D2462B", secondary: "#006F83",
    hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(8, 143, 254, 0.05)", imgBg: "#F4F5F6",
};
const EASE = [0.16, 1, 0.3, 1];
const PAGE_SIZE = 30;
const DEBOUNCE_MS = 200;

function BrandImage({ src, alt, onOpen }) {
    const [failed, setFailed] = useState(false);
    if (!src || failed) return <Package className="h-6 w-6" style={{ color: C.muted }} />;
    return (
        <img
            src={src}
            alt={alt}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setFailed(true)}
            onClick={(e) => { e.stopPropagation(); onOpen(src); }}
            className="h-full w-full object-cover cursor-zoom-in"
        />
    );
}

function BrandRow({ item, idx, onOpen, onInfo, onImageOpen }) {
    // model_no / grade_variant differentiate near-duplicate names from
    // the same brand (e.g. two "AX5 10W30" listings) — show whichever
    // is present, right under the brand name.
    const subLabel = [item.brand_name, item.model_no].filter(Boolean).join(" · ");

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: Math.min(idx * 0.015, 0.2), ease: EASE }}
            className="flex w-full items-center gap-0 md:gap-2.5 border-b px-3 py-3 sm:px-4"
            style={{ borderColor: C.hairSoft }}
        >
            <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border" style={{ borderColor: C.hair, background: C.imgBg }}>
                    <BrandImage src={item.image} alt="" onOpen={onImageOpen} />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-[14px] md:text-[15px] font-bold leading-tight tracking-wide" style={{ color: C.ink }}>{item.name}</p>
                    <p className="mt-0.5 truncate text-[11.5px] font-bold tracking-wider" style={{ color: C.primary }}>{subLabel}</p>
                    {item.grade_variant && (
                        <p className="mt-0.5 truncate text-[10.5px] font-medium tracking-wide" style={{ color: C.muted }}>{item.grade_variant}</p>
                    )}
                </div>
                <div className="flex shrink-0 flex-col items-end text-right">
                    <p className="text-[13px] font-extrabold tabular-nums" style={{ color: item.lowest_price != null ? C.ink : C.muted }}>
                        {item.lowest_price != null ? <>₹{inr(item.lowest_price)}</> : "Ask price"}
                    </p>
                    {item.seller_count > 0 && (
                        <p className="mt-0.5 text-[11.5px] font-bold tracking-wide" style={{ color: C.secondary }}>{item.seller_count} sellers</p>
                    )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0" style={{ color: C.hair }} />
            </button>
            <button
                onClick={onInfo}
                aria-label="Product details"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.05]"
            >
                <Info className="h-4 w-4" style={{ color: C.muted }} />
            </button>
        </motion.div>
    );
}

function inr(n) {
    const val = Number(n) || 0;
    return val.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function RowSkeleton() {
    return (
        <div className="flex items-center gap-3 border-b px-3 py-3 sm:px-4" style={{ borderColor: C.hairSoft }}>
            <div className="h-16 w-16 shrink-0 animate-pulse rounded-xl" style={{ background: C.hairSoft }} />
            <div className="flex-1 space-y-2">
                <div className="h-3 w-2/5 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                <div className="h-2.5 w-1/4 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
            </div>
        </div>
    );
}

export default function GenericProductBrandsPage() {
    const { idOrSlug } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const productHint = location.state?.genericProduct;
    const categoryHint = location.state?.category;

    const [q, setQ] = useState("");
    const [activeBrand, setActiveBrand] = useState(null);
    const [items, setItems] = useState([]);
    const [brandFacets, setBrandFacets] = useState([]);
    const [total, setTotal] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [infoItemId, setInfoItemId] = useState(null);
    const [lightboxSrc, setLightboxSrc] = useState(null);

    const [choiceItem, setChoiceItem] = useState(null);
    const [sellItem, setSellItem] = useState(null);

    const abortRef = useRef(null);
    const debounceRef = useRef(null);

    const runQuery = useCallback((offset, { append }) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        (append ? setLoadingMore : setLoading)(true);

        fetchGenericProductBrands(productHint?.id || idOrSlug, {
            q, limit: PAGE_SIZE, offset,
            signal: controller.signal,
        })
            .then((res) => {
                if (!res?.success) return;
                let list = res.items || [];
                if (activeBrand) list = list.filter((it) => it.brand_name === activeBrand);
                setItems((prev) => (append ? [...prev, ...list] : list));
                setBrandFacets(res.facets?.brands || []);
                setTotal(res.total ?? null);
                setHasMore(!!res.hasMore);
            })
            .catch((err) => { if (err?.name !== "AbortError") setHasMore(false); })
            .finally(() => { setLoading(false); setLoadingMore(false); });
    }, [productHint?.id, idOrSlug, q, activeBrand]);

    useEffect(() => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => runQuery(0, { append: false }), q ? DEBOUNCE_MS : 0);
        return () => clearTimeout(debounceRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q, activeBrand]);

    const sentinelRef = useInfiniteScrollSentinel(
        () => !loadingMore && hasMore && runQuery(items.length, { append: true }),
        { lookahead: 600, disabled: loading || loadingMore || !hasMore }
    );

    const goToSellers = (item) => navigate(`/brand-item/${item.slug || item.id}/sellers`, { state: { brandItem: item, genericProduct: productHint, category: categoryHint } });

    return (
        <div className="min-h-screen bg-[#FCFBF9]">
            <div className="sticky top-0 sm:top-2 z-20 border-b bg-white" style={{ borderColor: C.hair }}>
                <div className="mx-auto max-w-7xl px-3 pt-3 sm:px-4">
                    <div className="flex items-center gap-2.5 pb-3">
                        <button onClick={() => navigate(-1)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.05]">
                            <ArrowLeft className="h-4 w-4" style={{ color: C.ink }} />
                        </button>
                        <div className="min-w-0">
                            <h1 className="truncate text-[16.5px] font-extrabold leading-tight tracking-wide" style={{ color: C.ink }}>
                                Brands & variants for {productHint?.name || "this product"}
                            </h1>
                            <p className="text-[11.5px] font-medium tracking-wider" style={{ color: C.muted }}>
                                {total != null ? `${total} listing${total === 1 ? "" : "s"} across ${brandFacets.length || ""} brand${brandFacets.length === 1 ? "" : "s"}` : "Loading…"}
                            </p>
                        </div>
                    </div>

                    <div className="flex h-10 items-center gap-2 rounded-full border bg-white px-3.5" style={{ borderColor: C.hair }}>
                        <Search className="h-3.5 w-3.5 shrink-0" style={{ color: C.muted }} />
                        <input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search brand or spec..."
                            className="w-full min-w-0 bg-transparent text-[13.5px] font-medium tracking-wide outline-none placeholder:text-slate-400"
                        />
                    </div>

                    {brandFacets.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 py-3">
                            <button
                                onClick={() => setActiveBrand(null)}
                                className="rounded-full border px-3 py-1 text-[12px] font-bold tracking-wide"
                                style={{ borderColor: !activeBrand ? '#D2462B' : C.hair, color: !activeBrand ? '#ffffff' : C.muted, background: !activeBrand ? `#D2462B` : "white" }}
                            >
                                All brands
                            </button>
                            {brandFacets.map((b) => (
                                <button
                                    key={b.name}
                                    onClick={() => setActiveBrand(b.name === activeBrand ? null : b.name)}
                                    className="rounded-full border px-3 py-1 text-[12px] font-bold tracking-wide"
                                    style={{ borderColor: activeBrand === b.name ? C.primary : C.hair, color: activeBrand === b.name ? '#ffffff' : C.muted, background: activeBrand === b.name ? `#D2462B` : "white" }}
                                >
                                    {b.name} ({b.count})
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="mx-auto max-w-7xl bg-white sm:my-3 sm:rounded-2xl sm:border" style={{ borderColor: C.hair }}>
                {loading
                    ? Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)
                    : items.length === 0 ? (
                        <div className="flex flex-col items-center gap-1.5 px-6 py-16 text-center">
                            <Package className="h-6 w-6" style={{ color: C.hair }} />
                            <p className="text-[13px] font-bold" style={{ color: C.ink }}>No brands match that search</p>
                        </div>
                    ) : (
                        <>
                            {items.map((item, i) => (
                                <BrandRow
                                    key={item.id}
                                    item={item}
                                    idx={i}
                                    onOpen={() => setChoiceItem(item)}
                                    onInfo={() => setInfoItemId(item.id)}
                                    onImageOpen={setLightboxSrc}
                                />
                            ))}
                            {loadingMore && <RowSkeleton />}
                        </>
                    )}
                {hasMore && !loading && <div ref={sentinelRef} className="h-1" />}
            </div>

            {infoItemId && (
                <BrandItemDetailModal
                    brandItemId={infoItemId}
                    onClose={() => setInfoItemId(null)}
                    onViewSellers={(item) => { setInfoItemId(null); goToSellers(item); }}
                />
            )}

            <AnimatePresence>
                {choiceItem && (
                    <BuySellChoiceSheet
                        item={choiceItem}
                        onClose={() => setChoiceItem(null)}
                        onBuy={() => {
                            const it = choiceItem;
                            setChoiceItem(null);
                            goToSellers(it);
                        }}
                        onSell={() => {
                            setSellItem(choiceItem);
                            setChoiceItem(null);
                        }}
                    />
                )}
                {sellItem && (
                    <SellThisItemModal brand={sellItem} onClose={() => setSellItem(null)} />
                )}
            </AnimatePresence>

            {lightboxSrc && <ImageLightbox src={lightboxSrc} alt="" onClose={() => setLightboxSrc(null)} />}
        </div>
    );
}