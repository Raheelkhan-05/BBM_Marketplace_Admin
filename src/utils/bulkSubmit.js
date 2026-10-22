// src/utils/bulkSubmit.js
// Builds exactly the payload the add-product wizard sends, so the backend treats a bulk item like any listing.
import { buildDispatching } from "../components/grow/GrowDeliveryPicker.jsx";
import { resolveValidityHours } from "../shared/listingValidity.js";
import { normalizeServiceKeys } from "../shared/marketingServices.js";

// match: the catalogue match ({ id, ... }) or null. india: { name, code }. seller: seller profile (dispatch fields).
export function buildPayload(P, { india, seller, match }) {
    const made = P.ful === "made_to_order";
    return {
        productName: P.n.trim(), brandName: P.nb ? "" : P.b.trim(), brandImage: P.bi, brandNotApplicable: P.nb,
        images: P.im, qualityCertificates: P.cert, noteToAdmin: P.note,
        unit: P.u, packSize: String(P.ps), hasOuterPack: !!P.op,
        masterPackSize: P.op ? String(P.mps) : (match ? "1" : "0"),
        brandItemMatch: match || null, genericProductBrandId: match?.id || null, hsnCode: "", gstPercent: Number(P.gst),
        basePrice: String(P.price), priceBasis: P.basis, gstInclusive: !!P.inc, freightIncluded: !!P.fr,
        validityHours: resolveValidityHours(P.val),
        marketingServices: Array.isArray(P.ms) ? normalizeServiceKeys(P.ms) : null, marketingLegacyPercent: null,
        sampleAvailable: !!P.sm, sampleQuantity: P.sm ? String(P.sq) : "", sampleUnitBasis: "per_unit",
        priceSlabs: [], // bulk uploads never carry quantity discounts
        stockType: P.ful, stockQuantity: made ? "" : String(P.stock), stockQuantityBasis: P.op ? "per_master_pack" : "per_pack",
        productionLeadTimeDays: made ? String(P.lead) : "",
        moq: String(Math.max(1, Math.round(Number(P.moq) || 0))),
        dispatchDistrict: seller?.dispatch_district || "", dispatchState: seller?.dispatch_state || "", dispatchPincode: seller?.dispatch_pincode || "",
        dispatchingLocations: buildDispatching(P.dl, india), returnPolicyKey: P.ret, warrantyKey: P.war,
        buyerAccessDraft: {
            mode: P.ba.mode,
            buyers: (P.ba.mode === "restricted" ? P.ba.buyers : P.ba.buyers.filter((b) => b.override))
                .map(({ pendingPricing, basedOnPrice, ...b }) => b),
        },
    };
}