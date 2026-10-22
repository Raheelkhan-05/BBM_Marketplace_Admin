// Add customers by GST number, one at a time or in bulk.
//   registered on BBM -> "Add customer"; not on BBM -> "Add & invite" (saved as Invited, then the invite is shared).
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Check, Upload, Loader2, Send, UserPlus, Clock } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { lookupCustomer, addCustomer, bulkAddCustomers, grantCredit } from "../../utils/sellerCustomersApi.js";
import "./customers.css";

const GST_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g;
const MAX_BULK = 100;
const PILL = {
    added: ["ok", "Added"], invited: ["warn", "Not on BBM · invite"], exists: ["mute", "Already a customer"],
    invalid: ["bad", "Invalid"], self: ["bad", "Your own GST"], error: ["bad", "Failed"],
};

export default function CustomerAddModal({ onClose, onChanged, onInvite, initialTab = "single" }) {
    const { token } = useAuth();
    const [tab, setTab] = useState(initialTab);

    // single
    const [gstin, setGstin] = useState("");
    const [lk, setLk] = useState({ loading: false, data: null, err: "" });
    const [busy, setBusy] = useState(false);
    const [limit, setLimit] = useState(""); // optional credit limit (registered customers only)
    const [err, setErr] = useState("");
    const seq = useRef(0);

    // bulk
    const [text, setText] = useState("");
    const [results, setResults] = useState(null);
    const [summary, setSummary] = useState(null);
    const fileRef = useRef(null);

    const closeRef = useRef();
    closeRef.current = () => { if (!busy) onClose?.(); };

    useEffect(() => {
        const root = document.documentElement;
        const sw = window.innerWidth - root.clientWidth;
        const { style } = document.body;
        const po = style.overflow, pp = style.paddingRight;
        style.overflow = "hidden";
        if (sw > 0) style.paddingRight = `${sw}px`;
        try { window.lenis?.stop?.(); } catch { /* ignore */ }
        const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
        document.addEventListener("keydown", onKey);
        return () => {
            style.overflow = po; style.paddingRight = pp;
            try { window.lenis?.start?.(); } catch { /* ignore */ }
            document.removeEventListener("keydown", onKey);
        };
    }, []);

    // auto-check as soon as 15 characters are typed
    useEffect(() => {
        setErr("");
        setLimit("");
        if (gstin.length !== 15) { seq.current += 1; setLk({ loading: false, data: null, err: "" }); return undefined; }
        const my = ++seq.current;
        const ctl = new AbortController();
        setLk({ loading: true, data: null, err: "" });
        lookupCustomer(token, gstin, ctl.signal).then((res) => {
            if (my !== seq.current) return;
            if (!res.success) setLk({ loading: false, data: null, err: res.message || "Couldn't check this GST number." });
            else setLk({ loading: false, data: res, err: "" });
        }).catch(() => { });
        return () => ctl.abort();
    }, [gstin, token]);

    const d = lk.data;
    const problem = lk.err || (d && (d.state === "invalid" || d.state === "self") ? d.message : "");
    const canAdd = !!d && !d.existing && (d.state === "registered" || d.state === "unregistered");

    const addSingle = async () => {
        if (busy || !canAdd) return;
        const lim = Number(limit);
        if (limit !== "" && !(lim > 0 && lim <= 1e9)) return setErr("Enter a valid credit limit, or leave it empty.");
        setBusy(true); setErr("");
        const res = await addCustomer(token, gstin);
        if (!res.success) { setBusy(false); return setErr(res.message || "Couldn't add this customer."); }

        let message = res.message;
        // Registered customer + a limit typed in => give credit in the same step.
        if (res.result === "added" && limit !== "" && res.userId) {
            const g = await grantCredit(token, res.userId, lim);
            message = g.success
                ? `${res.name} added with ₹${lim.toLocaleString("en-IN")} credit.`
                : `${res.name} added, but credit wasn't set: ${g.message || "please try again from their card."}`;
        }
        setBusy(false);
        onChanged?.(message);
        if (res.result === "invited") await onInvite?.(res.customer, res.name);
        onClose?.();
    };

    const found = useMemo(() => [...new Set(text.toUpperCase().match(GST_RE) || [])], [text]);
    const tooMany = found.length > MAX_BULK;

    const readFile = (file) => {
        if (!file) return;
        const r = new FileReader();
        r.onload = () => setText((t) => `${t}${t && !t.endsWith("\n") ? "\n" : ""}${String(r.result || "")}`);
        r.readAsText(file);
    };

    const submitBulk = async () => {
        if (busy || !found.length || tooMany) return;
        setBusy(true); setErr("");
        const res = await bulkAddCustomers(token, found);
        setBusy(false);
        if (!res.success) return setErr(res.message || "Couldn't add these customers.");
        setResults(res.results || []); setSummary(res.summary || null);
        onChanged?.();
    };

    return createPortal(
        <div className="gcu" role="presentation">
            <div className="gcu-ov" onMouseDown={(e) => { if (e.target === e.currentTarget) closeRef.current(); }}>
                <div className="gcu-sheet" role="dialog" aria-modal="true" aria-label="Add customers">
                    <div className="gcu-hd">
                        <div className="gcu-ht"><h3>Add customers</h3><p>Customers who order from you are added automatically.</p></div>
                        <button type="button" className="gcu-ib" aria-label="Close" onClick={() => closeRef.current()}><X size={18} /></button>
                    </div>

                    {!results && (
                        <div className="gcu-tabs" role="tablist">
                            <button type="button" role="tab" aria-selected={tab === "single"} onClick={() => setTab("single")}>By GST number</button>
                            <button type="button" role="tab" aria-selected={tab === "bulk"} onClick={() => setTab("bulk")}>Bulk add</button>
                        </div>
                    )}

                    <div className="gcu-bd" data-lenis-prevent>
                        {tab === "single" && (<>
                            <div className="gcu-f">
                                <label htmlFor="gcu-g">GST number</label>
                                <div className="gcu-inp">
                                    <input id="gcu-g" value={gstin} maxLength={15} placeholder="e.g. 24ABCDE1234F1Z5" autoComplete="off" autoCapitalize="characters"
                                        onChange={(e) => setGstin(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ""))} />
                                    {lk.loading && <Loader2 size={16} className="gcu-spin" />}
                                </div>
                                <p className="gcu-n">We check whether this business is already on BBM.</p>
                            </div>

                            {problem && <p className="gcu-err" role="alert">{problem}</p>}

                            {d && (d.state === "registered" || d.state === "unregistered") && (
                                <div className="gcu-card">
                                    <div className="gcu-who">
                                        <span className="gcu-av">{(d.name || "?")[0].toUpperCase()}</span>
                                        <div><b>{d.name}</b><small>{[d.gstin, d.location].filter(Boolean).join(" · ")}</small></div>
                                    </div>
                                    {d.existing ? <span className="gcu-pill mute"><Check size={13} />Already in your customers</span>
                                        : d.state === "registered" ? <span className="gcu-pill ok"><Check size={13} />On BBM Marketplace</span>
                                            : <span className="gcu-pill warn"><Clock size={13} />Not on BBM yet</span>}
                                    {!d.existing && d.state === "unregistered" && (
                                        <p className="gcu-n" style={{ margin: 0 }}>We'll save them as invited and open a message you can send them to join BBM.</p>
                                    )}
                                    {!d.existing && d.state === "registered" && (
                                        <div className="gcu-f">
                                            <label htmlFor="gcu-lim">Credit limit per month (optional)</label>
                                            <div className="gcu-inp">
                                                <span className="gcu-pre">₹</span>
                                                <input id="gcu-lim" type="number" inputMode="decimal" min="1" value={limit} placeholder="e.g. 50000"
                                                    onChange={(e) => setLimit(e.target.value)} />
                                            </div>
                                            <p className="gcu-n">Leave empty to add them without credit. You can set it later from their card.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                            {err && <p className="gcu-err" role="alert">{err}</p>}
                        </>)}

                        {tab === "bulk" && !results && (<>
                            <div className="gcu-f">
                                <label htmlFor="gcu-b">Paste GST numbers</label>
                                <textarea id="gcu-b" rows={6} value={text} placeholder={"One per line, or separated by commas.\n24ABCDE1234F1Z5\n27AAAAA0000A1Z5"} onChange={(e) => setText(e.target.value)} />
                                <div className="gcu-row">
                                    <button type="button" className="gcu-btn" onClick={() => fileRef.current?.click()}><Upload size={15} />Upload CSV / TXT</button>
                                    <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ""; }} />
                                    {text && <button type="button" className="gcu-lnk" onClick={() => setText("")}>Clear</button>}
                                </div>
                                <p className={`gcu-n${tooMany ? " bad" : ""}`}>
                                    {found.length ? `${found.length} GST number${found.length === 1 ? "" : "s"} found${tooMany ? ` · the limit is ${MAX_BULK} at a time` : ""}.` : "Any valid GST numbers in the text or file are picked up automatically."}
                                </p>
                            </div>
                            {err && <p className="gcu-err" role="alert">{err}</p>}
                        </>)}

                        {results && (<>
                            {summary && (
                                <div className="gcu-sum">
                                    <div><b>{summary.added}</b><span>Added</span></div>
                                    <div><b>{summary.invited}</b><span>To invite</span></div>
                                    <div><b>{summary.exists}</b><span>Already yours</span></div>
                                    <div><b>{summary.failed}</b><span>Failed</span></div>
                                </div>
                            )}
                            <div className="gcu-list">
                                {results.map((r) => {
                                    const [tone, label] = PILL[r.result] || PILL.error;
                                    return (
                                        <div className="gcu-li" key={r.gstin}>
                                            <div className="gcu-lt"><b>{r.name || r.gstin}</b><small>{r.name ? r.gstin : r.message}</small></div>
                                            {r.result === "invited" && r.customer?.id
                                                ? <button type="button" className="gcu-btn sm go" onClick={() => onInvite?.(r.customer, r.name)}><Send size={13} />Invite</button>
                                                : <span className={`gcu-pill ${tone}`}>{label}</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        </>)}
                    </div>

                    <div className="gcu-ft">
                        {results ? (
                            <button type="button" className="gcu-btn go blk" onClick={() => onClose?.()}>Done</button>
                        ) : tab === "single" ? (
                            <button type="button" className="gcu-btn go blk" disabled={busy || !canAdd} onClick={addSingle}>
                                {busy ? <Loader2 size={16} className="gcu-spin" /> : d?.state === "unregistered" ? <Send size={16} /> : <UserPlus size={16} />}
                                {busy ? "Saving…" : d?.state === "unregistered" ? "Add & invite" : limit ? "Add & set credit" : "Add customer"}
                            </button>
                        ) : (
                            <button type="button" className="gcu-btn go blk" disabled={busy || !found.length || tooMany} onClick={submitBulk}>
                                {busy ? <Loader2 size={16} className="gcu-spin" /> : <UserPlus size={16} />}
                                {busy ? "Adding…" : `Add ${found.length || ""} customer${found.length === 1 ? "" : "s"}`}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}