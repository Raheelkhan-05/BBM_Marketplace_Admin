// src/components/grow/GrowDeliveryPicker.jsx
// "Where do you deliver?" for the /grow wizard and the bulk review page. Same data model and payload format as
// DispatchingLocationsPicker (all India / exclude states+cities / include states+cities),
// restyled for the compact /grow design. Nothing is preselected.
//
// "Select all" is now ONE toggle button: it reads "Select all" while something in the list is unticked and
// "Unselect all" once everything shown is ticked. It acts on what is currently visible, so after typing in the
// filter box it only affects the matching states / cities.
import { useEffect, useRef, useState } from "react";
import { fetchGeoCities } from "../../utils/sellerListingApi.js";
import { useScrollLock } from "./growUi.js";
import "./grow-delivery.css";

export const blankDelivery = () => ({ mode: "", exS: [], exC: {}, inS: [], inC: {} });

const MODES = [["all", "All of India"], ["exclude", "All India except some"], ["include", "Only some places"]];
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

/** Returns an error message, or "" when the selection is complete. `total` = number of states loaded. */
export function validateDelivery(dl, total = 0) {
    if (!dl?.mode) return "Choose where you deliver.";
    if (dl.mode === "all") return "";
    if (!total) return "Loading states…";
    if (dl.mode === "exclude") return dl.exS.length >= total ? "At least one state must stay selected." : "";
    if (!dl.inS.length) return "Select at least one state.";
    const bad = dl.inS.find((s) => Array.isArray(dl.inC[s]) && dl.inC[s].length === 0);
    return bad ? `Select at least one city in ${bad}, or untick the state.` : "";
}

export function summarizeDelivery(dl) {
    if (!dl?.mode) return "Not set";
    if (dl.mode === "all") return "All of India";
    if (dl.mode === "exclude") {
        const cities = Object.entries(dl.exC).filter(([s, c]) => c?.length && !dl.exS.includes(s)).reduce((n, [, c]) => n + c.length, 0);
        if (!dl.exS.length && !cities) return "All of India";
        return `All of India except ${[dl.exS.length ? plural(dl.exS.length, "state", "states") : "", cities ? plural(cities, "city", "cities") : ""].filter(Boolean).join(" and ")}`;
    }
    const custom = dl.inS.filter((s) => Array.isArray(dl.inC[s])).length;
    return `${plural(dl.inS.length, "state", "states")} only${custom ? ` (${custom} with chosen cities)` : ""}`;
}

/** Flat dispatchingLocations array, same shape SellerListingForm submits. `c` = { name, code } of India. */
export function buildDispatching(dl, c) {
    const base = { type: "country", name: c.name, code: c.code };
    if (dl.mode === "include") {
        return [
            { ...base, includeOnly: true },
            ...dl.inS.map((name) => (dl.inC[name] !== undefined ? { type: "state", name, includedCities: dl.inC[name] } : { type: "state", name })),
        ];
    }
    if (dl.mode === "exclude") {
        return [
            { ...base, excludedStates: dl.exS },
            ...Object.entries(dl.exC).filter(([s, cities]) => cities?.length && !dl.exS.includes(s)).map(([name, cities]) => ({ type: "state", name, excludedCities: cities })),
        ];
    }
    return [{ ...base, excludedStates: [] }];
}

const uniq = (a) => [...new Set(a)];

/* ------------------------------- cities ------------------------------- */
function CityPanel({ stateName, stateId, mode, value, onSet, cache }) {
    const [all, setAll] = useState(cache.current[stateId] || null); // null = loading
    const [f, setF] = useState("");
    const scroll = useScrollLock();

    useEffect(() => {
        if (all) return;
        let live = true;
        Promise.resolve(fetchGeoCities(stateId)).then((r) => {
            const names = r?.success ? r.items.map((c) => c.name) : [];
            if (r?.success) cache.current[stateId] = names;
            if (live) setAll(names);
        }).catch(() => { if (live) setAll([]); });
        return () => { live = false; };
    }, [stateId]); // eslint-disable-line

    if (!all) return <div className="gx-cp"><p className="gx-msg">Loading cities…</p></div>;

    // exclude: value = excluded cities (undefined/[] = none) · include: value = included cities (undefined = all)
    const sel = Array.isArray(value) ? value : [];
    const rows = [...all, ...sel.filter((c) => !all.includes(c))]; // keep manually added cities visible
    const isOn = (c) => (mode === "exclude" ? !sel.includes(c) : value === undefined || sel.includes(c));
    const sameAsAll = (arr) => arr.length === all.length && all.every((c) => arr.includes(c));

    const toggle = (c) => {
        if (mode === "exclude") return onSet(sel.includes(c) ? sel.filter((x) => x !== c) : [...sel, c]);
        const cur = value === undefined ? all : sel;
        const next = cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c];
        onSet(sameAsAll(next) ? undefined : next);
    };

    const shown = f.trim() ? rows.filter((c) => c.toLowerCase().includes(f.trim().toLowerCase())) : rows;
    const allOn = shown.length > 0 && shown.every(isOn);
    const toggleAll = () => {
        if (!shown.length) return;
        if (mode === "exclude") {
            onSet(allOn ? uniq([...sel, ...shown]) : sel.filter((c) => !shown.includes(c)));
            return;
        }
        const cur = value === undefined ? all : sel;
        const next = allOn ? cur.filter((c) => !shown.includes(c)) : uniq([...cur, ...shown]);
        onSet(sameAsAll(next) ? undefined : next);
    };
    const onCount = rows.filter(isOn).length;

    return (
        <div className="gx-cp">
            <div className="gx-bar" style={{ marginTop: 0 }}>
                <span>{mode === "exclude" ? (sel.length ? `${plural(sel.length, "city", "cities")} excluded` : "All cities included") : `${onCount} of ${rows.length} cities`}</span>
                <div className="gx-links">
                    <button type="button" className="gx-link" disabled={!shown.length} onClick={toggleAll}>{allOn ? "Unselect all" : "Select all"}</button>
                </div>
            </div>
            {rows.length > 8 && <div className="inp"><input value={f} onChange={(e) => setF(e.target.value)} placeholder={`Filter cities in ${stateName}…`} aria-label="Filter cities" /></div>}
            {rows.length === 0
                ? <p className="gx-msg">No cities on file for {stateName}.</p>
                : (
                    <div className="gx-cg" ref={scroll} data-lenis-prevent>
                        {shown.map((c) => (
                            <label key={c} className="gx-ck"><input type="checkbox" checked={isOn(c)} onChange={() => toggle(c)} /><span>{c}</span></label>
                        ))}
                        {!shown.length && <p className="gx-msg" style={{ gridColumn: "1/-1" }}>No city matches.</p>}
                    </div>
                )}
        </div>
    );
}

/* ------------------------------- picker ------------------------------- */
/**
 * value: blankDelivery() shape · states: [{ id, name }] · status: idle | loading | ready | error
 */
export default function GrowDeliveryPicker({ value, onChange, states, status, onRetry }) {
    const [q, setQ] = useState("");
    const [openSt, setOpenSt] = useState("");
    const cache = useRef({});
    const scroll = useScrollLock();
    const mode = value.mode;
    const err = validateDelivery(value, states.length);

    const setMode = (m) => { onChange({ ...value, mode: m }); setOpenSt(""); setQ(""); };
    const isOn = (name) => (mode === "exclude" ? !value.exS.includes(name) : value.inS.includes(name));
    const toggleState = (name) => {
        if (mode === "exclude") {
            onChange({ ...value, exS: value.exS.includes(name) ? value.exS.filter((s) => s !== name) : [...value.exS, name] });
        } else {
            const on = value.inS.includes(name);
            const inC = { ...value.inC };
            if (on) delete inC[name];
            onChange({ ...value, inS: on ? value.inS.filter((s) => s !== name) : [...value.inS, name], inC });
        }
        if (openSt === name) setOpenSt("");
    };
    const setCities = (name, next) => {
        const key = mode === "exclude" ? "exC" : "inC";
        const copy = { ...value[key] };
        if (next === undefined || (mode === "exclude" && !next.length)) delete copy[name]; else copy[name] = next;
        onChange({ ...value, [key]: copy });
    };

    const list = q.trim() ? states.filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase())) : states;
    const picked = mode === "exclude" ? states.length - value.exS.length : value.inS.length;
    const allOn = list.length > 0 && list.every((s) => isOn(s.name));

    // One button: selects everything shown, or unselects everything shown, depending on the current ticks.
    const toggleAll = () => {
        if (!list.length) return;
        const names = list.map((s) => s.name);
        setOpenSt("");
        if (mode === "exclude") {
            if (allOn) { // untick all shown = exclude them
                onChange({ ...value, exS: uniq([...value.exS, ...names]) });
            } else {
                const exC = { ...value.exC };
                if (!q.trim()) Object.keys(exC).forEach((k) => delete exC[k]); // full "select all" also clears city exclusions
                onChange({ ...value, exS: value.exS.filter((n) => !names.includes(n)), exC });
            }
        } else if (allOn) {
            const inC = { ...value.inC };
            names.forEach((n) => delete inC[n]);
            onChange({ ...value, inS: value.inS.filter((n) => !names.includes(n)), inC });
        } else {
            onChange({ ...value, inS: uniq([...value.inS, ...names]) });
        }
    };

    return (
        <div>
            <div className="chips">
                {MODES.map(([k, t]) => <button key={k} type="button" className="chip" aria-pressed={mode === k} onClick={() => setMode(k)}>{t}</button>)}
            </div>

            {mode === "all" && <p className="gx-sum" style={{ marginTop: 12 }}>Delivering to all of India.</p>}

            {(mode === "exclude" || mode === "include") && (
                <div className="gx-box">
                    {status === "error" ? (
                        <p className="gx-sum err">Could not load the states. <button type="button" className="gx-link" onClick={onRetry}>Try again</button></p>
                    ) : status === "loading" || !states.length ? (
                        <p className="gx-sum warn">Loading states…</p>
                    ) : (
                        <p className={`gx-sum${err ? " warn" : ""}`}>{err || `Delivering to: ${summarizeDelivery(value)}`}</p>
                    )}

                    {states.length > 0 && (<>
                        <div className="inp"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search states…" aria-label="Search states" /></div>
                        <div className="gx-bar">
                            <span>{picked} of {states.length} states selected</span>
                            <div className="gx-links">
                                <button type="button" className="gx-link" disabled={!list.length} onClick={toggleAll}>{allOn ? "Unselect all" : "Select all"}</button>
                            </div>
                        </div>
                        <div className="gx-states" ref={scroll} data-lenis-prevent>
                            {list.map((s) => {
                                const on = isOn(s.name);
                                const custom = mode === "exclude" ? (value.exC[s.name] || []).length > 0 : Array.isArray(value.inC[s.name]);
                                const exp = openSt === s.name;
                                return (
                                    <div className="gx-st" key={s.id}>
                                        <div className="gx-sr">
                                            <label className={`gx-ck${on ? "" : " off"}`}>
                                                <input type="checkbox" checked={on} onChange={() => toggleState(s.name)} />
                                                <span>{s.name}</span>
                                            </label>
                                            {on && (
                                                <button type="button" className={`gx-cb${custom ? " cust" : ""}`} aria-expanded={exp} onClick={() => setOpenSt(exp ? "" : s.name)}>
                                                    {custom ? "Cities edited" : "All cities"}<i />
                                                </button>
                                            )}
                                        </div>
                                        {on && exp && (
                                            <CityPanel stateName={s.name} stateId={s.id} mode={mode}
                                                value={mode === "exclude" ? value.exC[s.name] : value.inC[s.name]}
                                                onSet={(next) => setCities(s.name, next)} cache={cache} />
                                        )}
                                    </div>
                                );
                            })}
                            {!list.length && <p className="gx-msg">No state matches “{q}”.</p>}
                        </div>
                    </>)}
                </div>
            )}
        </div>
    );
}