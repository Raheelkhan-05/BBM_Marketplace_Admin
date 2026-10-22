import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { UserPlus, Phone, Mail, MapPin, Receipt, Search, X } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import useInfiniteScrollSentinel from "../hooks/useInfiniteScrollSentinel";
import useSalesRealtime from "../hooks/useSalesRealtime.js";
import { fetchSalesCustomers } from "../utils/salesApi.js";
import { toTitleCase } from "../components/growSeller/sellerHelpers.js";
import SalesAddCustomerSheet from "../components/sales/SalesAddCustomerSheet.jsx";

const PAGE = 12;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
const mergeUnique = (prev, inc) => { const s = new Set(prev.map((i) => i.id)); return [...prev, ...inc.filter((i) => !s.has(i.id))]; };

function Card({ c }) {
    const active = c.status === "active";
    return (
        <article className="gk-card gs-card">
            <h3>{toTitleCase(c.name)}
                <span className="gk-pill" style={{ "--a": active ? "var(--k-gt)" : "var(--k-mute)" }}>{active ? "On BBM" : "Not on BBM yet"}</span>
            </h3>
            {c.gstin && <b className="q">GSTIN {c.gstin}</b>}
            <div className="gs-lines">
                {c.location && <span><MapPin size={15} />{c.location}</span>}
                {c.contactName && <span>{c.contactName}</span>}
                {c.phone && <a href={`tel:+91${c.phone}`}><Phone size={15} />+91 {c.phone}</a>}
                {c.email && <a href={`mailto:${c.email}`}><Mail size={15} /><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.email}</span></a>}
                {active && <span><Receipt size={15} />{c.ordersCount ? `${c.ordersCount} order${c.ordersCount === 1 ? "" : "s"}${c.lastOrderAt ? ` · last ${day(c.lastOrderAt)}` : ""}` : "No orders yet"}</span>}
            </div>
            <small style={{ marginTop: 10 }}>Added {day(c.addedAt)}</small>
        </article>
    );
}

export default function SalesCustomersPage() {
    const { token } = useAuth();
    const { say } = useOutletContext();
    const [sp, setSp] = useSearchParams();

    const [qInput, setQInput] = useState("");
    const [q, setQ] = useState("");
    const [filter, setFilter] = useState("all");
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState({ all: 0, active: 0, invited: 0 });
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const [notReady, setNotReady] = useState(false);
    const [adding, setAdding] = useState(false);

    const abortRef = useRef(null);
    const seqRef = useRef(0);
    const itemsRef = useRef([]); itemsRef.current = items;

    useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 300); return () => clearTimeout(t); }, [qInput]);
    useEffect(() => { if (sp.get("add") === "1") { setAdding(true); setSp({}, { replace: true }); } }, [sp, setSp]);

    const load = useCallback(async (offset, append, silent = false) => {
        abortRef.current?.abort();
        const ctl = new AbortController(); abortRef.current = ctl;
        const my = ++seqRef.current;
        if (append) setLoadingMore(true); else if (!silent) { setError(""); setLoading(true); }
        try {
            // a silent refresh re-reads what is on screen, so scrolled pages don't collapse
            const limit = silent && !append ? Math.min(Math.max(PAGE, itemsRef.current.length), 100) : PAGE;
            const res = await fetchSalesCustomers(token, { q, filter, limit, offset, signal: ctl.signal });
            if (my !== seqRef.current) return;
            if (!res.success) { if (!silent) { setError(res.message || "Couldn't load your customers."); setHasMore(false); } return; }
            setNotReady(res.sellerReady === false);
            setItems(append ? mergeUnique(itemsRef.current, res.items || []) : res.items || []);
            setTotal(res.total ?? 0); setHasMore(!!res.hasMore);
            if (res.counts) setCounts(res.counts);
            setError("");
        } catch (e) {
            if (e?.name !== "AbortError" && !silent && my === seqRef.current) setHasMore(false);
        } finally {
            if (my === seqRef.current) { setLoading(false); setLoadingMore(false); }
        }
    }, [token, q, filter]);

    const loadRef = useRef(load); loadRef.current = load;
    useEffect(() => { if (!token) return undefined; load(0, false); return () => abortRef.current?.abort(); }, [load, token]);
    useSalesRealtime(() => loadRef.current(0, false, true));

    const sentinelRef = useInfiniteScrollSentinel(
        () => !loadingMore && hasMore && load(items.length, true),
        { lookahead: 600, disabled: loading || loadingMore || !hasMore },
    );

    const chips = [["all", "All", counts.all], ["active", "On BBM", counts.active], ["invited", "Not on BBM yet", counts.invited]];

    return (
        <div className="gd">
            <div className="gk-ph" style={{ marginTop: 22 }}>
                <div><h1>Customers</h1><p>Businesses assigned to you or added by you.</p></div>
                <button type="button" className="gk-btn or" onClick={() => setAdding(true)} disabled={notReady}><UserPlus size={16} />Add customer</button>
            </div>

            <div className="gk-search" style={{ marginTop: 14 }}>
                <Search size={16} />
                <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Search by name, contact or GST number" aria-label="Search customers" />
                {qInput && <button type="button" className="gk-icbtn" style={{ width: 28, height: 28, border: 0 }} aria-label="Clear search" onClick={() => setQInput("")}><X size={14} /></button>}
            </div>

            <div className="gd-ranges" role="group" aria-label="Filter" style={{ marginTop: 12 }}>
                {chips.map(([v, l, n]) => <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}>{l} · {n}</button>)}
            </div>

            {!loading && !error && !notReady && <p className="gd-note">{total} customer{total === 1 ? "" : "s"}</p>}

            {notReady ? (
                <div className="gk-empty"><b>Your company isn't set up to sell yet</b>You can add customers as soon as your admin finishes seller setup.</div>
            ) : loading && items.length === 0 ? (
                <div className="gs-list">{[0, 1, 2].map((i) => <div key={i} className="gk-skel" style={{ height: 150 }} />)}</div>
            ) : (
                <div className="gs-list">
                    {items.map((c) => <Card key={c.id} c={c} />)}
                    {!loading && !error && items.length === 0 && (
                        <div className="gk-empty" style={{ gridColumn: "1 / -1" }}>
                            <b>{q ? "No customers match your search" : "No customers yet"}</b>
                            {q ? "Try a different name or GST number." : "Add a business by its GST number. Customers your admin assigns to you show up here instantly."}
                        </div>
                    )}
                </div>
            )}

            {!loading && error && <div className="gk-empty"><b>{error}</b><button type="button" className="gk-btn go" onClick={() => load(0, false)}>Try again</button></div>}
            {hasMore && !loading && <div ref={sentinelRef} style={{ height: 4 }} />}

            {adding && (
                <SalesAddCustomerSheet token={token} onClose={() => setAdding(false)}
                    onAdded={(m) => { setAdding(false); say(m); load(0, false, true); }} />
            )}
        </div>
    );
}