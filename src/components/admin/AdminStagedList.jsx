// Products waiting for a business to finish seller setup (or failed to publish).
import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2, RefreshCw } from "lucide-react";
import { C } from "../catalog/tokens";
import { Chip } from "../orders/disputeUi.jsx";
import { fetchStaged, deleteStaged, publishStagedNow } from "../../utils/api.adminListings.js";

const TONE = { staged: ["info", "Waiting"], publishing: ["info", "Publishing…"], published: ["success", "Live"], failed: ["warn", "Failed"], skipped: ["neutral", "Already listed"] };
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }) : "—");

export default function AdminStagedList({ token, gstin, live, say, onChanged }) {
    const [items, setItems] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        const r = await fetchStaged(token, gstin);
        if (r?.success) { setItems(r.items); setError(null); } else setError(r?.message || "Could not load the list.");
    }, [token, gstin]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { // follow a publish that is still running
        if (!items?.some((i) => i.status === "publishing")) return undefined;
        const t = setInterval(load, 4000);
        return () => clearInterval(t);
    }, [items, load]);

    const retry = async () => {
        setBusy(true);
        const r = await publishStagedNow(token, gstin);
        setBusy(false);
        if (!r?.success) return say(r?.message || "Could not publish.");
        say(`${r.published} published${r.failed ? `, ${r.failed} failed` : ""}${r.skipped ? `, ${r.skipped} already listed` : ""}.`);
        await load(); onChanged?.();
    };
    const remove = async (it) => {
        if (!window.confirm(`Remove "${it.product_name}" from the waiting list?`)) return;
        const r = await deleteStaged(token, it.id);
        if (!r?.success) return say(r?.message || "Could not remove it.");
        setItems((l) => l.filter((x) => x.id !== it.id)); onChanged?.();
    };

    if (error) return <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{error}</p>;
    if (!items) return <div className="mt-3 h-40 animate-pulse rounded-2xl" style={{ background: C.hairSoft }} />;
    const retryable = live && items.some((i) => ["staged", "failed"].includes(i.status));

    return (
        <section className="mt-3">
            <div className="flex flex-col gap-2 rounded-2xl border bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: C.hair }}>
                <p className="text-[12.5px] font-medium leading-relaxed" style={{ color: C.muted }}>
                    {live ? "This seller is live. Anything still waiting or failed can be published now." : "These products go live automatically the moment this business finishes seller setup."}
                </p>
                {retryable && (
                    <button onClick={retry} disabled={busy} className="flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: C.primary }}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Publish now
                    </button>
                )}
            </div>
            <div className="mt-3 grid gap-2">
                {!items.length && <div className="rounded-2xl border bg-white px-4 py-12 text-center text-[13px] font-semibold" style={{ borderColor: C.hair, color: C.muted }}>Nothing is waiting for this GSTIN.</div>}
                {items.map((it) => {
                    const [tone, label] = TONE[it.status] || ["neutral", it.status];
                    return (
                        <article key={it.id} className="flex min-w-0 items-center gap-3 rounded-2xl border bg-white p-3" style={{ borderColor: C.hair }}>
                            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border bg-slate-50" style={{ borderColor: C.hair }}>{it.image && <img src={it.image} alt="" loading="lazy" className="h-full w-full object-cover" />}</div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[13.5px] font-extrabold" style={{ color: C.ink }}>{it.product_name}</p>
                                <p className="truncate text-[11.5px]" style={{ color: C.muted }}>{it.brand_name || "No brand"} · added {fmt(it.created_at)}</p>
                                {it.error && <p className="mt-1 text-[11.5px] font-semibold text-red-700">{it.error}</p>}
                            </div>
                            <Chip tone={tone}>{label}</Chip>
                            {it.status !== "publishing" && it.status !== "published" && (
                                <button onClick={() => remove(it)} aria-label={`Remove ${it.product_name}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-red-700" style={{ borderColor: C.hair }}><Trash2 className="h-3.5 w-3.5" /></button>
                            )}
                        </article>
                    );
                })}
            </div>
        </section>
    );
}