// pages/admin/AdminAiBannersPage.jsx — AI image generation for groups, categories and subcategories:
// fill missing sizes, or pick individual sizes to generate / replace.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Sparkles, RefreshCw, Square, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { C } from "../../components/catalog/tokens";
import { Chip } from "../../components/orders/disputeUi.jsx";
import { SHAPE_LIST, SHAPE_BY_KEY } from "../../components/home/bannerShapes.js";
import { resizedImageUrl } from "../../utils/imageUrl";
import { fetchAiOverview, enqueueAiBanners, cancelAiBanners } from "../../utils/api.aiBanners.js";

const GREEN = "#22A06B";
const TYPE_LABEL = { group: "Product groups", category: "Categories", subcategory: "Subcategories" };
const TYPE_ONE = { group: "Group", category: "Category", subcategory: "Subcategory" };
const TONE = { queued: "neutral", running: "warn", done: "success", failed: "danger", cancelled: "neutral" };
const FILTERS = [
    { k: "work", t: "Needs work" },
    { k: "none", t: "No images" },
    { k: "partial", t: "Partly done" },
    { k: "all", t: "All" },
];
const matchesFilter = (p, f) =>
    f === "all" ? true
        : f === "work" ? p.missing.length > 0
            : f === "none" ? p.have.length === 0
                : p.have.length > 0 && p.missing.length > 0;
const labelsOf = (keys) => keys.map((k) => SHAPE_BY_KEY[k]?.label || k).join(", ");

function Switch({ on, onChange, label }) {
    return (
        <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
            className="relative h-5 w-9 shrink-0 rounded-full transition-colors" style={{ background: on ? GREEN : "#D9DEE2" }}>
            <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform" style={{ transform: on ? "translateX(16px)" : "none" }} />
        </button>
    );
}

// Four small tags: green = exists, dashed = missing.
function ShapeStrip({ have }) {
    return (
        <span className="inline-flex flex-wrap gap-1">
            {SHAPE_LIST.map((s) => {
                const ok = have.includes(s.key);
                return (
                    <span key={s.key} className="rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold"
                        style={ok
                            ? { borderColor: "#22A06B66", background: "#22A06B14", color: "#157a50" }
                            : { borderColor: C.hair, borderStyle: "dashed", color: C.muted }}>
                        {ok ? "✓ " : ""}{s.label}
                    </span>
                );
            })}
        </span>
    );
}

function ItemRow({ p, type, busy, configured, open, onToggle, sel, onSel, onRun }) {
    const selected = sel ?? p.missing;
    const overwrite = selected.filter((k) => p.have.includes(k));
    const toggleShape = (k) => onSel(selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k]);

    const runSelected = () => {
        if (!selected.length) return;
        if (overwrite.length) {
            const manual = p.ai === false ? " Some of the current images were uploaded by hand." : "";
            if (!window.confirm(`This replaces the existing ${labelsOf(overwrite)} image${overwrite.length > 1 ? "s" : ""} for “${p.name}”.${manual} Continue?`)) return;
        }
        onRun({ items: [{ type, id: p.id, name: p.name, shapes: selected, force: overwrite.length > 0 }] });
    };

    return (
        <article className="rounded-2xl border bg-white" style={{ borderColor: C.hair }}>
            <div className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border" style={{ borderColor: C.hair, background: C.hairSoft }}>
                    {p.preview
                        ? <img src={resizedImageUrl(p.preview, { width: 320 })} alt="" loading="lazy" className="h-full w-full object-cover" />
                        : <span className="text-[10px] font-bold" style={{ color: C.muted }}>No image</span>}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="break-words text-[13.5px] font-extrabold" style={{ color: C.ink }}>{p.name}</p>
                    {p.sub && <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>{p.sub}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <ShapeStrip have={p.have} />
                        {p.have.length > 0 && p.active === false && <Chip tone="warn">Hidden</Chip>}
                        {p.have.length > 0 && p.ai === false && <Chip tone="neutral">Manual</Chip>}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    {p.state ? (
                        <Chip tone={p.state === "running" ? "warn" : "neutral"}>{p.state === "running" ? "Generating…" : "Queued"}</Chip>
                    ) : (
                        <>
                            {p.missing.length > 0 && (
                                <button onClick={() => onRun({ items: [{ type, id: p.id, name: p.name, shapes: p.missing }] })} disabled={busy || !configured}
                                    className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-bold disabled:opacity-50" style={{ borderColor: C.hair, color: C.secondary }}>
                                    <Sparkles className="h-3.5 w-3.5" /> Generate missing ({p.missing.length})
                                </button>
                            )}
                            <button onClick={onToggle} aria-expanded={open} aria-label="Choose sizes"
                                className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white hover:bg-black/[0.04]" style={{ borderColor: C.hair, color: C.ink }}>
                                <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {open && !p.state && (
                <div className="border-t px-3 pb-3 pt-2.5" style={{ borderColor: C.hair }}>
                    <p className="text-[12px] font-bold" style={{ color: C.ink }}>Choose which sizes to generate</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {SHAPE_LIST.map((s) => {
                            const has = p.have.includes(s.key);
                            const on = selected.includes(s.key);
                            return (
                                <label key={s.key} className="flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-[12px] font-bold"
                                    style={{ borderColor: on ? C.primary : C.hair, background: on ? `${C.primary}0D` : "#fff", color: C.ink }}>
                                    <input type="checkbox" checked={on} onChange={() => toggleShape(s.key)} />
                                    <span className="flex flex-col leading-tight">
                                        <span>{s.label}</span>
                                        <span className="text-[10.5px] font-semibold" style={{ color: has ? "#b45309" : C.muted }}>{has ? "exists · replaces" : "missing"}</span>
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                    {overwrite.length > 0 && (
                        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] font-semibold text-amber-800">
                            Will replace the existing {labelsOf(overwrite)} image{overwrite.length > 1 ? "s" : ""}.
                        </p>
                    )}
                    <div className="mt-2.5 flex flex-wrap gap-2">
                        <button onClick={runSelected} disabled={busy || !configured || !selected.length}
                            className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: C.primary }}>
                            <Sparkles className="h-3.5 w-3.5" /> {overwrite.length ? "Regenerate" : "Generate"} {selected.length} size{selected.length === 1 ? "" : "s"}
                        </button>
                        <button onClick={() => onSel(SHAPE_LIST.map((s) => s.key))} className="rounded-xl border px-3 py-2 text-[12px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>All sizes</button>
                        <button onClick={() => onSel(p.missing)} className="rounded-xl border px-3 py-2 text-[12px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>Only missing</button>
                    </div>
                </div>
            )}
        </article>
    );
}

export default function AdminAiBannersPage() {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [info, setInfo] = useState(null);
    const [tab, setTab] = useState("group");
    const [filter, setFilter] = useState("work");
    const [query, setQuery] = useState("");
    const [openId, setOpenId] = useState(null);
    const [sel, setSel] = useState({});       // { [id]: shapeKey[] }
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
        setOpenId(null);
        load();
    };
    const stop = async () => {
        setBusy(true);
        const res = await cancelAiBanners(token);
        setBusy(false);
        if (res.success) setInfo(`Stopped ${res.cancelled} waiting item${res.cancelled === 1 ? "" : "s"}.`);
        load();
    };

    const coverage = data?.coverage || { group: [], category: [], subcategory: [] };
    const openCount = (t) => coverage[t].filter((p) => p.missing.length > 0 && !p.state).length;   // items that can be queued now
    const needCount = (t) => coverage[t].filter((p) => p.missing.length > 0).length;               // items missing something
    const totalOpen = openCount("group") + openCount("category") + openCount("subcategory");
    const batch = stats.queued + stats.running + stats.done + stats.failed;
    const pct = batch ? Math.round(((stats.done + stats.failed) / batch) * 100) : 0;

    const list = useMemo(() => {
        const s = query.trim().toLowerCase();
        return coverage[tab].filter((p) => matchesFilter(p, filter) && (!s || p.name.toLowerCase().includes(s) || (p.sub || "").toLowerCase().includes(s)));
    }, [coverage, tab, filter, query]);

    const filterCount = (f) => coverage[tab].filter((p) => matchesFilter(p, f)).length;

    return (
        <main className="mx-auto min-h-screen w-full max-w-screen-xl min-w-0 px-3 pb-10 pt-3 sm:px-5 lg:px-8">
            <div className="mt-2 flex items-start gap-3 sm:items-center">
                <button onClick={() => navigate(-1)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: C.hair, color: C.ink }} aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
                <div className="min-w-0 flex-1">
                    <h1 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-extrabold tracking-tight" style={{ color: C.ink }}>AI banner studio</h1>
                    <p className="mt-1 max-w-2xl text-[12px] font-medium leading-relaxed sm:text-[13px]" style={{ color: C.muted }}>
                        Creates brand-styled images in all four sizes (16:9, 4:3, 1:1, 3:4). Fill in whatever is missing, or pick individual sizes to generate or replace.
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
                                {publish ? "New banners go live as soon as they are made." : "Recommended: new banners are saved hidden so you can review them first."}
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
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate all missing ({totalOpen})
                        </button>
                    </div>
                </div>
                <p className="mt-2 text-[11.5px] font-medium" style={{ color: C.muted }}>
                    “Generate missing” only creates sizes that don't exist yet. Existing images are never changed unless you choose “Regenerate” on a size.
                </p>

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
                    <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setOpenId(null); }} className="min-h-10 rounded-lg px-3 py-2 text-[12.5px] font-bold"
                        style={{ background: tab === t ? C.primary : "transparent", color: tab === t ? "#fff" : C.muted }}>
                        {TYPE_LABEL[t]} ({needCount(t)} need work)
                    </button>
                ))}
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1">
                    {FILTERS.map((f) => (
                        <button key={f.k} onClick={() => setFilter(f.k)} className="rounded-full border px-3 py-1.5 text-[12px] font-bold"
                            style={{ borderColor: filter === f.k ? C.primary : C.hair, background: filter === f.k ? `${C.primary}12` : "#fff", color: filter === f.k ? C.primary : C.muted }}>
                            {f.t} ({filterCount(f.k)})
                        </button>
                    ))}
                </div>
                <button onClick={() => run({ scope: tab })} disabled={busy || !data?.configured || openCount(tab) === 0}
                    className="rounded-xl border bg-white px-3 py-2 text-[12.5px] font-bold disabled:opacity-50" style={{ borderColor: C.hair, color: C.secondary }}>
                    Generate missing in {TYPE_LABEL[tab].toLowerCase()} ({openCount(tab)})
                </button>
            </div>

            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${TYPE_LABEL[tab].toLowerCase()}…`}
                className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5 text-[13px] font-medium outline-none" style={{ borderColor: C.hair }} />

            <div className="mt-2 flex max-h-[560px] flex-col gap-2 overflow-y-auto pr-1">
                {!data ? <div className="h-16 animate-pulse rounded-2xl" style={{ background: C.hairSoft }} />
                    : list.length === 0
                        ? <p className="rounded-2xl border bg-white px-4 py-10 text-center text-[13px] font-semibold" style={{ borderColor: C.hair, color: C.muted }}>
                            {filter === "work" && !query ? "Nothing missing here. 🎉" : "Nothing matches."}
                        </p>
                        : list.map((p) => (
                            <ItemRow key={p.id} p={p} type={tab} busy={busy} configured={!!data.configured}
                                open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)}
                                sel={sel[p.id]} onSel={(v) => setSel((s) => ({ ...s, [p.id]: v }))} onRun={run} />
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
                                    <Chip tone="neutral">{j.shapes?.length ? labelsOf(j.shapes) : "All sizes"}</Chip>
                                    {j.status === "done" && !j.note && j.is_active === false && <Chip tone="warn">Hidden · needs review</Chip>}
                                </div>
                                {j.error && <p className="mt-0.5 break-words text-[11.5px] font-medium text-red-700">{j.error}</p>}
                                {j.note && <p className="mt-0.5 text-[11.5px] font-medium" style={{ color: C.muted }}>{j.note}</p>}
                            </div>
                            <div className="flex shrink-0 flex-col gap-1.5">
                                {j.status === "done" && !j.note && j.preview && (
                                    <>
                                        <button onClick={() => navigate(j.entity_type === "group" ? "/group-banners" : "/entity-banners")}
                                            className="rounded-lg border px-2.5 py-1 text-[11.5px] font-bold" style={{ borderColor: C.hair, color: C.secondary }}>Review</button>
                                        {j.ai_generated && (
                                            <button disabled={busy}
                                                onClick={() => {
                                                    if (!window.confirm(`Regenerate ${j.shapes?.length ? labelsOf(j.shapes) : "all sizes"} for “${j.entity_name}”? This replaces the current image${j.shapes?.length === 1 ? "" : "s"}.`)) return;
                                                    run({ items: [{ type: j.entity_type, id: j.entity_id, name: j.entity_name, shapes: j.shapes || undefined, force: true }] });
                                                }}
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