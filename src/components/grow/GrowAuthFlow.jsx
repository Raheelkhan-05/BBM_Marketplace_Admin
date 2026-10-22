// src/components/grow/GrowAuthFlow.jsx
// Sign-up / sign-in inside the GROW page. Same backend calls as AuthPage.jsx, new UI.
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import {
    fetchMe, requestOtp, verifyOtp, completeProfile,
    requestContactOtp, verifyContactOtp, lookupGstin, saveProgress,
} from "../../utils/api.js";
import GstinReportBox from "../GstinReportBox.jsx";
const PHONE = /^[6-9]\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const EMPTY = () => Array(6).fill("");
// Token of a sign-up in progress. It is kept here (not in AuthContext) until the profile is complete,
// so global onboarding guards do not bounce the person to /login mid-way.
const KEY = "grow_signup_token";
const getKept = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const keep = (t) => { try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY); } catch { /* private mode */ } };

// Jump to the top instantly (works with or without Lenis smooth scroll).
export function toTop() {
    try { window.lenis?.scrollTo?.(0, { immediate: true }); } catch { /* noop */ }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}
const mask = (m, v) => (m === "phone" ? `+91 ${v.slice(0, 2)}XXXXXX${v.slice(-2)}` : v.replace(/^(.{2}).*(@.*)$/, "$1•••$2"));

function Otp({ v, set, disabled }) {
    const r = useRef([]);
    useEffect(() => { if (v.every((d) => !d)) r.current[0]?.focus(); }, [v]);
    const ch = (i, x) => {
        const d = x.replace(/\D/g, "").slice(-1), n = [...v]; n[i] = d; set(n);
        if (d && i < 5) r.current[i + 1]?.focus();
    };
    const paste = (e) => {
        const t = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
        if (!t) return; e.preventDefault();
        const n = EMPTY(); t.split("").forEach((c, j) => { n[j] = c; }); set(n); r.current[Math.min(t.length, 5)]?.focus();
    };
    return (
        <div className="otp" role="group" aria-label="6-digit code">
            {v.map((d, i) => (
                <input key={i} ref={(el) => { r.current[i] = el; }} value={d} inputMode="numeric" maxLength={1} disabled={disabled}
                    autoComplete={i ? "off" : "one-time-code"} aria-label={`Digit ${i + 1}`}
                    onChange={(e) => ch(i, e.target.value)} onPaste={paste}
                    onKeyDown={(e) => { if (e.key === "Backspace" && !v[i] && i > 0) r.current[i - 1]?.focus(); }} />
            ))}
        </div>
    );
}

// One "enter value -> send code -> enter code" step. Used for login, mobile and email.
function ContactStep({ kind, lab, ph, note, sendLabel, send, verify, onVerified, say }) {
    const [stage, setStage] = useState("in");
    const [v, setV] = useState("");
    const [code, setCode] = useState(EMPTY);
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    const [cd, setCd] = useState(0);
    const modeOf = (x) => (kind === "login" ? (/[a-zA-Z@]/.test(x) ? "email" : "phone") : kind);
    const mode = modeOf(v);
    const valid = mode === "phone" ? PHONE.test(v) : EMAIL.test(v);

    useEffect(() => { if (cd > 0) { const t = setTimeout(() => setCd((c) => c - 1), 1000); return () => clearTimeout(t); } }, [cd]);
    useEffect(() => { toTop(); }, [stage]);
    useEffect(() => { if (stage === "otp" && code.every(Boolean) && !busy) doVerify(code); }, [code]); // eslint-disable-line

    const change = (raw) => {
        setErr("");
        if (modeOf(raw) === "phone") {
            let d = raw.replace(/\D/g, "");
            d = d.length > 10 && d.startsWith("91") ? d.slice(2, 12) : d.slice(0, 10);
            setV(d);
        } else setV(raw.trim());
    };
    const doSend = async (again) => {
        if (!valid || busy) return; setBusy(true); setErr("");
        let r; try { r = await send(v); } catch { r = { success: false }; }
        setBusy(false);
        if (!r?.success) return setErr(r?.message || "Could not send the code. Try again.");
        setCode(EMPTY()); setCd(30); setStage("otp"); if (again) say("A new code is on its way");
    };
    const doVerify = async (arr = code) => {
        if (busy) return;
        if (arr.join("").length < 6) return setErr("Enter the 6-digit code.");
        setBusy(true); setErr("");
        let r; try { r = await verify(v, arr.join("")); } catch { r = { success: false }; }
        if (!r?.success) { setBusy(false); setCode(EMPTY()); return setErr(r?.message || "That code did not match. Check and try again."); }
        await onVerified(v, r, mode); setBusy(false);
    };

    if (stage === "in") return (
        <>
            <div className="f">
                <label htmlFor="gs-id">{lab}</label>
                <div className="inp">
                    {mode === "phone" && <span className="pre">+91</span>}
                    <input id="gs-id" type={kind === "email" ? "email" : "text"} inputMode={kind === "phone" ? "numeric" : "text"}
                        autoComplete={kind === "login" ? "username" : "off"} autoCapitalize="none" placeholder={ph} value={v} autoFocus
                        onChange={(e) => change(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doSend(); }} />
                </div>
                <p className="err" role="alert">{err}</p>
            </div>
            <button className="sbtn" type="button" disabled={!valid || busy} onClick={() => doSend()}>{busy ? "Sending…" : sendLabel}</button>
            <p className="note">{note}</p>
        </>
    );
    return (
        <>
            <p className="sent">Code sent to <b>{mask(mode, v)}</b></p>
            <Otp v={code} set={(c) => { setErr(""); setCode(c); }} disabled={busy} />
            <p className="err" role="alert">{err}</p>
            <button className="sbtn" type="button" disabled={busy || code.some((d) => !d)} onClick={() => doVerify()}>{busy ? "Verifying…" : "Verify"}</button>
            <p className="note">
                <button className="lnk" type="button" disabled={cd > 0 || busy} onClick={() => doSend(true)}>{cd > 0 ? `Resend in ${cd}s` : "Resend code"}</button>
                {" · "}<button className="lnk" type="button" onClick={() => { setStage("in"); setErr(""); }}>Change</button>
            </p>
        </>
    );
}

function GstStep({ tok, name0, onDone, say }) {
    const [name, setName] = useState(name0 || "");
    const [g, setG] = useState("");
    const [d, setD] = useState(null);
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    const [code, setCode] = useState("");
    useEffect(() => { toTop(); }, [d]);
    const nameOk = name.trim().length >= 2, gOk = GSTIN.test(g);

    const look = async () => {
        if (!nameOk || !gOk || busy) return; setBusy(true); setErr("");
        setBusy(true); setErr(""); setCode("");
        let r; try { r = await lookupGstin(tok, g); } catch { r = { success: false }; }
        setBusy(false);
        if (!r?.success) { setCode(r?.code || ""); return setErr(r?.message || "Could not verify this GSTIN."); }
        setD(r.data);
    };
    const fin = async () => {
        setBusy(true);
        let r;
        try {
            r = await completeProfile(tok, { name: name.trim(), gstin: g, displayName: (d.trade_name || d.legal_name || "").trim(), dispatchSameAsRegistered: true });
        } catch { r = { success: false }; }
        if (!r?.success) {
            setBusy(false);
            if (r?.code === "GSTIN_TAKEN") { setD(null); setCode("GSTIN_TAKEN"); return setErr(r.message); }
            return say(r?.message || "Could not save your details. Try again.");
        }
        await onDone();
    };

    if (d) return (
        <>
            <div className="res"><i>✓</i><div><b>{d.trade_name || d.legal_name}</b><span>GSTIN {d.gstin_status || "active"}{d.state ? ` · ${d.state}` : ""}</span></div></div>
            <p className="sent" style={{ marginBottom: 16 }}>We pulled your registration details from the GST record. You will review them next.</p>
            <button className="sbtn" type="button" disabled={busy} onClick={fin}>{busy ? "Saving…" : "Continue to profile setup"}</button>
            <p className="note"><button className="lnk" type="button" disabled={busy} onClick={() => setD(null)}>Use a different GSTIN</button></p>
        </>
    );
    return (
        <>
            <div className="f">
                <label htmlFor="gs-name">Your full name</label>
                <div className="inp"><input id="gs-name" autoComplete="name" placeholder="e.g. Rohan Mehta" value={name} autoFocus
                    onChange={(e) => setName(e.target.value)} onBlur={() => { if (nameOk) saveProgress(tok, { name: name.trim() }); }} /></div>
            </div>
            <div className="f">
                <label htmlFor="gs-gst">GST number (GSTIN)</label>
                <div className="inp"><input id="gs-gst" maxLength={15} autoCapitalize="characters" autoComplete="off" placeholder="22AAAAA0000A1Z5" value={g}
                    onChange={(e) => { setErr(""); setCode(""); setG(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "")); }}
                    onKeyDown={(e) => { if (e.key === "Enter") look(); }} /></div>
                <p className="err" role="alert">{err || (g.length === 15 && !gOk ? "A GSTIN has 15 characters, like 22AAAAA0000A1Z5." : "")}</p>
                {code === "GSTIN_TAKEN" && GSTIN.test(g) && <GstinReportBox variant="gs" token={tok} gstin={g} />}
            </div>
            <button className="sbtn" type="button" disabled={!nameOk || !gOk || busy} onClick={look}>{busy ? "Checking GST record…" : "Verify GST"}</button>
            <p className="note">We fetch your registration details from the GST record.</p>
        </>
    );
}

export default function GrowAuthFlow({ onAuthed, say }) {
    const { token: ctx, setAuthSession } = useAuth();
    const [step, setStep] = useState(-1); // -1 resolving, 0 sign in, 1 second contact, 2 GST
    const [tok, setTok] = useState(null);
    const [lt, setLt] = useState("phone");
    const [sec, setSec] = useState("email");
    const [chips, setChips] = useState([]);
    const [nm, setNm] = useState("");

    useEffect(() => { toTop(); }, [step]);

    // Decide which step is next from what is already verified.
    const resume = (tk, p, type, ident) => {
        const phoneOK = type === "phone" || !!p.phone_verified, emailOK = type === "email" || !!p.email_verified;
        const c = [];
        if (ident) c.push(mask(type, ident));
        if (p.phone_verified && p.phone && !(ident && type === "phone")) c.push(mask("phone", String(p.phone).replace(/\D/g, "").slice(-10)));
        if (p.email_verified && p.email && !(ident && type === "email")) c.push(mask("email", p.email));
        setTok(tk); setLt(type); setNm(p.name || ""); setChips(c);
        if (!phoneOK) { setSec("phone"); setStep(1); } else if (!emailOK) { setSec("email"); setStep(1); } else setStep(2);
    };

    useEffect(() => { // an unfinished sign-up continues where it stopped
        let live = true;
        (async () => {
            const tk = ctx || getKept();
            if (!tk) return setStep(0);
            let r; try { r = await fetchMe(tk); } catch { /* noop */ }
            if (!live) return;
            if (!r?.success) { keep(null); return setStep(0); }
            if (r.profile.onboarding_step === "done") return onAuthed(tk);
            resume(tk, r.profile, r.profile.email ? "email" : "phone");
        })();
        return () => { live = false; };
    }, []); // eslint-disable-line

    const onLogin = async (ident, res, mode) => {
        if (!res.isNewUser) { await setAuthSession?.(res.token); return onAuthed(res.token); } // fully set-up user goes straight on
        keep(res.token); // new user: hold the token locally until sign-up completes
        say(`${mode === "phone" ? "Mobile" : "Email"} verified`);
        let r; try { r = await fetchMe(res.token); } catch { /* noop */ }
        resume(res.token, r?.success ? r.profile : {}, mode, ident);
    };
    const onSecond = (v) => { say(`${sec === "phone" ? "Mobile" : "Email"} verified`); setChips((c) => [...c, mask(sec, v)]); setStep(2); };
    const onDone = async () => { await setAuthSession?.(tok); keep(null); onAuthed(tok); };

    const labels = lt === "email" ? ["Email", "Mobile", "GST"] : ["Mobile", "Email", "GST"];
    return (
        <section className="scr">
            <p className="kick">User Authentication</p>
            <h2>Verify your business</h2>
            <p className="sub">Three quick checks keep GROW trusted for buyers and sellers.</p>
            <ol className="stp" aria-label="Verification progress">
                {labels.map((l, i) => <li key={l} className={i < step ? "done" : i === step ? "cur" : ""}><b>{i < step ? "✓" : i + 1}</b>{l}</li>)}
            </ol>
            {chips.length > 0 && <div className="vsum">{chips.map((c) => <span key={c}>✓ {c}</span>)}</div>}
            <div className="pn" key={step}>
                {step === -1 && <p className="sub">Loading…</p>}
                {step === 0 && (
                    <ContactStep kind="login" lab="Mobile number or email" ph="98765 43210 or you@company.com" sendLabel="Send OTP"
                        note="We will send you a one-time code." say={say}
                        send={(v) => requestOtp(v)} verify={(v, c) => verifyOtp(v, c)} onVerified={onLogin} />
                )}
                {step === 1 && (
                    <ContactStep kind={sec} lab={sec === "phone" ? "Mobile number" : "Work email"} ph={sec === "phone" ? "98765 43210" : "you@company.com"}
                        sendLabel={sec === "phone" ? "Send OTP" : "Send code"} note={sec === "phone" ? "We will text you a one-time code." : "We will email you a one-time code."} say={say}
                        send={(v) => requestContactOtp(tok, sec, v)} verify={(v, c) => verifyContactOtp(tok, sec, v, c)} onVerified={onSecond} />
                )}
                {step === 2 && <GstStep tok={tok} name0={nm} onDone={onDone} say={say} />}
            </div>
        </section>
    );
}