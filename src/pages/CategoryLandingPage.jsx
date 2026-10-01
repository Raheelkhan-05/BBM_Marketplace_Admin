// pages/CategoryLandingPage.jsx
//
// v4 — Award-winning B2B marketplace category landing page.
// Immersive hero, elegant overview, polished subcategory grid,
// perfect mobile optimization. Themed #D2462B (rust) + #006F83 (teal).
// Same API shape — no backend changes.
//
// Route: <Route path="/category/:idOrSlug" element={<CategoryLandingPage />} />

import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, useScroll, useTransform, useInView, AnimatePresence } from "framer-motion";
import {
    ChevronRight, ArrowRight, Layers, Compass,
    FileText, PackageSearch, Store, ArrowUpRight,
    ShieldCheck, Scale, Zap, TrendingUp,
    Sparkles, Box, Grid3X3, ChevronDown, X
} from "lucide-react";
import { fetchCategoryLanding } from "../utils/api";
import ImageLightbox from "../components/ImageLightbox";
import { FONT_BODY } from "./ui";

/* ═══════════════════════════════════════════════════════════════════
   BRAND PALETTE
   ═══════════════════════════════════════════════════════════════════ */
const TEAL = "#006F83";
const TEAL_DARK = "#005466";
const TEAL_DEEP = "#003d4d";
const TEAL_SOFT = "rgba(0,111,131,0.07)";
const RUST = "#D2462B";
const RUST_SOFT = "rgba(210,70,43,0.06)";

const FONT_DISPLAY = FONT_BODY;

/* ═══════════════════════════════════════════════════════════════════
   VALUE HIGHLIGHTS (static — orient first-time visitors)
   ═══════════════════════════════════════════════════════════════════ */
const VALUE_HIGHLIGHTS = [
    {
        icon: ShieldCheck,
        title: "Verified Sellers",
        desc: "GST-verified & vetted suppliers",
        gradient: `linear-gradient(135deg, ${TEAL}18, ${TEAL}08)`,
        borderColor: `${TEAL}20`,
    },
    {
        icon: Scale,
        title: "Compare & Quote",
        desc: "Get competing quotes instantly",
        gradient: `linear-gradient(135deg, ${RUST}14, ${RUST}06)`,
        borderColor: `${RUST}18`,
    },
    {
        icon: Zap,
        title: "Best Prices",
        desc: "Direct from manufacturers",
        gradient: `linear-gradient(135deg, #d9770618, #d9770608)`,
        borderColor: "#d9770620",
    },
];

/* ═══════════════════════════════════════════════════════════════════
   ANIMATION VARIANTS
   ═══════════════════════════════════════════════════════════════════ */
const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    visible: (i = 0) => ({
        opacity: 1, y: 0,
        transition: { duration: 0.55, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] },
    }),
};

const fadeScale = {
    hidden: { opacity: 0, scale: 0.92 },
    visible: (i = 0) => ({
        opacity: 1, scale: 1,
        transition: { duration: 0.5, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] },
    }),
};

const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.07 } },
};

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
export default function CategoryLandingPage() {
    const { idOrSlug } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        setLoading(true);
        setNotFound(false);
        fetchCategoryLanding(idOrSlug).then((res) => {
            if (res?.success) setData(res);
            else setNotFound(true);
            setLoading(false);
        });
    }, [idOrSlug]);

    if (loading) return <PageSkeleton />;
    if (notFound || !data) return <NotFoundState onBack={() => navigate(-1)} />;

    const { category, stats, subcategories, topProducts } = data;

    const goBrowseAll = () =>
        navigate("/browse", {
            state: { imageResult: { resolved: true, stack: [{ id: category.id, name: category.name }] } },
        });

    const goSubcategory = (sub) => navigate(`/subcategory/${sub.slug || sub.id}`);

    return (
        <div className="min-h-screen bg-[#FFFFFF]">
            {/* ─── HERO ─── */}
            <HeroBanner
                category={category}
                stats={stats}
                navigate={navigate}
                goBrowseAll={goBrowseAll}
            />

            {/* ─── MAIN CONTENT ─── */}
            <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
                {/* ─── OVERVIEW + VALUE HIGHLIGHTS ─── */}
                <OverviewSection category={category} />
                <ValueHighlights />

                {/* ─── SUBCATEGORIES ─── */}
                <SubcategoriesSection
                    subcategories={subcategories}
                    stats={stats}
                    goSubcategory={goSubcategory}
                    goBrowseAll={goBrowseAll}
                />

                {/* ─── TRENDING PRODUCTS ─── */}
                {topProducts.length > 0 && (
                    <TrendingProducts
                        products={topProducts}
                        categoryName={category.name}
                        navigate={navigate}
                    />
                )}

                {/* ─── BOTTOM ACTION ─── */}
                <BottomCTA goBrowseAll={goBrowseAll} />
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   HERO BANNER
   Immersive, full-bleed teal gradient with parallax-style depth
   ═══════════════════════════════════════════════════════════════════ */
function HeroBanner({ category, stats, navigate, goBrowseAll }) {
    const heroRef = useRef(null);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const { scrollYProgress } = useScroll({
        target: heroRef,
        offset: ["start start", "end start"],
    });
    const imageY = useTransform(scrollYProgress, [0, 1], [0, 40]);
    const textY = useTransform(scrollYProgress, [0, 1], [0, 20]);
    const heroImageSrc = category.hero_image || category.image;


    return (
        <div ref={heroRef} className="relative overflow-hidden" style={{
            background: `linear-gradient(145deg, ${TEAL} 0%, ${TEAL_DARK} 45%, ${TEAL_DEEP} 100%)`,
        }}>
            {/* ── Decorative layers ── */}
            {/* Grid pattern */}
            <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{
                backgroundImage: `
                    linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)`,
                backgroundSize: "48px 48px",
            }} />
            {/* Warm accent glow */}
            <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full opacity-[0.15] blur-[80px] sm:h-[28rem] sm:w-[28rem]" style={{ background: RUST }} />
            {/* Cool accent glow */}
            <div className="pointer-events-none absolute -bottom-32 -left-32 h-64 w-64 rounded-full opacity-[0.08] blur-[60px]" style={{ background: "#38bdf8" }} />

            <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-4 sm:px-6 sm:pb-14 sm:pt-5 lg:px-8">
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
                            <button onClick={() => navigate("/browse")} className="transition-colors hover:text-white">
                                All Categories
                            </button>
                        </li>
                        <li><ChevronRight className="h-3 w-3 text-white/30" /></li>
                        <li className="font-bold text-white">{category.name}</li>
                    </ol>
                    <button
                        onClick={goBrowseAll}
                        className="hidden items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.07] px-3.5 py-1.5 text-[11.5px] font-bold text-white/85 backdrop-blur-md transition-all hover:bg-white/[0.14] sm:flex"
                    >
                        <Compass className="h-3.5 w-3.5" /> Browse & search
                    </button>
                </motion.nav>

                {/* ── Hero grid: image + text ── */}
                <div className="mt-6 flex flex-col gap-6 sm:mt-8 sm:grid sm:grid-cols-[5fr,7fr] sm:gap-8 lg:gap-10">
                    {/* Image */}
                    <motion.div
                        style={{ y: imageY }}
                        initial={{ opacity: 0, scale: 0.94, x: -12 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <button
                            type="button"
                            onClick={() => heroImageSrc && setLightboxOpen(true)}
                            disabled={!heroImageSrc}
                            className="group relative mx-auto block aspect-[16/10] w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.12] shadow-[0_20px_60px_-12px_rgba(0,0,0,0.35)] sm:aspect-[4/3] sm:max-w-none sm:rounded-3xl"
                        >
                            {heroImageSrc ? (
                                <img
                                    src={heroImageSrc}
                                    alt={category.name}
                                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                                    loading="eager"
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center" style={{ background: "rgba(255,255,255,0.05)" }}>
                                    <Layers className="h-14 w-14 text-white/20 sm:h-20 sm:w-20" strokeWidth={1} />
                                </div>
                            )}
                            <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/25 to-transparent" />
                            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-white/[0.15] px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-white backdrop-blur-md sm:bottom-4 sm:left-4 sm:px-3.5 sm:py-1.5 sm:text-[10.5px]">
                                <Grid3X3 className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Category
                            </div>

                        </button>
                    </motion.div>

                    {/* Text content */}
                    <motion.div
                        style={{ y: textY }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
                        className="flex flex-col justify-center"
                    >
                        <h1
                            className="text-[26px] font-extrabold leading-[1.08] tracking-[-0.02em] text-white sm:text-[36px] lg:text-[44px]"
                            style={{ fontFamily: FONT_DISPLAY }}
                        >
                            {category.name}
                        </h1>

                        <p className="mt-2.5 max-w-xl text-[13px] font-medium leading-[1.65] text-white/70 sm:mt-3.5 sm:text-[16px]">
                            {category.tagline}
                        </p>

                        {/* Stat pills */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.3 }}
                            className="mt-5 flex flex-wrap gap-2 sm:mt-6 sm:gap-2.5"
                        >
                            <StatPill icon={Layers} value={stats.subcategoryCount} label="Subcategories" />
                            <StatPill icon={PackageSearch} value={stats.productCount} label="Products" />
                            {stats.sellerCount > 0 && (
                                <StatPill icon={Store} value={stats.sellerCount} label="Sellers" accent />
                            )}
                        </motion.div>

                    </motion.div>
                </div>

                {/* Scroll hint on desktop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1 }}
                    className="mt-8 hidden justify-center sm:flex"
                >
                    <motion.div
                        animate={{ y: [0, 6, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="flex flex-col items-center gap-1 text-white/30"
                    >
                        <span className="text-[10px] font-semibold uppercase tracking-widest">Scroll to explore</span>
                        <ChevronDown className="h-4 w-4" />
                    </motion.div>
                </motion.div>
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
            className="flex items-center gap-1.5 rounded-full px-3 py-[7px] text-[10.5px] font-bold text-white backdrop-blur-sm sm:gap-2 sm:px-4 sm:py-2 sm:text-[12.5px]"
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
   OVERVIEW SECTION
   Elegant card with teal accent — concise, not a Wikipedia wall.
   ═══════════════════════════════════════════════════════════════════ */
function OverviewSection({ category }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: "-60px" });

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 24 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="-mt-6 relative z-10 rounded-2xl border border-slate-100/80 bg-white p-5 sm:-mt-8 sm:rounded-3xl sm:p-7"
            style={{ boxShadow: "0 8px 40px -12px rgba(0,111,131,0.12), 0 1px 3px rgba(0,0,0,0.04)" }}
        >
            {/* Teal top accent line */}
            <div className="absolute inset-x-0 mx-5 top-0 h-[3px] rounded-t-2xl sm:rounded-t-3xl" style={{
                background: `linear-gradient(90deg, ${TEAL}, ${TEAL_DARK} 50%, ${RUST}80)`,
            }} />

            <div className="flex items-center gap-2.5">
                <span
                    className="flex h-8 w-8 items-center justify-center rounded-xl sm:h-9 sm:w-9"
                    style={{ background: TEAL_SOFT }}
                >
                    <FileText className="h-4 w-4 sm:h-[18px] sm:w-[18px]" style={{ color: TEAL }} />
                </span>
                <div>
                    <p className="text-[12px] font-extrabold uppercase tracking-wider sm:text-[13px]" style={{ color: TEAL }}>
                        About this category
                    </p>
                </div>
            </div>

            <div className="mt-3.5 border-l-[3px] pl-4 sm:mt-5 sm:pl-5" style={{ borderColor: `${TEAL}25` }}>
                <p className="text-[13px] leading-[1.75] text-slate-600 sm:text-[15px] lg:text-[15.5px]">
                    {category.overview}
                </p>
            </div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   VALUE HIGHLIGHTS
   Compact trust signals — horizontal scroll on mobile, grid on desktop
   ═══════════════════════════════════════════════════════════════════ */
function ValueHighlights() {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: "-40px" });

    return (
        <motion.div
            ref={ref}
            variants={stagger}
            initial="hidden"
            animate={inView ? "visible" : "hidden"}
            className="mt-5 sm:mt-7"
        >
            {/* Mobile: horizontal scroll. Desktop: 3-col grid */}
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0">
                {VALUE_HIGHLIGHTS.map((h, i) => (
                    <motion.div
                        key={h.title}
                        variants={fadeScale}
                        custom={i}
                        className="flex min-w-[200px] flex-1 items-center gap-3 rounded-2xl border bg-white p-4 sm:min-w-0 sm:flex-col sm:items-start sm:gap-3 sm:p-5"
                        style={{
                            borderColor: h.borderColor,
                            boxShadow: "0 2px 16px -6px rgba(0,0,0,0.04)",
                        }}
                    >
                        <span
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 sm:rounded-2xl"
                            style={{ background: h.gradient }}
                        >
                            <h.icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" style={{ color: i === 0 ? TEAL : i === 1 ? RUST : "#d97706" }} />
                        </span>
                        <div className="min-w-0">
                            <p className="text-[12px] font-extrabold text-slate-800 sm:text-[13.5px]">{h.title}</p>
                            <p className="mt-0.5 text-[10.5px] font-medium leading-snug text-slate-500 sm:mt-1 sm:text-[12px]">{h.desc}</p>
                        </div>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   SUBCATEGORIES SECTION
   Polished grid with premium hover effects
   ═══════════════════════════════════════════════════════════════════ */
function SubcategoriesSection({ subcategories, stats, goSubcategory, goBrowseAll }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: "-60px" });

    if (!subcategories.length) return null;

    return (
        <motion.section
            ref={ref}
            initial={{ opacity: 0, y: 24 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="mt-7 sm:mt-10"
        >
            {/* Section header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <span
                        className="flex h-8 w-8 items-center justify-center rounded-xl sm:h-9 sm:w-9"
                        style={{ background: TEAL_SOFT }}
                    >
                        <Layers className="h-4 w-4 sm:h-[18px] sm:w-[18px]" style={{ color: TEAL }} />
                    </span>
                    <div>
                        <p className="text-[14px] font-extrabold text-slate-900 sm:text-[17px]" style={{ fontFamily: FONT_DISPLAY }}>
                            Explore Subcategories
                        </p>
                        <p className="text-[10.5px] font-medium text-slate-500 sm:text-[12px]">
                            Browse {stats.subcategoryCount} specialized product groups
                        </p>
                    </div>
                </div>
                {stats.subcategoryCount > subcategories.length && (
                    <button
                        onClick={goBrowseAll}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-all hover:border-[#7fb3bd] hover:text-[#006F83] sm:px-3.5 sm:py-2 sm:text-[12.5px]"
                    >
                        View all <ArrowUpRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    </button>
                )}
            </div>

            {/* Grid */}
            <motion.div
                variants={stagger}
                initial="hidden"
                animate={inView ? "visible" : "hidden"}
                className="mt-4 grid grid-cols-2 gap-3 sm:mt-6 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4"
            >
                {subcategories.map((sub, i) => (
                    <SubcategoryCard key={sub.id} sub={sub} index={i} onClick={() => goSubcategory(sub)} />
                ))}
            </motion.div>
        </motion.section>
    );
}

function SubcategoryCard({ sub, index, onClick }) {
    return (
        <motion.button
            onClick={onClick}
            variants={fadeUp}
            custom={index}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.98 }}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white text-left transition-shadow duration-300 hover:shadow-[0_12px_36px_-8px_rgba(0,111,131,0.16)] active:shadow-md"
        >
            {/* Image */}
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
                {sub.image ? (
                    <img
                        src={sub.image}
                        alt={sub.name}
                        className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                        loading="lazy"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center">
                        <PackageSearch className="h-8 w-8 text-slate-200 sm:h-9 sm:w-9" strokeWidth={1.2} />
                    </div>
                )}
                {/* Hover gradient overlay */}
                <div
                    className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{ background: `linear-gradient(180deg, transparent 30%, ${TEAL}18 100%)` }}
                />
                {/* Explore arrow on hover */}
                <div className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-sm transition-all duration-300 group-hover:opacity-100 sm:bottom-2.5 sm:right-2.5 sm:h-8 sm:w-8">
                    <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" style={{ color: TEAL }} />
                </div>
            </div>

            {/* Info */}
            <div className="flex flex-1 flex-col p-3 sm:p-3.5">
                <p className="line-clamp-2 text-[12px] font-bold leading-snug text-slate-800 sm:text-[13.5px]">{sub.name}</p>
                <div className="mt-auto pt-2">
                    {sub.productCount ? (
                        <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold sm:px-2.5 sm:py-[3px] sm:text-[10.5px]"
                            style={{ background: TEAL_SOFT, color: TEAL }}
                        >
                            <Box className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            {sub.productCount} products
                        </span>
                    ) : (
                        <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold sm:px-2.5 sm:py-[3px] sm:text-[10.5px]"
                            style={{ background: RUST_SOFT, color: RUST }}
                        >
                            <Sparkles className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            New
                        </span>
                    )}
                </div>
            </div>
        </motion.button>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   TRENDING PRODUCTS
   Horizontal scroll on mobile, tight grid on desktop
   ═══════════════════════════════════════════════════════════════════ */
function TrendingProducts({ products, categoryName, navigate }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: "-50px" });

    return (
        <motion.section
            ref={ref}
            initial={{ opacity: 0, y: 24 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="mt-7 sm:mt-10"
        >
            {/* Header */}
            <div className="flex items-center gap-2.5">
                <span
                    className="flex h-8 w-8 items-center justify-center rounded-xl sm:h-9 sm:w-9"
                    style={{ background: RUST_SOFT }}
                >
                    <TrendingUp className="h-4 w-4 sm:h-[18px] sm:w-[18px]" style={{ color: RUST }} />
                </span>
                <div>
                    <p className="text-[14px] font-extrabold text-slate-900 sm:text-[17px]" style={{ fontFamily: FONT_DISPLAY }}>
                        Trending in {categoryName}
                    </p>
                    <p className="text-[10.5px] font-medium text-slate-500 sm:text-[12px]">
                        Most viewed products right now
                    </p>
                </div>
            </div>

            {/* Mobile: horizontal scroll. Desktop: 6-col grid */}
            <div className="-mx-4 mt-4 flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide sm:mx-0 sm:mt-5 sm:grid sm:grid-cols-6 sm:gap-3.5 sm:overflow-visible sm:px-0 sm:pb-0">
                {products.map((p, i) => (
                    <motion.button
                        key={p.id}
                        initial={{ opacity: 0, scale: 0.94 }}
                        animate={inView ? { opacity: 1, scale: 1 } : {}}
                        transition={{ duration: 0.4, delay: Math.min(i * 0.05, 0.25) }}
                        whileHover={{ y: -3 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => navigate(`/product/${p.id}`)}
                        className="group flex w-[140px] shrink-0 flex-col overflow-hidden rounded-xl border border-slate-100 bg-white text-left transition-shadow duration-300 hover:shadow-[0_8px_24px_-6px_rgba(0,111,131,0.14)] sm:w-auto sm:rounded-2xl"
                    >
                        <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
                            {p.image ? (
                                <img
                                    src={p.image}
                                    alt={p.name}
                                    className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                                    loading="lazy"
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                    <PackageSearch className="h-5 w-5 text-slate-200" />
                                </div>
                            )}
                        </div>
                        <p className="line-clamp-2 px-2.5 py-2.5 text-[11px] font-bold leading-snug text-slate-800 sm:px-3 sm:py-3 sm:text-[12px]">
                            {p.name}
                        </p>
                    </motion.button>
                ))}
            </div>
        </motion.section>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   BOTTOM CTA
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
                    className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-[13px] font-bold text-white shadow-lg transition-all duration-200 hover:brightness-110 hover:shadow-xl active:scale-[0.97] sm:w-auto sm:px-7 sm:py-3.5 sm:text-[14px]"
                    style={{ background: `linear-gradient(135deg, ${RUST} 0%, #a83a23 100%)` }}
                >
                    Browse full catalog <ArrowRight className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                </button>
            </div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   LOADING SKELETON
   Matches the hero layout shape for seamless perceived loading
   ═══════════════════════════════════════════════════════════════════ */
function PageSkeleton() {
    const pulse = {
        animate: { opacity: [0.35, 0.7, 0.35] },
        transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" },
    };

    return (
        <div className="min-h-screen bg-[#FFFFFF]">
            {/* Hero skeleton */}
            <div style={{ background: `linear-gradient(145deg, ${TEAL} 0%, ${TEAL_DARK} 100%)` }} className="pb-12 pt-5">
                <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                    <motion.div {...pulse} className="h-4 w-36 rounded-md bg-white/15 sm:w-44" />
                    <div className="mt-7 flex flex-col gap-6 sm:grid sm:grid-cols-[5fr,7fr] sm:gap-8">
                        <motion.div {...pulse} className="mx-auto aspect-[16/10] w-full max-w-md rounded-2xl bg-white/[0.07] sm:aspect-[4/3] sm:max-w-none sm:rounded-3xl" />
                        <div className="flex flex-col justify-center space-y-4 sm:space-y-5">
                            <motion.div {...pulse} className="h-8 w-4/5 rounded-lg bg-white/15 sm:h-11" />
                            <motion.div {...pulse} className="h-4 w-3/5 rounded-md bg-white/10 sm:h-5" />
                            <div className="flex gap-2.5">
                                <motion.div {...pulse} className="h-8 w-28 rounded-full bg-white/10 sm:h-9 sm:w-32" />
                                <motion.div {...pulse} className="h-8 w-24 rounded-full bg-white/10 sm:h-9 sm:w-28" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Body skeleton */}
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                <motion.div {...pulse} className="-mt-6 h-36 w-full rounded-2xl bg-white shadow-md sm:-mt-8 sm:h-40 sm:rounded-3xl" />
                <div className="mt-5 flex gap-3 sm:mt-7 sm:grid sm:grid-cols-3 sm:gap-4">
                    {[0, 1, 2].map((i) => (
                        <motion.div key={i} {...pulse} className="h-[72px] min-w-[200px] flex-1 rounded-2xl bg-white shadow-sm sm:h-24 sm:min-w-0" />
                    ))}
                </div>
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
   NOT FOUND STATE
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
                <span
                    className="flex h-16 w-16 items-center justify-center rounded-2xl sm:h-20 sm:w-20 sm:rounded-3xl"
                    style={{ background: TEAL_SOFT, color: TEAL }}
                >
                    <PackageSearch className="h-8 w-8 sm:h-9 sm:w-9" strokeWidth={1.4} />
                </span>
                <h3
                    className="mt-5 text-[18px] font-extrabold text-slate-900 sm:text-[22px]"
                    style={{ fontFamily: FONT_DISPLAY }}
                >
                    Category not found
                </h3>
                <p className="mt-2 text-[13px] font-medium leading-relaxed text-slate-500 sm:text-[14.5px]">
                    The category you're looking for doesn't exist or may have been moved.
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