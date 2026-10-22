import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Users, BadgeCheck, Clock, Send, Receipt, UserPlus, ChevronRight, Inbox } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import useSalesRealtime from "../hooks/useSalesRealtime.js";
import { fetchSalesSummary } from "../utils/salesApi.js";
import { greeting, toTitleCase } from "../components/growSeller/sellerHelpers.js";

export default function SalesDashboardPage() {
    const nav = useNavigate();
    const { token, profile } = useAuth();
    const { company } = useOutletContext();
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const seq = useRef(0);

    const load = useCallback(async (silent) => {
        const my = ++seq.current;
        if (!silent) setError("");
        const res = await fetchSalesSummary(token);
        if (my !== seq.current) return;
        if (res.success) { setData(res); setError(""); }
        else if (!silent) setError(res.message || "Couldn't load your dashboard.");
    }, [token]);

    useEffect(() => { if (token) load(false); }, [token, load]);
    useSalesRealtime(() => load(true));

    const first = (profile?.team?.actor?.name || "").trim().split(/\s+/)[0];
    const c = data?.counts;
    const kpis = [
        { l: "My customers", v: c?.all, Icon: Users, a: "var(--k-bl)" },
        { l: "On BBM", v: c?.active, Icon: BadgeCheck, a: "var(--k-gr)" },
        { l: "Not on BBM yet", v: c?.invited, Icon: Clock, a: "var(--k-or)" },
        { l: "Orders from my customers", v: data?.orders, Icon: Receipt, a: "var(--k-go)" },
    ];

    return (
        <div className="gd">
            <div className="gd-greet gk-rise" style={{ "--i": 0 }}>
                <h1>Good {greeting()},<span>{first || "there"}</span></h1>
                <p>Your customer pipeline at {company}.</p>
            </div>

            {data && data.sellerReady === false && (
                <div className="gk-empty" style={{ marginTop: 18 }}><b>Your company isn't set up to sell yet</b>Customers will appear here once your admin finishes seller setup.</div>
            )}
            {error && <div className="gk-empty" style={{ marginTop: 18 }}><b>{error}</b><button type="button" className="gk-btn go" onClick={() => load(false)}>Try again</button></div>}

            <div className="gd-kpis">
                {kpis.map((k, i) => (
                    <button key={k.l} type="button" className="gd-kpi gk-rise" style={{ "--i": 1 + i, "--a": k.a }} onClick={() => nav("/sales/customers")}>
                        <span className="gk-ico"><k.Icon /></span>
                        <span><b>{data ? k.v ?? 0 : "–"}</b><span className="l">{k.l}</span></span>
                    </button>
                ))}
            </div>

            <section className="gk-card gd-panel gk-rise" style={{ "--i": 5, marginTop: 16 }}>
                <div className="gd-ph">
                    <h2>Recently added</h2>
                    <button type="button" className="gd-link" onClick={() => nav("/sales/customers")}>View all<ChevronRight size={16} /></button>
                </div>
                {!data ? <div className="gk-skel" style={{ height: 150 }} />
                    : data.recent?.length ? data.recent.map((r) => (
                        <button key={r.id} type="button" className="gd-row" onClick={() => nav("/sales/customers")}>
                            <span className="gd-th">{(r.name || "C")[0].toUpperCase()}</span>
                            <span className="t"><b>{toTitleCase(r.name)}</b><small>{[r.location, r.gstin].filter(Boolean).join(" · ")}</small></span>
                            <span className="r"><span className="gk-pill" style={{ "--a": r.status === "active" ? "var(--k-gt)" : "var(--k-mute)" }}>{r.status === "active" ? "On BBM" : "Not on BBM"}</span></span>
                        </button>
                    )) : (
                        <div className="gk-empty" style={{ border: 0, padding: "24px 8px" }}>
                            <Inbox size={22} /><b>No customers yet</b>Add your first customer with their GST number.
                        </div>
                    )}
            </section>

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", marginTop: 16 }}>
                <button type="button" className="gk-btn or blk" onClick={() => nav("/sales/customers?add=1")}><UserPlus size={18} />Add customer</button>
                <button type="button" className="gk-btn blk" onClick={() => nav("/sales/enquiries?new=1")}><Send size={18} />Post RFQ</button>
            </div>
        </div>
    );
}