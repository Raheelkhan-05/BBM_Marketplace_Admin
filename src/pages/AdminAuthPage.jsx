// pages/AdminAuthPage.jsx — admin app's only auth page
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, Mail, Phone, ShieldAlert } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { requestAdminOtp, verifyAdminOtp } from "../utils/api.js";

const PHONE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 6;

function detectChannel(raw) {
    if (!raw) return null;
    if (PHONE_RE.test(raw)) return "phone";
    if (EMAIL_RE.test(raw)) return "email";
    return null;
}
function detectMode(raw) {
    if (!raw) return null;
    return /[a-zA-Z@]/.test(raw) ? "email" : "phone";
}

export default function AdminAuthPage() {
    const [step, setStep] = useState("identifier"); // "identifier" | "otp"
    const [identifier, setIdentifier] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const { setAuthSession } = useAuth();
    const navigate = useNavigate();

    const withLoading = useCallback(async (fn) => {
        setError(null);
        setLoading(true);
        try { return await fn(); } finally { setLoading(false); }
    }, []);

    const handleIdentifierSubmit = (value) =>
        withLoading(async () => {
            const res = await requestAdminOtp(value);
            if (!res.success) return setError(res.message || "Couldn't send the code.");
            setIdentifier(value);
            setStep("otp");
        });

    const handleOtpVerify = (code) =>
        withLoading(async () => {
            const res = await verifyAdminOtp(identifier, code);
            if (!res.success) return setError(res.message || "That code didn't match.");
            await setAuthSession?.(res.token);
            navigate("/listings");
        });

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
            <motion.div
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 shadow-xl"
            >
                <img src="/Logo.png" alt="BBM" className="h-7 w-auto" />
                <h1 className="mt-4 text-[20px] font-bold text-slate-900">Admin sign in</h1>
                <p className="mt-1 text-[13px] font-medium text-slate-500">
                    Restricted access — sign in with an authorized admin phone number or email.
                </p>

                <AnimatePresence mode="wait">
                    {step === "identifier" ? (
                        <IdentifierStep key="id" onSubmit={handleIdentifierSubmit} loading={loading} error={error} />
                    ) : (
                        <OtpStep key="otp" identifier={identifier} onVerify={handleOtpVerify} onBack={() => setStep("identifier")} loading={loading} error={error} />
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
}

function IdentifierStep({ onSubmit, loading, error }) {
    const [value, setValue] = useState("");
    const mode = detectMode(value);
    const valid = detectChannel(value) !== null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!valid || loading) return;
        onSubmit(value);
    };

    return (
        <motion.form initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onSubmit={handleSubmit} className="mt-6">
            <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Phone or email</label>
            <div className="mt-1.5 flex items-center overflow-hidden rounded-lg border-2 border-slate-200 focus-within:border-[#047084]">
                <span className="flex items-center gap-1.5 border-r border-slate-100 bg-slate-50 px-3 py-3 text-[13px] font-bold text-slate-500">
                    {mode === "phone" ? <><Phone className="h-3.5 w-3.5" />+91</> : <Mail className="h-3.5 w-3.5" />}
                </span>
                <input
                    autoFocus value={value} onChange={(e) => setValue(e.target.value)} disabled={loading}
                    placeholder="98765 43210 or admin@bbm.business"
                    className="w-full bg-transparent px-3 py-3 text-[13.5px] font-semibold outline-none"
                />
            </div>

            {error && (
                <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
                </p>
            )}

            <button
                type="submit" disabled={!valid || loading}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#047084] py-3 text-[13.5px] font-bold text-white disabled:opacity-40"
            >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Send code <ArrowRight className="h-4 w-4" /></>}
            </button>
        </motion.form>
    );
}

function OtpStep({ identifier, onVerify, onBack, loading, error }) {
    const [code, setCode] = useState("");

    const handleSubmit = (e) => {
        e.preventDefault();
        if (code.length !== OTP_LENGTH || loading) return;
        onVerify(code);
    };

    return (
        <motion.form initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onSubmit={handleSubmit} className="mt-6">
            <p className="text-[12.5px] font-medium text-slate-500">
                Code sent to {identifier}. <button type="button" onClick={onBack} className="font-bold text-[#047084]">Edit</button>
            </p>
            <input
                autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))}
                inputMode="numeric" placeholder="6-digit code"
                className="mt-3 w-full rounded-lg border-2 border-slate-200 px-3.5 py-3 text-center text-[18px] font-bold tracking-[0.3em] outline-none focus:border-[#047084]"
            />
            {error && (
                <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
                </p>
            )}
            <button
                type="submit" disabled={code.length !== OTP_LENGTH || loading}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#047084] py-3 text-[13.5px] font-bold text-white disabled:opacity-40"
            >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & sign in"}
            </button>
        </motion.form>
    );
}