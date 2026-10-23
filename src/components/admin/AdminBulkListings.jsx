// Bulk upload on behalf of a seller. Same Excel template, validation and per-product review as GROW bulk upload.
// Unfinished products are saved server-side per GSTIN (admin_listing_drafts).
//   live seller   -> "Confirm" creates the listing at once (auto-approved)
//   not live yet  -> "Confirm" stages it; it publishes when the business finishes seller setup
// Admin extra: "Add photos to many" gives the same photos to any selection of unfinished products.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSellerSubmission, createListingForExistingBrand } from "../../utils/api.js";
import { fetchListingPolicyOptions, fetchGeoCountries, fetchGeoStates, findBrandItemMatch, fetchAllMySubmissions } from "../../utils/sellerListingApi.js";
import { fetchDrafts, saveDrafts, patchDraft, deleteDraft, clearDrafts, stageListing, fetchStaged, bulkImages } from "../../utils/api.adminListings.js";
import { parseRows, validateData, quickIssues, itemKey, productKey, applyMatch, packagingDiffers, MAX_ROWS } from "../../utils/bulkSchema.js";
import { downloadTemplate, readProductSheet } from "../../utils/bulkExcel.js";
import { buildPayload } from "../../utils/bulkSubmit.js";
import BulkItemForm from "../grow/BulkItemForm.jsx";
import GrowCheckSkeleton from "../grow/GrowCheckSkeleton.jsx";
import DraftPhotoPanel from "./DraftPhotoPanel.jsx";
import { useDrop, useDropGuard } from "../grow/growUi.js";
import "../grow/grow-start.css";
import "../grow/grow-extras.css";
import "../grow/grow-access.css";
import "../grow/grow-bulk.css";

const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16);
}));
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
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

export default function AdminBulkListings({ token, sellerToken, live, gstin, say, onChanged, onExit }) {
    useDropGuard();
    const [view, setView] = useState("load"); // load | intro | summary | review | done
    const [items, setItems] = useState([]);
    const [curId, setCurId] = useState(null);
    const [parsed, setParsed] = useState(null);
    const [busy, setBusy] = useState("");
    const [showErr, setShowErr] = useState(false);
    const [saveState, setSaveState] = useState("saved");
    const [geo, setGeo] = useState({ status: "idle", india: null, states: [] });
    const [policy, setPolicy] = useState(null);
    const [listedKeys, setListedKeys] = useState(() => new Set());
    const [loadError, setLoadError] = useState(null);
    const [photoPanel, setPhotoPanel] = useState(false);
    const root = useRef(null);
    const scrollTop = () => root.current?.scrollIntoView({ block: "start" });
    useEffect(() => { scrollTop(); }, [view, curId]);

    /* ---------- reference data ---------- */
    const loadGeo = useCallback(async () => {
        setGeo((g) => ({ ...g, status: "loading" }));
        try {
            const c = await fetchGeoCountries();
            const india = c?.items?.find((x) => x.name?.toLowerCase() === "india");
            if (!india) throw new Error("no country");
            const r = await fetchGeoStates(india.id, "");
            if (!r?.success) throw new Error("no states");
            const next = { status: "ready", india, states: r.items.map((s) => ({ id: s.id, name: s.name })) };
            setGeo(next); return next;
        } catch { setGeo((g) => ({ ...g, status: "error" })); return null; }
    }, []);
    const loadPolicy = useCallback(async () => {
        try {
            const [r, w] = await Promise.all([fetchListingPolicyOptions("return_policy"), fetchListingPolicyOptions("warranty")]);
            if (!r?.success || !w?.success || !r.items?.length || !w.items?.length) return null;
            const next = { ret: r.items, war: w.items };
            setPolicy(next); return next;
        } catch { return null; }
    }, []);
    // name+brand of everything this GSTIN already has (listed, or waiting in the queue)
    const loadListed = useCallback(async () => {
        try {
            const s = new Set();
            if (live) {
                const r = await fetchAllMySubmissions(sellerToken);
                if (!r?.success) return null;
                r.items.filter((i) => i.review_status !== "rejected").forEach((i) => { const k = productKey(i.product_name, i.brand_name, !i.brand_name); if (k) s.add(k); });
            } else {
                const r = await fetchStaged(token, gstin);
                if (!r?.success) return null;
                r.items.filter((i) => ["staged", "publishing", "failed"].includes(i.status)).forEach((i) => { const k = productKey(i.product_name, i.brand_name, !i.brand_name); if (k) s.add(k); });
            }
            setListedKeys(s); return s;
        } catch { return null; }
    }, [live, sellerToken, token, gstin]);

    useEffect(() => {
        let alive = true;
        fetchDrafts(token, gstin).then((r) => {
            if (!alive) return;
            if (!r?.success) { setLoadError(r?.message || "Could not load saved products."); return; }
            setItems(r.items); setView("intro");
        });
        loadGeo(); loadPolicy(); loadListed();
        return () => { alive = false; };
    }, [token, gstin]); // eslint-disable-line

    /* ---------- autosave ---------- */
    const dirty = useRef(new Map());
    const timer = useRef(null);
    const flush = useCallback(async ({ keepalive = false } = {}) => {
        clearTimeout(timer.current);
        const entries = [...dirty.current.entries()];
        if (!entries.length) return true;
        dirty.current = new Map();
        setSaveState("saving");
        const rs = await Promise.all(entries.map(([id, data]) => patchDraft(token, id, data, { keepalive })));
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

    /* ---------- same photos on many unfinished products ---------- */
    const applyDraftPhotos = async (ids, images, mode, onProgress) => {
        await flush(); // make sure no pending edit is overwritten
        const r = await bulkImages("drafts", token, gstin, ids, images, mode, onProgress);
        if (r.items.length) {
            const m = new Map(r.items.map((x) => [x.id, x.im]));
            setItems((l) => l.map((i) => (m.has(i.id) ? { ...i, data: { ...i.data, im: m.get(i.id) } } : i)));
        }
        if (r.success) say(`Photos ${mode === "replace" ? "replaced" : "added"} on ${plural(r.updated, "product", "products")}${r.skipped ? `, ${r.skipped} skipped` : ""}.`);
        return r;
    };

    /* ---------- intro ---------- */
    const getTemplate = async () => {
        if (busy) return;
        setBusy("template");
        try {
            const p = policy || await loadPolicy();
            if (!p) return say("Could not load the lists for the template. Please try again.");
            await downloadTemplate({ policy: p });
        } catch { say("Could not create the template. Please try again."); } finally { setBusy(""); }
    };
    const onFile = async (file) => {
        if (!file || busy) return;
        if (!/\.xlsx$/i.test(file.name)) return say("Please upload the .xlsx template file.");
        setBusy("parse");
        try {
            const p = policy || await loadPolicy();
            if (!p) return say("Could not load the lists needed to check your file.");
            const { rows, samples } = await readProductSheet(file);
            if (!rows.length) return say("No products found. Fill in the Products sheet and upload again.");
            const listed = (await loadListed()) || listedKeys;
            const waiting = new Set(items.map((i) => itemKey(i.data)).filter(Boolean));
            const results = parseRows(rows, { policy: p, statesTotal: geo.states.length || 30, listedKeys: listed, waitingKeys: waiting });
            setParsed({ fileName: file.name, results, samples, batchId: uuid() });
            setView("summary");
        } catch (err) { say(err?.message || "Could not read this file."); } finally { setBusy(""); }
    };
    const drop = useDrop((files) => onFile(files[0]), { disabled: !!busy });
    const discardAll = async () => {
        if (!window.confirm(`Discard all ${items.length} unfinished products? This cannot be undone.`)) return;
        const r = await clearDrafts(token, gstin);
        if (!r?.success) return say(r?.message || "Could not discard.");
        dirty.current = new Map(); setItems([]); say("Unfinished products discarded.");
    };

    /* ---------- summary -> review ---------- */
    const startReview = async () => {
        const keep = (parsed?.results || []).filter((x) => !x.dup);
        if (!keep.length || busy) return;
        setBusy("save");
        const r = await saveDrafts(token, { gstin, batchId: parsed.batchId, fileName: parsed.fileName, rows: keep.map((x) => ({ rowNo: x.rowNo, data: x.data })) });
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
        if (listedKeys.has(key)) return live ? "This seller already has this product. Change the name or brand, or remove it from this upload." : "This product is already waiting for this GSTIN. Change the name or brand, or remove it.";
        const at = items.findIndex((i) => i.id === cur.id);
        const other = items.findIndex((i, idx) => idx < at && i.status !== "skipped" && itemKey(i.data) === key);
        return other >= 0 ? `Product ${other + 1} in this upload has the same name and brand. Change the name or brand, or remove this one.` : null;
    }, [cur, items, listedKeys, live]);
    const errors = useMemo(() => {
        if (!cur) return [];
        const list = validateData(cur.data, geo.states.length);
        return dupMsg ? [{ section: "product", field: "n", msg: dupMsg }, ...list] : list;
    }, [cur, geo.states.length, dupMsg]);
    const flagged = useMemo(() => new Set(items.filter((i) => i.status === "pending" && quickIssues(i.data, geo.states.length || 30).length).map((i) => i.id)), [items, geo.states.length]);

    useEffect(() => { if (view === "review" && !cur) setView(pending.length ? "review" : "done"); }, [view, cur]); // eslint-disable-line
    useEffect(() => { if (view === "review" && !cur && pending.length) setCurId(pending[0].id); }, [view, cur, pending.length]); // eslint-disable-line

    const goTo = async (id) => { await flush(); setShowErr(false); setCurId(id); };
    const skip = async () => {
        await flush();
        const n = nextPending(items, curId);
        if (!n) { setView("done"); return; }
        setShowErr(false); setCurId(n.id);
    };
    const saveExit = async () => { await flush(); onChanged?.(); onExit?.(); };
    const removeCurrent = async () => {
        if (!cur || busy) return;
        if (!window.confirm("Remove this product from the upload? It won't be added.")) return;
        const n = nextPending(items, cur.id);
        dirty.current.delete(cur.id);
        const r = await deleteDraft(token, cur.id);
        if (!r?.success) return say(r?.message || "Could not remove it. Try again.");
        setItems((l) => l.filter((i) => i.id !== cur.id));
        if (n) { setShowErr(false); setCurId(n.id); } else setView("done");
    };

    const finishItem = (status, msg) => {
        dirty.current.delete(cur.id);
        deleteDraft(token, cur.id);
        const list = items.map((i) => (i.id === cur.id ? { ...i, status } : i));
        setItems(list);
        say(msg);
        const n = nextPending(list, cur.id);
        if (n) { setShowErr(false); setCurId(n.id); } else setView("done");
        onChanged?.();
    };

    const confirm = async () => {
        if (!cur || busy) return;
        if (errors.length) { setShowErr(true); say(errors[0].msg); jumpTo(errors[0]); return; }
        if (!geo.india) return say("Delivery places are still loading. Try again in a moment.");
        setBusy("submit");
        try {
            const P = cur.data;
            const mr = await findBrandItemMatch(live ? sellerToken : token, { productName: P.n.trim(), brandName: P.b.trim(), brandNotApplicable: P.nb });
            if (!mr?.success) return say("Could not check the catalogue. Please try again.");
            const match = mr.match || null;
            if (match) {
                const applied = applyMatch(P, match);
                if (packagingDiffers(P, applied)) {
                    onEdit(cur.id, applied); setShowErr(true);
                    return say("This product is already on the marketplace, so its packing and GST were applied. Please check minimum order, stock and price again.");
                }
            }
            await flush();
            const payload = buildPayload(P, { india: geo.india, seller: null, match });
            const res = live
                ? (payload.genericProductBrandId ? await createListingForExistingBrand(sellerToken, payload) : await createSellerSubmission(sellerToken, payload))
                : await stageListing(token, gstin, payload);

            if (!res?.success) {
                if (res?.status === 409 || /already/i.test(res?.message || "")) return finishItem("skipped", "Already listed or waiting, so it was skipped.");
                if (res?.status === 401) return say("Session expired. Load the seller again.");
                return say(res?.message || "Could not add this product. Please check the required fields.");
            }
            finishItem("submitted", live ? "Product is live." : "Saved. It goes live when this business finishes seller setup.");
        } finally { setBusy(""); }
    };

    /* ---------- render ---------- */
    const results = parsed?.results || [];
    const dupRows = results.filter((r) => r.dup);
    const readyRows = results.filter((r) => r.ok);
    const checkRows = results.filter((r) => !r.ok && !r.dup);
    const keepCount = results.length - dupRows.length;
    const lastPending = pending.length <= 1;
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
                            <p className="sub">{live ? "Products go live as soon as you confirm each one." : "Products are saved for this GSTIN and go live automatically once the business finishes seller setup."}</p>

                            {items.length > 0 && (
                                <div className="bk-resume">
                                    <div><b>{plural(items.length, "unfinished product", "unfinished products")}</b><small>Saved from {items[0].file_name || "an earlier upload"}. Pick up where you left off.</small></div>
                                    <div className="bk-ra">
                                        <button className="sbtn sm" type="button" onClick={() => { setCurId(items[0].id); setShowErr(false); setView("review"); }}>Continue</button>
                                        {pending.length > 1 && <button className="sbtn gh sm" type="button" onClick={() => setPhotoPanel(true)}>Add photos to many</button>}
                                        <button className="lnk" type="button" onClick={discardAll}>Discard all</button>
                                    </div>
                                </div>
                            )}

                            <div className="pn bk-step" style={{ marginTop: 18 }}>
                                <span className="bk-n">1</span>
                                <div>
                                    <h3>Download the Excel sheet</h3>
                                    <p>Dropdowns, help on every column and 3 example rows. Up to {MAX_ROWS} products per file.</p>
                                    <button className="sbtn gh sm" type="button" onClick={getTemplate} disabled={!!busy}>{busy === "template" ? "Preparing…" : "Download Excel sheet (.xlsx)"}</button>
                                </div>
                            </div>
                            <div className="pn bk-step">
                                <span className="bk-n">2</span>
                                <div><h3>Fill in the products</h3><p>One product per row. A <b>grey</b> cell can be skipped. An <b>orange</b> cell is still needed.</p></div>
                            </div>
                            <div className="pn bk-step">
                                <span className="bk-n">3</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <h3>Upload the file</h3>
                                    <label className={`gx-drop${drop.active ? " on" : ""}${busy === "parse" ? " off" : ""}`} {...drop.bind}>
                                        {busy === "parse" ? "Checking your file…" : <><span>Drag and drop your .xlsx here or <b>browse</b></span><em>Nothing is thrown away. You can fix gaps on the next screens.</em></>}
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
                            {parsed.samples > 0 && <p className="cap">{plural(parsed.samples, "example row was", "example rows were")} skipped.</p>}
                            <p className="gx-sum info" style={{ marginTop: 14 }}>
                                {!keepCount ? "Every product in this file is already added, so there is nothing new to continue with."
                                    : checkRows.length ? "All new products continue. You will finish the missing parts on the next screen, one product at a time."
                                        : "Everything looks good. Next you will add photos for each product."}
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
                                        {checkRows.slice(0, 40).map((r) => {
                                            const n = r.fixes.length + r.issues.length;
                                            return (
                                                <details key={r.rowNo}>
                                                    <summary>Row {r.rowNo}{r.data.n ? ` · ${r.data.n}` : ""} <em>{plural(n, "thing", "things")}</em></summary>
                                                    <ul>{r.fixes.map((e, i) => <li key={`f${i}`}><b>{e.col}:</b> {e.msg}</li>)}{r.issues.map((e, i) => <li key={`i${i}`}>{e.msg}</li>)}</ul>
                                                </details>
                                            );
                                        })}
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
                                            <b>{noPhoto ? `${plural(noPhoto, "product has", "products have")} no photos yet` : "Photos"}</b>
                                            <small>Same photos for many products? Select them and add the photos once.</small>
                                        </div>
                                        <div className="bk-ra">
                                            <button className="sbtn sm" type="button" disabled={!!busy} onClick={() => setPhotoPanel(true)}>Add photos to many</button>
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
                                    <div><b>{cur.data.n.trim() || "Your product"}</b><small>{[cur.data.nb ? "No brand" : cur.data.b.trim(), cur.data.price ? `₹${Number(cur.data.price).toLocaleString("en-IN")}` : ""].filter(Boolean).join(" · ") || "Check the details below"}</small></div>
                                </div>
                                <div className={`bk-todo${errors.length ? "" : " ok"}`} role="status" aria-live="polite">
                                    {errors.length ? (<>
                                        <b>{plural(errors.length, "thing", "things")} left to do</b>
                                        <small>Tap a line to go straight to it.</small>
                                        <div className="bk-todo-l">{errors.map((e, i) => <button key={`${e.field}-${i}`} type="button" onClick={() => jumpTo(e)}><i>{i + 1}</i><span>{e.msg}</span></button>)}</div>
                                    </>) : <b>Everything is filled in. Press “{lastPending ? "Confirm and finish" : "Confirm and next"}”.</b>}
                                </div>
                                {/* buyer search inside the form needs a seller session; it is simply empty for sellers that are not live yet */}
                                <BulkItemForm key={cur.id} token={live ? sellerToken : token} P={cur.data} onChange={(d) => onEdit(cur.id, d)} say={say}
                                    geo={{ ...geo, reload: loadGeo }} policy={policy} errors={errors} showErrors={showErr} />
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
                                {plural(submittedCount, "product", "products")} {live ? "live" : "saved for this GSTIN"}
                                {pending.length ? `, ${pending.length} still waiting. They are saved, so you can finish any time.` : "."}
                            </p>
                            {pending.length > 0 && <button className="sbtn" type="button" onClick={() => { setCurId(pending[0].id); setShowErr(false); setView("review"); }}>Continue with the rest</button>}
                            <button className="sbtn" type="button" onClick={() => onExit?.()}>{live ? "Go to products" : "View waiting list"}</button>
                            <button className="sbtn gh" type="button" onClick={() => { setItems((l) => l.filter((i) => i.status === "pending")); setView("intro"); }}>Upload another file</button>
                        </section>
                    )}
                </div>
            </div>

            {photoPanel && (
                <DraftPhotoPanel items={pending} uploadToken={live ? sellerToken : token} onApply={applyDraftPhotos} onClose={() => setPhotoPanel(false)} say={say} />
            )}
        </div>
    );
}