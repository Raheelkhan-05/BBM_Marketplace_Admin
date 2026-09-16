import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, ArrowLeft, Loader2, CheckCircle2, Upload, X, Image as ImageIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import {
  saveSellerProgress, submitSellerOnboarding, uploadSellerFile,
  requestSellerWhatsappOtp, verifySellerWhatsappOtp,
  saveSellerBankDetails, fetchSellerBankDetails
} from "../utils/api.js";
import { TRANSPORT_OPTIONS } from "../../shared/transportOptions.js";
import useSellerProfileStatus from "../hooks/useSellerProfileStatus.js";
import { extractColorsFromImage } from "../utils/colorExtract.js";
import { STEPS, BUSINESS_TYPES, WEEKDAYS, guessBusinessType } from "../components/seller/fieldConfigs.js";
import { lookupPincode } from "../utils/sellerListingApi.js";
import { readPendingProductSubmission } from "./SellPublishProductPage.jsx";

export function SellerOnboardingForm({ onSubmitted }) {
  const { token } = useAuth();
  const navigate = useNavigate();

  const { profile: fetchedProfile, business: gstData, seller: liveSeller, loading: sellerStatusLoading } = useSellerProfileStatus(token);

  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState({
    country: "India", primary_color: "#047084", secondary_color: "#d2462b",
    working_days: [],
  });
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  // Populates local form state from the hook's data whenever it lands —
  // on first load AND whenever a live "seller_profile_changed" refetch
  // brings in fresher data (e.g. an admin approving this seller while
  // this tab is still open on the onboarding form).
  useEffect(() => {
    if (sellerStatusLoading) return;
    setForm((f) => ({
      ...f,
      contact_person: fetchedProfile?.name || f.contact_person || "",
      whatsapp_number: fetchedProfile?.phone || f.whatsapp_number || "",
      whatsapp_verified: !!fetchedProfile?.phone_verified,
      original_verified_number: fetchedProfile?.phone_verified ? fetchedProfile.phone : null,
      address: gstData?.registered_address || f.address || "",
      pincode: gstData?.pincode || f.pincode || "",
      city: gstData?.district || f.city || "",
      state: gstData?.state || f.state || "",
      pan: gstData?.pan || f.pan || "",
      display_name: gstData?.trade_name || gstData?.legal_name || f.display_name || "",
      business_type: f.business_type || guessBusinessType(gstData?.nature_of_business),
      ...(liveSeller || {}),
    }));
  }, [sellerStatusLoading, fetchedProfile, gstData, liveSeller]);

  useEffect(() => {
    if (!token) return;
    fetchSellerBankDetails(token).then((res) => {
      if (res?.success && res.bank) {
        setForm((f) => ({
          ...f,
          bank_account_number: f.bank_account_number || res.bank.account_number || "",
          bank_ifsc_code: f.bank_ifsc_code || res.bank.ifsc_code || "",
        }));
      }
    });
  }, [token]);

  // If this seller's status flips to "approved" while they're sitting on
  // the onboarding form — most commonly via the live socket event above —
  // there's nothing left to onboard. Bounce straight to the real
  // dashboard instead of leaving a stale form an admin's approval could
  // otherwise get overwritten by on next save.
  useEffect(() => {
    if (liveSeller?.status === "approved") {
      onSubmitted?.(liveSeller);
      navigate("/seller/listings", { replace: true });
    }
  }, [liveSeller?.status, liveSeller, onSubmitted, navigate]);

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const persist = async (extra = {}) => {
    setSaving(true);
    try {
      const res = await saveSellerProgress(token, { ...form, ...extra, onboarding_step: STEPS[stepIndex].key });
      if (res?.success) setForm((f) => ({ ...f, ...res.seller }));
    } finally {
      setSaving(false);
    }
  };

  const goNext = async () => {
    setError(null);
    const missing = requiredMissing(STEPS[stepIndex].key, form);
    if (missing.length) return setError(`Please fill: ${missing.join(", ")}`);

    if (STEPS[stepIndex].key === "bank") {
      setSaving(true);
      try {
        const res = await saveSellerBankDetails(token, {
          account_number: form.bank_account_number,
          ifsc_code: form.bank_ifsc_code,
        });
        if (!res?.success) {
          setError(res?.message || "Couldn't save bank details.");
          return;
        }
      } finally {
        setSaving(false);
      }
    } else {
      await persist();
    }

    if (stepIndex < STEPS.length - 1) setStepIndex((i) => i + 1);
  };

  const goBack = () => setStepIndex((i) => Math.max(0, i - 1));

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const bankRes = await saveSellerBankDetails(token, {
        account_number: form.bank_account_number,
        ifsc_code: form.bank_ifsc_code,
      });
      if (!bankRes?.success) return setError(bankRes?.message || "Couldn't save bank details.");

      const res = await submitSellerOnboarding(token, form);
      if (!res?.success) return setError(res?.message || "Couldn't submit. Please check required fields.");

      // Await this — it refreshes the auth profile so isApprovedSeller
      // flips true before we navigate, so the destination page renders
      // the real dashboard on the very first paint instead of bouncing
      // back to onboarding for a frame.
      await onSubmitted?.(res.seller);

      const pending = readPendingProductSubmission();
      if (pending?.form) {
        navigate("/seller/sell", { replace: true });
        return;
      }

      // Seller is approved immediately now — no review screen, go
      // straight to the live seller dashboard.
      navigate("/seller/listings", { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  if (sellerStatusLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#047084]" /></div>;
  }
  if (submitted) return <SubmittedScreen />;

  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  return (

    <div className="mx-auto max-w-3xl min-h-screen px-4 pb-16 pt-6 sm:px-6">
      <h1 className="text-[clamp(1.5rem,3.5vw,1.9rem)] font-bold tracking-wide text-slate-900">
        Set up your seller shop
      </h1>
      <p className="mt-1.5 text-[14.5px] font-medium tracking-wide text-slate-500">
        Step {stepIndex + 1} of {STEPS.length} — {STEPS[stepIndex].title}
      </p>

      <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-[#047084]/10">
        <motion.div className="h-full rounded-full" style={{ background: "linear-gradient(90deg,#0a95ab,#047084)" }}
          animate={{ width: `${progress}%` }} transition={{ duration: 0.4, ease: "easeOut" }} />
      </div>

      <div className="mt-6 rounded-2xl border border-[#047084]/12 bg-white p-5 shadow-[0_20px_60px_-30px_rgba(4,55,64,0.25)] sm:p-7">
        <AnimatePresence mode="wait">
          <motion.div key={STEPS[stepIndex].key} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}>
            <StepBody stepKey={STEPS[stepIndex].key} form={form} update={update} gstData={gstData} token={token} />
          </motion.div>
        </AnimatePresence>

        {error && <p className="mt-4 text-[13.5px] font-semibold tracking-wide text-[#c71f11]">{error}</p>}

        <div className="mt-7 flex items-center justify-between gap-3">
          <button type="button" onClick={goBack} disabled={stepIndex === 0}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold tracking-wide text-slate-600 disabled:opacity-30">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          {stepIndex < STEPS.length - 1 ? (
            <button type="button" onClick={goNext} disabled={saving}
              className="flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-[14.5px] font-bold tracking-wide text-white shadow-[0_12px_24px_-10px_rgba(199,31,17,0.55)]"
              style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4" /></>}
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={submitting}
              className="flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-[14.5px] font-bold tracking-wide text-white shadow-[0_12px_24px_-10px_rgba(199,31,17,0.55)]"
              style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Submit <CheckCircle2 className="h-4 w-4" /></>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Backward-compatible default export for anything still routing to a
// standalone onboarding page. Prefer mounting <SellerOnboardingForm />
// directly (see SellerManageListingsPage.jsx) going forward.
export default function SellerOnboardingPage() {
  return <SellerOnboardingForm />;
}

function requiredMissing(stepKey, f) {
  const REQ = {
    operations: ["order_acceptance_start", "order_acceptance_end", "dispatch_pincode", "transport_options"],
    bank: ["bank_account_number", "bank_ifsc_code"],
    identity: ["logo_url"],
  }[stepKey] || [];
  return REQ.filter((k) => {
    const v = f[k];
    return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  }).map((k) => k.replace(/_/g, " "));
}

/* ---------- Step bodies ---------- */
function StepBody(props) {
  const { stepKey } = props;
  if (stepKey === "operations") return <OperationsStep {...props} />;
  if (stepKey === "bank") return <BankStep {...props} />;
  if (stepKey === "identity") return <IdentityStep {...props} />;
  if (stepKey === "review") return <ReviewStep {...props} />;
  return null;
}

function BasicsStep({ form, update, gstData }) {
  return (
    <div className="flex flex-col gap-4">
      {gstData?.legal_name && <ReadOnlyPill label="Company (from GST)" value={gstData.trade_name || gstData.legal_name} verified />}
      <TextField label="Display name" hint="shown to buyers" value={form.display_name} onChange={(v) => update("display_name", v)} />
      <SelectField label="Business type" value={form.business_type} onChange={(v) => update("business_type", v)} options={BUSINESS_TYPES} />
      <p className="-mt-2 text-[12.5px] font-medium tracking-wide text-slate-400">Guessed from your GST registration — change it if it's not quite right.</p>
    </div>
  );
}

function ContactStep({ form, update, token }) {
  const [changingNumber, setChangingNumber] = useState(false);
  const [draftNumber, setDraftNumber] = useState(form.whatsapp_number || "");
  const [otpStage, setOtpStage] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState(null);
  const [resendIn, setResendIn] = useState(0);
  const otpRefs = useRef([]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const isLocked = form.whatsapp_verified && !changingNumber;

  const startChange = () => {
    setDraftNumber(form.whatsapp_number || "");
    setChangingNumber(true);
    setOtpStage(false);
    setOtpError(null);
  };
  const cancelChange = () => {
    setChangingNumber(false);
    setOtpStage(false);
    setOtp(["", "", "", "", "", ""]);
    setOtpError(null);
  };

  const sendOtp = async () => {
    if (draftNumber.length !== 10) return;
    if (draftNumber === form.original_verified_number) {
      update("whatsapp_number", draftNumber);
      update("whatsapp_verified", true);
      setChangingNumber(false);
      return;
    }
    setSending(true); setOtpError(null);
    const res = await requestSellerWhatsappOtp(token, draftNumber);
    setSending(false);
    if (res?.success) { setOtpStage(true); setResendIn(30); setTimeout(() => otpRefs.current[0]?.focus(), 50); }
    else setOtpError(res?.message || "Couldn't send OTP.");
  };

  const handleOtpChange = (i, v) => {
    const d = v.replace(/\D/g, "").slice(-1);
    const next = [...otp]; next[i] = d; setOtp(next);
    if (d && i < 5) otpRefs.current[i + 1]?.focus();
  };
  const handleOtpKeyDown = (i, e) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  };

  const verify = async () => {
    const code = otp.join("");
    if (code.length !== 6) return;
    setVerifying(true); setOtpError(null);
    const res = await verifySellerWhatsappOtp(token, draftNumber, code);
    setVerifying(false);
    if (res?.success) {
      update("whatsapp_number", draftNumber);
      update("whatsapp_verified", true);
      update("original_verified_number", draftNumber);
      setOtpStage(false); setChangingNumber(false); setOtp(["", "", "", "", "", ""]);
    } else {
      setOtpError(res?.message || "Incorrect or expired OTP.");
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <TextField label="Contact person" value={form.contact_person} onChange={(v) => update("contact_person", v)} />

      <div className="flex flex-col gap-2">
        <Label>WhatsApp number</Label>

        {isLocked ? (
          <div className="flex items-center justify-between rounded-xl border-2 border-[#047084]/25 bg-gradient-to-br from-[#047084]/[0.06] to-[#7fb3bd]/[0.08] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#047084] text-white shadow-[0_4px_12px_-2px_rgba(4,112,132,0.5)]">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[15px] font-extrabold tracking-wide text-slate-800">+91 {form.whatsapp_number}</p>
                <p className="text-[12px] font-bold uppercase tracking-wider text-[#047084]">Verified</p>
              </div>
            </div>
            <button type="button" onClick={startChange} className="text-[13px] font-bold tracking-wide text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-[#047084]">
              Change number?
            </button>
          </div>
        ) : (
          <div className="rounded-xl border-2 border-slate-200 p-3.5">
            <div className="flex items-center gap-2">
              <span className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-[14px] font-bold tracking-wide text-slate-500">+91</span>
              <input
                value={draftNumber}
                onChange={(e) => { setDraftNumber(e.target.value.replace(/\D/g, "").slice(0, 10)); setOtpStage(false); setOtpError(null); }}
                inputMode="numeric" placeholder="10-digit number"
                className="flex-1 rounded-lg border-2 border-slate-200 px-3.5 py-2.5 text-[15px] font-bold tracking-wide text-slate-800 focus:border-[#047084] focus:outline-none focus:ring-4 focus:ring-[#047084]/10"
              />
              {changingNumber && (
                <button type="button" onClick={cancelChange} className="rounded-lg px-2 py-2 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
              )}
            </div>

            <AnimatePresence mode="wait">
              {!otpStage ? (
                <motion.div key="send" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <button type="button" onClick={sendOtp} disabled={sending || draftNumber.length !== 10}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-[14px] font-bold tracking-wide text-white shadow-[0_10px_24px_-10px_rgba(4,112,132,0.6)] disabled:opacity-35"
                    style={{ background: "linear-gradient(135deg, #0a95ab, #047084)" }}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send verification code"}
                  </button>
                </motion.div>
              ) : (
                <motion.div key="verify" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3.5">
                  <p className="text-[13px] font-semibold tracking-wide text-slate-500">Enter the 6-digit code sent to +91 {draftNumber}</p>
                  <div className="mt-2 flex justify-between gap-1.5 sm:gap-2">
                    {otp.map((d, i) => (
                      <input key={i} ref={(el) => (otpRefs.current[i] = el)} value={d}
                        onChange={(e) => handleOtpChange(i, e.target.value)} onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        inputMode="numeric" maxLength={1}
                        className="h-11 w-full max-w-[42px] rounded-lg border-2 border-slate-200 text-center text-[18px] font-extrabold tracking-wide text-slate-800 focus:border-[#047084] focus:outline-none focus:ring-4 focus:ring-[#047084]/10" />
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <button type="button" onClick={sendOtp} disabled={resendIn > 0}
                      className="text-[13px] font-bold tracking-wide text-[#047084] disabled:text-slate-300">
                      {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                    </button>
                    <button type="button" onClick={verify} disabled={verifying || otp.join("").length !== 6}
                      className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[14px] font-bold tracking-wide text-white shadow-[0_10px_24px_-10px_rgba(199,31,17,0.55)] disabled:opacity-35"
                      style={{ background: "linear-gradient(135deg, #d2462b, #c71f11)" }}>
                      {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {otpError && <p className="mt-2 text-[13px] font-semibold tracking-wide text-[#c71f11]">{otpError}</p>}
          </div>
        )}
      </div>

      <TextField label="Website" optional value={form.website} onChange={(v) => update("website", v)} placeholder="https://" />
    </div>
  );
}

function AddressStep({ gstData }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-slate-500">Registered address (from GST)</p>
        <div className="rounded-xl border border-[#7fb3bd]/40 bg-[#047084]/[0.04] p-3.5 text-[14px] font-semibold tracking-wide text-slate-700">
          {gstData?.registered_address || "—"}
          {gstData?.pincode && <span className="block text-slate-500">{gstData.district}, {gstData.state} — {gstData.pincode}</span>}
        </div>
        <p className="mt-2 text-[12.5px] font-medium tracking-wide text-slate-400">
          This is pulled from your GST registration and will be used as your shop's address.
        </p>
      </div>
    </div>
  );
}

function OperationsStep({ form, update }) {
  const selected = form.working_days || [];
  const isAllWeek = WEEKDAYS.length === selected.length && WEEKDAYS.every((d) => selected.includes(d));
  const weekdaysOnly = WEEKDAYS.filter((d) => d !== "Sun");
  const isWeekdaysOnly = weekdaysOnly.length === selected.length && weekdaysOnly.every((d) => selected.includes(d));

  const [pincodeStatus, setPincodeStatus] = useState(null); // 'checking' | 'ok' | 'error' | null

  const confirmPincode = async (pincode) => {
    if (!/^\d{6}$/.test(pincode)) return;
    setPincodeStatus("checking");
    const res = await lookupPincode(pincode);
    if (res?.success) {
      update("dispatch_district", res.district);
      update("dispatch_state", res.state);
      setPincodeStatus("ok");
    } else {
      setPincodeStatus("error");
    }
  };

  const presetBtnClass = (active) =>
    `rounded-full border px-3 py-1 text-[12.5px] font-bold tracking-wide transition-colors ${active
      ? "border-[#047084] bg-[#047084] text-white"
      : "border-slate-200 bg-white text-slate-500 hover:border-[#047084]/40 hover:text-[#047084]"
    }`;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center justify-between">
          <Label>Working days</Label>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => update("working_days", [...WEEKDAYS])} className={presetBtnClass(isAllWeek)}>
              All days
            </button>
            <button type="button" onClick={() => update("working_days", weekdaysOnly)} className={presetBtnClass(isWeekdaysOnly)}>
              Sun off
            </button>
            <button type="button" onClick={() => update("working_days", [])} className={presetBtnClass(selected.length === 0)}>
              Clear
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d) => {
            const active = selected.includes(d);
            return (
              <button key={d} type="button"
                onClick={() => update("working_days", active ? selected.filter((x) => x !== d) : [...selected, d])}
                className="rounded-lg border-2 px-3 py-1.5 text-[13.5px] font-bold tracking-wide"
                style={{ borderColor: active ? "#047084" : "#e5e9ea", color: active ? "#047084" : "#64748b", background: active ? "#04708410" : "white" }}>
                {d}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label>Transport channels you can service</Label>
        <p className="text-[12.5px] font-medium tracking-wide text-slate-400">
          Buyers will only be able to request methods you select here.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TRANSPORT_OPTIONS.map((t) => {
            const selected = (form.transport_options || []).includes(t.key);
            return (
              <button key={t.key} type="button"
                onClick={() => update("transport_options", selected
                  ? (form.transport_options || []).filter((k) => k !== t.key)
                  : [...(form.transport_options || []), t.key])}
                className="rounded-lg border-2 px-3 py-1.5 text-[13.5px] font-bold tracking-wide"
                style={{ borderColor: selected ? "#047084" : "#e5e9ea", color: selected ? "#047084" : "#64748b", background: selected ? "#04708410" : "white" }}>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TimeField label="Order acceptance starts" value={form.order_acceptance_start} onChange={(v) => update("order_acceptance_start", v)} />
        <TimeField label="Order acceptance ends" value={form.order_acceptance_end} onChange={(v) => update("order_acceptance_end", v)} />
      </div>

      <div className="flex flex-col gap-1">
        <Label>Dispatch pincode</Label>
        <input
          value={form.dispatch_pincode || ""}
          onChange={(e) => { update("dispatch_pincode", e.target.value.replace(/\D/g, "").slice(0, 6)); setPincodeStatus(null); }}
          onBlur={(e) => confirmPincode(e.target.value)}
          inputMode="numeric"
          placeholder="6-digit pincode"
          className={fieldWrap()}
        />
        <p className="text-[12.5px] font-medium tracking-wide text-slate-400">
          Where you'll be dispatching orders from?
        </p>
        {pincodeStatus === "checking" && <p className="text-[12px] font-semibold text-slate-400">Checking…</p>}
        {pincodeStatus === "ok" && <p className="text-[12px] font-bold text-[#047084]">Dispatching from {form.dispatch_district}, {form.dispatch_state}</p>}
        {pincodeStatus === "error" && <p className="text-[12px] font-medium text-[#c71f11]">Couldn't verify this pincode — you can still continue.</p>}
      </div>
    </div>
  );
}

function IdentityStep({ form, update, token }) {
  const [extracting, setExtracting] = useState(false);
  const handleLogo = async (url) => {
    update("logo_url", url);
    setExtracting(true);
    try {
      const { primary, secondary, accent } = await extractColorsFromImage(url);
      update("primary_color", primary);
      update("secondary_color", secondary);
      update("accent_color", accent);
    } catch { /* keep defaults */ }
    setExtracting(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <FileField label="Company logo" value={form.logo_url} onUploaded={handleLogo} token={token} folder="logo" accept="image/*" />
      <p className="-mt-3 text-[12.5px] font-medium tracking-wide text-slate-400">
        We'll automatically pick your shop's colors from your logo{extracting ? " — extracting…" : ""}. You can add a banner, description and more from your dashboard once your shop is live.
      </p>
    </div>
  );
}

function BankStep({ form, update }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] font-medium leading-snug text-slate-500">
        This is the account where your order payouts will be sent.
      </p>
      <TextField
        label="Account number"
        value={form.bank_account_number}
        onChange={(v) => update("bank_account_number", v.replace(/\D/g, ""))}
        inputMode="numeric"
      />
      <TextField
        label="IFSC code"
        value={form.bank_ifsc_code}
        onChange={(v) => update("bank_ifsc_code", v.toUpperCase())}
        placeholder="e.g. HDFC0001234"
      />
    </div>
  );
}

function ReviewStep({ form }) {
  const sections = [
    {
      title: "Order Timing",
      rows: [
        ["Working days", (form.working_days || []).join(", ")],
        ["Order hours", form.order_acceptance_start && form.order_acceptance_end
          ? `${form.order_acceptance_start} – ${form.order_acceptance_end}`
          : ""],
        ["Transport channels", (form.transport_options || [])
          .map((k) => TRANSPORT_OPTIONS.find((t) => t.key === k)?.label || k).join(", ")],
      ],
    },
    {
      title: "Bank Details (for payouts)",
      rows: [
        ["Account number", form.bank_account_number ? `••••${form.bank_account_number.slice(-4)}` : ""],
        ["IFSC code", form.bank_ifsc_code],
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-5">

      <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
        {form.logo_url ? (
          <img src={form.logo_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-lg text-white font-extrabold" style={{ background: form.primary_color }}>
            {(form.display_name || "S")[0]}
          </span>
        )}
        <div>
          <p className="text-[16px] font-extrabold tracking-wide text-slate-900">{form.display_name || "Your Shop Name"}</p>
        </div>
      </div>

      {sections.map((s) => {
        const rows = s.rows.filter(([, v]) => v);
        if (!rows.length) return null;
        return (
          <div key={s.title}>
            <p className="mb-1.5 text-[12px] font-extrabold uppercase tracking-wider text-[#047084]">{s.title}</p>
            <div className="rounded-xl border border-slate-100">
              {rows.map(([label, value], i) => (
                <div key={label} className={`flex justify-between gap-3 px-3.5 py-2 text-[14px] tracking-wide ${i !== rows.length - 1 ? "border-b border-slate-100" : ""}`}>
                  <span className="font-semibold text-slate-500">{label}</span>
                  <span className="max-w-[60%] text-right font-bold text-slate-800">{value}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SubmittedScreen() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full text-white" style={{ background: "linear-gradient(135deg,#047084,#7fb3bd)" }}>
        <CheckCircle2 className="h-7 w-7" />
      </span>
      <h2 className="mt-4 text-[21px] font-extrabold tracking-wide text-slate-900">Submitted for review</h2>
      <p className="mt-2 text-[14.5px] font-medium tracking-wide text-slate-500">
        We're verifying your details. You'll be notified as soon as your shop is approved and live to buyers.
      </p>
    </div>
  );
}

/* ---------- Reusable field primitives ---------- */
function fieldWrap(error) {
  return `w-full rounded-md border-2 bg-white px-3.5 py-2.5 text-[15px] font-semibold tracking-wide text-slate-800 placeholder:font-normal placeholder:text-slate-300 focus:border-[#047084] focus:outline-none focus:ring-4 focus:ring-[#047084]/10 ${error ? "border-[#c71f11]" : "border-slate-200"}`;
}
function Label({ children, optional }) {
  return <label className="text-[13px] font-bold uppercase tracking-wider text-slate-500">{children} {optional && <span className="normal-case font-medium tracking-wide text-slate-400">(optional)</span>}</label>;
}
function TextField({ label, value = "", onChange, optional, placeholder, inputMode, trailing }) {
  return (
    <div className="flex flex-col gap-1">
      <Label optional={optional}>{label}</Label>
      <div className="relative">
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} className={fieldWrap()} />
        {trailing && <span className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</span>}
      </div>
    </div>
  );
}
function TimeField({ label, value = "", onChange, optional }) {
  return (
    <div className="flex flex-col gap-1">
      <Label optional={optional}>{label}</Label>
      <input type="time" value={value || ""} onChange={(e) => onChange(e.target.value)} className={fieldWrap()} />
    </div>
  );
}
function SelectField({ label, value, onChange, options, optional }) {
  return (
    <div className="flex flex-col gap-1">
      <Label optional={optional}>{label}</Label>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} className={fieldWrap()}>
        <option value="" disabled>Select…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
function ReadOnlyPill({ label, value, verified }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <div className="flex items-center gap-1.5 rounded-md border-2 border-[#7fb3bd]/50 bg-[#047084]/[0.05] px-3.5 py-2.5 text-[15px] font-semibold tracking-wide text-slate-700">
        {value}
        {verified && <CheckCircle2 className="ml-auto h-4 w-4 text-[#047084]" />}
      </div>
    </div>
  );
}
function FileField({ label, value, onUploaded, token, folder, accept, bucket = "seller-assets" }) {
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const res = await uploadSellerFile(token, file, folder, bucket);
    if (res?.success) onUploaded(res.url);
    setLoading(false);
  };
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        {value ? (
          <img src={value} alt="" className="h-12 w-12 rounded-lg border border-slate-200 object-cover" />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-slate-300"><ImageIcon className="h-5 w-5" /></span>
        )}
        <button type="button" onClick={() => inputRef.current?.click()} disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] font-bold tracking-wide text-slate-600">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {value ? "Replace" : "Upload"}
        </button>
        <input ref={inputRef} type="file" accept={accept} onChange={handleChange} className="hidden" />
      </div>
    </div>
  );
}   