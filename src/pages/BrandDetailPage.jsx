// pages/BrandDetailPage.jsx
//
// Brand-level detail page — one specific branded SKU (e.g. "Yogi Hi-Tech
// 13070 FWT Unitized Front Wheel Bearing"), not a brand-wide storefront.
// Shows this SKU's exact specs, its parent product/category breadcrumb,
// and every OTHER SKU sold under the same brand_name so a buyer who
// landed on one part number can see the rest of that manufacturer's
// range without going back through the product page each time.
//
// Route: <Route path="/brand/:idOrSlug" element={<BrandDetailPage />} />
// Requires a backend endpoint returning:
// {
//   success: true,
//   brand: { id, name, brand_name, image, description, attributes: {k:v},
//            product: { id, name }, subcategory: { id, name, slug },
//            category: { id, name, slug } },
//   siblingBrandItems: [{ id, name, image }],   // other SKUs, same brand_name
//   sellerCount: number
// }

import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, useInView, AnimatePresence } from "framer-motion";
import {
    ChevronRight, ArrowRight, Compass, BadgeCheck, FileText,
    PackageSearch, Store, Tag, ShoppingCart, Heart, Share2,
} from "lucide-react";
import { fetchBrandDetail } from "../utils/api";
import ImageLightbox from "../components/ImageLightbox";
import { FONT_BODY } from "./ui";

const TEAL = "#006F83";
const TEAL_DARK = "#005466";
const TEAL_DEEP = "#003d4d";
const TEAL_SOFT = "rgba(0,111,131,0.07)";
const RUST = "#D2462B";
const RUST_SOFT = "rgba(210,70,43,0.06)";
const FONT_DISPLAY = FONT_BODY;

const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] } }),
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } };

export default function BrandDetailPage() {
    const { idOrSlug } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [lightboxOpen, setLightboxOpen] = useState(false);

    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        setLoading(true);
        setNotFound(false);
        fetchBrandDetail(idOrSlug).then((res) => {
            if (res?.success) setData(res);
            else setNotFound(true);
            setLoading(false);
        });
    }, [idOrSlug]);

    if (loading) return <PageSkeleton />;
    if (notFound || !data) return <NotFoundState onBack={() => navigate(-1)} />;

    const { brand, siblingBrandItems, sellerCount } = data;
    const { product, subcategory, category } = brand;
    const attributes = brand.attributes && typeof brand.attributes === "object" ? Object.entries(brand.attributes) : [];

    const goBrowseAll = () =>
        navigate("/browse-search", { state: { imageResult: { resolved: true, stack: [{ id: category?.id, name: category?.name }].filter(Boolean) } } });

    return (
        <div className="min-h-screen bg-[#FFFFFF]">
            {/* Hero */}
            <div className="relative overflow-hidden" style={{ background: `linear-gradient(145deg, ${TEAL} 0%, ${TEAL_DARK} 45%, ${TEAL_DEEP} 100%)` }}>
                <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{
                    backgroundImage: `linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)`,
                    backgroundSize: "48px 48px",
                }} />
                <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-[0.15] blur-[80px]" style={{ background: RUST }} />

                <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-4 sm:px-6 sm:pb-10 sm:pt-5 lg:px-8">
                    <nav className="flex items-center justify-between" aria-label="Breadcrumb">
                        <ol className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-semibold text-white/60 sm:text-[12.5px]">
                            <li><button onClick={() => navigate("/browse-search")} className="hover:text-white">All Categories</button></li>
                            {category && (<><li><ChevronRight className="h-3 w-3 text-white/30" /></li>
                                <li><button onClick={() => navigate(`/category/${category.slug || category.id}`)} className="hover:text-white">{category.name}</button></li></>)}
                            {subcategory && (<><li><ChevronRight className="h-3 w-3 text-white/30" /></li>
                                <li><button onClick={() => navigate(`/subcategory/${subcategory.slug || subcategory.id}`)} className="hover:text-white">{subcategory.name}</button></li></>)}
                            {product && (<><li><ChevronRight className="h-3 w-3 text-white/30" /></li>
                                <li><button onClick={() => navigate(`/product/${product.id}`)} className="hover:text-white">{product.name}</button></li></>)}
                            <li><ChevronRight className="h-3 w-3 text-white/30" /></li>
                            <li className="font-bold text-white">{brand.name}</li>
                        </ol>
                        <button onClick={goBrowseAll} className="hidden items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.07] px-3.5 py-1.5 text-[11.5px] font-bold text-white/85 backdrop-blur-md hover:bg-white/[0.14] sm:flex">
                            <Compass className="h-3.5 w-3.5" /> Browse & search
                        </button>
                    </nav>

                    <div className="mt-5 flex flex-col gap-5 sm:mt-7 sm:grid sm:grid-cols-[4fr,7fr] sm:gap-8">
                        <motion.div initial={{ opacity: 0, scale: 0.94, x: -12 }} animate={{ opacity: 1, scale: 1, x: 0 }} transition={{ duration: 0.6 }}>
                            <button
                                type="button"
                                onClick={() => brand.image && setLightboxOpen(true)}
                                disabled={!brand.image}
                                className="group relative mx-auto block aspect-[4/3] w-full max-w-sm overflow-hidden rounded-2xl border border-white/[0.12] shadow-[0_20px_50px_-14px_rgba(0,0,0,0.35)] sm:max-w-none"
                            >
                                {brand.image ? (
                                    <img src={brand.image} alt={brand.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center" style={{ background: "rgba(255,255,255,0.05)" }}>
                                        <BadgeCheck className="h-14 w-14 text-white/20" strokeWidth={1} />
                                    </div>
                                )}
                                <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-white/[0.15] px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
                                    <BadgeCheck className="h-3 w-3" /> Brand Item
                                </div>
                            </button>
                        </motion.div>

                        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.1 }} className="flex flex-col justify-center">
                            {brand.brand_name && (
                                <span className="mb-2 inline-flex w-fit items-center gap-1 rounded-full bg-[#F15A24]/20 px-2.5 py-1 text-[10.5px] font-bold text-white">
                                    {brand.brand_name}
                                </span>
                            )}
                            <h1 className="text-[22px] font-extrabold leading-[1.1] tracking-[-0.02em] text-white sm:text-[30px] lg:text-[36px]" style={{ fontFamily: FONT_DISPLAY }}>
                                {brand.name}
                            </h1>
                            {brand.description && (
                                <p className="mt-2.5 max-w-xl text-[12.5px] font-medium leading-[1.6] text-white/70 sm:text-[15px]">{brand.description}</p>
                            )}
                            <div className="mt-4 flex flex-wrap gap-2">
                                {sellerCount > 0 && (
                                    <span className="flex items-center gap-1.5 rounded-full px-3 py-[6px] text-[10.5px] font-bold text-white" style={{ background: "rgba(210,70,43,0.22)", border: "1px solid rgba(210,70,43,0.3)" }}>
                                        <Store className="h-3 w-3.5" /><span className="font-extrabold">{sellerCount}</span> Sellers
                                    </span>
                                )}
                                {siblingBrandItems.length > 0 && (
                                    <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-[6px] text-[10.5px] font-bold text-white">
                                        <Tag className="h-3 w-3.5" /><span className="font-extrabold">{siblingBrandItems.length + 1}</span> SKUs from {brand.brand_name}
                                    </span>
                                )}
                            </div>
                        </motion.div>
                    </div>
                </div>

                <AnimatePresence>
                    {lightboxOpen && brand.image && <ImageLightbox src={brand.image} alt={brand.name} onClose={() => setLightboxOpen(false)} />}
                </AnimatePresence>
            </div>

            <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
                {/* Specs */}
                {attributes.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}
                        className="-mt-6 relative z-10 rounded-2xl border border-slate-100/80 bg-white p-5 sm:-mt-8 sm:rounded-3xl sm:p-7"
                        style={{ boxShadow: "0 8px 40px -12px rgba(0,111,131,0.12), 0 1px 3px rgba(0,0,0,0.04)" }}
                    >
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl sm:h-9 sm:w-9" style={{ background: TEAL_SOFT }}>
                                <FileText className="h-4 w-4 sm:h-[18px] sm:w-[18px]" style={{ color: TEAL }} />
                            </span>
                            <p className="text-[12px] font-extrabold uppercase tracking-wider sm:text-[13px]" style={{ color: TEAL }}>Specifications</p>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2 sm:gap-y-2">
                            {attributes.map(([key, val]) => (
                                <div key={key} className="flex items-start justify-between gap-3 border-b border-slate-50 py-1.5 text-[11px] sm:py-2 sm:text-[13px]">
                                    <span className="shrink-0 font-semibold text-slate-500">{key}</span>
                                    <span className="text-right font-bold text-slate-800">{String(val)}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* Buy / Sell */}
                <div className="mt-5 grid grid-cols-2 gap-2.5 sm:mt-7 sm:gap-4">
                    <button className="flex items-center justify-between rounded-xl bg-gradient-to-r from-[#0B8A93] to-[#047084] px-4 py-3.5 text-left text-white sm:rounded-2xl sm:px-5 sm:py-4">
                        <span className="flex items-center gap-2"><ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5" /><span className="text-[12px] font-extrabold sm:text-[14.5px]">Get Quotes</span></span>
                        <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 opacity-90" />
                    </button>
                    <button onClick={() => navigate("/seller/onboarding")} className="flex items-center justify-between rounded-xl bg-gradient-to-r from-[#F15A24] to-[#d2462b] px-4 py-3.5 text-left text-white sm:rounded-2xl sm:px-5 sm:py-4">
                        <span className="flex items-center gap-2"><Tag className="h-4 w-4 sm:h-5 sm:w-5" /><span className="text-[12px] font-extrabold sm:text-[14.5px]">Sell This</span></span>
                        <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 opacity-90" />
                    </button>
                </div>

                {/* More from this brand */}
                {siblingBrandItems.length > 0 && (
                    <motion.section initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }} className="mt-7 sm:mt-10">
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl sm:h-9 sm:w-9" style={{ background: RUST_SOFT }}>
                                <BadgeCheck className="h-4 w-4 sm:h-[18px] sm:w-[18px]" style={{ color: RUST }} />
                            </span>
                            <div>
                                <p className="text-[14px] font-extrabold text-slate-900 sm:text-[17px]" style={{ fontFamily: FONT_DISPLAY }}>More from {brand.brand_name}</p>
                                <p className="text-[10.5px] font-medium text-slate-500 sm:text-[12px]">{siblingBrandItems.length} other SKU{siblingBrandItems.length === 1 ? "" : "s"} by this brand</p>
                            </div>
                        </div>

                        <motion.div variants={stagger} initial="hidden" animate="visible" className="mt-4 grid grid-cols-2 gap-3 sm:mt-6 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                            {siblingBrandItems.map((item, i) => (
                                <motion.button
                                    key={item.id} variants={fadeUp} custom={i} whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}
                                    onClick={() => navigate(`/brand/${item.id}`)}
                                    className="group flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white text-left transition-shadow duration-300 hover:shadow-[0_12px_36px_-8px_rgba(0,111,131,0.16)]"
                                >
                                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
                                        {item.image ? (
                                            <img src={item.image} alt={item.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" loading="lazy" />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center"><PackageSearch className="h-8 w-8 text-slate-200" strokeWidth={1.2} /></div>
                                        )}
                                    </div>
                                    <div className="p-3 sm:p-3.5">
                                        <p className="line-clamp-2 text-[12px] font-bold leading-snug text-slate-800 sm:text-[13.5px]">{item.name}</p>
                                    </div>
                                </motion.button>
                            ))}
                        </motion.div>
                    </motion.section>
                )}
            </div>
        </div>
    );
}

function PageSkeleton() {
    const pulse = { animate: { opacity: [0.35, 0.7, 0.35] }, transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" } };
    return (
        <div className="min-h-screen bg-[#FFFFFF]">
            <div style={{ background: `linear-gradient(145deg, ${TEAL} 0%, ${TEAL_DARK} 100%)` }} className="pb-10 pt-4">
                <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                    <motion.div {...pulse} className="h-4 w-36 rounded-md bg-white/15" />
                    <div className="mt-6 flex flex-col gap-5 sm:grid sm:grid-cols-[4fr,7fr] sm:gap-8">
                        <motion.div {...pulse} className="mx-auto aspect-[4/3] w-full max-w-sm rounded-2xl bg-white/[0.07] sm:max-w-none" />
                        <div className="flex flex-col justify-center space-y-3.5">
                            <motion.div {...pulse} className="h-7 w-4/5 rounded-lg bg-white/15" />
                            <motion.div {...pulse} className="h-4 w-3/5 rounded-md bg-white/10" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function NotFoundState({ onBack }) {
    return (
        <div className="flex min-h-[60vh] items-center justify-center px-6">
            <div className="flex max-w-sm flex-col items-center text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: TEAL_SOFT, color: TEAL }}>
                    <BadgeCheck className="h-8 w-8" strokeWidth={1.4} />
                </span>
                <h3 className="mt-5 text-[18px] font-extrabold text-slate-900" style={{ fontFamily: FONT_DISPLAY }}>Brand item not found</h3>
                <p className="mt-2 text-[13px] font-medium text-slate-500">This item doesn't exist or may have been moved.</p>
                <button onClick={onBack} className="mt-6 rounded-xl border border-slate-200 px-6 py-3 text-[13px] font-bold text-slate-600 hover:bg-slate-50">Go back</button>
            </div>
        </div>
    );
}