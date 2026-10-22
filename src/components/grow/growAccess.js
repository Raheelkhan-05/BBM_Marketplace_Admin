// src/components/grow/growAccess.js
// Module-level cache for fetchSellerAccessStatus, shared by /grow/details and /grow.
// The details page warms it in the background, so "Add your products" can route instantly.
import { fetchSellerAccessStatus } from "../../utils/api.js";

const TTL = 60_000; // ms a successful result stays fresh
let cache = { token: null, at: 0, value: null, promise: null };

const fallback = { canPublish: false, reason: "NOT_AUTHENTICATED" };

/** Fresh cached result for this token, or null. Synchronous. */
export function peekAccess(token) {
    return token && cache.token === token && cache.value && Date.now() - cache.at < TTL ? cache.value : null;
}

/** Cached result, an in-flight request, or a new request. Failures are never cached. */
export function loadAccess(token) {
    if (!token) return Promise.resolve(fallback);
    const hit = peekAccess(token);
    if (hit) return Promise.resolve(hit);
    if (cache.token === token && cache.promise) return cache.promise;

    const p = Promise.resolve()
        .then(() => fetchSellerAccessStatus(token))
        .catch(() => null)
        .then((r) => {
            if (cache.promise === p) {
                cache = r?.success ? { token, at: Date.now(), value: r, promise: null } : { token: null, at: 0, value: null, promise: null };
            }
            return r?.success ? r : fallback;
        });
    cache = { token, at: 0, value: null, promise: p };
    return p;
}

/** Record a known result (e.g. right after onboarding finishes). */
export function setAccess(token, value) {
    cache = { token, at: Date.now(), value, promise: null };
}

export function clearAccess() {
    cache = { token: null, at: 0, value: null, promise: null };
}