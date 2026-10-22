import { useEffect, useRef, useState } from "react";
import { X, Loader2, Check } from "lucide-react";
import { lookupSalesCustomer, addSalesCustomer } from "../../utils/salesApi.js";

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PHONE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanPhone = (v) => { let d = String(v).replace(/\D/g, ""); if (d.length > 10 && d.startsWith("91")) d = d.slice(2, 12); return d; };
const IDLE = { state: "idle", data: null, error: "" };

export default function SalesAddCustomerSheet({ token, onClose, onAdded }) {
    const [gstin, setGstin] = useState("");
    const [look, setLook] = useState(IDLE);       // idle | checking | ok | error
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [touched, setTouched] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const saving = useRef(false);
    const seq = useRef(0);

    useEffect(() => {
        const k = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", k);
        return () => document.removeEventListener("keydown", k);
    }, [onClose]);

    const shapeOk = GSTIN_RE.test(gstin);

    // Check the GST number automatically once it is complete.
    useEffect(() => {
        const my = ++seq.current;
        if (!shapeOk) { setLook(IDLE); return; }
        setLook({ state: "checking", data: null, error: "" });
        (async () => {
            let r;
            try { r = await lookupSalesCustomer(token, gstin); } catch { r = { success: false, message: "Couldn't check this GST number." }; }
            if (my !== seq.current) return;
            if (!r.success) return setLook({ state: "error", data: null, error: r.message || "Couldn't check this GST number." });
            if (r.state === "invalid" || r.state === "self") return setLook({ state: "error", data: null, error: r.message || "This GST number can't be used." });
            if (r.existing) return setLook({ state: "error", data: null, error: r.existingMine ? "You've already added this customer." : "This business is already in your company's customer list." });
            setLook({ state: "ok", data: r, error: "" });
        })();
    }, [gstin, shapeOk, token]);

    const phoneFilled = !!phone.trim(), emailFilled = !!email.trim();
    const phoneBad = phoneFilled && !PHONE_RE.test(cleanPhone(phone));
    const emailBad = emailFilled && !EMAIL_RE.test(email.trim());
    const contactMissing = !phoneFilled && !emailFilled;
    const ready = look.state === "ok" && !contactMissing && !phoneBad && !emailBad;

    const save = async () => {
        setTouched(true);
        if (!ready || saving.current) return;
        saving.current = true; setBusy(true); setError("");
        let r;
        try { r = await addSalesCustomer(token, { gstin, name: name.trim(), phone: phoneFilled ? cleanPhone(phone) : "", email: email.trim() }); }
        catch { r = { success: false, message: "Couldn't add this customer." }; }
        saving.current = false; setBusy(false);
        if (!r.success) return setError(r.message || "Couldn't add this customer.");
        onAdded(r.message);
    };

    const f = look.data;
    return (
        <div className="gk gk-shade" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="gk-sheet" role="dialog" aria-modal="true" aria-label="Add customer" style={{ maxHeight: "92dvh" }}>
                <div className="gk-sheet-h">
                    <h2>Add customer</h2>
                    <button type="button" className="gk-icbtn" onClick={onClose} aria-label="Close"><X size={18} /></button>
                </div>
                <div className="gk-sheet-b">
                    <form className="gs-form" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
                        <div className="gk-field">
                            <label htmlFor="sc-gst">GST number</label>
                            <input id="sc-gst" className="gk-inp" style={{ textTransform: "uppercase" }} maxLength={15} autoFocus
                                autoCapitalize="characters" spellCheck={false} placeholder="22AAAAA0000A1Z5" value={gstin}
                                onChange={(e) => { setGstin(e.target.value.toUpperCase().replace(/\s/g, "")); setError(""); }} />
                            {gstin.length === 15 && !shapeOk && <span className="gs-err">That doesn't look like a GST number.</span>}
                            {look.state === "checking" && <span className="gs-hint" role="status"><Loader2 size={14} className="gk-spin" style={{ verticalAlign: "-2px" }} /> Checking GST number…</span>}
                            {look.state === "error" && <span className="gs-err" role="alert">{look.error}</span>}
                        </div>

                        {look.state === "ok" && f && (
                            <div className="gs-found">
                                <b><Check size={15} style={{ verticalAlign: "-2px" }} /> {f.name}</b>
                                <small>{[f.location, f.state === "registered" ? "On BBM" : "Not on BBM yet"].filter(Boolean).join(" · ")}</small>
                            </div>
                        )}

                        <div className="gk-field">
                            <label htmlFor="sc-name">Contact name <span className="gs-hint">(optional)</span></label>
                            <input id="sc-name" className="gk-inp" maxLength={80} autoComplete="off" placeholder="Person you deal with" value={name} onChange={(e) => setName(e.target.value)} />
                        </div>

                        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
                            <div className="gk-field">
                                <label htmlFor="sc-phone">Mobile number</label>
                                <input id="sc-phone" className="gk-inp" inputMode="tel" autoComplete="off" placeholder="10-digit mobile number" value={phone}
                                    onChange={(e) => setPhone(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={phoneBad || undefined} />
                                {phoneBad && <span className="gs-err">Enter a valid 10-digit mobile number.</span>}
                            </div>
                            <div className="gk-field">
                                <label htmlFor="sc-email">Email</label>
                                <input id="sc-email" className="gk-inp" inputMode="email" autoComplete="off" placeholder="name@company.com" value={email}
                                    onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={emailBad || undefined} />
                                {emailBad && <span className="gs-err">Enter a valid email address.</span>}
                            </div>
                        </div>
                        {contactMissing
                            ? <span className={touched ? "gs-err" : "gs-hint"} role={touched ? "alert" : undefined}>Add at least one: a mobile number or an email.</span>
                            : null}

                        {error && <p className="gs-err" role="alert">{error}</p>}
                        <button type="submit" className="gk-btn go blk" disabled={!ready || busy}>
                            {busy ? <><Loader2 size={18} className="gk-spin" />Adding…</> : "Add customer"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}