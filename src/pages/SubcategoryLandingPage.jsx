// pages/SubcategoryLandingPage.jsx
//
// v5 — same enterprise design system as CategoryLandingPage (gradient
// hero, elevated card language, motion, spacing scale) so the two
// pages read as one product, but proportioned and structured for a
// level-2 page: a shorter hero, a richer overview (fact callout +
// tip instead of a single paragraph), a product catalog instead of
// a browse-more grid, and a dedicated brand reference block. No CTA
// cards. Fully responsive down to small mobile widths.
//
// Route: <Route path="/subcategory/:idOrSlug" element={<SubcategoryLandingPage />} />

import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, useInView, AnimatePresence } from "framer-motion";
import {
    ChevronRight, ArrowRight, ArrowUpRight, Compass, ChevronDown, X,
    Tag, FileText, PackageSearch, Store, Package, Sparkles, Lightbulb,
} from "lucide-react";
import { fetchSubcategoryLanding } from "../utils/api";
import ImageLightbox from "../components/ImageLightbox";
import { FONT_BODY } from "./ui";

/* ═══════════════════════════════════════════════════════════════════
   BRAND PALETTE — identical tokens to CategoryLandingPage
   ═══════════════════════════════════════════════════════════════════ */
const TEAL = "#006F83";
const TEAL_DARK = "#005466";
const TEAL_DEEP = "#003d4d";
const TEAL_SOFT = "rgba(0,111,131,0.07)";
const RUST = "#D2462B";
const RUST_SOFT = "rgba(210,70,43,0.06)";

const FONT_DISPLAY = FONT_BODY;

/* ═══════════════════════════════════════════════════════════════════
   ANIMATION VARIANTS — identical to CategoryLandingPage
   ═══════════════════════════════════════════════════════════════════ */
const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    visible: (i = 0) => ({
        opacity: 1, y: 0,
        transition: { duration: 0.55, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] },
    }),
};

const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.06 } },
};

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
export default function SubcategoryLandingPage() {
    const { idOrSlug } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        setLoading(true);
        setNotFound(false);
        fetchSubcategoryLanding(idOrSlug).then((res) => {
            if (res?.success) setData(res);
            else setNotFound(true);
            setLoading(false);
        });
    }, [idOrSlug]);

    if (loading) return <PageSkeleton />;
    if (notFound || !data) return <NotFoundState onBack={() => navigate(-1)} />;

    const { subcategory, stats, products, topBrands } = data;
    const category = subcategory.category;

    const goBrowseAll = () =>
        navigate("/browse", {
            state: {
                imageResult: {
                    resolved: true,
                    stack: [
                        category && { id: category.id, name: category.name },
                        { id: subcategory.id, name: subcategory.name },
                    ].filter(Boolean),
                },
            },
        });

    return (
        <div className="min-h-screen bg-[#FCFBF9]">
            <HeroBanner
                subcategory={subcategory}
                category={category}
                stats={stats}
                navigate={navigate}
                goBrowseAll={goBrowseAll}
            />

            <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
                <OverviewSection subcategory={subcategory} stats={stats} />

                <ProductsSection
                    products={products}
                    stats={stats}
                    subcategoryName={subcategory.name}
                    goBrowseAll={goBrowseAll}
                    navigate={navigate}
                />

                {topBrands.length > 0 && (
                    <BrandsSection brands={topBrands} subcategoryName={subcategory.name} />
                )}

                <BottomCTA goBrowseAll={goBrowseAll} />
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   HERO BANNER — same visual system as CategoryLandingPage's hero
   (gradient, dot grid, glows, framed image, stat pills), scaled down
   for a level-2 page: shorter, smaller title, no scroll hint.
   ═══════════════════════════════════════════════════════════════════ */
function HeroBanner({ subcategory, category, stats, navigate, goBrowseAll }) {
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const heroImageSrc = subcategory.hero_image || subcategory.image;

    return (
        <div className="relative overflow-hidden" style={{
            background: `linear-gradient(145deg, ${TEAL} 0%, ${TEAL_DARK} 45%, ${TEAL_DEEP} 100%)`,
        }}>
            <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{
                backgroundImage: `
                    linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)`,
                backgroundSize: "48px 48px",
            }} />
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-[0.15] blur-[80px] sm:h-96 sm:w-96" style={{ background: RUST }} />
            <div className="pointer-events-none absolute -bottom-28 -left-28 h-56 w-56 rounded-full opacity-[0.08] blur-[60px]" style={{ background: "#38bdf8" }} />

            <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-4 sm:px-6 sm:pb-10 sm:pt-5 lg:px-8">
                {/* Breadcrumb */}
                <motion.nav
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}
                    className="flex items-center tracking-wide justify-between"
                    aria-label="Breadcrumb"
                >
                    <ol className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-white/70 sm:text-[13px]">
                        <li>
                            <button onClick={() => navigate("/browse")} className="rounded transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/50">
                                All Categories
                            </button>
                        </li>
                        {category && (
                            <>
                                <li><ChevronRight className="h-3 w-3 text-white/30" /></li>
                                <li>
                                    <button
                                        onClick={() => navigate(`/category/${category.slug || category.id}/subcategories`, { state: { category } })}
                                        className="rounded transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/50"
                                    >
                                        {category.name}
                                    </button>
                                </li>
                            </>
                        )}
                        <li><ChevronRight className="h-3 w-3 text-white/30" /></li>
                        <li className="font-bold text-white">{subcategory.name}</li>
                    </ol>
                    <button
                        onClick={goBrowseAll}
                        className="hidden items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.07] px-3.5 py-1.5 text-[11.5px] font-bold text-white/85 backdrop-blur-md transition-all hover:bg-white/[0.14] sm:flex"
                    >
                        <Compass className="h-3.5 w-3.5" /> Browse & search
                    </button>
                </motion.nav>

                {/* Hero grid: image + text */}
                <div className="mt-5 flex flex-col gap-5 sm:mt-7 sm:grid sm:grid-cols-[4fr,7fr] sm:gap-8 lg:gap-10">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.94, x: -12 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <button
                            type="button"
                            onClick={() => heroImageSrc && setLightboxOpen(true)}
                            disabled={!heroImageSrc}
                            className="group relative mx-auto block aspect-[16/10] w-full max-w-sm overflow-hidden rounded-2xl border border-white/[0.12] shadow-[0_20px_50px_-14px_rgba(0,0,0,0.35)] sm:aspect-[4/3] sm:max-w-none"
                        >
                            {heroImageSrc ? (
                                <img
                                    src={heroImageSrc}
                                    alt={subcategory.name}
                                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                                    loading="eager"
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center" style={{ background: "rgba(255,255,255,0.05)" }}>
                                    <Package className="h-12 w-12 text-white/20 sm:h-16 sm:w-16" strokeWidth={1} />
                                </div>
                            )}
                            <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/25 to-transparent" />
                            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-white/[0.15] px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-white backdrop-blur-md sm:bottom-3.5 sm:left-3.5 sm:px-3.5 sm:py-1.5 sm:text-[10px]">
                                <Tag className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Subcategory
                            </div>

                        </button>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                        className="flex flex-col justify-center"
                    >
                        <h1
                            className="text-[22px] font-extrabold leading-[1.1] tracking-[-0.02em] text-white sm:text-[30px] lg:text-[36px]"
                            style={{ fontFamily: FONT_DISPLAY }}
                        >
                            {subcategory.name}
                        </h1>

                        <p className="mt-2 max-w-xl text-[12.5px] font-medium leading-[1.6] text-white/70 sm:mt-3 sm:text-[15px]">
                            {subcategory.tagline}
                        </p>

                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.28 }}
                            className="mt-4 flex flex-wrap gap-2 sm:mt-5"
                        >
                            <StatPill icon={PackageSearch} value={stats.productCount} label="Products" />
                            {stats.brandCount > 0 && (
                                <StatPill icon={Tag} value={stats.brandCount} label="Brands" />
                            )}
                            {stats.sellerCount > 0 && (
                                <StatPill icon={Store} value={stats.sellerCount} label="Sellers" accent />
                            )}
                        </motion.div>
                    </motion.div>
                </div>
            </div>
            <AnimatePresence>
                {lightboxOpen && heroImageSrc && (
                    <ImageLightbox src={heroImageSrc} alt={category.name} onClose={() => setLightboxOpen(false)} />
                )}
            </AnimatePresence>
        </div>
    );
}

function StatPill({ icon: Icon, value, label, accent }) {
    return (
        <span
            className="flex items-center gap-1.5 rounded-full px-3 py-[6px] text-[10px] font-bold text-white backdrop-blur-sm sm:gap-2 sm:px-3.5 sm:py-[7px] sm:text-[12px]"
            style={{
                background: accent ? "rgba(210,70,43,0.22)" : "rgba(255,255,255,0.10)",
                border: `1px solid ${accent ? "rgba(210,70,43,0.30)" : "rgba(255,255,255,0.14)"}`,
            }}
        >
            <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span className="font-extrabold">{value}</span> {label}
        </span>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   OVERVIEW — same elevated-card language as CategoryLandingPage's
   OverviewSection, extended with a fact callout (built from real
   stats) and a browsing tip so it actually says more, not just the
   one paragraph the backend supplies.
   ═══════════════════════════════════════════════════════════════════ */
function OverviewSection({ subcategory, stats }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: "-60px" });

    const factParts = [`${stats.productCount} products`];
    if (stats.brandCount > 0) factParts.push(`${stats.brandCount} brands`);
    if (stats.sellerCount > 0) factParts.push(`${stats.sellerCount} verified sellers`);
    const factLine = factParts.length > 1
        ? `${factParts.slice(0, -1).join(", ")} and ${factParts[factParts.length - 1]} are listed in this subcategory right now.`
        : `${factParts[0]} are listed in this subcategory right now.`;

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 24 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="-mt-6 relative z-10 rounded-2xl border border-slate-100/80 bg-white p-5 sm:-mt-8 sm:rounded-3xl sm:p-7"
            style={{ boxShadow: "0 8px 40px -12px rgba(0,111,131,0.12), 0 1px 3px rgba(0,0,0,0.04)" }}
        >
            <div className="absolute inset-x-0 mx-5 top-0 h-[3px] rounded-t-2xl sm:rounded-t-3xl" style={{
                background: `linear-gradient(90deg, ${TEAL}, ${TEAL_DARK} 50%, ${RUST}80)`,
            }} />

            <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl sm:h-9 sm:w-9" style={{ background: TEAL_SOFT }}>
                    <FileText className="h-4 w-4 sm:h-[18px] sm:w-[18px]" style={{ color: TEAL }} />
                </span>
                <p className="text-[12px] font-extrabold uppercase tracking-wider sm:text-[13px]" style={{ color: TEAL }}>
                    About this subcategory
                </p>
            </div>

            <div className="mt-3.5 border-l-[3px] pl-4 sm:mt-5 sm:pl-5" style={{ borderColor: `${TEAL}25` }}>
                <p className="text-[13px] leading-[1.75] text-slate-600 sm:text-[15px] lg:text-[15.5px]">
                    {subcategory.overview}
                </p>
            </div>

            {/* Fact callout + browsing tip */}
            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:mt-5 sm:grid-cols-2 sm:gap-3">
                <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 sm:px-4 sm:py-3.5" style={{ background: RUST_SOFT }}>
                    <PackageSearch className="mt-0.5 h-4 w-4 shrink-0" style={{ color: RUST }} />
                    <p className="text-[11.5px] font-semibold leading-snug text-slate-700 sm:text-[12.5px]">
                        {factLine}
                    </p>
                </div>
                <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 sm:px-4 sm:py-3.5" style={{ background: TEAL_SOFT }}>
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" style={{ color: TEAL }} />
                    <p className="text-[11.5px] font-semibold leading-snug text-slate-700 sm:text-[12.5px]">
                        Tip: filter by brand or seller rating once you're browsing to find exactly what you need.
                    </p>
                </div>
            </div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   PRODUCTS — image-forward catalog grid, same card quality bar as
   CategoryLandingPage's grid, showing this subcategory's actual
   products rather than more things to browse into.
   ═══════════════════════════════════════════════════════════════════ */
function ProductsSection({ products, stats, subcategoryName, goBrowseAll, navigate }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: "-60px" });

    if (!products.length) return null;

    return (
        <motion.section
            ref={ref}
            initial={{ opacity: 0, y: 24 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="mt-7 sm:mt-10"
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl sm:h-9 sm:w-9" style={{ background: TEAL_SOFT }}>
                        <PackageSearch className="h-4 w-4 sm:h-[18px] sm:w-[18px]" style={{ color: TEAL }} />
                    </span>
                    <div>
                        <p className="text-[14px] font-extrabold text-slate-900 sm:text-[17px]" style={{ fontFamily: FONT_DISPLAY }}>
                            Popular Products
                        </p>
                        <p className="text-[10.5px] font-medium text-slate-500 sm:text-[12px]">
                            {stats.productCount} products in {subcategoryName}
                        </p>
                    </div>
                </div>
                {stats.productCount > products.length && (
                    <button
                        onClick={goBrowseAll}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-all hover:border-[#7fb3bd] hover:text-[#006F83] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006F83]/30 sm:px-3.5 sm:py-2 sm:text-[12.5px]"
                    >
                        View all <ArrowUpRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    </button>
                )}
            </div>

            <motion.div
                variants={stagger}
                initial="hidden"
                animate={inView ? "visible" : "hidden"}
                className="mt-4 grid grid-cols-2 gap-3 sm:mt-6 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4"
            >
                {products.map((p, i) => (
                    <ProductCard key={p.id} product={p} index={i} onClick={() => navigate(`/product/${p.id}`)} />
                ))}
            </motion.div>
        </motion.section>
    );
}

function ProductCard({ product, index, onClick }) {
    return (
        <motion.button
            onClick={onClick}
            variants={fadeUp}
            custom={index}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.98 }}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white text-left transition-shadow duration-300 hover:shadow-[0_12px_36px_-8px_rgba(0,111,131,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006F83]/40 active:shadow-md"
        >
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
                {product.image ? (
                    <img
                        src={product.image}
                        alt={product.name}
                        className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                        loading="lazy"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center">
                        <PackageSearch className="h-8 w-8 text-slate-200 sm:h-9 sm:w-9" strokeWidth={1.2} />
                    </div>
                )}
                <div
                    className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{ background: `linear-gradient(180deg, transparent 30%, ${TEAL}18 100%)` }}
                />
                <div className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-sm transition-all duration-300 group-hover:opacity-100 sm:bottom-2.5 sm:right-2.5 sm:h-8 sm:w-8">
                    <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" style={{ color: TEAL }} />
                </div>
                {product.is_ai_generated && (
                    <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[8.5px] font-bold uppercase backdrop-blur-sm sm:left-2.5 sm:top-2.5" style={{ color: TEAL }}>
                        <Sparkles className="h-2.5 w-2.5" /> New
                    </span>
                )}
            </div>

            <div className="flex flex-1 flex-col p-3 sm:p-3.5">
                <p className="line-clamp-2 text-[12px] font-bold leading-snug text-slate-800 sm:text-[13.5px]">{product.name}</p>
                <div className="mt-auto pt-2">
                    {product.sellerCount > 0 ? (
                        <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold sm:px-2.5 sm:py-[3px] sm:text-[10.5px]"
                            style={{ background: TEAL_SOFT, color: TEAL }}
                        >
                            <Store className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            {product.sellerCount} sellers
                        </span>
                    ) : (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold text-slate-400 sm:px-2.5 sm:py-[3px] sm:text-[10.5px]" style={{ background: "#f1f5f9" }}>
                            No sellers yet
                        </span>
                    )}
                </div>
            </div>
        </motion.button>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   BRANDS — reference block unique to this page; same card language
   as the rest of the site.
   ═══════════════════════════════════════════════════════════════════ */
function BrandsSection({ brands, subcategoryName }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: "-40px" });

    return (
        <motion.section
            ref={ref}
            initial={{ opacity: 0, y: 24 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="mt-7 sm:mt-10"
        >
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_8px_20px_-16px_rgba(0,111,131,0.3)] sm:rounded-3xl sm:p-6">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl sm:h-9 sm:w-9" style={{ background: RUST_SOFT }}>
                        <Tag className="h-4 w-4 sm:h-[18px] sm:w-[18px]" style={{ color: RUST }} />
                    </span>
                    <div>
                        <p className="text-[13.5px] font-extrabold text-slate-900 sm:text-[15.5px]" style={{ fontFamily: FONT_DISPLAY }}>
                            Brands Available
                        </p>
                        <p className="text-[10.5px] font-medium text-slate-500 sm:text-[12px]">
                            Trusted names in {subcategoryName}
                        </p>
                    </div>
                </div>

                <motion.div
                    variants={stagger}
                    initial="hidden"
                    animate={inView ? "visible" : "hidden"}
                    className="mt-4 flex flex-wrap gap-2 sm:mt-5 sm:gap-2.5"
                >
                    {brands.map((b, i) => (
                        <motion.span
                            key={b.id}
                            variants={fadeUp}
                            custom={i}
                            className="flex items-center gap-1.5 rounded-full border border-slate-100 bg-white px-2.5 py-1.5 text-[10.5px] font-bold text-slate-700 sm:gap-2 sm:px-3.5 sm:py-2 sm:text-[12px]"
                        >
                            {b.image ? (
                                <img src={b.image} alt="" className="h-3.5 w-3.5 rounded object-cover sm:h-4 sm:w-4" />
                            ) : (
                                <Tag className="h-3 w-3 text-slate-300" />
                            )}
                            {b.brand_name || b.name}
                        </motion.span>
                    ))}
                </motion.div>
            </div>
        </motion.section>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   BOTTOM CTA — identical component to CategoryLandingPage's, so the
   two pages feel like siblings.
   ═══════════════════════════════════════════════════════════════════ */
function BottomCTA({ goBrowseAll }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: "-40px" });

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8 overflow-hidden rounded-2xl border border-slate-100 bg-white sm:mt-10 sm:rounded-3xl"
            style={{ boxShadow: "0 4px 24px -8px rgba(0,111,131,0.08)" }}
        >
            <div className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:justify-between sm:p-7 sm:text-left">
                <div>
                    <p className="text-[14px] font-extrabold text-slate-800 sm:text-[16px]" style={{ fontFamily: FONT_DISPLAY }}>
                        Know exactly what you need?
                    </p>
                    <p className="mt-1 text-[12px] font-medium text-slate-500 sm:text-[13.5px]">
                        Search, filter, and find the exact product specification you're looking for.
                    </p>
                </div>
                <button
                    onClick={goBrowseAll}
                    className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-[13px] font-bold text-white shadow-lg transition-all duration-200 hover:brightness-110 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2462B]/50 focus-visible:ring-offset-2 active:scale-[0.97] sm:w-auto sm:px-7 sm:py-3.5 sm:text-[14px]"
                    style={{ background: `linear-gradient(135deg, ${RUST} 0%, #a83a23 100%)` }}
                >
                    Browse full catalog <ArrowRight className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                </button>
            </div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   LOADING SKELETON — matches the hero-shaped skeleton used across
   the site, sized to this page's shorter hero.
   ═══════════════════════════════════════════════════════════════════ */
function PageSkeleton() {
    const pulse = {
        animate: { opacity: [0.35, 0.7, 0.35] },
        transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" },
    };

    return (
        <div className="min-h-screen bg-[#FCFBF9]">
            <div style={{ background: `linear-gradient(145deg, ${TEAL} 0%, ${TEAL_DARK} 100%)` }} className="pb-10 pt-4">
                <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                    <motion.div {...pulse} className="h-4 w-36 rounded-md bg-white/15 sm:w-44" />
                    <div className="mt-6 flex flex-col gap-5 sm:grid sm:grid-cols-[4fr,7fr] sm:gap-8">
                        <motion.div {...pulse} className="mx-auto aspect-[16/10] w-full max-w-sm rounded-2xl bg-white/[0.07] sm:aspect-[4/3] sm:max-w-none" />
                        <div className="flex flex-col justify-center space-y-3.5 sm:space-y-4">
                            <motion.div {...pulse} className="h-7 w-4/5 rounded-lg bg-white/15 sm:h-9" />
                            <motion.div {...pulse} className="h-4 w-3/5 rounded-md bg-white/10" />
                            <div className="flex gap-2.5">
                                <motion.div {...pulse} className="h-7 w-24 rounded-full bg-white/10 sm:h-8 sm:w-28" />
                                <motion.div {...pulse} className="h-7 w-20 rounded-full bg-white/10 sm:h-8 sm:w-24" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                <motion.div {...pulse} className="-mt-6 h-40 w-full rounded-2xl bg-white shadow-md sm:-mt-8 sm:h-44 sm:rounded-3xl" />
                <div className="mt-7 grid grid-cols-2 gap-3 sm:mt-10 sm:grid-cols-4 sm:gap-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <motion.div key={i} {...pulse} className="aspect-[3/4] rounded-2xl bg-white shadow-sm" />
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   NOT FOUND STATE — matches CategoryLandingPage's
   ═══════════════════════════════════════════════════════════════════ */
function NotFoundState({ onBack }) {
    return (
        <div className="flex min-h-[60vh] items-center justify-center px-6">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="flex max-w-sm flex-col items-center text-center"
            >
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl sm:h-20 sm:w-20 sm:rounded-3xl" style={{ background: TEAL_SOFT, color: TEAL }}>
                    <PackageSearch className="h-8 w-8 sm:h-9 sm:w-9" strokeWidth={1.4} />
                </span>
                <h3 className="mt-5 text-[18px] font-extrabold text-slate-900 sm:text-[22px]" style={{ fontFamily: FONT_DISPLAY }}>
                    Subcategory not found
                </h3>
                <p className="mt-2 text-[13px] font-medium leading-relaxed text-slate-500 sm:text-[14.5px]">
                    The subcategory you're looking for doesn't exist or may have been moved.
                </p>
                <button
                    onClick={onBack}
                    className="mt-6 rounded-xl border border-slate-200 px-6 py-3 text-[13px] font-bold text-slate-600 transition-all hover:bg-slate-50 active:scale-[0.97] sm:text-[14px]"
                >
                    Go back
                </button>
            </motion.div>
        </div>
    );
}