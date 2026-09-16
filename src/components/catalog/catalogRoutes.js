// Single source of truth for "given an entity at level L, where does its
// children-listing page live". Every page that used to hand-write
// `/subcategory/${x.slug||x.id}/products` now calls this instead.
export const ROOT_ROUTE = "/categories";

export const LEVEL_ROUTES = {
    category: (item) => `/category/${item.slug || item.id}/subcategories`,
    subcategory: (item) => `/subcategory/${item.slug || item.id}/products`,
    generic_product: (item) => `/product/${item.slug || item.id}/brands`,
    brand_item: (item) => `/brand-item/${item.slug || item.id}/sellers`,
};