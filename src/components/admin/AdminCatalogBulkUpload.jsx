// components/admin/AdminCatalogBulkUpload.jsx
// Admin bulk upload of catalog products (no category path needed).
//   1. download the Excel template   2. upload it (every row is checked, nothing is thrown away)
//   3. review one product at a time (or use Bulk actions)   4. "Confirm and next" adds that product to the catalog
// Products are added live but UNMAPPED. They appear under "Needs mapping" until an admin maps them to a generic product.
// Unfinished products are saved on the server per admin (admin_catalog_drafts), so the admin can leave and come back.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    fetchCatalogBulkMeta, checkCatalogRows, fetchCatalogDrafts, saveCatalogDrafts, patchCatalogDraft, deleteCatalogDraft,
    clearCatalogDrafts, bulkCatalogDraftImages, bulkCatalogDraftDelete, submitCatalogDrafts, uploadCatalogImage,
} from "../../utils/api.adminCatalogBulk.js";
import { MAX_ROWS, rowToData, parseRows, validateData, quickIssues, itemKey } from "../../utils/catalogBulkSchema.js";
import { downloadCatalogTemplate, readCatalogSheet } from "../../utils/catalogBulkExcel.js";
import CatalogItemForm from "./CatalogItemForm.jsx";
import CatalogDraftManagerPanel from "./CatalogDraftManagerPanel.jsx";
import GrowCheckSkeleton from "../grow/GrowCheckSkeleton.jsx";
import { useDrop, useDropGuard } from "../grow/growUi.js";
import "../grow/grow-start.css";
import "../grow/grow-extras.css";
import "../grow/grow-access.css";
import "../grow/grow-bulk.css";

const SUBMIT_CHUNK = 25;
const CHECK_CHUNK = 200;
const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16);
}));
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const chunkArr = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const nextPending = (list, fromId) => {
    const pend = list.filter((i) => i.status === "pending" && i.id !== fromId);
    if (!pend.length) return null;
    const at = list.findIndex((i) => i.id === fromId);
    return pend.find((i) => list.indexOf(i) > at) || pend[0];
};
const jumpTo = (e) => {
    const el = document.getElementById(`bk-f-${e.field}`) || document.getElementById(`bk-${e.section}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => el.querySelector("input:not([type=file]),textarea,button")?.focus({ preventScroll: true }), 350);
};
const DUP_CATALOG = "This product is already in the catalog (same name and brand). Change the name or brand, or remove it from this upload.";

export default function AdminCatalogBulkUpload({ token, say, onExit }) {
    useDropGuard();
    const [view, setView] = useState("load"); // load | intro | summary | review | done
    const [items, setItems] = useState([]);
    const [curId, setCurId] = useState(null);
    const [parsed, setParsed] = useState(null);
    const [busy, setBusy] = useState("");
    const [showErr, setShowErr] = useState(false);
    const [saveState, setSaveState] = useState("saved");
    const [units, setUnits] = useState([]);
    const [loadError, setLoadError] = useState(null);
    const [manager, setManager] = useState(false);
    const [chk, setChk] = useState(null);          // catalog check for the product on screen: { dup }
    const root = useRef(null);
    const itemsRef = useRef(items);
    itemsRef.current = items;
    const scrollTop = () => root.current?.scrollIntoView({ block: "start" });
    useEffect(() => { scrollTop(); }, [view, curId]);
    useEffect(() => { setChk(null); }, [curId]);

    const uploadFn = useCallback((file) => uploadCatalogImage(token, file), [token]);

    /* ---------- first load: unit list + saved unfinished products ---------- */
    useEffect(() => {
        let alive = true;
        Promise.all([fetchCatalogBulkMeta(token), fetchCatalogDrafts(token)]).then(([m, d]) => {
            if (!alive) return;
            if (!m?.success || !m.units?.length) { setLoadError(m?.message || "Could not load the list of units."); return; }
            if (!d?.success) { setLoadError(d?.message || "Could not load saved products."); return; }
            setUnits(m.units); setItems(d.items); setView("intro");
        });
        return () => { alive = false; };
    }, [token]);

    /* ---------- autosave ---------- */
    const dirty = useRef(new Map());
    const timer = useRef(null);
    const flush = useCallback(async ({ keepalive = false } = {}) => {
        clearTimeout(timer.current);
        const entries = [...dirty.current.entries()];
        if (!entries.length) return true;
        dirty.current = new Map();
        setSaveState("saving");
        const rs = await Promise.all(entries.map(([id, data]) => patchCatalogDraft(token, id, data, { keepalive })));
        const failed = rs.map((r, i) => (r?.success || r?.status === 404 ? null : entries[i])).filter(Boolean);
        failed.forEach(([id, data]) => { if (!dirty.current.has(id)) dirty.current.set(id, data); });
        setSaveState(failed.length ? "error" : dirty.current.size ? "saving" : "saved");
        return !failed.length;
    }, [token]);
    const onEdit = useCallback((id, data) => {
        setItems((l) => l.map((i) => (i.id === id ? { ...i, data } : i)));
        dirty.current.set(id, data);
        setSaveState("saving");
        clearTimeout(timer.current);
        timer.current = setTimeout(() => flush(), 900);
    }, [flush]);
    useEffect(() => {
        const hide = () => { if (document.visibilityState === "hidden") flush({ keepalive: true }); };
        const gone = () => flush({ keepalive: true });
        document.addEventListener("visibilitychange", hide);
        window.addEventListener("pagehide", gone);
        return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", gone); flush(); };
    }, [flush]);

    /* ---------- problems per product (same rules as the single "Confirm" button, minus the catalog lookup) ---------- */
    const getIssues = useCallback((list) => {
        const out = new Map();
        const seen = new Map();
        list.forEach((it, idx) => {
            const key = itemKey(it.data);
            if (it.status === "pending") {
                const msgs = [];
                if (key && seen.has(key)) msgs.push(`Product ${seen.get(key) + 1} in this upload has the same name and brand. Change the name or brand, or remove this one.`);
                validateData(it.data, units).forEach((e) => msgs.push(e.msg));
                out.set(it.id, msgs);
            }
            if (key && it.status !== "skipped" && !seen.has(key)) seen.set(key, idx);
        });
        return out;
    }, [units]);

    /* ---------- bulk actions: photos / remove / submit ---------- */
    const applyDraftPhotos = async (ids, images, mode, onProgress) => {
        await flush(); // make sure no pending edit is overwritten
        const r = await bulkCatalogDraftImages(token, ids, images, mode, onProgress);
        if (r.items.length) {
            const m = new Map(r.items.map((x) => [x.id, x.im]));
            setItems((l) => l.map((i) => (m.has(i.id) ? { ...i, data: { ...i.data, im: m.get(i.id) } } : i)));
        }
        if (r.success) say(`Photos ${mode === "replace" ? "replaced" : "added"} on ${plural(r.updated, "product", "products")}${r.skipped ? `, ${r.skipped} skipped` : ""}.`);
        return r;
    };

    const removeMany = async (ids) => {
        ids.forEach((id) => dirty.current.delete(id));
        const r = await bulkCatalogDraftDelete(token, ids);
        if (r.ids.length) {
            const gone = new Set(r.ids);
            setItems((l) => l.filter((i) => !gone.has(i.id)));
        }
        say(r.success ? `Removed ${plural(r.deleted, "product", "products")} from this upload.` : r.message);
        return r;
    };

    // Submits many products in batches of 25. Products with any problem are never sent. Failed ones stay in the list.
    const submitMany = async (ids, { onProgress, shouldStop } = {}) => {
        await flush();
        const snapshot = itemsRef.current;
        const issues = getIssues(snapshot);
        const byId = new Map(snapshot.map((i) => [i.id, i]));
        const res = { success: true, total: 0, submitted: 0, already: 0, invalid: 0, failed: [], stopped: false, expired: false, warnings: [] };
        const queue = [];
        ids.forEach((id) => {
            const it = byId.get(id);
            if (!it || it.status !== "pending") return;
            if (issues.get(id)?.length) { res.invalid += 1; return; }
            queue.push(id);
        });
        res.total = queue.length;
        const nameOf = (id) => byId.get(id)?.data?.n?.trim() || "Product";

        let done = 0;
        onProgress?.(0, queue.length);
        for (const batch of chunkArr(queue, SUBMIT_CHUNK)) {
            if (shouldStop?.()) { res.stopped = true; break; }
            const r = await submitCatalogDrafts(token, batch);
            if (!r?.success) {
                if (r?.status === 401) { res.expired = true; break; }
                batch.forEach((id) => res.failed.push({ name: nameOf(id), msg: r?.message || "Could not add this product." }));
            } else {
                const marks = new Map();
                const answered = new Set();
                (r.results || []).forEach((x) => {
                    answered.add(x.id);
                    if (x.status === "submitted") { res.submitted += 1; marks.set(x.id, "submitted"); }
                    else if (x.status === "duplicate") { res.already += 1; marks.set(x.id, "skipped"); }
                    else if (x.status === "invalid") res.invalid += 1;
                    else res.failed.push({ name: nameOf(x.id), msg: x.message || "Could not add this product." });
                });
                batch.forEach((id) => { if (!answered.has(id)) res.failed.push({ name: nameOf(id), msg: "No answer from the server for this product." }); });
                (r.warnings || []).forEach((w) => { if (!res.warnings.includes(w)) res.warnings.push(w); });
                if (marks.size) {
                    marks.forEach((_, id) => dirty.current.delete(id));
                    setItems((l) => l.map((i) => (marks.has(i.id) ? { ...i, status: marks.get(i.id) } : i)));
                }
            }
            done += batch.length;
            onProgress?.(done, queue.length);
        }
        if (res.expired) say("Your login expired. Sign in again and continue.");
        return res;
    };

    /* ---------- intro ---------- */
    const getTemplate = async () => {
        if (busy) return;
        setBusy("template");
        try { await downloadCatalogTemplate({ units }); }
        catch { say("Could not create the template. Please try again."); }
        finally { setBusy(""); }
    };

    // Asks the server which name + brand pairs are already in the catalog (200 unique pairs per call).
    const checkAgainstCatalog = async (rawRows) => {
        const prelim = rawRows.map((r) => rowToData(r, units).data);
        const uniq = new Map();
        const order = prelim.map((d) => {
            const k = itemKey(d);
            if (k && !uniq.has(k)) uniq.set(k, { n: d.n, b: d.b });
            return k;
        });
        const keys = [...uniq.keys()];
        const results = new Map();
        for (const part of chunkArr(keys, CHECK_CHUNK)) {
            const r = await checkCatalogRows(token, part.map((k) => uniq.get(k)));
            if (!r?.success || r.items?.length !== part.length) return null;
            part.forEach((k, i) => results.set(k, r.items[i]));
        }
        return order.map((k) => (k ? results.get(k) : null));
    };

    const onFile = async (file) => {
        if (!file || busy) return;
        if (!/\.xlsx$/i.test(file.name)) return say("Please upload the .xlsx template file.");
        setBusy("parse");
        try {
            const raw = await readCatalogSheet(file);
            if (!raw.length) return say("No products found. Fill in the Products sheet and upload again.");
            const checks = await checkAgainstCatalog(raw);
            const waitingKeys = new Set(itemsRef.current.map((i) => itemKey(i.data)).filter(Boolean));
            const { results } = parseRows(raw, { units, checks, waitingKeys });
            setParsed({ fileName: file.name, results, checked: !!checks, batchId: uuid() });
            setView("summary");
        } catch (err) { say(err?.message || "Could not read this file."); }
        finally { setBusy(""); }
    };
    const drop = useDrop((files) => onFile(files[0]), { disabled: !!busy });

    const discardAll = async () => {
        if (!window.confirm(`Discard all ${items.length} unfinished products? This cannot be undone.`)) return;
        const r = await clearCatalogDrafts(token);
        if (!r?.success) return say(r?.message || "Could not discard.");
        dirty.current = new Map(); setItems([]); say("Unfinished products discarded.");
    };

    /* ---------- summary -> review ---------- */
    const startReview = async () => {
        const keep = (parsed?.results || []).filter((x) => !x.dup);
        if (!keep.length || busy) return;
        setBusy("save");
        const r = await saveCatalogDrafts(token, { batchId: parsed.batchId, fileName: parsed.fileName, rows: keep.map((x) => ({ rowNo: x.rowNo, data: x.data })) });
        setBusy("");
        if (!r?.success) return say(r?.message || "Could not save your products. Please try again.");
        setItems((prev) => [...prev.filter((p) => !r.items.some((f) => f.id === p.id)), ...r.items]);
        setParsed(null); setShowErr(false);
        setCurId(r.items[0]?.id || null);
        setView(r.items.length ? "review" : "intro");
    };

    /* ---------- review ---------- */
    const cur = items.find((i) => i.id === curId) || null;
    const pending = items.filter((i) => i.status === "pending");
    const noPhoto = pending.filter((i) => !i.data?.im?.length).length;
    const submittedCount = items.filter((i) => i.status === "submitted").length;
    const pos = cur ? items.findIndex((i) => i.id === cur.id) + 1 : 0;
    const dupMsg = useMemo(() => {
        if (!cur) return null;
        const key = itemKey(cur.data);
        if (!key) return null;
        if (chk?.dup) return DUP_CATALOG;
        const at = items.findIndex((i) => i.id === cur.id);
        const other = items.findIndex((i, idx) => idx < at && i.status !== "skipped" && itemKey(i.data) === key);
        return other >= 0 ? `Product ${other + 1} in this upload has the same name and brand. Change the name or brand, or remove this one.` : null;
    }, [cur, items, chk]);
    const errors = useMemo(() => {
        if (!cur) return [];
        const list = validateData(cur.data, units);
        return dupMsg ? [{ section: "product", field: "n", msg: dupMsg }, ...list] : list;
    }, [cur, units, dupMsg]);
    const flagged = useMemo(() => new Set(items.filter((i) => i.status === "pending" && quickIssues(i.data, units).length).map((i) => i.id)), [items, units]);
    const lastPending = pending.length <= 1;

    useEffect(() => { if (view === "review" && !cur) setView(pending.length ? "review" : "done"); }, [view, cur]); // eslint-disable-line
    useEffect(() => { if (view === "review" && !cur && pending.length) setCurId(pending[0].id); }, [view, cur, pending.length]); // eslint-disable-line
    // the product on screen was just submitted by a bulk action: move on to the next one still waiting
    useEffect(() => {
        if (view !== "review" || !cur || cur.status === "pending") return;
        const n = items.find((i) => i.status === "pending");
        if (n) { setShowErr(false); setCurId(n.id); } else setView("done");
    }, [view, cur, items]);

    const goTo = async (id) => { await flush(); setShowErr(false); setCurId(id); };
    const skip = async () => {
        await flush();
        const n = nextPending(items, curId);
        if (!n) { setView("done"); return; }
        setShowErr(false); setCurId(n.id);
    };
    const saveExit = async () => { await flush(); onExit?.(); };
    const removeCurrent = async () => {
        if (!cur || busy) return;
        if (!window.confirm("Remove this product from the upload? It won't be added.")) return;
        const n = nextPending(items, cur.id);
        dirty.current.delete(cur.id);
        const r = await deleteCatalogDraft(token, cur.id);
        if (!r?.success) return say(r?.message || "Could not remove it. Try again.");
        setItems((l) => l.filter((i) => i.id !== cur.id));
        if (n) { setShowErr(false); setCurId(n.id); } else setView("done");
    };

    // the server has already removed the draft when it answers "submitted" or "duplicate"
    const finishItem = (status, msg) => {
        dirty.current.delete(cur.id);
        const list = items.map((i) => (i.id === cur.id ? { ...i, status } : i));
        setItems(list);
        say(msg);
        const n = nextPending(list, cur.id);
        if (n) { setShowErr(false); setCurId(n.id); } else setView("done");
    };

    const confirm = async () => {
        if (!cur || busy) return;
        if (errors.length) { setShowErr(true); say(errors[0].msg); jumpTo(errors[0]); return; }
        setBusy("submit");
        try {
            await flush();
            const r = await submitCatalogDrafts(token, [cur.id]);
            if (!r?.success) return say(r?.status === 401 ? "Your login expired. Sign in again and continue." : (r?.message || "Could not add this product. Please try again."));
            const x = (r.results || []).find((y) => y.id === cur.id);
            if (!x) return say("No answer from the server for this product. Please try again.");
            if (x.status === "submitted") return finishItem("submitted", "Product added to the catalog.");
            if (x.status === "duplicate") return finishItem("skipped", "Already in the catalog, so it was skipped.");
            if (x.status === "invalid") { setShowErr(true); return say(x.message || "Please check the highlighted fields."); }
            say(x.message || "Could not add this product.");
        } finally { setBusy(""); }
    };

    /* ---------- render ---------- */
    const results = parsed?.results || [];
    const dupRows = results.filter((r) => r.dup);
    const readyRows = results.filter((r) => r.ok);
    const checkRows = results.filter((r) => !r.ok && !r.dup);
    const keepCount = results.length - dupRows.length;
    const photoless = results.filter((r) => !r.dup && r.noPhoto).length;
    const noteRows = results.filter((r) => !r.dup && r.notes.length);
    const hasBar = view === "review";

    return (
        <div className="gl gbk" ref={root}>
            <div className="gs">
                <div className={`bk-wrap${hasBar ? " hb" : ""}`}>
                    {view === "load" && (loadError
                        ? <section className="scr ctr"><h2>Could not open bulk upload</h2><p className="sub">{loadError}</p></section>
                        : <GrowCheckSkeleton />)}

                    {view === "intro" && (
                        <section className="scr">
                            <p className="kick">Bulk upload</p>
                            <h2>Add many products at once</h2>
                            <p className="sub">Start from the product name. No category is needed. Products go live right away and wait under “Needs mapping” until you map them to a generic product.</p>

                            {items.length > 0 && (
                                <div className="bk-resume">
                                    <div><b>{plural(items.length, "unfinished product", "unfinished products")}</b><small>Saved from {items[0].file_name || "an earlier upload"}. Pick up where you left off.</small></div>
                                    <div className="bk-ra">
                                        <button className="sbtn sm" type="button" onClick={() => { setCurId(items[0].id); setShowErr(false); setView("review"); }}>Continue</button>
                                        {pending.length > 1 && <button className="sbtn gh sm" type="button" onClick={() => setManager(true)}>Bulk actions</button>}
                                        <button className="lnk" type="button" onClick={discardAll}>Discard all</button>
                                    </div>
                                </div>
                            )}

                            <div className="pn bk-step" style={{ marginTop: 18 }}>
                                <span className="bk-n">1</span>
                                <div>
                                    <h3>Download the Excel sheet</h3>
                                    <p>Plain column names, dropdowns for Unit and GST %, a tip on every column and 3 example rows. Up to {MAX_ROWS} products per file.</p>
                                    <button className="sbtn gh sm" type="button" onClick={getTemplate} disabled={!!busy}>{busy === "template" ? "Preparing…" : "Download Excel sheet (.xlsx)"}</button>
                                </div>
                            </div>
                            <div className="pn bk-step">
                                <span className="bk-n">2</span>
                                <div><h3>Fill in the products</h3><p>One product per row. A <b>grey</b> cell can be skipped. An <b>orange</b> cell is still needed. Photos can be added on the next screens.</p></div>
                            </div>
                            <div className="pn bk-step">
                                <span className="bk-n">3</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <h3>Upload the file</h3>
                                    <label className={`gx-drop${drop.active ? " on" : ""}${busy === "parse" ? " off" : ""}`} {...drop.bind}>
                                        {busy === "parse" ? "Checking your file against the catalog…" : <><span>Drag and drop your .xlsx here or <b>browse</b></span><em>Nothing is thrown away. You can fix gaps on the next screens.</em></>}
                                        <input type="file" accept=".xlsx" hidden disabled={!!busy} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
                                    </label>
                                </div>
                            </div>
                        </section>
                    )}

                    {view === "summary" && parsed && (
                        <section className="scr">
                            <p className="kick">File checked</p>
                            <h2>{parsed.fileName}</h2>
                            <div className="bk-stats">
                                <div><b>{results.length}</b><small>Products found</small></div>
                                <div className="ok"><b>{readyRows.length}</b><small>Complete</small></div>
                                <div className={checkRows.length ? "warn" : ""}><b>{checkRows.length}</b><small>Need a small fix</small></div>
                                <div className={dupRows.length ? "skip" : ""}><b>{dupRows.length}</b><small>Left out</small></div>
                            </div>
                            {!parsed.checked && <p className="gx-sum info" style={{ marginTop: 14 }}>Could not compare this file with the catalog right now. Products that already exist are skipped when you submit them.</p>}
                            {noteRows.length > 0 && <p className="cap" style={{ marginTop: 10 }}>{plural(noteRows.length, "row has", "rows have")} a note: {noteRows[0].notes[0]}{noteRows.length > 1 ? ` (and ${noteRows.length - 1} more)` : ""}</p>}
                            <p className="gx-sum info" style={{ marginTop: 14 }}>
                                {!keepCount ? "Every product in this file is already in the catalog or repeated, so there is nothing new to continue with."
                                    : checkRows.length ? "All new products continue. You will finish the missing parts on the next screen, one product at a time."
                                        : photoless ? `Everything looks good. ${plural(photoless, "product has", "products have")} no photos yet. You can add them next, one by one or in bulk.`
                                            : "Everything looks good. Next you can check each product."}
                            </p>
                            {dupRows.length > 0 && (
                                <div className="pn bk-dups" style={{ marginTop: 16 }}>
                                    <h3 className="bk-h3">Left out: already added</h3>
                                    <ul>{dupRows.slice(0, 40).map((r) => <li key={r.rowNo}><b>Row {r.rowNo} · {r.data.n}</b><span>{r.dup.msg}</span></li>)}</ul>
                                    {dupRows.length > 40 && <p className="cap">…and {dupRows.length - 40} more.</p>}
                                </div>
                            )}
                            {checkRows.length > 0 && (
                                <div className="pn" style={{ marginTop: 16 }}>
                                    <h3 className="bk-h3">What you will need to finish</h3>
                                    <div className="bk-errs">
                                        {checkRows.slice(0, 40).map((r) => (
                                            <details key={r.rowNo}>
                                                <summary>Row {r.rowNo}{r.data.n ? ` · ${r.data.n}` : ""} <em>{plural(r.fixes.length, "thing", "things")}</em></summary>
                                                <ul>{r.fixes.map((e, i) => <li key={i}><b>{e.col}:</b> {e.msg}</li>)}</ul>
                                            </details>
                                        ))}
                                        {checkRows.length > 40 && <p className="cap">…and {checkRows.length - 40} more products.</p>}
                                    </div>
                                </div>
                            )}
                            <button className="sbtn" type="button" style={{ marginTop: 18 }} disabled={!keepCount || !!busy} onClick={startReview}>
                                {busy === "save" ? "Saving…" : keepCount ? `Continue with ${plural(keepCount, "product", "products")}` : "Nothing new to add"}
                            </button>
                            <button className="sbtn gh" type="button" disabled={!!busy} onClick={() => { setParsed(null); setView("intro"); }}>Choose a different file</button>
                        </section>
                    )}

                    {view === "review" && cur && (
                        <>
                            <section className="scr on">
                                <div className="bk-top">
                                    <p className="kick" style={{ margin: 0 }}>Product {pos} of {items.length} · {submittedCount} done</p>
                                    <div className="bk-top-r">
                                        <span className={`bk-save ${saveState}`} aria-live="polite">{saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved, trying again" : "Saved"}</span>
                                        <button className="lnk" type="button" onClick={saveExit}>Save and exit</button>
                                    </div>
                                </div>
                                {pending.length > 1 && (
                                    <div className="bk-resume" style={{ marginBottom: 12 }}>
                                        <div>
                                            <b>{noPhoto ? `${plural(noPhoto, "product has", "products have")} no photos yet` : "Bulk actions"}</b>
                                            <small>Add photos to many, remove many, or submit every finished product in one go.</small>
                                        </div>
                                        <div className="bk-ra">
                                            <button className="sbtn sm" type="button" disabled={!!busy} onClick={() => setManager(true)}>Bulk actions</button>
                                        </div>
                                    </div>
                                )}
                                <div className="bk-chips" role="tablist" aria-label="Products in this upload">
                                    {items.map((it, i) => (
                                        <button key={it.id} type="button" className={`${it.status}${it.id === cur.id ? " cur" : ""}${flagged.has(it.id) ? " flag" : ""}`} aria-current={it.id === cur.id}
                                            disabled={it.status !== "pending" || !!busy} onClick={() => goTo(it.id)} title={`${it.data?.n || `Product ${i + 1}`}${flagged.has(it.id) ? " (needs something)" : ""}`}>
                                            {it.status === "submitted" ? "✓" : it.status === "skipped" ? "–" : i + 1}
                                        </button>
                                    ))}
                                </div>
                                <div className="pv" aria-live="polite">
                                    <div className="th" style={cur.data.im?.[0] ? { backgroundImage: `url(${cur.data.im[0]})` } : undefined}>{cur.data.im?.[0] ? "" : (cur.data.n.trim()[0] || "+").toUpperCase()}</div>
                                    <div><b>{cur.data.n.trim() || "Your product"}</b><small>{[cur.data.b.trim(), cur.data.model.trim(), cur.data.gst !== "" ? `GST ${cur.data.gst}%` : ""].filter(Boolean).join(" · ") || "Check the details below"}</small></div>
                                </div>
                                <div className={`bk-todo${errors.length ? "" : " ok"}`} role="status" aria-live="polite">
                                    {errors.length ? (<>
                                        <b>{plural(errors.length, "thing", "things")} left to do</b>
                                        <small>Tap a line to go straight to it.</small>
                                        <div className="bk-todo-l">{errors.map((e, i) => <button key={`${e.field}-${i}`} type="button" onClick={() => jumpTo(e)}><i>{i + 1}</i><span>{e.msg}</span></button>)}</div>
                                    </>) : <b>Everything is filled in. Press “{lastPending ? "Confirm and finish" : "Confirm and next"}”.</b>}
                                </div>
                                <CatalogItemForm key={cur.id} token={token} P={cur.data} onChange={(d) => onEdit(cur.id, d)} say={say}
                                    units={units} errors={errors} showErrors={showErr} onCheck={setChk} />
                                <button className="lnk bk-rm" type="button" onClick={removeCurrent} disabled={!!busy}>Remove this product from the upload</button>
                            </section>
                            <div className="bar"><div>
                                <button className="sbtn gh sm" type="button" disabled={!!busy || lastPending} onClick={skip}>Skip for now</button>
                                <button className="sbtn" type="button" disabled={!!busy} onClick={confirm}>{busy === "submit" ? "Saving…" : lastPending ? "Confirm and finish" : "Confirm and next"}</button>
                            </div></div>
                        </>
                    )}

                    {view === "done" && (
                        <section className="scr ctr">
                            <div className="big" aria-hidden="true">✓</div>
                            <h2>{pending.length ? "Upload paused" : "Bulk upload complete"}</h2>
                            <p className="sub">
                                {plural(submittedCount, "product", "products")} added to the catalog
                                {pending.length ? `, ${pending.length} still waiting. They are saved, so you can finish any time.` : "."}
                                {submittedCount > 0 && " They are live and listed under “Needs mapping” until you map them to a generic product."}
                            </p>
                            {pending.length > 0 && <button className="sbtn" type="button" onClick={() => { setCurId(pending[0].id); setShowErr(false); setView("review"); }}>Continue with the rest</button>}
                            {pending.length > 1 && <button className="sbtn gh" type="button" onClick={() => setManager(true)}>Bulk actions</button>}
                            <button className="sbtn" type="button" onClick={() => onExit?.()}>Back to catalog</button>
                            <button className="sbtn gh" type="button" onClick={() => { setItems((l) => l.filter((i) => i.status === "pending")); setView("intro"); }}>Upload another file</button>
                        </section>
                    )}
                </div>
            </div>

            {manager && (
                <CatalogDraftManagerPanel items={items} getIssues={getIssues} uploadFn={uploadFn}
                    onApplyPhotos={applyDraftPhotos} onRemove={removeMany} onSubmit={submitMany} onClose={() => setManager(false)} say={say} />
            )}
        </div>
    );
}