// shared/orderPricing.js
// Single source of truth for turning an order_item row into a verifiable,
// human-readable breakdown.
//
// Presentation order (matches how a person actually reads an invoice —
// price, then discount, then what's left, then tax, then total):
//   1. Rate            — before discount, GST EXCLUDED
//   2. Gross amount    = rate x qty, GST EXCLUDED
//   3. Discount        — GST EXCLUDED (a discount is on the goods; the
//                          percentage is identical whether applied before
//                          or after GST, so staying excl-GST here never
//                          loses accuracy)
//   4. Taxable value   = Gross amount − Discount, GST EXCLUDED
//   5. GST             — introduced exactly ONCE, at the listing's rate
//   6. Total Payable   = Taxable value + GST
//
// Steps 1–4 never leave the GST-excluded unit system, so "Gross − Discount
// = Taxable value" is checkable by eye without doing tax math in your
// head. GST appears exactly once, as its own step.
//
// gst_percent_snapshot only exists on orders placed after this migration —
// older orders have it as null. DEFAULT_GST_PERCENT is the fallback for
// those, so a historic order never shows 0% GST (every listing on the
// platform charges GST — 0% was never a real state, just a missing column).
//
// ROUNDING FIX (this revision):
// - Gross amount and Taxable value used to be derived from two DIFFERENT
//   source fields — grossAmount from `base_price_applied` (via `rate`),
//   taxableValue from `line_total`/`unit_price` — each rounded to 2dp
//   independently. When discount_percent is 0, those two fields are
//   SUPPOSED to represent the exact same amount, but base_price_applied
//   and unit_price are two separately-stored numbers that can differ by a
//   fraction of a paisa due to upstream rounding — e.g. ₹8,898.30 vs
//   ₹8,898.31. Rounding later doesn't fix a mismatch between two
//   genuinely different source numbers; it just relocates it.
// - FIXED, two parts:
//     1. Every intermediate figure (rate, grossAmount, taxableValue,
//        discountAmount, gstAmount) is now computed at FULL float
//        precision — nothing is round2()'d until the very last step,
//        right before it's returned for display.
//     2. When discountPercent is 0, taxableValueExact is now forced equal
//        to grossAmountExact instead of being independently derived from
//        line_total. There is no discount, so there is no legitimate
//        reason for the two to differ — forcing equality here is what
//        actually removes the 1-paisa drift, not just the extra decimal
//        precision. (When there IS a discount, taxableValue still comes
//        from the real amount charged — line_total — since that's the
//        only source that reflects the discount correctly.)

export const DEFAULT_GST_PERCENT = 18;

function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function saleQtyOf(item) {
    return Number(item.pack_quantity_snapshot) || Number(item.quantity) || 0;
}

export function resolveGstPercent(item) {
    const v = item?.gst_percent_snapshot;
    return v != null && v !== "" ? Number(v) : DEFAULT_GST_PERCENT;
}

// base_price_applied = slab rate BEFORE discount, GST-INCLUSIVE, per sale unit
// unit_price          = FINAL rate AFTER discount, GST-INCLUSIVE, per sale unit
// line_total           = FINAL amount AFTER discount, GST-INCLUSIVE (what was actually charged)
// discount_percent    = % taken off (0 for no discount / custom-priced buyers)
export function computeItemBreakdown(item) {
    const saleQty = saleQtyOf(item);
    const gstPercent = resolveGstPercent(item);
    const gstFactor = 1 + gstPercent / 100;

    const rateInclBeforeDiscount = Number(item.base_price_applied ?? item.unit_price) || 0;
    const discountPercent = Number(item.discount_percent) || 0;

    // Anchor to what was ACTUALLY charged rather than re-deriving it from
    // unit_price x qty, so Total Payable can never drift from the real
    // charge even if rounding happens elsewhere in the pipeline. Kept at
    // full precision — not rounded here.
    const netPayableIncl = item.line_total != null
        ? Number(item.line_total)
        : (Number(item.unit_price) || 0) * saleQty;

    // ---- Steps 1–4, all at FULL precision (no rounding yet) ----
    const rateExact = rateInclBeforeDiscount / gstFactor;              // step 1
    const grossAmountExact = rateExact * saleQty;                     // step 2

    // Step 4 (taxable value): when there's no discount, this MUST equal
    // grossAmountExact — forcing that avoids float-level drift between
    // base_price_applied and unit_price, which are two independently
    // stored numbers that are supposed to be identical when
    // discountPercent is 0 but can differ by a fraction of a paisa.
    // When there IS a discount, taxableValue has to come from the real
    // charge (netPayableIncl), since that's the only number that reflects
    // the discount correctly.
    const taxableValueExact = discountPercent > 0
        ? netPayableIncl / gstFactor
        : grossAmountExact;

    const discountAmountExact = Math.max(grossAmountExact - taxableValueExact, 0); // step 3

    // Step 5: GST, introduced exactly once, at full precision.
    const gstAmountExact = netPayableIncl - taxableValueExact;

    // ---- Round ONLY here, at the very end, for display ----
    const rate = round2(rateExact);
    const grossAmount = round2(grossAmountExact);
    const taxableValue = round2(taxableValueExact);
    const discountAmount = round2(discountAmountExact);
    const gstAmount = round2(gstAmountExact);
    const totalPayable = round2(netPayableIncl);                          // step 6

    return {
        saleQty, gstPercent,
        rate, discountPercent,
        grossAmount, discountAmount, taxableValue, gstAmount,
        totalPayable,
    };
}

export function computeOrderBreakdown(order) {
    const rows = (order?.items || []).map((it) => ({ item: it, breakdown: computeItemBreakdown(it) }));
    const totals = rows.reduce((acc, { breakdown: b }) => ({
        grossAmount: acc.grossAmount + b.grossAmount,
        discountAmount: acc.discountAmount + b.discountAmount,
        taxableValue: acc.taxableValue + b.taxableValue,
        gstAmount: acc.gstAmount + b.gstAmount,
        totalPayable: acc.totalPayable + b.totalPayable,
    }), { grossAmount: 0, discountAmount: 0, taxableValue: 0, gstAmount: 0, totalPayable: 0 });
    Object.keys(totals).forEach((k) => (totals[k] = round2(totals[k])));

    // One blended GST% for the CGST/SGST/IGST labels — safe as long as
    // every item on the order shares a rate, true for the overwhelming
    // majority (single seller, one GST slab). If items genuinely differ,
    // this label uses the first item's rate; the gstAmount TOTAL is always
    // the real per-item sum, never recomputed from this label.
    const gstPercent = rows[0]?.breakdown.gstPercent ?? DEFAULT_GST_PERCENT;

    return { rows, totals, gstPercent };
}