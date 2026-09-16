import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Users, Plus, ChevronRight, Building2, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import useGenericProductSellers from "../hooks/useGenericProductSellers";
import SimpleFacetFilterBar from "../components/catalog/SimpleFacetFilterBar";
import SellerRowChoiceSheet from "../components/catalog/SellerRowChoiceSheet";
import BrandItemDetailModal from "../components/catalog/BrandItemDetailModal";
import ChooseBrandToSellModal from "../components/catalog/ChooseBrandToSellModal";
import ImageLightbox from "../components/ImageLightbox.jsx";
import BuyNowModal from "../components/BuyNowModal.jsx";
import { SellerListSkeleton, CatalogLoadError } from "../components/catalog/CatalogUI";
import { C, EASE } from "../components/catalog/tokens";
import { Tag } from "lucide-react";

function SellerBrandRow({ row, idx, isLast, onClick }) {
    return (
        <motion.button
            onClick={onClick}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.3), ease: EASE }}
            className={`flex w-full items-center gap-2.5 py-2.5 text-left transition-colors duration-150 active:bg-black/[0.02] sm:gap-3 sm:rounded-2xl sm:border sm:bg-white sm:p-4 sm:hover:bg-black/[0.02] ${!isLast ? "border-b sm:border-b-0" : ""}`}
            style={{ borderColor: C.hair }}
        >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white sm:h-14 sm:w-14 sm:rounded-xl" style={{ borderColor: C.hair }}>
                {row.image ? <img src={row.image} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-5 w-5" style={{ color: C.muted }} />}
            </span>
            <div className="min-w-0 flex-1">
                {/* Line 1 — product identity: Model/Part No. + Brand */}
                <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
                    <p className="truncate text-[12.5px] font-extrabold sm:text-[13.5px]" style={{ color: C.ink }}>
                        {row.model_no || row.brand_name}
                    </p>
                    {row.model_no && (
                        <span className="truncate text-[10.5px] font-bold sm:text-[11.5px]" style={{ color: C.primary }}>
                            {row.brand_name}
                        </span>
                    )}
                </div>
                {/* Line 2 — seller identity, now secondary */}
                <div className="mt-0.5 flex flex-wrap items-center gap-1 sm:gap-1.5">
                    <p className="truncate text-[10.5px] font-bold sm:text-[11.5px]" style={{ color: C.muted }}>{row.display_name}</p>

                </div>
                {(row.city || row.state) && (
                    <p className="mt-0.5 truncate text-[10px] font-semibold sm:text-[10.5px]" style={{ color: C.muted }}>{[row.city, row.state].filter(Boolean).join(", ")}</p>
                )}
            </div>
            <div className="shrink-0 text-right">
                <p className="text-[12px] font-extrabold sm:text-[13px]" style={{ color: C.primary }}>₹{row.price}{row.unit ? `/${row.unit}` : ""}</p>
                {row.moq && <p className="text-[9.5px] font-semibold sm:text-[10px]" style={{ color: C.muted }}>MOQ {row.moq}</p>}
            </div>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" style={{ color: C.muted }} />
        </motion.button>
    );
}

export default function GenericProductSellersPage() {
    const { idOrSlug } = useParams();
    const { state } = useLocation();
    const navigate = useNavigate();
    const { token } = useAuth();

    const [genericProduct] = useState(state?.genericProduct || { id: idOrSlug, name: "Product" });
    const [category] = useState(state?.category || null);

    const {
        items, facets, total, loading, loadingMore, error, hasMore, loadMore, retry,
        brands, setBrandsFilter, sort, setSort,
    } = useGenericProductSellers(genericProduct.id);

    const [choiceRow, setChoiceRow] = useState(null);
    const [detailId, setDetailId] = useState(null);
    const [buyRow, setBuyRow] = useState(null);
    const [showSell, setShowSell] = useState(false);
    const [lightbox, setLightbox] = useState(null);

    return (
        <div className="mx-auto min-h-screen max-w-5xl px-2.5 pb-28 pt-3 sm:px-4 sm:pb-10 lg:px-6">
            <div className="mt-3 flex items-center justify-between gap-3">
                <button onClick={() => navigate(-1)} className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors duration-150 hover:bg-black/[0.03]" style={{ borderColor: C.hair, color: C.ink }} aria-label="Back">
                    <ArrowLeft className="h-4 w-4" />
                </button>
            </div>

            <div className="mt-3">
                <h1 className="font-extrabold leading-tight tracking-[-0.01em]" style={{ color: C.ink, fontSize: "clamp(19px, 1.8vw, 27px)" }}>{genericProduct.name}</h1>
                <p className="mt-1 flex items-center gap-1 text-[12px] font-bold" style={{ color: C.muted }}>
                    <Users className="h-3.5 w-3.5" /> {total} seller{total === 1 ? "" : "s"} across {facets.brands.length} brand{facets.brands.length === 1 ? "" : "s"}
                </p>
                <button
                    onClick={() => setShowSell(true)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[12.5px] font-bold text-white"
                    style={{ background: `linear-gradient(135deg, ${C.primary} 0%, #c71f11 100%)` }}
                >
                    <Plus className="h-3.5 w-3.5" /> I want to sell this
                </button>
            </div>

            <div className="mt-4">
                <SimpleFacetFilterBar
                    title="Filter sellers"
                    total={total}
                    loading={loading}
                    sort={sort}
                    onSortChange={setSort}
                    groups={[
                        {
                            key: "brand",
                            label: "Brand",
                            icon: Tag,
                            options: facets.brands.map((b) => ({ id: b.name, name: b.name, count: b.count })),
                            selected: brands,
                            onToggle: (name) => setBrandsFilter((prev) => prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]),
                            onClear: () => setBrandsFilter([]),
                        },
                    ]}
                />
            </div>

            <div className="mt-5 overflow-hidden rounded-[24px] border bg-white p-4 sm:p-6" style={{ borderColor: C.hair }}>
                <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: C.muted }}>Sellers listing this product</p>
                {loading ? (
                    <SellerListSkeleton />
                ) : error ? (
                    <CatalogLoadError onRetry={retry} />
                ) : items.length === 0 ? (
                    <p className="py-8 text-center text-[13px] font-medium" style={{ color: C.muted }}>No sellers listing this product yet.</p>
                ) : (
                    <div className="flex flex-col sm:gap-2.5">
                        {items.map((row, i) => (
                            <SellerBrandRow key={row.submission_id} row={row} idx={i} isLast={i === items.length - 1} onClick={() => setChoiceRow(row)} />
                        ))}
                        {hasMore && (
                            <div className="flex justify-center py-3">
                                <button onClick={loadMore} disabled={loadingMore} className="rounded-lg border px-4 py-2 text-[12px] font-bold disabled:opacity-50" style={{ borderColor: C.hair, color: C.ink }}>
                                    {loadingMore ? "Loading…" : "Load more"}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <AnimatePresence>
                {choiceRow && (
                    <SellerRowChoiceSheet
                        row={choiceRow}
                        onClose={() => setChoiceRow(null)}
                        onBuy={() => { const r = choiceRow; setChoiceRow(null); setBuyRow(r); }}
                        onViewDetails={() => { const r = choiceRow; setChoiceRow(null); setDetailId(r.submission_id); }}
                    />
                )}
                {detailId && (
                    <BrandItemDetailModal
                        submissionId={detailId}
                        onClose={() => setDetailId(null)}
                        onImageClick={setLightbox}
                        onBuy={() => { setDetailId(null); setBuyRow(items.find((r) => r.submission_id === detailId)); }}
                    />
                )}
                {buyRow && (
                    <BuyNowModal
                        seller={{ id: buyRow.seller_id, display_name: buyRow.display_name, shop_slug: buyRow.shop_slug, price: buyRow.price, unit: buyRow.unit, moq: buyRow.moq }}
                        product={{ id: buyRow.brand_item_id, name: buyRow.product_name, brand_name: buyRow.brand_name, image: buyRow.image }}
                        onClose={() => setBuyRow(null)}
                    />
                )}
                {showSell && (
                    <ChooseBrandToSellModal genericProduct={{ ...genericProduct, category }} onClose={() => setShowSell(false)} />
                )}
                {lightbox && (
                    <ImageLightbox images={lightbox.images} initialIndex={lightbox.index} alt={lightbox.alt} onClose={() => setLightbox(null)} />
                )}
            </AnimatePresence>
        </div>
    );
}