// src/components/admin/CascadingHierarchyPicker.jsx
import { useState, useEffect } from "react";
import SingleLevelDropdown from "./SingleLevelDropdown.jsx";

// entityLevel: "subcategory" | "product" | "brand" | "generic_product" | "brand_item"
// — how deep this entity sits. Renders Category [+ Subcategory [+ third rung]]
// dropdowns as needed, prefilled from `ancestors`. Changing a rung clears
// everything below it. Reports the final chain up via
// onChange({ category, subcategory, product }).
//
// NOTE: the third rung is used for two different real tables depending on
// entityLevel:
//   - entityLevel === "brand"      -> parent is an hs_products row
//   - entityLevel === "brand_item" -> parent is an hs_generic_products row
// These are NOT the same table, so the pickerLevel passed to
// SingleLevelDropdown (and therefore the backend PICKER_CONFIG key it hits)
// must vary accordingly. Previously this was hardcoded to "product" for
// both cases, which silently created/matched rows in hs_products even when
// mapping a brand_item — see PICKER_CONFIG in adminCatalog.controller.js,
// which now has a matching "generic_product" entry.
export default function CascadingHierarchyPicker({ token, entityLevel, ancestors, onChange }) {
    const [category, setCategory] = useState(ancestors?.category || null);
    const [subcategory, setSubcategory] = useState(ancestors?.subcategory || null);
    const [product, setProduct] = useState(ancestors?.product || null);
    // Only one rung's panel can be open across the whole picker at a time —
    // opening one closes whichever other one was open.
    const [openLevel, setOpenLevel] = useState(null);

    useEffect(() => {
        onChange({ category, subcategory, product });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category, subcategory, product]);

    const showSubcategory = entityLevel === "product" || entityLevel === "brand" || entityLevel === "generic_product" || entityLevel === "brand_item";
    const showProduct = entityLevel === "brand" || entityLevel === "brand_item";

    // The third rung targets a different table depending on entityLevel:
    // hs_products for "brand", hs_generic_products for "brand_item".
    const thirdRungPickerLevel = entityLevel === "brand_item" ? "generic_product" : "product";
    const thirdRungLabel = entityLevel === "brand_item" ? "Generic Product" : "Product";

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SingleLevelDropdown
                token={token} pickerLevel="category" parentId={null}
                value={category} label="Category"
                open={openLevel === "category"}
                onOpenChange={(v) => setOpenLevel(v ? "category" : null)}
                onChange={(id, name) => { setCategory({ id, name }); setSubcategory(null); setProduct(null); }}
            />
            {showSubcategory && (
                <SingleLevelDropdown
                    token={token} pickerLevel="subcategory" parentId={category?.id}
                    value={subcategory} label="Subcategory" disabled={!category}
                    open={openLevel === "subcategory"}
                    onOpenChange={(v) => setOpenLevel(v ? "subcategory" : null)}
                    onChange={(id, name) => { setSubcategory({ id, name }); setProduct(null); }}
                />
            )}
            {showProduct && (
                <SingleLevelDropdown
                    token={token} pickerLevel={thirdRungPickerLevel} parentId={subcategory?.id}
                    value={product} label={thirdRungLabel} disabled={!subcategory}
                    open={openLevel === "product"}
                    onOpenChange={(v) => setOpenLevel(v ? "product" : null)}
                    onChange={(id, name) => setProduct({ id, name })}
                />
            )}
        </div>
    );
}