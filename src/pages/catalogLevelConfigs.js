import {
    searchCatalogCategories,
    searchCatalogSubcategories,
    searchCatalogGenericProducts,
    searchCatalogBrandItems,
} from "../utils/api";
import { LEVEL_ROUTES, ROOT_ROUTE } from "../components/catalog/catalogRoutes";

// Everything that differs between the 4 tile-grid pages lives here.
// CatalogLevelPage.jsx is the only component; this is just data.
//
// IMPORTANT: every fetchItems below must go through the *paginated*
// searchCatalog* helpers (which accept and respect offset/limit and
// return { items, hasMore, nextOffset }). Plain searchCategories /
// searchSubcategories ignore offset entirely, which is why pagination
// previously got stuck after the first page.
export const CATALOG_LEVEL_CONFIGS = {
    categories: {
        level: "category",
        label: "categories",
        isRoot: true,
        fetchItems: (_parent, { offset = 0, limit = 20 } = {}) =>
            searchCatalogCategories("", limit, offset),
        itemCountField: "subcategoryCount",
        onSelectRoute: (item) => ({
            pathname: `/category/${item.slug || item.id}/browse`,
            state: { category: item },
        }),
    },
}