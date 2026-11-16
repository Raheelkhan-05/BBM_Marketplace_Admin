// components/admin/CatalogItemForm.jsx
// The editable review form for ONE bulk-uploaded catalog product. Fully controlled: the page owns the data.
// Layout: Product -> Unit, packing and GST -> Specifications -> Photos.
// Problems show in red on the exact field, and the first thing missing is marked "Fill this next".
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { checkCatalogRows, uploadCatalogImage } from "../../utils/api.adminCatalogBulk.js";
import { MAX_PHOTOS, GST_RATES } from "../../utils/catalogBulkSchema.js";
import { useDrop } from "../grow/growUi.js";

const isImg = (f) => !!f?.type?.startsWith("image/");
const num = (s) => String(s).replace(/[^\d.]/g, "");

// A field row. `k` ties it to a validation field. (Module level on purpose: a component defined inside another
// would remount its inputs on every keystroke.)
function F({ k, st, l, c, children }) {
    const msg = k ? st.by.get(k) : null;
    const bad = !!msg && (k !== "im" || st.show);
    const next = !!k && st.next === k;
    return (
        <div id={k ? `bk-f-${k}` : undefined} className={`f${bad ? " bk-bad" : ""}${next ? " bk-next" : ""}`}>
            {l && <label>{l}</label>}
            {next && <span className="bk-nx">Fill this next</span>}
            {children}
            {bad ? <p className="cap err">{msg}</p> : c && <p className="cap">{c}</p>}
        </div>
    );
}
const In = ({ v, on, ...r }) => <div className="inp"><input value={v ?? ""} onChange={(e) => on(e.target.value)} {...r} /></div>;
const Chips = ({ v, on, o }) => (
    <div className="chips">{o.map(([k, t]) => (
        <button key={String(k)} type="button" className="chip" aria-pressed={String(v) === String(k)} onClick={() => on(k)}>{t}</button>
    ))}</div>
);

function Sec({ id, title, sub, bad, children }) {
    return (
        <section className={`pn bk-sec${bad ? " bad" : ""}`} id={`bk-${id}`}>
            <div className="bk-sh">
                <div><h3>{title}</h3><p>{sub}</p></div>
                {bad && <span className="bk-flag">Needs your answer</span>}
            </div>
            {children}
        </section>
    );
}

export default function CatalogItemForm({ token, P, onChange, say, units, errors, showErrors, onCheck }) {
    const ref = useRef(P);
    ref.current = P;
    const cbRef = useRef(onChange);
    cbRef.current = onChange;
    const checkRef = useRef(onCheck);
    checkRef.current = onCheck;
    const patch = useCallback((o) => { ref.current = { ...ref.current, ...o }; cbRef.current(ref.current); }, []);

    const [chk, setChk] = useState(null);   // { dup } - is this name + brand already in the catalog?
    const [up, setUp] = useState(false);

    const st = useMemo(() => {
        const by = new Map();
        errors.forEach((e) => { if (!by.has(e.field)) by.set(e.field, e.msg); });
        return { by, next: errors[0]?.field || null, show: !!showErrors };
    }, [errors, showErrors]);
    const secBad = (id) => errors.some((e) => e.section === id && (e.field !== "im" || showErrors));

    // Is this exact name + brand already in the catalog?
    useEffect(() => {
        const n = P.n.trim(), b = P.b.trim();
        if (n.length < 2 || !b) { setChk(null); checkRef.current?.(null); return undefined; }
        let live = true;
        const t = setTimeout(async () => {
            const r = await checkCatalogRows(token, [{ n, b }]);
            if (!live || !r?.success) return;
            const it = r.items?.[0] || null;
            setChk(it);
            checkRef.current?.(it);
        }, 450);
        return () => { live = false; clearTimeout(t); };
    }, [P.n, P.b, token]);

    /* photos */
    const addPhotos = async (files) => {
        let list = Array.from(files || []).filter(isImg);
        if (!list.length || up) { if (files?.length && !list.length) say("Please choose photos (JPG, PNG, etc.)."); return; }
        const room = MAX_PHOTOS - ref.current.im.length;
        if (room <= 0) return say(`You can add up to ${MAX_PHOTOS} photos.`);
        if (list.length > room) say(`Only ${room} more photo${room === 1 ? "" : "s"} fit. The extra files were skipped.`);
        list = list.slice(0, room);
        setUp(true);
        try {
            for (const file of list) {
                const r = await uploadCatalogImage(token, file);
                if (!r?.success) { say(r?.message || "Upload failed. Please try again."); continue; }
                patch({ im: [...ref.current.im, r.url].slice(0, MAX_PHOTOS) });
            }
        } finally { setUp(false); }
    };
    const photoDrop = useDrop(addPhotos, { disabled: up });

    const outer = Number(P.mps) > 1;
    const isNew = !!chk && !chk.dup && P.n.trim().length >= 2 && !!P.b.trim();

    return (
        <div className="bk-form">
            {/* ---------------- product ---------------- */}
            <Sec id="product" title="Product" sub="Name, brand and part details." bad={secBad("product")}>
                <F k="n" st={st} l="Product name *" c={isNew ? "Not in the catalog yet. It will be added." : ""}>
                    <In v={P.n} on={(v) => patch({ n: v })} placeholder="e.g. Shell Advance AX7 10W30" />
                </F>
                <F k="b" st={st} l="Brand *"><In v={P.b} on={(v) => patch({ b: v })} placeholder="e.g. Shell" /></F>
                <F k="model" st={st} l="Model / Part No / SKU *"><In v={P.model} on={(v) => patch({ model: v })} placeholder="e.g. AX7-10W30-1L" /></F>
                <F st={st} l="Variant / Grade (optional)"><In v={P.grade} on={(v) => patch({ grade: v })} placeholder="e.g. 10W-30" /></F>
            </Sec>

            {/* ---------------- packing + GST ---------------- */}
            <Sec id="packing" title="Unit, packing and GST" sub="How this product is measured and packed, and its GST rate." bad={secBad("packing")}>
                <F k="u" st={st} l="Unit *" c="The smallest measure the product is sold in."><Chips v={P.u} on={(v) => patch({ u: v })} o={units.map((u) => [u, u])} /></F>
                <F k="ps" st={st} l={P.u ? `How many ${P.u} are in 1 Pack? *` : "Items in 1 Pack *"}><In v={P.ps} on={(v) => patch({ ps: num(v) })} inputMode="decimal" placeholder="e.g. 1" /></F>
                <F k="mps" st={st} l="How many Packs are in 1 outer box? *" c="Type 1 if there is no outer box.">
                    <In v={P.mps} on={(v) => patch({ mps: v.replace(/\D/g, "") })} inputMode="numeric" placeholder="e.g. 12" />
                </F>
                <F k="gst" st={st} l="GST % *" c="GST belongs to the product, so every seller who lists it uses this rate.">
                    <Chips v={P.gst} on={(v) => patch({ gst: v })} o={GST_RATES.map((g) => [String(g), `${g}%`])} />
                </F>
                {Number(P.ps) > 0 && Number(P.mps) >= 1 && P.u && (
                    <div className="brk"><div><span>Packing</span><b>1 Pack = {P.ps} {P.u}{outer ? ` · 1 Outer box = ${P.mps} Packs` : " · no outer box"}{P.gst !== "" ? ` · GST ${P.gst}%` : ""}</b></div></div>
                )}
            </Sec>

            {/* ---------------- specifications ---------------- */}
            <Sec id="specs" title="Specifications" sub="Optional. Details buyers can compare, such as Volume: 1L." bad={false}>
                <F st={st}>
                    {P.spec.map((s, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                            <div className="inp" style={{ flex: 1, minWidth: 0 }}>
                                <input value={s.key} placeholder="Name, e.g. Volume" aria-label="Detail name" maxLength={100}
                                    onChange={(e) => patch({ spec: P.spec.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)) })} />
                            </div>
                            <div className="inp" style={{ flex: 1, minWidth: 0 }}>
                                <input value={s.value} placeholder="Value, e.g. 1L" aria-label="Detail value" maxLength={300}
                                    onChange={(e) => patch({ spec: P.spec.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)) })} />
                            </div>
                            <button type="button" className="gx-act del" onClick={() => patch({ spec: P.spec.filter((_, j) => j !== i) })}>Remove</button>
                        </div>
                    ))}
                    {P.spec.length < 40 && <button type="button" className="sbtn gh sm" onClick={() => patch({ spec: [...P.spec, { key: "", value: "" }] })}>+ Add detail</button>}
                </F>
            </Sec>

            {/* ---------------- photos ---------------- */}
            <Sec id="photos" title="Photos" sub="The first photo is the cover." bad={secBad("photos")}>
                <F k="im" st={st}>
                    <div className="lb">Product photos * <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, color: "var(--mute)" }}>up to {MAX_PHOTOS}</span></div>
                    <div className="bk-photo">
                        <div className={`ph gx-dz${photoDrop.active ? " on" : ""}`} {...photoDrop.bind}>
                            {P.im.map((u, i) => (
                                <div className="th" key={`${u}-${i}`} style={{ backgroundImage: `url(${u})` }}>
                                    <button type="button" className="x" aria-label="Remove photo" onClick={() => patch({ im: P.im.filter((_, j) => j !== i) })}>×</button>
                                </div>
                            ))}
                            {P.im.length < MAX_PHOTOS && (
                                <label className="add">{up ? "…" : "+ Add"}
                                    <input type="file" accept="image/*" multiple hidden disabled={up} onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
                                </label>
                            )}
                        </div>
                    </div>
                    <p className="cap" style={{ marginTop: 8 }}>Tap Add, or drag and drop photos here.</p>
                </F>
            </Sec>
        </div>
    );
}