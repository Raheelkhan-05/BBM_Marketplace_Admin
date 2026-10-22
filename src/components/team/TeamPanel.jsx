// components/team/TeamPanel.jsx — the "Team" tab inside the Console sheet.
// Same visual language as NotificationTimeline: header (title + count + segmented control),
// one scroll area, compact rows. Activity is a date-grouped timeline (rail + dot + time).
// Admin: invite by phone/email, manage invites, roles and members, read the activity log.
// Member: sees the team; if the company has been set up as a seller, a banner says so.
import { useCallback, useEffect, useMemo, memo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    UserPlus, RotateCw, X, Loader2, ChevronRight, ShieldCheck, Mail, Phone, Clock,
    Copy, Check, Users, ClipboardList,
} from "lucide-react";
import {
    fetchTeam, createTeamInvite, resendTeamInvite, revokeTeamInvite, setTeamMemberRole, removeTeamMember, fetchTeamActivity,
} from "../../utils/teamApi.js";
import { useSocket } from "../../context/SocketContext.jsx";
import { formatTime, dateKeyOf, dateLabelOf } from "../../utils/notificationDisplay.js";

const C = {
    ink: "#141B22", muted: "#5B6672", secondary: "#0B7285", hair: "rgba(20,27,34,0.09)",
    tile: "rgba(20,27,34,0.06)", rail: "rgba(20,27,34,0.14)", red: "#d2462b",
};

const CAT_COLOR = {
    orders: "#114072", catalog: "#22A06B", shop: "#0B7285", pricing: "#8A6500",
    credit: "#7A3EB1", chat: "#5B6672", team: "#d2462b", general: "#5B6672",
    sales: "#B45309",
};
const CAT_LABEL = {
    orders: "Orders", catalog: "Catalog", shop: "Shop", pricing: "Pricing",
    credit: "Credit", chat: "Chat", team: "Team", general: "General",
    sales: "Sales",
};

const ROLE_PHRASE = { admin: "an admin", member: "a member", salesperson: "a salesperson" };
const roleLabel = (m) => (m.isOwner ? "Owner" : m.role === "admin" ? "Admin" : m.role === "salesperson" ? "Salesperson" : "Member");


const MAX_KEEP = 300; // rows kept in memory; older ones come back via "Show older activity"

// Timeline geometry: identical to NotificationTimeline so both tabs line up.
const TIME_W = 44, RAIL_W = 12, GAP = 8, DOT = 10, DOT_Y = 17;
const GRID = `${TIME_W}px ${RAIL_W}px minmax(0,1fr)`;

const SCROLL_CLS = "min-h-[min(380px,50dvh)] flex-1 overflow-y-auto px-3 pb-[var(--sheet-pb,24px)] md:min-h-0 md:px-5 md:pb-6";
const HEAD_CLS = "shrink-0 px-5 pb-2 pt-3 md:px-7 md:pb-3 md:pt-4";

function expiresIn(iso) {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return "Expired";
    const h = Math.floor(ms / 3600000);
    return h >= 1 ? `Expires in ${h}h` : `Expires in ${Math.max(1, Math.round(ms / 60000))}m`;
}
const initial = (m) => (m.name || m.email || m.phone || "?").trim()[0]?.toUpperCase();
const firstName = (m) => (m.name || "this person").trim().split(/\s+/)[0];

async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
    try {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
    } catch { return false; }
}

// Only in-app paths are allowed from the server.
const safeLink = (l) => (typeof l === "string" && l.startsWith("/") && !l.startsWith("//") ? l : null);

/* ------------------------------- small pieces ------------------------------- */

function Avatar({ m }) {
    return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-white" style={{ background: C.secondary }}>
            {initial(m)}
        </span>
    );
}

const Pill = ({ children, tone = "muted" }) => (
    <span
        className="shrink-0 rounded-full px-2 py-[3px] text-[10.5px] font-bold uppercase leading-none tracking-wide"
        style={tone === "green" ? { background: "rgba(34,160,107,.14)", color: "#12794A" }
            : tone === "blue" ? { background: "rgba(30,120,214,.14)", color: "#0F63B5" }
                : { background: C.tile, color: C.muted }}

    >{children}</span>
);

function SectionTitle({ children, count }) {
    return (
        <h4 className="flex items-center gap-2 px-1 pb-2 pt-1 text-[15px] font-extrabold leading-tight tracking-wide" style={{ color: C.ink }}>
            {children}
            {count > 0 && (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold" style={{ background: C.tile, color: C.muted }}>
                    {count}
                </span>
            )}
        </h4>
    );
}

function Empty({ Icon, title, text }) {
    return (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: C.tile }}>
                <Icon className="h-5 w-5" style={{ color: C.muted }} />
            </span>
            <p className="text-[13px] font-bold" style={{ color: C.ink }}>{title}</p>
            {text && <p className="max-w-[240px] text-[11.5px] font-medium leading-snug" style={{ color: C.muted }}>{text}</p>}
        </div>
    );
}

function Header({ count, view, onView, showTabs }) {
    return (
        <div className={HEAD_CLS}>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
                <h3 className="flex items-center gap-2 text-[15px] font-extrabold tracking-wide md:text-[16px]" style={{ color: C.ink }}>
                    Team
                    {count > 0 && (
                        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[9.5px] font-bold text-white" style={{ background: C.secondary }}>
                            {count}
                        </span>
                    )}
                </h3>

                {showTabs && (
                    <div role="group" aria-label="Team sections" className="flex gap-1 rounded-full p-0.5" style={{ background: C.tile }}>
                        {[["members", "People"], ["activity", "Activity log"]].map(([k, t]) => (
                            <button
                                key={k} type="button" aria-pressed={view === k} onClick={() => onView(k)}
                                className="rounded-full px-3 py-1 text-[11.5px] font-bold tracking-wide transition-colors duration-150"
                                style={view === k ? { background: "#000", color: "#fff" } : { color: C.muted }}
                            >{t}</button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

/* --------------------------------- skeleton --------------------------------- */

function TeamPanelSkeleton() {
    // Same header, scroll wrapper and row structure as the real panel, so nothing jumps when data arrives.
    const bar = "animate-pulse rounded-md";
    const fill = { background: C.tile };
    const rows = [{ n: "42%", m: "60%" }, { n: "34%", m: "52%" }, { n: "48%", m: "66%" }];
    return (
        <section className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="Loading team">
            <div className={HEAD_CLS}>
                <div className={`${bar} h-[20px] w-20`} style={fill} />
            </div>
            <div className={`${SCROLL_CLS} overflow-hidden`}>
                <div className={`${bar} mb-2 ml-1 h-[16px] w-24`} style={fill} />
                <ul className="space-y-2">
                    {rows.map((r, i) => (
                        <li key={i} className="flex items-center gap-3 rounded-2xl border p-3" style={{ borderColor: C.hair }}>
                            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full" style={fill} />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                    <div className={`${bar} h-[14px]`} style={{ ...fill, width: r.n }} />
                                    <div className="h-[18px] w-12 shrink-0 animate-pulse rounded-full" style={fill} />
                                </div>
                                <div className={`${bar} mt-1.5 h-[12px]`} style={{ ...fill, width: r.m }} />
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

/* ----------------------------------- panel ----------------------------------- */

export default function TeamPanel({ token, active, scrollProps }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [view, setView] = useState("members"); // members | activity

    const load = useCallback(async () => {
        const res = await fetchTeam(token);
        if (res.success) { setData(res); setFailed(false); } else setFailed(true);
        setLoading(false);
    }, [token]);

    // Refresh every time the Console is opened (no skeleton flash: data stays on screen while it refetches).
    useEffect(() => { if (active && token) load(); }, [active, token, load]);

    if (loading) return <TeamPanelSkeleton />;

    if (failed || !data) {
        return (
            <section className="flex min-h-0 flex-1 flex-col" aria-label="Team">
                <Header count={0} view="members" onView={() => { }} showTabs={false} />
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                    <p className="text-[13px] font-bold" style={{ color: C.ink }}>Couldn't load your team</p>
                    <button
                        type="button" onClick={() => { setLoading(true); load(); }}
                        className="rounded-full px-4 py-2 text-[12px] font-bold tracking-wide text-white" style={{ background: C.secondary }}
                    >Try again</button>
                </div>
            </section>
        );
    }

    const isAdmin = data.myRole === "admin";
    const showActivity = view === "activity" && isAdmin;

    return (
        <section className="flex min-h-0 flex-1 flex-col" aria-label="Team">
            <Header count={data.members.length} view={view} onView={setView} showTabs={isAdmin} />
            <div {...scrollProps} className={SCROLL_CLS} style={{ overscrollBehavior: "contain" }}>
                {showActivity
                    ? <ActivityLog token={token} members={data.members} />
                    : <PeopleView token={token} data={data} isAdmin={isAdmin} reload={load} />}
            </div>
        </section>
    );
}

/* ---------------------------------- People ---------------------------------- */

function PeopleView({ token, data, isAdmin, reload }) {
    const [value, setValue] = useState("");
    const [sending, setSending] = useState(false);
    const [role, setRole] = useState("member");
    const [error, setError] = useState("");
    const [sent, setSent] = useState(null); // { link, delivered, label }
    const [copied, setCopied] = useState(false);
    const [pending, setPending] = useState(null); // { id, type: "role" | "remove", role? }
    const [busyId, setBusyId] = useState(null);
    const inFlight = useRef(false);

    const members = data.members;
    const slotsLeft = data.limits.maxMembers - members.length - data.invites.length;

    const copy = async (link) => {
        if (await copyText(link)) { setCopied(true); setTimeout(() => setCopied(false), 1800); }
    };

    const invite = async (e) => {
        e?.preventDefault();
        if (inFlight.current || !value.trim()) return;
        inFlight.current = true; setSending(true); setError(""); setSent(null);
        const res = await createTeamInvite(token, value.trim(), role);
        inFlight.current = false; setSending(false);
        if (!res.success) { setError(res.message || "Couldn't send the invite."); return; }
        setSent({ link: res.link, delivered: res.delivered, label: res.invite.maskedValue });
        setValue("");
        reload();
    };

    const resend = async (inv) => {
        setBusyId(inv.id); setError("");
        const res = await resendTeamInvite(token, inv.id);
        setBusyId(null);
        if (!res.success) { setError(res.message || "Couldn't resend the invite."); return; }
        setSent({ link: res.link, delivered: res.delivered, label: res.invite.maskedValue });
        reload();
    };
    const revoke = async (inv) => {
        setBusyId(inv.id); setError("");
        const res = await revokeTeamInvite(token, inv.id);
        setBusyId(null);
        if (!res.success) { setError(res.message || "Couldn't cancel the invite."); return; }
        reload();
    };
    const changeRole = async (m, role) => {
        setBusyId(m.userId); setError("");
        const res = await setTeamMemberRole(token, m.userId, role);
        setBusyId(null); setPending(null);
        if (!res.success) { setError(res.message || "Couldn't change the role."); return; }
        reload();
    };
    const remove = async (m) => {
        setBusyId(m.userId); setError("");
        const res = await removeTeamMember(token, m.userId);
        setBusyId(null); setPending(null);
        if (!res.success) { setError(res.message || "Couldn't remove this member."); return; }
        reload();
    };

    return (
        <div className="space-y-4 pt-1">
            {!isAdmin && data.sellerEnabled && (
                <div className="flex gap-2.5 rounded-2xl p-3 text-[12.5px] font-semibold leading-snug" style={{ background: "rgba(34,160,107,.12)", color: "#12794A" }}>
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Your team is now set up as a seller. You can list products, answer enquiries and manage orders from the Sell button.</span>
                </div>
            )}

            {error && <p role="alert" className="px-1 text-[12.5px] font-bold" style={{ color: C.red }}>{error}</p>}

            {/* Add a teammate */}
            {isAdmin && (
                data.canInvite ? (
                    <form onSubmit={invite} className="rounded-2xl border p-3" style={{ borderColor: C.hair, background: "rgba(11,114,133,0.04)" }}>
                        <label htmlFor="team-invite" className="flex items-center gap-1.5 text-[13px] font-extrabold tracking-wide" style={{ color: C.ink }}>
                            <UserPlus className="h-4 w-4" style={{ color: C.secondary }} /> Add a teammate
                        </label>
                        <div role="group" aria-label="Role" className="mt-2 inline-flex gap-1 rounded-full p-0.5" style={{ background: C.tile }}>
                            {[["member", "Team member"], ["salesperson", "Salesperson"]].map(([k, t]) => (
                                <button key={k} type="button" aria-pressed={role === k} onClick={() => setRole(k)}
                                    className="rounded-full px-3 py-1 text-[11.5px] font-bold tracking-wide"
                                    style={role === k ? { background: "#000", color: "#fff" } : { color: C.muted }}>{t}</button>
                            ))}
                        </div>
                        {role === "salesperson" && (
                            <p className="mt-1.5 text-[12px] font-medium leading-snug tracking-wide" style={{ color: C.muted }}>
                                Gets a separate sales workspace with only their own customers.
                            </p>
                        )}

                        <div className="mt-2 flex gap-2">
                            <input
                                id="team-invite" value={value} onChange={(e) => { setValue(e.target.value); setError(""); }}
                                placeholder="Mobile number or email" autoComplete="off" inputMode="email" disabled={sending || slotsLeft <= 0}
                                className="h-10 min-w-0 flex-1 rounded-xl border bg-white px-3 text-[13.5px] font-semibold tracking-wide outline-none focus:ring-2 disabled:opacity-60"
                                style={{ borderColor: C.hair, color: C.ink, "--tw-ring-color": "rgba(11,114,133,.35)" }}
                            />
                            <button
                                type="submit" disabled={sending || !value.trim() || slotsLeft <= 0}
                                className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-4 text-[12.5px] font-bold tracking-wide text-white transition active:scale-[.98] disabled:opacity-50"
                                style={{ background: C.secondary }}
                            >
                                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invite"}
                            </button>
                        </div>
                        <p className="mt-2 text-[11.5px] font-medium leading-snug tracking-wide" style={{ color: C.muted }}>
                            They get a link that expires in {data.limits.inviteHours} hours and must sign up with this exact number or email.
                            {slotsLeft <= 0 && " Your team is full."}
                        </p>

                        {sent && (
                            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-3 py-2" style={{ background: sent.delivered ? "rgba(34,160,107,.12)" : "rgba(255,214,10,.22)" }}>
                                <span className="min-w-0 flex-1 text-[12px] font-bold leading-snug" style={{ color: C.ink }}>
                                    {sent.delivered ? `Invite sent to ${sent.label}` : `Couldn't send to ${sent.label}. Share this link yourself.`}
                                </span>
                                {!sent.delivered && (
                                    <button
                                        type="button" onClick={() => copy(sent.link)}
                                        className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1 text-[11.5px] font-bold"
                                        style={{ borderColor: C.hair, color: C.ink }}
                                    >
                                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                        {copied ? "Copied" : "Copy link"}
                                    </button>
                                )}
                            </div>
                        )}
                    </form>
                ) : (
                    <div className="rounded-2xl p-3 text-[12.5px] font-semibold leading-snug" style={{ background: C.tile, color: C.muted }}>
                        Finish setting up your company to add teammates.
                    </div>
                )
            )}

            {/* Pending invites */}
            {isAdmin && data.invites.length > 0 && (
                <section>
                    <SectionTitle count={data.invites.length}>Pending invites</SectionTitle>
                    <ul className="space-y-2">
                        {data.invites.map((i) => (
                            <li key={i.id} className="flex items-center gap-3 rounded-2xl border p-3" style={{ borderColor: C.hair }}>
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: C.tile, color: C.muted }}>
                                    {i.channel === "email" ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>{i.value}</div>
                                    {i.role === "salesperson" && <Pill tone="blue">Salesperson</Pill>}
                                    <div className="mt-0.5 flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: i.status === "expired" ? C.red : C.muted }}>
                                        <Clock className="h-3 w-3" />{expiresIn(i.expiresAt)}
                                    </div>
                                </div>
                                <button type="button" disabled={busyId === i.id} onClick={() => resend(i)} aria-label="Resend invite" title="Resend"
                                    className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-black/5 disabled:opacity-50" style={{ color: C.ink }}>
                                    {busyId === i.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                                </button>
                                <button type="button" disabled={busyId === i.id} onClick={() => revoke(i)} aria-label="Cancel invite" title="Cancel invite"
                                    className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-black/5 disabled:opacity-50" style={{ color: C.red }}>
                                    <X className="h-4 w-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* Members */}
            <section>
                <SectionTitle count={members.length}>{data.companyName}</SectionTitle>
                <ul className="space-y-2">
                    {members.map((m) => {
                        const canRole = isAdmin && !m.isOwner && !!data.canManageRoles;
                        const canRemove = isAdmin && !m.isOwner && (!!data.canManageRoles || m.role !== "admin");
                        const asking = pending?.id === m.userId ? pending : null;
                        const busy = busyId === m.userId;
                        const roleOptions = m.role === "admin" ? [["member", "Make member"]]
                            : m.role === "salesperson" ? [["member", "Make member"], ["admin", "Make admin"]]
                                : [["admin", "Make admin"], ["salesperson", "Make salesperson"]];

                        return (
                            <li key={m.userId} className="rounded-2xl border p-3" style={{ borderColor: C.hair }}>
                                <div className="flex items-center gap-3">
                                    <Avatar m={m} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className="truncate text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>{m.name || "Unnamed"}{m.isMe ? " (you)" : ""}</span>
                                            <Pill tone={m.role === "admin" ? "green" : m.role === "salesperson" ? "blue" : "muted"}>{roleLabel(m)}</Pill>
                                        </div>
                                        <div className="truncate text-[12px] font-medium tracking-wide" style={{ color: C.muted }}>{m.email || (m.phone ? `+91 ${m.phone}` : "")}</div>
                                    </div>
                                </div>

                                {(canRole || canRemove) && (
                                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t pt-2" style={{ borderColor: C.hair }}>
                                        {asking ? (
                                            <>
                                                <span className="text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                                    {asking.type === "role"
                                                        ? `Make ${firstName(m)} ${ROLE_PHRASE[asking.role]}?`
                                                        : `Remove ${firstName(m)} from the team?`}
                                                </span>
                                                <button
                                                    type="button" disabled={busy}
                                                    onClick={() => (asking.type === "role" ? changeRole(m, asking.role) : remove(m))}
                                                    className="rounded-full px-3 py-1 text-[11.5px] font-bold tracking-wide text-white disabled:opacity-60"
                                                    style={{ background: asking.type === "remove" ? C.red : C.secondary }}
                                                >
                                                    {busy ? "Saving…" : "Confirm"}
                                                </button>
                                                <button type="button" disabled={busy} onClick={() => setPending(null)} className="text-[11.5px] font-bold tracking-wide" style={{ color: C.muted }}>
                                                    Cancel
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                {canRole && roleOptions.map(([r, t]) => (
                                                    <button key={r} type="button" onClick={() => setPending({ id: m.userId, type: "role", role: r })}
                                                        className="text-[11.5px] font-bold tracking-wide" style={{ color: C.secondary }}>{t}</button>
                                                ))}
                                                {canRemove && (
                                                    <button
                                                        type="button" onClick={() => setPending({ id: m.userId, type: "remove" })}
                                                        className="ml-auto text-[11.5px] font-bold tracking-wide" style={{ color: C.red }}
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </section>
        </div>
    );
}

/* ---------------------------------- Activity ---------------------------------- */

const ActivityRow = memo(function ActivityRow({ e, isLast, onOpen }) {
    const link = safeLink(e.meta?.link);
    const color = CAT_COLOR[e.category] || C.muted;
    const count = Number(e.meta?.count) > 1 ? Number(e.meta.count) : 0;
    const preview = e.meta?.preview;
    const showRef = e.entityId && e.category !== "team" && e.category !== "chat" && !e.meta?.counterpart && !e.meta?.orderNo;
    const Card = link ? "button" : "div";

    return (
        <div className="grid" style={{ gridTemplateColumns: GRID, columnGap: GAP }}>
            <time
                className="select-none text-right text-[10.5px] font-semibold tabular-nums leading-none"
                style={{ color: C.muted, paddingTop: DOT_Y - 6 }}
                title={new Date(e.createdAt).toLocaleString("en-IN")}
            >
                {formatTime(e.createdAt)}
            </time>

            <div className="relative" aria-hidden="true">
                <span className="absolute left-1/2 top-0 w-[2px] -translate-x-1/2 rounded-full" style={{ background: C.rail, height: isLast ? DOT_Y : "100%" }} />
                <span
                    className="absolute left-1/2 -translate-x-1/2 rounded-full border-2"
                    style={{ top: DOT_Y - DOT / 2, width: DOT, height: DOT, boxSizing: "border-box", borderColor: color, background: color }}
                />
            </div>

            <div className="min-w-0 pb-1">
                <Card
                    {...(link ? { type: "button", onClick: () => onOpen(link), "aria-label": `${e.label}. Open` } : {})}
                    className={`block w-full rounded-xl px-2.5 py-2 text-left ${link ? "cursor-pointer transition-colors duration-150 hover:bg-black/[0.035] active:bg-black/[0.05]" : ""}`}
                >
                    <div className="flex items-center gap-2">
                        <span
                            className="inline-flex items-center rounded-md px-1.5 py-[2px] text-[10.5px] font-bold leading-[14px]"
                            style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
                        >
                            {CAT_LABEL[e.category] || "General"}
                        </span>
                        {link && <ChevronRight className="ml-auto h-4 w-4 shrink-0" style={{ color: C.muted }} />}
                    </div>

                    <div className="mt-1 text-[13px] font-semibold leading-snug tracking-wide" style={{ color: C.ink }}>{e.label}</div>

                    {preview && (
                        <div className="mt-1 line-clamp-2 rounded-lg px-2.5 py-1.5 text-[12px] font-medium leading-snug tracking-wide" style={{ background: C.tile, color: C.ink }}>
                            {preview}
                        </div>
                    )}

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                        <span>{e.actorName || "Unknown"}{e.actorRole === "admin" ? " · Admin" : ""}</span>
                        {count > 0 && <span>{count} messages</span>}
                        {showRef && <span className="truncate">Ref {String(e.entityId).slice(0, 8)}</span>}
                    </div>
                </Card>
            </div>
        </div>
    );
});

function ActivityLog({ token, members }) {
    const navigate = useNavigate();
    const [memberId, setMemberId] = useState("");
    const [events, setEvents] = useState([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [more, setMore] = useState(false);
    const [error, setError] = useState("");
    const reqId = useRef(0);

    const load = useCallback(async (reset, cursor) => {
        const id = ++reqId.current; // ignore answers that arrive after a newer request
        reset ? setLoading(true) : setMore(true);
        const res = await fetchTeamActivity(token, { memberId: memberId || undefined, before: cursor });
        if (id !== reqId.current) return;
        if (!res.success) setError(res.message || "Couldn't load the activity log.");
        else {
            setError("");
            setEvents((prev) => (reset ? res.events : [...prev, ...res.events]));
            setHasMore(res.hasMore);
        }
        setLoading(false); setMore(false);
    }, [token, memberId]);

    useEffect(() => { load(true); }, [load]);

    const { socket } = useSocket();
    const newestRef = useRef(null);
    useEffect(() => { newestRef.current = events[0]?.createdAt || null; }, [events]);

    // Fetch only what is newer than the newest row on screen. No spinner, no scroll jump.
    const catchUp = useCallback(async () => {
        const after = newestRef.current;
        if (!after) { load(true); return; }
        const res = await fetchTeamActivity(token, { memberId: memberId || undefined, after, limit: 50 });
        if (!res.success || !res.events.length) return;
        if (res.hasMore) { load(true); return; }   // a huge burst: just reload page one
        setEvents((prev) => {
            const ids = new Set(res.events.map((e) => e.id)); // merged chat rows keep their id
            const next = [...res.events, ...prev.filter((e) => !ids.has(e.id))];
            if (next.length > MAX_KEEP) { setHasMore(true); return next.slice(0, MAX_KEEP); }
            return next;
        });
    }, [token, memberId, load]);

    useEffect(() => {
        if (!socket) return undefined;
        let t;
        const onPing = () => { clearTimeout(t); t = setTimeout(catchUp, 300); };
        socket.on("team:activity", onPing);
        socket.on("connect", onPing);   // catches anything missed while offline
        return () => { clearTimeout(t); socket.off("team:activity", onPing); socket.off("connect", onPing); };
    }, [socket, catchUp]);

    // One group (and one continuous line) per calendar date; the server already sends newest first.
    const groups = useMemo(() => {
        const out = [];
        for (const e of events) {
            const key = dateKeyOf(e.createdAt);
            const last = out[out.length - 1];
            if (last && last.key === key) last.items.push(e);
            else out.push({ key, label: dateLabelOf(e.createdAt), items: [e] });
        }
        return out;
    }, [events]);

    const open = useCallback((link) => navigate(link), [navigate]);

    return (
        <div className="pt-1">
            <div className="px-1 pb-1">
                <select
                    value={memberId} onChange={(e) => setMemberId(e.target.value)} aria-label="Filter by member"
                    className="h-9 w-full rounded-xl border bg-white px-3 text-[12.5px] font-semibold tracking-wide outline-none focus:ring-2"
                    style={{ borderColor: C.hair, color: C.ink, "--tw-ring-color": "rgba(11,114,133,.35)" }}
                >
                    <option value="">Everyone</option>
                    {members.map((m) => <option key={m.userId} value={m.userId}>{m.name || m.email || m.phone}{m.isMe ? " (you)" : ""}</option>)}
                </select>
            </div>

            {loading ? (
                <div className="flex justify-center py-10" style={{ color: C.muted }}><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : error ? (
                <p role="alert" className="py-8 text-center text-[13px] font-bold" style={{ color: C.red }}>{error}</p>
            ) : events.length === 0 ? (
                <Empty Icon={ClipboardList} title="No activity yet" text="What your team members do on behalf of the company will show up here." />
            ) : (
                <div>
                    {groups.map((g) => (
                        <div key={g.key} className="mb-1.5">
                            <h4 className="px-1 pb-1.5 pt-3 text-[18px] font-extrabold leading-tight tracking-tight md:text-[19px]" style={{ color: C.ink }}>{g.label}</h4>
                            {g.items.map((e, i) => (
                                <ActivityRow key={e.id} e={e} isLast={i === g.items.length - 1} onOpen={open} />
                            ))}
                        </div>
                    ))}

                    {hasMore && (
                        <div className="flex justify-center py-2">
                            <button
                                type="button" disabled={more} onClick={() => load(false, events[events.length - 1]?.createdAt)}
                                className="h-9 rounded-full border px-4 text-[12px] font-bold tracking-wide transition-colors hover:bg-black/[0.03] disabled:opacity-60"
                                style={{ borderColor: C.hair, color: C.ink }}
                            >
                                {more ? "Loading…" : "Show older activity"}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}