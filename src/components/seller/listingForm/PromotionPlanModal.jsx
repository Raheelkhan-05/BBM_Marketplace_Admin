import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ArrowLeft, X, Loader2, AlertTriangle, Megaphone } from "lucide-react";
import MarketingServicePicker from "./MarketingServicePicker.jsx";
import { C, EASE } from "./FormPrimitives.jsx";
import { fetchAllMySubmissions, bulkUpdateMarketing } from "../../../utils/sellerListingApi.js";
import { normalizeServiceKeys, sumServicePercent } from "../../../shared/marketingServices.js";

const planKeys = (it) => (Array.isArray(it?.marketing_services) && it.marketing_services.length ? it.marketing_services : null);
const sameKeys = (a, b) => JSON.stringify(normalizeServiceKeys(a)) === JSON.stringify(normalizeServiceKeys(b));

/* ------------------------------------------------------------------ */
/* Shared helpers used by BOTH the My Products price modal and the     */
/* Home feed price modal, so the two can never drift apart.            */
/* ------------------------------------------------------------------ */

// Saves a full promotion plan for one listing ("set" mode).
// Returns { ok, patch?, message? } where `patch` holds the fields to merge into the caller's copy.
export async function savePromotionPlan(token, submissionId, keys) {
    const services = normalizeServiceKeys(keys);
    let res = null;
    try { res = await bulkUpdateMarketing(token, { submissionIds: [submissionId], mode: "set", services }); } catch { res = null; }
    if (res?.success) {
        const server = (res.items || []).find((r) => String(r.id) === String(submissionId)) || {};
        return {
            ok: true,
            message: res.message,
            patch: { marketing_services: services, marketing_commission_percent: sumServicePercent(services), marketing_legacy_percent: null, ...server },
        };
    }
    return { ok: false, message: res?.message };
}

// One toast line for a combined price + promotion save.
// priceOk / promoOk: true = saved, false = failed, null = not part of this save.
export function saveResultMessage({ priceOk, promoOk, failMsg }) {
    const ok = [priceOk && "price", promoOk && "promotion"].filter(Boolean);
    const bad = [priceOk === false && "price", promoOk === false && "promotion"].filter(Boolean);
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    if (!bad.length) return ok.length ? `${cap(ok.join(" and "))} updated.` : null;
    if (ok.length) return `${cap(ok.join(" and "))} updated, but the ${bad[0]} couldn't be saved.`;
    return failMsg || `Couldn't update the ${bad.join(" and ")}. Try again.`;
}

// The "Promotion X% · Manage →" row shown inside the price modals.
// With a pending (not yet saved) change it reads "Promotion 5% → 7%".
export function PromotionRow({ currentPercent, pending, disabled, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="mt-4 flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors duration-150 hover:bg-black/[0.04] disabled:opacity-50"
            style={{ borderColor: pending ? C.primary : C.hair, background: C.hairSoft }}
        >
            <span className="flex items-center gap-2 text-[12px] font-bold tracking-wide" style={{ color: C.ink }}>
                <Megaphone className="h-3.5 w-3.5" />
                {pending ? <>Promotion {currentPercent ?? "—"}% → {pending.percent}%</> : <>Promotion {currentPercent ?? "—"}%</>}
            </span>
            <span className="text-[11px] font-bold tracking-wide" style={{ color: pending ? C.ink : C.muted }}>
                {pending ? "Change" : "Manage →"}
            </span>
        </button>
    );
}

/**
 * Services picker for ONE listing. It only PICKS — it never saves.
 *   Done  -> onDone(keys | null, percent): the parent price modal stages the selection and its own
 *            slide-to-confirm performs the save. `keys` is null when the selection equals the
 *            current plan (used to clear a previously staged change).
 *   Cancel / back / X / Escape -> onClose().
 *
 * `submission` needs { id } and ideally { marketing_services, marketing_commission_percent,
 * marketing_legacy_percent }. If `marketing_services` isn't a key on it (e.g. Home feed seller rows),
 * the current plan is loaded from the server before the picker is shown.
 * `stagedKeys` = a selection the parent already staged; the picker reopens on it.
 */
export default function PromotionPlanModal({ submission, token, title, stagedKeys, onClose, onDone }) {
    const provided = !!submission && Object.prototype.hasOwnProperty.call(submission, "marketing_services");
    const [base, setBase] = useState(provided ? planKeys(submission) : undefined); // undefined = still loading
    const [loadError, setLoadError] = useState(false);
    const [draft, setDraft] = useState(Array.isArray(stagedKeys) ? stagedKeys : provided ? planKeys(submission) : null);

    useEffect(() => {
        if (base !== undefined || !token || !submission?.id) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetchAllMySubmissions(token);
                if (cancelled) return;
                const found = res?.success ? (res.items || []).find((x) => String(x.id) === String(submission.id)) : null;
                if (found) { const keys = planKeys(found); setBase(keys); setDraft(Array.isArray(stagedKeys) ? stagedKeys : keys); }
                else setLoadError(true);
            } catch {
                if (!cancelled) setLoadError(true);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loading = base === undefined && !loadError;
    const isArr = Array.isArray(draft);
    const unchanged = isArr && Array.isArray(base) && sameKeys(draft, base);
    const hasStaged = Array.isArray(stagedKeys);
    const canDone = !loading && !loadError && isArr && (!unchanged || hasStaged);
    const nextKeys = isArr ? normalizeServiceKeys(draft) : [];
    const nextPercent = isArr ? sumServicePercent(nextKeys) : null;
    const legacyPercent = submission?.marketing_legacy_percent ?? submission?.marketing_commission_percent;

    const requestClose = useCallback(() => onClose?.(), [onClose]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") requestClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [requestClose]);

    const footerText = !isArr
        ? "Choose the services for this listing"
        : unchanged
            ? (hasStaged ? "Same as the current plan. Done will discard your pending change" : "Change the services to update this plan")
            : null;

    return createPortal(
        <motion.div
            className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center"
            data-scroll-lock-allow=""
            data-lenis-prevent=""
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="absolute inset-0" style={{ background: "rgba(11,17,22,0.5)" }} onClick={requestClose} aria-hidden="true" />
            <motion.div
                role="dialog" aria-modal="true" aria-labelledby="promo-modal-title"
                initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.22, ease: EASE }}
                className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
            >
                {/* Header */}
                <div className="flex items-center gap-3 border-b px-4 py-3.5" style={{ borderColor: C.hairSoft }}>
                    <button type="button" onClick={requestClose} aria-label="Back"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: C.hair }}>
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div className="min-w-0 flex-1">
                        <h2 id="promo-modal-title" className="text-[16px] font-extrabold leading-tight tracking-wide" style={{ color: C.ink }}>
                            Promotion services
                        </h2>
                        {title && <p className="truncate text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>{title}</p>}
                    </div>
                    <button type="button" onClick={requestClose} aria-label="Close"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.05]">
                        <X className="h-4 w-4" style={{ color: C.muted }} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-4 py-4" data-lenis-prevent="" data-scroll-lock-allow="">
                    {loading ? (
                        <div className="flex items-center justify-center gap-2 py-16 text-[12.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading your current services…
                        </div>
                    ) : loadError ? (
                        <p className="py-16 text-center text-[12.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                            Couldn't load your current services. Please close this and try again.
                        </p>
                    ) : (
                        <>
                            {base === null && (
                                <p className="mb-3 flex items-start gap-1.5 rounded-xl px-3 py-2 text-[11.5px] font-semibold leading-snug tracking-wide" style={{ background: "#fef3c7", color: "#b45309" }}>
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    This listing is on a legacy plan. Saving will move it to the new plan.
                                </p>
                            )}
                            <MarketingServicePicker value={draft} onChange={setDraft} mode="set" legacyPercent={legacyPercent} />
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3" style={{ borderColor: C.hairSoft }}>
                    <p className="mb-2.5 text-center text-[12px] font-bold tracking-wide" style={{ color: C.muted }}>
                        {footerText ?? <>Plan becomes <span style={{ color: C.ink }}>{nextPercent}%</span></>}
                    </p>
                    <div className="flex items-center gap-2.5">
                        <button type="button" onClick={requestClose}
                            className="flex-1 rounded-xl border px-4 py-2.5 text-[13px] font-bold tracking-wide" style={{ borderColor: C.hair, color: C.ink }}>
                            Cancel
                        </button>
                        <button type="button" onClick={() => onDone?.(unchanged ? null : nextKeys, nextPercent)} disabled={!canDone}
                            className="flex-[1.4] rounded-xl px-4 py-2.5 text-[13px] font-bold tracking-wide text-white disabled:opacity-40" style={{ background: C.primary }}>
                            Done
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>,
        document.body
    );
}