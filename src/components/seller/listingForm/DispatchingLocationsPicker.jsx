// components/seller/listingForm/DispatchingLocationsPicker.jsx
import { useEffect, useRef, useState } from "react";
import { Search, ChevronDown, ChevronRight, X, Plus, Loader2 } from "lucide-react";
import { fetchGeoCountries, fetchGeoStates, fetchGeoCities } from "../../../utils/sellerListingApi.js";
import { C, Label } from "./FormPrimitives.jsx";

// Pauses the global Lenis smooth-scroll instance while the pointer is over an
// inner scrollable area, so native wheel scrolling works there instead of the
// page hijacking it. Resumes Lenis on mouse leave / unmount.
//
// Lenis attaches its own wheel listener on the window and calls
// preventDefault/stopPropagation from there, so just toggling lenis.stop()/
// start() on hover isn't always enough — the wheel event can still get
// swallowed before it reaches this element. To be safe we also manually
// scroll the container ourselves and stop the event from propagating up to
// Lenis's listener whenever the pointer is over it.
function useLenisHijack() {
    const ref = useRef(null);
    const hoveringRef = useRef(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const getLenis = () => (typeof window !== "undefined" ? window.lenis : null);

        const handleMouseEnter = () => {
            hoveringRef.current = true;

            const lenis = getLenis();
            if (typeof lenis?.stop === "function") {
                lenis.stop();
            }
        };

        const handleMouseLeave = () => {
            hoveringRef.current = false;

            const lenis = getLenis();
            if (typeof lenis?.start === "function") {
                lenis.start();
            }
        };

        const handleWheel = (e) => {
            if (!hoveringRef.current) return;

            const atTop = el.scrollTop <= 0;
            const atBottom = Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight;

            // Only let the page take over if we're already at the edge in the
            // direction being scrolled (so overscroll still bubbles up nicely).
            const scrollingUp = e.deltaY < 0;
            const scrollingDown = e.deltaY > 0;
            if ((scrollingUp && atTop) || (scrollingDown && atBottom)) return;

            // Manually move the container and keep the event from reaching
            // Lenis's window-level listener.
            e.preventDefault();
            e.stopPropagation();
            el.scrollTop += e.deltaY;
        };

        el.addEventListener("mouseenter", handleMouseEnter);
        el.addEventListener("mouseleave", handleMouseLeave);
        el.addEventListener("wheel", handleWheel, { passive: false });

        return () => {
            el.removeEventListener("mouseenter", handleMouseEnter);
            el.removeEventListener("mouseleave", handleMouseLeave);
            el.removeEventListener("wheel", handleWheel);

            const lenis = getLenis();
            if (typeof lenis?.start === "function") {
                lenis.start();
            }
        };
    }, []);

    return ref;
}

function HeaderCheckbox({ checked, indeterminate, onChange }) {
    const ref = useRef(null);
    useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
    return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} className="h-3.5 w-3.5" />;
}

function CityPanel({ state, mode, restriction, onSetRestriction }) {
    const [allCities, setAllCities] = useState(null); // null = loading
    const [filter, setFilter] = useState("");
    const [customInput, setCustomInput] = useState("");
    const cityScrollRef = useLenisHijack();

    useEffect(() => {
        setAllCities(null);
        fetchGeoCities(state.id).then((r) => setAllCities(r?.success ? r.items.map((c) => c.name) : []));
    }, [state.id]);

    if (allCities === null) {
        return <div className="ml-9 mt-2 flex items-center gap-2 text-[12.5px] font-medium" style={{ color: C.muted }}><Loader2 className="h-3 w-3 animate-spin" /> Loading cities…</div>;
    }

    const isChecked = (city) => {
        if (mode === "exclude") return !(restriction || []).includes(city);
        return restriction === undefined || restriction.includes(city);
    };

    const toggleCity = (city) => {
        if (mode === "exclude") {
            const excluded = restriction || [];
            onSetRestriction(excluded.includes(city) ? excluded.filter((c) => c !== city) : [...excluded, city]);
        } else {
            const included = restriction === undefined ? allCities : restriction;
            onSetRestriction(included.includes(city) ? included.filter((c) => c !== city) : [...included, city]);
        }
    };

    const restrictedCount = mode === "exclude" ? (restriction || []).length : (restriction ? allCities.length - restriction.length : 0);
    const allSelected = restrictedCount === 0;
    const noneSelected = mode === "exclude" ? restriction?.length === allCities.length && allCities.length > 0 : restriction?.length === 0;

    const selectAll = () => onSetRestriction(undefined);
    const deselectAll = () => onSetRestriction(mode === "exclude" ? [...allCities] : []);

    const visible = filter.trim() ? allCities.filter((c) => c.toLowerCase().includes(filter.trim().toLowerCase())) : allCities;

    const addCustom = () => {
        const name = customInput.trim();
        if (!name) return;
        if (mode === "exclude") onSetRestriction([...(restriction || []), name]);
        else onSetRestriction([...(restriction === undefined ? allCities : restriction), name]);
        setCustomInput("");
    };

    return (
        <div className="ml-9 mt-2 flex flex-col gap-2 rounded-lg border p-2.5" style={{ borderColor: C.hairSoft }}>
            <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[12.5px] font-bold" style={{ color: C.ink }}>
                    <HeaderCheckbox checked={allSelected} indeterminate={!allSelected && !noneSelected} onChange={() => (allSelected ? deselectAll() : selectAll())} />
                    Select all cities
                </label>
                <span className="text-[11.5px] font-semibold" style={{ color: mode === "exclude" ? C.primary : C.secondary }}>
                    {mode === "exclude"
                        ? (restrictedCount > 0 ? `${restrictedCount} excluded` : "All included")
                        : (restriction === undefined ? "All included" : `${restriction.length} of ${allCities.length} included`)}
                </span>
            </div>

            {allCities.length > 6 && (
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2" style={{ color: C.muted }} />
                    <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter cities…"
                        className="w-full rounded-md border py-1 pl-6 pr-2 text-[12px] font-medium focus:outline-none" style={{ borderColor: C.hair }} />
                </div>
            )}

            {allCities.length === 0 ? (
                <p className="text-[12px] font-medium" style={{ color: C.muted }}>No cities on file for {state.name} yet — add one manually below.</p>
            ) : (
                <div ref={cityScrollRef} className="grid max-h-40 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto pr-1 sm:grid-cols-3">
                    {visible.map((city) => (
                        <label key={city} className="flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: C.ink }}>
                            <input type="checkbox" checked={isChecked(city)} onChange={() => toggleCity(city)} className="h-3 w-3 shrink-0" />
                            <span className="truncate">{city}</span>
                        </label>
                    ))}
                </div>
            )}

            <div className="flex gap-1.5 border-t pt-2" style={{ borderColor: C.hairSoft }}>
                <input value={customInput} onChange={(e) => setCustomInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
                    placeholder="City not listed? Type and press Enter"
                    className="min-w-0 flex-1 rounded-md border px-2 py-1 text-[12px] font-medium focus:outline-none" style={{ borderColor: C.hair }} />
                <button type="button" onClick={addCustom} className="shrink-0 rounded-md border px-2" style={{ borderColor: C.hair, color: C.secondary }}>
                    <Plus className="h-3 w-3" />
                </button>
            </div>
        </div>
    );
}

function StateRow({ state, checked, onToggleState, mode, restriction, onSetRestriction }) {
    const [expanded, setExpanded] = useState(false);
    const hasCityRestriction = mode === "exclude" ? (restriction?.length > 0) : (restriction !== undefined);

    return (
        <div className="border-b py-2" style={{ borderColor: C.hairSoft }}>
            <div className="flex items-center gap-2 tracking-wide">
                <button type="button" onClick={() => setExpanded((e) => !e)} disabled={!checked} className="shrink-0">
                    {expanded ? <ChevronDown className="h-3.5 w-3.5" style={{ color: checked ? C.muted : C.hair }} /> : <ChevronRight className="h-3.5 w-3.5" style={{ color: checked ? C.muted : C.hair }} />}
                </button>
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={checked} onChange={() => onToggleState(state.name)} className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 truncate text-[14px] font-semibold" style={{ color: checked ? C.ink : C.muted }}>{state.name}</span>
                </label>
                {checked && hasCityRestriction && (
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${C.primary}12`, color: C.primary }}>Customized</span>
                )}
            </div>
            {expanded && checked && (
                <CityPanel state={state} mode={mode} restriction={restriction} onSetRestriction={(next) => onSetRestriction(state.name, next)} />
            )}
        </div>
    );
}

export default function DispatchingLocationsPicker({ value, onChange }) {
    // value: { country, mode: 'exclude'|'include', excludedStates, citiesByState, includedStates, includedCitiesByState }
    // Country is locked to India — no country picker is shown to the seller.
    const [states, setStates] = useState([]);
    const [q, setQ] = useState("");
    const statesScrollRef = useLenisHijack();

    const mode = value?.mode || "exclude";
    const excludedStates = value?.excludedStates || [];
    const citiesByState = value?.citiesByState || {};
    const includedStates = value?.includedStates || [];
    const includedCitiesByState = value?.includedCitiesByState || {};

    // Auto-select India as soon as we know its id, if it isn't set yet.
    // useEffect(() => {
    //     if (value?.country) return;
    //     fetchGeoCountries().then((r) => {
    //         if (!r?.success) return;
    //         const india = r.items.find((c) => c.name?.toLowerCase() === "india");
    //         if (india) pickCountry(india);
    //     });
    //     // eslint-disable-next-line react-hooks/exhaustive-deps
    // }, [value?.country]);

    // Auto-select India as soon as we know its id, if it isn't set yet — and
    // also repair a country loaded from a saved listing that has name/code
    // but no id (unflattenDispatchingLocations in the admin page can't know
    // the id, since the flattened storage format never persisted one).
    useEffect(() => {
        if (value?.country?.id) return; // already fully resolved, nothing to do
        fetchGeoCountries().then((r) => {
            if (!r?.success) return;
            if (value?.country?.name) {
                // We have a name (and maybe code) but no id — resolve it by
                // matching name, preserving everything else already set
                // (mode, excludedStates, citiesByState, etc).
                const match = r.items.find((c) => c.name?.toLowerCase() === value.country.name.toLowerCase());
                if (match) onChange({ ...value, country: match });
                return;
            }
            const india = r.items.find((c) => c.name?.toLowerCase() === "india");
            if (india) pickCountry(india);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value?.country?.id, value?.country?.name]);

    useEffect(() => {
        if (!value?.country?.id) { setStates([]); return; }
        fetchGeoStates(value.country.id, q).then((r) => { if (r?.success) setStates(r.items); });
    }, [value?.country?.id, q]);

    const pickCountry = (c) => onChange({ country: c, mode: "exclude", excludedStates: [], citiesByState: {}, includedStates: [], includedCitiesByState: {} });
    const setMode = (m) => onChange({ ...value, mode: m });

    const toggleExcludeState = (name) => {
        const next = excludedStates.includes(name) ? excludedStates.filter((s) => s !== name) : [...excludedStates, name];
        onChange({ ...value, excludedStates: next });
    };
    const setExcludeCities = (state, cities) => onChange({ ...value, citiesByState: { ...citiesByState, [state]: cities } });

    const toggleIncludeState = (name) => {
        const next = includedStates.includes(name) ? includedStates.filter((s) => s !== name) : [...includedStates, name];
        const nextCities = { ...includedCitiesByState };
        if (!next.includes(name)) delete nextCities[name];
        onChange({ ...value, includedStates: next, includedCitiesByState: nextCities });
    };
    const setIncludeCities = (state, cities) => onChange({ ...value, includedCitiesByState: { ...includedCitiesByState, [state]: cities } });

    const selectAllStates = () => onChange({ ...value, excludedStates: [] });
    const clearAllStates = () => onChange({ ...value, includedStates: [], includedCitiesByState: {} });

    // Always-accurate summary — never claims "everywhere" once exclusions exist.
    const excludedStateCount = excludedStates.length;
    const summary = mode === "exclude"
        ? (excludedStateCount === 0 ? `Delivering to all of ${value?.country?.name || "the country"}` : `Delivering to ${value.country?.name} except ${excludedStateCount} state${excludedStateCount === 1 ? "" : "s"}`)
        : (includedStates.length === 0 ? "No states selected yet — pick at least one" : `Delivering only to ${includedStates.length} selected state${includedStates.length === 1 ? "" : "s"}`);

    return (
        <div className="flex flex-col gap-1.5">
            <Label>Dispatching locations <span style={{ color: C.primary }}> *</span></Label>
            {!value?.country ? (
                <div className="flex items-center gap-2 rounded-xl border p-3 text-[12.5px] font-medium" style={{ borderColor: C.hair, color: C.muted }}>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading India…
                </div>
            ) : (
                <div className="rounded-xl border p-3" style={{ borderColor: C.hair }}>
                    <div className="mb-2 flex items-center justify-between tracking-wider gap-2">
                        <span className="truncate text-[13.5px] font-extrabold" style={{ color: C.ink }}>{value.country.name}</span>
                    </div>

                    <div className="mb-2 flex w-fit gap-1 rounded-lg p-1 tracking-wide" style={{ background: C.hairSoft }}>
                        <button type="button" onClick={() => setMode("exclude")} className="rounded-md px-3 py-1.5 text-[11px] font-bold transition-colors duration-150" style={mode === "exclude" ? { background: C.secondary, color: "#fff" } : { color: C.muted }}>Exclude specific places</button>
                        <button type="button" onClick={() => setMode("include")} className="rounded-md px-3 py-1.5 text-[11px] font-bold transition-colors duration-150" style={mode === "include" ? { background: C.secondary, color: "#fff" } : { color: C.muted }}>Include specific places only</button>
                    </div>

                    <div className="mb-2.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold tracking-wide" style={{ background: excludedStateCount > 0 || mode === "include" ? `${C.primary}0c` : `${C.secondary}0c`, color: excludedStateCount > 0 || mode === "include" ? C.primary : C.secondary }}>
                        {summary}
                    </div>

                    <div className="mb-2 flex items-center gap-1.5">
                        <div className="relative flex-1">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: C.muted }} />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search states…" className="w-full rounded-lg border px-8 py-1.5 text-[13px] font-medium focus:outline-none focus:ring-2 tracking-wide" style={{ borderColor: C.hair, ["--tw-ring-color"]: `${C.secondary}22` }} />
                        </div>
                    </div>

                    <div ref={statesScrollRef} className="max-h-64 overflow-y-auto">
                        {states.map((s) => mode === "exclude" ? (
                            <StateRow key={s.id} state={s} checked={!excludedStates.includes(s.name)} onToggleState={toggleExcludeState}
                                mode="exclude" restriction={citiesByState[s.name]} onSetRestriction={setExcludeCities} />
                        ) : (
                            <StateRow key={s.id} state={s} checked={includedStates.includes(s.name)} onToggleState={toggleIncludeState}
                                mode="include" restriction={includedCitiesByState[s.name]} onSetRestriction={setIncludeCities} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}