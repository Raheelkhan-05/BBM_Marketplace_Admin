// utils/catalogBulkSchema.js
// Columns, parsing and validation for the full-hierarchy catalog bulk upload.
// The server (adminCatalogDrafts.controller.js) re-checks the same rules on submit.

export const MAX_ROWS = 1000;
export const MAX_PHOTOS = 8;

// key = field name inside a product draft. Optional columns are grey in the Excel sheet; required ones turn orange while empty.
export const COLS = [
    { key: "cat", header: "Category", required: true, width: 24, tip: "Top-level group, for example Lubricants. A name that already exists is reused. A new name creates a new category." },
    { key: "catImg", header: "Category Image Link", required: false, width: 26, tip: "Optional. Direct image link. Only used if this category is new. You can also add the image later on screen." },
    { key: "sub", header: "Subcategory", required: true, width: 26, tip: "Group inside the category, for example Two-wheeler engine oil." },
    { key: "subImg", header: "Subcategory Image Link", required: false, width: 26, tip: "Optional. Direct image link. Only used if this subcategory is new." },
    { key: "gp", header: "Generic Product", required: true, width: 30, tip: "The generic product this item belongs to, for example Motorcycle engine oil 1L bottle." },
    { key: "gpImg", header: "Generic Product Image Link", required: false, width: 28, tip: "Optional. Direct image link. Only used if this generic product is new." },
    { key: "n", header: "Product Name", required: true, width: 30, tip: "The product's own name, for example Shell Advance AX7 10W30." },
    { key: "b", header: "Brand Name", required: true, width: 20, tip: "The brand, for example Shell." },
    { key: "mf", header: "Manufacturer", required: true, width: 28, tip: "The company that makes it." },
    { key: "model", header: "Model / Part No / SKU", required: true, width: 22, tip: "Model number, part number or SKU." },
    { key: "grade", header: "Variant / Grade", required: false, width: 18, tip: "Optional. Grade or variant, for example 10W-30." },
    { key: "u", header: "Unit", required: true, width: 14, tip: "Pick from the list. The smallest measure this product is sold in." },
    { key: "ps", header: "Items In 1 Pack", required: true, width: 16, tip: "How many units are in 1 pack. Example: a 1 Litre bottle is 1." },
    { key: "mps", header: "Packs In 1 Outer Box", required: true, width: 20, tip: "How many packs are in 1 outer box. Type 1 if there is no outer box." },
    { key: "spec", header: "Specifications", required: false, width: 36, tip: "Optional. Write Name: Value pairs separated by a semicolon. Example: Volume: 1L; API Grade: SL" },
    { key: "imgs", header: "Photo Links", required: false, width: 40, tip: "Optional. Direct photo links separated by commas. You can also add photos on screen." },
];

export const FIELD_COL = {
    cat: "Category", sub: "Subcategory", gp: "Generic Product",
    catImg: "Category Image Link", subImg: "Subcategory Image Link", gpImg: "Generic Product Image Link",
    n: "Product Name", b: "Brand Name", mf: "Manufacturer", model: "Model / Part No / SKU",
    u: "Unit", ps: "Items In 1 Pack", mps: "Packs In 1 Outer Box", im: "Photo Links",
};

export const norm = (s) => String(s ?? "").trim().toLowerCase();
const clean = (s) => String(s ?? "").trim();
const len = (v) => clean(v).length;

export const blankData = () => ({
    cat: "", catImg: "", sub: "", subImg: "", gp: "", gpImg: "",
    n: "", b: "", mf: "", model: "", grade: "",
    u: "", ps: "", mps: "", spec: [], im: [],
});

// Same rules the server uses for image links.
export function isDirectImageUrl(url) {
    const u = clean(url);
    if (!/^https?:\/\/\S+$/i.test(u)) return false;
    if (/^https?:\/\/ibb\.co\//i.test(u)) return false;
    if (/drive\.google\.com\/file\/d\//i.test(u) && !/\/thumbnail\?/i.test(u)) return false;
    if (/drive\.google\.com\/open\?/i.test(u)) return false;
    return true;
}
const isHttp = (u) => /^https?:\/\/\S+$/i.test(clean(u));

export function parseSpec(raw) {
    return String(raw || "").split(/[;\n]+/).map((s) => s.trim()).filter(Boolean).map((pair) => {
        const i = pair.indexOf(":");
        if (i === -1) return null;
        const key = pair.slice(0, i).trim(), value = pair.slice(i + 1).trim();
        return key && value ? { key, value } : null;
    }).filter(Boolean);
}
const splitLinks = (raw) => String(raw || "").split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
const num = (s) => clean(s).replace(/,/g, "");

// One sheet row (strings keyed by COLS.key) -> { data, notes }
export function rowToData(raw, units = []) {
    const notes = [];
    const unitRaw = clean(raw.u);
    const unit = units.find((x) => norm(x) === norm(unitRaw)) || unitRaw;
    const specRaw = clean(raw.spec);
    const spec = parseSpec(specRaw);
    if (specRaw && !spec.length) notes.push("Specifications could not be read (use Name: Value pairs separated by ;), so they were left empty.");
    let im = splitLinks(raw.imgs);
    if (im.length > MAX_PHOTOS) { notes.push(`Only the first ${MAX_PHOTOS} photo links are used.`); im = im.slice(0, MAX_PHOTOS); }
    return {
        notes,
        data: {
            cat: clean(raw.cat), catImg: clean(raw.catImg), sub: clean(raw.sub), subImg: clean(raw.subImg), gp: clean(raw.gp), gpImg: clean(raw.gpImg),
            n: clean(raw.n), b: clean(raw.b), mf: clean(raw.mf), model: clean(raw.model), grade: clean(raw.grade),
            u: unit, ps: num(raw.ps), mps: num(raw.mps), spec, im: [...new Set(im)],
        },
    };
}

export const pathKey = (d) => [d.cat, d.sub, d.gp].map(norm).join("|");
// Identity of a product: its place in the hierarchy + name + brand. "" while any part is missing.
export function itemKey(d) {
    if (!d || ![d.cat, d.sub, d.gp, d.n, d.b].every((x) => len(x) > 0)) return "";
    return `${pathKey(d)}|${norm(d.n)}|${norm(d.b)}`;
}

// hz = { catNew, subNew, gpNew } (from the catalog check). A hierarchy image is only checked when that level is new.
// lenient = right after reading the sheet: Drive / imgbb links are fine because the server converts them when saving.
export function validateData(d, units = [], hz = {}, lenient = false) {
    const e = [];
    const add = (section, field, msg) => e.push({ section, field, msg });
    const okUrl = lenient ? isHttp : isDirectImageUrl;

    if (len(d.cat) < 2) add("hier", "cat", "Enter the category name (at least 2 letters).");
    if (len(d.sub) < 2) add("hier", "sub", "Enter the subcategory name (at least 2 letters).");
    if (len(d.gp) < 2) add("hier", "gp", "Enter the generic product name (at least 2 letters).");
    [["catImg", "catNew"], ["subImg", "subNew"], ["gpImg", "gpNew"]].forEach(([f, h]) => {
        if (hz[h] && clean(d[f]) && !okUrl(d[f])) add("hier", f, "This image link can't be used. Remove it or upload the image instead.");
    });

    if (len(d.n) < 2) add("product", "n", "Enter the product name (at least 2 letters).");
    if (!len(d.b)) add("product", "b", "Enter the brand name.");
    if (!len(d.mf)) add("product", "mf", "Enter the manufacturer.");
    if (!len(d.model)) add("product", "model", "Enter the model, part number or SKU.");

    if (!units.includes(d.u)) add("packing", "u", "Pick a unit.");
    if (!(Number(d.ps) > 0)) add("packing", "ps", `Enter how many ${d.u || "items"} are in 1 pack.`);
    const mps = Number(d.mps);
    if (!(Number.isInteger(mps) && mps >= 1)) add("packing", "mps", "Enter how many packs are in 1 outer box. Type 1 if there is none.");

    if (!d.im?.length) add("photos", "im", "Add at least one product photo.");
    else if (d.im.some((u) => !okUrl(u))) add("photos", "im", "Some photo links can't be used. Remove them and upload the photo again.");
    return e;
}
export const quickIssues = (d, units) => validateData(d, units);

// rawRows: sheet rows. checks (optional, parallel to rawRows): server check result per row. waitingKeys: itemKeys already in unfinished drafts.
export function parseRows(rawRows, { units, checks = null, waitingKeys = new Set() }) {
    const base = rawRows.map((r) => ({ rowNo: r.rowNo, ...rowToData(r, units) }));

    // a NEW category / subcategory / generic product that appears on many rows: share the first image link given for it
    const levels = [["cat", "catImg", (d) => norm(d.cat)], ["sub", "subImg", (d) => `${norm(d.cat)}|${norm(d.sub)}`], ["gp", "gpImg", pathKey]];
    const first = { cat: new Map(), sub: new Map(), gp: new Map() };
    base.forEach(({ data }) => levels.forEach(([lv, f, k]) => { const key = k(data); if (data[f] && !first[lv].has(key)) first[lv].set(key, data[f]); }));

    let ignoredImages = 0;
    const seen = new Map();
    const results = base.map((x, i) => {
        const d = { ...x.data };
        const c = checks?.[i] || null;
        levels.forEach(([lv, f, k]) => {
            if (c?.[lv]?.exists) { if (d[f]) { d[f] = ""; ignoredImages += 1; } }
            else if (!d[f]) d[f] = first[lv].get(k(d)) || "";
        });
        const hz = c ? { catNew: !c.cat.exists, subNew: !c.sub.exists, gpNew: !c.gp.exists } : {};
        const errs = validateData(d, units, hz, true);
        // photos can be added on screen, so "no photo yet" is counted separately and does not make a row "need a fix"
        const noPhoto = !d.im.length;
        const fixes = errs.filter((e) => !(e.field === "im" && noPhoto)).map((e) => ({ col: FIELD_COL[e.field] || e.field, msg: e.msg }));
        return { rowNo: x.rowNo, data: d, notes: x.notes, noPhoto, fixes, issues: [], checkDup: !!c?.dup, dup: null, ok: false };
    });

    results.forEach((r) => {
        const key = itemKey(r.data);
        if (key) {
            if (r.checkDup) r.dup = { msg: "This product is already in the catalog under this generic product." };
            else if (waitingKeys.has(key)) r.dup = { msg: "This product is already waiting from an earlier upload." };
            else if (seen.has(key)) r.dup = { msg: `Row ${seen.get(key)} in this file has the same category, product name and brand.` };
            else seen.set(key, r.rowNo);
        }
        r.ok = !r.dup && r.fixes.length === 0;
    });
    return { results, ignoredImages };
}