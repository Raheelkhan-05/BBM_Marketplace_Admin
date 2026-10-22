// src/pages/GrowCustomersPage.jsx — the seller's customers, with credit and custom pricing managed right on each customer.
//   Auto-added from orders / credit requests, or added by GST number (optionally with a credit limit).
//   Custom pricing: per buyer, many products (GrowCustomerPricing sheet). Needs the customer to be on BBM (has a userId).
//   Realtime: credit:changed + orders_changed (socket) -> silent refetch; also on reconnect / tab focus.
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Send, User, UsersRound, Trash2, UserPlus, Upload as UploadIcon, Check, Clock, TrendingUp, Tag, ChevronDown, X } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import useInfiniteScrollSentinel from "../hooks/useInfiniteScrollSentinel";
import CustomerAddModal from "../components/growSeller/CustomerAddModal.jsx";
import LimitDialog from "../components/credit/LimitDialog.jsx";
import GrowCustomerPricing from "../components/grow/GrowCustomerPricing.jsx";
import Ic from "../components/growSeller/Ic.jsx";
import { Empty, ListSkeleton } from "../components/growSeller/ui.jsx";
import { useGrowSeller } from "../context/GrowSellerContext.js";
import { toTitleCase } from "../components/growSeller/sellerHelpers.js";
import AssignSalespersonSheet from "../components/growSeller/AssignSalespersonSheet.jsx";
import { fetchCustomersAdmin, fetchSalespeople, assignCustomerTo } from "../utils/salesApi.js";
import {
    markCustomerInvited, removeCustomer, shareInvite,
    approveCredit, declineCredit, grantCredit, changeCreditLimit, declineLimitIncrease, setCreditEnabled,
} from "../utils/sellerCustomersApi.js";
import "../components/growSeller/grow-store.css";
import "../components/growSeller/salesperson-filter.css";

const PAGE = 12;
const FILTERS = ["all", "active", "invited", "requests", "credit"];
const inr = (n) => "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
const mergeUnique = (prev, incoming) => {
    const seen = new Set(prev.map((i) => i.id));
    return [...prev, ...incoming.filter((i) => !seen.has(i.id))];
};
const initialFilter = () => {
    try { const f = new URLSearchParams(window.location.search).get("filter"); return FILTERS.includes(f) ? f : "all"; }
    catch { return "all"; }
};

// ── credit block on a customer card ─────────────────────────────────────────
function CreditBlock({ c, busy, on }) {
    if (!c.userId) {
        return <p className="cr-note tracking-wide" style={{ marginTop: 12 }}>Credit and custom pricing become available once they join BBM.</p>;
    }
    const cr = c.credit || { status: "none", limit: 0, used: 0 };
    const pct = cr.limit > 0 ? Math.min(100, Math.round((cr.used / cr.limit) * 100)) : 0;
    const left = Math.max(cr.limit - cr.used, 0);
    const tone = cr.limit > 0 && left <= 0 ? "d" : pct >= 75 ? "w" : "";

    if (cr.status === "pending") {
        return (
            <div className="cr">
                <div className="cr-h"><span className="cr-t">Credit</span><span className="tg o"><Clock size={14} />Requested credit</span></div>
                <div className="cr-acts">
                    <button type="button" className="bt go sm" disabled={busy} onClick={() => on.approve(c)}><Check size={15} />Approve</button>
                    <button type="button" className="bt sm" disabled={busy} onClick={() => on.decline(c)}>Decline</button>
                </div>
            </div>
        );
    }

    if (cr.status === "approved") {
        return (
            <div className="cr">
                <div className="cr-h">
                    <span className="cr-t">Credit</span>
                    {cr.increasePending ? <span className="tg o"><TrendingUp size={14} />Wants higher limit</span>
                        : left <= 0 && cr.limit > 0 ? <span className="tg o">Limit reached</span>
                            : <span className="tg g">Active</span>}
                </div>
                <div className="cr-amt">{inr(left)}<small>left this month</small></div>
                <div className="cr-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i className={tone} style={{ width: `${pct}%` }} /></div>
                <div className="cr-u"><span>Used {inr(cr.used)}</span><span>Limit {inr(cr.limit)}</span></div>
                {cr.increasePending && (
                    <div className="cr-acts">
                        <button type="button" className="bt go sm" disabled={busy} onClick={() => on.change(c)}><Check size={15} />Update limit</button>
                        <button type="button" className="bt sm" disabled={busy} onClick={() => on.declineIncrease(c)}>Decline</button>
                    </div>
                )}
                <div className="cr-f">
                    <button type="button" className="sw gst" role="switch" aria-checked="true" aria-label="Credit enabled" disabled={busy} onClick={() => on.toggle(c, false)}>
                        <i /><span>Credit on</span>
                    </button>
                    {!cr.increasePending && <button type="button" className="bt sm" disabled={busy} onClick={() => on.change(c)}>Change limit</button>}
                </div>
            </div>
        );
    }

    if (cr.status === "revoked") {
        return (
            <div className="cr">
                <div className="cr-h"><span className="cr-t">Credit</span><span className="cr-note">Turned off</span></div>
                <div className="cr-f">
                    <button type="button" className="sw gst" role="switch" aria-checked="false" aria-label="Credit off" disabled={busy} onClick={() => on.toggle(c, true)}>
                        <i /><span>Credit off</span>
                    </button>
                </div>
            </div>
        );
    }

    // none | rejected — the seller can still grant credit directly (also undoes a mistaken decline)
    return (
        <div className="cr">
            <div className="cr-h">
                <span className="cr-t">Credit</span>
                <span className="cr-note">{cr.status === "rejected" ? "Request declined" : "Not set"}</span>
            </div>
            <div className="cr-acts">
                <button type="button" className="bt sm" disabled={busy} onClick={() => on.grant(c)}><Check size={15} />Set credit limit</button>
            </div>
        </div>
    );
}

function CustomerCard({ c, hl, busy, on, canAssign }) {
    const active = c.status === "active";
    return (
        <article className={`card${hl ? " hl" : ""}`} id={c.credit?.id ? `customer-credit-${c.credit.id}` : undefined}>
            <div className="top mb-3">
                <div className="in">
                    <h3>
                        {toTitleCase(c.name)}
                        <span className={`stt rfq ${active ? "approved" : "pending_review"}`}>{active ? "Customer" : "Invite"}</span>
                    </h3>
                    {c.gstin && <b className="q">GSTIN {c.gstin}</b>}
                    {c.location && <small>{c.location}</small>}
                </div>
            </div>
            {c.assignment !== undefined && (canAssign || c.assignment) && (
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, margin: "0 0 12px" }}>
                    {c.assignment ? (<>
                        <span className="tg g"><User size={14} />{c.assignment.name}</span>
                        <span className={`tg ${c.assignment.kind === "self" ? "o" : "g"}`}>{c.assignment.kind === "self" ? "Self added" : "Admin assigned"}</span>
                    </>) : <span className="cr-note">Not assigned</span>}
                    {canAssign && <button type="button" className="bt sm" style={{ marginLeft: "auto" }} onClick={() => on.assign(c)}>{c.assignment ? "Change" : "Assign"}</button>}
                </div>
            )}
            {c.savedContact && (
                <p className="cr-note" style={{ margin: "0 0 10px" }}>
                    {[c.savedContact.name, c.savedContact.phone, c.savedContact.email].filter(Boolean).join(" · ")}
                </p>
            )}
            <ul className="mt">
                {active ? (<>
                    <li><Ic n="repeat" /><span>{c.ordersCount ? `${c.ordersCount} order${c.ordersCount === 1 ? "" : "s"} · ${inr(c.totalSpent)}` : "No orders yet"}</span></li>
                    {c.lastOrderAt && <li><Ic n="clock" /><span>Last order {day(c.lastOrderAt)}</span></li>}
                </>) : (
                    // <li><Ic n="clock" /><span>{c.invitedAt ? `Invited ${day(c.invitedAt)} · waiting to join BBM` : "Not on BBM yet · send an invite"}</span></li>
                    <li><Ic n="clock" /><span>{c.invitedAt ? `Invited ${day(c.invitedAt)} · waiting to join BBM` : "Not on BBM yet"}</span></li>
                )}
            </ul>

            <CreditBlock c={c} busy={busy} on={on} />

            <div className="rf">
                <div className="tm"><Ic n="clock" /><span><b>Added {day(c.addedAt)}</b></span></div>
                <div className="rowa">
                    {c.userId && (
                        <button type="button" className="bt sm" onClick={() => on.pricing(c)}><Tag size={15} />Custom pricing</button>
                    )}
                    {!active && (<>
                        <button type="button" className="bt go sm" onClick={() => on.invite(c)}><Send size={15} />{c.invitedAt ? "Invite again" : "Invite"}</button>
                        <button type="button" className="bt sm" onClick={() => on.remove(c)} aria-label={`Remove ${c.name}`}><Trash2 size={15} />Remove</button>
                    </>)}
                </div>
            </div>
        </article>
    );
}

export default function GrowCustomersPage() {
    const { token, profile } = useAuth();
    const { socket, connected } = useSocket();
    const { say } = useGrowSeller();
    const [searchParams, setSearchParams] = useSearchParams();

    const [qInput, setQInput] = useState("");
    const [q, setQ] = useState("");
    const [filter, setFilter] = useState(initialFilter);
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState({ all: 0, active: 0, invited: 0, requests: 0, credit: 0 });
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [modal, setModal] = useState(null); // null | "single" | "bulk"
    const [dlg, setDlg] = useState(null);     // { kind: "approve" | "grant" | "change", c }
    const [pricingFor, setPricingFor] = useState(null); // customer whose custom prices are open
    const [busy, setBusy] = useState({});     // customerId -> true
    const [hlId, setHlId] = useState(null);

    const [assignee, setAssignee] = useState("all");
    const [salespeople, setSalespeople] = useState([]);
    const [assignFor, setAssignFor] = useState(null);


    const abortRef = useRef(null);
    const seqRef = useRef(0);
    const itemsRef = useRef([]);
    itemsRef.current = items;

    const shopName = profile?.shop_name || profile?.display_name || profile?.businessProfile?.display_name || profile?.businessProfile?.trade_name || "";
    const slug = profile?.shop_slug || null;

    useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 300); return () => clearTimeout(t); }, [qInput]);

    // skipSync: realtime refreshes don't need the order->customer sync round trip
    const load = useCallback(async (offset, append, silent = false, skipSync = false) => {
        abortRef.current?.abort();
        const ctl = new AbortController();
        abortRef.current = ctl;
        const seq = ++seqRef.current;
        if (append) setLoadingMore(true);
        else if (!silent) { setError(null); setLoading(true); }
        try {
            // a silent refresh re-reads everything already on screen, so infinite-scrolled pages don't collapse
            const limit = silent && !append ? Math.min(Math.max(PAGE, itemsRef.current.length), 100) : PAGE;
            const res = await fetchCustomersAdmin(token, { q, filter, limit, offset, sync: skipSync ? 0 : undefined, assignee: assignee === "all" ? undefined : assignee, signal: ctl.signal });
            if (seq !== seqRef.current) return;
            if (!res.success) { if (!silent) { setError(res.message || "Couldn't load your customers."); setHasMore(false); } return; }
            setItems(append ? mergeUnique(itemsRef.current, res.items || []) : res.items || []);
            setTotal(res.total ?? 0);
            setHasMore(!!res.hasMore);
            if (res.counts) setCounts(res.counts);
            setError(null);
        } catch (e) {
            if (e?.name !== "AbortError" && !silent && seq === seqRef.current) setHasMore(false);
        } finally {
            if (seq === seqRef.current) { setLoading(false); setLoadingMore(false); }
        }
    }, [token, q, filter, assignee]);

    const loadRef = useRef(load);
    loadRef.current = load;

    useEffect(() => {
        if (!token) { setLoading(false); return undefined; }
        load(0, false);
        return () => abortRef.current?.abort();
    }, [load, reloadKey, token]);

    // ---- realtime -----------------------------------------------------------
    const timerRef = useRef(null);
    const scheduleRefresh = useCallback(() => {
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { if (token) loadRef.current(0, false, true, true); }, 150);
    }, [token]);

    useEffect(() => {
        if (!socket) return undefined;
        socket.on("credit:changed", scheduleRefresh);  // approve / decline / limit / toggle / request / usage given back
        socket.on("orders_changed", scheduleRefresh);  // a credit order was placed or cancelled -> usage moved
        socket.on("sales:customers_changed", scheduleRefresh);
        return () => { socket.off("credit:changed", scheduleRefresh); socket.off("orders_changed", scheduleRefresh); socket.off("sales:customers_changed", scheduleRefresh); clearTimeout(timerRef.current); };
    }, [socket, scheduleRefresh]);

    const prevConnected = useRef(connected);
    useEffect(() => {
        if (connected && !prevConnected.current && token) loadRef.current(0, false, true); // missed events while offline
        prevConnected.current = connected;
    }, [connected, token]);

    // load salespeople once (server returns 403 for non-admins, which we ignore)
    useEffect(() => {
        if (!token) return;
        fetchSalespeople(token).then((r) => { if (r?.success) setSalespeople(r.items || []); });
    }, [token]);


    // refresh when the tab comes back (new orders may have added customers)
    useEffect(() => {
        const on = () => { if (document.visibilityState === "visible" && token) loadRef.current(0, false, true); };
        document.addEventListener("visibilitychange", on);
        return () => document.removeEventListener("visibilitychange", on);
    }, [token]);

    // ---- notification deep link: ?filter=requests&highlight=<creditId> --------
    useEffect(() => {
        const f = searchParams.get("filter");
        const h = searchParams.get("highlight");
        if (!f && !h) return;
        if (f && FILTERS.includes(f)) setFilter(f);
        if (h) setHlId(h);
        setSearchParams({}, { replace: true });
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        if (!hlId || loading) return undefined;
        const el = document.getElementById(`customer-credit-${hlId}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        const t = setTimeout(() => setHlId(null), el ? 3500 : 6000);
        return () => clearTimeout(t);
    }, [hlId, loading, items.length]);

    const sentinelRef = useInfiniteScrollSentinel(
        () => !loadingMore && hasMore && load(items.length, true),
        { lookahead: 600, disabled: loading || loadingMore || !hasMore }
    );

    const refresh = () => setReloadKey((k) => k + 1);

    // ---- invite / remove ------------------------------------------------------
    const invite = async (customer, name) => {
        const target = customer?.id;
        if (!target) return;
        const r = await shareInvite({ shopName, slug, customerName: name || customer.name });
        if (r === "cancelled") return;
        const res = await markCustomerInvited(token, target);
        if (!res.success) return say(res.message || "Couldn't record the invite.");
        say(r === "copied" ? "Invite message copied. Send it to your customer." : r === "shared" ? "Invite sent." : "Couldn't open the invite. Copy the page link instead.");
        load(0, false, true);
    };

    const remove = async (c) => {
        if (!window.confirm(`Remove ${c.name} from your customers?`)) return;
        const res = await removeCustomer(token, c.id);
        if (!res.success) return say(res.message || "Couldn't remove this customer.");
        say("Customer removed.");
        refresh();
    };

    const doAssign = async (c, sid) => {
        setBusy((b) => ({ ...b, [c.id]: true }));
        const res = await assignCustomerTo(token, c.id, sid);
        setBusy((b) => { const n = { ...b }; delete n[c.id]; return n; });
        if (res.success) {
            setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, assignment: res.assignment } : x)));
            say(sid ? `Assigned to ${res.assignment.name}.` : "Assignment removed.");
            setAssignFor(null);
        } else say(res.message || "Couldn't update the assignment.");
        scheduleRefresh();
    };

    // ---- credit actions ---------------------------------------------------------
    const runCredit = useCallback(async (c, fn, okMsg) => {
        setBusy((b) => ({ ...b, [c.id]: true }));
        let res;
        try { res = await fn(); } catch { res = { success: false, message: "Network problem. Please try again." }; }
        setBusy((b) => { const n = { ...b }; delete n[c.id]; return n; });
        if (res?.success) { if (okMsg) say(okMsg); }
        else say(res?.message || "Something went wrong. Please try again.");
        scheduleRefresh(); // converge on server truth (the socket ping will usually have done it already)
        return res;
    }, [say, scheduleRefresh]);

    const credit = {
        approve: (c) => setDlg({ kind: "approve", c }),
        grant: (c) => setDlg({ kind: "grant", c }),
        change: (c) => setDlg({ kind: "change", c }),
        assign: (c) => setAssignFor(c),
        decline: (c) => runCredit(c, () => declineCredit(token, c.credit.id), "Credit request declined."),
        declineIncrease: (c) => runCredit(c, () => declineLimitIncrease(token, c.credit.id), "Higher-limit request declined."),
        toggle: (c, enabled) => runCredit(c, () => setCreditEnabled(token, c.userId, enabled), enabled ? "Credit turned on." : "Credit turned off."),
        pricing: (c) => setPricingFor(c),
        invite, remove,
    };

    const confirmDlg = async (limit) => {
        if (!dlg) return;
        const { kind, c } = dlg;
        const res = await runCredit(
            c,
            () => kind === "approve" ? approveCredit(token, c.credit.id, limit)
                : kind === "grant" ? grantCredit(token, c.userId, limit)
                    : changeCreditLimit(token, c.credit.id, limit),
            kind === "change" ? "Credit limit updated." : "Credit approved."
        );
        if (res?.success) setDlg(null);
    };

    const chips = [
        ["all", "All", counts.all], ["active", "Customers", counts.active], ["invited", "Invited", counts.invited],
        ["requests", "Credit requests", counts.requests], ["credit", "Has credit", counts.credit],
    ];

    const emptyTitle = q ? "No customers match your search"
        : filter === "invited" ? "No pending invites"
            : filter === "requests" ? "No credit requests"
                : filter === "credit" ? "No customers on credit yet"
                    : "No customers yet";
    const emptyText = q ? "Try a different name or GST number."
        : filter === "requests" ? "When a buyer asks to buy on credit, it shows up here instantly."
            : filter === "credit" ? "Approve a request, or open a customer and set a credit limit."
                : "They appear here as soon as a buyer orders from you. You can also add a business by its GST number.";

    return (
        <div className="v">
            <h2 className="h2" style={{ marginTop: 22 }}>Customers</h2>
            <p className="sub2 tracking-wide">Buyers you serve. Anyone who orders from you is added automatically. Manage their credit and custom prices here too.</p>

            <div className="act mt-3">
                <button className="bt" type="button" onClick={() => setModal("bulk")}><UploadIcon size={16} />Bulk add</button>
                <button className="bt or" type="button" onClick={() => setModal("single")}><UserPlus size={16} />Add customer</button>
            </div>

            <div className="tb" style={{ marginTop: 14 }}>
                <label className="srch">
                    <Ic n="search" />
                    <input className="tracking-wide" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Search by name or GST number" aria-label="Search customers" />
                    {qInput && <button type="button" className="clr" aria-label="Clear search" onClick={() => setQInput("")}><Ic n="x" /></button>}
                </label>
            </div>

            <div className="chs">
                {chips.map(([v, l, n]) => (
                    <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}>{l} · {n}</button>
                ))}
            </div>
            {salespeople.length > 0 && (
                <section className={`sp-filter${assignee !== "all" ? " sp-filter--active" : ""}`} aria-label="Customer assignment filter">
                    <div className="sp-filter__intro">
                        <span className="sp-filter__icon" aria-hidden="true"><UsersRound size={18} strokeWidth={2.1} /></span>
                        <div className="sp-filter__copy">
                            <label className="sp-filter__label" htmlFor="customer-salesperson-filter">Salesperson</label>
                            <span className="sp-filter__hint">Filter customers by who manages them</span>
                        </div>
                    </div>

                    <div className="sp-filter__control">
                        <select
                            id="customer-salesperson-filter"
                            className="sp-filter__select"
                            value={assignee}
                            onChange={(e) => setAssignee(e.target.value)}
                        >
                            <option value="all">All salespeople</option>
                            <option value="unassigned">Unassigned customers</option>
                            {salespeople.map((s) => <option key={s.userId} value={s.userId}>{s.name}</option>)}
                        </select>
                        <ChevronDown className="sp-filter__chevron" size={17} strokeWidth={2.2} aria-hidden="true" />
                    </div>

                    {assignee !== "all" && (
                        <button
                            className="sp-filter__clear"
                            type="button"
                            onClick={() => setAssignee("all")}
                            aria-label="Clear salesperson filter"
                            title="Clear salesperson filter"
                        >
                            <X size={14} strokeWidth={2.3} aria-hidden="true" />
                            Clear
                        </button>
                    )}
                </section>
            )}


            {!loading && !error && <p className="cnt">{total} customer{total === 1 ? "" : "s"}</p>}

            {loading && items.length === 0 ? <ListSkeleton n={4} tall /> : (
                <div className="grid c3">
                    {items.map((c) => <CustomerCard key={c.id} c={c} hl={!!hlId && c.credit?.id === hlId} busy={!!busy[c.id]} on={credit} canAssign={salespeople.length > 0} />)}
                    {!loading && !error && items.length === 0 && (
                        <Empty title={emptyTitle} text={emptyText}>
                            {!q && filter === "all" && (<><br /><button className="bt or" type="button" onClick={() => setModal("single")}><UserPlus size={16} />Add customer</button></>)}
                        </Empty>
                    )}
                </div>
            )}

            {!loading && error && (
                <div className="errb"><b>{error}</b><button type="button" className="bt go" onClick={refresh}>Try again</button></div>
            )}
            {loadingMore && <div className="more"><Ic n="spin" /></div>}
            {hasMore && !loading && <div ref={sentinelRef} style={{ height: 4 }} />}

            {modal && (
                <CustomerAddModal
                    key={modal}
                    initialTab={modal}
                    onClose={() => setModal(null)}
                    onChanged={(message) => { if (message) say(message); refresh(); }}
                    onInvite={invite}
                />
            )}

            <LimitDialog
                open={!!dlg}
                mode={dlg?.kind === "change" ? "update" : "approve"}
                buyerLabel={dlg?.c?.name}
                currentLimit={dlg?.kind === "change" ? dlg?.c?.credit?.limit : undefined}
                usageNote={dlg?.kind === "change" ? `Used this month: ${inr(dlg?.c?.credit?.used)}. Changing the limit keeps this usage.` : undefined}
                confirming={!!(dlg && busy[dlg.c.id])}
                onClose={() => setDlg(null)}
                onConfirm={confirmDlg}
            />

            <GrowCustomerPricing
                open={!!pricingFor}
                token={token}
                say={say}
                buyerId={pricingFor?.userId}
                buyerLabel={toTitleCase(pricingFor?.name || "") || "this customer"}
                onClose={() => setPricingFor(null)}
            />
            <AssignSalespersonSheet
                customer={assignFor} salespeople={salespeople} busy={!!(assignFor && busy[assignFor.id])}
                onClose={() => setAssignFor(null)} onPick={(sid) => doAssign(assignFor, sid)}
            />
        </div>
    );
}