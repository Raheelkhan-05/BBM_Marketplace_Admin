// pages/TransportLibraryPage.jsx
//
// Two tabs:
//  - "Browse"  — public: search transport options across all sellers by
//     origin/dest city. Results are deduped by route + mode + company
//     identity (NOT shown seller-by-seller/company-by-company — this is
//     "has anyone already set this up on this route", not a seller
//     directory), so the same company only ever appears once per route.
//     If the current seller already has this route+company themselves,
//     the card shows "Remove" instead of "Use this". Press Enter in
//     either city field to search.
//  - "Manage"  — seller-only: their own route options (add new directly —
//     no approval needed for their own additions) + pending proposals from
//     buyers that need approve/reject. "Add new" opens a modal with the
//     mode picker + quick-add fields instead of an inline panel.
//
// Route suggestion: mount at /transport-library, and link "Manage" at
// /transport-library/manage (the same page, tab=manage) — this matches
// the `link` used in transportLibrary.controller.js's notifyUser calls.
import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Truck, Search, Loader2, Plus, Check, X as XIcon, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTransportLibrary } from "../context/TransportLibraryContext.jsx";
import {
    browseTransportLibrary, fetchMyRouteOptions, fetchPendingProposals,
    createOwnRouteOption, deleteOwnRouteOption, approveProposal, rejectProposal,
} from "../utils/api.transport.js";
import {
    ROUTE_TRANSPORT_GROUPS, getRouteTransportFields, routeTransportModeLabel,
    routeOptionSummary, routeOptionIdentity,
} from "../../shared/routeTransportFields.js";

const C = { ink: "#0B1116", muted: "#667077", primary: "#D2462B", secondary: "#006F83", hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)" };
const EASE = [0.16, 1, 0.3, 1];

// Applied wherever free-form labels/values get rendered, so casing stays
// visually uniform no matter what case the underlying string is in.
const CAP = "capitalize tracking-wide";

// Normalizes a single piece of a dedup key: trims edges, collapses any
// run of internal whitespace to one space, and lowercases. Applied to
// EVERY part of the key (city, mode, identity) so two rows for the same
// real-world route that merely differ in casing (e.g. "Rajkot" vs
// "rajkot") are still recognised as the same route.
function normPart(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normKey(originCity, destCity, mode, identity) {
    return `${normPart(originCity)}::${normPart(destCity)}::${normPart(mode)}::${normPart(identity)}`;
}

// ---------------------------------------------------------------------
// Browse
// ---------------------------------------------------------------------

function RouteChip({ opt, mine, onAdd, onRemove, busy }) {
    const toSentenceCase = (value) => {
        if (!value) return "";
        const text = String(value).trim();
        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    };

    return (
        <div
            className="flex min-w-0 items-center justify-between gap-2.5 rounded-lg border px-3 py-2.5"
            style={{ borderColor: C.hair }}
        >
            <div className="min-w-0 flex-1">
                <p
                    className={`truncate text-[13px] font-bold ${CAP}`}
                    style={{ color: C.ink }}
                >
                    {toSentenceCase(routeOptionSummary(opt.mode, opt.fields))}
                </p>

                <p
                    className={`mt-0.5 truncate text-[11.5px] font-semibold ${CAP}`}
                    style={{ color: C.muted }}
                >
                    {toSentenceCase(routeTransportModeLabel(opt.mode))} ·{" "}
                    {toSentenceCase(opt.origin_city)} → {toSentenceCase(opt.dest_city)}
                </p>
            </div>

            {mine ? (
                <button
                    onClick={onRemove}
                    disabled={busy}
                    className="flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] font-bold tracking-wide disabled:opacity-60"
                    style={{ borderColor: "#B3261E30", color: "#B3261E" }}
                >
                    {busy ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                        <Trash2 className="h-3 w-3" />
                    )}
                    <span className="hidden xs:inline">Remove</span>
                    <span className="xs:hidden">Delete</span>
                </button>
            ) : (
                <button
                    onClick={onAdd}
                    disabled={busy}
                    className="flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] font-bold tracking-wide disabled:opacity-60"
                    style={{ borderColor: C.secondary, color: C.secondary }}
                >
                    {busy ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                        <Plus className="h-3 w-3" />
                    )}
                    <span>Use</span>
                </button>
            )}
        </div>
    );
}

function BrowseTab({ canAdd, token }) {
    const [originCity, setOriginCity] = useState("");
    const [destCity, setDestCity] = useState("");
    const [loading, setLoading] = useState(true);
    const [options, setOptions] = useState([]);
    const [myOptions, setMyOptions] = useState([]);
    const [busyKey, setBusyKey] = useState(null);

    const loadMine = useCallback(() => {
        if (!canAdd) return;
        fetchMyRouteOptions(token).then((res) => setMyOptions(res?.options || []));
    }, [canAdd, token]);

    const search = useCallback(() => {
        setLoading(true);
        Promise.all([
            browseTransportLibrary({ originCity, destCity }),
            canAdd ? fetchMyRouteOptions(token) : Promise.resolve(null),
        ]).then(([browseRes, mineRes]) => {
            setOptions(browseRes?.options || []);
            if (mineRes) setMyOptions(mineRes.options || []);
            setLoading(false);
        });
    }, [originCity, destCity, canAdd, token]);

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleKeyDown = (e) => {
        if (e.key === "Enter") search();
    };

    // De-dupe across sellers/companies — the seller cares whether a given
    // company already services this route, not who else is offering it.
    const dedupedOptions = useMemo(() => {
        const seen = new Set();
        const out = [];
        for (const opt of options) {
            const key = normKey(opt.origin_city, opt.dest_city, opt.mode, routeOptionIdentity(opt.mode, opt.fields));
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(opt);
        }
        return out;
    }, [options]);

    const myKeySet = useMemo(() => new Set(
        myOptions.map((o) => normKey(o.origin_city, o.dest_city, o.mode, routeOptionIdentity(o.mode, o.fields)))
    ), [myOptions]);

    const handleAdd = async (opt) => {
        const key = normKey(opt.origin_city, opt.dest_city, opt.mode, routeOptionIdentity(opt.mode, opt.fields));
        setBusyKey(key);
        const res = await createOwnRouteOption({
            originState: opt.origin_state, originCity: opt.origin_city,
            destState: opt.dest_state, destCity: opt.dest_city,
            mode: opt.mode, fields: opt.fields,
        }, token);
        setBusyKey(null);
        if (!res?.success) { window.alert(res?.message || "Couldn't add that route."); return; }
        loadMine();
    };

    const handleRemove = async (opt) => {
        const key = normKey(opt.origin_city, opt.dest_city, opt.mode, routeOptionIdentity(opt.mode, opt.fields));
        const mineMatch = myOptions.find((o) => normKey(o.origin_city, o.dest_city, o.mode, routeOptionIdentity(o.mode, o.fields)) === key);
        if (!mineMatch) return;
        setBusyKey(key);
        const res = await deleteOwnRouteOption(mineMatch.id, token);
        setBusyKey(null);
        if (!res?.success) { window.alert(res?.message || "Couldn't remove that route."); return; }
        loadMine();
    };

    return (
        <div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                    placeholder="From city"
                    value={originCity}
                    onKeyDown={handleKeyDown}
                    onChange={(e) => setOriginCity(e.target.value)}
                    className="h-10 min-w-0 flex-1 rounded-lg border px-3 text-[13px] tracking-wide outline-none"
                    style={{ borderColor: C.hair }}
                />

                <div className="flex min-w-0 flex-1 gap-2">
                    <input
                        placeholder="To city"
                        value={destCity}
                        onKeyDown={handleKeyDown}
                        onChange={(e) => setDestCity(e.target.value)}
                        className="h-10 min-w-0 flex-1 rounded-lg border px-3 text-[13px] tracking-wide outline-none"
                        style={{ borderColor: C.hair }}
                    />

                    <button
                        onClick={search}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
                        style={{ background: C.secondary }}
                        aria-label="Search"
                    >
                        <Search className="h-4 w-4" />
                    </button>
                </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {loading ? (
                    <div className="col-span-2 flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" style={{ color: C.muted }} /></div>
                ) : dedupedOptions.length === 0 ? (
                    <div className="col-span-2 flex flex-col items-center gap-2 py-12 text-center">
                        <Truck className="h-6 w-6" style={{ color: C.muted }} />
                        <p className="text-[14px] font-bold tracking-wide" style={{ color: C.ink }}>No Transport Options Found</p>
                        <p className="text-[12.5px] font-medium tracking-wide" style={{ color: C.muted }}>Try a different city, or check back later.</p>
                    </div>
                ) : dedupedOptions.map((opt) => {
                    const key = normKey(opt.origin_city, opt.dest_city, opt.mode, routeOptionIdentity(opt.mode, opt.fields));
                    return (
                        <RouteChip key={key} opt={opt}
                            mine={canAdd && myKeySet.has(key)}
                            busy={busyKey === key}
                            onAdd={() => handleAdd(opt)}
                            onRemove={() => handleRemove(opt)} />
                    );
                })}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------
// Manage
// ---------------------------------------------------------------------

// company/train/airline "identity" field intentionally dropped from the
// quick-add form per product ask — only branch/contact (already optional)
// remain alongside the route fields.
function nonIdentityFields(mode) {
    return getRouteTransportFields(mode).filter((f) => f.key !== "transport_company" && f.key !== "train_number" && f.key !== "airline_name");
}

function ModeQuickAdd({ mode, onAdded, onCancel, token }) {
    const [originState, setOriginState] = useState("");
    const [originCity, setOriginCity] = useState("");
    const [destState, setDestState] = useState("");
    const [destCity, setDestCity] = useState("");
    const [fields, setFields] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const modeFields = nonIdentityFields(mode);
    const canSubmit = originState && originCity && destState && destCity &&
        modeFields.filter((f) => f.required).every((f) => String(fields[f.key] || "").trim());

    const submit = async () => {
        setSubmitting(true);
        setError(null);
        const res = await createOwnRouteOption(
            { originState, originCity, destState, destCity, mode, fields },
            token
        );
        setSubmitting(false);
        if (!res?.success) { setError(res?.message || "Couldn't add that route."); return; }
        onAdded();
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && canSubmit && !submitting) submit();
    };

    return (
        <div className="mt-3 rounded-2xl border p-4" style={{ borderColor: C.secondary, background: `${C.secondary}06` }} onKeyDown={handleKeyDown}>
            <p className="text-[13.5px] font-bold tracking-wide" style={{ color: C.ink }}>{routeTransportModeLabel(mode)}</p>

            <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input placeholder="Origin City" value={originCity} onChange={(e) => setOriginCity(e.target.value)} className="h-10 rounded-lg border px-3 text-[13px] tracking-wide outline-none" style={{ borderColor: C.hair }} />
                <input placeholder="Origin State" value={originState} onChange={(e) => setOriginState(e.target.value)} className="h-10 rounded-lg border px-3 text-[13px] tracking-wide outline-none" style={{ borderColor: C.hair }} />
                <input placeholder="Destination City" value={destCity} onChange={(e) => setDestCity(e.target.value)} className="h-10 rounded-lg border px-3 text-[13px] tracking-wide outline-none" style={{ borderColor: C.hair }} />
                <input placeholder="Destination State" value={destState} onChange={(e) => setDestState(e.target.value)} className="h-10 rounded-lg border px-3 text-[13px] tracking-wide outline-none" style={{ borderColor: C.hair }} />
            </div>

            {modeFields.length > 0 && (
                <div className="mt-2.5 flex flex-col gap-2.5">
                    {modeFields.map((f) => (
                        <div key={f.key} className="flex flex-col gap-1">
                            <label className="text-[12px] font-bold tracking-wide" style={{ color: C.ink }}>{f.label}{f.required && <span style={{ color: C.primary }}> *</span>}</label>
                            <input value={fields[f.key] || ""} onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                                className="h-10 rounded-lg border px-3 text-[13px] tracking-wide outline-none" style={{ borderColor: C.hair }} />
                        </div>
                    ))}
                </div>
            )}

            {error && <p className="mt-2 text-[12.5px] font-semibold tracking-wide" style={{ color: "#B3261E" }}>{error}</p>}

            <div className="mt-3 flex gap-2">
                <button onClick={onCancel} className="rounded-lg border px-4 py-2 text-[13px] font-bold tracking-wide" style={{ borderColor: C.hair, color: C.ink }}>Cancel</button>
                <button disabled={!canSubmit || submitting} onClick={submit}
                    className="rounded-lg px-4 py-2 text-[13px] font-bold tracking-wide text-white disabled:opacity-50" style={{ background: C.secondary }}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </button>
            </div>
        </div>
    );
}

// Modal shell around the mode picker + quick-add — replaces the old
// always-visible inline panel.
function AddRouteModal({ open, onClose, onAdded, token }) {
    const [activeMode, setActiveMode] = useState(null);

    if (!open) return null;

    const handleAdded = () => {
        setActiveMode(null);
        onAdded();
        onClose();
    };

    return (
        <motion.div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
            <motion.div
                className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[24px] bg-white shadow-2xl sm:rounded-[20px]"
                initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE }} onClick={(e) => e.stopPropagation()}>

                <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: C.hairSoft }}>
                    <p className="text-[15px] font-bold tracking-wide" style={{ color: C.ink }}>Add A Transport Method</p>
                    <button onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.05]">
                        <XIcon className="h-4.5 w-4.5" style={{ color: C.muted }} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                    <div className="flex flex-col gap-3">
                        {ROUTE_TRANSPORT_GROUPS.map((g) => (
                            <div key={g.group}>
                                <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: C.muted }}>{g.group}</p>
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {g.modes.map((m) => (
                                        <button key={m} onClick={() => setActiveMode(activeMode === m ? null : m)}
                                            className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12.5px] font-bold tracking-wide"
                                            style={activeMode === m
                                                ? { borderColor: C.secondary, background: `${C.secondary}14`, color: C.secondary }
                                                : { borderColor: C.hair, color: C.ink }}>
                                            <Plus className="h-3 w-3" style={{ color: activeMode === m ? C.secondary : C.primary }} />
                                            {routeTransportModeLabel(m)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {activeMode && (
                        <ModeQuickAdd mode={activeMode} token={token} onAdded={handleAdded} onCancel={() => setActiveMode(null)} />
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}

function ManageTab() {
    const { token } = useAuth();
    const { markProposalResolved, syncPendingCount } = useTransportLibrary();
    const [options, setOptions] = useState([]);
    const [proposals, setProposals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [addOpen, setAddOpen] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([fetchMyRouteOptions(token), fetchPendingProposals(token)]).then(([optRes, propRes]) => {
            setOptions(optRes?.options?.filter((o) => o.status === "approved") || []);
            const pending = propRes?.proposals || [];
            setProposals(pending);
            // Resync the nav badge to the authoritative count every time
            // this tab loads — self-heals any drift from the optimistic
            // socket increments/decrements in TransportLibraryContext.
            syncPendingCount(pending.length);
            setLoading(false);
        });
    }, [token, syncPendingCount]);

    useEffect(() => { load(); }, [load]);

    // Approve/reject both resolve the proposal, so both clear it from the
    // "needs action" badge immediately — the badge tracks pending action,
    // not approval outcome.
    const handleApprove = async (id) => {
        await approveProposal(id, token);
        markProposalResolved();
        load();
    };
    const handleReject = async (id) => {
        const reason = window.prompt("Reason for declining (shown to the buyer, optional):") || "";
        await rejectProposal(id, reason, token);
        markProposalResolved();
        load();
    };
    const handleDelete = async (id) => { await deleteOwnRouteOption(id, token); load(); };

    const toSentenceCase = (value) => {
        if (!value) return "";
        return String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase();
    };

    if (loading) return <div className="mt-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" style={{ color: C.muted }} /></div>;

    return (
        <div className="mt-4 flex flex-col gap-6">
            {proposals.length > 0 && (
                <div>
                    <p className="text-[12.5px] font-extrabold uppercase tracking-widest" style={{ color: C.muted }}>Pending Proposals ({proposals.length})</p>
                    <div className="mt-2 flex flex-col gap-1.5">
                        {proposals.map((p) => (
                            <div
                                key={p.id}
                                className="flex min-w-0 items-center justify-between gap-2.5 rounded-lg border px-3 py-2.5"
                                style={{ borderColor: C.hair }}
                            >
                                <div className="min-w-0">
                                    <p className={`truncate text-[13px] font-bold ${CAP}`} style={{ color: C.ink }}>{routeOptionSummary(p.mode, p.fields)}</p>
                                    <p className={`mt-0.5 truncate text-[11.5px] font-semibold ${CAP}`} style={{ color: C.muted }}>{toSentenceCase(routeTransportModeLabel(p.mode))} · {toSentenceCase(p.origin_city)} → {toSentenceCase(p.dest_city)}</p>
                                </div>
                                <div className="flex shrink-0 gap-1.5">
                                    <button onClick={() => handleApprove(p.id)} className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: `${C.secondary}14`, color: C.secondary }}><Check className="h-4 w-4" /></button>
                                    <button onClick={() => handleReject(p.id)} className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "#FDECEC", color: "#B3261E" }}><XIcon className="h-4 w-4" /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div>
                <div className="flex items-center justify-between">
                    <p className="text-[12.5px] font-extrabold uppercase tracking-widest" style={{ color: C.muted }}>Your Active Routes</p>
                    <button onClick={() => setAddOpen(true)}
                        className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-bold tracking-wide text-white"
                        style={{ background: C.primary }}>
                        <Plus className="h-3.5 w-3.5" /> Add New
                    </button>
                </div>

                <div className="mt-2 flex flex-col gap-1.5">
                    {options.map((o) => (
                        <div
                            key={o.id}
                            className="flex min-w-0 items-center justify-between gap-2.5 rounded-lg border px-3 py-2.5"
                            style={{ borderColor: C.hair }}
                        >
                            <div className="min-w-0">
                                <p className={`truncate text-[13px] font-bold ${CAP}`} style={{ color: C.ink }}>{routeOptionSummary(o.mode, o.fields)}</p>
                                <p className={`text-[12px] font-semibold ${CAP} `} style={{ color: C.muted }}>{toSentenceCase(routeTransportModeLabel(o.mode))} · {toSentenceCase(o.origin_city)} → {toSentenceCase(o.dest_city)}</p>
                            </div>
                            <button onClick={() => handleDelete(o.id)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.05]">
                                <Trash2 className="h-4 w-4" style={{ color: C.muted }} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <AddRouteModal open={addOpen} onClose={() => setAddOpen(false)} onAdded={load} token={token} />
        </div>
    );
}

export default function TransportLibraryPage() {
    const { profile, token } = useAuth();
    const isApprovedSeller = profile?.seller_status === "approved";
    const [searchParams, setSearchParams] = useSearchParams();
    const [tab, setTab] = useState(searchParams.get("tab") === "manage" && isApprovedSeller ? "manage" : "browse");

    return (
        <div className="mx-auto min-h-screen max-w-3xl px-2.5 pb-10 pt-3 sm:px-4 lg:px-6">
            <div className="mt-3 flex items-center gap-2">
                <Truck className="h-5 w-5" style={{ color: C.secondary }} />
                <h1 className="font-extrabold tracking-wide" style={{ color: C.ink, fontSize: "clamp(21px,1.9vw,27px)" }}>Transport Library</h1>
            </div>
            <p className="mt-1 text-[13px] font-medium tracking-wide" style={{ color: C.muted }}>
                Browse known transport routes, or manage your own.
            </p>

            {isApprovedSeller && (
                <div className="mt-4 grid grid-cols-2 gap-1 rounded-md border p-1 tracking-wide" style={{ borderColor: C.hair, background: "#fafbfb" }}>
                    {["browse", "manage"].map((t) => (
                        <button key={t} onClick={() => { setTab(t); setSearchParams({ tab: t }); }}
                            className="rounded-md px-4 py-1 text-[14px] font-bold capitalize tracking-wide"
                            style={{ background: tab === t ? C.primary : "transparent", color: tab === t ? "#fff" : C.muted }}>
                            {t}
                        </button>
                    ))}
                </div>
            )}

            {tab === "manage" && isApprovedSeller ? <ManageTab /> : <BrowseTab canAdd={isApprovedSeller} token={token} />}
        </div>
    );
}