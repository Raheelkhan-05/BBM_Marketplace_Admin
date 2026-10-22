// context/BuyerAddressContext.jsx
//
// ONE source of truth for the buyer's delivery address.
// Fetched once, shared by Home (DeliverToBar), Buy Now, Cart, the transport
// modal and the seller-list delivery estimates. Selecting an address here
// also persists it as the buyer's default on the server.
//
// Also exposes `shopName` (from the business profile) so the Home bar can show
// "Shop name · City".
//
// BuyerAddressProvider is safe to nest: if a parent provider already exists
// it just renders its children, so you may wrap a page locally AND (optionally)
// mount it once at the app root under <AuthProvider> for cross-page caching.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import {
    fetchBuyerAddresses, createBuyerAddress, updateBuyerAddress, fetchBusinessProfile,
    fetchCheckoutStatus, setDefaultBuyerAddress,
} from "../utils/api.js";

const Ctx = createContext(null);

// Business-registration text is often already a formatted string that ends with
// the same city/state/pincode we store separately. Strip it so address_line1
// only contains the street portion.
function stripTrailingLocation(raw, { city, state, pincode }) {
    let line = String(raw || "").trim();
    if (!line) return line;
    const esc = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const dash = "[-\\u2010-\\u2015]";
    const sep = "[\\s,]*";
    const patterns = [
        city && state && pincode && new RegExp(`${sep}${esc(city)}${sep},?${sep}${esc(state)}${sep}${dash}${sep}${esc(pincode)}${sep}$`, "i"),
        state && pincode && new RegExp(`${sep}${esc(state)}${sep}${dash}${sep}${esc(pincode)}${sep}$`, "i"),
        city && new RegExp(`${sep}${esc(city)}${sep}${esc(city)}${sep}$`, "i"),
        pincode && new RegExp(`${sep}${esc(pincode)}${sep}$`, "i"),
    ].filter(Boolean);
    for (const re of patterns) {
        if (re.test(line)) line = line.replace(re, "").trim();
    }
    return line.replace(/[\s,]+$/, "").trim();
}

function seedFromBusinessProfile(bp, phone) {
    if (!bp) return null;
    const useDispatch = bp.dispatch_same_as_registered === false && bp.dispatch_address;
    const city = bp.district || "";
    const state = useDispatch ? (bp.dispatch_state || bp.state || "") : (bp.state || "");
    const pincode = useDispatch ? (bp.dispatch_pincode || bp.pincode || "") : (bp.pincode || "");
    const rawLine = useDispatch ? bp.dispatch_address : bp.registered_address;
    return {
        label: "", // intentionally blank: backend defaults it to "Office"
        contact_name: bp.legal_name || bp.trade_name || "",
        contact_phone: phone || "",
        address_line1: stripTrailingLocation(rawLine, { city, state, pincode }),
        address_line2: "",
        city, state, pincode,
    };
}

// Shop name shown to the buyer: trade name first (what people know the shop as),
// then the registered legal name.
function shopNameFromProfile(bp) {
    if (!bp) return "";
    return String(bp.trade_name || bp.legal_name || "").trim();
}

// Only for addresses the buyer explicitly saves via the form — never for the
// auto-seeded one (it would produce "Company · Company").
export function fallbackLabel(addr, existingCount) {
    const trimmed = (addr.label || "").trim();
    if (trimmed) return trimmed;
    const name = (addr.contact_name || "").trim();
    if (name) return name;
    return `Address ${existingCount + 1}`;
}

function Inner({ children }) {
    const { token } = useAuth();
    const [addresses, setAddresses] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [loading, setLoading] = useState(!!token);
    const [seeding, setSeeding] = useState(false);
    const [shopName, setShopName] = useState("");

    const tokenRef = useRef(token);
    tokenRef.current = token;
    const addressesRef = useRef([]);
    addressesRef.current = addresses;
    const seedInFlightRef = useRef(false);

    // Shop name from the business profile (independent of address loading/seeding).
    useEffect(() => {
        if (!token) { setShopName(""); return; }
        let cancelled = false;
        (async () => {
            try {
                const res = await fetchBusinessProfile(token);
                if (cancelled) return;
                setShopName(res?.success ? shopNameFromProfile(res.profile) : "");
            } catch {
                if (!cancelled) setShopName("");
            }
        })();
        return () => { cancelled = true; };
    }, [token]);

    useEffect(() => {
        if (!token) {
            setAddresses([]); setSelectedId(null); setLoading(false); setSeeding(false);
            seedInFlightRef.current = false;
            return;
        }
        let cancelled = false;
        (async () => {
            setLoading(true);
            let res = null;
            try { res = await fetchBuyerAddresses(token); } catch { res = null; }
            if (cancelled) return;
            if (!res?.success) { setLoading(false); return; }
            const list = res.addresses || [];

            if (list.length === 0) {
                // Never create twice (StrictMode double-invoke). The first run finishes
                // the seeding on its own — it checks tokenRef, not `cancelled`.
                if (seedInFlightRef.current) return;
                seedInFlightRef.current = true;
                setLoading(false);
                setSeeding(true);
                try {
                    const [bpRes, statusRes] = await Promise.all([fetchBusinessProfile(token), fetchCheckoutStatus(token)]);
                    if (tokenRef.current !== token) return;
                    const seeded = bpRes?.success ? seedFromBusinessProfile(bpRes.profile, statusRes?.profile?.phone) : null;
                    if (seeded && seeded.contact_name && seeded.address_line1 && seeded.pincode) {
                        const createRes = await createBuyerAddress(token, { ...seeded, is_default: true });
                        if (tokenRef.current !== token) return;
                        if (createRes?.success) {
                            setAddresses([createRes.address]);
                            setSelectedId(createRes.address.id);
                        }
                    }
                } catch { /* buyer can add an address manually */ }
                finally {
                    seedInFlightRef.current = false;
                    if (tokenRef.current === token) setSeeding(false);
                }
                return;
            }

            setAddresses(list);
            setSelectedId((list.find((a) => a.is_default) || list[0]).id);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [token]);

    const selectAddress = useCallback((idOrAddr) => {
        const id = idOrAddr && typeof idOrAddr === "object" ? idOrAddr.id : idOrAddr;
        const addr = addressesRef.current.find((a) => a.id === id) || (idOrAddr && typeof idOrAddr === "object" ? idOrAddr : null);
        if (!addr) return;
        setSelectedId(addr.id);
        if (!addr.is_default && tokenRef.current) {
            setAddresses((prev) => prev.map((a) => ({ ...a, is_default: a.id === addr.id })));
            (async () => {
                try { await setDefaultBuyerAddress(tokenRef.current, addr.id); } catch { /* best-effort */ }
            })();
        }
    }, []);

    // { id?: existing address id, data: form fields } -> raw API response
    const saveAddress = useCallback(async ({ id = null, data }) => {
        const t = tokenRef.current;
        const count = addressesRef.current.length;
        if (id) {
            const res = await updateBuyerAddress(t, id, { ...data, label: fallbackLabel(data, count) });
            if (res?.success) setAddresses((prev) => prev.map((a) => (a.id === id ? res.address : a)));
            return res;
        }
        const res = await createBuyerAddress(t, { ...data, label: fallbackLabel(data, count), is_default: true });
        if (res?.success) {
            setAddresses((prev) => [res.address, ...prev.map((a) => ({ ...a, is_default: false }))]);
            setSelectedId(res.address.id);
        }
        return res;
    }, []);

    const selectedAddress = useMemo(
        () => addresses.find((a) => a.id === selectedId) || null,
        [addresses, selectedId]
    );

    const value = useMemo(
        () => ({ addresses, selectedAddress, loading: loading || seeding, seeding, shopName, selectAddress, saveAddress }),
        [addresses, selectedAddress, loading, seeding, shopName, selectAddress, saveAddress]
    );

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function BuyerAddressProvider({ children }) {
    const parent = useContext(Ctx);
    if (parent) return <>{children}</>;
    return <Inner>{children}</Inner>;
}

export function useBuyerAddress() {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error("useBuyerAddress must be used inside <BuyerAddressProvider>");
    return ctx;
}