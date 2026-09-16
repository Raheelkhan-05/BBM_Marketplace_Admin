// src/utils/priceFormat.js
//
// Shared price/packaging formatting — used by the home feed row, the
// seller dropdown, and the product detail modal. Previously each of
// these had (or was missing) its own copy of this logic; pulling it
// into one file is what makes "the modal shows different/wrong info
// than the feed row for the same product" impossible going forward.

export function inr(n) {
    const val = Number(n) || 0;
    return val.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// Whether this listing's price is priced per Pack or per Master Pack.
export function priceUnitLabel(masterPackSize) {
    return Number(masterPackSize) >= 1 ? "master pack" : "pack";
}

export function packagingLabel(packSize, masterPackSize, unit) {
    const pack = Number(packSize) || 0;
    const master = Number(masterPackSize) || 0;
    if (!pack || !unit) return null;
    if (master > 1) {
        return `1 Master Pack = ${master} Packs = ${master * pack} ${unit}`;
    }
    return `1 Pack = ${pack} ${unit}`;
}