// src/components/PendingSubmissionWatcher.jsx
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchSellerAccessStatus, createSellerSubmission } from "../utils/api.js";
import {
    readPendingProductSubmission,
    clearPendingProductSubmission,
} from "../pages/SellPublishProductPage.jsx";

/**
 * Mounted once at the app root (see App.jsx). Runs in the background on every
 * page: if the user has a product listing draft cached (saved because they
 * weren't an approved seller yet when they tried to submit it), this checks
 * whether they've since become an approved seller — e.g. right after
 * onboarding is approved — and if so, submits that draft automatically so
 * the user never has to come back to the listing form to finish it.
 *
 * Renders nothing. Shows a small transient toast on success/failure so the
 * user isn't left wondering why a listing appeared.
 */
export default function PendingSubmissionWatcher() {
    const { token } = useAuth();
    const [toast, setToast] = useState(null); // { type: "success" | "info", message } | null
    const attemptedRef = useRef(false); // avoid double-fires (e.g. StrictMode / re-renders)

    useEffect(() => {
        if (!token) return;

        const pending = readPendingProductSubmission();
        if (!pending?.form) return;

        if (attemptedRef.current) return;
        attemptedRef.current = true;

        (async () => {
            try {
                const access = await fetchSellerAccessStatus(token);
                if (!access?.success || !access.canPublish) return; // not approved yet — leave draft cached, try again next mount

                const res = await createSellerSubmission(token, pending.form);
                if (res?.success) {
                    clearPendingProductSubmission();
                    setToast({ type: "success", message: "Your saved product listing has been submitted for review." });
                }
                // If it fails for a reason other than access (e.g. validation), leave the
                // draft cached — the user can still open the listing form to fix and resubmit.
            } catch {
                // Network or unexpected error — leave draft cached, silently retry on next mount.
                attemptedRef.current = false;
            }
        })();
    }, [token]);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 6000);
        return () => clearTimeout(t);
    }, [toast]);

    if (!toast) return null;

    return (
        <div className="fixed bottom-5 left-1/2 z-[9999] -translate-x-1/2 rounded-xl border border-[#7fb3bd]/40 bg-white px-4 py-3 text-[13px] font-semibold text-slate-700 shadow-[0_20px_50px_-15px_rgba(4,55,64,0.35)]">
            {toast.message}
        </div>
    );
}