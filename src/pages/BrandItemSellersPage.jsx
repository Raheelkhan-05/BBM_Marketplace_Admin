// pages/BrandItemSellersPage.jsx
//
// Step 3 of the drill-down: sellers listing THIS exact brand item
// (seller_product_submissions, via catalog_brand_item_sellers so it can
// never leak a different variant's sellers in).
//
// CHANGE: rows now open BuyNowModal directly (the same checkout flow
// used elsewhere) instead of routing to the seller's shop. "View shop"
// is still available as a secondary action for browsing.
//
// IMPORTANT: this file assumes `fetchBrandItemSellers` returns the
// richer commercial fields added to seller_product_submissions
// (price_slabs, quantity_discounts, stock_quantity, stock_type,
// dispatch_time_days, production_lead_time_days, gst_percent, hsn_code,
// payment_terms, return_policy, warranty, delivery_timeline). If your
// backend controller for this endpoint only selects the old flat
// columns (price, moq, unit, lead_time), everything below still works
// but silently falls back to "no slabs / no extra terms" since those
// fields will just be undefined. Update that controller's SELECT to
// include the columns above to get the full experience.

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, MapPin, Truck, Boxes, ChevronRight, Store, Layers } from "lucide-react";
import { fetchBrandItemSellers } from "../utils/api";
import useInfiniteScrollSentinel from "../hooks/useInfiniteScrollSentinel";
import BuyNowModal from "../components/BuyNowModal"; // adjust path if BuyNowModal lives elsewhere in your tree

const C = {
    ink: "#0B1116", muted: "#667077", primary: "#D2462B", secondary: "#006F83",
    hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)",
};
const EASE = [0.16, 1, 0.3, 1];
const PAGE_SIZE = 24;

const SORTS = [
    { id: "relevance", label: "Relevance" },
    { id: "price_asc", label: "Lowest price" },
    { id: "price_desc", label: "Highest price" },
];

// Effective lead time given fulfilment type — same rule the backend
// applies when it computes `lead_time` for the buyer-facing column.
function effectiveLeadTime(s) {
    return s.stock_type === "made_to_order" ? s.production_lead_time_days : s.dispatch_time_days;
}

// New component, alongside SlabBadges
function DiscountBadges({ discounts, unit }) {
    if (!Array.isArray(discounts) || !discounts.length) return null;
    return (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <Layers className="h-3 w-3 shrink-0" style={{ color: C.primary }} />
            {discounts.slice(0, 3).map((d, i) => (
                <span key={i} className="rounded-full px-1.5 py-0.5 text-[9.5px] font-bold" style={{ background: `${C.primary}10`, color: C.primary }}>
                    {d.minQty}+ {unit}: {d.discountPercent}% off
                </span>
            ))}
            {discounts.length > 3 && <span className="text-[9.5px] font-bold" style={{ color: C.muted }}>+{discounts.length - 3} more</span>}
        </div>
    );
}

function inr(n) {
    const val = Number(n) || 0;
    return val.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function SlabBadges({ slabs, unit }) {
    if (!Array.isArray(slabs) || !slabs.length) return null;
    return (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <Layers className="h-3 w-3 shrink-0" style={{ color: C.secondary }} />
            {slabs.slice(0, 3).map((s, i) => (
                <span key={i} className="rounded-full px-1.5 py-0.5 text-[9.5px] font-bold" style={{ background: `${C.secondary}10`, color: C.secondary }}>
                    {s.minQty}{s.maxQty ? `–${s.maxQty}` : "+"} {unit}: ₹{s.price}
                </span>
            ))}
            {slabs.length > 3 && <span className="text-[9.5px] font-bold" style={{ color: C.muted }}>+{slabs.length - 3} more</span>}
        </div>
    );
}

function SellerRow({ s, idx, onBuy, onViewShop }) {
    const lead = effectiveLeadTime(s);
    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: Math.min(idx * 0.02, 0.2), ease: EASE }}
            className="flex w-full items-start gap-3 border-b px-3 py-3.5 sm:px-4"
            style={{ borderColor: C.hairSoft }}
        >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border" style={{ borderColor: C.hair, background: "#F4F5F6" }}>
                {s.logo_url ? <img src={s.logo_url} alt="" className="h-full w-full object-cover" /> : <Store className="h-4.5 w-4.5" style={{ color: C.muted }} />}
            </span>

            <button onClick={onBuy} className="min-w-0 flex-1 text-left">
                <p className="truncate text-[14px] font-bold leading-tight tracking-wide" style={{ color: C.ink }}>{s.display_name}</p>
                {(s.city || s.state) && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] font-medium tracking-wide" style={{ color: C.muted }}>
                        <MapPin className="h-3 w-3 shrink-0" /> {[s.city, s.state].filter(Boolean).join(", ")}
                    </p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-1 sm:gap-x-2 gap-y-1">
                    <span className="flex items-center gap-1 text-[11.5px] font-bold tracking-wide" style={{ color: C.secondary }}>
                        <Boxes className="h-3 w-3" /> MOQ {s.moq} {s.unit}
                    </span>
                    {s.stock_quantity != null && (
                        <span className="text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>{'· '}&nbsp;{s.stock_quantity} {s.unit} in stock</span>
                    )}
                    <span className="flex items-center gap-1 text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                        <Truck className="h-3 w-3" /> {s.stock_type === "made_to_order" ? "Made to order" : "Ready stock"}
                        {lead != null ? ` · ${lead}d` : ""}
                    </span>
                    {s.freight_included != null && (
                        <span className="text-[11.5px] font-semibold tracking-wide" style={{ color: s.freight_included ? "#059669" : C.muted }}>
                            {'· '}{s.freight_included ? "Freight included" : "+freight"}
                        </span>
                    )}

                </div>
                <SlabBadges slabs={s.price_slabs} unit={s.unit} />
                <DiscountBadges discounts={s.quantityDiscounts} unit={s.unit} />
                {(s.payment_terms || s.delivery_timeline) && (
                    <p className="mt-1.5 truncate text-[10.5px] font-medium" style={{ color: C.muted }}>
                        {s.delivery_timeline ? `Delivery: ${s.delivery_timeline}` : ""}
                        {s.delivery_timeline && s.payment_terms ? " · " : ""}
                        {/* {s.payment_terms ? `Payment: ${s.payment_terms}` : ""} */}
                    </p>
                )}
            </button>

            <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
                <div>
                    <p className="text-[15.5px] font-extrabold tabular-nums" style={{ color: C.ink }}>
                        <span style={{ color: C.primary }}>₹</span>{inr(s.price)}
                        <span className="ml-0.5 text-[10.5px] font-semibold" style={{ color: C.muted }}>/{s.unit}</span>
                    </p>
                    <p className="text-[10px] font-semibold tracking-wide" style={{ color: C.muted }}>
                        incl. GST{s.gst_percent != null ? ` (${s.gst_percent}%)` : ""}
                    </p>
                </div>
                <button onClick={onBuy} className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-white tracking-wide" style={{ background: `linear-gradient(135deg, ${C.primary} 0%, #c71f11 100%)` }}>
                    Buy now
                </button>
            </div>
        </motion.div>
    );
}

function RowSkeleton() {
    return (
        <div className="flex items-center gap-3 border-b px-3 py-3.5 sm:px-4" style={{ borderColor: C.hairSoft }}>
            <div className="h-11 w-11 shrink-0 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
            <div className="flex-1 space-y-2">
                <div className="h-3 w-2/5 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                <div className="h-2.5 w-1/3 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
            </div>
            <div className="h-4 w-12 shrink-0 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
        </div>
    );
}

export default function BrandItemSellersPage() {
    const { idOrSlug } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const brandItemHint = location.state?.brandItem;

    const [sort, setSort] = useState("relevance");
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [buySeller, setBuySeller] = useState(null);

    const abortRef = useRef(null);

    const runQuery = useCallback((offset, { append }) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        (append ? setLoadingMore : setLoading)(true);

        fetchBrandItemSellers(brandItemHint?.id || idOrSlug, { sort, limit: PAGE_SIZE, offset, signal: controller.signal })
            .then((res) => {
                if (!res?.success) return;
                setItems((prev) => (append ? [...prev, ...(res.items || [])] : res.items || []));
                setTotal(res.total ?? null);
                setHasMore(!!res.hasMore);
            })
            .catch((err) => { if (err?.name !== "AbortError") setHasMore(false); })
            .finally(() => { setLoading(false); setLoadingMore(false); });
    }, [brandItemHint?.id, idOrSlug, sort]);

    useEffect(() => { runQuery(0, { append: false }); }, [sort]); // eslint-disable-line react-hooks/exhaustive-deps

    const sentinelRef = useInfiniteScrollSentinel(
        () => !loadingMore && hasMore && runQuery(items.length, { append: true }),
        { lookahead: 600, disabled: loading || loadingMore || !hasMore }
    );

    // Maps a sellers-list row onto what BuyNowModal expects. Falls back
    // gracefully (undefined -> no slabs/terms shown) if the backend
    // hasn't been updated to select the richer columns yet.
    const buyerSellerPayload = buySeller && {
        offerId: buySeller.submission_id,
        display_name: buySeller.display_name,
        unit: buySeller.unit,
        moq: buySeller.moq,
        price: buySeller.price,
        gstPercent: buySeller.gst_percent,
        availableStock: buySeller.stock_quantity ?? null,
        stockType: buySeller.stock_type,
        leadTime: effectiveLeadTime(buySeller),
        dispatchTimeDays: buySeller.dispatch_time_days,
        productionLeadTimeDays: buySeller.production_lead_time_days,
        priceSlabs: buySeller.price_slabs || [],
        quantityDiscounts: buySeller.quantity_discounts || [],
        // hsnCode: buySeller.hsn_code,
        paymentTerms: buySeller.payment_terms,
        returnPolicy: buySeller.return_policy,
        warranty: buySeller.warranty,
        deliveryTimeline: buySeller.delivery_timeline,
        freightIncluded: buySeller.freight_included,
        priceBasis: buySeller.price_basis,
        dispatchOrigin: [buySeller.dispatch_district, buySeller.dispatch_state].filter(Boolean).join(", ") || null,
        dispatchPincode: buySeller.dispatch_pincode,
        dispatchState: buySeller.dispatch_state,
        // Pack/master-pack purchasing — falls back to per-unit if these are
        // 0/undefined (toBaseUnits() in BuyNowModal treats <=0 as 1).
        packSize: buySeller.pack_size,
        masterPackSize: buySeller.units_per_master_pack,
        // Sample cycle
        sampleAvailable: buySeller.sample_available || false,
        sampleQuantity: buySeller.sample_quantity ?? null,
        samplePrice: buySeller.sample_price ?? null,
    };

    return (
        <div className="min-h-screen bg-[#FCFBF9]">
            <div className="sticky top-0 z-20 border-b bg-white" style={{ borderColor: C.hair }}>
                <div className="mx-auto max-w-7xl px-3 pt-3 sm:px-4">
                    <div className="flex items-center gap-2.5 pb-3">
                        <button onClick={() => navigate(-1)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.05]">
                            <ArrowLeft className="h-4 w-4" style={{ color: C.ink }} />
                        </button>
                        <div className="min-w-0">
                            <h1 className="truncate text-[16.5px] font-extrabold leading-tight tracking-wide" style={{ color: C.ink }}>
                                {brandItemHint?.name || "Sellers"}
                            </h1>
                            <p className="truncate text-[11.5px] font-bold tracking-wider" style={{ color: C.primary }}>
                                {brandItemHint?.brand_name} {total != null ? `· ${total} sellers` : ""}
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-1.5 pb-3">
                        {SORTS.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => setSort(s.id)}
                                className="rounded-full border px-3 py-1 text-[12px] font-bold tracking-wide"
                                style={{ borderColor: sort === s.id ? C.primary : C.hair, color: sort === s.id ? '#ffffff' : C.muted, background: sort === s.id ? `${C.primary}` : "white" }}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-7xl bg-white sm:my-3 sm:rounded-2xl sm:border" style={{ borderColor: C.hair }}>
                {loading
                    ? Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} />)
                    : items.length === 0 ? (
                        <div className="flex flex-col items-center gap-1.5 px-6 py-16 text-center">
                            <Store className="h-6 w-6" style={{ color: C.hair }} />
                            <p className="text-[13px] font-bold" style={{ color: C.ink }}>No sellers listing this right now</p>
                        </div>
                    ) : (
                        <>
                            {items.map((s, i) => (
                                <SellerRow
                                    key={s.submission_id}
                                    s={s}
                                    idx={i}
                                    onBuy={() => setBuySeller(s)}
                                    onViewShop={() => navigate(`/shop/${s.shop_slug}`)}
                                />
                            ))}
                            {loadingMore && <RowSkeleton />}
                        </>
                    )}
                {hasMore && !loading && <div ref={sentinelRef} className="h-1" />}
            </div>

            {buyerSellerPayload && (
                <BuyNowModal
                    seller={buyerSellerPayload}
                    product={{ name: brandItemHint?.name, brand_name: brandItemHint?.brand_name }}
                    onClose={() => setBuySeller(null)}
                />
            )}
        </div>
    );
}