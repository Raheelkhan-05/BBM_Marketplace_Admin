// pages/ProductDetailPage.jsx

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, useScroll, useTransform, useInView, AnimatePresence } from "framer-motion";
import {
    ChevronRight, ArrowLeft, Heart, Sparkles, ShoppingCart, Tag, FileText, X,
    PackageSearch, Store, ArrowRight, Scale, Share2, Zap, CheckCircle2, FileSpreadsheet,
} from "lucide-react";
import { fetchProductDetail } from "../utils/api";
import ImageLightbox from "../components/ImageLightbox";
import { FONT_BODY } from "./ui";

export default function ProductDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [product, setProduct] = useState(null);
    const [brands, setBrands] = useState([]);
    const [specSummary, setSpecSummary] = useState([]);
    const [specSampleSize, setSpecSampleSize] = useState(0);
    const [sellerCount, setSellerCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [activeTab, setActiveTab] = useState("specifications");
    const [lightboxOpen, setLightboxOpen] = useState(false);

    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        setLoading(true);
        setNotFound(false);
        fetchProductDetail(id).then((res) => {
            if (res?.success) {
                setProduct(res.product);
                setBrands(res.brands || []);
                setSpecSummary(Array.isArray(res.specSummary) ? res.specSummary : []);
                setSpecSampleSize(res.specSampleSize || 0);
                setSellerCount(res.sellerCount || 0);
            } else {
                setNotFound(true);
            }
            setLoading(false);
        });
    }, [id]);

    if (loading) return <PageSkeleton />;
    if (notFound || !product) return <NotFoundState onBack={() => navigate(-1)} />;

    const category = product.subcategory?.category;
    const subcategory = product.subcategory;
    // Fallback only — used when there aren't enough brand listings yet for
    // the server to aggregate a real spec summary (see specSummary below).
    const staticSpecs = product.attributes && typeof product.attributes === "object" ? Object.entries(product.attributes) : [];
    const hasAggregatedSpecs = specSummary.length > 0;
    const variants = Array.isArray(product.variants) ? product.variants : [];

    const tabs = [
        (hasAggregatedSpecs || staticSpecs.length > 0) && { id: "specifications", label: "Specifications" },
        variants.length > 0 && { id: "options", label: "Available Options" },
        brands.length > 0 && { id: "brands", label: "Popular Brands" },
    ].filter(Boolean);

    return (
        <div className="mx-auto max-w-6xl px-3 pb-14 pt-3 sm:px-6 sm:pb-16 sm:pt-4 lg:px-8">
            {/* Breadcrumb */}
            <div className="flex items-center tracking-wide justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1 text-[10.5px] font-semibold text-slate-500 sm:text-[12.5px]">
                    <button onClick={() => navigate("/browse-search")} className="text-[#047084] hover:underline">All Categories</button>
                    {category && (
                        <>
                            <ChevronRight className="h-3 w-3 text-slate-300 sm:h-3.5 sm:w-3.5" />
                            <button
                                onClick={() =>
                                    navigate(`/category/${category.slug || category.id}/subcategories`, {
                                        state: { category },
                                    })
                                }
                                className="text-[#047084] hover:underline"
                            >
                                {category.name}
                            </button>
                        </>
                    )}

                    {subcategory && (
                        <>
                            <ChevronRight className="h-3 w-3 text-slate-300 sm:h-3.5 sm:w-3.5" />
                            <button
                                onClick={() =>
                                    navigate("/browse-search", {
                                        state: {
                                            imageResult: {
                                                resolved: true,
                                                stack: [
                                                    { id: category.id, name: category.name },
                                                    { id: subcategory.id, name: subcategory.name },
                                                ],
                                            },
                                        },
                                    })
                                }
                                className="text-[#047084] hover:underline"
                            >
                                {subcategory.name}
                            </button>
                        </>
                    )}
                    <ChevronRight className="h-3 w-3 text-slate-300 sm:h-3.5 sm:w-3.5" />
                    <span className="text-slate-900">{product.name}</span>
                </div>
                <button
                    onClick={() => navigate(-1)}
                    className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-bold text-slate-600 transition hover:bg-slate-50 sm:flex"
                >
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to results
                </button>
            </div>

            {/* Image (40%) + Info (60%) — side-by-side at every size */}
            <div className="mt-3 grid grid-cols-[2fr,3fr] gap-3 sm:mt-5 sm:gap-6">
                {/* Image */}
                <div>
                    <div className="relative h-full w-full min-h-[160px] overflow-hidden rounded-xl border border-slate-100 bg-slate-50 sm:min-h-[220px] sm:rounded-2xl">
                        <button className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm transition hover:text-rose-500 sm:right-3 sm:top-3 sm:h-9 sm:w-9">
                            <Heart className="h-3 w-3 sm:h-4 sm:w-4" />
                        </button>
                        {product.image ? (
                            <button
                                type="button"
                                onClick={() => setLightboxOpen(true)}
                                className="group block h-full w-full"
                            >
                                <img src={product.image} alt={product.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                            </button>
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-300">
                                <PackageSearch className="h-8 w-8 sm:h-16 sm:w-16" strokeWidth={1.4} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Info — name, tags, hierarchy, AI summary */}
                <div className="flex flex-col">
                    <h1
                        className="text-[15px] font-extrabold leading-tight tracking-tight text-slate-900 xs:text-[17px] sm:text-[24px] lg:text-[28px]"
                        style={{ fontFamily: FONT_BODY }}
                    >
                        {product.name}
                    </h1>

                    <div className="mt-1.5 flex flex-wrap gap-1 sm:mt-2.5 sm:gap-2">
                        {product.is_ai_generated ? (
                            <Badge icon={Sparkles} text="New on BBM" color="#047084" />
                        ) : (
                            <Badge icon={CheckCircle2} text="Standard Product" color="#059669" />
                        )}
                        {brands.length > 1 && <Badge icon={Tag} text="Multiple Brands" color="#6655D8" />}
                        {sellerCount > 0 && <Badge icon={Store} text={`${sellerCount} Sellers`} color="#F15A24" />}
                    </div>

                    <p className="mt-1.5 text-[10px] font-semibold leading-snug text-slate-500 sm:mt-3 sm:text-[13px]">
                        <span className="hidden sm:inline">Category: </span>
                        <span className="text-slate-700">{category?.name || "—"}</span>
                        {subcategory && (
                            <>
                                {" "}<ChevronRight className="mx-0.5 inline h-2.5 w-2.5 sm:h-3 sm:w-3" /> <span className="text-slate-700">{subcategory.name}</span>
                            </>
                        )}
                    </p>

                    {product.description && (
                        <div className="mt-2 rounded-lg pt-3 pb-3 sm:mt-4 sm:rounded-xl sm:py-3.5">
                            <p className="flex items-bottom gap-1 text-[8.5px] font-extrabold uppercase tracking-wide text-[#047084] sm:gap-1.5 sm:text-[11.5px]">
                                <FileText className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5" /> Description
                            </p>
                            <p className="mt-1 text-[10.5px] leading-relaxed text-slate-600 line-clamp-4 sm:mt-1.5 sm:text-[13.5px] sm:line-clamp-none">
                                {product.description}
                            </p>
                        </div>
                    )}
                </div>
                <AnimatePresence>
                    {lightboxOpen && product.image && (
                        <ImageLightbox src={product.image} alt={product.name} onClose={() => setLightboxOpen(false)} />
                    )}
                </AnimatePresence>
            </div>

            {/* Buy / Sell CTAs — side-by-side at every size */}
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:mt-6 sm:gap-4">
                <CTACard
                    icon={ShoppingCart}
                    title="I WANT TO BUY"
                    subtitle="Get best quotes from verified sellers"
                    gradient="from-[#0B8A93] to-[#047084]"
                    points={["Live quotes from multiple sellers", "Compare price, delivery & quality", "100% secure & best price guarantee"]}
                    onClick={() => {/* wire to RFQ / seller-list flow */ }}
                />
                <CTACard
                    icon={Tag}
                    title="I WANT TO SELL"
                    subtitle="List your product and reach buyers"
                    gradient="from-[#F15A24] to-[#d2462b]"
                    points={["Reach thousands of serious buyers", "Showcase your stock & brand", "Grow your business on BBM marketplace"]}
                    onClick={() => navigate("/seller/onboarding")}
                />
            </div>

            {/* Tabs */}
            {tabs.length > 0 && (
                <div className="mt-4 rounded-xl border border-slate-100 bg-white p-3 shadow-[0_8px_20px_-16px_rgba(4,112,132,0.3)] sm:mt-6 sm:rounded-2xl sm:p-5">
                    <p className="flex items-center gap-1.5 text-[11px] font-extrabold text-slate-900 sm:text-[13px]">
                        <FileSpreadsheet className="h-3.5 w-3.5 text-[#047084] sm:h-4 sm:w-4" /> Data Sheet
                    </p>
                    <div className="mt-2.5 flex gap-1 overflow-x-auto border-b border-slate-100 pb-2 [scrollbar-width:none] sm:mt-3">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10.5px] font-bold transition sm:px-3 sm:text-[12.5px] ${activeTab === tab.id ? "bg-[#047084]/10 text-[#047084]" : "text-slate-500 hover:text-slate-700"
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="mt-3 sm:mt-4">
                        {activeTab === "specifications" && (
                            <div>
                                {hasAggregatedSpecs ? (
                                    <>
                                        <p className="text-[9.5px] font-semibold text-slate-400 sm:text-[11px]">
                                            Spec range across {specSampleSize} listed brand{specSampleSize === 1 ? "" : "s"} — exact values vary by seller
                                        </p>
                                        <div className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2 sm:gap-y-2">
                                            {specSummary.map((s) => (
                                                <div key={s.name} className="flex items-start justify-between gap-3 border-b border-slate-50 py-1.5 text-[10.5px] sm:py-2 sm:text-[12.5px]">
                                                    <span className="shrink-0 font-semibold text-slate-500">{s.name}</span>
                                                    <span className="text-right font-bold text-slate-800">{s.rangeText}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : staticSpecs.length > 0 ? (
                                    <>
                                        <p className="text-[9.5px] font-semibold text-slate-400 sm:text-[11px]">
                                            Typical specifications for this product line — not yet confirmed against listed sellers
                                        </p>
                                        <div className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2 sm:gap-y-2">
                                            {staticSpecs.map(([key, val]) => (
                                                <div key={key} className="flex items-center justify-between border-b border-slate-50 py-1.5 text-[10.5px] sm:py-2 sm:text-[12.5px]">
                                                    <span className="font-semibold text-slate-500">{key}</span>
                                                    <span className="font-bold text-slate-800">{String(val)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        )}

                        {activeTab === "options" && variants.length > 0 && (
                            <div className="space-y-3 sm:space-y-4">
                                {variants.map((v, i) => {
                                    const values = Array.isArray(v.values) ? v.values : [v.values].filter(Boolean);
                                    if (!v.attribute || values.length === 0) return null;
                                    return (
                                        <div key={i}>
                                            <p className="text-[8.5px] font-extrabold uppercase tracking-wide text-slate-400 sm:text-[11px]">
                                                {v.attribute}
                                            </p>
                                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                {values.map((val) => (
                                                    <span
                                                        key={val}
                                                        className="rounded-full border border-slate-200 px-2.5 py-1 text-[10.5px] font-semibold text-slate-700 sm:px-3 sm:py-1.5 sm:text-[12px]"
                                                    >
                                                        {val}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}


                        {activeTab === "brands" && brands.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                {groupBrandsByName(brands).map((g) => (
                                    <button
                                        key={g.brandName}
                                        onClick={() => navigate(`/brand/${g.items[0].id}`)}
                                        className="flex items-center gap-1.5 rounded-lg border border-slate-100 px-2 py-1.5 text-left transition hover:border-[#7fb3bd] sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2"
                                    >
                                        {g.items[0].image ? (
                                            <img src={g.items[0].image} alt="" className="h-4 w-4 rounded object-cover sm:h-6 sm:w-6" />
                                        ) : (
                                            <Tag className="h-3 w-3 text-slate-300 sm:h-4 sm:w-4" />
                                        )}
                                        <span className="text-[10.5px] font-bold text-slate-800 sm:text-[12.5px]">
                                            {g.brandName}{g.items.length > 1 && <span className="ml-1 font-medium text-slate-400">({g.items.length} SKUs)</span>}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* "Brands That Sell This Product" strip */}
            {brands.length > 0 && (
                <div className="mt-4 rounded-xl border border-slate-100 bg-white p-3 shadow-[0_8px_20px_-16px_rgba(4,112,132,0.3)] sm:mt-6 sm:rounded-2xl sm:p-5">
                    <p className="text-[11px] font-extrabold text-slate-900 sm:text-[13px]">Brands That Sell This Product</p>
                    <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3 sm:gap-2">
                        {groupBrandsByName(brands).map((g) => (
                            <button
                                key={g.brandName}
                                onClick={() => navigate(`/brand/${g.items[0].id}`)}
                                className="rounded-full border border-slate-100 px-2.5 py-1 text-[10.5px] font-bold text-slate-700 transition hover:border-[#7fb3bd] hover:text-[#047084] sm:px-3.5 sm:py-1.5 sm:text-[12px]"
                            >
                                {g.brandName}{g.items.length > 1 && ` (${g.items.length})`}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Bottom action bar */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 shadow-[0_8px_20px_-16px_rgba(4,112,132,0.3)] sm:mt-6 sm:gap-3 sm:rounded-2xl sm:p-3">
                <div className="flex gap-3 sm:gap-4">
                    <IconAction icon={Heart} label="Save" />
                    <IconAction icon={Scale} label="Compare" />
                    <IconAction icon={Share2} label="Share" />
                </div>
                <div className="flex flex-1 gap-1.5 sm:flex-initial sm:gap-2">
                    <button className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#047084] px-3 py-2 text-[11px] font-bold text-white transition hover:bg-[#035c6d] sm:flex-initial sm:gap-2 sm:rounded-xl sm:px-5 sm:py-2.5 sm:text-[13px]">
                        <ShoppingCart className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Buy
                    </button>
                    <button
                        onClick={() => navigate("/seller/onboarding")}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#F15A24] px-3 py-2 text-[11px] font-bold text-white transition hover:bg-[#d2462b] sm:flex-initial sm:gap-2 sm:rounded-xl sm:px-5 sm:py-2.5 sm:text-[13px]">
                        <Tag className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Sell
                    </button>
                </div>
            </div>
        </div>
    );
}

function Badge({ icon: Icon, text, color }) {
    return (
        <span
            className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[8.5px] font-bold sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[11px]"
            style={{ background: `${color}14`, color }}
        >
            <Icon className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> {text}
        </span>
    );
}

function CTACard({ icon: Icon, title, subtitle, gradient, points, onClick }) {
    return (
        <motion.div whileTap={{ scale: 0.99 }} className="overflow-hidden rounded-xl border border-slate-100 sm:rounded-2xl">
            <button
                onClick={onClick}
                className={`flex w-full items-center justify-between bg-gradient-to-r ${gradient} px-2.5 py-2.5 text-left text-white sm:px-5 sm:py-4`}
            >
                <div className="flex items-center gap-1.5 sm:gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 sm:h-10 sm:w-10">
                        <Icon className="h-3 w-3 sm:h-5 sm:w-5" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-[11.5px] font-extrabold leading-tight tracking-wide sm:text-[14.5px]">{title}</p>
                        <p className="hidden text-[9.5px] sm:text-[12.5px] font-medium leading-tight opacity-90 xs:block sm:block">{subtitle}</p>
                    </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-90 sm:h-5 sm:w-5" />
            </button>
            <div className="bg-white px-2.5 py-2.5 sm:px-5 sm:py-4">
                <p className="text-[8px] font-extrabold uppercase tracking-wide text-slate-400 sm:text-[11px]">You will get:</p>
                <ul className="mt-1.5 space-y-1 sm:mt-2 sm:space-y-1.5">
                    {points.map((p) => (
                        <li key={p} className="flex items-start gap-1.5 text-[9.5px] font-medium leading-snug text-slate-600 sm:gap-2 sm:text-[12.5px]">
                            <CheckCircle2 className="mt-0.5 h-2.5 w-2.5 shrink-0 text-emerald-500 sm:h-3.5 sm:w-3.5" />
                            {p}
                        </li>
                    ))}
                </ul>
            </div>
        </motion.div>
    );
}

function IconAction({ icon: Icon, label }) {
    return (
        <button className="flex items-center gap-1 text-[10px] font-bold text-slate-500 transition hover:text-slate-800 sm:gap-1.5 sm:text-[12px]">
            <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> {label}
        </button>
    );
}

function groupBrandsByName(brands) {
    const map = new Map();
    for (const b of brands) {
        const key = b.brand_name || b.name;
        if (!map.has(key)) map.set(key, { brandName: key, items: [] });
        map.get(key).items.push(b);
    }
    return [...map.values()];
}

function PageSkeleton() {
    return (
        <div className="mx-auto max-w-6xl px-3 pb-14 pt-3 sm:px-6 sm:pb-16 sm:pt-4 lg:px-8">
            {/* Breadcrumb */}
            <div className="flex items-center justify-between gap-3">
                <Pulse className="h-3 w-40 rounded sm:h-3.5 sm:w-56" />
                <Pulse className="hidden h-7 w-32 rounded-lg sm:block" />
            </div>

            {/* Image + Info */}
            <div className="mt-3 grid grid-cols-[2fr,3fr] gap-3 sm:mt-5 sm:gap-6">
                <Pulse className="min-h-[160px] rounded-xl sm:min-h-[220px] sm:rounded-2xl" />

                <div className="flex flex-col">
                    <Pulse className="h-5 w-4/5 rounded-lg sm:h-8" />
                    <div className="mt-1.5 flex flex-wrap gap-1 sm:mt-2.5 sm:gap-2">
                        <Pulse className="h-4 w-24 rounded-sm sm:h-6 sm:w-28" />
                        <Pulse className="h-4 w-20 rounded-sm sm:h-6 sm:w-24" />
                    </div>
                    <Pulse className="mt-1.5 h-3 w-1/2 rounded sm:mt-3 sm:h-4" />
                    <div className="mt-2 space-y-1.5 sm:mt-4">
                        <Pulse className="h-3 w-1/4 rounded sm:h-3.5" />
                        <Pulse className="h-3 w-full rounded sm:h-3.5" />
                        <Pulse className="h-3 w-full rounded sm:h-3.5" />
                        <Pulse className="h-3 w-2/3 rounded sm:h-3.5" />
                    </div>
                </div>
            </div>

            {/* Buy / Sell CTAs */}
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:mt-6 sm:gap-4">
                <Pulse className="h-[110px] rounded-xl sm:h-[150px] sm:rounded-2xl" />
                <Pulse className="h-[110px] rounded-xl sm:h-[150px] sm:rounded-2xl" />
            </div>

            {/* Tabs card */}
            <div className="mt-4 rounded-xl border border-slate-100 bg-white p-3 sm:mt-6 sm:rounded-2xl sm:p-5">
                <Pulse className="h-3.5 w-24 rounded sm:h-4 sm:w-28" />
                <div className="mt-2.5 flex gap-2 border-b border-slate-100 pb-2 sm:mt-3">
                    <Pulse className="h-6 w-24 rounded-lg sm:h-7 sm:w-28" />
                    <Pulse className="h-6 w-24 rounded-lg sm:h-7 sm:w-28" />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1.5 sm:mt-4 sm:grid-cols-2 sm:gap-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="flex items-center justify-between border-b border-slate-50 py-1.5 sm:py-2">
                            <Pulse className="h-3 w-1/3 rounded sm:h-3.5" />
                            <Pulse className="h-3 w-1/4 rounded sm:h-3.5" />
                        </div>
                    ))}
                </div>
            </div>

            {/* Bottom action bar */}
            <Pulse className="mt-4 h-14 rounded-xl sm:mt-6 sm:h-16 sm:rounded-2xl" />
        </div>
    );
}

function Pulse({ className = "" }) {
    return (
        <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.4, repeat: Infinity }}
            className={`bg-slate-100 ${className}`}
        />
    );
}

function NotFoundState({ onBack }) {
    return (
        <div className="mx-auto flex max-w-2xl flex-col items-center px-6 py-20 text-center sm:py-24">
            <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(4,112,132,0.08)", color: "#047084" }}>
                <PackageSearch className="h-7 w-7" strokeWidth={1.8} />
            </span>
            <h3 className="mt-4 text-[15px] font-extrabold text-slate-900">Product not found</h3>
            <button onClick={onBack} className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-[12.5px] font-bold text-slate-600 hover:bg-slate-50">
                Go back
            </button>
        </div>
    );
}