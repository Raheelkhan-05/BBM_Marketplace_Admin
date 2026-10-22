// src/components/grow/GrowBrandField.jsx
// Brand picker for the /grow add-product wizard: live suggestions, "add as new brand",
// keyboard navigation, "No brand", and an optional logo (click or drag & drop) for new brands.
import { useCallback, useEffect, useRef, useState } from "react";
import { searchBrandNames } from "../../utils/sellerListingApi.js";
import { uploadSellerFile } from "../../utils/api.js";
import { useDrop, useScrollLock } from "./growUi.js";

const ini = (s) => (s || "").trim().slice(0, 2).toUpperCase() || "?";

/**
 * value: brand name · image: brand logo url · notApplicable: "No brand" chosen · isNew: created here
 * onChange({ b, bi, nb, isNew })
 */
export default function GrowBrandField({ token, value, image, notApplicable, isNew, onChange, say }) {
    const [q, setQ] = useState("");
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [hi, setHi] = useState(0);
    const [logoBusy, setLogoBusy] = useState(false);
    const box = useRef(null);
    const listEl = useRef(null);
    const lock = useScrollLock();
    const setList = useCallback((el) => { listEl.current = el; lock(el); }, [lock]);

    const has = !notApplicable && !!value;
    const term = q.trim();
    const lq = term.toLowerCase();
    const exact = items.some((it) => it.name.toLowerCase() === lq);
    // exact match first, so Enter on a fully typed brand picks the existing one
    const list = [...items].sort((a, b) => Number(b.name.toLowerCase() === lq) - Number(a.name.toLowerCase() === lq)).slice(0, 8);
    const showAdd = !!term && !exact;
    const total = list.length + (showAdd ? 1 : 0);

    // logo upload (new brands only). Hooks stay above every early return.
    const uploadLogo = async (files) => {
        const f = (files || []).find((x) => x.type?.startsWith("image/"));
        if (!f) return say?.("Please choose an image file.");
        setLogoBusy(true);
        try {
            const r = await uploadSellerFile(token, f, "brands");
            if (r?.success) onChange({ b: value, bi: r.url, nb: false, isNew: true });
            else say?.("Logo upload failed. Try again.");
        } catch { say?.("Logo upload failed. Try again."); }
        finally { setLogoBusy(false); }
    };
    const logoDrop = useDrop(uploadLogo, { disabled: logoBusy });

    useEffect(() => { setHi(0); }, [term, items]);

    useEffect(() => { // close when pressing outside
        if (!open) return;
        const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
        document.addEventListener("pointerdown", h);
        return () => document.removeEventListener("pointerdown", h);
    }, [open]);

    useEffect(() => { // debounced search; empty query returns the default/popular brands
        if (!open || notApplicable || has) { setLoading(false); return; }
        let live = true;
        setLoading(true);
        const t = setTimeout(async () => {
            let found = [];
            try { const r = await searchBrandNames(token, term); if (r?.success) found = r.items || []; } catch { /* show empty */ }
            if (!live) return;
            setItems(found);
            setLoading(false);
        }, term ? 250 : 0);
        return () => { live = false; clearTimeout(t); };
    }, [term, open, notApplicable, has, token]);

    useEffect(() => { // keep the keyboard-highlighted option visible inside the list
        const c = listEl.current, el = c?.children[hi];
        if (!open || !c || !el) return;
        if (el.offsetTop < c.scrollTop) c.scrollTop = el.offsetTop;
        else if (el.offsetTop + el.offsetHeight > c.scrollTop + c.clientHeight) c.scrollTop = el.offsetTop + el.offsetHeight - c.clientHeight;
    }, [hi, open]);

    const pick = (it) => { onChange({ b: it.name, bi: it.image || null, nb: false, isNew: false }); setQ(""); setOpen(false); };
    const addNew = () => { if (!term) return; onChange({ b: term, bi: null, nb: false, isNew: true }); setQ(""); setOpen(false); };
    const clear = () => { onChange({ b: "", bi: null, nb: false, isNew: false }); setQ(""); };
    const markNone = () => { onChange({ b: "", bi: null, nb: true, isNew: false }); setQ(""); setOpen(false); };

    const onKey = (e) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) return setOpen(true);
            setHi((i) => Math.max(0, Math.min(total - 1, i + 1)));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((i) => Math.max(0, i - 1));
        } else if (e.key === "Enter") {
            if (!open) return;
            e.preventDefault();
            if (loading || !total) return; // results for what was just typed are still on the way
            if (hi < list.length) pick(list[hi]); else if (showAdd) addNew();
        } else if (e.key === "Escape" && open) {
            e.preventDefault();
            setOpen(false);
        }
    };

    if (notApplicable) {
        return (
            <div className="gx-sel">
                <span className="gx-av" aria-hidden="true">–</span>
                <div><b>No brand</b><small>This product is sold without a brand.</small></div>
                <button type="button" className="gx-btn" onClick={clear}>Change</button>
            </div>
        );
    }

    if (has) {
        return (
            <>
                <div className="gx-sel">
                    {image ? <img className="gx-av" src={image} alt="" /> : <span className="gx-av" aria-hidden="true">{ini(value)}</span>}
                    <div><b>{value}</b>{isNew && <small>New brand</small>}</div>
                    <button type="button" className="gx-btn" onClick={clear}>Change</button>
                </div>
                {isNew && (
                    <label className={`gx-drop sm${logoDrop.active ? " on" : ""}${logoBusy ? " off" : ""}`} style={{ marginTop: 10 }} {...logoDrop.bind}>
                        {logoBusy ? "Uploading…" : image
                            ? <span>Logo added. Drop another or <b>replace</b></span>
                            : <span>Add a logo (optional). Drag and drop or <b>browse</b></span>}
                        <input type="file" accept="image/*" hidden disabled={logoBusy}
                            onChange={(e) => { uploadLogo(Array.from(e.target.files || [])); e.target.value = ""; }} />
                    </label>
                )}
            </>
        );
    }

    return (
        <div ref={box}>
            <div className="gx-row">
                <div className="inp">
                    <input value={q} placeholder="Search or type a brand" autoComplete="off"
                        role="combobox" aria-expanded={open} aria-autocomplete="list" aria-controls="gx-brand-list"
                        onFocus={() => setOpen(true)}
                        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
                        onKeyDown={onKey} />
                </div>
                <button type="button" className="chip" onClick={markNone}>No brand</button>
            </div>
            {open && (
                <div className="gx-pop">
                    {total > 0 && (
                        <div id="gx-brand-list" className="gx-list" role="listbox" ref={setList} data-lenis-prevent>
                            {list.map((it, i) => (
                                <button key={it.name} type="button" role="option" aria-selected={i === hi}
                                    className={`gx-opt${i === hi ? " hi" : ""}`}
                                    onMouseEnter={() => setHi(i)} onClick={() => pick(it)}>
                                    {it.image ? <img className="gx-av" src={it.image} alt="" /> : <span className="gx-av" aria-hidden="true">{ini(it.name)}</span>}
                                    <span className="t">{it.name}</span>
                                </button>
                            ))}
                            {showAdd && (
                                <button type="button" role="option" aria-selected={hi === list.length}
                                    className={`gx-opt new${hi === list.length ? " hi" : ""}`}
                                    onMouseEnter={() => setHi(list.length)} onClick={addNew}>
                                    <span className="gx-av plus" aria-hidden="true">+</span>
                                    <span className="t">Add “{term}” as a new brand</span>
                                </button>
                            )}
                        </div>
                    )}
                    {total === 0 && (
                        <p className="gx-msg">{loading ? "Searching…" : term ? "No brands found." : "Start typing to search brands."}</p>
                    )}
                </div>
            )}
        </div>
    );
}