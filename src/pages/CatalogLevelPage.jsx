import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { CatalogHeader, FilterSortChips, IconTile, TileGrid, TileGridSkeleton, CatalogLoadError } from "../components/catalog/CatalogUI";
import { C } from "../components/catalog/tokens";
import { CATALOG_LEVEL_CONFIGS } from "./catalogLevelConfigs";
import MarketplaceSearchBar from "../components/MarketplaceSearchBar_OLD.jsx";
import { resolveSearchRoute } from "../utils/searchResolve.js";
import useInfiniteCatalogData from "../hooks/useInfiniteCatalogData";

export default function CatalogLevelPage({ configKey }) {
    const config = CATALOG_LEVEL_CONFIGS[configKey];
    const { idOrSlug } = useParams();
    const { state } = useLocation();
    const navigate = useNavigate();

    const stateParentKey = { subcategories: "category", products: "subcategory", brands: "genericProduct" }[configKey];
    const stateGrandparentKey = { products: "category", brands: "subcategory" }[configKey];

    const [parent, setParent] = useState(config.isRoot ? null : state?.[stateParentKey] || null);
    const [grandparent] = useState(
        configKey === "brands"
            ? { subcategory: state?.subcategory || null, category: state?.category || null }
            : state?.[stateGrandparentKey] || null
    );

    const parentRef = useRef(parent);
    parentRef.current = parent;

    const fetchPage = async (offset, limit) => {
        let p = parentRef.current;
        if (!config.isRoot && !p) {
            p = await config.lookupParent(idOrSlug);
            setParent(p);
            parentRef.current = p;
        }
        const res = await config.fetchItems(p, { offset, limit });
        if (!res?.success) throw new Error("Request failed");
        return res; // { items, hasMore, nextOffset }
    };

    const { items, loading, loadingMore, error, hasMore, loadMore, retry } =
        useInfiniteCatalogData(fetchPage, [idOrSlug]);

    const [query, setQuery] = useState("");
    const filtered = query.trim()
        ? items.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()))
        : items;

    // Infinite scroll sentinel — starts loading before user hits the very bottom.
    // NOTE: plain IntersectionObserver is unreliable here because Lenis
    // scrolls via CSS transform on a wrapper (with html/body overflow
    // hidden) rather than native window scrolling, so we check the
    // sentinel's position directly on Lenis's own scroll tick instead.
    const sentinelRef = useRef(null);
    useEffect(() => {
        if (query.trim()) return; // don't paginate while client-filtering

        const checkSentinel = () => {
            const el = sentinelRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const buffer = 600; // start loading before it's actually visible
            if (rect.top <= window.innerHeight + buffer) loadMore();
        };

        // Preferred: hook into the app's Lenis instance directly.
        const lenis = window.lenis;
        if (lenis?.on) {
            lenis.on("scroll", checkSentinel);
            checkSentinel(); // in case we land already-scrolled or content is short
            return () => lenis.off?.("scroll", checkSentinel);
        }

        // Fallback if no Lenis instance is found on window: plain scroll/resize.
        window.addEventListener("scroll", checkSentinel, { passive: true });
        window.addEventListener("resize", checkSentinel);
        checkSentinel();
        return () => {
            window.removeEventListener("scroll", checkSentinel);
            window.removeEventListener("resize", checkSentinel);
        };
    }, [loadMore, query]);

    const handleSearchSubmit = async (trimmedQuery) => {
        const route = await resolveSearchRoute(trimmedQuery);
        if (route) navigate(route.pathname, { state: route.state });
        else navigate(`/browse-search?q=${encodeURIComponent(trimmedQuery)}`);
    };

    const openItem = (item) => {
        const { pathname, state } = config.onSelectRoute(item, { parent, grandparent });
        navigate(pathname, { state });
    };

    const title = config.isRoot
        ? "All Categories"
        : config.label.charAt(0).toUpperCase() + config.label.slice(1);
    const titleHref = config.isRoot || !config.upRoute ? null : config.upRoute(grandparent);

    return (
        <div className="mx-auto min-h-screen max-w-7xl px-2.5 pb-10 pt-3 sm:px-4 lg:px-6">
            <CatalogHeader
                title={title}
                titleHref={titleHref}
                subtitle={parent ? `in ${parent.name}` : `${items.length}${hasMore ? "+" : ""} ${config.label}`}
            />

            <div className="mt-4 hidden lg:block">
                <MarketplaceSearchBar value={query} onChange={setQuery} onSubmit={handleSearchSubmit} />
            </div>

            <FilterSortChips />

            <div className="mt-5 overflow-hidden rounded-[24px] border bg-white p-4 sm:p-6" style={{ borderColor: C.hair }}>
                {loading ? (
                    <TileGridSkeleton />
                ) : error ? (
                    <CatalogLoadError onRetry={retry} />
                ) : filtered.length === 0 ? (
                    <p className="py-8 text-center text-[13px] font-medium" style={{ color: C.muted }}>
                        {query ? `No ${config.label} match "${query}".` : `No ${config.label} available yet.`}
                    </p>
                ) : (
                    <>
                        <TileGrid>
                            {filtered.map((item, i) => (
                                <IconTile
                                    key={item.id}
                                    image={item.image}
                                    name={item.name}
                                    idx={i}
                                    count={item[config.itemCountField]}
                                    sub={configKey === "brands" ? item.brand_name : null}
                                    onClick={() => openItem(item)}
                                />
                            ))}
                        </TileGrid>
                        {!query.trim() && hasMore && (
                            <div ref={sentinelRef} className="mt-4 flex justify-center py-4">
                                {loadingMore && <TileGridSkeleton rows={1} />}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}