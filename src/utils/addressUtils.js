// utils/addressUtils.js
import { fetchBusinessProfile } from "./api.js";

// Builds a usable address object straight from the buyer's GST business
// profile — used both as the seed for the "add new address" form AND,
// now, as a synthetic selectable address when the buyer has no saved
// addresses at all yet.
export function seedFromBusinessProfile(bp, phone) {
    if (!bp) return null;
    const useDispatch = bp.dispatch_same_as_registered === false && bp.dispatch_address;
    return {
        label: "Business address",
        contact_name: bp.legal_name || bp.trade_name || "",
        contact_phone: phone || "",
        address_line1: useDispatch ? bp.dispatch_address : (bp.registered_address || ""),
        address_line2: "",
        city: bp.district || "",
        state: useDispatch ? (bp.dispatch_state || bp.state || "") : (bp.state || ""),
        pincode: useDispatch ? (bp.dispatch_pincode || bp.pincode || "") : (bp.pincode || ""),
        fromBusinessProfile: true,
    };
}

// Resolves what to show the buyer as delivery address options: their
// saved addresses if any exist, and — ALWAYS as a fallback option, not
// just when the list is empty — one synthetic "business address" entry
// derived from their GST profile, so they can use it even if they also
// have saved addresses but want to ship to their registered/dispatch
// location instead.
export async function fetchDeliveryAddressOptions(token, buyerPhone) {
    const [bpRes] = await Promise.all([fetchBusinessProfile(token)]);
    const businessAddress = bpRes?.success ? seedFromBusinessProfile(bpRes.profile, buyerPhone) : null;
    return { businessAddress };
}