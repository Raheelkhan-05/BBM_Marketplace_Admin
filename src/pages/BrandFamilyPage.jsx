// pages/BrandFamilyPage.jsx
// Route: <Route path="/brand-family/:brandName" element={<BrandFamilyPage />} />
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, Layers, Tag, PackageSearch } from "lucide-react";
import { fetchBrandFamily } from "../utils/api";
import { FONT_BODY } from "./ui";

const TEAL = "#006F83", TEAL_DARK = "#005466", TEAL_DEEP = "#003d4d", TEAL_SOFT = "rgba(0,111,131,0.07)";
const FONT_DISPLAY = FONT_BODY;

export default function BrandFamilyPage() {
    const { brandName } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        setLoading(true);
        setNotFound(false);
        fetchBrandFamily(brandName)
            .then((res) => {
                if (res?.success && res.categories?.length > 0) setData(res);
                else setNotFound(true);
            })
            .catch(() => setNotFound(true))
            .finally(() => setLoading(false));
    }, [brandName]);

    if (loading) return <div className="py-24 text-center text-slate-400">Loading…</div>;
    if (notFound || !data) return (
        <div className="flex min-h-[50vh] items-center justify-center px-6 text-center">
            <div>
                <h3 className="text-[16px] font-extrabold text-slate-900">Brand not found</h3>
                <button onClick={() => navigate("/browse-search")} className="mt-4 rounded-xl border border-slate-200 px-5 py-2.5 text-[13px] font-bold text-slate-600 hover:bg-slate-50">Go back</button>
            </div>
        </div>
    );

    // Real response shape: { brandName, totalMatches, totalProducts, categories }
    // — no `stats` object, and each subcategory has `.products[]`, each
    // product has `.brands[]` (the individual SKUs), not a flat `.items`.
    const { brandName: name, totalMatches, totalProducts, categories } = data;
    const categoryCount = categories.length;

    return (
        <div className="min-h-screen bg-[#FFFFFF]">
            <div className="relative overflow-hidden" style={{ background: `linear-gradient(145deg, ${TEAL} 0%, ${TEAL_DARK} 45%, ${TEAL_DEEP} 100%)` }}>
                <div className="mx-auto max-w-6xl px-4 pb-8 pt-5 sm:px-6 lg:px-8">
                    <button onClick={() => navigate("/browse-search")} className="text-[11.5px] font-semibold text-white/60 hover:text-white">All Categories</button>
                    <h1 className="mt-3 text-[24px] font-extrabold text-white sm:text-[34px]" style={{ fontFamily: FONT_DISPLAY }}>{name}</h1>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <StatPill icon={PackageSearch} value={totalMatches} label="SKUs" />
                        <StatPill icon={Tag} value={totalProducts} label="Products" />
                        <StatPill icon={Layers} value={categoryCount} label="Categories" accent />
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-6xl px-4 pb-16 pt-7 sm:px-6 lg:px-8">
                {categories.map((cat) => (
                    <section key={cat.id} className="mb-9">
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: TEAL_SOFT }}>
                                <Layers className="h-4 w-4" style={{ color: TEAL }} />
                            </span>
                            <p className="text-[14px] font-extrabold text-slate-900 sm:text-[17px]" style={{ fontFamily: FONT_DISPLAY }}>{cat.name}</p>
                        </div>

                        {cat.subcategories.map((sub) => (
                            <div key={sub.id} className="mt-4">
                                <p className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-bold text-slate-500">
                                    <ChevronRight className="h-3 w-3" />{sub.name}
                                </p>

                                {/* Each product can carry multiple brand SKUs, so group
                                    by product first, then list its brand items underneath —
                                    matches the actual nesting the API returns. */}
                                {sub.products.map((product) => (
                                    <div key={product.id} className="mb-5">
                                        <button
                                            onClick={() => navigate(`/product/${product.id}`)}
                                            className="mb-2 text-left text-[12px] font-bold text-[#006F83] hover:underline"
                                        >
                                            {product.name}
                                        </button>
                                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                                            {product.brands.map((item) => (
                                                <motion.button
                                                    key={item.id}
                                                    whileHover={{ y: -3 }}
                                                    onClick={() => navigate(`/brand/${item.slug || item.id}`)}
                                                    className="flex flex-col overflow-hidden rounded-xl border border-slate-100 bg-white text-left shadow-[0_8px_20px_-16px_rgba(0,111,131,0.3)] hover:border-[#7fb3bd]"
                                                >
                                                    <div className="aspect-square w-full overflow-hidden bg-slate-100">
                                                        {item.image ? (
                                                            <img src={item.image} alt="" className="h-full w-full object-cover" />
                                                        ) : (
                                                            <div className="flex h-full w-full items-center justify-center text-slate-300"><PackageSearch className="h-6 w-6" /></div>
                                                        )}
                                                    </div>
                                                    <div className="px-2.5 py-2">
                                                        <p className="line-clamp-2 text-[11px] font-bold text-slate-800">{item.name}</p>
                                                    </div>
                                                </motion.button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </section>
                ))}
            </div>
        </div>
    );
}

function StatPill({ icon: Icon, value, label, accent }) {
    return (
        <span className="flex items-center gap-1.5 rounded-full px-3 py-[6px] text-[10.5px] font-bold text-white" style={{ background: accent ? "rgba(210,70,43,0.22)" : "rgba(255,255,255,0.10)" }}>
            <Icon className="h-3.5 w-3.5" /><span className="font-extrabold">{value}</span> {label}
        </span>
    );
}