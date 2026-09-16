// utils/orderPdf.js
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { transportLabel } from "../../shared/transportOptions.js";
import { parseDeliveryDate } from "../components/orders/OrderDisplayHelpers.jsx";

// ---- design tokens — mirrors PurchaseOrderDocument.jsx's `C` object ----
const INK = [11, 17, 22];        // #0B1116
const MUTED = [102, 112, 119];   // #667077
const HAIR = [214, 217, 219];    // ~ rgba(11,17,22,0.12) over white
const HAIR_SOFT = [232, 234, 235];
const ACCENT = [11, 114, 133];   // #0B7285
const PANEL_FILL = [250, 251, 251]; // matches the web card's #fafbfb panels

const GST_PERCENT = 18;
const RADIUS = 8; // corner radius used for all soft panels, matches rounded-lg/xl in the UI

// ---- Font ----
// Same "Amazon Ember" family the app declares in index.css, fetched from
// the same /fonts/ path at runtime and embedded directly into the PDF.
// jsPDF's built-in "helvetica" is never actually embedded — it just
// references a standard PDF font name and trusts the reader to supply it,
// which is why some renderers silently substitute a serif font. Embedding
// the real TTF bytes removes that risk entirely and guarantees the PDF
// matches the app's own typography, not an approximation of it.
//
// jsPDF only supports the styles normal / bold / italic / bolditalic, so
// only the 400 (Rg) and 700 (Bd) weights map onto it directly. The 500
// (Medium) weight declared in index.css has no equivalent PDF "style" slot
// and is intentionally not embedded — everything in this document already
// only ever needs normal or bold.
const FONT_FAMILY = "AmazonEmber";
const FONT_FILES = {
    normal: "/fonts/AmazonEmber_Rg.ttf",
    bold: "/fonts/AmazonEmber_Bd.ttf",
};

let cachedFontBase64 = null; // { normal, bold } | false (unavailable) | null (not attempted)

async function fetchFontBase64(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch font: ${url}`);
    const buffer = await res.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

async function loadFontData() {
    if (cachedFontBase64 !== null) return cachedFontBase64;
    try {
        const [normal, bold] = await Promise.all([
            fetchFontBase64(FONT_FILES.normal),
            fetchFontBase64(FONT_FILES.bold),
        ]);
        cachedFontBase64 = { normal, bold };
    } catch {
        cachedFontBase64 = false;
    }
    return cachedFontBase64;
}

// Registers the font on a *specific* jsPDF instance — this has to run for
// every new document (font VFS data isn't shared across jsPDF instances),
// but the base64 payload itself is fetched once and cached above.
// Returns the font family name to use for the rest of this document.
async function registerFont(doc) {
    const data = await loadFontData();
    if (!data) return "helvetica"; // fonts missing/unreachable — fall back rather than fail
    doc.addFileToVFS("AmazonEmber-Regular.ttf", data.normal);
    doc.addFileToVFS("AmazonEmber-Bold.ttf", data.bold);
    doc.addFont("AmazonEmber-Regular.ttf", FONT_FAMILY, "normal");
    doc.addFont("AmazonEmber-Bold.ttf", FONT_FAMILY, "bold");
    doc.setFont(FONT_FAMILY, "normal");
    return FONT_FAMILY;
}

const LOGO_URL = "/Logo.png";
let cachedLogoBase64 = null;
let cachedLogoAttempted = false;

async function fetchLogoBase64() {
    if (cachedLogoAttempted) return cachedLogoBase64;
    cachedLogoAttempted = true;
    try {
        const res = await fetch(LOGO_URL);
        if (!res.ok) return null;
        const blob = await res.blob();
        cachedLogoBase64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result || null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
        return cachedLogoBase64;
    } catch {
        return null;
    }
}

function drawLogo(doc, x, y, size, logoBase64, font) {
    if (logoBase64) {
        try {
            doc.addImage(logoBase64, "PNG", x, y, size, size);
            return;
        } catch {
            // fall through to placeholder if the image fails to decode
        }
    }
    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.75);
    doc.roundedRect(x, y, size, size, 3, 3);
    doc.setTextColor(...MUTED);
    doc.setFont(font, "normal");
    doc.setFontSize(6.5);
    doc.setCharSpace(0.4);
    doc.text("LOGO", x + size / 2, y + size / 2 + 2, { align: "center" });
    doc.setCharSpace(0);
}

function fmtDate(d) {
    if (!d) return null;
    const dt = new Date(d);
    return isNaN(dt) ? null : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Mirrors the on-screen "Fulfilment" card exactly (DeliveryEstimate /
// shouldShowDelivery in OrderDisplayHelpers.jsx): once delivered, show the
// delivered date; otherwise parse item.lead_time_snapshot (a "DD Mon" date
// or a "DD Mon - DD Mon" range) via the same shared parseDeliveryDate
// helper — so the PDF can never disagree with the page again.
function deliveryDateLabel(order, item) {
    if (order.status === "delivered") {
        const ts = order.updated_at;
        return ts ? fmtDate(ts) : "Delivered";
    }
    return parseDeliveryDate(item?.lead_time_snapshot) || "To be confirmed";
}

function inr(n) {
    return (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function saleUnitLabelFromBasis(basis) {
    if (basis === "per_master_pack") return "Master Pack";
    if (basis === "per_pack") return "Pack";
    return null;
}
function saleQtyOf(item) {
    return Number(item.pack_quantity_snapshot) || Number(item.quantity) || 0;
}
function itemQtyText(item) {
    const label = saleUnitLabelFromBasis(item.purchase_basis);
    const saleQty = Number(item.pack_quantity_snapshot) || 0;
    const baseQty = Number(item.quantity) || 0;
    if (label && saleQty > 0) return `${saleQty} ${label}${saleQty === 1 ? "" : "s"} (${baseQty} ${item.unit || ""})`.trim();
    return `${baseQty} ${item.unit || ""}`.trim();
}

function baseRateInclGst(item) {
    return Number(item.base_price_applied ?? item.unit_price) || 0;
}
function baseRateExclGst(item) {
    return round2(baseRateInclGst(item) / (1 + GST_PERCENT / 100));
}
function amountExclGst(item) {
    return round2(baseRateExclGst(item) * saleQtyOf(item));
}

function transportText(order) {
    if (order.transport_mode) return transportLabel(order.transport_mode);
    if (order.buyer_transport_mode) return `${transportLabel(order.buyer_transport_mode)} (requested)`;
    return "To be decided";
}

// Soft rounded panel with a light fill. Fields laid out with generous
// spacing, separated only by thin hairlines between rows — no vertical
// grid lines.
// Plain fields laid out with generous spacing, separated only by thin
// hairlines between rows — no vertical grid lines, no filled/bordered
// background panel (that was static roundedRect "FD" fill, removed
// below). Row height is now computed per-row from the actual wrapped
// line count of whichever field is longest in that row, instead of a
// fixed 32pt guess — so a long buyer/shop name or email that wraps to
// 2 lines no longer gets clipped or overlaps the next row.
function drawInfoPanel(doc, x, y, w, rows, cols, font) {
    const colW = w / cols;
    const topPad = 10;
    const bottomPad = 10;
    const labelHeight = 9;        // space the label line itself occupies
    const valueTopPad = 6;        // NEW — explicit gap between label and value, on top of labelHeight
    const valueLineHeight = 11;

    // Pass 1 — measure EACH row independently. rowHeights[i] depends only
    // on rows[i]'s own fields — nothing here reuses or copies another
    // row's measurement.
    doc.setFont(font, "bold");
    doc.setFontSize(9.5);
    const rowHeights = rows.map((pair, ri) => {
        let maxLinesInThisRow = 1;
        pair.forEach((f) => {
            if (!f.label) return;
            const lines = doc.splitTextToSize(String(f.value ?? "—"), colW - 24);
            maxLinesInThisRow = Math.max(maxLinesInThisRow, lines.length);
        });
        const thisRowHeight = topPad + labelHeight + valueTopPad + maxLinesInThisRow * valueLineHeight + bottomPad;
        return thisRowHeight; // independent per row — row 0's result never affects row 1 or row 2
    });

    const totalH = rowHeights.reduce((sum, h) => sum + h, 0);

    // Divider lines — placed using a running cursor built from each row's
    // OWN height, so a taller row 1 correctly pushes row 2's divider down,
    // without changing row 1's or row 0's own heights.
    let dividerY = y;
    for (let r = 1; r < rows.length; r++) {
        dividerY += rowHeights[r - 1];
        doc.setDrawColor(...HAIR_SOFT);
        doc.setLineWidth(0.5);
        doc.line(x + 12, dividerY, x + w - 12, dividerY);
    }

    // Pass 2 — draw each row at its own top (cy), using its own height to
    // advance the cursor for the next row.
    let cy = y;
    rows.forEach((pair, ri) => {
        const rowH = rowHeights[ri];
        pair.forEach((f, ci) => {
            if (!f.label) return;
            const cx = x + colW * ci + 14;

            doc.setFont(font, "normal");
            doc.setFontSize(7);
            doc.setTextColor(...MUTED);
            doc.setCharSpace(0.6);
            doc.text(f.label.toUpperCase(), cx, cy + topPad + 3);
            doc.setCharSpace(0);

            doc.setFont(font, "bold");
            doc.setFontSize(9.5);
            doc.setTextColor(...INK);
            doc.setCharSpace(0.4);
            const lines = doc.splitTextToSize(String(f.value ?? "—"), colW - 24);
            // NEW — value now starts topPad + labelHeight + valueTopPad below
            // the row's top, instead of a tight fixed 12pt gap from the
            // label baseline. This is the added breathing room under the
            // heading you asked for.
            doc.text(lines, cx, cy + topPad + labelHeight + valueTopPad);
            doc.setCharSpace(0);
        });
        cy += rowH; // advance by THIS row's own height only
    });

    return totalH;
}

export async function generateOrderPdf(order, { vendor, logoBase64 } = {}) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const font = await registerFont(doc);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 42;
    const contentWidth = pageWidth - margin * 2;
    const addr = order.shipping_address_snapshot || {};
    const items = order.items || [];
    const isSample = order.order_type === "sample";
    const firstItem = items[0];

    const vendorInfo = order.seller || vendor || null;
    const vendorName = vendorInfo?.display_name || "—";
    const vendorLocation = [vendorInfo?.city, vendorInfo?.state].filter(Boolean).join(", ");

    const buyerShopName = order.buyer_business_name || order.buyer_contact_name || "—";
    const buyerGstin = order.buyer_gstin || "—";

    const isDelivered = order.status === "delivered";

    const sellerState = vendorInfo?.state || null;
    const buyerState = addr.state || null;
    const isIntraState = !!(sellerState && buyerState && sellerState.trim().toLowerCase() === buyerState.trim().toLowerCase());

    const resolvedLogo = logoBase64 || (await fetchLogoBase64());

    // ---- Header ----
    let y = 28;
    drawLogo(doc, margin, y, 30, resolvedLogo, font);

    doc.setTextColor(...INK);
    doc.setFont(font, "bold");
    doc.setFontSize(13);
    doc.setCharSpace(0.1);
    doc.text("BBM Marketplace", margin + 40, y + 12);
    doc.setFont(font, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...ACCENT);
    doc.setCharSpace(1.1);
    doc.text("PURCHASE ORDER", margin + 40, y + 24);
    doc.setCharSpace(0);

    doc.setTextColor(...INK);
    doc.setFont(font, "bold");
    doc.setFontSize(10);
    doc.setCharSpace(0.2);
    doc.text(order.order_number || "-", pageWidth - margin, y + 8, { align: "right" });
    doc.setFont(font, "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(fmtDate(order.created_at) || "-", pageWidth - margin, y + 22, { align: "right" });
    doc.setCharSpace(0);

    y += 42;
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(1.25);
    doc.line(margin, y, pageWidth - margin, y);

    // ---- Buyer / order info panel ----
    y += 16;
    const infoRows = [
        [
            { label: "Shop Name (Buyer)", value: buyerShopName },
            { label: "Buyer GSTIN", value: buyerGstin },
            { label: "Buyer Phone", value: order.buyer_contact_phone },
        ],
        [
            { label: "Order No.", value: order.order_number },
            { label: "Order Date", value: fmtDate(order.created_at) },
            { label: "Buyer Email", value: order.buyer_contact_email },
        ],
        [
            { label: "Transport Mode", value: transportText(order) },
            { label: isDelivered ? "Delivered On" : "Estimated Delivery", value: deliveryDateLabel(order, firstItem) },
            { label: "", value: "" },
        ],
    ];
    const infoH = drawInfoPanel(doc, margin, y, contentWidth, infoRows, 3, font);
    y += infoH + 18;

    // ---- Vendor / Deliver-to — height computed from actual wrapped
    // content so the address never spills past the panel's rounded border.
    const colW = (contentWidth - 16) / 2;
    const colPad = 14;
    const deliverAddrText = `${addr.address_line1 || ""}${addr.address_line2 ? ", " + addr.address_line2 : ""}, ${addr.city || ""}, ${addr.state || ""} - ${addr.pincode || ""}`;
    const deliverLines = doc.splitTextToSize(deliverAddrText, colW - colPad * 2);
    const vendorNameLines = doc.splitTextToSize(vendorName, colW - colPad * 2);
    const deliverNameLines = doc.splitTextToSize(addr.contact_name || order.buyer_contact_name || "-", colW - colPad * 2);

    const vendorColH = 18 + vendorNameLines.length * 13 + (vendorLocation ? 13 : 0) + 14;
    const deliverColH = 18 + deliverNameLines.length * 13 + deliverLines.length * 11 + 14;
    const vBoxH = Math.max(74, vendorColH, deliverColH);

    doc.setFillColor(...PANEL_FILL);
    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.75);
    doc.roundedRect(margin, y, colW, vBoxH, RADIUS, RADIUS, "FD");
    doc.roundedRect(margin + colW + 16, y, colW, vBoxH, RADIUS, RADIUS, "FD");

    doc.setTextColor(...MUTED);
    doc.setFont(font, "normal");
    doc.setFontSize(7);
    doc.setCharSpace(0.6);
    doc.text("VENDOR (SELLER)", margin + colPad, y + 18);
    doc.text("DELIVER TO", margin + colW + 16 + colPad, y + 18);
    doc.setCharSpace(0);

    doc.setTextColor(...INK);
    doc.setFont(font, "bold");
    doc.setFontSize(11);
    doc.setCharSpace(0.1);
    doc.text(vendorNameLines, margin + colPad, y + 34);
    doc.text(deliverNameLines, margin + colW + 16 + colPad, y + 34);
    doc.setCharSpace(0);

    doc.setFont(font, "normal");
    doc.setTextColor(...MUTED);
    doc.setFontSize(8.5);
    const vendorLocY = y + 34 + vendorNameLines.length * 13;
    if (vendorLocation) doc.text(vendorLocation, margin + colPad, vendorLocY);

    const deliverAddrY = y + 34 + deliverNameLines.length * 13;
    doc.text(deliverLines, margin + colW + 16 + colPad, deliverAddrY);

    y += vBoxH + 20;

    // Column 1's body text is kept as the real content (name + brand) so
    // autoTable computes the correct row height from it, but rendered
    // invisible (white) — the actual styled version (bold name, accent
    // brand line) is drawn on top in didDrawCell, avoiding a duplicated
    // "product name" line.
    // ---- Items table ----
    const tableStartY = y;
    const headRowH = 30;

    doc.setFillColor(...ACCENT);
    doc.roundedRect(margin, tableStartY, contentWidth, headRowH, RADIUS, RADIUS, "F");
    doc.rect(margin, tableStartY + RADIUS, contentWidth, headRowH - RADIUS, "F");

    // Column widths are all fixed except column 1 ("auto"), so its real
    // width can be computed up front — this lets us precompute exactly how
    // many lines the name + brand will wrap to, and therefore the exact
    // row height each item needs, WITHOUT putting that text into the table's
    // actual cell content (which was the source of the duplicate-text bug:
    // autoTable was measuring a real copy of the name+brand string that
    // then also got drawn a second time in didDrawCell — invisible to the
    // eye via white-on-white, but very much present twice in the PDF's
    // text layer, which is why copying/selecting text pulled it out twice).
    const FIXED_COL_WIDTHS = { 0: 30, 2: 114, 3: 82, 4: 88 };
    const col1Width = contentWidth - FIXED_COL_WIDTHS[0] - FIXED_COL_WIDTHS[2] - FIXED_COL_WIDTHS[3] - FIXED_COL_WIDTHS[4];
    const col1Pad = 18; // matches the 9pt left/right cellPadding used below

    function computeItemBlock(item) {
        doc.setFont(font, "bold");
        doc.setFontSize(9);
        const nameLines = doc.splitTextToSize(item.product_name_snapshot || "", col1Width - col1Pad);
        let brandLines = [];
        if (item.brand_name_snapshot) {
            doc.setFont(font, "normal");
            doc.setFontSize(8);
            brandLines = doc.splitTextToSize(`Brand: ${item.brand_name_snapshot}`, col1Width - col1Pad);
        }
        const textHeight = nameLines.length * 11 + (brandLines.length ? brandLines.length * 11 + 3 : 0);
        return { nameLines, brandLines, cellHeight: textHeight + 18 }; // +18 = 9pt top/bottom padding
    }

    autoTable(doc, {
        startY: tableStartY,
        head: [["SR", "DESCRIPTION OF GOODS", "QTY", "BASE PRICE\n(EXCL. GST)", "AMOUNT\n(EXCL. GST)"]],
        body: items.map((it, i) => {
            const { cellHeight } = computeItemBlock(it);
            return [
                i + 1,
                // FIX: content is now genuinely empty — nothing for autoTable to
                // add to the PDF's text layer here. Row height is forced via
                // minCellHeight instead of being inferred from hidden text.
                { content: "", styles: { minCellHeight: cellHeight } },
                itemQtyText(it),
                `Rs. ${inr(baseRateExclGst(it))}`,
                `Rs. ${inr(amountExclGst(it))}`,
            ];
        }),
        margin: { left: margin, right: margin },
        tableWidth: contentWidth,
        styles: {
            font,
            fontSize: 8.5,
            cellPadding: { top: 9, bottom: 9, left: 9, right: 9 },
            textColor: INK,
            lineColor: HAIR_SOFT,
            lineWidth: { top: 0, left: 0, right: 0, bottom: 0.5 },
            valign: "top",
            overflow: "linebreak",
        },
        headStyles: {
            fillColor: false,
            textColor: [255, 255, 255],
            fontStyle: "bold",
            valign: "middle",
            fontSize: 7.5,
            lineWidth: 0,
            cellPadding: { top: 8, bottom: 8, left: 9, right: 9 },
            minCellHeight: headRowH,
        },
        columnStyles: {
            0: { cellWidth: FIXED_COL_WIDTHS[0], halign: "center" },
            1: { cellWidth: "auto" },
            2: { cellWidth: FIXED_COL_WIDTHS[2] },
            3: { halign: "right", cellWidth: FIXED_COL_WIDTHS[3] },
            4: { halign: "right", cellWidth: FIXED_COL_WIDTHS[4] },
        },
        didParseCell: (data) => {
            if (data.section === "head") {
                data.cell.styles.halign = data.column.index >= 3 ? "right" : (data.column.index === 0 ? "center" : "left");
            }
            if (data.section === "body" && data.row.index % 2 === 1) {
                data.cell.styles.fillColor = PANEL_FILL;
            }
            // NOTE: no more textColor:[255,255,255] hack needed on column 1 —
            // there's no real text there to hide anymore.
        },
        willDrawCell: (data) => {
            if (data.section === "head") doc.setCharSpace(0.3);
        },
        didDrawCell: (data) => {
            doc.setCharSpace(0);
            if (data.section !== "body" || data.column.index !== 1) return;
            const item = items[data.row.index];
            if (!item) return;
            const { x, y: cy, width } = data.cell;
            const { nameLines, brandLines } = computeItemBlock(item);

            // The ONLY place this text is ever written into the PDF.
            doc.setFont(font, "bold");
            doc.setFontSize(9);
            doc.setTextColor(...INK);
            doc.setCharSpace(0.05);
            doc.text(nameLines, x + 9, cy + 14);

            if (brandLines.length) {
                doc.setFont(font, "normal");
                doc.setFontSize(8);
                doc.setTextColor(...ACCENT);
                const brandY = cy + 14 + nameLines.length * 11 + 3;
                doc.text(brandLines, x + 9, brandY);
            }
            doc.setCharSpace(0);
        },
    });

    const tableEndY = doc.lastAutoTable.finalY;

    // Round the bottom corners of the last body row similarly, then stroke
    // the whole frame — now both top and bottom corners are genuinely rounded.
    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.75);
    doc.roundedRect(margin, tableStartY, contentWidth, tableEndY - tableStartY, RADIUS, RADIUS, "S");

    y = tableEndY + 14;

    // ---- Totals ----
    const subtotal = round2(items.reduce((s, it) => s + amountExclGst(it), 0));
    const gstAmount = round2(Math.max(Number(order.total_amount) - subtotal, 0));
    const half = round2(gstAmount / 2);

    const finalY = doc.lastAutoTable.finalY + 20;
    const boxW = 240;
    const boxX = pageWidth - margin - boxW;
    const gstLines = isSample ? 0 : (isIntraState ? 2 : 1);
    const noteLines = isSample ? [] : doc.splitTextToSize(
        // `GST is calculated on the base (pre-discount) price at the standard ${GST_PERCENT}% rate.`,
        // boxW
        ``
    );
    const boxH = (isSample ? 20 : 20 * (1 + gstLines) + 12 + 24) + (noteLines.length * 10);

    let boxTop = finalY;
    if (boxTop + boxH > pageHeight - 70) {
        doc.addPage();
        await registerFont(doc);
        boxTop = 50;
    }

    // No fill/border panel here anymore — plain rows on the page background,
    // same as the web card.
    let ty = boxTop + 10;
    function row(label, value, opts = {}) {
        doc.setFont(font, opts.bold ? "bold" : "normal");
        doc.setFontSize(opts.size || 9.5);
        doc.setTextColor(...(opts.color || MUTED));
        doc.setCharSpace(0.15);
        doc.text(label, boxX, ty);
        doc.text(value, boxX + boxW, ty, { align: "right" });
        doc.setCharSpace(0);
        ty += 18;
    }

    if (isSample) {
        row("Total", `Rs. ${inr(order.total_amount)}`, { bold: true, color: INK, size: 11 });
    } else {
        row("Subtotal", `Rs. ${inr(subtotal)}`);
        if (isIntraState) {
            row(`CGST (${GST_PERCENT / 2}%)`, `Rs. ${inr(half)}`);
            row(`SGST (${GST_PERCENT / 2}%)`, `Rs. ${inr(round2(gstAmount - half))}`);
        } else {
            row(`IGST (${GST_PERCENT}%)`, `Rs. ${inr(gstAmount)}`);
        }
        // thin divider, then bold Total Payable — matches the web's border-t
        doc.setDrawColor(...HAIR);
        doc.setLineWidth(0.75);
        doc.line(boxX, ty - 6, boxX + boxW, ty - 6);
        ty += 14;
        row("Total Payable", `Rs. ${inr(order.total_amount)}`, { bold: true, color: ACCENT, size: 12 });

        // italic footnote, right-aligned under the totals, same as web
        ty += 6;
        doc.setFont(font, "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        doc.text(noteLines, boxX + boxW, ty, { align: "right" });
        ty += noteLines.length * 10;
    }

    // let footerY = ty + 14;
    // ---- Footer note ----
    let footerY = boxTop + boxH + 26;
    doc.setFont(font, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.setCharSpace(0.15);
    if (!isSample) {
        // doc.text(`GST is calculated on the base (pre-discount) price at the standard ${GST_PERCENT}% rate.`, margin, footerY);
        footerY += 13;
    }

    if (order.buyer_notes) {
        doc.setFont(font, "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...INK);
        doc.text("Notes:", margin, footerY);
        doc.setFont(font, "normal");
        doc.setTextColor(...MUTED);
        doc.text(doc.splitTextToSize(order.buyer_notes, contentWidth), margin, footerY + 13);
    }
    doc.setCharSpace(0);

    doc.save(`${order.order_number || "order"}.pdf`);
}