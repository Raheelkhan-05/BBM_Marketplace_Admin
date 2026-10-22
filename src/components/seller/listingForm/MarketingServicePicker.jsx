import { useMemo } from "react";
import { motion } from "framer-motion";
import { Check, Lock, Store, LayoutGrid, Users, Target, Sparkles, Megaphone, Share2, AlertTriangle } from "lucide-react";
import { C } from "./FormPrimitives.jsx";
import {
    MARKETING_SERVICES, MARKETING_FEE_GST_PERCENT, normalizeServiceKeys, sumServicePercent, feeExample, round2,
} from "../../../shared/marketingServices.js";

const ICONS = { Store, LayoutGrid, Users, Target, Sparkles, Megaphone, Share2 };
const inr = (n) => (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/**
 * mode "set":    value = full plan (array) or null (= legacy, not yet converted). Required service locked on.
 * mode "add"/"remove": value = services to add/remove (bulk tool). Nothing is locked, except
 *                required services can't be removed.
 */
export default function MarketingServicePicker({
    value, onChange, legacyPercent = null, exampleOrderValue = 0, mode = "set", error = false, hideTotal = false,
}) {
    const isSet = mode === "set";
    const isLegacy = isSet && value === null;

    const selected = useMemo(() => {
        if (isSet) return new Set(isLegacy ? [] : normalizeServiceKeys(value));
        return new Set(Array.isArray(value) ? value : []);
    }, [value, isSet, isLegacy]);

    const total = isLegacy
        ? Number(legacyPercent) || 0
        : round2(MARKETING_SERVICES.filter((s) => selected.has(s.key)).reduce((a, s) => a + s.percent, 0));

    const toggle = (s) => {
        if (isLegacy) { onChange(normalizeServiceKeys([s.key])); return; }   // first tap converts
        if (isSet && s.required) return;
        if (mode === "remove" && s.required) return;
        const next = new Set(selected);
        next.has(s.key) ? next.delete(s.key) : next.add(s.key);
        onChange(isSet ? normalizeServiceKeys([...next]) : [...next]);
    };

    const ex = isSet && exampleOrderValue > 0 && total > 0 ? feeExample(exampleOrderValue, total) : null;

    return (
        <div className="flex flex-col gap-2.5">
            {isLegacy && (
                <div className="flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background: "#fef3c7" }}>
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "#b45309" }} />
                    <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-extrabold tracking-wide" style={{ color: "#92400e" }}>
                            Legacy plan · {legacyPercent != null ? `${legacyPercent}%` : "custom %"}
                        </p>
                        <p className="mt-0.5 text-[11.5px] font-semibold leading-snug tracking-wide" style={{ color: "#92400e" }}>
                            This listing still uses a custom percentage. It keeps being charged the same until you pick services below.
                        </p>
                        <button type="button" onClick={() => onChange(normalizeServiceKeys([]))}
                            className="mt-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-bold text-white" style={{ background: C.primary }}>
                            Switch to the new plan
                        </button>
                    </div>
                </div>
            )}

            <div role="group" aria-label="Marketing services" className="flex flex-col gap-2">
                {MARKETING_SERVICES.map((s) => {
                    const Icon = ICONS[s.icon] || Megaphone;
                    const on = selected.has(s.key);
                    const locked = !isLegacy && ((isSet && s.required) || (mode === "remove" && s.required));
                    return (
                        <motion.button
                            key={s.key} type="button" role="checkbox" aria-checked={on} disabled={locked}
                            onClick={() => toggle(s)} whileTap={locked ? undefined : { scale: 0.99 }}
                            className="flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors duration-150 disabled:cursor-default"
                            style={{ borderColor: on ? C.primary : C.hair, background: on ? "rgba(11,17,22,0.03)" : "#fff" }}
                        >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                                style={{ background: on ? C.primary : C.hairSoft, color: on ? "#fff" : C.muted }}>
                                <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-[13.5px] font-extrabold tracking-wide" style={{ color: C.ink }}>{s.label}</span>
                                    {s.required && (
                                        <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-[2px] text-[9px] font-bold uppercase tracking-wider"
                                            style={{ background: C.hairSoft, color: C.muted }}>
                                            <Lock className="h-2.5 w-2.5" /> Required
                                        </span>
                                    )}
                                </span>
                                <span className="mt-0.5 block text-[11.5px] font-medium leading-snug tracking-wide" style={{ color: C.muted }}>
                                    {s.description}
                                </span>
                            </span>
                            <span className="flex shrink-0 flex-col items-end gap-1.5">
                                <span className="text-[13px] font-extrabold tabular-nums" style={{ color: C.ink }}>+{s.percent}%</span>
                                <span className="flex h-5 w-5 items-center justify-center rounded-full border"
                                    style={{ borderColor: on ? C.primary : C.hair, background: on ? C.primary : "#fff" }}>
                                    {on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                                </span>
                            </span>
                        </motion.button>
                    );
                })}
            </div>

            {!hideTotal && (
                <div className="rounded-xl border p-3" style={{ borderColor: error ? "rgba(199,31,17,0.4)" : C.hairSoft, background: C.hairSoft }}>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: C.muted }}>
                            {isSet ? "Total promotion budget" : mode === "add" ? "Adds" : "Removes"}
                        </span>
                        <span className="text-[22px] font-black leading-none tabular-nums" style={{ color: C.ink }}>{total}%</span>
                    </div>
                    <p className="mt-1.5 text-[11px] font-semibold leading-snug tracking-wide" style={{ color: C.muted }}>
                        Charged only when an order is generated. {MARKETING_FEE_GST_PERCENT}% GST applies on the fee.
                    </p>
                    {ex && (
                        <p className="mt-1.5 text-[11.5px] font-bold tabular-nums tracking-wide" style={{ color: C.ink }}>
                            On a ₹{inr(exampleOrderValue)} order: ₹{inr(ex.fee)} + ₹{inr(ex.gst)} GST = ₹{inr(ex.total)} from your credits
                        </p>
                    )}
                </div>
            )}
            {error && <p className="text-[11px] font-bold" style={{ color: C.danger }}>Choose your marketing plan to continue.</p>}
        </div>
    );
}