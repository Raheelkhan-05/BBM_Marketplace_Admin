import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Search, X, LayoutGrid, Tag, Layers, SlidersHorizontal, ShieldCheck, PackageSearch, Store, ChevronRight } from "lucide-react";
import useLiveSearch from "../hooks/useLiveSearch";
import useShopSearch from "../hooks/useShopSearch";
import ProductResultCard from "../components/search/ProductResultCard";
import ShopResultCard from "../components/search/ShopResultCard";
import { FONT_BODY } from "./ui";

const TABS = [
  { id: "all", label: "All Results", icon: LayoutGrid },
  { id: "brands", label: "Shops", icon: Tag },
  { id: "categories", label: "Items", icon: Layers },
  { id: "filters", label: "Filters", icon: SlidersHorizontal, badge: true },
];

export default function SearchResultsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get("q") || "";
  const [inputValue, setInputValue] = useState(query);
  const [activeTab, setActiveTab] = useState("all");

  const { data, loading } = useLiveSearch(query);
  const { shops, loading: shopsLoading } = useShopSearch(query);

  useEffect(() => setInputValue(query), [query]);
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }, [query]);
  useEffect(() => setActiveTab("all"), [query]);

  useEffect(() => {
    // Blur first so the keyboard starts closing immediately (submitting a
    // search implies the user is done typing)
    document.activeElement?.blur();

    const scrollTop = () => window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    scrollTop();

    // Re-scroll once the keyboard-close animation has actually finished —
    // otherwise the first scrollTo happens against a still-shrunk viewport
    // and visually lands short of the true top.
    const t = setTimeout(scrollTop, 300);
    return () => clearTimeout(t);
  }, [query]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim()) navigate(`/search?q=${encodeURIComponent(inputValue.trim())}`);
  };

  const showShops = activeTab === "all" || activeTab === "brands";
  const showProducts = activeTab === "all" || activeTab === "categories";
  const nothingFound = !loading && !shopsLoading && (!data || data.products.length === 0) && shops.length === 0;

  return (
    <div className="mx-auto max-w-4xl px-4 pt-4 sm:px-6 lg:px-8">
      {/* Search row */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <form onSubmit={handleSubmit} className="flex flex-1 items-center overflow-hidden rounded-xl border-2 border-slate-100 bg-white shadow-[0_8px_20px_-12px_rgba(4,112,132,0.28)] focus-within:border-[#7fb3bd]">
          <Search className="ml-3.5 h-4 w-4 shrink-0 text-slate-400" />
          <input value={inputValue} onChange={(e) => setInputValue(e.target.value)}
            className="w-full bg-transparent px-3 py-3 text-[13.5px] font-medium text-slate-700 focus:outline-none" />
          {inputValue && (
            <button type="button" onClick={() => setInputValue("")} className="mr-3 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </form>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`relative flex shrink-0 items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[12.5px] font-bold transition-colors ${active ? "border-[#7fb3bd] bg-[#047084]/10 text-[#047084]" : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}>
              <Icon className="h-4 w-4" />
              {tab.label}
              {tab.id === "brands" && shops.length > 0 && (
                <span className="ml-0.5 rounded-full bg-[#047084] px-1.5 py-0.5 text-[9.5px] font-bold text-white">{shops.length}</span>
              )}
              {tab.badge && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[#047084]" />}
            </button>
          );
        })}
      </div>

      {/* Results header */}
      <div className="mt-5">
        <h2 className="text-[19px] font-extrabold tracking-tight text-slate-900" style={{ fontFamily: FONT_BODY }}>
          Results for "{query.toUpperCase()}"
        </h2>
        {data && data.products.length > 0 && (
          <p className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-slate-500">
            {data.totalCount}+ products from{" "}
            <span className="font-bold text-[#047084]">{data.supplierCount} verified suppliers</span>
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          </p>
        )}
      </div>

      {/* Shop matches */}
      {showShops && shops.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[13px] font-extrabold text-slate-900">
              <Store className="h-4 w-4 text-[#047084]" /> Shops matching "{query}"
            </h3>
            {activeTab === "all" && shops.length > 3 && (
              <button onClick={() => setActiveTab("brands")} className="flex items-center gap-0.5 text-[11.5px] font-bold text-[#047084]">
                View all <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="mt-2.5 flex flex-col gap-2">
            {(activeTab === "all" ? shops.slice(0, 3) : shops).map((shop) => (
              <ShopResultCard key={shop.id} shop={shop} />
            ))}
          </div>
        </div>
      )}

      {/* Product results */}
      {showProducts && (
        <div className="mt-5 space-y-4 pb-10">
          {loading && !data ? (
            <SkeletonCard />
          ) : nothingFound ? (
            <EmptyState query={query} />
          ) : (
            data?.products.map((product) => <ProductResultCard key={product.id} product={product} />)
          )}
        </div>
      )}

      {activeTab === "brands" && !shopsLoading && shops.length === 0 && (
        <EmptyState query={query} label="shops" />
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.4, repeat: Infinity }} className="h-[420px] rounded-2xl bg-slate-100" />
  );
}

function EmptyState({ query, label = "products" }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      className="flex flex-col min-h-screen items-center rounded-2xl px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(4,112,132,0.08)", color: "#047084" }}>
        <PackageSearch className="h-7 w-7" strokeWidth={1.8} />
      </span>
      <h3 className="mt-4 text-[15px] font-extrabold text-slate-900">No {label} found for "{query}"</h3>
      <p className="mt-1.5 max-w-xs text-[12.5px] font-medium text-slate-500">
        We couldn't match this to anything in our catalogue right now. Try a different keyword or browse popular categories instead.
      </p>
    </motion.div>
  );
}