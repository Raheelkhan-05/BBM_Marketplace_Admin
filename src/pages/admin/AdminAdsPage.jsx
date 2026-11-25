// pages/admin/AdminAdsPage.jsx — route: /admin/ads
// Monetised Home placements: every booking with the REASON behind its price, removal with a message to the seller
// (and a refund choice), manual price overrides (fixed / multiplier / blackout), placement rates & lanes, settings.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, Loader2, RefreshCw, Trash2, X, AlertTriangle, Megaphone, Package } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { money, fmtDateTime, istDateKey } from "../../components/growSeller/ads/adsHelpers.js";
import {
    adminGetPlacements, adminPatchPlacement, adminPatchSettings, adminGetOverrides, adminCreateOverride,
    adminDeleteOverride, adminGetPricing, adminGetBookings, adminRemoveBooking,
} from "../../utils/adminAdsApi.js";

const INK = "#141B22", MUTED = "#5B6672", HAIR = "rgba(20,27,34,0.10)", PRIMARY = "#0B5563", GOOD = "#12794A", BAD = "#B3261E", WARN = "#92600A";
const TABS = [["bookings", "Bookings"], ["pricing", "Pricing & overrides"], ["placements", "Placements"], ["settings", "Settings"]];
const inputCls = "min-h-[40px] w-full rounded-xl border bg-white px-3 text-[14px] outline-none focus:ring-2 focus:ring-[#0B7285]/40";

const istToIso = (dayKey, hour) => new Date(Date.parse(`${dayKey}T00:00:00+05:30`) + Number(hour) * 3600000).toISOString();
const pad = (n) => String(n).padStart(2, "0");
// Postgres returns a tstzrange as text: ["2026-11-26 03:30:00+00","2026-11-26 12:30:00+00"). Make each end a valid ISO string.
const toIso = (x) => { let s = String(x).trim().replace(" ", "T"); if (/[+-]\d{2}$/.test(s)) s += ":00"; return s; };
function parseRange(during) {
    const m = String(during || "").match(/[\[(]"?([^,"]+)"?,"?([^)\]"]+)"?[)\]]/);
    return m ? [toIso(m[1]), toIso(m[2])] : null;
}
const hourLabel = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h % 24 < 12 ? "am" : "pm"}`;

function stateOf(b) {
    if (b.status === "removed") return { key: "removed", label: "Removed", bg: "#FDECEA", fg: BAD };
    const now = Date.now(), s = new Date(b.starts_at).getTime(), e = new Date(b.ends_at).getTime();
    if (now < s) return { key: "scheduled", label: "Scheduled", bg: "#E6F3F5", fg: "#0B7285" };
    if (now < e) return { key: "live", label: "Live now", bg: "#E7F6EE", fg: GOOD };
    return { key: "ended", label: "Ended", bg: "#F1F4F6", fg: MUTED };
}

function Pill({ s }) {
    return <span className="shrink-0 rounded-full px-2.5 py-[3px] text-[11px] font-extrabold" style={{ background: s.bg, color: s.fg }}>{s.label}</span>;
}
function Err({ children }) {
    return children ? <p role="alert" className="mt-2 flex items-start gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold" style={{ background: "#FDECEA", color: BAD }}><AlertTriangle className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" />{children}</p> : null;
}
function Switch({ on, onChange, disabled, label }) {
    return (
        <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
            className="relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50" style={{ background: on ? "#22A06B" : "#D9DEE2" }}>
            <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform" style={{ transform: on ? "translateX(16px)" : "none" }} />
        </button>
    );
}
function Field({ label, hint, children }) {
    return (
        <label className="block">
            <span className="mb-1 block text-[12px] font-bold" style={{ color: MUTED }}>{label}</span>
            {children}
            {hint && <span className="mt-1 block text-[11.5px]" style={{ color: MUTED }}>{hint}</span>}
        </label>
    );
}

/* =============================== bookings =============================== */

function PriceReasoning({ b, placement }) {
    const pb = b.price_breakdown || {};
    const lines = Array.isArray(pb.lines) ? pb.lines : [];
    const gst = Number(pb.gst_percent) || 0;
    return (
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: HAIR, background: "#FBFCFC" }}>
            <p className="text-[12.5px] leading-relaxed" style={{ color: INK }}>
                <b>How this price was set.</b> Each hour costs the placement's base rate{placement?.base_rate_per_hour != null ? ` (${money(placement.base_rate_per_hour)}/h now)` : ""} × a demand multiplier.
                The multiplier rises from the minimum to the maximum with <i>occupancy</i>: 60% how busy the 3 hours either side were, 40% how full that IST day was.
                An admin override (fixed rate, multiplier) replaces the formula for the hours it covers.
            </p>
            <div className="mt-2 max-h-72 overflow-auto rounded-lg border bg-white" style={{ borderColor: HAIR }}>
                <table className="w-full min-w-[560px] text-left text-[12px]">
                    <thead className="sticky top-0 bg-white text-[11px] uppercase" style={{ color: MUTED }}>
                        <tr><th className="px-2 py-1.5">Hour (IST)</th><th>Nearby</th><th>Day</th><th>Occupancy</th><th>Multiplier</th><th>Rate</th><th>Reason</th></tr>
                    </thead>
                    <tbody>
                        {lines.map((l) => (
                            <tr key={l.hour} className="border-t" style={{ borderColor: HAIR }}>
                                <td className="px-2 py-1.5 font-semibold">{fmtDateTime(l.hour)}</td>
                                <td>{l.local_occ != null ? `${Math.round(Number(l.local_occ) * 100)}%` : "–"}</td>
                                <td>{l.day_occ != null ? `${Math.round(Number(l.day_occ) * 100)}%` : "–"}</td>
                                <td>{l.occupancy != null ? `${Math.round(Number(l.occupancy) * 100)}%` : "–"}</td>
                                <td>{l.override_kind === "fixed" ? "fixed" : l.multiplier != null ? `×${Number(l.multiplier).toFixed(2)}` : "–"}</td>
                                <td className="font-bold">{money(l.rate)}</td>
                                <td style={{ color: l.override ? WARN : MUTED }}>{l.override ? `Override: ${l.override}` : "Demand formula"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <dl className="mt-2 grid max-w-xs gap-1 text-[12.5px]">
                <div className="flex justify-between"><dt style={{ color: MUTED }}>Subtotal</dt><dd className="font-bold">{money(b.subtotal)}</dd></div>
                <div className="flex justify-between"><dt style={{ color: MUTED }}>GST ({gst}%)</dt><dd className="font-bold">{money(b.gst_amount)}</dd></div>
                <div className="flex justify-between border-t pt-1" style={{ borderColor: HAIR }}><dt className="font-bold">Charged</dt><dd className="font-extrabold">{money(b.amount)}</dd></div>
            </dl>
        </div>
    );
}

function CreativePreview({ c }) {
    const imgs = Object.entries(c?.images || {});
    if (imgs.length) {
        return (
            <div className="mt-2 flex flex-wrap gap-2">
                {imgs.map(([shape, url]) => (
                    <a key={shape} href={url} target="_blank" rel="noreferrer" className="block">
                        <img src={url} alt={`${shape} creative`} className="h-16 rounded-lg border object-cover" style={{ borderColor: HAIR }} loading="lazy" />
                    </a>
                ))}
            </div>
        );
    }
    return c?.submission_id ? <p className="mt-2 text-[12px]" style={{ color: MUTED }}>Promotes listing <code>{String(c.submission_id).slice(0, 8)}…</code></p> : null;
}

function RemoveModal({ booking, onClose, onDone, token }) {
    const [reason, setReason] = useState("");
    const [mode, setMode] = useState("unserved");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const gst = Number(booking.price_breakdown?.gst_percent) || 0;
    const unserved = useMemo(() => {
        const sum = (booking.price_breakdown?.lines || []).filter((l) => new Date(l.hour).getTime() >= Date.now()).reduce((a, l) => a + (Number(l.rate) || 0), 0);
        return Math.min(Math.round(sum * (1 + gst / 100) * 100) / 100, Number(booking.amount));
    }, [booking, gst]);
    const refund = mode === "full" ? Number(booking.amount) : mode === "unserved" ? unserved : 0;
    const ok = reason.trim().length >= 5;

    const submit = async () => {
        if (!ok || busy) return;
        setBusy(true); setErr(null);
        const res = await adminRemoveBooking(token, booking.id, { reason: reason.trim(), refundMode: mode });
        setBusy(false);
        if (res?.success) onDone(res.result); else setErr(res?.message || "Couldn't remove this ad.");
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Remove ad">
            <div className="max-h-[92dvh] w-full max-w-lg overflow-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-[18px] font-extrabold" style={{ color: INK }}>Remove this ad</h2>
                        <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>{booking.placement?.name} · {booking.seller?.display_name} · {fmtDateTime(booking.starts_at)} to {fmtDateTime(booking.ends_at)}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 hover:bg-slate-100"><X className="h-5 w-5" /></button>
                </div>

                <Field label="Message to the seller (required)" hint="The seller sees this reason in their notification and in My ads. Be specific, e.g. which rule the banner broke.">
                    <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={400} className={`${inputCls} py-2`} style={{ borderColor: HAIR }} placeholder="e.g. The banner claims a price that does not match the listing." />
                </Field>

                <fieldset className="mt-4">
                    <legend className="mb-1.5 text-[12px] font-bold" style={{ color: MUTED }}>Refund</legend>
                    {[
                        ["unserved", "Unserved hours only", `Refund hours that had not started yet, with GST: ${money(unserved)}`],
                        ["full", "Full refund", `Refund everything: ${money(booking.amount)}`],
                        ["none", "No refund", "Seller is not refunded (use when the ad broke the rules)"],
                    ].map(([k, t, d]) => (
                        <label key={k} className="mb-1.5 flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5" style={{ borderColor: mode === k ? PRIMARY : HAIR, background: mode === k ? "#E6F3F5" : "#fff" }}>
                            <input type="radio" name="refund" checked={mode === k} onChange={() => setMode(k)} className="mt-1 accent-[#0B5563]" />
                            <span><b className="block text-[13.5px]">{t}</b><span className="text-[12px]" style={{ color: MUTED }}>{d}</span></span>
                        </label>
                    ))}
                </fieldset>

                <Err>{err}</Err>
                <div className="mt-4 flex gap-2.5">
                    <button type="button" onClick={onClose} className="flex-1 rounded-2xl border px-4 py-3 text-[14px] font-bold" style={{ borderColor: HAIR }}>Cancel</button>
                    <button type="button" disabled={!ok || busy} onClick={submit} className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[14px] font-bold text-white disabled:opacity-45" style={{ background: BAD }}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                        Remove{refund > 0 ? ` & refund ${money(refund)}` : ""}
                    </button>
                </div>
            </div>
        </div>
    );
}

function BookingsTab({ token, placements, flash }) {
    const [f, setF] = useState({ status: "", placementId: "", live: false });
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [more, setMore] = useState(false);
    const [err, setErr] = useState(null);
    const [open, setOpen] = useState(null);
    const [removing, setRemoving] = useState(null);
    const PAGE = 50;
    const byId = useMemo(() => new Map(placements.map((p) => [p.id, p])), [placements]);

    const load = useCallback(async (offset = 0) => {
        offset ? setMore(true) : setLoading(true);
        setErr(null);
        const res = await adminGetBookings(token, { status: f.status, placementId: f.placementId, live: f.live ? "1" : "", limit: PAGE, offset });
        if (res?.aborted) return;
        if (res?.success) { setRows((r) => (offset ? [...r, ...res.bookings] : res.bookings)); setTotal(res.total); }
        else setErr(res?.message || "Couldn't load bookings.");
        setLoading(false); setMore(false);
    }, [token, f]);
    useEffect(() => { load(0); }, [load]);

    return (
        <section>
            <div className="grid gap-2 sm:grid-cols-4">
                <select aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className={inputCls} style={{ borderColor: HAIR }}>
                    <option value="">All statuses</option><option value="active">Active</option><option value="removed">Removed</option>
                </select>
                <select aria-label="Placement" value={f.placementId} onChange={(e) => setF({ ...f, placementId: e.target.value })} className={inputCls} style={{ borderColor: HAIR }}>
                    <option value="">All placements</option>{placements.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <label className="flex min-h-[40px] items-center gap-2 rounded-xl border px-3 text-[14px] font-semibold" style={{ borderColor: HAIR }}>
                    <input type="checkbox" checked={f.live} onChange={(e) => setF({ ...f, live: e.target.checked })} className="accent-[#0B5563]" /> Live now
                </label>
                <button type="button" onClick={() => load(0)} className="flex min-h-[40px] items-center justify-center gap-2 rounded-xl border text-[14px] font-bold" style={{ borderColor: HAIR }}>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
                </button>
            </div>
            <Err>{err}</Err>
            {loading ? <p className="mt-6 text-center text-[13px]" style={{ color: MUTED }}>Loading…</p> : !rows.length ? <p className="mt-6 text-center text-[13px]" style={{ color: MUTED }}>No bookings match.</p> : (
                <ul className="mt-3 grid gap-2.5">
                    {rows.map((b) => {
                        const st = stateOf(b);
                        const isOpen = open === b.id;
                        const canRemove = b.status === "active" && new Date(b.ends_at).getTime() > Date.now();
                        return (
                            <li key={b.id} className="rounded-2xl border bg-white p-3.5" style={{ borderColor: HAIR }}>
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="flex items-center gap-1.5 text-[14.5px] font-extrabold" style={{ color: INK }}>
                                            {b.placement?.kind === "product" ? <Package className="h-4 w-4" aria-hidden="true" /> : <Megaphone className="h-4 w-4" aria-hidden="true" />}
                                            {b.placement?.name} <span className="text-[12px] font-semibold" style={{ color: MUTED }}>· lane {b.lane}</span>
                                        </p>
                                        <p className="mt-0.5 text-[13px]" style={{ color: INK }}>{b.seller?.display_name || "Seller"}</p>
                                        <p className="text-[12.5px]" style={{ color: MUTED }}>{fmtDateTime(b.starts_at)} to {fmtDateTime(b.ends_at)} IST · booked {fmtDateTime(b.created_at)}</p>
                                    </div>
                                    <div className="text-right">
                                        <Pill s={st} />
                                        <p className="mt-1 text-[15px] font-extrabold" style={{ color: INK }}>{money(b.amount)}</p>
                                    </div>
                                </div>
                                <CreativePreview c={b.creative} />
                                {b.status === "removed" && (
                                    <p className="mt-2 rounded-lg px-2.5 py-1.5 text-[12.5px]" style={{ background: "#FDECEA", color: BAD }}>
                                        Removed {b.removed_at ? fmtDateTime(b.removed_at) : ""}: {b.removed_reason}. {Number(b.refund_amount) > 0 ? `${money(b.refund_amount)} refunded.` : "No refund."}
                                    </p>
                                )}
                                <div className="mt-2.5 flex flex-wrap gap-2">
                                    <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : b.id)} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-bold" style={{ borderColor: HAIR }}>
                                        Why this price <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                                    </button>
                                    {canRemove && (
                                        <button type="button" onClick={() => setRemoving(b)} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold" style={{ background: "#FDECEA", color: BAD }}>
                                            <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove with message
                                        </button>
                                    )}
                                </div>
                                {isOpen && <PriceReasoning b={b} placement={byId.get(b.placement?.id)} />}
                            </li>
                        );
                    })}
                </ul>
            )}
            {rows.length < total && (
                <button type="button" disabled={more} onClick={() => load(rows.length)} className="mx-auto mt-4 flex items-center gap-2 rounded-xl border px-4 py-2 text-[13.5px] font-bold" style={{ borderColor: HAIR }}>
                    {more && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Load more ({total - rows.length} left)
                </button>
            )}
            {removing && (
                <RemoveModal booking={removing} token={token} onClose={() => setRemoving(null)}
                    onDone={(r) => { setRemoving(null); flash(`Ad removed. ${Number(r?.refund) > 0 ? `${money(r.refund)} refunded. ` : ""}The seller has been notified.`); load(0); }} />
            )}
        </section>
    );
}

/* =============================== pricing & overrides =============================== */

function PricingTab({ token, placements, flash }) {
    const [pid, setPid] = useState(placements[0]?.id || "");
    const [day, setDay] = useState(istDateKey());
    const [grid, setGrid] = useState({ loading: false, hours: [], error: null });
    const [ovs, setOvs] = useState([]);
    const [form, setForm] = useState({ kind: "fixed", value: "", from: istDateKey(), fromH: 9, to: istDateKey(), toH: 18, reason: "" });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const placement = placements.find((p) => p.id === pid);

    const loadGrid = useCallback(async () => {
        if (!pid) return;
        setGrid((g) => ({ ...g, loading: true, error: null }));
        const res = await adminGetPricing(token, pid, day);
        if (res?.aborted) return;
        setGrid(res?.success ? { loading: false, hours: res.hours || [], error: null } : { loading: false, hours: [], error: res?.message || "Couldn't load prices." });
    }, [token, pid, day]);
    const loadOvs = useCallback(async () => {
        if (!pid) return;
        const res = await adminGetOverrides(token, pid);
        if (res?.success) setOvs(res.overrides || []);
    }, [token, pid]);
    useEffect(() => { loadGrid(); }, [loadGrid]);
    useEffect(() => { loadOvs(); }, [loadOvs]);

    const create = async () => {
        setErr(null);
        const from = istToIso(form.from, form.fromH), to = istToIso(form.to, form.toH);
        if (Date.parse(to) <= Date.parse(from)) return setErr("The end must be after the start.");
        if (form.reason.trim().length < 3) return setErr("Add a reason. Admins and sellers can see it.");
        const body = { placementId: pid, kind: form.kind, from, to, reason: form.reason.trim() };
        if (form.kind === "fixed") body.fixedRate = Number(form.value);
        if (form.kind === "multiplier") body.multiplier = Number(form.value);
        if (form.kind !== "blackout" && (form.value === "" || !(Number(form.value) > 0 || (form.kind === "fixed" && Number(form.value) === 0)))) return setErr("Enter a value.");
        setBusy(true);
        const res = await adminCreateOverride(token, body);
        setBusy(false);
        if (!res?.success) return setErr(res?.message || "Couldn't save the override.");
        flash("Override saved. New quotes use it immediately; existing bookings keep the price they paid.");
        setForm((f) => ({ ...f, value: "", reason: "" }));
        loadGrid(); loadOvs();
    };
    const revoke = async (id) => {
        const res = await adminDeleteOverride(token, id);
        if (res?.success) { flash("Override revoked."); loadGrid(); loadOvs(); } else flash(res?.message || "Couldn't revoke.");
    };

    if (!placements.length) return <p className="text-[13px]" style={{ color: MUTED }}>No placements yet.</p>;
    return (
        <section className="grid gap-4 lg:grid-cols-2">
            <div>
                <div className="grid gap-2 sm:grid-cols-2">
                    <select aria-label="Placement" value={pid} onChange={(e) => setPid(e.target.value)} className={inputCls} style={{ borderColor: HAIR }}>
                        {placements.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input aria-label="Day" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className={inputCls} style={{ borderColor: HAIR }} />
                </div>
                <Err>{grid.error}</Err>
                <div className="mt-3 overflow-auto rounded-2xl border bg-white" style={{ borderColor: HAIR }}>
                    <table className="w-full min-w-[480px] text-left text-[12.5px]">
                        <thead className="text-[11px] uppercase" style={{ color: MUTED }}><tr><th className="px-3 py-2">Hour</th><th>Booked</th><th>Occupancy</th><th>Multiplier</th><th>Rate</th></tr></thead>
                        <tbody>
                            {grid.loading && !grid.hours.length && <tr><td colSpan={5} className="px-3 py-4 text-center" style={{ color: MUTED }}>Loading…</td></tr>}
                            {grid.hours.map((h) => {
                                const t = new Date(h.hour_start);
                                const hr = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(t)) % 24;
                                const occ = Math.round(Number(h.occupancy) * 100);
                                return (
                                    <tr key={h.hour_start} className="border-t" style={{ borderColor: HAIR, background: h.blackout ? "#FDECEA" : h.override_kind ? "#FEF6E7" : undefined }}>
                                        <td className="px-3 py-1.5 font-semibold">{hourLabel(hr)}</td>
                                        <td>{h.booked}/{placement?.lanes}</td>
                                        <td>
                                            <span className="inline-block h-1.5 w-14 overflow-hidden rounded-full bg-slate-100 align-middle"><span className="block h-full" style={{ width: `${occ}%`, background: occ >= 66 ? "#D99A1F" : "#22A06B" }} /></span> <span className="ml-1">{occ}%</span>
                                        </td>
                                        <td>{h.override_kind === "fixed" ? "fixed" : h.override_kind === "blackout" ? "closed" : `×${Number(h.multiplier).toFixed(2)}`}</td>
                                        <td className="font-bold">{h.blackout ? "–" : money(h.rate)}{h.override_reason && <span className="ml-1 text-[11px] font-semibold" style={{ color: WARN }} title={h.override_reason}>override</span>}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <div>
                <div className="rounded-2xl border bg-white p-4" style={{ borderColor: HAIR }}>
                    <h3 className="text-[15px] font-extrabold">Set the price manually</h3>
                    <p className="mt-0.5 text-[12.5px]" style={{ color: MUTED }}>Applies to new bookings for the hours below. Bookings already paid keep their price. Times are IST.</p>
                    <div className="mt-3 grid gap-3">
                        <div role="radiogroup" aria-label="Override type" className="grid grid-cols-3 gap-1.5">
                            {[["fixed", "Fixed ₹/h"], ["multiplier", "Multiplier"], ["blackout", "Close"]].map(([k, l]) => (
                                <button key={k} type="button" role="radio" aria-checked={form.kind === k} onClick={() => setForm({ ...form, kind: k, value: "" })}
                                    className="min-h-[38px] rounded-xl border text-[13px] font-bold" style={{ borderColor: form.kind === k ? PRIMARY : HAIR, background: form.kind === k ? "#E6F3F5" : "#fff" }}>{l}</button>
                            ))}
                        </div>
                        {form.kind !== "blackout" && (
                            <Field label={form.kind === "fixed" ? "Rate per hour (₹, before GST)" : "Multiplier on the base rate"} hint={form.kind === "multiplier" && placement ? `Base is ${money(placement.base_rate_per_hour)}/h. ×1.5 = ${money(placement.base_rate_per_hour * 1.5)}/h.` : undefined}>
                                <input type="number" inputMode="decimal" min="0" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className={inputCls} style={{ borderColor: HAIR }} />
                            </Field>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            <Field label="From"><input type="date" value={form.from} onChange={(e) => e.target.value && setForm({ ...form, from: e.target.value })} className={inputCls} style={{ borderColor: HAIR }} /></Field>
                            <Field label="Hour"><select value={form.fromH} onChange={(e) => setForm({ ...form, fromH: Number(e.target.value) })} className={inputCls} style={{ borderColor: HAIR }}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{pad(h)}:00</option>)}</select></Field>
                            <Field label="Until (exclusive)"><input type="date" value={form.to} onChange={(e) => e.target.value && setForm({ ...form, to: e.target.value })} className={inputCls} style={{ borderColor: HAIR }} /></Field>
                            <Field label="Hour"><select value={form.toH} onChange={(e) => setForm({ ...form, toH: Number(e.target.value) })} className={inputCls} style={{ borderColor: HAIR }}>{Array.from({ length: 25 }, (_, h) => <option key={h} value={h}>{pad(h)}:00</option>)}</select></Field>
                        </div>
                        <Field label="Reason (shown to admins)"><input value={form.reason} maxLength={200} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputCls} style={{ borderColor: HAIR }} placeholder="e.g. Festival week, premium pricing" /></Field>
                        <Err>{err}</Err>
                        <button type="button" disabled={busy} onClick={create} className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl text-[14px] font-bold text-white disabled:opacity-50" style={{ background: PRIMARY }}>
                            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{form.kind === "blackout" ? "Close these hours" : "Save override"}
                        </button>
                        {form.kind === "blackout" && <p className="text-[12px]" style={{ color: MUTED }}>Closing hours blocks new bookings only. To take down an ad that is already booked, remove it from the Bookings tab.</p>}
                    </div>
                </div>

                <div className="mt-3 rounded-2xl border bg-white p-4" style={{ borderColor: HAIR }}>
                    <h3 className="text-[15px] font-extrabold">Active overrides</h3>
                    {!ovs.length ? <p className="mt-1 text-[13px]" style={{ color: MUTED }}>None for this placement.</p> : (
                        <ul className="mt-2 grid gap-2">
                            {ovs.map((o) => {
                                const m = parseRange(o.during);
                                return (
                                    <li key={o.id} className="flex items-start justify-between gap-2 rounded-xl border p-2.5 text-[12.5px]" style={{ borderColor: HAIR }}>
                                        <span>
                                            <b>{o.kind === "fixed" ? `${money(o.fixed_rate)}/h` : o.kind === "multiplier" ? `×${Number(o.multiplier)}` : "Closed"}</b>
                                            {m && <span className="block" style={{ color: MUTED }}>{fmtDateTime(m[0])} to {fmtDateTime(m[1])}</span>}
                                            <span className="block" style={{ color: MUTED }}>{o.reason}</span>
                                        </span>
                                        <button type="button" onClick={() => revoke(o.id)} className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-bold" style={{ background: "#FDECEA", color: BAD }}>Revoke</button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </section>
    );
}

/* =============================== placements =============================== */

function PlacementCard({ p, token, flash, onSaved }) {
    const init = () => ({
        name: p.name, description: p.description || "", baseRatePerHour: String(p.base_rate_per_hour), lanes: String(p.lanes),
        minMultiplier: String(p.min_multiplier), maxMultiplier: String(p.max_multiplier), minHours: String(p.min_hours),
        maxHours: String(p.max_hours), maxDaysAhead: String(p.max_days_ahead),
    });
    const [v, setV] = useState(init);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    useEffect(() => { setV(init()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [p]);

    const dirty = JSON.stringify(v) !== JSON.stringify(init());
    const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
    const num = (k, label, step = "1") => (
        <Field label={label}><input type="number" inputMode="decimal" step={step} min="0" value={v[k]} onChange={set(k)} className={inputCls} style={{ borderColor: HAIR }} /></Field>
    );

    const save = async () => {
        setBusy(true); setErr(null);
        const body = { name: v.name, description: v.description };
        for (const k of ["baseRatePerHour", "lanes", "minMultiplier", "maxMultiplier", "minHours", "maxHours", "maxDaysAhead"]) body[k] = Number(v[k]);
        const res = await adminPatchPlacement(token, p.id, body);
        setBusy(false);
        if (res?.success) { flash(`${v.name} saved.`); onSaved(res.placement); } else setErr(res?.message || "Couldn't save.");
    };
    const toggle = async (on) => {
        const res = await adminPatchPlacement(token, p.id, { isActive: on });
        if (res?.success) { flash(on ? "Placement is open for booking." : "Placement is closed for new bookings."); onSaved(res.placement); } else flash(res?.message || "Couldn't update.");
    };

    return (
        <article className="rounded-2xl border bg-white p-4" style={{ borderColor: HAIR }}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: "#0B7285" }}>{p.kind} · {p.key}</p>
                    <p className="text-[12.5px]" style={{ color: MUTED }}>Seller pays {money(p.base_rate_per_hour * p.min_multiplier)} to {money(p.base_rate_per_hour * p.max_multiplier)} per hour, before GST.</p>
                </div>
                <div className="flex items-center gap-2 text-[12.5px] font-bold"><span>{p.is_active ? "Open" : "Closed"}</span><Switch on={p.is_active} onChange={toggle} label={`Open ${p.name} for booking`} /></div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="col-span-2"><Field label="Name"><input value={v.name} onChange={set("name")} maxLength={80} className={inputCls} style={{ borderColor: HAIR }} /></Field></div>
                {num("baseRatePerHour", "Base rate ₹/hour", "0.01")}
                {num("lanes", "Lanes (advertisers at once)")}
                {num("minMultiplier", "Min multiplier", "0.05")}
                {num("maxMultiplier", "Max multiplier", "0.05")}
                {num("minHours", "Min hours")}
                {num("maxHours", "Max hours")}
                {num("maxDaysAhead", "Bookable days ahead")}
                <div className="col-span-2 sm:col-span-4"><Field label="Description (sellers see this)"><input value={v.description} onChange={set("description")} maxLength={400} className={inputCls} style={{ borderColor: HAIR }} /></Field></div>
            </div>
            <Err>{err}</Err>
            <div className="mt-3 flex justify-end">
                <button type="button" disabled={!dirty || busy} onClick={save} className="flex min-h-[40px] items-center gap-2 rounded-xl px-5 text-[13.5px] font-bold text-white disabled:opacity-40" style={{ background: PRIMARY }}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Save changes
                </button>
            </div>
        </article>
    );
}

function PlacementsTab({ placements, token, flash, onSaved }) {
    return (
        <section className="grid gap-3">
            <p className="text-[12.5px]" style={{ color: MUTED }}>Rates here are the starting point. Lowering lanes is blocked while an active or upcoming booking uses the lanes you remove.</p>
            {placements.map((p) => <PlacementCard key={p.id} p={p} token={token} flash={flash} onSaved={onSaved} />)}
        </section>
    );
}

/* =============================== settings =============================== */

function SettingsTab({ settings, token, flash, onSaved }) {
    const [v, setV] = useState({ gstPercent: String(settings.gst_percent), minWalletReserve: String(settings.min_wallet_reserve), demandExponent: String(settings.demand_exponent) });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const dirty = Number(v.gstPercent) !== Number(settings.gst_percent) || Number(v.minWalletReserve) !== Number(settings.min_wallet_reserve) || Number(v.demandExponent) !== Number(settings.demand_exponent);
    const save = async () => {
        setBusy(true); setErr(null);
        const res = await adminPatchSettings(token, { gstPercent: Number(v.gstPercent), minWalletReserve: Number(v.minWalletReserve), demandExponent: Number(v.demandExponent) });
        setBusy(false);
        if (res?.success) { flash("Settings saved."); onSaved(res.settings); } else setErr(res?.message || "Couldn't save.");
    };
    return (
        <section className="max-w-xl rounded-2xl border bg-white p-4" style={{ borderColor: HAIR }}>
            <div className="grid gap-3">
                <Field label="GST on ads (%)" hint="Added on top of the ad price. Shown to sellers before they pay."><input type="number" step="0.01" min="0" max="40" value={v.gstPercent} onChange={(e) => setV({ ...v, gstPercent: e.target.value })} className={inputCls} style={{ borderColor: HAIR }} /></Field>
                <Field label="Minimum credits kept in the wallet (₹)" hint="An ad can never push a seller below this, so their listings stay visible on Home (the feed hides sellers under ₹1)."><input type="number" step="0.01" min="0" value={v.minWalletReserve} onChange={(e) => setV({ ...v, minWalletReserve: e.target.value })} className={inputCls} style={{ borderColor: HAIR }} /></Field>
                <Field label="Demand curve exponent" hint="Higher = prices stay low until a slot is nearly full, then climb steeply. 1 = straight line. Default 1.5."><input type="number" step="0.1" min="0.1" max="5" value={v.demandExponent} onChange={(e) => setV({ ...v, demandExponent: e.target.value })} className={inputCls} style={{ borderColor: HAIR }} /></Field>
            </div>
            <Err>{err}</Err>
            <button type="button" disabled={!dirty || busy} onClick={save} className="mt-4 flex min-h-[42px] items-center gap-2 rounded-xl px-5 text-[14px] font-bold text-white disabled:opacity-40" style={{ background: PRIMARY }}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Save settings
            </button>
        </section>
    );
}

/* =============================== page =============================== */

export default function AdminAdsPage() {
    const nav = useNavigate();
    const { token } = useAuth();
    const [tab, setTab] = useState("bookings");
    const [data, setData] = useState({ loading: true, placements: [], settings: null, error: null });
    const [toast, setToast] = useState("");

    const flash = useCallback((m) => { setToast(m); setTimeout(() => setToast(""), 4200); }, []);
    const load = useCallback(async () => {
        const res = await adminGetPlacements(token);
        if (res?.aborted) return;
        setData(res?.success ? { loading: false, placements: res.placements || [], settings: res.settings, error: null } : { loading: false, placements: [], settings: null, error: res?.message || "Couldn't load." });
    }, [token]);
    useEffect(() => { if (token) load(); }, [token, load]);

    const patchPlacement = (np) => setData((d) => ({ ...d, placements: d.placements.map((p) => (p.id === np.id ? { ...p, ...np } : p)) }));

    return (
        <div className="mx-auto w-full max-w-6xl px-3 pb-24 pt-4 sm:px-5" style={{ color: INK }}>
            <div className="mb-4 flex items-center gap-3">
                <button type="button" onClick={() => nav(-1)} aria-label="Back" className="rounded-xl border p-2" style={{ borderColor: HAIR }}><ArrowLeft className="h-5 w-5" /></button>
                <div>
                    <h1 className="text-[22px] font-extrabold leading-tight tracking-tight">Home ads</h1>
                    <p className="text-[13px]" style={{ color: MUTED }}>Paid placements: bookings, the reasoning behind each price, takedowns and manual pricing.</p>
                </div>
            </div>

            <div role="tablist" aria-label="Ads sections" className="mb-4 flex gap-1 overflow-x-auto rounded-2xl p-1" style={{ background: "#F5F8F9" }}>
                {TABS.map(([k, l]) => (
                    <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                        className="min-h-[40px] shrink-0 rounded-xl px-4 text-[13.5px] font-bold" style={{ background: tab === k ? "#fff" : "transparent", color: tab === k ? PRIMARY : MUTED, boxShadow: tab === k ? "0 1px 4px rgba(20,27,34,.12)" : "none" }}>{l}</button>
                ))}
            </div>

            {data.loading ? <p className="py-10 text-center text-[13px]" style={{ color: MUTED }}>Loading…</p>
                : data.error ? <><Err>{data.error}</Err><button type="button" onClick={load} className="mt-3 rounded-xl border px-4 py-2 text-[13.5px] font-bold" style={{ borderColor: HAIR }}>Try again</button></>
                    : (
                        <>
                            {tab === "bookings" && <BookingsTab token={token} placements={data.placements} flash={flash} />}
                            {tab === "pricing" && <PricingTab token={token} placements={data.placements} flash={flash} />}
                            {tab === "placements" && <PlacementsTab token={token} placements={data.placements} flash={flash} onSaved={patchPlacement} />}
                            {tab === "settings" && data.settings && <SettingsTab token={token} settings={data.settings} flash={flash} onSaved={(s) => setData((d) => ({ ...d, settings: s }))} />}
                        </>
                    )}

            <div role="status" aria-live="polite" className={`fixed inset-x-0 bottom-5 z-50 mx-auto w-fit max-w-[92vw] rounded-2xl px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-lg transition-all ${toast ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`} style={{ background: INK }}>{toast}</div>
        </div>
    );
}