// pages/admin/AdminProductCommissionsPage.jsx
import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, Search, Loader2, Percent, RotateCcw, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { fetchProductCommissions, updateProductCommission } from "../../utils/adminProductCommissionApi.js";
import { C } from "../../components/catalog/tokens";

function Row({ product, defaultPercent, onSave }) {
    const [value, setValue] = useState(product.commissionPercent != null ? String(product.commissionPercent) : "");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        const ok = await onSave(product.id, value.trim() === "" ? null : Number(value));
        setSaving(false);
        if (ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); }
    };

    const handleReset = async () => {
        setValue("");
        setSaving(true);
        const ok = await onSave(product.id, null);
        setSaving(false);
        if (ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); }
    };

    return (
        <div className="flex items-center gap-3 border-b py-3 last:border-b-0" style={{ borderColor: C.hairSoft }}>
            <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-bold tracking-wide" style={{ color: C.ink }}>{product.name}</p>
                <p className="truncate text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                    {product.brandName || "No brand"} {product.isOverridden ? "· custom rate" : `· using default (${defaultPercent}%)`}
                </p>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="relative">
                    <input
                        type="text" inputMode="decimal" value={value}
                        onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))}
                        placeholder={String(defaultPercent)}
                        className="w-20 rounded-lg border px-2.5 py-1.5 pr-6 text-[13px] font-bold tabular-nums text-right"
                        style={{ borderColor: C.hair }}
                    />
                    <Percent className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2" style={{ color: C.muted }} />
                </div>
                {product.isOverridden && (
                    <button onClick={handleReset} disabled={saving} title="Reset to platform default"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border" style={{ borderColor: C.hair, color: C.muted }}>
                        <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                )}
                <button onClick={handleSave} disabled={saving}
                    className="flex h-7 w-16 items-center justify-center rounded-lg text-[11.5px] font-bold text-white disabled:opacity-50"
                    style={{ background: saved ? "#059669" : C.secondary }}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : "Save"}
                </button>
            </div>
        </div>
    );
}

export default function AdminProductCommissionsPage() {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [products, setProducts] = useState([]);
    const [defaultPercent, setDefaultPercent] = useState(0.25);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [overriddenOnly, setOverriddenOnly] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await fetchProductCommissions(token, { search, overriddenOnly });
        if (res?.success) { setProducts(res.products); setDefaultPercent(res.defaultPercent); }
        setLoading(false);
    }, [token, search, overriddenOnly]);

    useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

    const handleSave = async (productId, commissionPercent) => {
        const res = await updateProductCommission(token, productId, commissionPercent);
        if (!res?.success) { window.alert(res?.message || "Couldn't update commission."); return false; }
        setProducts((prev) => prev.map((p) => p.id === productId
            ? { ...p, commissionPercent, isOverridden: commissionPercent != null, effectivePercent: commissionPercent ?? defaultPercent }
            : p));
        return true;
    };

    return (
        <div className="mx-auto min-h-screen max-w-3xl px-2.5 pb-16 pt-3 sm:px-4">
            <div className="mt-3 flex items-center gap-3">
                <button onClick={() => navigate('/home')} className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: C.hair, color: C.ink }}><ArrowLeft className="h-4 w-4" /></button>
                <div>
                    <h1 className="font-extrabold tracking-wide" style={{ color: C.ink, fontSize: "clamp(20px,1.8vw,26px)" }}>Product Commissions</h1>
                    <p className="text-[12px] font-semibold tracking-wide" style={{ color: C.muted }}>Platform default: {defaultPercent}% · override any product below</p>
                </div>
            </div>

            <div className="mt-4 flex items-center gap-2.5">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: C.muted }} />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…"
                        className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-[13px] font-semibold" style={{ borderColor: C.hair }} />
                </div>
                <button onClick={() => setOverriddenOnly((v) => !v)}
                    className="shrink-0 rounded-xl border px-3 py-2.5 text-[12px] font-bold tracking-wide"
                    style={overriddenOnly ? { borderColor: C.secondary, background: `${C.secondary}12`, color: C.secondary } : { borderColor: C.hair, color: C.muted }}>
                    Custom rates only
                </button>
            </div>

            <div className="mt-4 rounded-2xl border bg-white p-4" style={{ borderColor: C.hair }}>
                {loading ? (
                    <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" style={{ color: C.muted }} /></div>
                ) : products.length === 0 ? (
                    <p className="py-6 text-center text-[12.5px] font-semibold" style={{ color: C.muted }}>No products found.</p>
                ) : (
                    products.map((p) => <Row key={p.id} product={p} defaultPercent={defaultPercent} onSave={handleSave} />)
                )}
            </div>
        </div>
    );
}