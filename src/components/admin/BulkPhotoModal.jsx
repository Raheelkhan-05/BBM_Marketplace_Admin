// components/admin/BulkPhotoModal.jsx
// Upload up to 5 photos once, then apply them to many products. Parent supplies onApply(images, mode, onProgress).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, ImagePlus, Star } from "lucide-react";
import { C } from "../catalog/tokens";
import { uploadSellerFile } from "../../utils/api.js";
import { useDrop } from "../grow/growUi.js";
import { useModalLock } from "./bulkSelect.jsx";

const MAX = 5;
const isImg = (f) => !!f.type?.startsWith("image/");

export default function BulkPhotoModal({ count, noun = "product", uploadToken, allowMode = true, onApply, onClose, say }) {
    useModalLock();
    const [images, setImages] = useState([]);
    const [up, setUp] = useState(false);
    const [busy, setBusy] = useState(false);
    const [mode, setMode] = useState("add");
    const [err, setErr] = useState("");
    const [prog, setProg] = useState("");
    const alive = useRef(true);
    useEffect(() => () => { alive.current = false; }, []);

    const addFiles = async (files) => {
        if (up || busy) return;
        const imgs = Array.from(files || []).filter(isImg);
        if (!imgs.length) { setErr("Please choose image files (JPG, PNG, etc.)."); return; }
        const room = MAX - images.length;
        if (room <= 0) { setErr(`You can add up to ${MAX} photos.`); return; }
        if (imgs.length > room) say?.(`Only ${room} more photo${room === 1 ? "" : "s"} fit. Extra files were skipped.`);
        setErr("");
        setUp(true);
        try {
            for (const f of imgs.slice(0, room)) {
                const r = await uploadSellerFile(uploadToken, f, "listings");
                if (!alive.current) return;
                if (r?.success && r.url) setImages((x) => [...x, r.url].slice(0, MAX));
                else setErr("A photo failed to upload. Please try again.");
            }
        } finally { if (alive.current) setUp(false); }
    };
    const drop = useDrop(addFiles, { disabled: up || busy });

    const makeCover = (i) => setImages((x) => [x[i], ...x.filter((_, j) => j !== i)]);
    const remove = (i) => setImages((x) => x.filter((_, j) => j !== i));

    const submit = async () => {
        if (!images.length || busy || up) return;
        setBusy(true); setErr(""); setProg("");
        let r = null;
        try { r = await onApply(images, mode, (d, t) => alive.current && setProg(`Saved ${d} of ${t}…`)); } catch { r = null; }
        if (!alive.current) return;
        setBusy(false);
        if (r?.success) onClose();
        else setErr(r?.message || "Could not apply the photos. Please try again.");
    };

    const label = `${count} ${noun}${count === 1 ? "" : "s"}`;
    return createPortal(
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/45 sm:items-center sm:p-4" onClick={() => !busy && !up && onClose()}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add photos in bulk"
                className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl">
                <div className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: C.hairSoft }}>
                    <div className="min-w-0">
                        <h3 className="text-[16px] font-extrabold" style={{ color: C.ink }}>Add the same photos to {label}</h3>
                        <p className="mt-0.5 text-[12px] font-medium" style={{ color: C.muted }}>Upload once. The first photo is the cover.</p>
                    </div>
                    <button type="button" onClick={onClose} disabled={busy || up} aria-label="Close" className="shrink-0 rounded-full p-1.5 disabled:opacity-40" style={{ color: C.muted }}><X className="h-4 w-4" /></button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-lenis-prevent>
                    <div className="flex flex-wrap gap-2.5">
                        {images.map((u, i) => (
                            <div key={u} className="relative h-20 w-20">
                                <img src={u} alt="" className="h-full w-full rounded-xl border object-cover" style={{ borderColor: C.hair }} />
                                <button type="button" onClick={() => remove(i)} disabled={busy} aria-label="Remove photo" className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[12px] leading-none text-white">×</button>
                                {i === 0
                                    ? <span className="absolute inset-x-0 bottom-0 rounded-b-xl bg-black/60 py-0.5 text-center text-[8.5px] font-bold text-white">Cover</span>
                                    : <button type="button" onClick={() => makeCover(i)} disabled={busy} aria-label="Make cover" className="absolute bottom-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"><Star className="h-3 w-3" /></button>}
                            </div>
                        ))}
                    </div>

                    {images.length < MAX && (
                        <label {...drop.bind}
                            className={`${images.length ? "mt-3" : ""} flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center text-[12.5px] font-semibold transition-colors ${up ? "opacity-60" : ""}`}
                            style={{ borderColor: drop.active ? C.primary : C.hair, background: drop.active ? `${C.primary}0d` : "#fafbfb", color: C.muted }}>
                            {up ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                            <span>{up ? "Uploading…" : <>Drag and drop photos here or <b style={{ color: C.ink }}>browse</b></>}</span>
                            <em className="text-[11px] not-italic">Up to {MAX} photos · JPG, PNG</em>
                            <input type="file" accept="image/*" multiple hidden disabled={up || busy} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                        </label>
                    )}

                    {allowMode && (
                        <fieldset className="mt-4" disabled={busy}>
                            <legend className="text-[12px] font-bold" style={{ color: C.muted }}>If a product already has photos</legend>
                            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                                {[["add", "Add to its photos", `Keeps existing photos, up to ${MAX} in total`], ["replace", "Replace its photos", "Removes existing photos first"]].map(([k, t, s]) => (
                                    <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}
                                        className="rounded-xl border px-3 py-2.5 text-left transition-colors"
                                        style={{ borderColor: mode === k ? C.primary : C.hair, background: mode === k ? `${C.primary}0d` : "#fff" }}>
                                        <span className="block text-[12.5px] font-extrabold" style={{ color: C.ink }}>{t}</span>
                                        <span className="block text-[11px] font-medium" style={{ color: C.muted }}>{s}</span>
                                    </button>
                                ))}
                            </div>
                        </fieldset>
                    )}

                    {err && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{err}</p>}
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-5 py-3.5" style={{ borderColor: C.hairSoft }}>
                    {busy && prog && <span className="mr-auto text-[12px] font-semibold" style={{ color: C.muted }}>{prog}</span>}
                    <button type="button" onClick={onClose} disabled={busy || up} className="min-h-10 rounded-xl px-4 text-[13px] font-bold disabled:opacity-50" style={{ color: C.muted }}>Cancel</button>
                    <button type="button" onClick={submit} disabled={!images.length || busy || up}
                        className="flex min-h-10 items-center gap-2 rounded-xl px-5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.primary }}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? "Applying…" : `Apply to ${label}`}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}