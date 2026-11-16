// utils/catalogBulkExcel.js
// Builds the template (dropdowns for Unit and GST %, grey = optional, orange = still needed, tips on click, hidden Lists sheet)
// and reads a filled-in file back. Needs the "exceljs" package (already used by the seller bulk upload).
import { COLS, MAX_ROWS, GST_RATES, norm } from "./catalogBulkSchema.js";

const loadExcel = async () => { const m = await import("exceljs"); return m.default || m; };

const TEAL = "FF047084", GREY = "FFF1F5F9", ORANGE = "FFFFD8A8", INK = "FF0F172A";
const headerText = (c) => (c.required ? c.header : `${c.header} (optional)`);
const normHeader = (s) => norm(String(s).replace(/\(optional\)/i, "")).replace(/[^a-z0-9]+/g, " ").trim();

const EXAMPLES = [
    { n: "Shell Advance AX7 10W30", b: "Shell", model: "AX7-10W30-1L", grade: "10W-30", u: "Litres", ps: 1, mps: 12, gst: 18, spec: "Volume: 1L; API Grade: SL", imgs: "https://example.com/front.jpg, https://example.com/back.jpg" },
    { n: "Castrol Activ 20W40", b: "Castrol", model: "ACT-20W40-1L", grade: "20W-40", u: "Litres", ps: 1, mps: 12, gst: 18, spec: "Volume: 1L", imgs: "https://example.com/castrol.jpg" },
    { n: "SKF 6205-2RS", b: "SKF", model: "6205-2RS", grade: "", u: "Pieces", ps: 1, mps: 50, gst: 18, spec: "", imgs: "" },
];

const CELL_TYPES = (c, unitCount) => {
    const base = {
        allowBlank: true, showInputMessage: true, showErrorMessage: true,
        promptTitle: c.header.slice(0, 32), prompt: c.tip.slice(0, 255), errorTitle: "Please check this box",
    };
    if (c.key === "u") return { ...base, type: "list", formulae: [`Lists!$A$1:$A$${Math.max(unitCount, 1)}`], error: "Pick a unit from the list." };
    if (c.key === "gst") return { ...base, type: "list", formulae: [`Lists!$B$1:$B$${GST_RATES.length}`], error: "Pick a GST % from the list." };
    if (c.key === "ps") return { ...base, type: "decimal", operator: "greaterThan", formulae: [0], error: "Enter a number bigger than 0." };
    if (c.key === "mps") return { ...base, type: "whole", operator: "greaterThanOrEqual", formulae: [1], error: "Enter a whole number, 1 or more." };
    return { ...base, type: "textLength", operator: "lessThanOrEqual", formulae: [c.key === "imgs" || c.key === "spec" ? 1500 : 300], error: "This text is too long." };
};

function styleHeader(ws) {
    const row = ws.getRow(1);
    row.height = 38;
    COLS.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.value = headerText(c);
        cell.font = { bold: true, color: { argb: c.required ? "FFFFFFFF" : "FF475569" }, size: 11 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.required ? TEAL : "FFE2E8F0" } };
        cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    });
    COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
    ws.views = [{ state: "frozen", ySplit: 1 }];
}

export async function downloadCatalogTemplate({ units }) {
    const ExcelJS = await loadExcel();
    const wb = new ExcelJS.Workbook();
    wb.creator = "BBM Marketplace";

    /* Products: the sheet the admin fills in */
    const ws = wb.addWorksheet("Products");
    styleHeader(ws);
    const last = MAX_ROWS + 1;
    const lastLetter = ws.getColumn(COLS.length).letter;
    for (let r = 2; r <= last; r++) {
        const row = ws.getRow(r);
        COLS.forEach((c, i) => {
            const cell = row.getCell(i + 1);
            if (!c.required) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } }; // grey = can be skipped
            cell.dataValidation = CELL_TYPES(c, units.length);
        });
    }
    // orange = a needed box that is still empty on a row that has been started
    let priority = 1;
    COLS.forEach((c, i) => {
        if (!c.required) return;
        const L = ws.getColumn(i + 1).letter;
        ws.addConditionalFormatting({
            ref: `${L}2:${L}${last}`,
            rules: [{
                type: "expression", priority: priority++,
                formulae: [`AND(COUNTA($A2:$${lastLetter}2)>0,LEN(TRIM(${L}2))=0)`],
                style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: ORANGE } } },
            }],
        });
    });

    /* Example: three filled rows, never read back */
    const ex = wb.addWorksheet("Example");
    styleHeader(ex);
    EXAMPLES.forEach((e, ri) => COLS.forEach((c, i) => { ex.getRow(ri + 2).getCell(i + 1).value = e[c.key] ?? ""; }));

    /* How to fill */
    const help = wb.addWorksheet("How to fill");
    help.getColumn(1).width = 110;
    [
        "How to fill this sheet",
        "1. Use the Products sheet. One row = one product. The Example sheet shows three finished rows.",
        "2. A product is identified by its Product Name + Brand Name. If the same name and brand is already in the catalog, the row is left out.",
        "3. Products are added to the catalog without a category. You map them to a generic product later (Needs mapping).",
        "4. GST % belongs to the product, so pick it carefully. Every seller who lists this product uses it.",
        "5. Orange box = still needed. Grey box = can be skipped. Click any box to see a tip.",
        "6. Unit and GST % have dropdowns. If there is no outer box, type 1 in 'Packs In 1 Outer Box'.",
        "7. Photos can be added on the website after upload, so 'Photo Links' can stay empty.",
        `8. Up to ${MAX_ROWS} products per file. Do not rename or delete the column headings.`,
    ].forEach((t, i) => { const c = help.getCell(i + 1, 1); c.value = t; c.alignment = { wrapText: true, vertical: "top" }; if (i === 0) c.font = { bold: true, size: 14, color: { argb: INK } }; });

    /* Lists: dropdown sources, hidden so they cannot be edited. A = units, B = GST rates */
    const lists = wb.addWorksheet("Lists", { state: "veryHidden" });
    units.forEach((u, i) => { lists.getCell(i + 1, 1).value = u; });
    GST_RATES.forEach((g, i) => { lists.getCell(i + 1, 2).value = g; });

    wb.views = [{ activeTab: 0 }];
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "catalog-product-upload-template.xlsx";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function cellText(v, asLink = false) {
    if (v == null) return "";
    if (typeof v === "object") {
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (asLink && v.hyperlink) return String(v.hyperlink).trim();
        if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("").trim();
        if ("result" in v) return cellText(v.result, asLink);
        if ("text" in v) return typeof v.text === "object" ? cellText(v.text) : String(v.text ?? "").trim();
        return "";
    }
    return String(v).trim();
}

// Returns [{ rowNo, n, b, ... }] (strings). Throws an Error with a plain-English message.
export async function readCatalogSheet(file) {
    const ExcelJS = await loadExcel();
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(await file.arrayBuffer()); }
    catch { throw new Error("Couldn't read that file. Please upload the .xlsx template."); }

    const ws = wb.getWorksheet("Products") || wb.worksheets.find((w) => w.state === "visible") || wb.worksheets[0];
    if (!ws) throw new Error("This file has no sheets.");

    const idx = {};
    ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
        const h = normHeader(cellText(cell.value));
        const c = COLS.find((x) => normHeader(x.header) === h);
        if (c && !idx[c.key]) idx[c.key] = col;
    });
    const missing = COLS.filter((c) => c.required && !idx[c.key]);
    if (missing.length) {
        throw new Error(`This is not the current template (missing: ${missing.map((c) => c.header).join(", ")}). Please download a fresh template.`);
    }

    const rows = [];
    for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const o = { rowNo: r };
        let any = false;
        for (const c of COLS) {
            const col = idx[c.key];
            const t = col ? cellText(row.getCell(col).value, c.key === "imgs") : "";
            o[c.key] = t;
            if (t) any = true;
        }
        if (!any) continue;
        rows.push(o);
        if (rows.length > MAX_ROWS) throw new Error(`This file has more than ${MAX_ROWS} products. Please split it into smaller files.`);
    }
    return rows;
}