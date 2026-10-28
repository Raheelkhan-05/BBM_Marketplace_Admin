// pages/admin/AdminAiBannersPage.jsx — one-click AI image generation for pending groups, categories and subcategories.
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Sparkles, RefreshCw, Square } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { C } from "../../components/catalog/tokens";
import { Chip } from "../../components/orders/disputeUi.jsx";
import { resizedImageUrl } from "../../utils/imageUrl";
import { fetchAiOverview, enqueueAiBanners, cancelAiBanners } from "../../utils/api.aiBanners.js";

const GREEN = "#22A06B";
const TYPE_LABEL = { group: "Product groups", category: "Categories", subcategory: "Subcategories" };
const TYPE_ONE = { group: "Group", category: "Category", subcategory: "Subcategory" };
const TONE = { queued: "neutral", running: "warn", done: "success", failed: "danger", cancelled: "neutral" };

function Switch({ on, onChange, label }) {
    return (
        <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
            className="relative h-5 w-9 shrink-0 rounded-full transition-colors" style={{ background: on ? GREEN : "#D9DEE2" }}>
            <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform" style={{ transform: on ? "translateX(16px)" : "none" }} />
        </button>
    );
}

export default function AdminAiBannersPage() {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [info, setInfo] = useState(null);
    const [tab, setTab] = useState("group");
    const [publish, setPublish] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        const res = await fetchAiOverview(token);
        if (res.success) { setData(res); setError(null); } else setError(res.message || "Couldn't load.");
    }, [token]);
    useEffect(() => { load(); }, [load]);

    const stats = data?.stats || { queued: 0, running: 0, done: 0, failed: 0 };
    const working = stats.queued + stats.running > 0;
    useEffect(() => {
        if (!working) return undefined;
        const t = setInterval(load, 4000);
        return () => clearInterval(t);
    }, [working, load]);

    const run = async (payload) => {
        setBusy(true); setInfo(null); setError(null);
        const res = await enqueueAiBanners(token, { ...payload, publish });
        setBusy(false);
        if (!res.success) return setError(res.message || "Couldn't start.");
        setInfo(res.queued ? `Queued ${res.queued} item${res.queued === 1 ? "" : "s"}. You can leave this page; generation continues on the server.` : "Nothing new to queue.");
        load();
    };
    const stop = async () => {
        setBusy(true);
        const res = await cancelAiBanners(token);
        setBusy(false);
        if (res.success) setInfo(`Stopped ${res.cancelled} waiting item${res.cancelled === 1 ? "" : "s"}.`);
        load();
    };

    const pending = data?.pending || { group: [], category: [], subcategory: [] };
    const open = (t) => pending[t].filter((p) => !p.state).length;
    const totalOpen = open("group") + open("category") + open("subcategory");
    const batch = stats.queued + stats.running + stats.done + stats.failed;
    const pct = batch ? Math.round(((stats.done + stats.failed) / batch) * 100) : 0;

    return (
        <main className="mx-auto min-h-screen w-full max-w-screen-xl min-w-0 px-3 pb-10 pt-3 sm:px-5 lg:px-8">
            <div className="mt-2 flex items-start gap-3 sm:items-center">
                <button onClick={() => navigate(-1)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: C.hair, color: C.ink }} aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
                <div className="min-w-0 flex-1">
                    <h1 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-extrabold tracking-tight" style={{ color: C.ink }}>AI banner studio</h1>
                    <p className="mt-1 max-w-2xl text-[12px] font-medium leading-relaxed sm:text-[13px]" style={{ color: C.muted }}>
                        Creates brand-styled images in all four sizes (16:9, 4:3, 1:1, 3:4) for anything that doesn't have one yet, using what is actually listed under each group, subcategory and category.
                    </p>
                </div>
            </div>

            {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{error}</p>}
            {info && <p className="mt-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ background: C.hairSoft, color: C.ink }}>{info}</p>}
            {data && !data.configured && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-800">OpenAI isn't set up yet. Add OPENAI_API_KEY to the server environment and restart.</p>
            )}

            <section className="mt-4 rounded-2xl border bg-white p-3 sm:p-4" style={{ borderColor: C.hair }}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <Switch on={publish} onChange={setPublish} label="Publish automatically" />
                        <div>
                            <p className="text-[13px] font-extrabold" style={{ color: C.ink }}>Publish automatically</p>
                            <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>
                                {publish ? "Images go live as soon as they are made." : "Recommended: images are saved hidden so you can review them first."}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {working && (
                            <button onClick={stop} disabled={busy} className="flex min-h-10 items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-bold disabled:opacity-50" style={{ borderColor: C.hair, color: "#b91c1c" }}>
                                <Square className="h-3.5 w-3.5" /> Stop waiting items
                            </button>
                        )}
                        <button onClick={() => run({ scope: "all" })} disabled={busy || !data?.configured || totalOpen === 0}
                            className="flex min-h-10 items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.primary }}>
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate all pending ({totalOpen})
                        </button>
                    </div>
                </div>

                {batch > 0 && (
                    <div className="mt-4">
                        <div className="flex items-center justify-between text-[12px] font-bold" style={{ color: C.muted }}>
                            <span>Last 24 hours · {stats.queued} waiting · {stats.running} generating · {stats.done} done · {stats.failed} failed</span>
                            <span>{pct}%</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: C.hairSoft }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: GREEN }} />
                        </div>
                    </div>
                )}
            </section>

            <div className="mt-4 grid grid-cols-1 gap-1 rounded-xl border p-1 sm:grid-cols-3" style={{ borderColor: C.hair, background: "#fafbfb" }} role="tablist">
                {Object.keys(TYPE_LABEL).map((t) => (
                    <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="min-h-10 rounded-lg px-3 py-2 text-[12.5px] font-bold"
                        style={{ background: tab === t ? C.primary : "transparent", color: tab === t ? "#fff" : C.muted }}>
                        {TYPE_LABEL[t]} ({pending[t].length} pending)
                    </button>
                ))}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-[12px] font-medium" style={{ color: C.muted }}>Items with no image yet.</p>
                <button onClick={() => run({ scope: tab })} disabled={busy || !data?.configured || open(tab) === 0}
                    className="rounded-xl border bg-white px-3 py-2 text-[12.5px] font-bold disabled:opacity-50" style={{ borderColor: C.hair, color: C.secondary }}>
                    Generate pending {TYPE_LABEL[tab].toLowerCase()} ({open(tab)})
                </button>
            </div>

            <div className="mt-2 flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
                {!data ? <div className="h-16 animate-pulse rounded-2xl" style={{ background: C.hairSoft }} />
                    : pending[tab].length === 0
                        ? <p className="rounded-2xl border bg-white px-4 py-10 text-center text-[13px] font-semibold" style={{ borderColor: C.hair, color: C.muted }}>Nothing pending here. 🎉</p>
                        : pending[tab].map((p) => (
                            <article key={p.id} className="flex items-center gap-3 rounded-2xl border bg-white px-3 py-2.5" style={{ borderColor: C.hair }}>
                                <div className="min-w-0 flex-1">
                                    <p className="break-words text-[13.5px] font-extrabold" style={{ color: C.ink }}>{p.name}</p>
                                    {p.sub && <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>{p.sub}</p>}
                                </div>
                                {p.state
                                    ? <Chip tone={p.state === "running" ? "warn" : "neutral"}>{p.state === "running" ? "Generating…" : "Queued"}</Chip>
                                    : <button onClick={() => run({ items: [{ type: tab, id: p.id, name: p.name }] })} disabled={busy || !data.configured}
                                        className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-bold disabled:opacity-50" style={{ borderColor: C.hair, color: C.secondary }}>
                                        <Sparkles className="h-3.5 w-3.5" /> Generate
                                    </button>}
                            </article>
                        ))}
            </div>

            <div className="mt-6 flex items-center justify-between">
                <h2 className="text-[15px] font-extrabold" style={{ color: C.ink }}>Recent results</h2>
                <button onClick={load} className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: C.secondary }}><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
            </div>
            <div className="mt-2 flex flex-col gap-2">
                {(data?.recent || []).length === 0
                    ? <p className="rounded-2xl border bg-white px-4 py-8 text-center text-[13px] font-semibold" style={{ borderColor: C.hair, color: C.muted }}>No generations yet.</p>
                    : data.recent.map((j) => (
                        <article key={j.id} className="flex items-center gap-3 rounded-2xl border bg-white p-2.5" style={{ borderColor: C.hair }}>
                            <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border" style={{ borderColor: C.hair, background: C.hairSoft }}>
                                {j.preview ? <img src={resizedImageUrl(j.preview, { width: 320 })} alt="" loading="lazy" className="h-full w-full object-cover" />
                                    : j.status === "running" ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: C.muted }} /> : null}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <p className="break-words text-[13px] font-extrabold" style={{ color: C.ink }}>{j.entity_name || "—"}</p>
                                    <Chip tone="neutral">{TYPE_ONE[j.entity_type]}</Chip>
                                    <Chip tone={TONE[j.status]}>{j.status}</Chip>
                                    {j.status === "done" && !j.note && j.is_active === false && <Chip tone="warn">Hidden · needs review</Chip>}
                                </div>
                                {j.error && <p className="mt-0.5 break-words text-[11.5px] font-medium text-red-700">{j.error}</p>}
                                {j.note && <p className="mt-0.5 text-[11.5px] font-medium" style={{ color: C.muted }}>{j.note}</p>}
                            </div>
                            <div className="flex shrink-0 flex-col gap-1.5">
                                {j.status === "done" && !j.note && j.preview && (
                                    <>
                                        <button onClick={() => navigate(j.entity_type === "group" ? "/admin/group-banners" : "/admin/entity-banners")}
                                            className="rounded-lg border px-2.5 py-1 text-[11.5px] font-bold" style={{ borderColor: C.hair, color: C.secondary }}>Review</button>
                                        {j.ai_generated && (
                                            <button onClick={() => run({ items: [{ type: j.entity_type, id: j.entity_id, name: j.entity_name, force: true }] })} disabled={busy}
                                                className="rounded-lg border px-2.5 py-1 text-[11.5px] font-bold disabled:opacity-50" style={{ borderColor: C.hair, color: C.ink }}>Regenerate</button>
                                        )}
                                    </>
                                )}
                            </div>
                        </article>
                    ))}
            </div>
        </main>
    );
}