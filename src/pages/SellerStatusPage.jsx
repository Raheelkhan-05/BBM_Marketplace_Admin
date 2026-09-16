// src/pages/SellerStatusPage.jsx

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Clock3, XCircle, CheckCircle2, ArrowRight, Loader2, Pencil } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchSellerOnboarding } from "../utils/api.js";

export default function SellerStatusPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [seller, setSeller] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetchSellerOnboarding(token).then((res) => {
      if (res?.success) {
        setSeller(res.seller);
        // Redirect away if this page no longer matches their actual status —
        // e.g. they got approved since they last checked, or never started.
        if (!res.seller) navigate("/seller/onboarding", { replace: true });
        else if (res.seller.status === "approved") navigate(`/seller/listings`, { replace: true });
        else if (res.seller.status === "draft") navigate("/seller/onboarding", { replace: true });
      }
      setLoading(false);
    });
  }, [token, navigate]);

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#047084]" /></div>;
  }
  if (!seller) return null; // redirect already in flight

  const isRejected = seller.status === "rejected";

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center px-6 pt-16 text-center">
      <motion.span
        initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="flex h-16 w-16 items-center justify-center rounded-full text-white"
        style={{ background: isRejected ? "linear-gradient(135deg,#c71f11,#d2462b)" : "linear-gradient(135deg,#047084,#7fb3bd)" }}
      >
        {isRejected ? <XCircle className="h-7 w-7" /> : <Clock3 className="h-7 w-7" />}
      </motion.span>

      <h1 className="mt-5 text-[20px] font-extrabold text-slate-900">
        {isRejected ? "Update needed on your shop" : "Your shop is under review"}
      </h1>

      <p className="mt-2.5 text-[13.5px] font-medium leading-relaxed text-slate-500">
        {isRejected
          ? "Our team reviewed your application and found a few things to fix before your shop can go live."
          : "We're verifying your details. This usually takes 24–48 hours — you'll be notified as soon as it's approved."}
      </p>

      {isRejected && seller.rejection_reason && (
        <div className="mt-5 w-full rounded-xl border border-[#c71f11]/20 bg-[#c71f11]/[0.04] px-4 py-3.5 text-left">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#c71f11]">Admin's note</p>
          <p className="mt-1 text-[13px] font-medium leading-relaxed text-slate-700">{seller.rejection_reason}</p>
        </div>
      )}

      {!isRejected && (
        <div className="mt-6 flex items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-[12px] font-semibold text-slate-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#047084]" />
          Submitted {seller.submitted_at ? new Date(seller.submitted_at).toLocaleDateString() : "recently"}
        </div>
      )}

      <button
        onClick={() => navigate("/seller/onboarding")}
        className="mt-7 flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-[13.5px] font-bold text-white shadow-[0_12px_24px_-10px_rgba(199,31,17,0.55)]"
        style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}
      >
        {isRejected ? <><Pencil className="h-4 w-4" /> Review & Resubmit</> : <>View / Edit Details <ArrowRight className="h-4 w-4" /></>}
      </button>
    </div>
  );
}