// pages/admin/AdminManageAdminsPage.jsx
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Loader2, ShieldPlus, ShieldMinus, ShieldCheck, UserPlus } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { adminListAdmins, adminCreateAdmin, adminDemoteUser } from "../../utils/api.js";

export default function AdminManageAdminsPage() {
  const { token, profile: currentAdmin } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const loadAdmins = useCallback(() => {
    setLoadingAdmins(true);
    adminListAdmins(token).then((res) => {
      if (res?.success) setAdmins(res.admins);
      setLoadingAdmins(false);
    });
  }, [token]);

  useEffect(() => { loadAdmins(); }, [loadAdmins]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError(null);
    if (!name.trim() || (!phone.trim() && !email.trim())) {
      setCreateError("Enter a name, and a phone number or email.");
      return;
    }
    setCreating(true);
    const res = await adminCreateAdmin(token, { phone: phone.trim() || undefined, email: email.trim() || undefined, name: name.trim() });
    setCreating(false);
    if (!res?.success) { setCreateError(res?.message || "Couldn't create admin."); return; }
    setName(""); setPhone(""); setEmail("");
    loadAdmins();
  };

  const handleDemote = async (adminId) => {
    setError(null);
    setBusyId(adminId);
    const res = await adminDemoteUser(token, adminId);
    if (!res?.success) setError(res?.message || "Couldn't remove admin access.");
    else loadAdmins();
    setBusyId(null);
  };

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-16 pt-6 sm:px-6">
      <h1 className="text-[22px] font-extrabold text-slate-900">Manage Admins</h1>
      <p className="mt-1 text-[13px] font-medium text-slate-500">
        Create a new admin account — they'll sign in with their phone or email and an OTP.
      </p>

      <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-slate-700">
          <UserPlus className="h-4 w-4 text-[#047084]" /> New admin
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name"
          className="rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] font-medium outline-none focus:border-[#047084]" />
        <div className="flex gap-2">
          <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Phone (optional)"
            className="w-1/2 rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] font-medium outline-none focus:border-[#047084]" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)"
            className="w-1/2 rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] font-medium outline-none focus:border-[#047084]" />
        </div>
        <p className="text-[11px] font-medium text-slate-400">Provide at least one — phone or email.</p>
        {createError && <p className="text-[12px] font-semibold text-[#c71f11]">{createError}</p>}
        <button type="submit" disabled={creating}
          className="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-[#047084] px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50">
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldPlus className="h-3.5 w-3.5" />}
          Create admin
        </button>
      </form>

      {error && <p className="mt-3 text-[12.5px] font-semibold text-[#c71f11]">{error}</p>}

      <h2 className="mt-8 text-[14px] font-extrabold text-slate-900">Current Admins</h2>
      <div className="mt-2.5 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">
        {loadingAdmins && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#047084]" /></div>}
        {!loadingAdmins && admins.map((a) => {
          const isSelf = a.id === currentAdmin?.id;
          return (
            <motion.div key={a.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ background: "linear-gradient(135deg,#047084,#7fb3bd)" }}>
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-bold text-slate-900">{a.name || "Unnamed"} {isSelf && <span className="font-medium text-slate-400">(you)</span>}</p>
                <p className="text-[12px] font-medium text-slate-400">{a.email || a.phone}</p>
              </div>
              {!isSelf && (
                <button onClick={() => handleDemote(a.id)} disabled={busyId === a.id || admins.length <= 1}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#c71f11]/25 px-3 py-1.5 text-[12px] font-bold text-[#c71f11] disabled:opacity-40">
                  {busyId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldMinus className="h-3.5 w-3.5" />}
                  Remove
                </button>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}