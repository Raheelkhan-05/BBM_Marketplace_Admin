import { useEffect, useState } from "react";

/**
 * Delays mounting non-critical children until the browser is idle (or a
 * fallback timeout fires), so their network requests never compete with
 * the requests the current page's visible content depends on. Used for
 * app-wide "background" features (contact sync, install prompts, pending
 * submission/payment resumption) that have nothing to do with what the
 * user is looking at right now.
 */
export default function DeferredMount({ children, timeout = 2500 }) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        if ("requestIdleCallback" in window) {
            const id = window.requestIdleCallback(() => setMounted(true), { timeout });
            return () => window.cancelIdleCallback(id);
        }
        const id = setTimeout(() => setMounted(true), timeout);
        return () => clearTimeout(id);
    }, [timeout]);

    return mounted ? children : null;
}