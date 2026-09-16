// pages/AuthPage.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, Loader2, Mail, Phone, CheckCircle2, Pencil,
  Building2, ShieldCheck, ArrowLeft,
} from "lucide-react";

import TrustPanel from "../components/auth/TrustPanel.jsx";
import TrustBadgesFooter from "../components/auth/TrustBadgesFooter.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import SmartLink from "../components/SmartLink.jsx";
import {
  requestOtp, verifyOtp, completeProfile,
  requestContactOtp, verifyContactOtp, lookupGstin,
  fetchMe, saveProgress,
} from "../utils/api.js";

const PHONE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;
const STEPS = ["identifier", "otp", "onboarding", "done"];

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
function normalizePhonePaste(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) return digits.slice(2, 12);
  return digits.slice(0, 10);
}
const GSTIN_FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
function isValidGstinShape(v) {
  return v.length === 15 && GSTIN_FORMAT.test(v);
}


export default function AuthPage() {
  const [step, setStep] = useState("identifier");
  const [identifier, setIdentifier] = useState("");
  const [token, setToken] = useState(null);
  const [loginType, setLoginType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { setAuthSession, refreshProfile, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isNewUser, setIsNewUser] = useState(null);

  const redirectTo = location.state?.from || "/catalog";

  const handleBack = () => {
    if (step === "identifier") {
      // React Router v6 stamps history.state.idx = 0 on the entry point of
      // the app's history stack — if that's us, navigate(-1) would leave
      // the app entirely (e.g. land on about:blank) instead of going back
      // to a real previous page.
      if (window.history.state?.idx === 0) {
        navigate("/");
      } else {
        navigate(-1);
      }
    } else if (step === "otp") {
      setStep("identifier");
    }
    // no back action from "onboarding" — user is already authenticated
  };

  const withLoading = useCallback(async (fn) => {
    setError(null);
    setLoading(true);
    try {
      return await fn();
    } finally {
      setLoading(false);
    }
  }, []);

  const handleIdentifierSubmit = (value) =>
    withLoading(async () => {
      const res = await requestOtp(value);
      if (!res.success) return setError(res.message || "Couldn't send the code. Try again.");
      setIdentifier(value);
      setLoginType(res.channel || detectChannel(value));
      setStep("otp");
    });

  const handleOtpVerify = (code) =>
    withLoading(async () => {
      const res = await verifyOtp(identifier, code);
      if (!res.success) return setError(res.message || "That code didn't match. Check and try again.");
      setToken(res.token);
      // This is the fix: session must be set in the { access_token } shape
      // AuthContext expects, or isLoggedIn (and every protected route) stays
      // false even though the user is fully authenticated.
      await setAuthSession?.(res.token);
      setIsNewUser(res.isNewUser);
      // setStep(res.isNewUser ? "onboarding" : "done");
      if (res.isNewUser) {
        setStep("onboarding");
      } else {
        navigate(redirectTo);
      }
    });

  // FIX: this used to be "fire and forget" — requestOtp(identifier) with no
  // await, no loading state, and no error surfaced. If the resend call
  // failed (rate limit, network blip, provider hiccup), the OtpPanel timer
  // still restarted as if it worked, so the user just saw a silently
  // "broken" resend button with no code ever arriving. Now it goes through
  // withLoading (so serverError renders in OtpPanel) and returns whether it
  // actually succeeded so the panel only resets its countdown on success.
  const handleResend = () =>
    withLoading(async () => {
      const res = await requestOtp(identifier);
      if (!res.success) {
        setError(res.message || "Couldn't resend the code. Try again.");
        return false;
      }
      return true;
    });

  const handleOnboardingSubmit = (payload) =>
    withLoading(async () => {
      const res = await completeProfile(token, payload);
      if (!res.success) return setError(res.message || "Couldn't save your details. Try again.");
      await refreshProfile?.();
      // setStep("done");
      navigate(redirectTo);
    });

  return (
    <div className="w-full">
      <main className={`relative z-10 mx-auto flex w-full max-w-[1160px] flex-col items-stretch justify-center min-h-screen px-4 py-5 ${step === "onboarding" ? "" : "pt-24"} sm:px-6 sm:py-8 lg:px-8 lg:py-10`}>
        <div className="grid w-full grid-cols-1 items-stretch gap-5 lg:grid-cols-[1fr_1.05fr] lg:gap-7 xl:grid-cols-[1fr_0.95fr]">
          <div className="hidden lg:block">
            <TrustPanel />
          </div>

          <div className="flex flex-col">

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-[#047084]/12 bg-white shadow-[0_40px_90px_-32px_rgba(4,55,64,0.2)] sm:rounded-[28px]"
            >

              <div className="flex flex-1 flex-col px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-9">
                <div className="relative mb-6 sm:mb-0 flex items-center gap-2.5">
                  {step !== "onboarding" && (
                    <motion.button
                      type="button"
                      onClick={handleBack}
                      whileTap={{ scale: 0.92 }}
                      aria-label="Go back"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-[#047084]/30 hover:text-[#047084]"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </motion.button>
                  )}
                  <img src="/Logo.png" alt="BBM" className="h-7 w-auto object-contain" />
                  <span
                    className="text-[19px] font-extrabold tracking-tight text-slate-900"
                    style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
                  >
                    BBM
                  </span>
                  <span className="ml-auto hidden items-center gap-1.5 rounded-full border border-[#047084]/15 bg-[#047084]/[0.04] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-[#047084] sm:flex">
                    <ShieldCheck className="h-3 w-3" />
                    Verified network
                  </span>
                </div>
                {/* {step === "onboarding" && <StepRail step={step} isNewUser={isNewUser} />} */}
                <div className="flex mt-8 flex-1 flex-col justify-center">
                  <AnimatePresence mode="wait">
                    {step === "identifier" && (
                      <IdentifierPanel key="identifier" onSubmit={handleIdentifierSubmit} loading={loading} serverError={error} />
                    )}
                    {step === "otp" && (
                      <OtpPanel
                        key="otp" identifier={identifier} onVerify={handleOtpVerify} onResend={handleResend}
                        onEditNumber={() => setStep("identifier")} loading={loading} serverError={error}
                      />
                    )}
                    {step === "onboarding" && (
                      <OnboardingPanel
                        key="onboarding" token={token} loginType={loginType} profile={profile}
                        onSubmit={handleOnboardingSubmit} loading={loading} serverError={error}
                      />
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
            <TrustBadgesFooter />
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: identifier
// ---------------------------------------------------------------------------
function IdentifierPanel({ onSubmit, loading, serverError }) {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const [confirmingCall, setConfirmingCall] = useState(false);
  const inFlight = useRef(false);

  const mode = detectMode(value);
  const valid = detectChannel(value) !== null;
  const showError = touched && value.length > 0 && !valid;

  const handleChange = (e) => {
    const raw = e.target.value;
    const nextMode = detectMode(raw);
    setValue(nextMode === "phone" ? raw.replace(/\D/g, "").slice(0, 10) : raw);
    setConfirmingCall(false);
  };
  const handlePaste = (e) => {
    const text = e.clipboardData.getData("text");
    if (detectMode(text) === "phone") {
      e.preventDefault();
      setValue(normalizePhonePaste(text));
    }
  };

  const fireSubmit = () => {
    if (!valid || loading || inFlight.current) return;
    inFlight.current = true;
    Promise.resolve(onSubmit(value)).finally(() => (inFlight.current = false));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || loading) return;
    // Phone OTPs are delivered via a call, not silently — confirm with the
    // user before we trigger it, rather than surprising them with a ring.
    if (detectChannel(value) === "phone" && !confirmingCall) {
      setConfirmingCall(true);
      return;
    }
    fireSubmit();
  };

  return (

    <motion.form
      initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      onSubmit={handleSubmit} noValidate className="flex w-full flex-col"
    >

      <h1
        className="text-[clamp(1.55rem,3.8vw,2.05rem)] font-semibold leading-[1.1] text-slate-900"
        style={{ fontFamily: "'Fraunces', serif" }}
      >
        Welcome to BBM
      </h1>
      <p className="mt-2.5 text-[13.5px] font-medium leading-relaxed text-slate-500">
        One verified account to buy and sell. We'll send a one-time code —
        no password to remember.
      </p>

      <label htmlFor="identifier" className="mt-8 text-[12px] font-bold uppercase tracking-wide text-slate-500">Mobile number or email</label>
      <div
        className="mt-2.5 flex w-full items-center overflow-hidden rounded-md border-2 bg-white transition-all duration-200"
        style={{
          borderColor: showError || serverError ? "#c71f11" : focused ? "#047084" : "#e5e9ea",
          boxShadow: focused ? "0 0 0 4px rgba(4,112,132,0.1)" : "none",
        }}
      >
        <span className="flex shrink-0 items-center gap-1.5 border-r border-slate-100 bg-slate-50/60 px-3 py-3.5 text-[13.5px] font-bold text-slate-500 sm:px-3.5">
          {mode === null && (<><Phone className="h-3.5 w-3.5 text-slate-400" /><Mail className="h-3.5 w-3.5 text-slate-400" /></>)}
          {mode === "phone" && (<><Phone className="h-3.5 w-3.5 text-slate-400" />+91</>)}
          {mode === "email" && <Mail className="h-3.5 w-3.5 text-slate-400" />}
        </span>
        <input
          id="identifier" type="text" autoComplete="username" autoFocus disabled={loading}
          value={value} onChange={handleChange} onPaste={handlePaste}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); setTouched(true); }}
          placeholder="98765 43210 or you@company.com"
          className="w-full min-w-0 bg-transparent px-3 py-3 text-[12px] font-semibold tracking-wide text-slate-800 placeholder:font-normal placeholder:text-slate-300 focus:outline-none disabled:opacity-60 sm:px-3.5"
        />
      </div>

      <div className="mt-1.5 min-h-[16px]">
        {showError && <p className="text-[12px] font-semibold text-[#c71f11]">Enter a valid 10-digit mobile number or email address.</p>}
        {!showError && serverError && <p className="text-[12px] font-semibold text-[#c71f11]">{serverError}</p>}
      </div>

      <AnimatePresence mode="wait">
        {confirmingCall && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="mt-2 overflow-hidden rounded-xl border border-[#7fb3bd]/60 bg-[#047084]/[0.06] px-3.5 py-3"
          >
            <p className="flex items-start gap-2 text-[12.5px] font-semibold leading-relaxed text-slate-700">
              <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#047084]" />
              You'll receive a call from BBM's System on +91 {value} with your one-time code.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="submit" disabled={!valid || loading}
        whileTap={{ scale: 0.98 }}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[14px] font-bold text-white shadow-[0_16px_30px_-10px_rgba(199,31,17,0.55)] transition-all duration-200 enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_20px_36px_-10px_rgba(199,31,17,0.6)] disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}
      >
        {loading ? (<><Loader2 className="h-4 w-4 animate-spin" />Sending OTP…</>) : confirmingCall ? (
          <>Yes, call me <ArrowRight className="h-4 w-4" /></>
        ) : (
          <>Send OTP<ArrowRight className="h-4 w-4" /></>
        )}
      </motion.button>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11.5px] font-medium text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5 text-[#047084]/60" />
        By continuing, you agree to our{" "}
        <a href="/terms" className="font-semibold text-slate-500 underline underline-offset-2 hover:text-[#047084]">Terms</a>{" "}
        and{" "}
        <a href="/privacy" className="font-semibold text-slate-500 underline underline-offset-2 hover:text-[#047084]">Privacy</a>.
      </p>
    </motion.form>
  );
}

// ---------------------------------------------------------------------------
// Step 2: OTP entry
// ---------------------------------------------------------------------------
function OtpBoxes({ length = OTP_LENGTH, onComplete, error, disabled }) {
  const [digits, setDigits] = useState(Array(length).fill(""));
  const inputsRef = useRef([]);

  useEffect(() => { inputsRef.current[0]?.focus(); }, []);

  const handleChange = (i, val) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = digit;
    setDigits(next);
    if (digit && i < length - 1) inputsRef.current[i + 1]?.focus();
    if (digit && i === length - 1 && next.every(Boolean)) onComplete(next.join(""));
  };
  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputsRef.current[i - 1]?.focus();
  };
  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(length).fill("");
    pasted.split("").forEach((d, i) => (next[i] = d));
    setDigits(next);
    inputsRef.current[Math.min(pasted.length, length) - 1]?.focus();
    if (pasted.length === length) onComplete(pasted);
  };

  // Clear the boxes whenever a new code is requested (e.g. after Resend),
  // so stale digits from a failed attempt don't linger on screen.
  useEffect(() => {
    if (!disabled) {
      setDigits(Array(length).fill(""));
      inputsRef.current[0]?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [length]);

  return (
    <div>
      <div className="relative">
        <div className="grid gap-2 sm:gap-2.5" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
          {digits.map((d, i) => (
            <motion.input
              key={i} ref={(el) => (inputsRef.current[i] = el)} type="text" inputMode="numeric" maxLength={1}
              value={d} disabled={disabled}
              animate={d ? { scale: [1.12, 1] } : {}}
              transition={{ duration: 0.2 }}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              className="aspect-square w-full min-w-0 rounded-xl border-2 text-center text-[18px] font-extrabold text-slate-800 shadow-[0_1px_2px_rgba(4,55,64,0.04)] transition-colors focus:outline-none disabled:opacity-60 sm:text-[20px]"
              style={{
                borderColor: error ? "#c71f11" : d ? "#047084" : "#e5e9ea",
                background: d ? "rgba(4,112,132,0.05)" : "white",
              }}
            />
          ))}
        </div>
        {disabled && !error && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-white/55 backdrop-blur-[1px]"
          >
            <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11.5px] font-bold text-[#047084] shadow-[0_6px_16px_-6px_rgba(4,55,64,0.3)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Verifying…
            </span>
          </motion.div>
        )}
      </div>
      {error && <p className="mt-2.5 text-[12px] font-semibold text-[#c71f11]">{error}</p>}
    </div>
  );
}

function OtpPanel({ identifier, onVerify, onResend, onEditNumber, loading, serverError }) {
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const [justResent, setJustResent] = useState(false);
  const channel = detectChannel(identifier);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  // FIX: previously this just called onResend() and reset the 30s timer
  // unconditionally — even if the resend request actually failed, the
  // button would disappear behind the countdown as if a new code had gone
  // out. Now the countdown only restarts on a confirmed success, and the
  // button is disabled + shows a spinner while the request is in flight so
  // it can't be double-tapped.
  const handleResend = async () => {
    if (secondsLeft > 0 || resending) return;
    setResending(true);
    setJustResent(false);
    try {
      const ok = await onResend();
      if (ok !== false) {
        setSecondsLeft(RESEND_SECONDS);
        setJustResent(true);
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.3, ease: "easeOut" }} className="flex w-full flex-col"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-[0_10px_22px_-8px_rgba(4,112,132,0.55)]" style={{ background: "linear-gradient(135deg, #047084 0%, #7fb3bd 100%)" }}>
        {channel === "email" ? <Mail className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
      </span>
      <h1 className="mt-4 text-[clamp(1.55rem,3.8vw,2.05rem)] font-semibold leading-[1.1] text-slate-900" style={{ fontFamily: "'Fraunces', serif" }}>
        Enter the code
      </h1>
      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[13.5px] font-medium leading-relaxed text-slate-500">
        <span className="break-all">Sent to {channel === "email" ? identifier : `+91 ${identifier}`}.</span>
        <button type="button" onClick={onEditNumber} className="inline-flex shrink-0 items-center gap-1 font-bold text-[#047084] hover:underline">
          <Pencil className="h-3 w-3" />Edit
        </button>
      </p>

      <div className="mt-7">
        <OtpBoxes onComplete={(code) => !loading && onVerify(code)} error={serverError} disabled={loading} />
      </div>

      <div className="mt-5 flex flex-col items-center gap-1.5 text-center">
        <p className="text-[12px] font-medium text-slate-400">
          {secondsLeft > 0 ? (
            <>Resend code in {secondsLeft}s</>
          ) : (
            <button
              type="button" onClick={handleResend} disabled={resending}
              className="inline-flex items-center gap-1.5 font-bold text-[#047084] hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resending ? (<><Loader2 className="h-3 w-3 animate-spin" />Resending…</>) : "Resend code"}
            </button>
          )}
        </p>
        {channel === "phone" && justResent && secondsLeft === RESEND_SECONDS && (
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#047084]"
          >
            <Phone className="h-3 w-3" />
            We're calling +91 {identifier} again now.
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: onboarding
// ---------------------------------------------------------------------------
function AltContactVerify({ token, field, label, placeholder, inputMode, formatValue, validate, required, prefillVerifiedValue, onVerified }) {
  const [value, setValue] = useState(prefillVerifiedValue || "");
  const [stage, setStage] = useState(prefillVerifiedValue ? "verified" : "idle");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (prefillVerifiedValue) {
      setValue(prefillVerifiedValue);
      setStage("verified");
      onVerified?.(true, prefillVerifiedValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillVerifiedValue]);

  const valid = validate(value);
  const isPhoneField = field === "phone";

  const actuallySendCode = async () => {
    setError(null);
    setStage("sending");
    const res = await requestContactOtp(token, field, value);
    if (!res.success) {
      setError(res.message || "Couldn't send the code.");
      setStage("idle");
      return;
    }
    setStage("otp");
  };

  const sendCode = async () => {
    if (!valid) return;
    // Phone verification here happens via a call — confirm before dialing
    // rather than surprising the user, same as the login identifier step.
    if (isPhoneField && stage !== "confirm") {
      setStage("confirm");
      return;
    }
    await actuallySendCode();
  };

  const confirmCode = async (otp) => {
    setError(null);
    const res = await verifyContactOtp(token, field, value, otp);
    if (!res.success) {
      setError(res.message || "That code didn't match.");
      setStage("otp");
      return;
    }
    setStage("verified");
    onVerified?.(true, value);
  };

  if (stage === "verified") {
    return (
      <div className="flex flex-col">
        <label className="text-[12px] font-bold uppercase tracking-wide text-slate-500">{label}</label>
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
          className="mt-1 flex items-center gap-2 rounded-md border-2 border-[#7fb3bd]/70 bg-[#047084]/[0.06] px-3.5 py-2"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#047084]" />
          <span className="truncate text-[14px] font-semibold text-slate-800">{formatValue(value)}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-[#047084] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white">
            Verified
          </span>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <label className="text-[12px] font-bold uppercase tracking-wide text-slate-500">
        {label}{" "}
      </label>

      {stage !== "otp" ? (
        <>
          <div className="mt-1 flex gap-2">
            <input
              inputMode={inputMode} value={value}
              onChange={(e) => { setValue(e.target.value); setStage("idle"); onVerified?.(false, ""); }}
              placeholder={placeholder} disabled={stage === "sending"}
              className="w-full min-w-0 rounded-md border-2 border-slate-200 bg-white px-3.5 py-0 text-[14px] font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-300 focus:border-[#047084] focus:outline-none focus:ring-4 focus:ring-[#047084]/10"
            />
            <button
              type="button" onClick={sendCode} disabled={!valid || stage === "sending"}
              className="shrink-0 rounded-xl px-4 py-3 text-[12.5px] font-bold text-white shadow-[0_8px_16px_-6px_rgba(4,112,132,0.5)] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #0a95ab 0%, #047084 100%)" }}
            >
              {stage === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : stage === "confirm" ? "Yes, call me" : "Verify"}
            </button>
          </div>

          <AnimatePresence>
            {stage === "confirm" && (
              <motion.p
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                className="mt-2 flex items-start gap-2 overflow-hidden rounded-lg border border-[#7fb3bd]/60 bg-[#047084]/[0.06] px-3 py-2 text-[12px] font-semibold leading-relaxed text-slate-700"
              >
                <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#047084]" />
                You'll receive a call on +91 {value} with your code. Tap "Yes, call me" when ready.
              </motion.p>
            )}
          </AnimatePresence>
        </>
      ) : (
        <div className="mt-2.5 max-w-[280px]">
          <OtpBoxes length={6} onComplete={confirmCode} error={error} />
        </div>
      )}
      {error && stage !== "otp" && <p className="mt-1.5 text-[12px] font-semibold text-[#c71f11]">{error}</p>}
    </div>
  );
}

// OnboardingPanel — replace the fetchMe useEffect with this
function OnboardingPanel({ token, loginType, profile, onSubmit, loading, serverError }) {
  const [name, setName] = useState(profile?.name || "");

  const [resumed, setResumed] = useState(
    !!(profile?.name || (profile?.phone_verified && loginType !== "phone"))
  );
  const [phoneVerified, setPhoneVerified] = useState(loginType === "phone" || !!profile?.phone_verified);
  const [verifiedPhoneValue, setVerifiedPhoneValue] = useState(profile?.phone_verified ? profile.phone : null);

  const [gstin, setGstin] = useState("");
  const [gstStage, setGstStage] = useState("idle");
  const [gstError, setGstError] = useState(null);
  const [gstData, setGstData] = useState(null);
  const [displayName, setDisplayName] = useState("");

  const [dispatchSame, setDispatchSame] = useState(true);
  const [dispatchAddress, setDispatchAddress] = useState("");
  const [dispatchPincode, setDispatchPincode] = useState("");
  const [dispatchState, setDispatchState] = useState("");

  const [touched, setTouched] = useState(false);

  // Resume any progress from a previous, abandoned onboarding attempt —
  // the user may have verified their phone or typed their name before
  // closing the tab last time.
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!token) return;
      const res = await fetchMe(token);
      if (!mounted || !res?.success) return;
      const p = res.profile;
      if (p.name) setName(p.name);
      if (p.phone_verified && p.phone) {
        setVerifiedPhoneValue(p.phone);
        setPhoneVerified(true);
      }
      if (p.name || (p.phone_verified && loginType !== "phone")) setResumed(true);
    })();
    return () => { mounted = false; };
  }, [token, loginType]);

  // Autosave name so a second abandoned session still resumes.
  const saveName = () => { if (name.trim().length >= 2 && token) saveProgress(token, { name }); };

  const runLookup = async () => {
    if (!isValidGstinShape(gstin)) return;
    setGstStage("looking_up");
    setGstError(null);
    const res = await lookupGstin(token, gstin);
    if (!res.success) {
      setGstError(res.message || "Couldn't verify this GSTIN.");
      setGstStage("error");
      setGstData(null);
      return;
    }
    setGstData(res.data);
    setDisplayName((prev) => prev || res.data.trade_name || res.data.legal_name);
    setGstStage("found");
  };

  const canSubmit =
    name.trim().length >= 2 &&
    phoneVerified &&
    gstStage === "found" &&
    displayName.trim().length >= 2 &&
    (dispatchSame || (dispatchAddress.trim() && dispatchPincode.trim().length === 6 && dispatchState.trim()));

  const handleSubmit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit || loading) return;
    onSubmit({
      name: name.trim(),
      gstin,
      displayName: displayName.trim(),
      dispatchSameAsRegistered: dispatchSame,
      dispatchAddress: dispatchSame ? undefined : dispatchAddress.trim(),
      dispatchPincode: dispatchSame ? undefined : dispatchPincode.trim(),
      dispatchState: dispatchSame ? undefined : dispatchState.trim(),
    });
  };

  return (
    <motion.form
      initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.3 }} onSubmit={handleSubmit} className="flex w-full flex-col"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-[0_10px_22px_-8px_rgba(4,112,132,0.55)]" style={{ background: "linear-gradient(135deg, #047084 0%, #7fb3bd 100%)" }}>
        <Building2 className="h-5 w-5" />
      </span>
      <h1 className="mt-4 text-[clamp(1.55rem,3.8vw,2.05rem)] font-semibold leading-[1.1] text-slate-900" style={{ fontFamily: "'Fraunces', serif" }}>
        Set up your account
      </h1>
      <p className="mt-2 text-[13.5px] font-medium leading-relaxed text-slate-500">
        A few details, then you're in — buying and selling both use this account.
      </p>
      {resumed && (
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="mt-3.5 rounded-lg border border-[#7fb3bd]/60 bg-[#047084]/[0.06] px-3 py-2 text-[12px] font-semibold text-[#047084]"
        >
          Welcome back — we picked up where you left off.
        </motion.p>
      )}

      <div className="mt-4">
        <Field label="Full name">
          <input
            autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName}
            placeholder="e.g. Rohan Mehta" className={inputClass(touched && name.trim().length < 2)}
          />
        </Field>
      </div>

      {/* Phone is always required and verified, regardless of login channel. */}
      <div className="mt-3">
        <AltContactVerify
          token={token} field="phone" label="Mobile number" placeholder="98765 43210" inputMode="numeric"
          formatValue={(v) => `+91 ${v}`} validate={(v) => PHONE_RE.test(v)} required
          prefillVerifiedValue={verifiedPhoneValue}
          onVerified={(ok) => setPhoneVerified(ok)}
        />
      </div>

      {loginType === "phone" && (
        <div className="mt-3">
          <AltContactVerify
            token={token} field="email" label="Email" placeholder="you@company.com" inputMode="email"
            formatValue={(v) => v} validate={(v) => EMAIL_RE.test(v)}
          />
        </div>
      )}

      {/* GSTIN lookup */}
      <div className="mt-3 flex flex-col">
        <label className="text-[12px] font-bold uppercase tracking-wide text-slate-500">GSTIN</label>
        <div className="mt-1 flex gap-2">
          <div className="relative flex-1">
            <input
              maxLength={15} value={gstin}
              onChange={(e) => { setGstin(e.target.value.toUpperCase().replace(/\s/g, "")); setGstStage("idle"); setGstData(null); }}
              placeholder="22AAAAA0000A1Z5"
              className={`${inputClass(touched && gstin.length === 15 && !isValidGstinShape(gstin))} pr-10 font-mono uppercase tracking-wide`}
            />
            {gstStage === "found" && <CheckCircle2 className="absolute right-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#047084]" />}
          </div>
          <button
            type="button" onClick={runLookup} disabled={!isValidGstinShape(gstin) || gstStage === "looking_up"}
            className="shrink-0 rounded-xl px-4 text-[12.5px] font-bold text-white shadow-[0_8px_16px_-6px_rgba(4,112,132,0.5)] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #0a95ab 0%, #047084 100%)" }}
          >
            {gstStage === "looking_up" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
          </button>
        </div>
        {gstin.length === 15 && !isValidGstinShape(gstin) && <p className="mt-1.5 text-[12px] font-semibold text-[#c71f11]">That doesn't match a GSTIN's format.</p>}
        {gstStage === "error" && <p className="mt-1.5 text-[12px] font-semibold text-[#c71f11]">{gstError}</p>}
      </div>

      <AnimatePresence>
        {gstStage === "found" && gstData && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="mt-4 grid grid-cols-1 gap-x-5 gap-y-3.5 overflow-hidden rounded-xl border border-[#047084]/12 bg-[#047084]/[0.03] px-4 py-4 sm:grid-cols-2"
          >
            <ReadOnlyField label="Legal name" value={gstData.legal_name} />
            <ReadOnlyField label="Trade name" value={gstData.trade_name} />
            <ReadOnlyField label="Status" value={gstData.gstin_status} />
            <ReadOnlyField label="PAN" value={gstData.pan} />
            <ReadOnlyField label="State" value={gstData.state} />
            <ReadOnlyField label="District" value={gstData.district} />
            <ReadOnlyField label="Pincode" value={gstData.pincode} />
            <ReadOnlyField label="Registered address" value={gstData.registered_address} className="sm:col-span-2" />
          </motion.div>
        )}
      </AnimatePresence>

      {gstStage === "found" && (
        <>
          <div className="mt-3">
            <Field label="Display name" hint="shown to buyers">
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Mehta Steel" className={inputClass(touched && displayName.trim().length < 2)} />
            </Field>
          </div>

          <div className="mt-3 flex flex-col">
            <label className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Dispatch address</label>
            <label className="mt-2.5 flex items-center gap-2 text-[13px] font-medium text-slate-600">
              <input type="checkbox" checked={dispatchSame} onChange={(e) => setDispatchSame(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-[#047084]" />
              Same as GST registered address
            </label>

            {!dispatchSame && (
              <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                <input
                  value={dispatchAddress} onChange={(e) => setDispatchAddress(e.target.value)} placeholder="Dispatch address"
                  className={`${inputClass(touched && !dispatchAddress.trim())} sm:col-span-2`}
                />
                <input
                  value={dispatchPincode} onChange={(e) => setDispatchPincode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Pincode"
                  className={inputClass(touched && dispatchPincode.trim().length !== 6)}
                />
                <input
                  value={dispatchState} onChange={(e) => setDispatchState(e.target.value)} placeholder="State"
                  className={inputClass(touched && !dispatchState.trim())}
                />
              </div>
            )}
          </div>
        </>
      )}

      {serverError && <p className="mt-3.5 text-[12px] font-semibold text-[#c71f11]">{serverError}</p>}

      <motion.button
        type="submit" disabled={!canSubmit || loading}
        whileTap={{ scale: 0.98 }}
        className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[14px] font-bold text-white shadow-[0_16px_30px_-10px_rgba(199,31,17,0.55)] transition-all duration-200 enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_20px_36px_-10px_rgba(199,31,17,0.6)] disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}
      >
        {loading ? "Saving…" : "Finish setting up"}
        {!loading && <ArrowRight className="h-4 w-4" />}
      </motion.button>
    </motion.form>
  );
}

function Field({ label, hint, className = "", children }) {
  return (
    <div className={`flex flex-col ${className}`}>
      <label className="text-[12px] font-bold uppercase tracking-wide text-slate-500">
        {label} {hint && <span className="normal-case font-medium text-slate-400">({hint})</span>}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
function ReadOnlyField({ label, value, className = "" }) {
  return (
    <div className={className}>
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-[13px] font-semibold text-slate-700">{value || "—"}</p>
    </div>
  );
}
function inputClass(error) {
  return `w-full min-w-0 rounded-md border-2 bg-white px-3.5 py-2 text-[14.5px] font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-300 transition-colors focus:border-[#047084] focus:outline-none focus:ring-4 focus:ring-[#047084]/10 sm:py-2 ${error ? "border-[#c71f11]" : "border-slate-200"}`;
}