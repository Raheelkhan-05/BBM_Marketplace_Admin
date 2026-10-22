// Pure helpers shared by the GROW seller pages (copied 1:1 from SellerManageListingsPage so numbers match).
import { deriveDisplayPrices, hasOuterPack } from "../../shared/packUnits.js";
import { DEFAULT_VALIDITY_HOURS } from "../../shared/listingValidity.js";

export const H = 36e5;
export const D = 864e5;
export const LOW_STOCK_THRESHOLD = 10;

const UNIT_SHORT = {
    pieces: "Pc", piece: "Pc", kg: "Kg", grams: "G", gram: "G",
    litres: "L", litre: "L", millilitres: "ml", millilitre: "ml",
    dozen: "doz", tons: "T", ton: "T",
};
export const shortUnit = (unit) => (!unit ? "" : UNIT_SHORT[String(unit).trim().toLowerCase()] || String(unit));
export const fmtQty = (n) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: 3 });
export const inr = (n) => (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
export const toTitleCase = (str = "") => String(str).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
export const isHiddenLabel = (name) => typeof name === "string" && name.trim().toLowerCase() === "pending";

export function stockState(stock, moq) {
    if (stock == null) return "unknown";
    const moqNum = Number(moq) || 0;
    if (moqNum > 0 ? Number(stock) < moqNum : Number(stock) <= 0) return "out";
    if (Number(stock) <= LOW_STOCK_THRESHOLD) return "low";
    return "ok";
}

// The ONE definition of "needs restock", used by the page and by the badge count.
export const needsRestock = (it) =>
    it.review_status !== "rejected" && ["low", "out"].includes(stockState(it.stock_quantity, it.moq));

export function packagingLabel(packSize, masterPackSize, unit) {
    const pack = Number(packSize) || 0;
    const master = Number(masterPackSize) || 0;
    if (!pack || !unit) return "Packaging not set";
    if (master > 1) return `1 Master Pack = ${master} Packs = ${master * pack} ${unit}`;
    return `1 Pack = ${pack} ${unit}`;
}

export const compactSaleUnit = (saleUnit) => (/master/i.test(saleUnit) ? "M Pack" : saleUnit);

// it.price is the stored GST-inclusive price per sale unit.
export function priceRowsFor(it, includeGst) {
    const src = Number(it.price);
    if (!(src > 0)) return [];
    const gst = Number(it.gst_percent) || 0;
    const perSaleUnit = includeGst ? src : src / (1 + gst / 100);
    const packSize = Number(it.pack_size) > 0 ? Number(it.pack_size) : 1;
    const masterSize = Number(it.units_per_master_pack) > 0 ? Number(it.units_per_master_pack) : 1;
    const d = deriveDisplayPrices(perSaleUnit, packSize, masterSize);
    const outer = hasOuterPack(it.units_per_master_pack);
    const short = shortUnit(it.unit);
    const packDuplicatesUnit = !!it.unit && packSize === 1;
    return [
        it.unit ? { label: short, value: d.perBaseUnit } : null,
        !packDuplicatesUnit ? { label: it.unit ? `${fmtQty(packSize)} ${short}` : "Pack", value: d.perPack } : null,
        outer ? { label: it.unit ? `${fmtQty(packSize * masterSize)} ${short}` : "M Pack", value: d.perMasterPack } : null,
    ].filter(Boolean);
}

// One badge at most. tone: "red" | "amber" | "mute"
export function getListingStatus(it, isActive, sState, isExpired = false) {
    if (isExpired) return { label: "Expired", tone: "red" };
    if (it.review_status === "pending_review") return { label: "In review", tone: "mute" };
    if (!isActive) return { label: "Paused", tone: "mute" };
    if (it.review_status === "rejected") return { label: "Rejected", tone: "red" };
    if (sState === "out") return { label: "Out of stock", tone: "red" };
    if (sState === "low") return { label: "Low stock", tone: "amber" };
    return null;
}

export function renewalHoursFor(it) {
    const saved = Number(it.validity_hours);
    return saved > 0 ? saved : DEFAULT_VALIDITY_HOURS;
}

export const greeting = () => {
    const g = new Date().getHours();
    return g < 12 ? "morning" : g < 17 ? "afternoon" : "evening";
};

export const shopName = (profile) =>
    profile?.shop_name || profile?.display_name || profile?.businessProfile?.trade_name || profile?.businessProfile?.display_name || profile?.name || "your shop";

export const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");
export const dateTime = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");