// components/seller/listingForm/SellerListingForm.jsx — RESTYLED
//
// Visual pass to match the Home / SellerManageListingsPage language:
// same C tokens, compact caption labels, rounded-2xl section cards,
// responsive grids that reflow at every breakpoint instead of just
// desktop, tighter vertical rhythm, and a sticky footer that mirrors
// the "Sync" pill + progress affordance used elsewhere.
//
// Also fixes a prop-name mismatch with the caller (SellPublishProductPage):
// this component previously only accepted `identityLocked` / `lockedIdentity`
// and never read `initialValues`, so the edit route never prefilled the
// form. Now accepts `mode`, `identityReadOnly`, `brandDisplay`, and
// `initialValues` (aliases kept for back-compat).
//
// BUGFIX (earlier pass): `moq` and `stock_quantity` are both persisted on
// the backend in the listing's canonical SALE UNIT — Master Pack when
// the listing has an outer pack (units_per_master_pack >= 2), Pack
// otherwise (see the backend controller's toListingRow(), which tags
// both fields "already sale-unit qty"). Both are fixed by routing stock
// through the actual sale unit (not literal Packs), and by no longer
// re-deriving MOQ on load since it already arrives in the unit the field
// expects.
//
// UX pass: two fixes to the section-card behaviour.
//   1. All sections now start collapsed by default (openSection inits null).
//   2. Opening a section scrollIntoView's it to the top of the viewport
//      once the collapse/expand animation settles (handleSectionToggle),
//      same anchor pattern jumpToError uses for validation errors.
//
// PREVIOUS PASS: two more UX fixes.
//   1. KEYBOARD FLOW — pressing Enter inside any text field jumps focus
//      to the next incomplete required field (opening its section and
//      scrolling it into view if needed), and pressing Enter on the LAST
//      remaining required field submits the form, same as tapping the
//      submit button.
//   2. DRAG & DROP for product images — the image-picker area also
//      accepts a drag-and-drop of image files, isolated from the
//      separate certificates dropzone in FormPrimitives.jsx.
//
// THIS PASS: two real bugfixes to the above.
//   1. "Next field" was always computed as "the first missing field in a
//      fixed global list", NOT "the next missing field relative to where
//      the seller currently is". That meant: (a) Tab/Enter inside a later
//      section, with an earlier section still incomplete, always yanked
//      focus back to that earlier section instead of continuing forward
//      in the current one; and (b) Shift+Tab never actually went
//      backward, because the direction argument was silently dropped at
//      every call site. Fixed by introducing a canonical FIELD_ORDER
//      (mirrors the actual on-page top-to-bottom order) and rewriting
//      handleFieldAdvance to search forward/backward from the field that
//      was just interacted with, only wrapping around when nothing is
//      left ahead/behind — and by threading the real "forward"/"backward"
//      argument through every onEnterKey call site instead of discarding it.
//   2. Drag-and-drop hardening — a window-level dragover/drop guard now
//      prevents the browser's default "navigate the tab to this file"
//      behavior for any drop that lands outside both dropzones (a few
//      pixels off target, or a drop that happens mid-re-render), and a
//      window-level dragend listener force-resets the image dropzone's
//      highlight state so it can never get stuck "on" the way it could
//      before if a drag was abandoned without a clean dragleave.
import { useEffect, useMemo, useState, useRef } from "react";
import {
    Package, IndianRupee, Boxes, Truck, FileText,
    Loader2, CheckCircle2, AlertTriangle, ImagePlus,
    Info, Pencil, UploadCloud
} from "lucide-react";
import { useAuth } from "../../../context/AuthContext.jsx";
import { uploadSellerFile } from "../../../utils/api.js";
import { fetchCommissionInfo, fetchDefaultListingTemplates, lookupPincode, findBrandItemMatch } from "../../../utils/sellerListingApi.js";
import {
    C, TextField, TextAreaField, SelectField, ToggleField, ChipToggleGroup, RepeatableRows,
    SectionCard, Progress,
    ToggleField2,
    TextField2,
    TextFieldWithUnitSelect,
    ToggleField3,
    RepeatableRows2,
    Label,
    CertificateUploadField,
} from "./FormPrimitives.jsx";
import BrandCombobox from "./BrandCombobox.jsx";
import DispatchingLocationsPicker from "./DispatchingLocationsPicker.jsx";
import PolicySelect from "./PolicySelect.jsx";

// const FONT_BODY = "'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Public Sans', Roboto, sans-serif";

const UNITS = ["Pieces", "Kg", "Grams", "Litres", "Millilitres", "Dozen", "Tons"];

const GST_OPTIONS = [0, 0.25, 3, 5, 12, 18, 28];
const PRICE_BASIS_OPTIONS = [
    { value: "per_pack", label: "Per pack" },
    { value: "per_master_pack", label: "Per master pack" },
];

export const DEFAULT_LISTING_FORM = {
    productName: "",
    brandName: "", brandImage: null, brandNotApplicable: false,
    images: [],
    qualityCertificates: [],
    noteToAdmin: "",

    unit: "", packSize: "", hasOuterPack: null, masterPackSize: "0",
    brandItemMatch: null,
    hsnCode: "", gstPercent: "",

    basePrice: "", priceBasis: "per_pack", gstInclusive: null,
    freightIncluded: null,

    sampleAvailable: null, sampleQuantity: "", sampleUnitBasis: "per_unit", // was "per_pack"

    priceSlabs: [],

    stockType: null, stockQuantity: "", stockQuantityBasis: "per_pack", productionLeadTimeDays: "",
    moq: "",
    dispatchDistrict: "", dispatchState: "",

    dispatchPincode: "",
    dispatchingLocations: null,

    returnPolicyKey: "", warrantyKey: "",
};

// Maps each section to the field keys computeMissing() can flag for it —
// lets the header show a live "X left" count without opening the section.
const SECTION_FIELD_MAP = {
    product: ["productName", "brandName", "images"],
    packaging: ["unit", "packSize", "hasOuterPack", "masterPackSize", "moq", "sampleAvailable", "sampleQuantity"],
    pricing: ["gstPercent", "gstInclusive", "basePrice", "freightIncluded"],
    fulfilment: ["stockType", "stockQuantity", "productionLeadTimeDays"],
    terms: ["returnPolicyKey", "warrantyKey"],
    delivery: ["dispatchingLocations"],
};

const FIELD_TO_SECTION = Object.entries(SECTION_FIELD_MAP).reduce((acc, [section, fields]) => {
    fields.forEach((f) => { acc[f] = section; });
    return acc;
}, {});

FIELD_TO_SECTION["stockTypeAmount"] = "fulfilment";

// Canonical top-to-bottom field order — mirrors the ACTUAL on-page order
// the sections render in (Product → Packaging → Pricing → Fulfilment →
// Terms → Delivery), and each field's order within its own section. This
// is the single source of truth for "what comes next" when a seller
// presses Enter/Tab, so keyboard flow always continues from wherever the
// seller currently is instead of snapping back to the first incomplete
// field anywhere on the form. If a field is ever reordered on the page,
// update its position here too so the two stay in sync.
const FIELD_ORDER = [
    // Product
    "productName", "brandName", "images",
    // Packaging
    "unit", "packSize", "hasOuterPack", "masterPackSize", "moq", "sampleAvailable", "sampleQuantity",
    // Pricing
    "gstPercent", "basePrice", "gstInclusive", "freightIncluded",
    // Fulfilment
    "stockType", "stockQuantity", "productionLeadTimeDays",
    // Terms
    "returnPolicyKey", "warrantyKey",
    // Delivery
    "dispatchingLocations",
];

// stockTypeAmount has no DOM field of its own (see computeMissing) — for
// ordering purposes it should sit wherever stockType sits.
function orderKeyFor(key) {
    return key === "stockTypeAmount" ? "stockType" : key;
}

// Dynamic MOQ label/hint — mirrors whichever basis the seller is
// currently thinking in. When there's an outer pack, MOQ is asked for in
// Master Packs (the unit sellers actually reason in for bulk orders);
// otherwise it's asked in Packs, same as before. The underlying form
// value is converted to Packs at submit time regardless — see
// handleSubmit — since that's the unit the backend always expects.
function getMoqLabel(hasOuterPack) {
    return hasOuterPack ? "Minimum Order Quantity in Master Packs" : "Minimum Order Quantity in Packs";
}
function getMoqHint(hasOuterPack) {
    return hasOuterPack
        ? "Minimum number of Master Packs a buyer must order"
        : "Minimum number of Packs a buyer must order";
}

function round2ToInt(n) {
    return Math.max(1, Math.round(Number(n) || 0));
}

function getUnitBasisOptions(hasOuterPack, unit) {
    const opts = [
        { value: "per_unit", label: unit || "Unit" },
        { value: "per_pack", label: "Pack" },
    ];
    if (hasOuterPack) opts.push({ value: "per_master_pack", label: "Master Pack" });
    return opts;
}

function unitBasisLabel(basis, unit) {
    if (basis === "per_pack") return "Pack";
    if (basis === "per_master_pack") return "Master Pack";
    return unit || "Unit";
}

// Inverse of the flatten step in handleSubmit — converts the persisted flat
// dispatchingLocations array (the shape it's actually stored/submitted in)
// back into the {country, mode, excludedStates, citiesByState, includedStates,
// includedCitiesByState} shape form state and the picker expect. Without this,
// autofill silently fails computeMissing (array has no .country) until the
// picker mounts and its own "no country" fallback resets everything to a
// blank all-India default — which is what was masquerading as "autofill only
// works after opening the section."
export function unflattenDispatchingLocations(flat) {
    if (!Array.isArray(flat) || !flat.length) return null;
    const countryEntry = flat.find((e) => e?.type === "country");
    if (!countryEntry) return null;

    const country = { name: countryEntry.name, code: countryEntry.code };
    const stateEntries = flat.filter((e) => e?.type === "state");

    if (countryEntry.includeOnly) {
        const includedStates = stateEntries.map((s) => s.name);
        const includedCitiesByState = {};
        stateEntries.forEach((s) => {
            if (s.includedCities !== undefined) includedCitiesByState[s.name] = s.includedCities;
        });
        return { country, mode: "include", excludedStates: [], citiesByState: {}, includedStates, includedCitiesByState };
    }

    const excludedStates = countryEntry.excludedStates || [];
    const citiesByState = {};
    stateEntries.forEach((s) => {
        if (s.excludedCities !== undefined) citiesByState[s.name] = s.excludedCities;
    });
    return { country, mode: "exclude", excludedStates, citiesByState, includedStates: [], includedCitiesByState: {} };
}

// Display-only: how many Packs the current MOQ (in sale units) works out
// to, when the listing has an outer pack. Purely derived — never stored,
// never fed back into moq itself.
function moqSaleUnitsToPacks(saleUnitQty, hasOuterPack, masterPackSize) {
    const master = Number(masterPackSize) > 0 ? Number(masterPackSize) : 1;
    return hasOuterPack ? Number(saleUnitQty) * master : Number(saleUnitQty);
}

// sample_quantity is stored in base Units on the backend.
function toBaseUnitsFromBasis(basis, qty, packSize, masterPackSize) {
    const q = Number(qty) || 0;
    const pack = Number(packSize) > 0 ? Number(packSize) : 1;
    const master = Number(masterPackSize) > 0 ? Number(masterPackSize) : 1;
    if (basis === "per_pack") return q * pack;
    if (basis === "per_master_pack") return q * pack * master;
    return q; // per_unit
}
function fromBaseUnitsToBasis(basis, baseUnits, packSize, masterPackSize) {
    const pack = Number(packSize) > 0 ? Number(packSize) : 1;
    const master = Number(masterPackSize) > 0 ? Number(masterPackSize) : 1;
    if (basis === "per_pack") return baseUnits / pack;
    if (basis === "per_master_pack") return baseUnits / (pack * master);
    return baseUnits; // per_unit
}

// stock_quantity is stored on the backend as the listing's canonical
// SALE UNIT quantity — Master Pack when the listing has an outer pack
// (masterPackSize > 1), Pack otherwise. It is NOT always literal Packs.
// Routing through base units and then through whichever unit is ACTUALLY
// the sale unit keeps this in lockstep with how `moq` is handled
// everywhere else on this page.
function saleUnitSizeInBaseUnits(packSize, masterPackSize) {
    const pack = Number(packSize) > 0 ? Number(packSize) : 1;
    const master = Number(masterPackSize) > 0 ? Number(masterPackSize) : 1;
    return Number(masterPackSize) > 1 ? pack * master : pack;
}
function toSaleUnitQtyFromBasis(basis, qty, packSize, masterPackSize) {
    const baseUnits = toBaseUnitsFromBasis(basis, qty, packSize, masterPackSize);
    return baseUnits / saleUnitSizeInBaseUnits(packSize, masterPackSize);
}
function fromSaleUnitQtyToBasis(basis, saleUnitQty, packSize, masterPackSize) {
    const baseUnits = (Number(saleUnitQty) || 0) * saleUnitSizeInBaseUnits(packSize, masterPackSize);
    return fromBaseUnitsToBasis(basis, baseUnits, packSize, masterPackSize);
}

// New helper functions — dynamic labels for Pack size / Master pack size
// based on the currently selected Unit. Falls back to generic wording
// when no unit is selected yet.
function getPackSizeLabel(unit) {
    return unit ? `How many ${unit} in a Pack?` : "Pack size";
}
function getPackSizeHint(unit) {
    return unit
        ? `How many ${unit} make up 1 Pack (e.g. 1 Pack = 10 ${unit})`
        : "How many Units make up 1 Pack (e.g. 1 Pack = 10 Pieces)";
}
function getMasterPackSizeLabel(unit) {
    return "How many Packs in a Master Pack"; // unit doesn't change this one, kept as its own function for symmetry/future tweaks
}
function getMasterPackSizeHint() {
    return "How many Packs make up 1 Master Pack (e.g. 1 Master Pack = 5 Packs)";
}

// Converts whatever single (price, basis) pair is currently stored into
// all three display values — per unit, per pack, per master pack — so
// the three price fields can always show a consistent, derived view of
// the same underlying number. Mirrors normalizeEnteredPrice's basis
// handling, but purely for display (GST/commission untouched here).
function computeThreeTierPrices(basis, rawPrice, packSize, masterPackSize) {
    const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
    const price = Number(rawPrice) || 0;
    const pack = Number(packSize) > 0 ? Number(packSize) : 1;
    const master = Number(masterPackSize) > 0 ? Number(masterPackSize) : 1;

    let perUnit, perPack, perMaster;
    if (basis === "per_unit") {
        perUnit = price;
        perPack = price * pack;
        perMaster = perPack * master;
    } else if (basis === "per_master_pack") {
        perMaster = price;
        perPack = price / master;
        perUnit = perPack / pack;
    } else {
        // per_pack (default)
        perPack = price;
        perUnit = price / pack;
        perMaster = price * master;
    }

    return { perUnit: round2(perUnit), perPack: round2(perPack), perMaster: round2(perMaster) };
}

// Fields hidden outright when the product is a locked catalog match
// (brandItemMatch set) — these get replaced by the read-only "Fixed by
// this product" summary, so they should never be counted at all.
const LOCKED_WHEN_MATCHED_FIELDS = ["unit", "packSize", "hasOuterPack", "masterPackSize"];

const CONDITIONAL_FIELD_VISIBILITY = {
    masterPackSize: (f) => !f.brandItemMatch && f.hasOuterPack === true,
    sampleQuantity: (f) => f.sampleAvailable === true,
};


// Mutually-exclusive field groups — exactly one of these will end up being
// required once the controlling choice is made, so for COUNTING purposes
// this should always contribute exactly 1 to the total, whether or not the
// controlling field has been picked yet. Keyed by the controlling field.
const EXCLUSIVE_FIELD_GROUPS = {
    stockType: ["stockQuantity", "productionLeadTimeDays"],
};

function isFieldVisible(key, form) {
    if (LOCKED_WHEN_MATCHED_FIELDS.includes(key) && form.brandItemMatch) return false;
    const check = CONDITIONAL_FIELD_VISIBILITY[key];
    return check ? check(form) : true;
}

function totalForSection(fields, form) {
    let total = 0;
    const consumedGroups = new Set();

    fields.forEach((key) => {
        const groupEntry = Object.entries(EXCLUSIVE_FIELD_GROUPS).find(
            ([, members]) => members.includes(key)
        );
        if (groupEntry) {
            const [controllerKey] = groupEntry;
            if (!consumedGroups.has(controllerKey)) {
                consumedGroups.add(controllerKey);
                total += 1;
            }
            return;
        }

        if (isFieldVisible(key, form)) total += 1;
    });

    return total;
}

function computeMissing(form) {
    const missing = [];
    const add = (cond, key, label) => { if (cond) missing.push({ key, label }); };

    add(!form.productName?.trim(), "productName", "Product name");
    add(!form.brandNotApplicable && !form.brandName?.trim(), "brandName", "Brand");
    add(!form.images?.length, "images", "Product image");

    if (!form.brandItemMatch) {
        add(!form.unit, "unit", "Unit");
        add(!(Number(form.packSize) > 0), "packSize", "Pack size");
        add(form.hasOuterPack == null, "hasOuterPack", "Outer pack");
        add(form.hasOuterPack && !(Number(form.masterPackSize) >= 2), "masterPackSize", "Master pack size");
    }

    add(!(Number(form.moq) > 0), "moq", "MOQ");
    add(form.sampleAvailable == null, "sampleAvailable", "Sample availability");
    add(form.gstPercent === "" || form.gstPercent == null, "gstPercent", "GST %");
    add(form.gstInclusive == null, "gstInclusive", "Price includes GST");
    add(!(Number(form.basePrice) > 0), "basePrice", "Base price");
    add(form.freightIncluded == null, "freightIncluded", "Freight included");
    add(form.sampleAvailable && !(Number(form.sampleQuantity) > 0), "sampleQuantity", "Sample quantity");
    add(!form.stockType, "stockType", "Fulfilment type");

    // When stockType hasn't been picked yet, the second slot (stock qty /
    // lead time) is unknowable too — it should count as missing, not as
    // "not applicable yet". Without this, filled = total - missing looks
    // like 1/2 the instant the section renders, before anything is chosen.
    if (!form.stockType) {
        add(true, "stockTypeAmount", "Stock or lead time");
    } else {
        add(form.stockType === "ready_stock" && (form.stockQuantity === "" || form.stockQuantity == null), "stockQuantity", "Available stock");
        add(form.stockType === "made_to_order" && (form.productionLeadTimeDays === "" || form.productionLeadTimeDays == null), "productionLeadTimeDays", "Lead time");
    }
    add(!form.dispatchingLocations?.country, "dispatchingLocations", "Dispatching locations");
    add(!form.returnPolicyKey, "returnPolicyKey", "Return / replacement policy");
    add(!form.warrantyKey, "warrantyKey", "Warranty");

    return missing;
}

function FieldAnchor({ fieldKey, children }) {
    return <div id={`field-${fieldKey}`} className="min-w-0 rounded-xl transition-shadow">{children}</div>;
}

function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Finds the highest-threshold discount slab the given quantity (in Packs)
// clears. Slabs are always stored with minQty in Packs — see
// packSlabsToDisplay/displaySlabsToPacks — so this never needs to know
// whether the seller is currently viewing them in Packs or Master Packs.
function getApplicableSlab(slabsInPacks, qtyPacks) {
    const eligible = (slabsInPacks || []).filter(
        (s) => Number(s.minQty) > 0 && Number(s.discountPercent) > 0 && qtyPacks >= Number(s.minQty)
    );
    if (!eligible.length) return null;
    return eligible.reduce((best, s) => (Number(s.minQty) > Number(best.minQty) ? s : best));
}

export default function SellerListingForm({
    onSubmit, submitting, submitLabel = "Submit",
    mode = "create", identityReadOnly, brandDisplay, initialValues,
    identityLocked, lockedIdentity,
    stickyBottomClassName = "-bottom-1 md:bottom-0", // default (page/edit route)
    readOnly = false,        // NEW — renders the whole form non-interactive
    onEdit,                  // NEW — footer "Edit this listing" callback when readOnly
    onClose,                 // NEW — footer "Close" callback when readOnly
}) {
    const locked = identityReadOnly ?? identityLocked ?? mode === "edit";
    const identity = brandDisplay ?? lockedIdentity;

    const { token } = useAuth();
    const [form, setForm] = useState(() => {
        const base = {
            ...DEFAULT_LISTING_FORM,
            ...(initialValues || {}),
            ...(locked ? {
                productName: initialValues?.productName ?? identity?.name ?? identity?.productName ?? "",
                brandName: initialValues?.brandName ?? identity?.brandName ?? "",
                brandNotApplicable: !(initialValues?.brandName ?? identity?.brandName),
                images: initialValues?.images?.length ? initialValues.images : (identity?.image ? [identity.image] : []),
            } : {}),
        };

        if (initialValues?.masterPackSize !== undefined) {
            base.hasOuterPack = Number(base.masterPackSize) > 1;
            if (!base.hasOuterPack) base.masterPackSize = "0";
        }

        // NOTE: incoming moq (from initialValues / backend) already arrives
        // in the listing's canonical SALE UNIT — Master Packs when this
        // listing has an outer pack, Packs otherwise — which is exactly
        // the unit the MOQ field above is labeled in (see getMoqLabel).
        // No conversion is needed here.

        if (locked) {
            const hasPackaging = base.unit && Number(base.packSize) > 0;

            base.brandItemMatch = hasPackaging
                ? {
                    id: initialValues?.brandItemMatch?.id ?? initialValues?.genericProductBrandId ?? null,
                    unit: base.unit,
                    packSize: base.packSize,
                    masterPackSize: base.masterPackSize,
                }
                : null;
        }

        return base;
    });

    const [uploadingImage, setUploadingImage] = useState(false);
    const [commissionPercent, setCommissionPercent] = useState(2.5);
    const [error, setError] = useState(null);
    const [touched, setTouched] = useState({});
    const [checkingBrandMatch, setCheckingBrandMatch] = useState(false);

    // Drag state for the product-images dropzone. dragCounter tracks
    // nested dragenter/dragleave pairs (a drag over child elements fires
    // both) so the highlight doesn't flicker while dragging around inside
    // the zone.
    const [imageDragActive, setImageDragActive] = useState(false);
    const imageDragCounter = useRef(0);

    // All sections start collapsed. Only one section open at a time —
    // opening one closes any other that was open (see handleSectionToggle
    // below, which also handles scrolling the newly-opened section into view).
    const [openSection, setOpenSection] = useState(null);

    // Opening a section while a different section is currently open causes
    // that other section to collapse (shrinking) at the same time this one
    // expands (growing) — the net effect on scroll position is unpredictable,
    // which is what caused the "UI jump" (newly opened section landing
    // half off-screen, or the page appearing not to have moved at all).
    // Instead of leaving the browser's default scroll-anchoring to sort it
    // out, we explicitly scroll the newly-opened section's card to the top
    // of the viewport once the collapse/expand motion has settled — same
    // "wait for the animation, then scrollIntoView" approach jumpToError
    // already uses below for validation errors. From there the section is
    // just normally scrollable downward as usual.
    //
    // `opening` mirrors the boolean SectionCard's onOpenChange passes:
    // true = "open this section" (SectionCard's toggle called with the
    // section not currently open), false = "close this section" (seller
    // clicked the currently-open section's own header/chevron again).
    // Height of whatever sticky/fixed header sits above this page's content.
    // Adjust the selector to whatever your actual site header element is.
    const STICKY_HEADER_OFFSET = 64; // px — swap for a measured value if it can vary

    const handleSectionToggle = (key, opening) => {
        const wasAlreadyOpenElsewhere = openSection && openSection !== key;
        setOpenSection(opening ? key : null);
        if (!opening) return;

        setTimeout(() => {
            const target = document.getElementById(`section-${key}`);
            if (!target) return;

            const rect = target.getBoundingClientRect();
            const headerEl = document.querySelector("header"); // or whatever selector matches your actual header
            const headerOffset = headerEl ? headerEl.getBoundingClientRect().height : STICKY_HEADER_OFFSET;
            const viewportHeight = window.innerHeight;

            // Only snap if the section doesn't already fit entirely within the
            // visible area below the header. If it's already fully in view
            // (top not hidden behind the header, bottom not past the fold),
            // leave the scroll position alone — no need to move anything.
            const fitsAlready = rect.top >= headerOffset && rect.bottom <= viewportHeight;
            if (fitsAlready) return;

            const currentScrollY = window.scrollY;
            const targetY = currentScrollY + rect.top - headerOffset - 8; // small breathing-room buffer

            window.scrollTo({ top: targetY, behavior: "smooth" });
        }, wasAlreadyOpenElsewhere ? 260 : 0);
    };

    const missing = useMemo(() => computeMissing(form), [form]);
    const missingKeys = useMemo(() => new Set(missing.map((m) => m.key)), [missing]);
    const isErr = (key) => touched[key] && missingKeys.has(key);
    const totalRequired = useMemo(() => computeMissing(DEFAULT_LISTING_FORM).length, []);
    const percentComplete = totalRequired > 0 ? Math.round(((totalRequired - missing.length) / totalRequired) * 100) : 100;

    const missingCountBySection = useMemo(() => {
        const counts = Object.fromEntries(Object.keys(SECTION_FIELD_MAP).map((k) => [k, 0]));
        missing.forEach((m) => {
            const section = FIELD_TO_SECTION[m.key];
            if (section) counts[section] += 1;
        });
        return counts;
    }, [missing]);

    const totalCountBySection = useMemo(
        () => Object.fromEntries(
            Object.entries(SECTION_FIELD_MAP).map(([section, fields]) => [
                section,
                totalForSection(fields, form),
            ])
        ),
        [form]
    );

    const changeSampleBasis = (newBasis) => {
        setForm((f) => {
            const baseUnits = toBaseUnitsFromBasis(f.sampleUnitBasis, f.sampleQuantity, f.packSize, f.masterPackSize);
            const display = fromBaseUnitsToBasis(newBasis, baseUnits, f.packSize, f.masterPackSize);
            return { ...f, sampleUnitBasis: newBasis, sampleQuantity: f.sampleQuantity !== "" ? String(round2(display)) : f.sampleQuantity };
        });
    };
    const changeStockBasis = (newBasis) => {
        setForm((f) => {
            const saleUnitQty = toSaleUnitQtyFromBasis(f.stockQuantityBasis, f.stockQuantity, f.packSize, f.masterPackSize);
            const display = fromSaleUnitQtyToBasis(newBasis, saleUnitQty, f.packSize, f.masterPackSize);
            return { ...f, stockQuantityBasis: newBasis, stockQuantity: f.stockQuantity !== "" ? String(round2(display)) : f.stockQuantity };
        });
    };

    useEffect(() => {
        if (!form.hasOuterPack && form.sampleUnitBasis === "per_master_pack") changeSampleBasis("per_unit");
        if (!form.hasOuterPack && form.stockQuantityBasis === "per_master_pack") changeStockBasis("per_pack");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.hasOuterPack]);

    // const [pincodeStatus, setPincodeStatus] = useState(null); // 'checking' | 'ok' | 'error' | null

    // const confirmPincode = async () => {
    //     if (!/^\d{6}$/.test(form.dispatchPincode)) return;
    //     setPincodeStatus("checking");
    //     const res = await lookupPincode(form.dispatchPincode);
    //     if (res?.success) {
    //         setForm((f) => ({ ...f, dispatchDistrict: res.district, dispatchState: res.state }));
    //         setPincodeStatus("ok");
    //     } else {
    //         setPincodeStatus("error");
    //     }
    // };

    // Whenever productName / brandName / brandNotApplicable settle, check
    // whether this exact product+brand already exists in the catalog. If
    // it does, its packaging (unit/packSize/masterPackSize) is fixed and
    // the seller no longer needs to (or can) enter their own — see the
    // "Packaging & tax" section below.
    useEffect(() => {
        if (locked) return; // edit mode already has fixed identity + packaging
        const productName = form.productName?.trim();
        const brandName = form.brandName?.trim();
        const brandNotApplicable = form.brandNotApplicable;

        if (!productName || productName.length < 2 || (!brandNotApplicable && !brandName)) {
            setForm((f) => (f.brandItemMatch ? { ...f, brandItemMatch: null } : f));
            return;
        }

        setCheckingBrandMatch(true);
        const t = setTimeout(async () => {
            const res = await findBrandItemMatch(token, { productName, brandName, brandNotApplicable });
            setCheckingBrandMatch(false);
            if (!res?.success) return;
            setForm((f) => {
                // Guard against a stale response landing after the seller
                // changed the fields again mid-flight.
                if (f.productName?.trim() !== productName || f.brandName?.trim() !== brandName || f.brandNotApplicable !== brandNotApplicable) return f;
                if (res.match) {
                    const matchHasOuterPack = Number(res.match.masterPackSize) > 1;
                    return {
                        ...f,
                        brandItemMatch: res.match,
                        unit: res.match.unit,
                        packSize: String(res.match.packSize),
                        hasOuterPack: matchHasOuterPack,
                        masterPackSize: matchHasOuterPack ? String(res.match.masterPackSize) : "1",
                    };
                }
                // No match — clear any previously-locked packaging so the
                // seller can enter their own for this brand-new product.
                return f.brandItemMatch ? { ...f, brandItemMatch: null } : f;
            });
        }, 400);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.productName, form.brandName, form.brandNotApplicable, locked, token]);

    const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));
    const touch = (key) => setTouched((t) => (t[key] ? t : { ...t, [key]: true }));

    useEffect(() => { fetchCommissionInfo().then((res) => { if (res?.success) setCommissionPercent(res.commissionPercent); }); }, []);

    // Prefill defaults from the seller's last submission — now covers delivery,
    // tax/legal, and commercial-terms groups (see GROUP_FIELD_MAP on the
    // backend), not just dispatch info. Product-specific fields (name, brand,
    // images, unit/packSize/masterPackSize, price, stock, MOQ) are deliberately
    // NOT prefilled — those are always specific to the new item being listed.
    useEffect(() => {
        if (!token || mode === "edit") return;
        fetchDefaultListingTemplates(token).then((res) => {
            if (!res?.success) return;
            const d = res.defaults || {};
            const delivery = d.delivery?.data || {};
            const taxLegal = d.tax_legal?.data || {};
            const commercial = d.commercial_terms?.data || {};

            // Stored as the flat array (see handleSubmit) — unflatten before
            // merging into form state, otherwise it's the wrong shape for both
            // computeMissing and the picker.
            const restoredDispatchingLocations = Array.isArray(delivery.dispatchingLocations)
                ? unflattenDispatchingLocations(delivery.dispatchingLocations)
                : delivery.dispatchingLocations; // already object-shaped from some other source — pass through

            setForm((f) => ({
                ...f,
                dispatchPincode: delivery.dispatchPincode ?? f.dispatchPincode,
                dispatchingLocations: restoredDispatchingLocations ?? f.dispatchingLocations,
                returnPolicyKey: taxLegal.returnPolicyKey ?? f.returnPolicyKey,
                warrantyKey: taxLegal.warrantyKey ?? f.warrantyKey,
            }));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, mode]);

    // Live price preview — mirrors normalizeEnteredPrice on the backend.
    //
    // Two modes, driven by "Price includes GST?":
    // - Inclusive: the price the seller types is the ceiling — exactly what the
    //   buyer should pay. GST% and commission% are both reverse-calculated OUT
    //   of it together (as a combined % of the base), instead of commission
    //   being stacked on top afterward. So finalPricePerUnit === entered price.
    // - Exclusive: entered price is the base as-is, GST + commission are both
    //   added on top for the buyer (unchanged).
    const pricePreview = useMemo(() => {
        const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
        const price = Number(form.basePrice) || 0;
        const gst = Number(form.gstPercent) || 0;
        const pack = Number(form.packSize) > 0 ? Number(form.packSize) : 1;
        const master = Number(form.masterPackSize) > 0 ? Number(form.masterPackSize) : 1;
        const saleUnitSize = form.hasOuterPack ? pack * master : pack;

        let perBaseUnit = price;
        if (form.priceBasis === "per_pack") perBaseUnit = price / pack;
        if (form.priceBasis === "per_master_pack") perBaseUnit = price / (pack * master);
        const perSaleUnit = perBaseUnit * saleUnitSize;

        let basePricePerSaleUnit, gstAmount, subtotalAfterGst;
        if (form.gstInclusive) {
            subtotalAfterGst = round2(perSaleUnit);
            basePricePerSaleUnit = round2(subtotalAfterGst / (1 + gst / 100));
            gstAmount = round2(subtotalAfterGst - basePricePerSaleUnit);
        } else {
            basePricePerSaleUnit = round2(perSaleUnit);
            gstAmount = round2(basePricePerSaleUnit * (gst / 100));
            subtotalAfterGst = round2(basePricePerSaleUnit + gstAmount);
        }

        const commissionAmount = round2(subtotalAfterGst * (commissionPercent / 100));
        const finalPricePerSaleUnit = round2(subtotalAfterGst + commissionAmount);

        return { basePricePerSaleUnit, gstPercent: gst, gstAmount, subtotalAfterGst, commissionPercent, commissionAmount, finalPricePerSaleUnit };
    }, [form.basePrice, form.gstPercent, form.packSize, form.masterPackSize, form.hasOuterPack, form.gstInclusive, form.priceBasis, commissionPercent]);

    const moqPreview = useMemo(() => {
        const moqSaleUnits = Number(form.moq) || 1; // already sale-unit qty
        const pack = Number(form.packSize) > 0 ? Number(form.packSize) : 1;
        const master = Number(form.masterPackSize) > 0 ? Number(form.masterPackSize) : 1;
        const gst = Number(form.gstPercent) || 0;

        const totalUnits = round2(form.hasOuterPack ? moqSaleUnits * master * pack : moqSaleUnits * pack);
        const grossSubtotal = round2(pricePreview.basePricePerSaleUnit * moqSaleUnits);

        const slab = getApplicableSlab(form.priceSlabs, moqSaleUnits); // minQty already sale-unit qty, no conversion
        const discountPercent = slab ? Number(slab.discountPercent) : 0;
        const discountAmount = round2(grossSubtotal * (discountPercent / 100));
        const netSubtotal = round2(grossSubtotal - discountAmount);

        const gstAmount = round2(netSubtotal * (gst / 100));
        const totalAmount = round2(netSubtotal + gstAmount);
        const commissionAmount = round2(totalAmount * (commissionPercent / 100));
        const commissionGstAmount = round2(commissionAmount * (gst / 100));
        const totalCommissionForReference = round2(commissionAmount + commissionGstAmount);

        return { saleUnitQty: moqSaleUnits, totalUnits, grossSubtotal, discountPercent, discountAmount, netSubtotal, gstAmount, totalAmount, commissionAmount, commissionGstAmount, totalCommissionForReference };
    }, [form.moq, form.packSize, form.masterPackSize, form.hasOuterPack, form.priceSlabs, form.gstPercent, pricePreview, commissionPercent]);

    const discountedPreview = (slab) => {
        if (!slab?.discountPercent) return null;
        return round2(pricePreview.basePricePerSaleUnit * (1 - Number(slab.discountPercent) / 100));
    };


    // priceSlabs.minQty is ALWAYS stored in Packs — the backend format. When
    // hasOuterPack is on, the seller thinks in Master Packs, so these convert
    // for display only. Discount % never changes in either direction — a 10%
    // break at 3 Master Packs (= 30 Packs) is stored as minQty: 30, and shown
    // back as 3 whenever hasOuterPack is on. Same % either way, by construction.

    const handleOuterPackToggle = (value) => {
        setForm((f) => ({
            ...f,
            hasOuterPack: value,
            masterPackSize: value ? "" : "0",
            // MOQ's unit of measure flips between Packs and Master Packs
            // depending on this toggle — a value entered under one meaning
            // is wrong under the other, so clear it rather than silently
            // reinterpreting the same number.
            moq: "",
        }));
        if (!value) setTouched((t) => (t.masterPackSize ? { ...t, masterPackSize: false } : t));
        setTouched((t) => (t.moq ? { ...t, moq: false } : t));
    };

    // Shared upload pipeline for product images — used by both the file
    // input (click to browse) and the drag-and-drop zone below, so both
    // paths get identical validation/error handling.
    const processImageFiles = async (fileList) => {
        const allFiles = Array.from(fileList || []);
        if (!allFiles.length) return;

        // The dropzone specifically accepts product photos — silently skip
        // anything that isn't an image rather than erroring the whole drop,
        // since a seller dragging a folder/mixed selection shouldn't lose
        // their valid images over one stray file.
        const files = allFiles.filter((f) => f.type?.startsWith("image/"));
        if (!files.length) {
            setError("Please drop image files (JPG, PNG, etc.) here.");
            return;
        }

        setUploadingImage(true); setError(null);
        try {
            const urls = [];
            for (const file of files) {
                const res = await uploadSellerFile(token, file, "listings");
                if (!res?.success) throw new Error("Image upload failed.");
                urls.push(res.url);
            }
            setForm((f) => ({ ...f, images: [...f.images, ...urls] }));
        } catch (err) { setError(err.message); } finally { setUploadingImage(false); }
    };

    const handleImageFiles = async (e) => {
        await processImageFiles(e.target.files);
        e.target.value = "";
    };
    const removeImageAt = (i) => setForm((f) => ({ ...f, images: f.images.filter((_, idx) => idx !== i) }));

    // --- Product-images drag & drop, scoped strictly to the images box ---
    // Every handler calls stopPropagation() so a drop here is never
    // re-interpreted by the (separate, sibling) certificates dropzone
    // inside CertificateUploadField, and never bubbles up to the page.
    const handleImageDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (readOnly || uploadingImage) return;
        if (!e.dataTransfer?.types?.includes("Files")) return;
        imageDragCounter.current += 1;
        setImageDragActive(true);
    };
    const handleImageDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const handleImageDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        imageDragCounter.current = Math.max(0, imageDragCounter.current - 1);
        if (imageDragCounter.current === 0) setImageDragActive(false);
    };
    const handleImageDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        imageDragCounter.current = 0;
        setImageDragActive(false);
        if (readOnly || uploadingImage) return;
        processImageFiles(e.dataTransfer?.files);
    };

    // Bugfix: two window-level safety nets for drag & drop.
    //   1. `dragover`/`drop` — the browser's DEFAULT behavior for a drop
    //      event that no handler calls preventDefault() on is to navigate
    //      the whole tab to that file. Both dropzones already
    //      preventDefault()+stopPropagation() their OWN drag events, but
    //      a drop that lands a few pixels outside either zone (or during
    //      a mid-drag re-render that temporarily unmounts the zone under
    //      the pointer) would otherwise hit this default and blow away
    //      the page. This listens at the window level and simply
    //      preventDefault()s anything that wasn't already handled, so an
    //      off-target drop is a harmless no-op instead of a navigation.
    //   2. `dragend` — always fires on the drag source once a drag ends,
    //      whether it was dropped, cancelled (Esc), or ended somewhere
    //      that never produces a clean dragleave on the zone (e.g. over
    //      unrelated browser chrome). Without this, imageDragActive /
    //      imageDragCounter could get stuck "on" after an abandoned drag,
    //      making the dropzone look broken until the component remounts.
    useEffect(() => {
        const stopUnhandledDrop = (e) => e.preventDefault();
        const resetImageDragState = () => {
            imageDragCounter.current = 0;
            setImageDragActive(false);
        };
        window.addEventListener("dragover", stopUnhandledDrop);
        window.addEventListener("drop", stopUnhandledDrop);
        window.addEventListener("dragend", resetImageDragState);
        return () => {
            window.removeEventListener("dragover", stopUnhandledDrop);
            window.removeEventListener("drop", stopUnhandledDrop);
            window.removeEventListener("dragend", resetImageDragState);
        };
    }, []);

    function jumpToError(firstMissing) {
        const section = FIELD_TO_SECTION[firstMissing.key];
        const needsSwitch = section && section !== openSection;
        if (needsSwitch) setOpenSection(section);

        setTimeout(() => {
            // stockTypeAmount has no DOM field of its own — fall back to
            // stockType's anchor, since that's what the seller needs to act on.
            const targetKey = firstMissing.key === "stockTypeAmount" ? "stockType" : firstMissing.key;
            const target = document.getElementById(`field-${targetKey}`);
            if (!target) return;
            target.scrollIntoView({ behavior: "smooth", block: "center" });
            target.style.boxShadow = "0 0 0 3px rgba(199,31,17,0.35)";
            setTimeout(() => { target.style.boxShadow = ""; }, 1600);
        }, needsSwitch ? 260 : 0);
    }

    // Focuses whatever the first focusable control is inside a given
    // field's FieldAnchor (input / textarea / button), opening + scrolling
    // its section into view first if needed. Shared by both the keyboard
    // "advance" flow and jumpToError-style jumps.
    function focusFieldKey(key, { select = false } = {}) {
        const section = FIELD_TO_SECTION[key];
        const needsSwitch = section && section !== openSection;
        if (needsSwitch) setOpenSection(section);

        setTimeout(() => {
            const target = document.getElementById(`field-${key}`);
            if (!target) return;
            target.scrollIntoView({ behavior: "smooth", block: "center" });
            const input = target.querySelector("input:not([type=hidden]), textarea, button");
            if (input) {
                input.focus();
                if (select && typeof input.select === "function") input.select();
            }
        }, needsSwitch ? 260 : 40);
    }

    // KEYBOARD FLOW: called by a field's onEnterKey("forward" | "backward").
    //
    // BUGFIX: this previously always jumped to `currentMissing[0]` — i.e.
    // literally the first missing field anywhere on the whole form, in a
    // fixed order — rather than the next incomplete field relative to
    // wherever the seller currently is. That's why filling in fields in
    // section 2 while section 1 still had gaps always yanked focus back
    // to section 1, and why Shift+Tab never actually went backward (the
    // direction argument was silently ignored).
    //
    // Fixed by: sorting the still-missing fields by their position in
    // FIELD_ORDER (the canonical top-to-bottom order matching the page),
    // then searching strictly forward (or backward) from the field that
    // was just interacted with. Only when there's nothing left ahead (or
    // behind) does it wrap around to the other end of the missing list —
    // e.g. finishing the very last gap near the bottom of the form loops
    // back up to the first remaining gap higher up, same as before, but
    // WITHOUT clobbering forward progress through a section that already
    // has later fields correctly filled.
    function handleFieldAdvance(fieldKey, direction = "forward", isSubmitAttempt = false) {
        setTouched((t) => (t[fieldKey] ? t : { ...t, [fieldKey]: true }));

        setTimeout(() => {
            // Enter (not Tab) only submits once the whole form is complete.
            if (isSubmitAttempt) {
                const stillMissing = computeMissing(form);
                if (stillMissing.length === 0) {
                    handleSubmit();
                    return;
                }
            }

            // Purely positional: next/prev visible field in FIELD_ORDER, looping.
            const visibleOrder = FIELD_ORDER.filter((key) => isFieldVisible(key, form));
            const idx = visibleOrder.indexOf(orderKeyFor(fieldKey));
            if (idx === -1 || visibleOrder.length === 0) return;

            const nextIdx = direction === "backward"
                ? (idx - 1 + visibleOrder.length) % visibleOrder.length
                : (idx + 1) % visibleOrder.length;

            const nextKey = visibleOrder[nextIdx];
            const targetKey = nextKey === "stockTypeAmount" ? "stockType" : nextKey;
            focusFieldKey(targetKey, { select: true });
        }, 40);
    }

    const handleSubmit = () => {
        if (missing.length) {
            setTouched((t) => ({ ...t, ...Object.fromEntries(missing.map((m) => [m.key, true])) }));
            setError(`Please complete: ${missing.slice(0, 4).map((m) => m.label).join(", ")}${missing.length > 4 ? `, +${missing.length - 4} more` : ""}.`);
            jumpToError(missing[0]);
            return;
        }
        setError(null);

        // NOTE: form.moq is already the listing's canonical SALE UNIT
        // quantity (Master Packs when hasOuterPack, Packs otherwise) — the
        // same unit the backend stores it in (see toListingRow's "already
        // sale-unit qty" comment) — so it's sent through as-is below, only
        // rounded to a whole number.

        const dl = form.dispatchingLocations;
        let dispatchingLocations = [];
        if (dl?.country) {
            if (dl.mode === "include") {
                dispatchingLocations = [
                    { type: "country", name: dl.country.name, code: dl.country.code, includeOnly: true },
                    ...(dl.includedStates || []).map((state) => {
                        const cities = dl.includedCitiesByState?.[state];
                        return cities !== undefined ? { type: "state", name: state, includedCities: cities } : { type: "state", name: state };
                    }),
                ];
            } else {
                dispatchingLocations = [
                    { type: "country", name: dl.country.name, code: dl.country.code, excludedStates: dl.excludedStates || [] },
                    ...Object.entries(dl.citiesByState || {}).filter(([, cities]) => cities?.length).map(([state, cities]) => ({ type: "state", name: state, excludedCities: cities })),
                ];
            }
        }
        const sampleQuantityBaseUnits = form.sampleAvailable
            ? round2(toBaseUnitsFromBasis(form.sampleUnitBasis, form.sampleQuantity, form.packSize, form.masterPackSize))
            : form.sampleQuantity;

        // Stock, like MOQ, is persisted in the listing's canonical SALE
        // UNIT — not literal Packs. See toSaleUnitQtyFromBasis above.
        const stockQuantitySaleUnits = form.stockType === "ready_stock"
            ? round2(toSaleUnitQtyFromBasis(form.stockQuantityBasis, form.stockQuantity, form.packSize, form.masterPackSize))
            : form.stockQuantity;
        onSubmit({
            ...form,
            hasOuterPack: !!form.hasOuterPack,
            sampleAvailable: !!form.sampleAvailable,
            gstInclusive: !!form.gstInclusive,
            freightIncluded: !!form.freightIncluded,
            genericProductBrandId: form.brandItemMatch?.id || null,
            moq: String(round2ToInt(form.moq)),
            sampleQuantity: form.sampleAvailable ? String(sampleQuantityBaseUnits) : form.sampleQuantity,
            stockQuantity: form.stockType === "ready_stock" ? String(stockQuantitySaleUnits) : form.stockQuantity,
            dispatchingLocations,
        });
    };

    // Root-level Enter guard: if Enter is pressed while focus is on
    // something that ISN'T one of our wired fields (e.g. a native browser
    // autofill interaction, or a stray element), stop it from doing a
    // default form-submit navigation. Wired fields already call
    // handleFieldAdvance via their own onEnterKey/onKeyDown, which calls
    // preventDefault() themselves — this is just a safety net at the
    // container level since there's no literal <form> tag with a default
    // submit action here.
    const handleRootKeyDown = (e) => {
        if (e.key === "Enter" && e.target?.tagName === "INPUT") {
            // Already handled by the individual field's own onKeyDown in the
            // vast majority of cases; this guards any field that doesn't yet
            // pass onEnterKey through.
            e.preventDefault();
        }
    };

    return (
        <div className="flex flex-col gap-3 pb-24 sm:gap-3.5" onKeyDown={handleRootKeyDown}>
            {error && (
                <div className="flex items-start gap-2 rounded-xl px-3.5 py-3 text-[12px] font-semibold leading-snug" style={{ background: "rgba(199,31,17,0.08)", color: C.danger }}>
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
                </div>
            )}

            {/* ---------------- Product ---------------- */}
            <SectionCard id="section-product" icon={Package} title="Product" subtitle={locked ? "Already approved · locked" : "Name, brand, images & documents"}
                open={openSection === "product"} onOpenChange={(v) => handleSectionToggle("product", v)}
                missingCount={missingCountBySection.product} totalCount={totalCountBySection.product}
                readOnly={readOnly}>
                {locked ? (
                    <div className="flex items-center gap-3 rounded-xl p-2.5" style={{ background: C.hairSoft }}>
                        {form.images?.[0] && <img src={form.images[0]} alt="" className="h-12 w-12 shrink-0 rounded-lg border object-cover" style={{ borderColor: C.hair }} />}
                        <div className="min-w-0">
                            <p className="truncate text-[14.5px] font-extrabold tracking-wide" style={{ color: C.ink }}>{form.productName}</p>
                            {form.brandName && <p className="truncate text-[12px] font-bold tracking-wider" style={{ color: C.primary }}>{form.brandName}</p>}
                        </div>
                    </div>
                ) : (
                    <>
                        <FieldAnchor fieldKey="productName">
                            <TextField required label="Product name" value={form.productName} onChange={(v) => setField("productName", v)} onBlur={() => touch("productName")} error={isErr("productName")} placeholder="e.g. Premium Stainless Steel Hinges" onEnterKey={(dir) => handleFieldAdvance("productName", dir)} />
                        </FieldAnchor>

                        <FieldAnchor fieldKey="brandName">
                            <BrandCombobox
                                value={form.brandName} notApplicable={form.brandNotApplicable} image={form.brandImage}
                                onChange={({ brandName, brandImage, brandNotApplicable }) => setForm((f) => ({ ...f, brandName, brandImage, brandNotApplicable }))}
                            />
                        </FieldAnchor>

                        <FieldAnchor fieldKey="images">
                            <div className="flex flex-col gap-1.5">
                                <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: C.muted }}>
                                    Product images {form.images.length > 0 && `(${form.images.length})`} <span style={{ color: C.primary }}>*</span>
                                </span>
                                {/* Drag-and-drop zone for product photos. Handlers are scoped
                                    to this div only (stopPropagation on every drag event), so
                                    dropping here can never be picked up by the certificates
                                    dropzone elsewhere on the form, or vice versa. */}
                                <div
                                    className="flex flex-wrap gap-2 rounded-xl transition-colors duration-150"
                                    style={imageDragActive ? { boxShadow: `0 0 0 2px ${C.secondary}55`, background: `${C.secondary}06`, padding: "8px", margin: "-8px" } : undefined}
                                    onDragEnter={handleImageDragEnter}
                                    onDragOver={handleImageDragOver}
                                    onDragLeave={handleImageDragLeave}
                                    onDrop={handleImageDrop}
                                >
                                    {form.images.map((src, i) => (
                                        <div key={src + i} className="relative h-16 w-16 sm:h-[72px] sm:w-[72px]">
                                            <img src={src} alt="" className="h-full w-full rounded-xl border object-cover" style={{ borderColor: C.hair }} />
                                            <button type="button" onClick={() => removeImageAt(i)} className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-[10px] leading-none text-white">×</button>
                                            {i === 0 && <span className="absolute bottom-0 left-0 right-0 rounded-b-xl bg-black/60 py-0.5 text-center text-[8px] font-bold text-white">Cover</span>}
                                        </div>
                                    ))}
                                    <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed sm:h-[72px] sm:w-[72px]" style={imageDragActive ? { borderColor: C.secondary, color: C.secondary, background: `${C.secondary}0a` } : { borderColor: C.hair, color: C.muted }}>
                                        {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : imageDragActive ? <UploadCloud className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
                                        <span className="text-[9px] font-bold">{uploadingImage ? "Uploading…" : imageDragActive ? "Drop here" : "Add"}</span>
                                        <input type="file" accept="image/*" multiple onChange={handleImageFiles} className="hidden" disabled={uploadingImage} />
                                    </label>
                                </div>
                                {!imageDragActive && (
                                    <p className="text-[10.5px] font-medium" style={{ color: C.muted }}>
                                        Or drag & drop image files anywhere in this box.
                                    </p>
                                )}
                            </div>
                        </FieldAnchor>

                        <CertificateUploadField
                            label="Quality & certifications"
                            hint=""
                            rows={form.qualityCertificates}
                            onChange={(rows) => setField("qualityCertificates", rows)}
                            token={token}
                        />

                        <TextAreaField label="Note to admin" value={form.noteToAdmin} onChange={(v) => setField("noteToAdmin", v)} rows={2}
                            hint="Anything that'll help us approve this faster — e.g. context on the product, sourcing, or images." placeholder="Optional" />
                    </>
                )}
            </SectionCard>

            {/* ---------------- Packaging ---------------- */}
            <SectionCard id="section-packaging" icon={Boxes} title="Packaging"
                open={openSection === "packaging"} onOpenChange={(v) => handleSectionToggle("packaging", v)}
                missingCount={missingCountBySection.packaging} totalCount={totalCountBySection.packaging}
                readOnly={readOnly}>
                {checkingBrandMatch && (
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: C.muted }}>
                        <Loader2 className="h-3 w-3 animate-spin" /> Checking if this product already exists…
                    </p>
                )}

                {form.brandItemMatch ? (
                    <div className="flex items-center gap-2 rounded-xl p-2.5" style={{ background: C.hairSoft }}>
                        <Boxes className="h-4 w-4 shrink-0" style={{ color: C.secondary }} />
                        <div className="min-w-0">
                            <p className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: C.muted }}>Fixed by this product</p>
                            <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>
                                1 Pack = {form.packSize} {form.unit}
                                {Number(form.masterPackSize) > 1 && ` · 1 Master Pack = ${form.masterPackSize} Packs`}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2.5">
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                            <FieldAnchor fieldKey="unit">
                                <SelectField required dense halfOnMobile label="What is the Selling Unit of this Product?" hint="Smallest measure this product is sold in (e.g. Pieces, Kg, Litres)" value={form.unit} onChange={(v) => setField("unit", v)} onBlur={() => touch("unit")} error={isErr("unit")} options={UNITS} onEnterKey={(dir) => handleFieldAdvance("unit", dir)} />
                            </FieldAnchor>
                            <FieldAnchor fieldKey="packSize">
                                <TextField required dense tinyOnMobile placeholder="1234" label={getPackSizeLabel(form.unit)} hint={getPackSizeHint(form.unit)} value={form.packSize} onChange={(v) => setField("packSize", v.replace(/[^\d.]/g, ""))} onBlur={() => touch("packSize")} error={isErr("packSize")} inputMode="decimal" onEnterKey={(dir) => handleFieldAdvance("packSize", dir)} />
                            </FieldAnchor>
                        </div>

                        <FieldAnchor fieldKey="hasOuterPack">
                            <ToggleField2
                                label="Does this have an Outer Pack?"
                                value={form.hasOuterPack}
                                onChange={(v) => { handleOuterPackToggle(v); touch("hasOuterPack"); }}
                                error={isErr("hasOuterPack")}
                                onEnterKey={(dir) => handleFieldAdvance("hasOuterPack", dir)}
                                infoBlock={
                                    <div className="mb-1 flex items-start gap-2 rounded-xl">
                                        <p className="text-[8.5px] font-semibold leading-snug tracking-wide" style={{ color: C.primary }}>
                                            An outer pack is a larger pack / <b style={{ color: C.primary }}>Master Pack</b> containing multiple individual Packs.
                                        </p>
                                    </div>
                                }
                            />
                        </FieldAnchor>

                        {form.hasOuterPack && (
                            <>
                                <FieldAnchor fieldKey="masterPackSize">
                                    <TextField
                                        required dense tinyOnMobile
                                        placeholder="1234"
                                        label="How many Packs are there in one Outer Pack?"
                                        hint="How many Packs make up 1 Master Pack (e.g. 1 Master Pack = 5 Packs)"
                                        value={form.masterPackSize}
                                        onChange={(v) => setField("masterPackSize", v.replace(/[^\d]/g, ""))}
                                        onBlur={() => touch("masterPackSize")}
                                        error={isErr("masterPackSize")}
                                        inputMode="numeric"
                                        onEnterKey={(dir) => handleFieldAdvance("masterPackSize", dir)}
                                    />
                                </FieldAnchor>
                            </>
                        )}
                        {/* Derived packaging summary — recalculates live from Unit / Pack size /
                        Master pack size, shown just above MOQ so the seller can sanity-check
                        the numbers they just entered before setting a minimum order quantity. */}
                        {form.unit && Number(form.packSize) > 0 && (
                            <p className="text-[13px] font-bold tracking-wider mt-1" style={{ color: C.ink }}>
                                {form.hasOuterPack && Number(form.masterPackSize) >= 2
                                    ? `1 Master Pack = ${form.masterPackSize} Packs = ${Number(form.packSize) * Number(form.masterPackSize)} ${form.unit}`
                                    : `1 Pack = ${form.packSize} ${form.unit}`}
                            </p>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <FieldAnchor fieldKey="moq">
                        <TextField required dense tinyOnMobile placeholder="1234" label={getMoqLabel(form.hasOuterPack)} hint={getMoqHint(form.hasOuterPack)}
                            value={form.moq} onChange={(v) => setField("moq", v.replace(/[^\d.]/g, ""))}
                            onBlur={() => touch("moq")} error={isErr("moq")} inputMode="decimal" onEnterKey={(dir) => handleFieldAdvance("moq", dir)} />
                    </FieldAnchor>
                </div>
                <FieldAnchor fieldKey="sampleAvailable">
                    <ToggleField
                        label="Sample available?"
                        value={form.sampleAvailable}
                        onChange={(v) => { setField("sampleAvailable", v); touch("sampleAvailable"); }}
                        error={isErr("sampleAvailable")}
                        onEnterKey={(dir) => handleFieldAdvance("sampleAvailable", dir)}
                    />
                </FieldAnchor>
                {form.sampleAvailable && (
                    <FieldAnchor fieldKey="sampleQuantity">
                        <TextFieldWithUnitSelect
                            required dense
                            label="Sample quantity"
                            value={form.sampleQuantity}
                            onChange={(v) => setField("sampleQuantity", v.replace(/[^\d.]/g, ""))}
                            onBlur={() => touch("sampleQuantity")}
                            error={isErr("sampleQuantity")}
                            inputMode="decimal"
                            unitValue={form.sampleUnitBasis}
                            unitOptions={getUnitBasisOptions(form.hasOuterPack, form.unit)}
                            onUnitChange={changeSampleBasis}
                            onEnterKey={(dir) => handleFieldAdvance("sampleQuantity", dir)}
                        />
                    </FieldAnchor>
                )}

            </SectionCard>

            {/* ---------------- Pricing ---------------- */}
            <SectionCard id="section-pricing" icon={IndianRupee} title="Tax & Pricing"
                open={openSection === "pricing"} onOpenChange={(v) => handleSectionToggle("pricing", v)}
                missingCount={missingCountBySection.pricing} totalCount={totalCountBySection.pricing}
                readOnly={readOnly}>
                <ChipToggleGroup
                    dense label="Applicable GST % for this Product"
                    value={form.gstPercent === "" || form.gstPercent == null ? "" : Number(form.gstPercent)}
                    onChange={(v) => setField("gstPercent", Number(v))}
                    options={GST_OPTIONS.map((g) => ({ value: g, label: `${g}%` }))}
                    onEnterKey={(dir) => handleFieldAdvance("gstPercent", dir)}
                />
                {(() => {
                    const showMaster = form.hasOuterPack && Number(form.masterPackSize) >= 2;
                    const hasPrice = form.basePrice !== "" && form.basePrice != null;
                    const { perUnit, perPack, perMaster } = hasPrice
                        ? computeThreeTierPrices(form.priceBasis, form.basePrice, form.packSize, form.masterPackSize)
                        : { perUnit: "", perPack: "", perMaster: "" };

                    // Show the raw typed value in whichever field is the active basis,
                    // and the derived value in the other two — but ONLY when a price has
                    // actually been entered. Empty basePrice means all three stay empty,
                    // never falling back to a computed "0".
                    const unitValue = !hasPrice ? "" : (form.priceBasis === "per_unit" ? form.basePrice : String(perUnit));
                    const packValue = !hasPrice ? "" : (form.priceBasis === "per_pack" ? form.basePrice : String(perPack));
                    const masterValue = !hasPrice ? "" : (form.priceBasis === "per_master_pack" ? form.basePrice : String(perMaster));

                    const sanitize = (v) => v.replace(/[^\d.]/g, "");

                    return (
                        <FieldAnchor fieldKey="basePrice">
                            <p className="text-[11.5px] font-semibold leading-snug tracking-wide pb-1" style={{ color: C.ink }}>The standard price before applying quantity-based discounts</p>
                            <div className={`grid gap-2.5 ${showMaster ? "grid-cols-3" : "grid-cols-2"}`}>
                                <TextField2
                                    required dense
                                    label={`Per ${form.unit || "Unit"}`}
                                    prefix="₹"
                                    hint={`Price for 1 ${form.unit || "Unit"} — the other fields recalculate automatically`}
                                    value={unitValue}
                                    onChange={(v) => setForm((f) => ({ ...f, basePrice: sanitize(v), priceBasis: "per_unit" }))}
                                    onBlur={() => touch("basePrice")}
                                    error={isErr("basePrice")}
                                    inputMode="decimal"
                                    onEnterKey={(dir) => handleFieldAdvance("basePrice", dir)}
                                />
                                <TextField2
                                    required dense
                                    label="Per Pack"
                                    prefix="₹"
                                    hint={`Price for 1 Pack (${form.packSize || "?"} ${form.unit || "Unit"}) — the other fields recalculate automatically`}
                                    value={packValue}
                                    onChange={(v) => setForm((f) => ({ ...f, basePrice: sanitize(v), priceBasis: "per_pack" }))}
                                    onBlur={() => touch("basePrice")}
                                    error={isErr("basePrice")}
                                    inputMode="decimal"
                                    onEnterKey={(dir) => handleFieldAdvance("basePrice", dir)}
                                />
                                {showMaster && (
                                    <TextField2
                                        required dense
                                        label="Per Master Pack"
                                        prefix="₹"
                                        hint={`Price for 1 Master Pack (${form.masterPackSize || "?"} Packs) — the other fields recalculate automatically`}
                                        value={masterValue}
                                        onChange={(v) => setForm((f) => ({ ...f, basePrice: sanitize(v), priceBasis: "per_master_pack" }))}
                                        onBlur={() => touch("basePrice")}
                                        error={isErr("basePrice")}
                                        inputMode="decimal"
                                        onEnterKey={(dir) => handleFieldAdvance("basePrice", dir)}
                                    />
                                )}
                            </div>
                            <div className={`mt-1 grid gap-2.5 items-start ${showMaster ? "grid-cols-3" : "grid-cols-2"}`}>
                                <p className="text-[9.5px] font-semibold tracking-wide leading-tight" style={{ color: C.muted }}>
                                    Price per 1 {form.unit || "Unit"}
                                </p>
                                <p className="text-[9.5px] font-semibold tracking-wide leading-tight" style={{ color: C.muted }}>
                                    Price per {form.packSize || "?"} {form.unit || "Unit"}
                                </p>
                                {showMaster && (
                                    <p className="text-[9.5px] font-semibold tracking-wide leading-tight" style={{ color: C.muted }}>
                                        Price per {form.masterPackSize} packs
                                    </p>
                                )}
                            </div>
                        </FieldAnchor>
                    );
                })()}
                <div className="grid grid-cols-1 gap-2.5 items-end justify-end self-end">
                    <FieldAnchor fieldKey="gstInclusive">
                        <ToggleField3
                            label="Price includes GST?"
                            value={form.gstInclusive}
                            onChange={(v) => { setField("gstInclusive", v); touch("gstInclusive"); }}
                            error={isErr("gstInclusive")}
                            onEnterKey={(dir) => handleFieldAdvance("gstInclusive", dir)}
                        />
                    </FieldAnchor>
                </div>
                <RepeatableRows2
                    label="Discount slabs"
                    hint={form.hasOuterPack ? "Extra % off above a quantity threshold, in Master Packs" : "Extra % off above a quantity threshold, in Packs"}
                    rows={form.priceSlabs}
                    onChange={(rows) => setField("priceSlabs", rows)}
                    addLabel="Add slab"
                    columns={[
                        {
                            key: "minQty",
                            placeholder: form.hasOuterPack ? "Min qty (Master Packs)" : "Min qty (Packs)",
                            inputMode: "decimal",
                            flex: 7,
                            suffix: (row) => {
                                const unitLabel = form.hasOuterPack ? "Master Pack" : "Pack";
                                return Number(row.minQty) === 1 ? unitLabel : `${unitLabel}s`;
                            },
                        },
                        {
                            key: "discountPercent",
                            placeholder: "Discount %",
                            inputMode: "decimal",
                            flex: 3,
                            suffix: "%",
                        },
                    ]}
                />
                {form.priceSlabs.some((s) => s.discountPercent) && (
                    <div className="flex flex-col gap-1 rounded-xl border px-3 py-2" style={{ borderColor: C.hairSoft }}>
                        {form.priceSlabs
                            .map((raw, i) => ({ raw, display: form.priceSlabs[i] }))
                            .filter(({ raw }) => raw.minQty && raw.discountPercent)
                            .map(({ raw, display }, i) => (
                                <p key={i} className="text-[12px] font-semibold tabular-nums" style={{ color: C.muted }}>
                                    Above {display.minQty} {form.hasOuterPack ? "Master Pack" : "Pack"}{Number(display.minQty) === 1 ? "" : "s"}: ₹{discountedPreview(raw)} / {form.hasOuterPack ? "Master Pack" : "Pack"}
                                </p>
                            ))}
                    </div>
                )}

                <div className="rounded-2xl border p-3 flex flex-col gap-2" style={{ borderColor: C.hairSoft, background: `${C.secondary}08` }}>
                    <p className="text-[13px] font-extrabold uppercase tracking-[0.08em]" style={{ color: C.ink }}>
                        Demo Price breakdown for {form.hasOuterPack ? `${form.moq || 1} Master Packs` : `${form.moq || 1} Packs`}
                    </p>

                    {Number(form.packSize) > 0 ? (
                        <div className="flex flex-col gap-1.5">
                            <div className="flex flex-col gap-1">
                                <p className="text-[11px] font-extrabold uppercase tracking-[0.08em]" style={{ color: C.muted }}>
                                    Quantity at MOQ
                                </p>
                                <div className="flex flex-col gap-1 rounded-lg px-2.5 py-2 pt-0 pe-0" >
                                    <div className="flex items-center justify-between gap-2 text-[13px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                        <span>Total {form.unit}</span>
                                        <span className="tabular-nums font-bold" style={{ color: C.ink }}>
                                            {moqPreview.totalUnits.toLocaleString("en-IN")} {form.unit || "units"}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 text-[13px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                        <span>Packs</span>
                                        <span className="tabular-nums font-bold" style={{ color: C.ink }}>
                                            {moqSaleUnitsToPacks(moqPreview.saleUnitQty, form.hasOuterPack, form.masterPackSize).toLocaleString("en-IN")} Pack{moqSaleUnitsToPacks(moqPreview.saleUnitQty, form.hasOuterPack, form.masterPackSize) === 1 ? "" : "s"}
                                        </span>
                                    </div>
                                    {form.hasOuterPack && Number(form.masterPackSize) >= 2 && (
                                        <div className="flex items-center justify-between gap-2 text-[13px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                            <span>Master Packs</span>
                                            <span className="tabular-nums font-bold" style={{ color: C.ink }}>
                                                {Number(form.moq).toLocaleString("en-IN")} Master Pack{Number(form.moq) === 1 ? "" : "s"}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center justify-between gap-2 text-[13.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                <span>Basic price</span>
                                <span className="tabular-nums font-bold" style={{ color: C.ink }}>
                                    ₹{moqPreview.grossSubtotal.toLocaleString("en-IN")}
                                </span>
                            </div>

                            {moqPreview.discountPercent > 0 && (
                                <div className="flex items-center justify-between gap-2 text-[13.5px] font-semibold tracking-wide" style={{ color: C.secondary }}>
                                    <span>Discount ({moqPreview.discountPercent}%)</span>
                                    <span className="tabular-nums font-bold">
                                        − ₹{moqPreview.discountAmount.toLocaleString("en-IN")}
                                    </span>
                                </div>
                            )}

                            <div className="flex items-center justify-between gap-2 text-[13.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                <span>GST ({form.gstPercent}%){form.gstInclusive ? " " : ""}</span>
                                <span className="tabular-nums font-bold" style={{ color: C.ink }}>
                                    ₹{moqPreview.gstAmount.toLocaleString("en-IN")}
                                </span>
                            </div>

                            <div className="flex items-center justify-between gap-2 border-y py-1.5 my-0.5" style={{ borderColor: C.hair }}>
                                <span className="text-[14px] font-extrabold uppercase tracking-wide" style={{ color: C.ink }}>
                                    Total amount
                                </span>
                                <span className="text-[16px] font-extrabold tabular-nums" style={{ color: C.ink }}>
                                    ₹{moqPreview.totalAmount.toLocaleString("en-IN")}
                                </span>
                            </div>

                            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold" style={{ color: C.muted }}>
                                <span>Platform commission ({commissionPercent}% + {form.gstPercent}% GST) <span className="italic font-medium">— for reference</span></span>
                                <span className="tabular-nums font-bold" style={{ color: C.primary }}>
                                    ₹{moqPreview.totalCommissionForReference.toLocaleString("en-IN")}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>
                            Enter Pack size and MOQ above to see the full price breakdown
                        </p>
                    )}
                </div>
                <div className="grid grid-cols-1 gap-2.5 items-end justify-end self-end">
                    <FieldAnchor fieldKey="freightIncluded">
                        <ToggleField
                            label="Freight included?"
                            value={form.freightIncluded}
                            onChange={(v) => { setField("freightIncluded", v); touch("freightIncluded"); }}
                            error={isErr("freightIncluded")}
                            onEnterKey={(dir) => handleFieldAdvance("freightIncluded", dir)}
                        />
                    </FieldAnchor>
                </div>
            </SectionCard>

            {/* ---------------- Fulfilment ---------------- */}
            <SectionCard id="section-fulfilment" icon={Truck} title="Fulfilment"
                open={openSection === "fulfilment"} onOpenChange={(v) => handleSectionToggle("fulfilment", v)}
                missingCount={missingCountBySection.fulfilment} totalCount={totalCountBySection.fulfilment}
                readOnly={readOnly}>
                <FieldAnchor fieldKey="stockType">
                    <ChipToggleGroup label="Fulfilment" value={form.stockType}
                        onChange={(v) => { setField("stockType", v); touch("stockType"); }}
                        error={isErr("stockType")}
                        options={[{ value: "ready_stock", label: "Ready stock" }, { value: "made_to_order", label: "Made-to-order" }]}
                        onEnterKey={(dir) => handleFieldAdvance("stockType", dir)} />

                </FieldAnchor>
                {form.stockType === "ready_stock" ? (
                    <FieldAnchor fieldKey="stockQuantity">
                        <TextFieldWithUnitSelect
                            required dense
                            label="Available stock"
                            value={form.stockQuantity}
                            onChange={(v) => setField("stockQuantity", v.replace(/[^\d.]/g, ""))}
                            onBlur={() => touch("stockQuantity")}
                            error={isErr("stockQuantity")}
                            inputMode="decimal"
                            unitValue={form.stockQuantityBasis}
                            unitOptions={getUnitBasisOptions(form.hasOuterPack, form.unit)}
                            onUnitChange={changeStockBasis}
                            onEnterKey={(dir) => handleFieldAdvance("stockQuantity", dir)}
                        />
                    </FieldAnchor>
                ) : (
                    <FieldAnchor fieldKey="productionLeadTimeDays">
                        <TextField required dense label="Lead time (days)" value={form.productionLeadTimeDays} onChange={(v) => setField("productionLeadTimeDays", v.replace(/[^\d]/g, ""))} onBlur={() => touch("productionLeadTimeDays")} error={isErr("productionLeadTimeDays")} inputMode="numeric" onEnterKey={(dir) => handleFieldAdvance("productionLeadTimeDays", dir)} />
                    </FieldAnchor>
                )}
            </SectionCard>

            {/* ---------------- Terms ---------------- */}
            <SectionCard id="section-terms" icon={FileText} title="Terms"
                open={openSection === "terms"} onOpenChange={(v) => handleSectionToggle("terms", v)}
                missingCount={missingCountBySection.terms} totalCount={totalCountBySection.terms}
                readOnly={readOnly}>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <FieldAnchor fieldKey="returnPolicyKey">
                        <PolicySelect kind="return_policy" label="Return / replacement policy" required value={form.returnPolicyKey} onChange={(v) => { setField("returnPolicyKey", v); handleFieldAdvance("returnPolicyKey", "forward"); }} error={isErr("returnPolicyKey")} />
                    </FieldAnchor>
                    <FieldAnchor fieldKey="warrantyKey">
                        <PolicySelect kind="warranty" label="Warranty" required value={form.warrantyKey} onChange={(v) => { setField("warrantyKey", v); handleFieldAdvance("warrantyKey", "forward"); }} error={isErr("warrantyKey")} />
                    </FieldAnchor>
                </div>
            </SectionCard>

            {/* ---------------- Delivery ---------------- */}
            <SectionCard id="section-delivery" icon={Truck} title="Delivery"
                open={openSection === "delivery"} onOpenChange={(v) => handleSectionToggle("delivery", v)}
                missingCount={missingCountBySection.delivery} totalCount={totalCountBySection.delivery}
                readOnly={readOnly}>
                <FieldAnchor fieldKey="dispatchingLocations">
                    <DispatchingLocationsPicker value={form.dispatchingLocations} onChange={(v) => setField("dispatchingLocations", v)} />
                </FieldAnchor>
            </SectionCard>

            {readOnly ? (
                <div className={`sticky ${stickyBottomClassName} z-10 -mx-2.5 mt-1 border-t bg-white/95 px-2.5 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-4`} style={{ borderColor: C.hair }}>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={onClose}
                            className="flex-1 rounded-xl border px-4 py-3 text-[13.5px] font-bold tracking-wide"
                            style={{ borderColor: C.hair, color: C.muted }}>
                            Close
                        </button>
                        <button type="button" onClick={onEdit}
                            className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-xl px-5 py-3 text-[13.5px] font-bold text-white tracking-wide"
                            style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
                            <Pencil className="h-4 w-4" /> Edit this listing
                        </button>
                    </div>
                </div>
            ) : (
                <div className={`sticky ${stickyBottomClassName} z-10 -mx-2.5 mt-1 border-t bg-white/95 px-2.5 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-4`} style={{ borderColor: C.hair }}>
                    <Progress percent={percentComplete} />
                    <button type="button" onClick={handleSubmit} disabled={submitting}
                        className="mt-2.5 flex w-full items-center tracking-wider justify-center gap-1.5 rounded-xl px-5 py-3 text-[13.5px] font-bold text-white transition-opacity duration-150 disabled:opacity-60"
                        style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{submitLabel} </>}
                    </button>
                </div>
            )}
        </div>
    );
}