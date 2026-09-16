// pages/admin/AdminWalletSellersPage.jsx
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Search, Loader2, ShieldAlert, Edit3, IndianRupee } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { fetchAllSellerWallets, updateSellerWalletSettings } from "../../utils/adminWalletApi.js";
import { C } from "../../components/catalog/tokens";

function inr(n) { return (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }

function EditSettingsModal({ seller, onClose, onSaved }) {
    const { token } = useAuth();
    const [billingMode, setBillingMode] = useState(seller.billingMode);
    const [thresholdAmount, setThresholdAmount] = useState(String(seller.thresholdAmount || 1000));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const save = async () => {
        setError(null);
        if (billingMode === "threshold" && !(Number(thresholdAmount) > 0)) return setError("Enter a valid threshold amount.");
        setSaving(true);
        const res = await updateSellerWalletSettings(token, seller.id, { billingMode, thresholdAmount: Number(thresholdAmount) });
        setSaving(false);
        if (!res?.success) return setError(res?.message || "Couldn't save.");
        onSaved();
    };

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="w-full max-w-sm rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
                <p className="text-[14px] font-extrabold tracking-wide" style={{ color: C.ink }}>{seller.displayName}</p>
                <p className="text-[11.5px] font-semibold" style={{ color: C.muted }}>Currently owes ₹{inr(seller.balanceDue)}</p>

                <div className="mt-4 flex gap-2">
                    {[{ v: "threshold", t: "Threshold-wise" }, { v: "monthly", t: "Monthly" }].map(({ v, t }) => (
                        <button key={v} onClick={() => setBillingMode(v)}
                            className="flex-1 rounded-xl border px-3 py-2.5 text-[12.5px] font-bold tracking-wide"
                            style={billingMode === v ? { borderColor: C.secondary, background: `${C.secondary}10`, color: C.secondary } : { borderColor: C.hair, color: C.muted }}>
                            {t}
                        </button>
                    ))}
                </div>

                {billingMode === "threshold" && (
                    <div className="mt-3">
                        <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>Threshold amount (₹)</label>
                        <input type="text" inputMode="decimal" value={thresholdAmount} onChange={(e) => setThresholdAmount(e.target.value.replace(/[^\d.]/g, ""))}
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-[13.5px] font-bold tabular-nums" style={{ borderColor: C.hair }} />
                    </div>
                )}

                {error && <p className="mt-2 text-[12px] font-semibold text-red-700">{error}</p>}

                <div className="mt-4 flex gap-2">
                    <button onClick={onClose} className="flex-1 rounded-lg border px-4 py-2 text-[12.5px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>Cancel</button>
                    <button onClick={save} disabled={saving} className="flex-1 rounded-lg px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: C.secondary }}>
                        {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function AdminWalletSellersPage() {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [sellers, setSellers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [modeFilter, setModeFilter] = useState("");
    const [editing, setEditing] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await fetchAllSellerWallets(token, { search, billingMode: modeFilter });
        if (res?.success) setSellers(res.sellers);
        setLoading(false);
    }, [token, search, modeFilter]);

    useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

    return (
        <div className="mx-auto min-h-screen max-w-4xl px-2.5 pb-10 pt-3 sm:px-4">
            <div className="mt-3 flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: C.hair, color: C.ink }}><ArrowLeft className="h-4 w-4" /></button>
                <h1 className="font-extrabold tracking-wide" style={{ color: C.ink, fontSize: "clamp(20px,1.8vw,26px)" }}>Seller Wallets</h1>
            </div>

            <div className="mt-4 flex gap-2">
                <div className="flex flex-1 items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: C.hair }}>
                    <Search className="h-3.5 w-3.5" style={{ color: C.muted }} />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sellers…" className="w-full text-[13px] font-medium outline-none" />
                </div>
                <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)} className="rounded-xl border px-3 py-2 text-[12.5px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>
                    <option value="">All modes</option>
                    <option value="monthly">Monthly</option>
                    <option value="threshold">Threshold</option>
                </select>
            </div>

            <div className="mt-4 flex flex-col gap-2.5">
                {loading ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl" style={{ background: C.hairSoft }} />)
                    : sellers.map((s) => (
                        <div key={s.id} className="flex items-center justify-between rounded-2xl border p-3.5" style={{ borderColor: s.isBlocked ? "#c71f1130" : C.hair }}>
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <p className="truncate text-[13.5px] font-extrabold tracking-wide" style={{ color: C.ink }}>{s.displayName}</p>
                                    {s.isBlocked && (
                                        <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "#c71f1112", color: "#c71f11" }}>
                                            <ShieldAlert className="h-2.5 w-2.5" /> Blocked
                                        </span>
                                    )}
                                </div>
                                <p className="mt-0.5 flex items-center gap-3 text-[11.5px] font-semibold" style={{ color: C.muted }}>
                                    <span className="capitalize">{s.billingMode} mode</span>
                                    <span className="flex items-center"><IndianRupee className="h-3 w-3" />{inr(s.balanceDue)} due</span>
                                </p>
                            </div>
                            <button onClick={() => setEditing(s)} className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-bold" style={{ borderColor: C.hair, color: C.secondary }}>
                                <Edit3 className="h-3.5 w-3.5" /> Edit
                            </button>
                        </div>
                    ))}
                {!loading && sellers.length === 0 && <p className="py-10 text-center text-[13px] font-semibold" style={{ color: C.muted }}>No sellers found.</p>}
            </div>

            {editing && <EditSettingsModal seller={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
        </div>
    );
}