// pages/admin/AdminGroupBannersPage.jsx — create / replace / hide / delete / prioritise Home page group banners (multi-shape).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, ArrowDown, ImagePlus, Loader2, Pencil, Trash2, RefreshCw, X, Monitor, Smartphone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { C } from "../../components/catalog/tokens";
import { Chip } from "../../components/orders/disputeUi.jsx";
import GroupBannerBlock from "../../components/home/GroupBannerBlock.jsx";
import { SHAPE_LIST, SHAPE_BY_KEY } from "../../components/home/bannerShapes.js";
import { resizedImageUrl } from "../../utils/imageUrl";
import {
    fetchAdminGroupBanners, saveGroupBanner, patchGroupBanner,
    deleteGroupBanner, reorderGroupBanners, scanGroupsNow,
} from "../../utils/api.groupBanners.js";

const GREEN = "#22A06B";
const MAX_OUT_BYTES = 1.8 * 1024 * 1024;
const MIN_CROP_SIDE = 540;
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

function ShapeChips({ images }) {
    const have = SHAPE_LIST.filter((s) => images?.[s.key]);
    return (
        <span className="inline-flex flex-wrap gap-1">
            {have.map((s) => <Chip key={s.key} tone="neutral">{s.label}</Chip>)}
        </span>
    );
}

/* ───────────────────────── crop to an exact ratio and compress ───────────────────────── */
const toBlob = (canvas, type, q) => new Promise((r) => canvas.toBlob(r, type, q));

function cropRegion(img, ratio) {
    const sw = img.naturalWidth, sh = img.naturalHeight;
    if (sw / sh > ratio) return { cw: sh * ratio, ch: sh, wideSource: true };
    return { cw: sw, ch: sw / ratio, wideSource: false };
}

async function renderBanner(img, ratio, fx, fy) {
    const sw = img.naturalWidth, sh = img.naturalHeight;
    const { cw, ch, wideSource } = cropRegion(img, ratio);
    const sx = wideSource ? (sw - cw) * fx : 0;
    const sy = wideSource ? 0 : (sh - ch) * fy;

    const scale = Math.min(1, 1600 / Math.max(cw, ch));
    const outW = Math.round(cw * scale);
    const outH = Math.round(outW / ratio);
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
    const existingImages = existing?.images || {};
    const [shape, setShape] = useState("wide");
    const [pending, setPending] = useState({});   // { [shape]: { file, srcUrl, img, fx, fy } }
    const [removed, setRemoved] = useState([]);   // optional shapes to delete
    const [alt, setAlt] = useState(existing?.alt_text || "");
    const [active, setActive] = useState(existing?.is_active ?? true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const urlsRef = useRef(new Set());

    useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);
    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && !saving && onClose();
        window.addEventListener("keydown", onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
    }, [onClose, saving]);

    const meta = SHAPE_BY_KEY[shape];
    const cur = pending[shape];
    const hasImage = (k) => !!pending[k] || (!!existingImages[k] && !removed.includes(k));
    const shownUrl = cur ? cur.srcUrl : (existingImages[shape] && !removed.includes(shape) ? resizedImageUrl(existingImages[shape], { width: 960 }) : null);

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
            const { cw, ch } = cropRegion(el, meta.ratio);
            if (Math.min(cw, ch) < MIN_CROP_SIDE) { URL.revokeObjectURL(url); return setError(`Image is too small for ${meta.label}. Use a larger image.`); }
            urlsRef.current.add(url);
            setPending((p) => ({ ...p, [shape]: { file: f, srcUrl: url, img: el, fx: 0.5, fy: 0.5 } }));
            setRemoved((r) => r.filter((s) => s !== shape));
        };
        el.onerror = () => { URL.revokeObjectURL(url); setError("Couldn't read that image."); };
        el.src = url;
    };

    const discardPending = () => {
        if (cur) { URL.revokeObjectURL(cur.srcUrl); urlsRef.current.delete(cur.srcUrl); }
        setPending((p) => { const n = { ...p }; delete n[shape]; return n; });
    };

    const needsCrop = cur && Math.abs(cur.img.naturalWidth / cur.img.naturalHeight - meta.ratio) > 0.01;
    const wideSource = cur && cur.img.naturalWidth / cur.img.naturalHeight > meta.ratio;
    const setPos = (v) => setPending((p) => ({ ...p, [shape]: { ...p[shape], [wideSource ? "fx" : "fy"]: v } }));

    const save = async () => {
        setSaving(true); setError(null);
        let res;
        const keys = Object.keys(pending);
        if (keys.length || removed.length) {
            const form = new FormData();
            for (const k of keys) {
                const p = pending[k];
                const blob = await renderBanner(p.img, SHAPE_BY_KEY[k].ratio, p.fx, p.fy);
                if (!blob) { setSaving(false); return setError(`Couldn't compress the ${SHAPE_BY_KEY[k].label} image under 2 MB. Try a simpler image.`); }
                form.append(k, blob, `${k}.${blob.type === "image/webp" ? "webp" : "jpg"}`);
            }
            if (removed.length) form.append("removeShapes", removed.join(","));
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

    const canSave = !saving && (existing || pending.wide);
    const canRemove = !meta.required && !cur && existingImages[shape] && !removed.includes(shape);

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

                <div className="mt-4 grid grid-cols-4 gap-1 rounded-xl border p-1" style={{ borderColor: C.hair, background: "#fafbfb" }} role="tablist">
                    {SHAPE_LIST.map((s) => (
                        <button key={s.key} role="tab" aria-selected={shape === s.key} onClick={() => { setShape(s.key); setError(null); }}
                            className="flex min-h-10 flex-col items-center justify-center rounded-lg px-1 py-1 text-[12px] font-bold"
                            style={{ background: shape === s.key ? C.primary : "transparent", color: shape === s.key ? "#fff" : C.muted }}>
                            <span>{s.label}</span>
                            <span className="text-[9.5px] font-semibold opacity-80">{hasImage(s.key) ? "✓ added" : s.required ? "required" : "optional"}</span>
                        </button>
                    ))}
                </div>
                <p className="mt-2 text-[11.5px] font-medium leading-relaxed" style={{ color: C.muted }}>
                    {meta.hint}. {meta.required ? "Every group needs this one." : "If you skip it, Home uses the closest size you did add."}
                </p>

                <div className="mx-auto mt-3" style={{ width: `min(100%, ${Math.round(300 * meta.ratio)}px)` }}>
                    <div className="relative w-full overflow-hidden rounded-2xl border" style={{ aspectRatio: meta.ratio, borderColor: C.hair, background: C.hairSoft }}>
                        {shownUrl
                            ? <img src={shownUrl} alt="" className="h-full w-full object-cover" style={cur ? { objectPosition: `${cur.fx * 100}% ${cur.fy * 100}%` } : undefined} />
                            : <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-center text-[12px] font-semibold" style={{ color: C.muted }}><ImagePlus className="h-6 w-6" />{meta.label} preview</div>}
                    </div>
                </div>

                <div className="mt-3 flex gap-2">
                    <label className="flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border bg-white px-3 py-2 text-[12.5px] font-bold hover:bg-black/[0.03]" style={{ borderColor: C.hair, color: C.secondary }}>
                        <ImagePlus className="h-4 w-4" /> {hasImage(shape) ? "Choose a different image" : "Choose image"}
                        <input type="file" accept="image/*" className="sr-only" onChange={pick} />
                    </label>
                    {cur && <button onClick={discardPending} className="rounded-xl border px-3 text-[12.5px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>Discard</button>}
                    {canRemove && <button onClick={() => setRemoved((r) => [...r, shape])} className="rounded-xl border px-3 text-[12.5px] font-bold" style={{ borderColor: C.hair, color: "#b91c1c" }}>Remove</button>}
                    {!meta.required && removed.includes(shape) && <button onClick={() => setRemoved((r) => r.filter((s) => s !== shape))} className="rounded-xl border px-3 text-[12.5px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>Undo remove</button>}
                </div>
                <p className="mt-2 text-[11.5px] font-medium leading-relaxed" style={{ color: C.muted }}>
                    Any image is cropped to exactly {meta.label} automatically. Keep text and logos within the centre 80%.
                </p>

                {needsCrop && (
                    <div className="mt-3 rounded-xl p-3" style={{ background: C.hairSoft }}>
                        <p className="text-[12px] font-bold" style={{ color: C.ink }}>This image isn't {meta.label}. Choose what stays visible:</p>
                        <label className="mt-2 flex items-center gap-3 text-[12px] font-semibold" style={{ color: C.muted }}>
                            <span className="w-16 shrink-0">{wideSource ? "Left ↔ Right" : "Top ↔ Bottom"}</span>
                            <input type="range" min={0} max={100} value={Math.round((wideSource ? cur.fx : cur.fy) * 100)}
                                onChange={(e) => setPos(Number(e.target.value) / 100)} className="w-full" />
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

                {!existing && !pending.wide && <p className="mt-3 text-[12px] font-semibold" style={{ color: C.muted }}>Add the 16:9 image first, then the optional sizes.</p>}
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
                {g.banner && <div className="mt-1.5"><ShapeChips images={g.banner.images} /></div>}
            </div>
            <button onClick={() => onEdit(g)} className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-4 py-2 text-[12.5px] font-bold hover:bg-black/[0.03]" style={{ borderColor: C.hair, color: C.secondary }}>
                {g.banner ? <><Pencil className="h-3.5 w-3.5" /> Replace / edit</> : <><ImagePlus className="h-3.5 w-3.5" /> Add banner</>}
            </button>
        </article>
    );
}

function OrderItem({ g, pos, total, priority, busy, onMove, onToggle, onEdit, onDelete }) {
    const iconBtn = "flex h-8 w-8 items-center justify-center rounded-lg border bg-white hover:bg-black/[0.04] disabled:opacity-30";
    return (
        <article className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-white p-3 sm:flex-row sm:items-center" style={{ borderColor: C.hair, opacity: g.is_active ? 1 : 0.75 }}>
            <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold tabular-nums" style={{ background: C.hairSoft, color: C.ink }}>{pos + 1}</span>
                <Thumb url={g.banner.image_url} className="w-full sm:w-44" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="break-words text-[13.5px] font-extrabold" style={{ color: C.ink }}>{g.name}</h3>
                    {priority && <Chip tone="success">Priority</Chip>}
                </div>
                <p className="mt-0.5 text-[11.5px] font-medium" style={{ color: C.muted }}>{g.variant_count} variants · updated {fmtDate(g.banner.updated_at)}</p>
                <div className="mt-1.5"><ShapeChips images={g.banner.images} /></div>
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
    const [home, setHome] = useState(null);
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
        if (res.success) { setGroups(res.groups); setOrder(res.order); setHome(res.home || null); setLastScanAt(res.lastScanAt); setError(null); }
        else setError(res.message || "Couldn't load groups.");
        setLoading(false);
    }, [token]);
    useEffect(() => { load(); }, [load]);

    const byId = useMemo(() => new Map(groups.map((g) => [g.group_id, g])), [groups]);
    const needing = useMemo(() => groups.filter((g) => g.is_active && !g.banner), [groups]);
    const ordered = useMemo(() => order.map((id) => byId.get(id)).filter((g) => g?.banner), [order, byId]);
    const priorityCount = home?.priorityCount ?? 3;
    const previewById = useMemo(() => new Map((home?.banners || []).map((b) => [String(b.group_id), b])), [home]);
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
        else load({ silent: true });
    };

    const toggle = async (g, value) => {
        const apply = (v) => setGroups((list) => list.map((x) => (x.group_id === g.group_id ? { ...x, banner: { ...x.banner, is_active: v } } : x)));
        apply(value);
        const res = await patchGroupBanner(token, g.group_id, { isActive: value });
        if (!res.success) { apply(!value); setError(res.message || "Couldn't update the banner."); }
        else load({ silent: true });
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
        { k: "order", t: `Priority & preview (${ordered.length})` },
        { k: "all", t: `All groups (${groups.length})` },
    ];
    const mobile = previewMode === "mobile";

    return (
        <main className="mx-auto min-h-screen w-full max-w-screen-xl min-w-0 px-3 pb-10 pt-3 sm:px-5 lg:px-8">
            <div className="mt-2 flex min-w-0 items-start gap-3 sm:items-center">
                <button onClick={() => navigate(-1)} className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border sm:mt-0" style={{ borderColor: C.hair, color: C.ink }} aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
                <div className="min-w-0 flex-1">
                    <h1 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-extrabold tracking-tight" style={{ color: C.ink }}>Group banners</h1>
                    <p className="mt-1 max-w-2xl text-[12px] font-medium leading-relaxed sm:text-[13px]" style={{ color: C.muted }}>
                        Replace a product group's card with a banner. Add the 16:9 image, plus 4:3, 1:1 and 3:4 for variety. Banners are spread through the Home feed in mixed layouts.
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
                                    <div>
                                        <h2 className="text-[14px] font-extrabold" style={{ color: C.ink }}>Today's Home layout</h2>
                                        <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>
                                            {home?.plan?.day ? `Plan for ${home.plan.day} (IST). ` : ""}Same for every buyer today; it reshuffles daily.
                                        </p>
                                    </div>
                                    <div className="flex gap-1 rounded-lg border p-0.5" style={{ borderColor: C.hair, background: "#fafbfb" }}>
                                        {[["desktop", Monitor, "Desktop"], ["mobile", Smartphone, "Mobile"]].map(([k, Icon, l]) => (
                                            <button key={k} onClick={() => setPreviewMode(k)} className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-bold"
                                                style={{ background: previewMode === k ? C.primary : "transparent", color: previewMode === k ? "#fff" : C.muted }}><Icon className="h-3.5 w-3.5" />{l}</button>
                                        ))}
                                    </div>
                                </div>
                                {home?.plan?.blocks?.length ? (
                                    <div className={`mx-auto mt-2 max-h-[70vh] overflow-y-auto rounded-xl border ${mobile ? "max-w-[390px]" : "max-w-5xl"}`} style={{ borderColor: C.hairSoft }}>
                                        {home.plan.blocks.map((blk) => (
                                            <GroupBannerBlock key={`${previewMode}-${blk.key}`} block={blk} bannersById={previewById} columnCount={mobile ? 1 : 3} onOpen={() => { }} />
                                        ))}
                                    </div>
                                ) : <p className="py-8 text-center text-[13px] font-semibold" style={{ color: C.muted }}>No live banners yet.</p>}
                            </section>

                            <p className="mt-3 text-[12px] font-medium leading-relaxed" style={{ color: C.muted }}>
                                The first {priorityCount} banners below always lead the Home feed. The rest rotate daily. Each layout slot uses the closest size you uploaded, so adding 4:3, 1:1 and 3:4 images gives the best result.
                            </p>

                            <div className="mt-3 flex flex-col gap-2.5">
                                {ordered.length === 0
                                    ? <p className="rounded-2xl border bg-white px-4 py-12 text-center text-[13px] font-semibold" style={{ borderColor: C.hair, color: C.muted }}>Add a banner from “Needs banner” or “All groups”.</p>
                                    : ordered.map((g, i) => (
                                        <OrderItem key={g.group_id} g={g} pos={i} total={ordered.length} priority={i < priorityCount} busy={busy} onMove={move} onToggle={toggle} onEdit={setEditing} onDelete={setConfirmDel} />
                                    ))}
                            </div>
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
                            “{confirmDel.name}” goes back to the normal group card on the Home page. All its images are removed permanently.
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