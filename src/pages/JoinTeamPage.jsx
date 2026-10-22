// pages/JoinTeamPage.jsx — route: /join-team?token=...
// The invite fixes the contact. The person verifies it with an OTP, enters a name and is added to the team.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, Lock, Users, ShieldCheck, AlertCircle, Mail, Phone, RotateCw } from "lucide-react";

import { useAuth } from "../context/AuthContext.jsx";
import { AUTH_THEME_CSS, AuthHeader, useAuthTheme } from "../components/authTheme.jsx";
import { fetchInviteInfo, requestInviteOtp, acceptTeamInvite } from "../utils/teamApi.js";

const RESEND_SECONDS = 30;

const PAGE_CSS = `
.ba .jt{max-width:560px;margin:0 auto;padding:32px 20px 64px}
.ba .jt-card{background:var(--s);border:1px solid var(--line);border-radius:28px;padding:24px;box-shadow:0 30px 70px -34px #000,0 0 0 1px color-mix(in srgb,var(--bl) 12%,transparent)}
.ba .jt-head{display:flex;flex-direction:column;align-items:center;text-align:center;margin-bottom:18px}
.ba .jt-pi{width:56px;height:56px;border-radius:18px;background:var(--go);color:#06161C;display:grid;place-items:center;margin-bottom:14px}
.ba .jt-head h1{font:900 1.65rem/1.15 var(--f);letter-spacing:-.025em}
.ba .jt-head p{color:var(--mute);margin-top:8px;font-size:.95rem;line-height:1.45}
.ba .jt-head p b{color:var(--ink)}
.ba .jt-note{display:flex;gap:10px;padding:14px;border-radius:18px;background:var(--s2);border:1px solid var(--line);font-size:.9rem;line-height:1.45;color:var(--mute);margin-bottom:18px}
.ba .jt-note .ic{flex:none;color:var(--gt);margin-top:2px}
.ba .jt-note b{color:var(--ink)}
.ba .jt-lab{display:block;font-weight:800;font-size:.92rem;margin-bottom:8px}
.ba .jt-locked{display:flex;align-items:center;gap:10px;min-height:56px;padding:0 16px;border:1.5px solid var(--line);border-radius:18px;background:var(--s2);font-weight:700;margin-bottom:16px}
.ba .jt-locked .ic{color:var(--mute);flex:none}
.ba .jt-locked span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ba .jt-locked em{margin-left:auto;font-style:normal;font-size:.78rem;font-weight:800;color:var(--mute);flex:none}
.ba .jt-in{width:100%;height:56px;border:1.5px solid var(--line);border-radius:18px;background:var(--s2);padding:0 16px;font:600 1.02rem var(--f);color:var(--ink);outline:0;transition:border-color .2s,box-shadow .2s;margin-bottom:16px}
.ba .jt-in:focus{border-color:var(--bl);box-shadow:0 0 0 5px color-mix(in srgb,var(--bl) 22%,transparent)}
.ba .jt-in.code{text-align:center;font:900 1.6rem var(--f);letter-spacing:.5em;padding-left:.5em}
.ba .jt-err{margin:-6px 2px 14px;font-size:.88rem;font-weight:700;color:var(--red)}
.ba .jt-row{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:0 4px;margin-top:12px;color:var(--mute);font-size:.85rem}
.ba .jt-lnk{background:none;border:0;color:var(--bt);font:700 .92rem var(--f);padding:10px 4px;text-decoration:underline;cursor:pointer}
.ba .jt-lnk:disabled{color:var(--mute);text-decoration:none;cursor:default}
.ba .jt-center{min-height:50vh;display:grid;place-items:center;color:var(--mute)}
@media(max-width:560px){.ba .jt{padding:20px 14px 48px}}
`;

const PHONE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanPhone = (v) => {
    let d = String(v).replace(/\D/g, "");
    if (d.length > 10 && d.startsWith("91")) d = d.slice(2, 12);
    return d;
};

export default function JoinTeamPage() {
    const [sp] = useSearchParams();
    const inviteToken = sp.get("token") || "";
    const navigate = useNavigate();
    const { setAuthSession } = useAuth();
    const { theme, toggleTheme } = useAuthTheme();

    const [stage, setStage] = useState("loading"); // loading | invalid | ready | otp | joining
    const [info, setInfo] = useState(null);
    const [fatal, setFatal] = useState("");
    const [name, setName] = useState("");
    const [extra, setExtra] = useState("");          // the required second contact, as typed
    const [code, setCode] = useState("");
    const [extraCode, setExtraCode] = useState("");
    const [extraSent, setExtraSent] = useState(null); // { channel, maskedValue } from the server
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const sending = useRef(false);

    useEffect(() => {
        let live = true;
        (async () => {
            if (!inviteToken) { setFatal("This invite link isn't valid."); setStage("invalid"); return; }
            const res = await fetchInviteInfo(inviteToken);
            if (!live) return;
            if (!res.success) { setFatal(res.message || "This invite link isn't valid."); setStage("invalid"); return; }
            setInfo(res);
            setStage("ready");
        })();
        return () => { live = false; };
    }, [inviteToken]);

    useEffect(() => {
        if (stage !== "otp" || seconds <= 0) return undefined;
        const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
        return () => clearTimeout(id);
    }, [stage, seconds]);

    const invitedByEmail = info?.channel === "email";
    const isSales = info?.role === "salesperson";

    const extraKind = invitedByEmail ? "mobile number" : "email address";
    const nameOk = name.trim().length >= 2;
    const extraOk = invitedByEmail ? PHONE_RE.test(cleanPhone(extra)) : EMAIL_RE.test(extra.trim());

    const sendCode = async () => {
        if (sending.current) return;
        if (!nameOk) { setError("Enter your full name."); return; }
        if (!extraOk) { setError(`Enter a valid ${extraKind}.`); return; }
        sending.current = true; setBusy(true); setError("");
        const value = invitedByEmail ? cleanPhone(extra) : extra.trim().toLowerCase();
        const res = await requestInviteOtp(inviteToken, value);
        sending.current = false; setBusy(false);
        if (!res.success) { setError(res.message || "Couldn't send the codes. Try again."); return; }
        setCode(""); setExtraCode(""); setExtraSent(res.extra || null);
        setSeconds(RESEND_SECONDS); setStage("otp");
    };

    const codesOk = code.length === 6 && extraCode.length === 6;

    const join = async () => {
        if (busy || !codesOk) return;
        setBusy(true); setError("");
        const value = invitedByEmail ? cleanPhone(extra) : extra.trim().toLowerCase();
        const res = await acceptTeamInvite(inviteToken, { otp: code, name: name.trim(), extraValue: value, extraOtp: extraCode });
        if (!res.success) { setBusy(false); setError(res.message || "Couldn't join the team. Try again."); return; }

        setStage("joining");
        try {
            await setAuthSession?.(res.token);
            navigate(res.role === "salesperson" ? "/sales/dashboard" : "/home", { replace: true });
        } catch {
            setBusy(false);
            setStage("invalid");
            setFatal("You've joined the team, but we couldn't sign you in automatically. Please sign in with the same number or email.");
        }
    };

    const channelIcon = invitedByEmail ? <Mail className="ic" /> : <Phone className="ic" />;

    return (
        <div className="ba" data-theme={theme}>
            <style>{AUTH_THEME_CSS + PAGE_CSS}</style>
            <AuthHeader theme={theme} onToggleTheme={toggleTheme} onBack={() => navigate("/")} />

            <AnimatePresence mode="wait" initial={false}>
                {stage === "loading" || stage === "joining" ? (
                    <motion.div key="busy" className="jt-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div style={{ textAlign: "center" }}>
                            <Loader2 className="ic spin" />
                            {stage === "joining" && <p style={{ marginTop: 10, fontWeight: 700 }}>Joining {info?.companyName}…</p>}
                        </div>
                    </motion.div>
                ) : stage === "invalid" ? (
                    <motion.main key="invalid" className="jt" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                        <div className="jt-card">
                            <div className="jt-head">
                                <span className="jt-pi"><AlertCircle className="ic" style={{ width: 26, height: 26 }} /></span>
                                <h1>We can't use this link</h1>
                                <p>{fatal}</p>
                            </div>
                            <button type="button" className="bt go blk" onClick={() => navigate("/login")}>
                                Go to sign in <ArrowRight className="ic" />
                            </button>
                        </div>
                    </motion.main>
                ) : (
                    <motion.main key="card" className="jt" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
                        <div className="jt-card">
                            <div className="jt-head">
                                <span className="jt-pi"><Users className="ic" style={{ width: 26, height: 26 }} /></span>
                                <h1>Join {info.companyName}'s team</h1>
                                <p>You've been invited to join <b>{info.companyName}</b> on BBM as a <b>{isSales ? "salesperson" : "team member"}</b>.</p>

                            </div>

                            <div className="jt-note">
                                <ShieldCheck className="ic" />
                                {isSales ? (
                                    <div><b>You'll get your own sales workspace for {info.companyName}.</b> You'll see only the customers
                                        assigned to you or added by you. Marketplace, orders and chats are not part of this role.</div>
                                ) : (
                                    <div><b>You'll be added to this company's team.</b> You'll work inside the company's account, with the same
                                        access as the company: orders, chats, enquiries and products. Your team admin can see the actions you take.</div>
                                )}
                            </div>

                            {stage === "ready" ? (
                                <>
                                    <span className="jt-lab">Invited contact</span>
                                    <div className="jt-locked">
                                        {channelIcon}<span>{info.maskedValue}</span><em><Lock className="ic" style={{ width: 13, height: 13, display: "inline", verticalAlign: "-2px" }} /> Fixed</em>
                                    </div>

                                    <label className="jt-lab" htmlFor="jt-name">Your full name</label>
                                    <input
                                        id="jt-name" className="jt-in" value={name} autoComplete="name" placeholder="e.g. Rohan Mehta"
                                        onChange={(e) => { setName(e.target.value); setError(""); }}
                                    />

                                    <label className="jt-lab" htmlFor="jt-extra">Your {extraKind}</label>
                                    <input
                                        id="jt-extra" className="jt-in" value={extra}
                                        autoComplete={invitedByEmail ? "tel" : "email"}
                                        inputMode={invitedByEmail ? "tel" : "email"}
                                        placeholder={invitedByEmail ? "10-digit mobile number" : "you@company.com"}
                                        onChange={(e) => { setExtra(e.target.value); setError(""); }}
                                        onKeyDown={(e) => { if (e.key === "Enter") sendCode(); }}
                                    />
                                    <p className="jt-row" style={{ margin: "-8px 0 14px", justifyContent: "flex-start", textAlign: "left" }}>
                                        Required, so you can sign in with either your {invitedByEmail ? "email" : "mobile number"} or this {invitedByEmail ? "number" : "email"}. We'll verify both with a code.
                                    </p>

                                    {error && <p className="jt-err" role="alert">{error}</p>}
                                    <button type="button" className="bt go blk" disabled={busy || !nameOk || !extraOk} onClick={sendCode}>
                                        {busy ? <><Loader2 className="ic spin" />Sending codes…</> : <>Send verification codes<ArrowRight className="ic" /></>}
                                    </button>
                                    <p className="jt-row">You must sign up with the invited {invitedByEmail ? "email" : "mobile number"} above.</p>
                                </>
                            ) : (
                                <>
                                    <label className="jt-lab" htmlFor="jt-code">
                                        Code sent {invitedByEmail ? "to" : "by SMS to"} {info.maskedValue}
                                    </label>
                                    <input
                                        id="jt-code" className="jt-in code" inputMode="numeric" maxLength={6} autoFocus
                                        autoComplete="one-time-code" placeholder="••••••" value={code} disabled={busy}
                                        onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                                    />

                                    <label className="jt-lab" htmlFor="jt-extra-code">
                                        Code sent {extraSent?.channel === "email" ? "to" : "by SMS to"} {extraSent?.maskedValue}
                                    </label>
                                    <input
                                        id="jt-extra-code" className="jt-in code" inputMode="numeric" maxLength={6}
                                        autoComplete="off" placeholder="••••••" value={extraCode} disabled={busy}
                                        onChange={(e) => { setExtraCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                                        onKeyDown={(e) => { if (e.key === "Enter") join(); }}
                                    />

                                    {error && <p className="jt-err" role="alert">{error}</p>}
                                    <button type="button" className="bt go blk" disabled={busy || !codesOk} onClick={join}>
                                        {busy ? <><Loader2 className="ic spin" />Joining…</> : <>Verify and join team<ArrowRight className="ic" /></>}
                                    </button>
                                    <div className="jt-row">
                                        {seconds > 0 ? <span>Resend in {seconds}s</span> : (
                                            <button type="button" className="jt-lnk" disabled={busy} onClick={sendCode}>
                                                <RotateCw className="ic sm" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} />Resend codes
                                            </button>
                                        )}
                                        <span aria-hidden="true">·</span>
                                        <button type="button" className="jt-lnk" disabled={busy} onClick={() => { setError(""); setStage("ready"); }}>Back</button>
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.main>
                )}
            </AnimatePresence>
        </div>
    );
}