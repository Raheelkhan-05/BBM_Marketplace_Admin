// pages/admin/AdminSellerListingsPage.jsx — create and manage product listings on behalf of any seller, by GSTIN.
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Search, Loader2, CheckCircle2, AlertTriangle, Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { C } from "../../components/catalog/tokens";
import { Chip } from "../../components/orders/disputeUi.jsx";
import { Wizard } from "../GrowStartPage.jsx";
import AdminSellerProducts from "../../components/admin/AdminSellerProducts.jsx";
import AdminBulkListings from "../../components/admin/AdminBulkListings.jsx";
import AdminStagedList from "../../components/admin/AdminStagedList.jsx";
import { lookupSeller, startSellerSession, stageListing } from "../../utils/api.adminListings.js";

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const RECENT_KEY = "bbm_admin_listing_gstins";
const STATE = {
    live: { label: "Live seller", tone: "success", text: "Products you add go live immediately. No review needed." },
    no_seller: { label: "Account found · not a seller yet", tone: "warn", text: "Products are saved now and go live automatically the moment this business finishes seller setup." },
    no_account: { label: "Not on BBM yet", tone: "neutral", text: "Products are saved against this GSTIN and go live automatically once this business signs up with it and finishes seller setup." },
};

const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; } };
const writeRecent = (g) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([g, ...readRecent().filter((x) => x !== g)].slice(0, 5))); } catch { /* ignore */ } };

export default function AdminSellerListingsPage() {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [input, setInput] = useState("");
    const [target, setTarget] = useState(null);   // lookup result
    const [sess, setSess] = useState(null);       // { token, expiresAt } for live sellers
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState("add");
    const [done, setDone] = useState(null);       // last created product
    const [wizKey, setWizKey] = useState(0);
    const [recent, setRecent] = useState(readRecent);
    const [toast, setToast] = useState("");
    const seq = useRef(0), tt = useRef(null);

    const say = useCallback((m) => { setToast(m); clearTimeout(tt.current); tt.current = setTimeout(() => setToast(""), 3200); }, []);
    useEffect(() => () => clearTimeout(tt.current), []);

    const live = target?.state === "live";

    const openSession = useCallback(async (gstin) => {
        const x = await startSellerSession(token, gstin);
        return x?.success ? { token: x.token, expiresAt: x.expiresAt } : null;
    }, [token]);

    // refresh the session five minutes before it expires
    useEffect(() => {
        if (!sess?.expiresAt || !target) return undefined;
        const t = setTimeout(async () => { const s = await openSession(target.gstin); if (s) setSess(s); }, Math.max(sess.expiresAt - Date.now() - 5 * 60000, 5000));
        return () => clearTimeout(t);
    }, [sess?.expiresAt, target?.gstin, openSession]); // eslint-disable-line

    const load = async (raw) => {
        const gstin = String(raw || input).trim().toUpperCase();
        if (!GSTIN_RE.test(gstin)) { setError("Enter a valid 15-character GSTIN."); return; }
        const my = ++seq.current;
        setLoading(true); setError(null); setTarget(null); setSess(null); setDone(null);
        const r = await lookupSeller(token, gstin);
        if (my !== seq.current) return;
        if (!r?.success) { setError(r?.message || "Could not load this GSTIN."); setLoading(false); return; }
        let s = null;
        if (r.state === "live") {
            s = await openSession(gstin);
            if (my !== seq.current) return;
            if (!s) { setError("Could not open this seller's products. Please try again."); setLoading(false); return; }
        }
        setInput(gstin); setTarget(r); setSess(s); setTab(r.state === "live" ? "products" : "add");
        setWizKey((k) => k + 1); setLoading(false);
        writeRecent(gstin); setRecent(readRecent());
    };

    // quiet refresh of counts / state (e.g. the seller finished onboarding meanwhile)
    const refresh = useCallback(async () => {
        if (!target) return;
        const r = await lookupSeller(token, target.gstin);
        if (!r?.success) return;
        if (r.state === "live" && !sess) { const s = await openSession(target.gstin); if (s) setSess(s); }
        setTarget(r);
    }, [target, token, sess, openSession]);

    const onListed = (card, res) => {
        setDone({ card, message: res?.message, live: !!res?.submission });
        refresh();
    };

    const waiting = (target?.queue?.staged || 0) + (target?.queue?.publishing || 0) + (target?.queue?.failed || 0);
    const tabs = target ? [
        ...(live ? [{ k: "products", t: "Products" }] : []),
        { k: "add", t: "Add product" }, { k: "bulk", t: "Bulk upload" },
        ...(waiting > 0 || !live ? [{ k: "waiting", t: waiting ? `Waiting (${waiting})` : "Waiting" }] : []),
    ] : [];
    const st = target ? STATE[target.state] : null;

    return (
        <main className="mx-auto min-h-screen w-full max-w-screen-2xl min-w-0 px-3 pb-24 pt-3 sm:px-5 md:px-6 lg:px-8">
            <style>{`.adm-embed .bar{position:sticky;bottom:0;left:auto;right:auto;width:100%}`}</style>

            <div className="mt-2 flex min-w-0 items-start gap-3 sm:mt-3 sm:items-center">
                {/* <button onClick={() => navigate(-1)} className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border sm:mt-0" style={{ borderColor: C.hair, color: C.ink }} aria-label="Back"><ArrowLeft className="h-4 w-4" /></button> */}
                <div className="min-w-0">
                    <h1 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-extrabold tracking-tight" style={{ color: C.ink }}>Seller listings</h1>
                    <p className="mt-1 max-w-2xl text-[13px] font-medium tracking-wide leading-relaxed sm:text-[14px]" style={{ color: C.muted }}>Add or manage products on behalf of any business using its GSTIN. Everything you add is approved automatically.</p>
                </div>
            </div>

            {/* GSTIN search */}
            <section className="mt-4 rounded-2xl border bg-white p-3.5 sm:p-4" style={{ borderColor: C.hair }}>
                <label htmlFor="gstin" className="text-[12px] font-bold" style={{ color: C.muted }}>Business GSTIN</label>
                <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border bg-white px-3 py-2.5" style={{ borderColor: error ? "#f87171" : C.hair }}>
                        <Search className="h-4 w-4 shrink-0" style={{ color: C.muted }} />
                        <input id="gstin" value={input} maxLength={15} autoComplete="off" spellCheck={false} placeholder="e.g. 24ABCDE1234F1Z5"
                            onChange={(e) => { setInput(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "")); setError(null); }}
                            onKeyDown={(e) => e.key === "Enter" && load()}
                            className="w-full bg-transparent font-mono text-[14px] font-semibold tracking-wide outline-none" style={{ color: C.ink }} />
                    </div>
                    <button onClick={() => load()} disabled={loading || input.length !== 15}
                        className="flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.primary }}>
                        {loading && <Loader2 className="h-4 w-4 animate-spin" />} Load seller
                    </button>
                </div>
                {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{error}</p>}
                {!target && recent.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11.5px] font-semibold" style={{ color: C.muted }}>Recent:</span>
                        {recent.map((g) => (
                            <button key={g} onClick={() => { setInput(g); load(g); }} className="rounded-full border px-2.5 py-1 font-mono text-[11.5px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>{g}</button>
                        ))}
                    </div>
                )}
            </section>

            {target && st && (
                <>
                    <section className="mt-3 rounded-2xl border bg-white p-3.5 sm:p-4" style={{ borderColor: C.hair }}>
                        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: C.hairSoft, color: C.ink }}><Building2 className="h-5 w-5" /></span>
                                <div className="min-w-0">
                                    <p className="break-words text-[15px] font-extrabold" style={{ color: C.ink }}>{target.businessName || "Business name unavailable"}</p>
                                    <p className="font-mono text-[12px] font-semibold" style={{ color: C.muted }}>{target.gstin}{target.details?.state ? ` · ${target.details.state}` : ""}</p>
                                </div>
                            </div>
                            <Chip tone={st.tone}>{st.label}</Chip>
                        </div>
                        <p className="mt-3 text-[12.5px] font-medium leading-relaxed" style={{ color: C.muted }}>{st.text}</p>
                        {!target.verified && (
                            <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{target.note || "Could not verify this GSTIN."} Double-check it before adding products.</p>
                        )}
                        {target.verified && target.note && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-800">{target.note}</p>}
                    </section>

                    <div className="mt-3 flex gap-1 overflow-x-auto rounded-xl border p-1" style={{ borderColor: C.hair, background: "#fafbfb" }} role="tablist">
                        {tabs.map(({ k, t }) => (
                            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="min-h-10 flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-[12.5px] font-bold transition-colors"
                                style={{ background: tab === k ? C.primary : "transparent", color: tab === k ? "#fff" : C.muted }}>{t}</button>
                        ))}
                    </div>

                    {tab === "products" && live && sess && <AdminSellerProducts key={sess.token.slice(-12)} token={sess.token} adminToken={token} gstin={target.gstin} say={say} />}

                    {tab === "add" && (done ? (
                        <section className="mx-auto mt-6 max-w-md rounded-2xl border bg-white p-6 text-center" style={{ borderColor: C.hair }}>
                            <CheckCircle2 className="mx-auto h-10 w-10" style={{ color: "#047857" }} />
                            <h2 className="mt-3 text-[17px] font-extrabold" style={{ color: C.ink }}>{live ? "Listing is live" : "Saved for this business"}</h2>
                            <p className="mt-1 text-[13px] font-medium" style={{ color: C.muted }}>{done.card?.name}{done.card?.meta ? ` · ${done.card.meta}` : ""}</p>
                            <p className="mt-2 text-[12.5px]" style={{ color: C.muted }}>{done.message}</p>
                            <div className="mt-5 flex flex-col gap-2">
                                <button onClick={() => { setDone(null); setWizKey((k) => k + 1); }} className="min-h-11 rounded-xl text-[13px] font-bold text-white" style={{ background: C.primary }}>Add another product</button>
                                <button onClick={() => setTab(live ? "products" : "waiting")} className="min-h-11 rounded-xl border text-[13px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>{live ? "View products" : "View waiting list"}</button>
                            </div>
                        </section>
                    ) : (
                        <div className="adm-embed mt-3">
                            <div className="gl"><div className="gs"><div className="app hb">
                                <Wizard key={`${wizKey}-${target.gstin}-${live}`} token={live ? sess?.token : token} say={say}
                                    onExit={() => setTab(live ? "products" : "waiting")}
                                    onNeedOnboarding={() => say("This seller has not finished setup.")}
                                    onNeedLogin={() => say("Session expired. Load the seller again.")}
                                    submitFn={live ? null : (payload) => stageListing(token, target.gstin, payload)}
                                    onSubmitted={onListed} />
                            </div></div></div>
                        </div>
                    ))}

                    {tab === "bulk" && (
                        <div className="adm-embed mt-3">
                            <AdminBulkListings key={`${target.gstin}-${live}`} token={token} sellerToken={sess?.token} live={live} gstin={target.gstin}
                                say={say} onChanged={refresh} onExit={() => setTab(live ? "products" : "waiting")} />
                        </div>
                    )}

                    {tab === "waiting" && <AdminStagedList token={token} gstin={target.gstin} live={live} say={say} onChanged={refresh} />}
                </>
            )}

            <div role="status" aria-live="polite" className={`pointer-events-none fixed bottom-20 left-1/2 z-[70] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg transition-opacity ${toast ? "opacity-100" : "opacity-0"}`}>{toast}</div>
        </main>
    );
}