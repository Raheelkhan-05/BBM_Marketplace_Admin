// src/pages/GrowTransportPage.jsx — Transport Library in the GROW UI (route: /grow/transport).
// Same API calls and behaviour as TransportLibraryPage: browse, manage own routes, approve / reject buyer proposals.
// Proposals can also be approved / declined straight from the Console notification (BottomNavStrip). Both places
// share NotificationActionsContext, so a decision made in either one removes it from the other at once.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Truck, Search, Plus, Check, X, Trash2, Loader2, ArrowRight, Inbox } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTransportLibrary } from "../context/TransportLibraryContext.jsx";
import { useNotificationActions } from "../context/NotificationActionsContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import { useGrowSeller } from "../context/GrowSellerContext.js";
import {
    browseTransportLibrary, fetchMyRouteOptions, fetchPendingProposals,
    createOwnRouteOption, deleteOwnRouteOption, approveProposal, rejectProposal,
} from "../utils/api.transport.js";
import {
    ROUTE_TRANSPORT_GROUPS, getRouteTransportFields, routeTransportModeLabel,
    routeOptionSummary, routeOptionIdentity,
} from "../../shared/routeTransportFields.js";
import { toTitleCase } from "../components/growSeller/sellerHelpers.js";
import "../components/growSeller/grow-modules.css";

const EASE = [0.16, 1, 0.3, 1];

const normPart = (v) => String(v || "").trim().replace(/\s+/g, " ").toLowerCase();
const normKey = (oc, dc, mode, identity) => `${normPart(oc)}::${normPart(dc)}::${normPart(mode)}::${normPart(identity)}`;
const keyOf = (o) => normKey(o.origin_city, o.dest_city, o.mode, routeOptionIdentity(o.mode, o.fields));

const clean = (v) => (typeof v === "string" ? v.trim() : "");
const filled = (v) => String(v || "").trim().length > 0;
const fmtPlace = (v) => { const s = clean(v); return s ? toTitleCase(s) : ""; };

// Where this seller ships FROM, used to prefill the add-route form.
// Source: profile.sellerLocation (seller_profiles row, delivered by /auth/me).
//  1. Dispatches from a different place (dispatch_same_as_registered === false)
//     -> dispatch_district + dispatch_state (district stands in for city —
//     there is no dispatch_city column).
//  2. Otherwise the registered seller city + state.
//  3. If the seller profile has neither yet, fall back to the GST business
//     profile's district + state.
function getSellerOrigin(profile) {
    const loc = profile?.sellerLocation;
    if (loc) {
        const dCity = fmtPlace(loc.dispatch_district);
        const dState = fmtPlace(loc.dispatch_state);
        if (loc.dispatch_same_as_registered === false && dCity && dState) {
            return { city: dCity, state: dState };
        }
        const city = fmtPlace(loc.city);
        const state = fmtPlace(loc.state);
        if (city || state) return { city, state };
    }
    const biz = profile?.businessProfile;
    return { city: fmtPlace(biz?.district), state: fmtPlace(biz?.state) };
}

// ---------- shared route card ----------
function RouteCard({ opt, children, className = "" }) {
    return (
        <div className={`gt-card ${className}`}>
            <span className="gk-ico" style={{ "--a": "var(--k-tt)" }}><Truck /></span>
            <div className="gt-main">
                <b>{routeOptionSummary(opt.mode, opt.fields)}</b>
                <small>
                    <span>{routeTransportModeLabel(opt.mode)}</span>·
                    <span>{toTitleCase(opt.origin_city)}</span><ArrowRight size={12} /><span>{toTitleCase(opt.dest_city)}</span>
                </small>
            </div>
            {children}
        </div>
    );
}

// ---------- Browse ----------
function BrowseTab({ canAdd, token }) {
    const { say } = useGrowSeller();
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

    const deduped = useMemo(() => {
        const seen = new Set();
        const out = [];
        for (const opt of options) {
            const k = keyOf(opt);
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(opt);
        }
        return out;
    }, [options]);

    const mine = useMemo(() => new Set(myOptions.map(keyOf)), [myOptions]);

    const add = async (opt) => {
        const k = keyOf(opt);
        setBusyKey(k);
        const res = await createOwnRouteOption({
            originState: opt.origin_state, originCity: opt.origin_city,
            destState: opt.dest_state, destCity: opt.dest_city,
            mode: opt.mode, fields: opt.fields,
        }, token);
        setBusyKey(null);
        if (!res?.success) { say(res?.message || "Couldn't add that route."); return; }
        say("Route added to your list.");
        loadMine();
    };

    const remove = async (opt) => {
        const k = keyOf(opt);
        const match = myOptions.find((o) => keyOf(o) === k);
        if (!match) return;
        setBusyKey(k);
        const res = await deleteOwnRouteOption(match.id, token);
        setBusyKey(null);
        if (!res?.success) { say(res?.message || "Couldn't remove that route."); return; }
        say("Route removed.");
        loadMine();
    };

    const onKey = (e) => { if (e.key === "Enter") search(); };

    return (
        <div className="gt-sec">
            <div className="gt-search">
                <div className="gk-field"><label htmlFor="gt-from">From city</label>
                    <input id="gt-from" className="gk-inp" placeholder="e.g. Rajkot" value={originCity} onKeyDown={onKey} onChange={(e) => setOriginCity(e.target.value)} /></div>
                <div className="gk-field"><label htmlFor="gt-to">To city</label>
                    <input id="gt-to" className="gk-inp" placeholder="e.g. Surat" value={destCity} onKeyDown={onKey} onChange={(e) => setDestCity(e.target.value)} /></div>
                <button type="button" className="gk-btn go" style={{ height: 48 }} onClick={search}><Search size={17} />Search</button>
            </div>

            <div className="gt-list" style={{ marginTop: 16 }} aria-busy={loading}>
                {loading ? [0, 1, 2, 3].map((i) => <div key={i} className="gk-skel" style={{ height: 70 }} />)
                    : deduped.length === 0 ? (
                        <div className="gk-empty" style={{ gridColumn: "1 / -1" }}><Truck size={26} /><b>No transport options found</b>Try a different city, or check back later.</div>
                    ) : deduped.map((opt) => {
                        const k = keyOf(opt);
                        const isMine = canAdd && mine.has(k);
                        const busy = busyKey === k;
                        return (
                            <RouteCard key={k} opt={opt}>
                                {canAdd && (isMine
                                    ? <button type="button" className="gk-btn sm danger" disabled={busy} onClick={() => remove(opt)}>{busy ? <Loader2 size={15} className="gk-spin" /> : <Trash2 size={15} />}Remove</button>
                                    : <button type="button" className="gk-btn sm" disabled={busy} onClick={() => add(opt)}>{busy ? <Loader2 size={15} className="gk-spin" /> : <Plus size={15} />}Use</button>)}
                            </RouteCard>
                        );
                    })}
            </div>
        </div>
    );
}

// ---------- Add route (sheet) ----------
function ModeQuickAdd({ mode, origin, onAdded, onCancel, token }) {
    // Origin is prefilled from the seller's profile; still editable.
    const [originState, setOriginState] = useState(origin?.state || "");
    const [originCity, setOriginCity] = useState(origin?.city || "");
    const [destState, setDestState] = useState("");
    const [destCity, setDestCity] = useState("");
    const [fields, setFields] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    // Every field in the schema is rendered — including the identity ones
    // (transport_company / train_number / airline_name). The backend requires
    // them, so the form must ask for them; validation below uses the same list.
    const modeFields = getRouteTransportFields(mode);
    const canSubmit =
        filled(originState) && filled(originCity) && filled(destState) && filled(destCity) &&
        modeFields.filter((f) => f.required).every((f) => filled(fields[f.key]));

    const setField = (key, value) => setFields((p) => ({ ...p, [key]: value }));

    const submit = async () => {
        if (!canSubmit || submitting) return;
        setSubmitting(true);
        setError(null);
        const res = await createOwnRouteOption({ originState, originCity, destState, destCity, mode, fields }, token);
        setSubmitting(false);
        if (!res?.success) { setError(res?.message || "Couldn't add that route."); return; }
        onAdded();
    };

    return (
        <div className="gt-form" onKeyDown={(e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") submit(); }}>
            <h3>{routeTransportModeLabel(mode)}</h3>
            <div className="gt-2">
                <div className="gk-field"><label>Origin city *</label><input className="gk-inp" value={originCity} onChange={(e) => setOriginCity(e.target.value)} placeholder="City" /></div>
                <div className="gk-field"><label>Origin state *</label><input className="gk-inp" value={originState} onChange={(e) => setOriginState(e.target.value)} placeholder="State" /></div>
                <div className="gk-field"><label>Destination city *</label><input className="gk-inp" value={destCity} onChange={(e) => setDestCity(e.target.value)} placeholder="City" /></div>
                <div className="gk-field"><label>Destination state *</label><input className="gk-inp" value={destState} onChange={(e) => setDestState(e.target.value)} placeholder="State" /></div>
            </div>
            {modeFields.map((f) => (
                <div className="gk-field" key={f.key}>
                    <label>{f.label}{f.required && " *"}</label>
                    {f.type === "textarea" ? (
                        <textarea className="gk-inp" rows={3} value={fields[f.key] || ""} onChange={(e) => setField(f.key, e.target.value)} />
                    ) : (
                        <input className="gk-inp" value={fields[f.key] || ""} onChange={(e) => setField(f.key, e.target.value)} />
                    )}
                </div>
            ))}
            {error && <p className="gt-err" role="alert">{error}</p>}
            <div className="row">
                <button type="button" className="gk-btn" onClick={onCancel}>Cancel</button>
                <button type="button" className="gk-btn go" disabled={!canSubmit || submitting} onClick={submit}>{submitting ? <Loader2 size={16} className="gk-spin" /> : "Save route"}</button>
            </div>
        </div>
    );
}

function AddRouteSheet({ onClose, onAdded, token, origin }) {
    const [activeMode, setActiveMode] = useState(null);

    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
    }, [onClose]);

    return (
        <motion.div className="gk gk-shade" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose}>
            <motion.div className="gk-sheet" role="dialog" aria-modal="true" aria-label="Add a transport method"
                initial={{ y: 32, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 32, opacity: 0 }} transition={{ duration: 0.26, ease: EASE }}
                onClick={(e) => e.stopPropagation()}>
                <div className="gk-sheet-h">
                    <h2>Add a transport method</h2>
                    <button type="button" className="gk-icbtn" aria-label="Close" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="gk-sheet-b">
                    {ROUTE_TRANSPORT_GROUPS.map((g) => (
                        <div className="gt-group" key={g.group}>
                            <h3>{g.group}</h3>
                            <div className="gt-modes">
                                {g.modes.map((m) => (
                                    <button key={m} type="button" className="gt-mode" aria-pressed={activeMode === m} onClick={() => setActiveMode(activeMode === m ? null : m)}>
                                        <Plus size={14} />{routeTransportModeLabel(m)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                    {activeMode && <ModeQuickAdd key={activeMode} mode={activeMode} origin={origin} token={token} onAdded={onAdded} onCancel={() => setActiveMode(null)} />}
                </div>
            </motion.div>
        </motion.div>
    );
}

// ---------- Manage ----------
function ManageTab() {
    const { token, profile } = useAuth();
    const { socket } = useSocket();
    const { say } = useGrowSeller();
    const { markProposalResolved, syncPendingCount } = useTransportLibrary();
    // markProposalHandled: tells the Console this proposal was decided here (its buttons disappear there).
    // transportVersion: bumps when a proposal is decided from the Console, so this list refreshes at once.
    const { markProposalHandled, transportVersion } = useNotificationActions();
    const [options, setOptions] = useState([]);
    const [proposals, setProposals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [addOpen, setAddOpen] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [q, setQ] = useState("");

    const origin = useMemo(() => getSellerOrigin(profile), [profile]);

    const load = useCallback((opts = {}) => {
        const { silent = false } = opts;
        if (!silent) setLoading(true);
        return Promise.all([fetchMyRouteOptions(token), fetchPendingProposals(token)]).then(([optRes, propRes]) => {
            setOptions(optRes?.options?.filter((o) => o.status === "approved") || []);
            const pending = propRes?.proposals || [];
            setProposals(pending);
            syncPendingCount(pending.length);
            if (!silent) setLoading(false);
        });
    }, [token, syncPendingCount]);

    useEffect(() => { load(); }, [load]);

    // Live refresh when a proposal notification arrives (no spinner, rows update in place).
    useEffect(() => {
        if (!socket) return undefined;
        const onNotif = (payload) => {
            if (["transport_proposal_received", "transport_proposal_approved", "transport_proposal_rejected"].includes(payload?.type)) load({ silent: true });
        };
        socket.on("notification:new", onNotif);
        return () => socket.off("notification:new", onNotif);
    }, [socket, load]);

    // A proposal was approved / declined from the Console: refresh quietly (not on first render).
    const seenVersion = useRef(transportVersion);
    useEffect(() => {
        if (transportVersion === seenVersion.current) return;
        seenVersion.current = transportVersion;
        load({ silent: true });
    }, [transportVersion, load]);

    const handleApprove = async (id) => {
        setBusyId(id);
        const res = await approveProposal(id, token);
        setBusyId(null);
        if (res?.success === false) { say(res.message || "Couldn't approve this proposal."); return; }
        markProposalResolved();
        markProposalHandled(id, "approved");
        say("Proposal approved.");
        load({ silent: true });
    };
    const handleReject = async (id) => {
        const reason = window.prompt("Reason for declining (shown to the buyer, optional):");
        if (reason === null) return;
        setBusyId(id);
        const res = await rejectProposal(id, reason || "", token);
        setBusyId(null);
        if (res?.success === false) { say(res.message || "Couldn't decline this proposal."); return; }
        markProposalResolved();
        markProposalHandled(id, "declined");
        say("Proposal declined.");
        load({ silent: true });
    };
    const handleDelete = async (id) => {
        if (!window.confirm("Remove this route? Buyers will no longer be able to pick it.")) return;
        setBusyId(id);
        const res = await deleteOwnRouteOption(id, token);
        setBusyId(null);
        if (res?.success === false) { say(res.message || "Couldn't remove this route."); return; }
        say("Route removed.");
        load({ silent: true });
    };

    const needle = q.trim().toLowerCase();
    const shown = options.filter((o) => !needle || `${routeOptionSummary(o.mode, o.fields)} ${routeTransportModeLabel(o.mode)} ${o.origin_city} ${o.dest_city}`.toLowerCase().includes(needle));
    const modesCovered = new Set(options.map((o) => o.mode)).size;

    if (loading) {
        return (
            <div className="gt-sec" aria-busy="true">
                <div className="gt-stats">{[0, 1, 2].map((i) => <div key={i} className="gk-skel" style={{ height: 68 }} />)}</div>
                <div className="gt-list" style={{ marginTop: 24 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="gk-skel" style={{ height: 70 }} />)}</div>
            </div>
        );
    }

    return (
        <>
            <div className="gt-stats gk-rise" style={{ "--i": 0 }}>
                <div className="gt-stat"><b>{options.length}</b><small>Active routes</small></div>
                <div className="gt-stat"><b>{modesCovered}</b><small>Modes covered</small></div>
                <div className="gt-stat"><b>{proposals.length}</b><small>Pending proposals</small></div>
            </div>

            {proposals.length > 0 && (
                <section className="gt-sec gk-rise" style={{ "--i": 1 }}>
                    <div className="gt-sech"><h2>Pending proposals<span className="gt-count">{proposals.length}</span></h2></div>
                    <div className="gt-list">
                        {proposals.map((p) => (
                            <RouteCard key={p.id} opt={p} className="pend">
                                {p.proposal_note && <p className="gt-note">“{p.proposal_note}”</p>}
                                <div className="gt-pend-acts">
                                    <button type="button" className="gk-btn sm gr" disabled={busyId === p.id} onClick={() => handleApprove(p.id)}><Check size={15} />Approve</button>
                                    <button type="button" className="gk-btn sm danger" disabled={busyId === p.id} onClick={() => handleReject(p.id)}><X size={15} />Decline</button>
                                </div>
                            </RouteCard>
                        ))}
                    </div>
                </section>
            )}

            <section className="gt-sec gk-rise" style={{ "--i": 2 }}>
                <div className="gt-sech">
                    <h2>Your active routes</h2>
                    <button type="button" className="gk-btn sm go" onClick={() => setAddOpen(true)}><Plus size={16} />Add route</button>
                </div>
                {options.length > 4 && (
                    <label className="gk-search" style={{ marginBottom: 12 }}>
                        <Search size={17} />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your routes" aria-label="Search your routes" />
                    </label>
                )}
                {options.length === 0 ? (
                    <div className="gk-empty"><Inbox size={26} /><b>No routes yet</b>Add the transport options you use, so buyers can choose them while ordering.
                        <button type="button" className="gk-btn go" onClick={() => setAddOpen(true)}><Plus size={16} />Add your first route</button></div>
                ) : shown.length === 0 ? (
                    <div className="gk-empty" style={{ padding: 28 }}>No routes match your search.</div>
                ) : (
                    <div className="gt-list wide">
                        {shown.map((o) => (
                            <RouteCard key={o.id} opt={o}>
                                <button type="button" className="gk-icbtn" aria-label="Remove route" disabled={busyId === o.id} onClick={() => handleDelete(o.id)}>
                                    {busyId === o.id ? <Loader2 size={16} className="gk-spin" /> : <Trash2 size={16} />}
                                </button>
                            </RouteCard>
                        ))}
                    </div>
                )}
            </section>

            <AnimatePresence>
                {addOpen && (
                    <AddRouteSheet token={token} origin={origin} onClose={() => setAddOpen(false)}
                        onAdded={() => { setAddOpen(false); say("Route added."); load({ silent: true }); }} />
                )}
            </AnimatePresence>
        </>
    );
}

export default function GrowTransportPage() {
    const { profile, token } = useAuth();
    const [params, setParams] = useSearchParams();
    const isApproved = profile?.seller_status === "approved";
    const tab = isApproved && params.get("tab") !== "browse" ? "manage" : "browse";
    const setTab = (t) => setParams(t === "browse" ? { tab: "browse" } : {}, { replace: true });

    return (
        <div className="gk gt">
            <div className="gk-ph gk-rise" style={{ "--i": 0 }}>
                <div>
                    <h1>Transport</h1>
                    <p>Routes and transporters your buyers can choose when ordering.</p>
                </div>
            </div>

            {isApproved && (
                <div className="gt-top gk-rise" style={{ "--i": 1 }}>
                    <div className="gk-seg" role="group" aria-label="Transport views">
                        <button type="button" aria-pressed={tab === "manage"} onClick={() => setTab("manage")}>Manage</button>
                        <button type="button" aria-pressed={tab === "browse"} onClick={() => setTab("browse")}>Browse</button>
                    </div>
                </div>
            )}

            {!profile ? (
                <div className="gt-list" style={{ marginTop: 24 }} aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="gk-skel" style={{ height: 70 }} />)}</div>
            ) : tab === "manage" ? <ManageTab /> : <BrowseTab canAdd={isApproved} token={token} />}
        </div>
    );
}