// pages/admin/AdminEntityBannersPage.jsx — add / replace / remove multi-shape images for categories and subcategories.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, Loader2, Pencil, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { C } from "../../components/catalog/tokens";
import { Chip } from "../../components/orders/disputeUi.jsx";
import { SHAPE_LIST, SHAPE_BY_KEY } from "../../components/home/bannerShapes.js";
import { resizedImageUrl } from "../../utils/imageUrl";
import { fetchAdminEntityBanners, saveEntityBanner, patchEntityBanner } from "../../utils/api.groupBanners.js";

const GREEN = "#22A06B";
const MAX_OUT_BYTES = 1.8 * 1024 * 1024;
const MIN_CROP_SIDE = 540;
const MAX_SRC_BYTES = 20 * 1024 * 1024;

/* ───────────────────────── small pieces ───────────────────────── */
function Switch({ on, onChange, label }) {
    return (
        <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
            className="relative h-5 w-9 shrink-0 rounded-full transition-colors" style={{ background: on ? GREEN : "#D9DEE2" }}>
            <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform" style={{ transform: on ? "translateX(16px)" : "none" }} />
        </button>
    );
}

function ErrorLine({ children }) {
    return children ? <p role="alert" className="mt-3 break-words rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{children}</p> : null;
}

/* ───────────────────────── crop to an exact ratio and compress ───────────────────────── */
const toBlob = (canvas, type, q) => new Promise((r) => canvas.toBlob(r, type, q));

function cropRegion(img, ratio) {
    const sw = img.naturalWidth, sh = img.naturalHeight;
    if (sw / sh > ratio) return { cw: sh * ratio, ch: sh, wideSource: true };
    return { cw: sw, ch: sw / ratio, wideSource: false };
}

async function renderImage(img, ratio, fx, fy) {
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
        if (!b || b.type !== "image/webp") break;
        if (b.size <= MAX_OUT_BYTES) return b;
    }
    for (const q of [0.88, 0.78, 0.68, 0.55]) {
        const b = await toBlob(canvas, "image/jpeg", q);
        if (b && b.size <= MAX_OUT_BYTES) return b;
    }
    return null;
}

/* ───────────────────────── editor ───────────────────────── */
function ImagesEditor({ entity, type, token, onClose, onSaved }) {
    const existing = entity.banners || {};
    const hasExisting = Object.keys(existing).length > 0;
    const firstActive = hasExisting ? Object.values(existing)[0]?.is_active !== false : true;
    const firstAlt = hasExisting ? (Object.values(existing)[0]?.alt_text || "") : "";

    const [shape, setShape] = useState("wide");
    const [pending, setPending] = useState({});   // { [shape]: { file, srcUrl, img, fx, fy } }
    const [removed, setRemoved] = useState([]);
    const [alt, setAlt] = useState(firstAlt);
    const [active, setActive] = useState(firstActive);
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
    const existingUrl = existing[shape]?.image_url;
    const hasImage = (k) => !!pending[k] || (!!existing[k] && !removed.includes(k));
    const anyImage = SHAPE_LIST.some((s) => hasImage(s.key));
    const shownUrl = cur ? cur.srcUrl : (existingUrl && !removed.includes(shape) ? resizedImageUrl(existingUrl, { width: 960 }) : null);

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
    const canRemove = !cur && existingUrl && !removed.includes(shape);

    const save = async () => {
        setSaving(true); setError(null);
        const keys = Object.keys(pending);
        let res;
        if (keys.length || removed.length) {
            const form = new FormData();
            for (const k of keys) {
                const p = pending[k];
                const blob = await renderImage(p.img, SHAPE_BY_KEY[k].ratio, p.fx, p.fy);
                if (!blob) { setSaving(false); return setError(`Couldn't compress the ${SHAPE_BY_KEY[k].label} image under 2 MB. Try a simpler image.`); }
                form.append(k, blob, `${k}.${blob.type === "image/webp" ? "webp" : "jpg"}`);
            }
            if (removed.length) form.append("removeShapes", removed.join(","));
            form.append("altText", alt);
            form.append("isActive", String(active));
            res = await saveEntityBanner(token, type, entity.id, form);
            // Make the description + visibility apply to every size, not only the ones just uploaded.
            if (res?.success && anyImage) await patchEntityBanner(token, type, entity.id, { altText: alt, isActive: active });
        } else {
            res = await patchEntityBanner(token, type, entity.id, { altText: alt, isActive: active });
        }
        setSaving(false);
        if (!res?.success) return setError(res?.message || "Couldn't save.");
        onSaved();
    };

    const noChange = !Object.keys(pending).length && !removed.length && !hasExisting;
    const canSave = !saving && !noChange;

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Edit images">
            <button className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => !saving && onClose()} />
            <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:max-w-xl sm:rounded-3xl sm:p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-[16px] font-extrabold" style={{ color: C.ink }}>{hasExisting ? "Edit images" : "Add images"}</h2>
                        <p className="mt-0.5 truncate text-[12.5px] font-semibold" style={{ color: C.muted }}>{entity.name} · {type}</p>
                    </div>
                    <button onClick={onClose} disabled={saving} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: C.hair }} aria-label="Close"><X className="h-4 w-4" /></button>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-1 rounded-xl border p-1" style={{ borderColor: C.hair, background: "#fafbfb" }} role="tablist">
                    {SHAPE_LIST.map((s) => (
                        <button key={s.key} role="tab" aria-selected={shape === s.key} onClick={() => { setShape(s.key); setError(null); }}
                            className="flex min-h-10 flex-col items-center justify-center rounded-lg px-1 py-1 text-[12px] font-bold"
                            style={{ background: shape === s.key ? C.primary : "transparent", color: shape === s.key ? "#fff" : C.muted }}>
                            <span>{s.label}</span>
                            <span className="text-[9.5px] font-semibold opacity-80">{hasImage(s.key) ? "✓ added" : "optional"}</span>
                        </button>
                    ))}
                </div>
                <p className="mt-2 text-[11.5px] font-medium leading-relaxed" style={{ color: C.muted }}>
                    {meta.hint}. Add any of the four sizes; any image is cropped to exactly {meta.label} automatically.
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
                    {removed.includes(shape) && <button onClick={() => setRemoved((r) => r.filter((s) => s !== shape))} className="rounded-xl border px-3 text-[12.5px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>Undo remove</button>}
                </div>

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
                    <input value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={140} placeholder={entity.name}
                        className="mt-1 w-full rounded-xl border px-3 py-2 text-[13px] font-medium outline-none" style={{ borderColor: C.hair }} />
                </label>

                <div className="mt-4 flex items-center justify-between rounded-xl border px-3 py-2.5" style={{ borderColor: C.hair }}>
                    <div>
                        <p className="text-[13px] font-extrabold" style={{ color: C.ink }}>Active</p>
                        <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>When off, these images are not served to the app.</p>
                    </div>
                    <Switch on={active} onChange={setActive} label="Active" />
                </div>

                <ErrorLine>{error}</ErrorLine>

                <div className="mt-4 flex gap-2">
                    <button onClick={onClose} disabled={saving} className="flex-1 rounded-xl border py-2.5 text-[13px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>Cancel</button>
                    <button onClick={save} disabled={!canSave} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.primary }}>
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save images
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ───────────────────────── row ───────────────────────── */
function EntityItem({ e, subtitle, onEdit }) {
    const shapes = SHAPE_LIST.filter((s) => e.banners?.[s.key]);
    const preview = e.banners?.wide?.image_url || e.banners?.landscape?.image_url || e.banners?.square?.image_url || e.banners?.portrait?.image_url;
    const inactive = shapes.length > 0 && shapes.every((s) => e.banners[s.key].is_active === false);
    return (
        <article className="flex min-w-0 items-center gap-3 rounded-2xl border bg-white p-3" style={{ borderColor: C.hair }}>
            <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border" style={{ borderColor: C.hair, background: C.hairSoft }}>
                {preview
                    ? <img src={resizedImageUrl(preview, { width: 320 })} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    : <span className="text-[10.5px] font-bold" style={{ color: C.muted }}>No image</span>}
            </div>
            <div className="min-w-0 flex-1">
                <h3 className="break-words text-[13.5px] font-extrabold" style={{ color: C.ink }}>{e.name}</h3>
                {subtitle && <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>{subtitle}</p>}
                <div className="mt-1.5 flex flex-wrap gap-1">
                    {shapes.length === 0 ? <Chip tone="neutral">No images yet</Chip> : shapes.map((s) => <Chip key={s.key} tone="neutral">{s.label}</Chip>)}
                    {inactive && <Chip tone="warn">Inactive</Chip>}
                </div>
            </div>
            <button onClick={() => onEdit(e)} className="flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-bold hover:bg-black/[0.03]" style={{ borderColor: C.hair, color: C.secondary }}>
                {shapes.length ? <><Pencil className="h-3.5 w-3.5" /> Edit</> : <><ImagePlus className="h-3.5 w-3.5" /> Add images</>}
            </button>
        </article>
    );
}

/* ───────────────────────── page ───────────────────────── */
export default function AdminEntityBannersPage() {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [type, setType] = useState("category");
    const [data, setData] = useState({ category: [], subcategory: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [query, setQuery] = useState("");
    const [onlyMissing, setOnlyMissing] = useState(false);
    const [editing, setEditing] = useState(null);

    const load = useCallback(async ({ silent } = {}) => {
        if (!silent) setLoading(true);
        const [c, s] = await Promise.all([
            fetchAdminEntityBanners(token, "category"),
            fetchAdminEntityBanners(token, "subcategory"),
        ]);
        if (c.aborted || s.aborted) return;
        if (c.success && s.success) { setData({ category: c.items || [], subcategory: s.items || [] }); setError(null); }
        else setError(c.message || s.message || "Couldn't load the list.");
        setLoading(false);
    }, [token]);
    useEffect(() => { load(); }, [load]);

    const categoryName = useMemo(() => new Map(data.category.map((c) => [c.id, c.name])), [data.category]);

    const list = useMemo(() => {
        const s = query.trim().toLowerCase();
        return data[type].filter((e) => {
            if (onlyMissing && Object.keys(e.banners || {}).length) return false;
            if (!s) return true;
            return e.name.toLowerCase().includes(s) || (type === "subcategory" && (categoryName.get(e.category_id) || "").toLowerCase().includes(s));
        });
    }, [data, type, query, onlyMissing, categoryName]);

    const withImages = (k) => data[k].filter((e) => Object.keys(e.banners || {}).length).length;
    const TABS = [
        { k: "category", t: `Categories (${withImages("category")}/${data.category.length})` },
        { k: "subcategory", t: `Subcategories (${withImages("subcategory")}/${data.subcategory.length})` },
    ];

    return (
        <main className="mx-auto min-h-screen w-full max-w-screen-xl min-w-0 px-3 pb-10 pt-3 sm:px-5 lg:px-8">
            <div className="mt-2 flex min-w-0 items-start gap-3 sm:items-center">
                <button onClick={() => navigate(-1)} className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border sm:mt-0" style={{ borderColor: C.hair, color: C.ink }} aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
                <div className="min-w-0 flex-1">
                    <h1 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-extrabold tracking-tight" style={{ color: C.ink }}>Category &amp; subcategory images</h1>
                    <p className="mt-1 max-w-2xl text-[12px] font-medium leading-relaxed sm:text-[13px]" style={{ color: C.muted }}>
                        Store images in 16:9, 4:3, 1:1 and 3:4 for each category or subcategory. They are saved now and can be used anywhere in the app later.
                    </p>
                </div>
            </div>
            <ErrorLine>{error}</ErrorLine>

            <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border p-1" style={{ borderColor: C.hair, background: "#fafbfb" }} role="tablist">
                {TABS.map(({ k, t }) => (
                    <button key={k} role="tab" aria-selected={type === k} onClick={() => setType(k)} className="min-h-10 rounded-lg px-3 py-2 text-[12.5px] font-bold"
                        style={{ background: type === k ? C.primary : "transparent", color: type === k ? "#fff" : C.muted }}>{t}</button>
                ))}
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${type === "category" ? "categories" : "subcategories"}…`}
                    className="w-full rounded-xl border bg-white px-3 py-2.5 text-[13px] font-medium outline-none" style={{ borderColor: C.hair }} />
                <label className="flex shrink-0 items-center gap-2 text-[12.5px] font-bold" style={{ color: C.ink }}>
                    <Switch on={onlyMissing} onChange={setOnlyMissing} label="Only without images" /> Only without images
                </label>
            </div>

            {loading ? (
                <div className="mt-4 flex flex-col gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl" style={{ background: C.hairSoft }} />)}</div>
            ) : (
                <div className="mt-3 flex flex-col gap-2.5">
                    {list.length === 0
                        ? <p className="rounded-2xl border bg-white px-4 py-12 text-center text-[13px] font-semibold" style={{ borderColor: C.hair, color: C.muted }}>Nothing found.</p>
                        : list.map((e) => (
                            <EntityItem key={e.id} e={e}
                                subtitle={type === "subcategory" ? (categoryName.get(e.category_id) ? `in ${categoryName.get(e.category_id)}` : null) : null}
                                onEdit={setEditing} />
                        ))}
                </div>
            )}

            {editing && (
                <ImagesEditor entity={editing} type={type} token={token} onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load({ silent: true }); }} />
            )}
        </main>
    );
}