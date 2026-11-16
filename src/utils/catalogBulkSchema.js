// utils/catalogBulkSchema.js
// Columns, parsing and validation for the catalog bulk upload.
// A product is identified by name + brand across the whole catalog (same rule as the DB index hs_gpb_identity_uq).
// Products are added UNMAPPED (no category path): they show up under "Needs mapping" until an admin maps them.
// The server (adminCatalogDrafts.controller.js) re-checks the same rules on submit.

export const MAX_ROWS = 1000;
export const MAX_PHOTOS = 8;
// Keep in sync with the seller wizard (bulkSchema.js GST) and the server.
export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28];

// key = field name inside a product draft. Optional columns are grey in the Excel sheet; required ones turn orange while empty.
export const COLS = [
    { key: "n", header: "Product Name", required: true, width: 32, tip: "The product's own name, for example Shell Advance AX7 10W30." },
    { key: "b", header: "Brand Name", required: true, width: 20, tip: "The brand, for example Shell." },
    { key: "model", header: "Model / Part No / SKU", required: true, width: 22, tip: "Model number, part number or SKU." },
    { key: "grade", header: "Variant / Grade", required: false, width: 18, tip: "Optional. Grade or variant, for example 10W-30." },
    { key: "u", header: "Unit", required: true, width: 14, tip: "Pick from the list. The smallest measure this product is sold in." },
    { key: "ps", header: "Items In 1 Pack", required: true, width: 16, tip: "How many units are in 1 pack. Example: a 1 Litre bottle is 1." },
    { key: "mps", header: "Packs In 1 Outer Box", required: true, width: 20, tip: "How many packs are in 1 outer box. Type 1 if there is no outer box." },
    { key: "gst", header: "GST %", required: true, width: 10, tip: "Pick the GST rate of this product from the list. Every seller who lists it uses this rate." },
    { key: "spec", header: "Specifications", required: false, width: 36, tip: "Optional. Write Name: Value pairs separated by a semicolon. Example: Volume: 1L; API Grade: SL" },
    { key: "imgs", header: "Photo Links", required: false, width: 40, tip: "Optional. Direct photo links separated by commas. You can also add photos on screen." },
];

export const FIELD_COL = {
    n: "Product Name", b: "Brand Name", model: "Model / Part No / SKU",
    u: "Unit", ps: "Items In 1 Pack", mps: "Packs In 1 Outer Box", gst: "GST %", im: "Photo Links",
};

export const norm = (s) => String(s ?? "").trim().toLowerCase();
const clean = (s) => String(s ?? "").trim();
const len = (v) => clean(v).length;

export const blankData = () => ({
    n: "", b: "", model: "", grade: "",
    u: "", ps: "", mps: "", gst: "", spec: [], im: [],
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

// "18", "18%", 18 -> "18".  Anything that is not an allowed rate -> "" (and `bad` holds what was typed).
export function parseGst(raw) {
    const s = clean(raw).replace(/[%\s]/g, "");
    if (!s) return { value: "" };
    const n = Number(s);
    const hit = Number.isFinite(n) ? GST_RATES.find((g) => g === n) : undefined;
    return hit === undefined ? { value: "", bad: clean(raw) } : { value: String(hit) };
}
export const gstOk = (v) => clean(v) !== "" && GST_RATES.includes(Number(v)); // "" must not count as 0%

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
    const g = parseGst(raw.gst);
    if (g.bad) notes.push(`GST "${g.bad}" is not an allowed rate (${GST_RATES.join(", ")}), so it was left empty.`);
    return {
        notes,
        data: {
            n: clean(raw.n), b: clean(raw.b), model: clean(raw.model), grade: clean(raw.grade),
            u: unit, ps: num(raw.ps), mps: num(raw.mps), gst: g.value, spec, im: [...new Set(im)],
        },
    };
}

// Identity of a product: name + brand. "" while either is missing.
export function itemKey(d) {
    if (!d || !len(d.n) || !len(d.b)) return "";
    return `${norm(d.n)}|${norm(d.b)}`;
}

// lenient = right after reading the sheet: Drive / imgbb links are fine because the server converts them when saving.
// Errors come back in the order the review form is laid out.
export function validateData(d, units = [], lenient = false) {
    const e = [];
    const add = (section, field, msg) => e.push({ section, field, msg });
    const okUrl = lenient ? isHttp : isDirectImageUrl;

    if (len(d.n) < 2) add("product", "n", "Enter the product name (at least 2 letters).");
    if (!len(d.b)) add("product", "b", "Enter the brand name.");
    if (!len(d.model)) add("product", "model", "Enter the model, part number or SKU.");

    if (!units.includes(d.u)) add("packing", "u", "Pick a unit.");
    if (!(Number(d.ps) > 0)) add("packing", "ps", `Enter how many ${d.u || "items"} are in 1 pack.`);
    const mps = Number(d.mps);
    if (!(clean(d.mps) !== "" && Number.isInteger(mps) && mps >= 1)) add("packing", "mps", "Enter how many packs are in 1 outer box. Type 1 if there is none.");
    if (!gstOk(d.gst)) add("packing", "gst", "Choose the GST % of this product.");

    if (!d.im?.length) add("photos", "im", "Add at least one product photo.");
    else if (d.im.some((u) => !okUrl(u))) add("photos", "im", "Some photo links can't be used. Remove them and upload the photo again.");
    return e;
}
export const quickIssues = (d, units) => validateData(d, units);

// rawRows: sheet rows. checks (optional, parallel to rawRows): server check result per row ({ dup }).
// waitingKeys: itemKeys already in unfinished drafts.
export function parseRows(rawRows, { units, checks = null, waitingKeys = new Set() }) {
    const seen = new Map();
    const results = rawRows.map((raw, i) => {
        const { data, notes } = rowToData(raw, units);
        const errs = validateData(data, units, true);
        // photos can be added on screen, so "no photo yet" is counted separately and does not make a row "need a fix"
        const noPhoto = !data.im.length;
        const fixes = errs.filter((e) => !(e.field === "im" && noPhoto)).map((e) => ({ col: FIELD_COL[e.field] || e.field, msg: e.msg }));

        let dup = null;
        const key = itemKey(data);
        if (key) {
            if (checks?.[i]?.dup) dup = { msg: "This product is already in the catalog (same name and brand)." };
            else if (waitingKeys.has(key)) dup = { msg: "This product is already waiting from an earlier upload." };
            else if (seen.has(key)) dup = { msg: `Row ${seen.get(key)} in this file has the same product name and brand.` };
            else seen.set(key, raw.rowNo);
        }
        return { rowNo: raw.rowNo, data, notes, noPhoto, fixes, issues: [], dup, ok: !dup && fixes.length === 0 };
    });
    return { results };
}