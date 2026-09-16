// utils/searchResolve.js
import { searchHierarchyLevel, searchSmart } from "./api";

// Returns { pathname, state } | null instead of a plain URL string now —
// subcategory and category matches need router state (a ready-made
// hierarchy stack) to land in the right place, not just a path.
function routeForStackTail(stack) {
    const last = stack?.[stack.length - 1];
    if (!last) return null;

    if (last.level === "brand") {
        return { pathname: `/brand/${last.slug || last.id}`, state: null };
    }

    if (last.level === "product") {
        return { pathname: `/product/${last.id}`, state: null };
    }

    // Subcategory match: instead of the old SubcategoryLandingPage, land
    // directly on HierarchySearchPage's product-level drill-down for this
    // subcategory — same pattern used everywhere else in the app (tile
    // grids, breadcrumbs). `stack` here is the full category->subcategory
    // path already returned by the backend.
    if (last.level === "subcategory") {
        return {
            pathname: "/browse-search",
            state: {
                imageResult: {
                    resolved: true,
                    stack: stack.map((s) => ({ id: s.id, name: s.name })),
                },
            },
        };
    }

    // Category match: land on the new icon-tile subcategory browser
    // instead of the old marketing/orientation CategoryLandingPage.
    if (last.level === "category") {
        return {
            pathname: `/category/${last.slug || last.id}/subcategories`,
            state: { category: { id: last.id, name: last.name, slug: last.slug } },
        };
    }

    return null;
}

// does the term match a known brand FAMILY name (e.g. "Castrol"), as
// opposed to one specific brand-item SKU?
function findBrandFamilyMatch(smart, term) {
    const brands = smart?.suggestions?.brands || [];
    const lower = term.trim().toLowerCase();
    const hit = brands.find((b) => (b.brandName || "").trim().toLowerCase() === lower);
    return hit ? hit.brandName : null;
}

export async function resolveSearchRoute(trimmedQuery) {
    if (!trimmedQuery) return null;

    try {
        const scoped = await searchHierarchyLevel("category", undefined, trimmedQuery, 5);
        if (scoped?.success && scoped.items?.length > 0) {
            return null;
        }

        if (trimmedQuery.length >= 2) {
            const smart = await searchSmart(trimmedQuery, 5);

            const familyBrandName = findBrandFamilyMatch(smart, trimmedQuery);
            if (familyBrandName) {
                return { pathname: `/brand-family/${encodeURIComponent(familyBrandName)}`, state: null };
            }

            const exactStack = smart?.success ? smart.exact?.stack : null;
            const route = routeForStackTail(exactStack);
            if (route) return route;
        }
    } catch {
        // any lookup failure -> fall through to /browse, same as before
    }
    return null;
}

export async function performSearchNavigation(navigate, rawQuery) {
    const term = rawQuery.trim();
    if (!term) return false;
    const route = await resolveSearchRoute(term);
    if (route) {
        navigate(route.pathname, { state: route.state });
        return true;
    }
    // No confident match — caller stays on the current page and handles
    // showing fallback results inline instead of being redirected.
    return false;
}