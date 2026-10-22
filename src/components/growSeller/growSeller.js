// src/components/grow/growSeller.js
// "Seen the GROW landing page" flag + the single definition of "this user is a ready seller".
import { peekAccess } from "../grow/growAccess.js";

const DEVICE_KEY = "grow_landing_seen_device";
const userKey = (id) => `grow_landing_seen_${id}`;

// Stable per-user id from whatever the profile carries.
export function profileKey(profile) {
    const id = profile?.id ?? profile?.user_id ?? profile?.email ?? profile?.phone;
    return id ? String(id) : null;
}

/** Logged-in users are tracked per user, visitors per device. */
export function hasSeenGrow(profile) {
    try {
        const k = profileKey(profile);
        return localStorage.getItem(k ? userKey(k) : DEVICE_KEY) === "1";
    } catch { return false; }
}

export function markSeenGrow(profile) {
    try {
        localStorage.setItem(DEVICE_KEY, "1");
        const k = profileKey(profile);
        if (k) localStorage.setItem(userKey(k), "1");
    } catch { /* private mode: the landing simply shows again */ }
}

/** Approved seller who may use the new seller area. Synchronous, so guards never flash. */
export function isSellerReady(profile, token) {
    return profile?.seller_status === "approved" || !!peekAccess(token)?.canPublish;
}
