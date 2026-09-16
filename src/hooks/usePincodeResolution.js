// hooks/usePincodeResolution.js
import { useEffect, useRef, useState } from "react";
import { lookupPincode } from "../utils/sellerListingApi.js";

const DEBOUNCE_MS = 400;

// Resolves a 6-digit pincode to { state, district } via the shared
// lookupPincode API helper (same API_BASE convention as the rest of the
// app — not a hardcoded path). Debounced, cancellable, and race-safe: if
// the pincode changes again before a lookup resolves, that stale response
// is discarded instead of clobbering a newer one.
export function usePincodeResolution(pincode) {
    const [resolved, setResolved] = useState(null);
    const [status, setStatus] = useState("idle"); // idle | loading | ok | error
    const [message, setMessage] = useState(null);

    // Tracks the pincode each in-flight lookup was for, so a slow older
    // request can't overwrite state set by a newer one.
    const requestedForRef = useRef(null);

    useEffect(() => {
        const trimmed = (pincode || "").trim();

        if (!/^\d{6}$/.test(trimmed)) {
            requestedForRef.current = null;
            setResolved(null);
            setStatus("idle");
            setMessage(null);
            return;
        }

        setStatus("loading");
        setMessage(null);

        const debounceTimer = setTimeout(async () => {
            requestedForRef.current = trimmed;
            let res;
            try {
                res = await lookupPincode(trimmed);
            } catch {
                res = null; // network/parse failure — treated the same as a service error below
            }

            // A newer pincode superseded this request while it was in flight.
            if (requestedForRef.current !== trimmed) return;

            if (res?.success) {
                setResolved({ state: res.state, district: res.district });
                setStatus("ok");
                setMessage(null);
            } else {
                setResolved(null);
                setStatus("error");
                setMessage(res?.message || "Couldn't verify this pincode. You can still enter your location manually.");
            }
        }, DEBOUNCE_MS);

        return () => {
            clearTimeout(debounceTimer);
            // Prevents a request that was already sent (timer fired) but
            // hasn't resolved yet from writing state after this cleanup.
            if (requestedForRef.current === trimmed) requestedForRef.current = null;
        };
    }, [pincode]);

    return { resolved, status, message };
}