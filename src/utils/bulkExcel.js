// src/utils/bulkExcel.js
// Template download + upload reading. exceljs is loaded on demand (it is large).
import { COLUMNS, MAX_ROWS, SAMPLE_PREFIX, getLists, sampleRows, normHeader } from "./bulkSchema.js";

const loadExcel = async () => { const m = await import("exceljs"); return m.default || m; };

const FILL = { req: "FFF4511E", cond: "FF1E78D6", opt: "FF586E75" };
const GREY = "FFE5E7EB";   // "you do not need this cell for this product"
const NEED = "FFFFD9B8";   // "this cell is still empty and needed"
const WRONG = "FFFFC9C9";  // "this choice does not fit your other answers"
const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb }, bgColor: { argb } });

/** Builds the workbook (no browser APIs, so it can be tested in Node). */
export function buildTemplate(ExcelJS, { policy }) {
    const wb = new ExcelJS.Workbook();
    wb.creator = "BBM Marketplace";

    const guide = wb.addWorksheet("Instructions", { properties: { tabColor: { argb: "FFFFD60A" } } });
    const ws = wb.addWorksheet("Products", { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
    // veryHidden: it does not even appear in Excel's "Unhide" list, so nobody edits the dropdown values by accident.
    const ls = wb.addWorksheet("Lists", { state: "veryHidden" });
    wb.views = [{ activeTab: 1 }];

    /* Lists sheet: every dropdown reads from here */
    const refs = {};
    Object.entries(getLists(policy)).forEach(([name, vals], i) => {
        const col = ls.getColumn(i + 1);
        ls.getCell(1, i + 1).value = name;
        vals.forEach((v, j) => { ls.getCell(j + 2, i + 1).value = name === "gst" ? Number(v) : v; });
        refs[name] = `Lists!$${col.letter}$2:$${col.letter}$${vals.length + 1}`;
    });

    /* Products sheet */
    ws.columns = COLUMNS.map((c) => ({ key: c.key, header: c.req ? `${c.header} *` : c.header, width: c.w }));
    const head = ws.getRow(1);
    head.height = 48;
    COLUMNS.forEach((c, i) => {
        const cell = head.getCell(i + 1);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.req ? FILL.req : c.cond ? FILL.cond : FILL.opt } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        if (c.note) cell.note = c.note;
    });

    const last = MAX_ROWS + 1;
    const idx = Object.fromEntries(COLUMNS.map((c, i) => [c.key, i + 1]));
    const L = (k) => ws.getColumn(idx[k]).letter;
    const rng = (k) => `${L(k)}2:${L(k)}${last}`;
    const A = (k) => `$${L(k)}2`; // column fixed, row relative (first data row)
    const R = (k) => `${L(k)}2`;  // the cell itself (first data row)
    const named = `${A("name")}<>""`;

    // Cells that only matter after another answer. `on` = the answer that switches them on.
    const DEP = {
        brand: { on: `${A("hasBrand")}="Yes"`, valid: `${A("hasBrand")}="Yes"`, msg: "First choose Has Brand = Yes. Then write the brand name." },
        packsPerOuter: {
            on: `${A("outer")}="Yes"`,
            valid: `AND(${A("outer")}="Yes",ISNUMBER(${R("packsPerOuter")}),INT(${R("packsPerOuter")})=${R("packsPerOuter")},${R("packsPerOuter")}>=2)`,
            msg: "First choose Has Outer Pack = Yes. Then write a whole number, 2 or more.",
        },
        sampleQty: {
            on: `${A("sample")}="Yes"`,
            valid: `AND(${A("sample")}="Yes",ISNUMBER(${R("sampleQty")}),${R("sampleQty")}>0)`,
            msg: "First choose Give Sample = Yes. Then write a number above 0.",
        },
        stock: {
            on: `${A("fulfil")}="Ready stock"`,
            valid: `AND(${A("fulfil")}="Ready stock",ISNUMBER(${R("stock")}),${R("stock")}>=0)`,
            msg: "Only for Ready stock. First choose Stock Type = Ready stock. Then write a number.",
        },
        lead: {
            on: `${A("fulfil")}="Made after order"`,
            valid: `AND(${A("fulfil")}="Made after order",ISNUMBER(${R("lead")}),INT(${R("lead")})=${R("lead")},${R("lead")}>=0)`,
            msg: "Only for Made after order. First choose Stock Type = Made after order. Then write whole days.",
        },
    };

    /* dropdowns, number checks, and "blocked until the earlier answer is given" checks */
    const stop = (title, error) => ({ showErrorMessage: true, errorStyle: "stop", errorTitle: title, error });
    COLUMNS.forEach((c) => {
        let spec = null;
        if (DEP[c.key]) spec = { type: "custom", allowBlank: true, formulae: [DEP[c.key].valid], ...stop("Not needed yet", DEP[c.key].msg) };
        else if (c.kind === "list") spec = { type: "list", allowBlank: true, formulae: [refs[c.list]], ...stop("Pick from the list", "Choose one of the values from the dropdown.") };
        else if (c.kind === "int") spec = { type: "whole", operator: "greaterThanOrEqual", allowBlank: true, formulae: [c.min], ...stop("Whole number", `Write a whole number, ${c.min} or more.`) };
        else if (c.kind === "dec") spec = { type: "decimal", operator: "greaterThan", allowBlank: true, formulae: [0], ...stop("Number", "Write a number above 0.") };
        if (!spec) return;
        if (c.note) Object.assign(spec, { showInputMessage: true, promptTitle: c.header.slice(0, 32), prompt: c.note.slice(0, 250) });
        ws.dataValidations.add(rng(c.key), spec);
    });

    /* colours: grey = skip this cell, orange = still needed, red = does not fit */
    let pr = 1;
    const paint = (key, formula, argb) => ws.addConditionalFormatting({
        ref: rng(key), rules: [{ type: "expression", priority: pr++, formulae: [formula], style: { fill: solid(argb) } }],
    });
    COLUMNS.forEach((c) => {
        if (c.key === "name") return;
        const dep = DEP[c.key];
        if (dep) {
            paint(c.key, `NOT(${dep.on})`, GREY);
            paint(c.key, `AND(${named},${dep.on},TRIM(${R(c.key)})="")`, NEED);
        } else if (c.req) {
            paint(c.key, `AND(${named},TRIM(${R(c.key)})="")`, NEED);
        }
    });
    paint("basis", `AND(${R("basis")}="Per Master Pack",${A("outer")}<>"Yes")`, WRONG);

    sampleRows(policy).forEach((row, i) => {
        COLUMNS.forEach((c, j) => {
            const cell = ws.getCell(i + 2, j + 1);
            if (row[c.key] !== undefined) cell.value = row[c.key];
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF8DC" } };
            cell.font = { italic: true, color: { argb: "FF6B7280" } };
        });
    });

    /* Instructions sheet */
    const lines = [
        ["BBM Marketplace · Bulk product upload", true],
        ["", false],
        ["How to use", true],
        ["1. Fill the Products sheet. One product in each row. Up to " + MAX_ROWS + " products in one file.", false],
        ["2. The 3 yellow rows start with [SAMPLE]. They are only examples. They are ignored when you upload. Write over them or delete them.", false],
        ["3. Click a cell to see a small help message. Use the dropdown wherever you see an arrow.", false],
        ["4. Upload the file on the Bulk upload page. If something is missing, you can fix it there. Nothing is thrown away.", false],
        ["5. On the website you will add photos and documents, choose delivery states and cities, and choose who can buy.", false],
        ["", false],
        ["Colours", true],
        ["Header colours:  Orange = always needed.   Blue = needed only in some cases.   Grey = optional.", false],
        ["Cell colours:  Grey cell = you do not need it for this product, skip it.   Orange cell = still empty and needed.   Red cell = this choice does not match your other answers.", false],
        ["", false],
        ["Good to know", true],
        ["• Brand Name: only when Has Brand = Yes.", false],
        ["• Packs In 1 Outer Pack: only when Has Outer Pack = Yes. A Master Pack is the big box that holds several Packs.", false],
        ["• Price Is For = Per Master Pack: only when Has Outer Pack = Yes.", false],
        ["• Sample Quantity: only when Give Sample = Yes.", false],
        ["• Ready stock needs Stock Available. Made after order needs Days To Make.", false],
        ["• Minimum Order and Stock Available are counted in Packs, or in Master Packs when there is an outer pack.", false],
        ["• Where Do You Deliver: pick one. For anything except All of India, you choose the states and cities with checkboxes on the website. Nothing to type here.", false],
        ["• Promo columns: Yes adds that promotion. Empty means No. Product Listing is always included.", false],
        ["• If the product is already on the marketplace, its unit, pack size and GST are fixed and replace what you typed.", false],
        ["• Quantity discounts, photos, documents and who can buy are added on the website, not in this file.", false],
    ];
    lines.forEach(([t, b], i) => { const c = guide.getCell(i + 1, 1); c.value = t; c.font = { bold: b, size: b ? 13 : 11 }; c.alignment = { wrapText: true, vertical: "top" }; });
    guide.getColumn(1).width = 130;
    return wb;
}

export async function downloadTemplate({ policy }) {
    const ExcelJS = await loadExcel();
    const wb = buildTemplate(ExcelJS, { policy });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "bbm-bulk-product-upload-template.xlsx";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function cellText(v) {
    if (v == null) return "";
    if (typeof v === "object") {
        if (v instanceof Date) return v.toISOString();
        if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("").trim();
        if ("result" in v) return cellText(v.result);
        if ("text" in v) return cellText(v.text);
        return "";
    }
    return String(v).trim();
}

/** Reads the Products sheet. Returns { rows: [{ rowNo, cells }], samples }. Throws Error with a readable message. */
export async function readProductSheet(file) {
    if (file.size > 5 * 1024 * 1024) throw new Error("This file is larger than 5 MB. Remove extra formatting or split it.");
    const ExcelJS = await loadExcel();
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(await file.arrayBuffer()); } catch { throw new Error("Couldn't open this file. Upload the .xlsx template."); }
    const ws = wb.getWorksheet("Products") || wb.worksheets[0];
    if (!ws) throw new Error("The file has no sheets.");

    const keyByHeader = new Map(COLUMNS.map((c) => [normHeader(c.header), c.key]));
    const colOf = {};
    ws.getRow(1).eachCell({ includeEmpty: false }, (cell, n) => {
        const k = keyByHeader.get(normHeader(cellText(cell.value)));
        if (k) colOf[k] = n;
    });
    const missing = COLUMNS.filter((c) => c.req && !colOf[c.key]).map((c) => c.header);
    if (missing.length) throw new Error(`This is not the latest template (missing: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""}). Please download the new template and copy your products into it.`);

    const rows = [];
    let samples = 0;
    const lastRow = Math.min(ws.rowCount, 5000); // a file with stray formatting must not make us scan a million empty rows
    for (let r = 2; r <= lastRow; r += 1) {
        const row = ws.getRow(r);
        const cells = {};
        let any = false;
        for (const c of COLUMNS) {
            const t = colOf[c.key] ? cellText(row.getCell(colOf[c.key]).value) : "";
            cells[c.key] = t;
            if (t) any = true;
        }
        if (!any) continue;
        if (cells.name.toLowerCase().startsWith(SAMPLE_PREFIX.toLowerCase())) { samples += 1; continue; }
        rows.push({ rowNo: r, cells });
        if (rows.length > MAX_ROWS) throw new Error(`A file can hold at most ${MAX_ROWS} products. Split it into smaller files.`);
    }
    return { rows, samples };
}