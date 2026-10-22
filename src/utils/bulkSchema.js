// src/utils/bulkSchema.js
// Single source of truth for the bulk Excel template: columns, parsing, validation and the
// helpers that turn a row into the same object shape the add-product wizard uses.
//
// DESIGN: the parser is LENIENT. A row is never thrown away because one cell is wrong. Whatever can be
// read is kept; whatever is missing or unclear is left empty and the seller completes it on the review
// page (every problem there has its own field, message and "jump to it" link). Delivery states and cities
// are NOT in the sheet any more: the seller picks them on the website with checkboxes.
import { VALIDITY_OPTIONS } from "../shared/listingValidity.js";
import { MARKETING_SERVICES, normalizeServiceKeys } from "../shared/marketingServices.js";
import { validateDelivery } from "../components/grow/GrowDeliveryPicker.jsx";

export const MAX_ROWS = 200;
export const SAMPLE_PREFIX = "[SAMPLE]";
export const UNITS = ["Pieces", "Kg", "Grams", "Litres", "Millilitres", "Dozen", "Tons"]; // same as the wizard
export const GST = [0, 0.25, 3, 5, 12, 18, 28];
export const YES_NO = ["Yes", "No"];
export const BASIS = [["per_unit", "Per Unit"], ["per_pack", "Per Pack"], ["per_master_pack", "Per Master Pack"]];
export const FULFIL = [["ready_stock", "Ready stock"], ["made_to_order", "Made after order"]];
export const MODES = [["all", "All of India"], ["exclude", "All India except some"], ["include", "Only some places"]];
// older wording that is still accepted when someone types it
const FULFIL_ALIAS = { "made-to-order": "made_to_order", "made to order": "made_to_order" };
const MODE_ALIAS = { "all except some": "exclude" };
export const VALIDITY = VALIDITY_OPTIONS.filter((o) => o.hours >= 24); // the "1 min" test option is left out
export const SERVICES = MARKETING_SERVICES.filter((s) => !s.required); // Product Listing is always on

/* kind: text | list | int | dec ; req = always required ; cond = required only in some cases */
const C = (key, header, o = {}) => ({ key, header, w: 16, req: false, cond: false, kind: "text", ...o });
export const COLUMNS = [
    C("name", "Product Name", { req: true, w: 34, note: "The name buyers will see. Do not start it with [SAMPLE]." }),
    C("hasBrand", "Has Brand", { req: true, w: 11, kind: "list", list: "yn", note: "Does the product have a brand name? Choose Yes or No." }),
    C("brand", "Brand Name", { cond: true, w: 22, note: "Write the brand name. Only needed when Has Brand = Yes." }),
    C("unit", "Unit", { req: true, kind: "list", list: "unit", note: "The smallest measure you sell in (for example Pieces or Kg). Pick from the list." }),
    C("packSize", "Items In 1 Pack", { req: true, kind: "dec", min: 0, note: "How many units are inside one Pack. For example 4." }),
    C("outer", "Has Outer Pack", { req: true, kind: "list", list: "yn", note: "Is there a bigger box (Master Pack) that holds several Packs? Yes or No." }),
    C("packsPerOuter", "Packs In 1 Outer Pack", { cond: true, kind: "int", min: 2, note: "How many Packs are in one outer pack. Only needed when Has Outer Pack = Yes. Whole number, 2 or more." }),
    C("moq", "Minimum Order", { req: true, kind: "int", min: 1, note: "The smallest order a buyer can place. Count in Packs, or in Master Packs when there is an outer pack. Whole number." }),
    C("sample", "Give Sample", { req: true, kind: "list", list: "yn", note: "Can buyers get a sample? Yes or No." }),
    C("sampleQty", "Sample Quantity", { cond: true, kind: "dec", min: 0, note: "How many units in a sample. Only needed when Give Sample = Yes." }),
    C("gst", "GST %", { req: true, kind: "list", list: "gst", w: 10, note: "Pick the GST % from the list." }),
    C("basis", "Price Is For", { req: true, kind: "list", list: "basis", note: "Is your price for 1 Unit, 1 Pack or 1 Master Pack? Master Pack is only possible when Has Outer Pack = Yes." }),
    C("price", "Price In Rupees", { req: true, kind: "dec", min: 0, w: 14, note: "Your price in rupees, for the choice in Price Is For." }),
    C("inc", "GST Included In Price", { req: true, kind: "list", list: "yn", note: "Does your price already include GST? Yes or No." }),
    C("fr", "Delivery Charge Included", { req: true, kind: "list", list: "yn", note: "Is the delivery (transport) charge already in your price? Yes or No." }),
    C("valid", "Price Valid For", { req: true, kind: "list", list: "valid", note: "How long your price stays valid. Pick from the list." }),
    C("fulfil", "Stock Type", { req: true, kind: "list", list: "fulfil", note: "Ready stock = you have it now. Made after order = you make it after the order comes." }),
    C("stock", "Stock Available", { cond: true, kind: "dec", min: 0, note: "How much stock you have. Only for Ready stock. Count in Packs, or Master Packs when there is an outer pack." }),
    C("lead", "Days To Make", { cond: true, kind: "int", min: 0, note: "How many days you need to make it. Only for Made after order. Whole number." }),
    C("mode", "Where Do You Deliver", { req: true, kind: "list", list: "mode", w: 24, note: "Pick one. If you choose anything except All of India, you will pick the states and cities on the website after upload." }),
    C("ret", "Return Policy", { req: true, kind: "list", list: "ret", w: 30, note: "Pick from the list." }),
    C("war", "Warranty", { req: true, kind: "list", list: "war", w: 26, note: "Pick from the list." }),
    ...SERVICES.map((s) => C(`svc_${s.key}`, `Promo - ${s.label}`, {
        kind: "list", list: "yn", w: 18, note: `Choose Yes to add this promotion (+${s.percent}%). Empty means No. Product Listing (+0.25%) is always included.`,
    })),
    C("note", "Note For Us", { w: 30, note: "Optional. Anything our team should know." }),
];

export const getLists = (policy) => ({
    yn: YES_NO, unit: UNITS, gst: GST.map(String), basis: BASIS.map((b) => b[1]), fulfil: FULFIL.map((f) => f[1]),
    valid: VALIDITY.map((v) => v.label), mode: MODES.map((m) => m[1]),
    ret: policy.ret.map((o) => o.label), war: policy.war.map((o) => o.label),
});

const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
export const normHeader = (h) => norm(String(h || "").replace(/\*/g, ""));
const yn = (v) => {
    const s = norm(v);
    if (["yes", "y", "true"].includes(s)) return true;
    if (["no", "n", "false"].includes(s)) return false;
    return null;
};
const numOf = (v) => {
    const s = String(v ?? "").replace(/[₹,%\s]/g, "");
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
};
const pick = (pairs, v, alias = {}) => {
    const s = norm(v);
    if (alias[s]) return pairs.find(([k]) => k === alias[s]) || null;
    return pairs.find(([k, l]) => norm(l) === s || norm(k) === s) || null;
};

export const blankItem = () => ({
    n: "", b: "", bi: null, nb: false, im: [], cert: [], note: "",
    u: "", ps: "", op: null, mps: "", moq: "", sm: null, sq: "",
    gst: "", price: "", basis: "", inc: null, fr: null, val: "", sl: [],
    ful: "", stock: "", lead: "", dl: { mode: "", exS: [], exC: {}, inS: [], inC: {} },
    ret: "", war: "", ms: normalizeServiceKeys([]),
    ba: { mode: "public", buyers: [] },
});

/* ------------------------------ one row (lenient) ------------------------------ */
// raw: { [columnKey]: string }   ctx: { policy: { ret, war } }
// Returns { data, fixes, notes }:
//   fixes = something in the file was unclear or wrong. It is left empty for the seller to complete on screen.
//   notes = a value was ignored because another answer made it unnecessary.
export function parseRow(raw, ctx) {
    const H = Object.fromEntries(COLUMNS.map((c) => [c.key, c.header]));
    const fixes = [], notes = [];
    const fix = (key, field, msg) => fixes.push({ col: H[key], field, msg });
    const note = (key, msg) => notes.push({ col: H[key], msg });
    const filled = (k) => String(raw[k] ?? "").trim() !== "";
    const P = blankItem();

    P.n = String(raw.name || "").trim();
    if (P.n.length > 150) { P.n = P.n.slice(0, 150); fix("name", "n", "The product name was longer than 150 letters, so it was shortened."); }

    const hasBrand = yn(raw.hasBrand);
    if (filled("hasBrand") && hasBrand === null) fix("hasBrand", "b", `"${raw.hasBrand}" is not Yes or No.`);
    if (hasBrand === false) {
        P.nb = true; P.b = "";
        if (filled("brand")) note("brand", "Brand Name was ignored because Has Brand is No.");
    } else {
        P.b = String(raw.brand || "").trim();
    }

    const unit = UNITS.find((x) => norm(x) === norm(raw.unit));
    if (!unit && filled("unit")) fix("unit", "u", `"${raw.unit}" is not in the Unit list.`);
    P.u = unit || "";

    const ps = numOf(raw.packSize);
    if (ps > 0) P.ps = String(ps); else if (filled("packSize")) fix("packSize", "ps", "Items In 1 Pack must be a number above 0.");

    const outer = yn(raw.outer);
    if (filled("outer") && outer === null) fix("outer", "op", `"${raw.outer}" is not Yes or No.`);
    P.op = outer;
    if (outer === true) {
        const n = numOf(raw.packsPerOuter);
        if (Number.isInteger(n) && n >= 2) P.mps = String(n);
        else if (filled("packsPerOuter")) fix("packsPerOuter", "mps", "Packs In 1 Outer Pack must be a whole number, 2 or more.");
    } else if (outer === false && filled("packsPerOuter")) {
        note("packsPerOuter", "Packs In 1 Outer Pack was ignored because Has Outer Pack is No.");
    }

    const moq = numOf(raw.moq);
    if (Number.isInteger(moq) && moq >= 1) P.moq = String(moq); else if (filled("moq")) fix("moq", "moq", "Minimum Order must be a whole number, 1 or more.");

    const sm = yn(raw.sample);
    if (filled("sample") && sm === null) fix("sample", "sm", `"${raw.sample}" is not Yes or No.`);
    P.sm = sm;
    if (sm === true) {
        const q = numOf(raw.sampleQty);
        if (q > 0) P.sq = String(q); else if (filled("sampleQty")) fix("sampleQty", "sq", "Sample Quantity must be a number above 0.");
    } else if (sm === false && filled("sampleQty")) {
        note("sampleQty", "Sample Quantity was ignored because Give Sample is No.");
    }

    const gst = numOf(raw.gst);
    if (GST.includes(gst)) P.gst = gst; else if (filled("gst")) fix("gst", "gst", `GST % must be one of ${GST.join(", ")}.`);

    const basis = pick(BASIS, raw.basis);
    if (!basis && filled("basis")) fix("basis", "basis", `"${raw.basis}" is not in the Price Is For list.`);
    if (basis && basis[0] === "per_master_pack" && outer !== true) {
        fix("basis", "basis", "Per Master Pack needs Has Outer Pack = Yes. Please choose again on the next screen.");
    } else if (basis) P.basis = basis[0];

    const price = numOf(raw.price);
    if (price > 0) P.price = String(price); else if (filled("price")) fix("price", "price", "Price must be a number above 0.");

    const inc = yn(raw.inc);
    if (filled("inc") && inc === null) fix("inc", "inc", `"${raw.inc}" is not Yes or No.`);
    P.inc = inc;
    const fr = yn(raw.fr);
    if (filled("fr") && fr === null) fix("fr", "fr", `"${raw.fr}" is not Yes or No.`);
    P.fr = fr;

    const val = VALIDITY.find((v) => norm(v.label) === norm(raw.valid) || String(v.hours) === String(raw.valid || "").trim());
    if (!val && filled("valid")) fix("valid", "val", `"${raw.valid}" is not in the Price Valid For list.`);
    P.val = val ? val.hours : "";

    const ful = pick(FULFIL, raw.fulfil, FULFIL_ALIAS);
    if (!ful && filled("fulfil")) fix("fulfil", "ful", `"${raw.fulfil}" is not in the Stock Type list.`);
    P.ful = ful ? ful[0] : "";
    if (P.ful === "ready_stock") {
        const n = numOf(raw.stock);
        if (n !== null && n >= 0) P.stock = String(n); else if (filled("stock")) fix("stock", "stock", "Stock Available must be a number, 0 or more.");
        if (filled("lead")) note("lead", "Days To Make was ignored because the Stock Type is Ready stock.");
    } else if (P.ful === "made_to_order") {
        const n = numOf(raw.lead);
        if (Number.isInteger(n) && n >= 0) P.lead = String(n); else if (filled("lead")) fix("lead", "lead", "Days To Make must be a whole number.");
        if (filled("stock")) note("stock", "Stock Available was ignored because the Stock Type is Made after order.");
    }

    const mode = pick(MODES, raw.mode, MODE_ALIAS);
    if (!mode && filled("mode")) fix("mode", "dl", `"${raw.mode}" is not in the Where Do You Deliver list.`);
    P.dl.mode = mode ? mode[0] : "";

    const ret = ctx.policy.ret.find((o) => norm(o.label) === norm(raw.ret) || norm(o.key) === norm(raw.ret));
    if (ret) P.ret = ret.key; else if (filled("ret")) fix("ret", "ret", `"${raw.ret}" is not in the Return Policy list.`);
    const war = ctx.policy.war.find((o) => norm(o.label) === norm(raw.war) || norm(o.key) === norm(raw.war));
    if (war) P.war = war.key; else if (filled("war")) fix("war", "war", `"${raw.war}" is not in the Warranty list.`);

    const on = [];
    for (const s of SERVICES) {
        const v = yn(raw[`svc_${s.key}`]);
        if (v === true) on.push(s.key);
    }
    P.ms = normalizeServiceKeys(on);
    P.note = String(raw.note || "").trim().slice(0, 500);
    return { data: P, fixes, notes };
}

/** Problems a seller must still solve, ignoring photos (those always come next, on the review page). */
export const quickIssues = (P, statesTotal = 30) => validateData(P, statesTotal).filter((e) => e.field !== "im");

/* ------------------------------ duplicates ------------------------------ */
// A product is identified by its name + brand (case, extra spaces ignored; "No brand" counts as an empty brand).
// This is the same identity the server uses, so a duplicate would be refused there anyway ("already listing").
const squash = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
export const productKey = (name, brand, noBrand) => {
    const n = squash(name);
    return n ? `${n}|${noBrand ? "" : squash(brand)}` : "";
};
export const itemKey = (P) => productKey(P.n, P.b, P.nb);

// rows: [{ rowNo, cells }] -> [{ rowNo, data, fixes, notes, issues, dup, ok }]
// ctx.listedKeys  = keys of products the seller already has in My products
// ctx.waitingKeys = keys of products already waiting from an earlier upload
// A row whose key is already known (or repeated earlier in this file) gets `dup` and must not be added again.
export function parseRows(rows, ctx) {
    const seen = new Map();
    return rows.map(({ rowNo, cells }) => {
        const r = parseRow(cells, ctx);
        const key = itemKey(r.data);
        let dup = null;
        if (key) {
            if (ctx.listedKeys?.has(key)) dup = { reason: "listed", msg: "You already have this product in My products." };
            else if (ctx.waitingKeys?.has(key)) dup = { reason: "waiting", msg: "This product is already waiting from an earlier upload." };
            else if (seen.has(key)) dup = { reason: "file", msg: `Same product name and brand as row ${seen.get(key)} in this file.` };
            else seen.set(key, rowNo);
        }
        const fixedFields = new Set(r.fixes.map((f) => f.field));
        const issues = dup ? [] : quickIssues(r.data, ctx.statesTotal || 30).filter((i) => !fixedFields.has(i.field));
        return { rowNo, ...r, dup, issues, ok: !dup && !issues.length && !r.fixes.length };
    });
}

/* ------------------------- review-page validation ------------------------- */
// Returns [{ section, field, msg }] in the order the form is laid out.
// Sections: product, packaging, price, delivery, terms, access.
export function validateData(P, statesTotal = 0) {
    const out = [];
    const add = (section, field, msg) => out.push({ section, field, msg });
    const outer = P.op === true && Number(P.mps) >= 2;

    if (String(P.n || "").trim().length < 2) add("product", "n", "Write the product name.");
    if (!P.nb && !String(P.b || "").trim()) add("product", "b", "Write the brand, or choose “No brand”.");
    if (!P.im?.length) add("product", "im", "Add at least one product photo.");

    if (!P.u) add("packaging", "u", "Choose the unit.");
    if (!(Number(P.ps) > 0)) add("packaging", "ps", "Write how many items are in 1 Pack.");
    if (P.op === null || P.op === undefined) add("packaging", "op", "Choose Yes or No for the outer pack.");
    if (P.op === true && !(Number(P.mps) >= 2)) add("packaging", "mps", "Write how many Packs are in 1 outer pack (2 or more).");
    if (!(Number(P.moq) > 0)) add("packaging", "moq", "Write the minimum order.");
    if (P.sm === null || P.sm === undefined) add("packaging", "sm", "Choose Yes or No for samples.");
    if (P.sm === true && !(Number(P.sq) > 0)) add("packaging", "sq", "Write the sample quantity.");

    if (P.gst === "" || P.gst == null) add("price", "gst", "Choose the GST %.");
    if (!P.basis) add("price", "basis", "Choose what your price is for.");
    if (P.basis === "per_master_pack" && !outer) add("price", "basis", "Master Pack price needs an outer pack.");
    if (!(Number(P.price) > 0)) add("price", "price", "Write a price above 0.");
    if (P.inc === null || P.inc === undefined) add("price", "inc", "Choose if GST is in your price.");
    if (P.fr === null || P.fr === undefined) add("price", "fr", "Choose if the delivery charge is in your price.");
    if (!(Number(P.val) > 0)) add("price", "val", "Choose how long the price is valid.");

    if (!P.ful) add("delivery", "ful", "Choose Ready stock or Made after order.");
    if (P.ful === "ready_stock" && P.stock === "") add("delivery", "stock", "Write how much stock you have.");
    if (P.ful === "made_to_order" && P.lead === "") add("delivery", "lead", "Write how many days you need to make it.");
    const dErr = validateDelivery(P.dl, statesTotal);
    if (dErr) add("delivery", "dl", dErr);
    else if (P.dl?.mode === "exclude" && !P.dl.exS.length && !Object.keys(P.dl.exC || {}).length) {
        add("delivery", "dl", "Choose the states you do not deliver to, or pick All of India.");
    }

    if (!P.ret) add("terms", "ret", "Choose a return policy.");
    if (!P.war) add("terms", "war", "Choose a warranty.");

    if (P.ba?.mode === "restricted" && !P.ba.buyers.length) add("access", "ba", "Add at least one buyer, or choose “Everyone can see it”.");
    return out;
}

/* ------------------------- catalogue match helpers ------------------------- */
// An existing catalogue product fixes unit / pack / GST (the backend uses them anyway).
export function applyMatch(P, m) {
    const outer = Number(m.masterPackSize) > 1;
    const next = {
        ...P, u: m.unit, ps: String(m.packSize), op: outer, mps: outer ? String(m.masterPackSize) : "",
        gst: m.gstPercent ?? P.gst,
    };
    if (P.op !== outer) { // sale unit changed, so these no longer mean the same thing
        next.moq = ""; next.stock = "";
        if (!outer && next.basis === "per_master_pack") next.basis = "";
    }
    return next;
}
export const packagingDiffers = (a, b) => ["u", "ps", "op", "mps", "gst"].some((k) => String(a[k]) !== String(b[k]));

/* ----------------------------- sample rows ----------------------------- */
export function sampleRows(policy) {
    const ret = policy.ret[0]?.label || "", war = policy.war[0]?.label || "";
    return [
        {
            name: `${SAMPLE_PREFIX} Premium Stainless Steel Hinges`, hasBrand: "Yes", brand: "Acme Hardware", unit: "Pieces", packSize: 4,
            outer: "No", moq: 10, sample: "Yes", sampleQty: 2, gst: 18, basis: "Per Pack", price: 250, inc: "No", fr: "Yes",
            valid: "1 month", fulfil: "Ready stock", stock: 500, mode: "All of India", ret, war,
            svc_category_visibility: "Yes", svc_buyer_discovery: "Yes", note: "Sample row. Delete or overwrite it.",
        },
        {
            name: `${SAMPLE_PREFIX} Industrial Lubricant Oil`, hasBrand: "Yes", brand: "FlowTech", unit: "Litres", packSize: 5,
            outer: "Yes", packsPerOuter: 4, moq: 3, sample: "No", gst: 18, basis: "Per Master Pack", price: 4200, inc: "Yes", fr: "No",
            valid: "2 weeks", fulfil: "Made after order", lead: 7, mode: "Only some places",
            ret, war, svc_targeted_promotions: "Yes", note: "You choose the states and cities on the website.",
        },
        {
            name: `${SAMPLE_PREFIX} Cotton Work Gloves`, hasBrand: "No", unit: "Dozen", packSize: 1, outer: "No", moq: 20,
            sample: "No", gst: 12, basis: "Per Pack", price: 540, inc: "No", fr: "No", valid: "2 weeks", fulfil: "Ready stock",
            stock: 120, mode: "All India except some", ret, war,
        },
    ];
}