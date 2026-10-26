// pages/admin/AdminGroupBannersPage.jsx — create / replace / hide / delete / reorder Home page group banners.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUp, ArrowDown, ImagePlus, Loader2, Pencil, Trash2, RefreshCw, X, Monitor, Smartphone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { C } from "../../components/catalog/tokens";
import { Chip } from "../../components/orders/disputeUi.jsx";
import GroupBannerCarousel from "../../components/home/GroupBannerCarousel.jsx";
import { resizedImageUrl } from "../../utils/imageUrl";
import {
    fetchAdminGroupBanners, saveGroupBanner, patchGroupBanner,
    deleteGroupBanner, reorderGroupBanners, scanGroupsNow,
} from "../../utils/api.groupBanners.js";

const GREEN = "#22A06B";
const MAX_OUT_BYTES = 1.8 * 1024 * 1024;
const MIN_SRC_WIDTH = 960;
const MAX_SRC_BYTES = 20 * 1024 * 1024;
const NEW_MS = 7 * 24 * 60 * 60 * 1000;
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }) : "—";

/* ───────────────────────── small pieces ───────────────────────── */
function Switch({ on, onChange, disabled, label }) {
    return (
        <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
            className="relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50" style={{ background: on ? GREEN : "#D9DEE2" }}>
            <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform" style={{ transform: on ? "translateX(16px)" : "none" }} />
        </button>
    );
}

function Thumb({ url, className = "w-40 sm:w-52" }) {
    return (
        <div className={`relative aspect-video shrink-0 overflow-hidden rounded-xl border ${className}`} style={{ borderColor: C.hair, background: C.hairSoft }}>
            {url
                ? <img src={resizedImageUrl(url, { width: 640 })} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                : <span className="flex h-full w-full items-center justify-center text-[10.5px] font-bold" style={{ color: C.muted }}>No banner</span>}
        </div>
    );
}

function ErrorLine({ children }) {
    return children ? <p role="alert" className="mt-3 break-words rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{children}</p> : null;
}

/* ───────────────────────── crop to exactly 16:9 and compress ───────────────────────── */
const toBlob = (canvas, type, q) => new Promise((r) => canvas.toBlob(r, type, q));

async function renderBanner(img, fx, fy) {
    const R = 16 / 9;
    const sw = img.naturalWidth, sh = img.naturalHeight;
    let cw, ch, sx, sy;
    if (sw / sh > R) { ch = sh; cw = sh * R; sx = (sw - cw) * fx; sy = 0; }
    else { cw = sw; ch = sw / R; sx = 0; sy = (sh - ch) * fy; }

    const outW = Math.min(1600, Math.round(cw));
    const outH = Math.round((outW * 9) / 16);
    const canvas = document.createElement("canvas");
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, sx, sy, cw, ch, 0, 0, outW, outH);

    for (const q of [0.86, 0.76, 0.66, 0.55]) {
        const b = await toBlob(canvas, "image/webp", q);
        if (!b || b.type !== "image/webp") break;        // browser can't encode webp -> JPEG below
        if (b.size <= MAX_OUT_BYTES) return b;
    }
    for (const q of [0.88, 0.78, 0.68, 0.55]) {
        const b = await toBlob(canvas, "image/jpeg", q);
        if (b && b.size <= MAX_OUT_BYTES) return b;
    }
    return null;
}

/* ───────────────────────── editor ───────────────────────── */
function BannerEditor({ group, token, onClose, onSaved }) {
    const existing = group.banner;
    const [file, setFile] = useState(null);
    const [srcUrl, setSrcUrl] = useState(null);
    const [img, setImg] = useState(null);
    const [fx, setFx] = useState(0.5);
    const [fy, setFy] = useState(0.5);
    const [alt, setAlt] = useState(existing?.alt_text || "");
    const [active, setActive] = useState(existing?.is_active ?? true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => () => { if (srcUrl) URL.revokeObjectURL(srcUrl); }, [srcUrl]);
    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && !saving && onClose();
        window.addEventListener("keydown", onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
    }, [onClose, saving]);

    const pick = (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        setError(null);
        if (!f.type.startsWith("image/")) return setError("Please choose an image file.");
        if (f.size > MAX_SRC_BYTES) return setError("That image is over 20 MB. Choose a smaller one.");
        const url = URL.createObjectURL(f);
        const el = new Image();
        el.onload = () => {
            if (el.naturalWidth < MIN_SRC_WIDTH) { URL.revokeObjectURL(url); return setError(`Image is too small. Use at least ${MIN_SRC_WIDTH}px wide (1600×900 is ideal).`); }
            setFile(f); setSrcUrl(url); setImg(el); setFx(0.5); setFy(0.5);
        };
        el.onerror = () => { URL.revokeObjectURL(url); setError("Couldn't read that image."); };
        el.src = url;
    };

    const ratio = img ? img.naturalWidth / img.naturalHeight : 16 / 9;
    const needsCrop = img && Math.abs(ratio - 16 / 9) > 0.01;
    const wide = ratio > 16 / 9;

    const save = async () => {
        setSaving(true); setError(null);
        let res;
        if (file && img) {
            const blob = await renderBanner(img, fx, fy);
            if (!blob) { setSaving(false); return setError("Couldn't compress the image under 2 MB. Try a simpler image."); }
            const form = new FormData();
            form.append("image", blob, `banner.${blob.type === "image/webp" ? "webp" : "jpg"}`);
            form.append("altText", alt);
            form.append("isActive", String(active));
            res = await saveGroupBanner(token, group.group_id, form);
        } else {
            res = await patchGroupBanner(token, group.group_id, { altText: alt, isActive: active });
        }
        setSaving(false);
        if (!res?.success) return setError(res?.message || "Couldn't save the banner.");
        onSaved();
    };

    const canSave = !saving && (file || existing);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Edit banner">
            <button className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => !saving && onClose()} />
            <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:max-w-xl sm:rounded-3xl sm:p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-[16px] font-extrabold" style={{ color: C.ink }}>{existing ? "Edit banner" : "Add banner"}</h2>
                        <p className="mt-0.5 truncate text-[12.5px] font-semibold" style={{ color: C.muted }}>{group.name} · {group.variant_count} variants</p>
                    </div>
                    <button onClick={onClose} disabled={saving} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: C.hair }} aria-label="Close"><X className="h-4 w-4" /></button>
                </div>

                <div className="relative mt-4 aspect-video w-full overflow-hidden rounded-2xl border" style={{ borderColor: C.hair, background: C.hairSoft }}>
                    {srcUrl
                        ? <img src={srcUrl} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${fx * 100}% ${fy * 100}%` }} />
                        : existing
                            ? <img src={resizedImageUrl(existing.image_url, { width: 1280 })} alt="" className="h-full w-full object-cover" />
                            : <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-center text-[12px] font-semibold" style={{ color: C.muted }}><ImagePlus className="h-6 w-6" />16:9 preview</div>}
                </div>

                <label className="mt-3 flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border bg-white px-3 py-2 text-[12.5px] font-bold hover:bg-black/[0.03]" style={{ borderColor: C.hair, color: C.secondary }}>
                    <ImagePlus className="h-4 w-4" /> {existing || file ? "Choose a different image" : "Choose image"}
                    <input type="file" accept="image/*" className="sr-only" onChange={pick} />
                </label>
                <p className="mt-2 text-[11.5px] font-medium leading-relaxed" style={{ color: C.muted }}>
                    Best size 1600×900 (16:9). Anything else is cropped to 16:9 automatically. Keep text and logos within the centre 80%.
                </p>

                {needsCrop && (
                    <div className="mt-3 rounded-xl p-3" style={{ background: C.hairSoft }}>
                        <p className="text-[12px] font-bold" style={{ color: C.ink }}>This image isn't 16:9. Choose what stays visible:</p>
                        <label className="mt-2 flex items-center gap-3 text-[12px] font-semibold" style={{ color: C.muted }}>
                            <span className="w-16 shrink-0">{wide ? "Left ↔ Right" : "Top ↔ Bottom"}</span>
                            <input type="range" min={0} max={100} value={Math.round((wide ? fx : fy) * 100)}
                                onChange={(e) => (wide ? setFx : setFy)(Number(e.target.value) / 100)} className="w-full" />
                        </label>
                    </div>
                )}

                <label className="mt-4 block text-[12px] font-bold" style={{ color: C.ink }}>
                    Description for screen readers <span className="font-medium" style={{ color: C.muted }}>(optional)</span>
                    <input value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={140} placeholder={group.name}
                        className="mt-1 w-full rounded-xl border px-3 py-2 text-[13px] font-medium outline-none" style={{ borderColor: C.hair }} />
                </label>

                <div className="mt-4 flex items-center justify-between rounded-xl border px-3 py-2.5" style={{ borderColor: C.hair }}>
                    <div>
                        <p className="text-[13px] font-extrabold" style={{ color: C.ink }}>Show on Home page</p>
                        <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>When off, buyers see the normal group card.</p>
                    </div>
                    <Switch on={active} onChange={setActive} label="Show on Home page" />
                </div>

                <ErrorLine>{error}</ErrorLine>

                <div className="mt-4 flex gap-2">
                    <button onClick={onClose} disabled={saving} className="flex-1 rounded-xl border py-2.5 text-[13px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>Cancel</button>
                    <button onClick={save} disabled={!canSave} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.primary }}>
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save banner
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ───────────────────────── rows ───────────────────────── */
function GroupItem({ g, onEdit }) {
    const isNew = !g.banner && g.is_active && Date.now() - new Date(g.first_seen_at).getTime() < NEW_MS;
    return (
        <article className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-white p-3 sm:flex-row sm:items-center sm:p-3.5" style={{ borderColor: isNew ? "#f59e0b80" : C.hair }}>
            <Thumb url={g.banner?.image_url} className="w-full sm:w-52" />
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="break-words text-[14px] font-extrabold" style={{ color: C.ink }}>{g.name}</h3>
                    {isNew && <Chip tone="warn">New</Chip>}
                    {!g.is_active && <Chip tone="neutral">Not a group now</Chip>}
                    {g.banner && <Chip tone={g.banner.is_active ? "success" : "neutral"}>{g.banner.is_active ? "Live" : "Hidden"}</Chip>}
                </div>
                <p className="mt-1 text-[12px] font-medium" style={{ color: C.muted }}>
                    {g.category_name ? `${g.category_name} · ` : ""}{g.variant_count} variants · first seen {fmtDate(g.first_seen_at)}
                </p>
            </div>
            <button onClick={() => onEdit(g)} className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-4 py-2 text-[12.5px] font-bold hover:bg-black/[0.03]" style={{ borderColor: C.hair, color: C.secondary }}>
                {g.banner ? <><Pencil className="h-3.5 w-3.5" /> Replace / edit</> : <><ImagePlus className="h-3.5 w-3.5" /> Add banner</>}
            </button>
        </article>
    );
}

function OrderItem({ g, pos, total, busy, onMove, onToggle, onEdit, onDelete }) {
    const iconBtn = "flex h-8 w-8 items-center justify-center rounded-lg border bg-white hover:bg-black/[0.04] disabled:opacity-30";
    return (
        <article className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-white p-3 sm:flex-row sm:items-center" style={{ borderColor: C.hair, opacity: g.is_active ? 1 : 0.75 }}>
            <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold tabular-nums" style={{ background: C.hairSoft, color: C.ink }}>{pos + 1}</span>
                <Thumb url={g.banner.image_url} className="w-full sm:w-44" />
            </div>
            <div className="min-w-0 flex-1">
                <h3 className="break-words text-[13.5px] font-extrabold" style={{ color: C.ink }}>{g.name}</h3>
                <p className="mt-0.5 text-[11.5px] font-medium" style={{ color: C.muted }}>{g.variant_count} variants · updated {fmtDate(g.banner.updated_at)}</p>
                {!g.is_active && <div className="mt-1"><Chip tone="neutral">Not a group now (not shown)</Chip></div>}
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
                <div className="flex items-center gap-2">
                    <Switch on={g.banner.is_active} onChange={(v) => onToggle(g, v)} disabled={busy} label="Show on Home page" />
                    <span className="text-[11.5px] font-bold" style={{ color: C.muted }}>{g.banner.is_active ? "Live" : "Hidden"}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button className={iconBtn} style={{ borderColor: C.hair }} disabled={busy || pos === 0} onClick={() => onMove(g.group_id, -1)} aria-label="Move earlier"><ArrowUp className="h-4 w-4" /></button>
                    <button className={iconBtn} style={{ borderColor: C.hair }} disabled={busy || pos === total - 1} onClick={() => onMove(g.group_id, 1)} aria-label="Move later"><ArrowDown className="h-4 w-4" /></button>
                    <button className={iconBtn} style={{ borderColor: C.hair, color: C.secondary }} disabled={busy} onClick={() => onEdit(g)} aria-label="Edit banner"><Pencil className="h-4 w-4" /></button>
                    <button className={iconBtn} style={{ borderColor: C.hair, color: "#b91c1c" }} disabled={busy} onClick={() => onDelete(g)} aria-label="Delete banner"><Trash2 className="h-4 w-4" /></button>
                </div>
            </div>
        </article>
    );
}

/* ───────────────────────── page ───────────────────────── */
export default function AdminGroupBannersPage() {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [groups, setGroups] = useState([]);
    const [order, setOrder] = useState([]);
    const [lastScanAt, setLastScanAt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState("attention");
    const [editing, setEditing] = useState(null);
    const [confirmDel, setConfirmDel] = useState(null);
    const [busy, setBusy] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [previewMode, setPreviewMode] = useState("desktop");
    const [query, setQuery] = useState("");

    const load = useCallback(async ({ silent } = {}) => {
        if (!silent) setLoading(true);
        const res = await fetchAdminGroupBanners(token);
        if (res.aborted) return;
        if (res.success) { setGroups(res.groups); setOrder(res.order); setLastScanAt(res.lastScanAt); setError(null); }
        else setError(res.message || "Couldn't load groups.");
        setLoading(false);
    }, [token]);
    useEffect(() => { load(); }, [load]);

    const byId = useMemo(() => new Map(groups.map((g) => [g.group_id, g])), [groups]);
    const needing = useMemo(() => groups.filter((g) => g.is_active && !g.banner), [groups]);
    const ordered = useMemo(() => order.map((id) => byId.get(id)).filter((g) => g?.banner), [order, byId]);
    const previewBanners = useMemo(
        () => ordered.filter((g) => g.is_active && g.banner.is_active).map((g) => ({
            group_id: g.group_id, name: g.name, variant_count: g.variant_count, image_url: g.banner.image_url, alt_text: g.banner.alt_text,
        })),
        [ordered]
    );
    const filteredAll = useMemo(() => {
        const s = query.trim().toLowerCase();
        return s ? groups.filter((g) => g.name.toLowerCase().includes(s) || (g.category_name || "").toLowerCase().includes(s)) : groups;
    }, [groups, query]);

    const scan = async () => {
        setScanning(true); setError(null);
        const res = await scanGroupsNow(token);
        setScanning(false);
        if (!res.success) return setError(res.message || "Scan failed.");
        load({ silent: true });
    };

    const move = async (id, dir) => {
        const i = order.indexOf(id), j = i + dir;
        if (i < 0 || j < 0 || j >= order.length) return;
        const next = [...order];
        [next[i], next[j]] = [next[j], next[i]];
        const prev = order;
        setOrder(next);
        const res = await reorderGroupBanners(token, next);
        if (!res.success) { setOrder(prev); setError(res.message || "Couldn't save the new order."); }
    };

    const toggle = async (g, value) => {
        const apply = (v) => setGroups((list) => list.map((x) => (x.group_id === g.group_id ? { ...x, banner: { ...x.banner, is_active: v } } : x)));
        apply(value);
        const res = await patchGroupBanner(token, g.group_id, { isActive: value });
        if (!res.success) { apply(!value); setError(res.message || "Couldn't update the banner."); }
    };

    const remove = async () => {
        setBusy(true);
        const res = await deleteGroupBanner(token, confirmDel.group_id);
        setBusy(false);
        if (!res.success) return setError(res.message || "Couldn't delete the banner.");
        setConfirmDel(null);
        load({ silent: true });
    };

    const TABS = [
        { k: "attention", t: `Needs banner (${needing.length})` },
        { k: "order", t: `Carousel order (${ordered.length})` },
        { k: "all", t: `All groups (${groups.length})` },
    ];

    return (
        <main className="mx-auto min-h-screen w-full max-w-screen-xl min-w-0 px-3 pb-10 pt-3 sm:px-5 lg:px-8">
            <div className="mt-2 flex min-w-0 items-start gap-3 sm:items-center">
                <button onClick={() => navigate(-1)} className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border sm:mt-0" style={{ borderColor: C.hair, color: C.ink }} aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
                <div className="min-w-0 flex-1">
                    <h1 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-extrabold tracking-tight" style={{ color: C.ink }}>Group banners</h1>
                    <p className="mt-1 max-w-2xl text-[12px] font-medium leading-relaxed sm:text-[13px]" style={{ color: C.muted }}>
                        Replace a product group's card with a 16:9 banner on the Home page. Banners appear in one carousel, in the order below.
                    </p>
                </div>
                <button onClick={scan} disabled={scanning} className="flex shrink-0 items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-[12.5px] font-bold disabled:opacity-50" style={{ borderColor: C.hair, color: C.secondary }}>
                    <RefreshCw className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} /> <span className="hidden sm:inline">Scan for new groups</span><span className="sm:hidden">Scan</span>
                </button>
            </div>
            {lastScanAt ? <p className="mt-2 text-[11px] font-medium" style={{ color: C.muted }}>Last scan {fmtDate(new Date(lastScanAt).toISOString())} · scans automatically every 30 minutes</p> : null}
            <ErrorLine>{error}</ErrorLine>

            <div className="mt-4 grid grid-cols-1 gap-1 rounded-xl border p-1 sm:grid-cols-3" style={{ borderColor: C.hair, background: "#fafbfb" }} role="tablist">
                {TABS.map(({ k, t }) => (
                    <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="min-h-10 rounded-lg px-3 py-2 text-[12.5px] font-bold"
                        style={{ background: tab === k ? C.primary : "transparent", color: tab === k ? "#fff" : C.muted }}>{t}</button>
                ))}
            </div>

            {loading ? (
                <div className="mt-4 flex flex-col gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl" style={{ background: C.hairSoft }} />)}</div>
            ) : (
                <>
                    {tab === "attention" && (
                        <div className="mt-4 flex flex-col gap-2.5">
                            {needing.length === 0
                                ? <p className="rounded-2xl border bg-white px-4 py-12 text-center text-[13px] font-semibold" style={{ borderColor: C.hair, color: C.muted }}>Every group has a banner. 🎉 New groups will appear here.</p>
                                : needing.map((g) => <GroupItem key={g.group_id} g={g} onEdit={setEditing} />)}
                        </div>
                    )}

                    {tab === "order" && (
                        <>
                            <section className="mt-4 rounded-2xl border bg-white p-3 sm:p-4" style={{ borderColor: C.hair }}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h2 className="text-[14px] font-extrabold" style={{ color: C.ink }}>Live preview</h2>
                                    <div className="flex gap-1 rounded-lg border p-0.5" style={{ borderColor: C.hair, background: "#fafbfb" }}>
                                        {[["desktop", Monitor, "Desktop"], ["mobile", Smartphone, "Mobile"]].map(([k, Icon, l]) => (
                                            <button key={k} onClick={() => setPreviewMode(k)} className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-bold"
                                                style={{ background: previewMode === k ? C.primary : "transparent", color: previewMode === k ? "#fff" : C.muted }}><Icon className="h-3.5 w-3.5" />{l}</button>
                                        ))}
                                    </div>
                                </div>
                                {previewBanners.length ? (
                                    <div className={`mx-auto mt-2 overflow-hidden rounded-xl border pb-2 ${previewMode === "mobile" ? "max-w-[390px]" : "max-w-7xl"}`} style={{ borderColor: C.hairSoft }}>
                                        <GroupBannerCarousel key={previewMode} banners={previewBanners} perView={previewMode === "mobile" ? 1 : 3} onOpen={() => { }} />
                                    </div>
                                ) : <p className="py-8 text-center text-[13px] font-semibold" style={{ color: C.muted }}>No live banners yet.</p>}
                            </section>

                            <div className="mt-3 flex flex-col gap-2.5">
                                {ordered.length === 0
                                    ? <p className="rounded-2xl border bg-white px-4 py-12 text-center text-[13px] font-semibold" style={{ borderColor: C.hair, color: C.muted }}>Add a banner from “Needs banner” or “All groups”.</p>
                                    : ordered.map((g, i) => (
                                        <OrderItem key={g.group_id} g={g} pos={i} total={ordered.length} busy={busy} onMove={move} onToggle={toggle} onEdit={setEditing} onDelete={setConfirmDel} />
                                    ))}
                            </div>
                            <p className="mt-3 text-[11.5px] font-medium leading-relaxed" style={{ color: C.muted }}>
                                Position 1 is the leftmost banner. Changes reach the Home page within a second or two. Hidden banners and groups that are no longer groups are skipped.
                            </p>
                        </>
                    )}

                    {tab === "all" && (
                        <>
                            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search groups or categories…"
                                className="mt-4 w-full rounded-xl border bg-white px-3 py-2.5 text-[13px] font-medium outline-none" style={{ borderColor: C.hair }} />
                            <div className="mt-3 flex flex-col gap-2.5">
                                {filteredAll.length === 0
                                    ? <p className="rounded-2xl border bg-white px-4 py-12 text-center text-[13px] font-semibold" style={{ borderColor: C.hair, color: C.muted }}>No groups found.</p>
                                    : filteredAll.map((g) => <GroupItem key={g.group_id} g={g} onEdit={setEditing} />)}
                            </div>
                        </>
                    )}
                </>
            )}

            {editing && (
                <BannerEditor group={editing} token={token} onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load({ silent: true }); }} />
            )}

            {confirmDel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="alertdialog" aria-modal="true">
                    <button className="absolute inset-0 bg-black/40" aria-label="Cancel" onClick={() => !busy && setConfirmDel(null)} />
                    <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
                        <h2 className="text-[15px] font-extrabold" style={{ color: C.ink }}>Delete this banner?</h2>
                        <p className="mt-1.5 text-[12.5px] font-medium leading-relaxed" style={{ color: C.muted }}>
                            “{confirmDel.name}” goes back to the normal group card on the Home page. The image is removed permanently.
                        </p>
                        <div className="mt-4 flex gap-2">
                            <button onClick={() => setConfirmDel(null)} disabled={busy} className="flex-1 rounded-xl border py-2.5 text-[13px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>Cancel</button>
                            <button onClick={remove} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 text-[13px] font-bold text-white disabled:opacity-60">
                                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}