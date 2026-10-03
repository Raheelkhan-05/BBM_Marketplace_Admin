// utils/rfqUtils.js
export const RFQ_UNITS = ["Pieces", "Kg", "Grams", "Litres", "Millilitres", "Dozen", "Tons"];

export const PAYMENT_OPTIONS = [
    { value: "advance", label: "Advance" },
    { value: "credit", label: "Credit" },
    { value: "flexible", label: "Flexible" },
];
export const FREQ_OPTIONS = [
    { value: "monthly", label: "Monthly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "yearly", label: "Yearly" },
];

export const EMPTY_RFQ_FORM = {
    productName: "",
    images: [],
    quantity: "",
    unit: "",
    packSize: "1",
    acceptEquivalent: false,
    specifications: "",
    paymentTerms: "",
    creditDays: "",
    deliveryCity: "",
    deliveryState: "",
    deliveryPincode: "",
    deliveryAddress: "",
    supplierScope: "any", // "any" | "specific"
    supplierLocations: null, // picker shape { country, mode, ... }
    consumptionType: "one_time",
    recurringFrequency: "",
    recurringQuantity: "",
};

export function validateRfqForm(f) {
    const e = {};
    if ((f.productName || "").trim().length < 2) e.productName = "Enter the product name.";
    if (!(Number(f.quantity) > 0)) e.quantity = "Enter the quantity you need.";
    if (!RFQ_UNITS.includes(f.unit)) e.unit = "Select a unit.";
    if (!(Number(f.packSize) > 0)) e.packSize = "Enter the pack size.";
    if (!f.paymentTerms) e.paymentTerms = "Select the expected payment terms.";
    if (f.paymentTerms === "credit" && f.creditDays !== "" && f.creditDays != null) {
        const d = Number(f.creditDays);
        if (!(d >= 1 && d <= 365)) e.creditDays = "Credit days must be between 1 and 365.";
    }
    if (!/^\d{6}$/.test(f.deliveryPincode || "")) e.deliveryPincode = "Enter a valid 6-digit pincode.";
    if (!(f.deliveryCity || "").trim()) e.deliveryCity = "Enter the delivery city.";
    if (!(f.deliveryState || "").trim()) e.deliveryState = "Enter the delivery state.";
    if (f.supplierScope === "specific" && !f.supplierLocations?.country) e.supplierLocations = "Choose the supplier locations.";
    if (f.consumptionType === "regular") {
        if (!f.recurringFrequency) e.recurringFrequency = "Select how often you need this.";
        if (!(Number(f.recurringQuantity) > 0)) e.recurringQuantity = "Enter the recurring quantity.";
    }
    return e;
}

// ── locations: picker shape <-> flat persisted shape (same as the seller listing form) ──
export function flattenLocations(dl) {
    if (!dl?.country) return [];
    if (dl.mode === "include") {
        return [
            { type: "country", name: dl.country.name, code: dl.country.code, includeOnly: true },
            ...(dl.includedStates || []).map((state) => {
                const cities = dl.includedCitiesByState?.[state];
                return cities !== undefined ? { type: "state", name: state, includedCities: cities } : { type: "state", name: state };
            }),
        ];
    }
    return [
        { type: "country", name: dl.country.name, code: dl.country.code, excludedStates: dl.excludedStates || [] },
        ...Object.entries(dl.citiesByState || {})
            .filter(([, cities]) => cities?.length)
            .map(([state, cities]) => ({ type: "state", name: state, excludedCities: cities })),
    ];
}

export function unflattenLocations(flat) {
    if (!Array.isArray(flat) || !flat.length) return null;
    const countryEntry = flat.find((e) => e?.type === "country");
    if (!countryEntry) return null;
    const country = { name: countryEntry.name, code: countryEntry.code };
    const stateEntries = flat.filter((e) => e?.type === "state");
    if (countryEntry.includeOnly) {
        const includedCitiesByState = {};
        stateEntries.forEach((s) => { if (s.includedCities !== undefined) includedCitiesByState[s.name] = s.includedCities; });
        return { country, mode: "include", excludedStates: [], citiesByState: {}, includedStates: stateEntries.map((s) => s.name), includedCitiesByState };
    }
    const citiesByState = {};
    stateEntries.forEach((s) => { if (s.excludedCities !== undefined) citiesByState[s.name] = s.excludedCities; });
    return { country, mode: "exclude", excludedStates: countryEntry.excludedStates || [], citiesByState, includedStates: [], includedCitiesByState: {} };
}

export function locationSummary(flat) {
    if (!Array.isArray(flat) || !flat.length) return "Any location in India";
    const c = flat.find((e) => e?.type === "country");
    if (!c) return "Any location in India";
    if (c.includeOnly) {
        const n = flat.filter((e) => e.type === "state").length;
        return n ? `${n} selected state${n === 1 ? "" : "s"}` : "Any location in India";
    }
    const ex = (c.excludedStates || []).length;
    return ex ? `${c.name || "India"}, excluding ${ex} state${ex === 1 ? "" : "s"}` : "Any location in India";
}

export function toPayload(f) {
    return {
        productName: f.productName.trim(),
        images: f.images || [],
        quantity: Number(f.quantity),
        unit: f.unit,
        packSize: Number(f.packSize),
        acceptEquivalent: !!f.acceptEquivalent,
        specifications: (f.specifications || "").trim(),
        paymentTerms: f.paymentTerms,
        creditDays: f.paymentTerms === "credit" && f.creditDays !== "" ? Number(f.creditDays) : null,
        deliveryCity: f.deliveryCity.trim(),
        deliveryState: f.deliveryState.trim(),
        deliveryPincode: f.deliveryPincode.trim(),
        deliveryAddress: (f.deliveryAddress || "").trim(),
        supplierLocations: f.supplierScope === "specific" ? flattenLocations(f.supplierLocations) : [],
        consumptionType: f.consumptionType,
        recurringFrequency: f.consumptionType === "regular" ? f.recurringFrequency : null,
        recurringQuantity: f.consumptionType === "regular" ? Number(f.recurringQuantity) : null,
    };
}

export function fromDto(d) {
    const loc = unflattenLocations(d.supplierLocations);
    const specific = Array.isArray(d.supplierLocations) && d.supplierLocations.some((e) => e.type === "country" && (e.includeOnly || (e.excludedStates || []).length));
    return {
        ...EMPTY_RFQ_FORM,
        productName: d.productName || "",
        images: d.images || [],
        quantity: String(d.quantity ?? ""),
        unit: d.unit || "",
        packSize: String(d.packSize ?? "1"),
        acceptEquivalent: !!d.acceptEquivalent,
        specifications: d.specifications || "",
        paymentTerms: d.paymentTerms || "",
        creditDays: d.creditDays != null ? String(d.creditDays) : "",
        deliveryCity: d.deliveryCity || "",
        deliveryState: d.deliveryState || "",
        deliveryPincode: d.deliveryPincode || "",
        deliveryAddress: d.deliveryAddress || "",
        supplierScope: specific ? "specific" : "any",
        supplierLocations: specific ? loc : null,
        consumptionType: d.consumptionType || "one_time",
        recurringFrequency: d.recurringFrequency || "",
        recurringQuantity: d.recurringQuantity != null ? String(d.recurringQuantity) : "",
    };
}

// ── display helpers ──
export const fmtNum = (n) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: 3 });

export function timeAgo(iso) {
    if (!iso) return "";
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function paymentLabel(d) {
    if (d.paymentTerms === "credit") return d.creditDays ? `Credit · ${d.creditDays} days` : "Credit";
    return d.paymentTerms === "advance" ? "Advance" : "Flexible";
}

export function consumptionLabel(d) {
    if (d.consumptionType !== "regular") return "One-time";
    const f = { monthly: "month", quarterly: "quarter", yearly: "year" }[d.recurringFrequency] || "period";
    return `Regular · ${fmtNum(d.recurringQuantity)} ${d.unit}/${f}`;
}

// ── CSV (bulk upload) ──
export function parseCsv(text) {
    const t = text.replace(/^\uFEFF/, "");
    const firstLine = t.split(/\r?\n/, 1)[0] || "";
    const delim = firstLine.includes(",") ? "," : firstLine.includes(";") ? ";" : ",";
    const rows = [];
    let row = [];
    let cell = "";
    let inQ = false;
    for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        if (inQ) {
            if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
            else cell += ch;
        } else if (ch === '"') inQ = true;
        else if (ch === delim) { row.push(cell); cell = ""; }
        else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && t[i + 1] === "\n") i++;
            row.push(cell); cell = ""; rows.push(row); row = [];
        } else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

const csvEsc = (v) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const TEMPLATE_HEADERS = [
    "product_name", "quantity", "unit", "pack_size", "accept_equivalent", "specifications",
    "payment_terms", "credit_days", "consumption", "recurring_frequency", "recurring_quantity",
    "delivery_pincode", "delivery_city", "delivery_state", "delivery_address", "image_url",
];

export function buildTemplateCsv() {
    const samples = [
        ["Stainless Steel Hinges 4 inch", "500", "Pieces", "10", "yes", "SS304, satin finish", "credit", "30", "regular", "monthly", "200", "", "", "", "", ""],
        ["Industrial Lubricant Oil", "50", "Litres", "20", "no", "ISO VG 68", "advance", "", "one_time", "", "", "", "", "", "", ""],
    ];
    return "\uFEFF" + [TEMPLATE_HEADERS, ...samples].map((r) => r.map(csvEsc).join(",")).join("\r\n");
}

export function downloadText(filename, text, mime = "text/csv;charset=utf-8") {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
}

const UNIT_ALIAS = {
    pieces: "Pieces", piece: "Pieces", pc: "Pieces", pcs: "Pieces", nos: "Pieces", no: "Pieces",
    kg: "Kg", kgs: "Kg", kilogram: "Kg", kilograms: "Kg",
    gram: "Grams", grams: "Grams", g: "Grams", gm: "Grams", gms: "Grams",
    litre: "Litres", litres: "Litres", liter: "Litres", liters: "Litres", l: "Litres", ltr: "Litres",
    millilitre: "Millilitres", millilitres: "Millilitres", ml: "Millilitres",
    dozen: "Dozen", doz: "Dozen",
    ton: "Tons", tons: "Tons", tonne: "Tons", tonnes: "Tons", mt: "Tons",
};
const yes = (s) => /^(y|yes|true|1|equivalent|ok)$/i.test(String(s).trim());

function normPayment(s) {
    const v = String(s).toLowerCase();
    if (v.startsWith("adv")) return "advance";
    if (v.startsWith("cred")) return "credit";
    if (v.startsWith("flex")) return "flexible";
    return "";
}
function normFreq(s) {
    const v = String(s).toLowerCase();
    if (v.startsWith("month")) return "monthly";
    if (v.startsWith("quart")) return "quarterly";
    if (v.startsWith("year") || v.startsWith("annual")) return "yearly";
    return "";
}

// rows = parseCsv output (first row = headers). defaults = { pincode, city, state }.
export function csvToForms(rows, defaults = {}) {
    if (!rows.length) return { error: "The file is empty." };
    const [head, ...body] = rows;
    const keys = head.map((h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
    if (!keys.includes("product_name")) return { error: "Missing the product_name column. Please use the template." };

    const list = body.map((r, i) => {
        const g = (k) => { const j = keys.indexOf(k); return j < 0 ? "" : String(r[j] ?? "").trim(); };
        const regular = /^(regular|recurring)/i.test(g("consumption"));
        const url = g("image_url");
        const form = {
            ...EMPTY_RFQ_FORM,
            productName: g("product_name"),
            quantity: g("quantity"),
            unit: UNIT_ALIAS[g("unit").toLowerCase()] || g("unit"),
            packSize: g("pack_size") || "1",
            acceptEquivalent: yes(g("accept_equivalent")),
            specifications: g("specifications"),
            paymentTerms: normPayment(g("payment_terms")),
            creditDays: g("credit_days"),
            consumptionType: regular ? "regular" : "one_time",
            recurringFrequency: regular ? normFreq(g("recurring_frequency")) : "",
            recurringQuantity: regular ? g("recurring_quantity") : "",
            deliveryPincode: g("delivery_pincode") || defaults.pincode || "",
            deliveryCity: g("delivery_city") || defaults.city || "",
            deliveryState: g("delivery_state") || defaults.state || "",
            deliveryAddress: g("delivery_address"),
            images: /^https?:\/\//i.test(url) ? [url] : [],
        };
        return { line: i + 2, form, errors: validateRfqForm(form) };
    });
    return { rows: list };
}