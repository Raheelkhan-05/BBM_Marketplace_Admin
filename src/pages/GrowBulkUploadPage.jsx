// src/pages/GrowBulkUploadPage.jsx — route: /grow/bulk (inside GrowSellerRoot)
//
//   intro   : download the template, upload the filled file, resume unfinished products
//   summary : what was found. NOTHING is rejected: products with gaps simply continue, and the seller fixes the gaps
//             on the review page, field by field
//   review  : one product at a time (photos, documents, every field editable, buyer access) with a live
//             "things left to do" list. "Confirm and next" submits THAT product right away; edits autosave
//   done    : what was submitted / what is still waiting
//
// Unfinished products live in seller_bulk_items, so closing the tab loses nothing; GrowProductsPage
// shows a "Continue bulk upload" banner.
//
// Styling: this page renders inside the seller shell (.gsl), so it wraps itself in its own
// `gl gbk` root and `gs` scope. That is what makes the grow-start / grow-extras / grow-access styles apply.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { createSellerSubmission, createListingForExistingBrand } from "../utils/api.js";
import { fetchListingPolicyOptions, fetchGeoCountries, fetchGeoStates, findBrandItemMatch, fetchAllMySubmissions } from "../utils/sellerListingApi.js";
import useSellerProfileStatus from "../hooks/useSellerProfileStatus.js";
import {
    fetchBulkItems, saveBulkItems, patchBulkItem, markBulkItem, deleteBulkItem, clearBulkItems,
} from "../utils/bulkApi.js";
import { parseRows, validateData, quickIssues, itemKey, productKey, applyMatch, packagingDiffers, MAX_ROWS } from "../utils/bulkSchema.js";
import { downloadTemplate, readProductSheet } from "../utils/bulkExcel.js";
import { buildPayload } from "../utils/bulkSubmit.js";
import { toTop } from "../components/grow/GrowAuthFlow.jsx";
import GrowCheckSkeleton from "../components/grow/GrowCheckSkeleton.jsx";
import BulkItemForm from "../components/grow/BulkItemForm.jsx";
import { useDrop, useDropGuard } from "../components/grow/growUi.js";
import "../components/grow/grow-start.css";
import "../components/grow/grow-extras.css"; // keep AFTER grow-start.css
import "../components/grow/grow-access.css";
import "../components/grow/grow-bulk.css"; // keep LAST

const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 3) | 8).toString(16);
}));

const nextPending = (list, fromId) => {
    const pend = list.filter((i) => i.status === "pending" && i.id !== fromId);
    if (!pend.length) return null;
    const at = list.findIndex((i) => i.id === fromId);
    return pend.find((i) => list.indexOf(i) > at) || pend[0];
};

// Scroll to a field (or its section) and put the cursor in it.
const jumpTo = (e) => {
    const el = document.getElementById(`bk-f-${e.field}`) || document.getElementById(`bk-${e.section}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => el.querySelector("input:not([type=file]),textarea,button")?.focus({ preventScroll: true }), 350);
};
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

export default function GrowBulkUploadPage() {
    const { token, isLoggedIn, initializing } = useAuth();
    const nav = useNavigate();
    const [sp] = useSearchParams();
    const { seller } = useSellerProfileStatus(token);
    useDropGuard();

    const [view, setView] = useState("load"); // load | auth | blocked | intro | summary | review | done
    const [items, setItems] = useState([]);
    const [curId, setCurId] = useState(null);
    const [parsed, setParsed] = useState(null);
    const [busy, setBusy] = useState(""); // template | parse | save | submit
    const [toast, setToast] = useState("");
    const [showErr, setShowErr] = useState(false); // true after the seller pressed Confirm once on this product (also reddens the photo box)
    const [saveState, setSaveState] = useState("saved"); // saved | saving | error
    const [geo, setGeo] = useState({ status: "idle", india: null, states: [] });
    const [policy, setPolicy] = useState(null);
    const [listedKeys, setListedKeys] = useState(() => new Set()); // products the seller already has in My products
    const tt = useRef(null);

    const say = useCallback((m) => { setToast(m); clearTimeout(tt.current); tt.current = setTimeout(() => setToast(""), 3200); }, []);
    useEffect(() => { toTop(); }, [view, curId]);

    /* ------------------------ reference data ------------------------ */
    const loadGeo = useCallback(async () => {
        setGeo((g) => ({ ...g, status: "loading" }));
        try {
            const c = await fetchGeoCountries();
            const india = c?.items?.find((x) => x.name?.toLowerCase() === "india");
            if (!india) throw new Error("no country");
            const r = await fetchGeoStates(india.id, "");
            if (!r?.success) throw new Error("no states");
            const next = { status: "ready", india, states: r.items.map((s) => ({ id: s.id, name: s.name })) };
            setGeo(next);
            return next;
        } catch {
            setGeo((g) => ({ ...g, status: "error" }));
            return null;
        }
    }, []);
    const loadPolicy = useCallback(async () => {
        try {
            const [r, w] = await Promise.all([fetchListingPolicyOptions("return_policy"), fetchListingPolicyOptions("warranty")]);
            if (!r?.success || !w?.success || !r.items?.length || !w.items?.length) return null;
            const next = { ret: r.items, war: w.items };
            setPolicy(next);
            return next;
        } catch { return null; }
    }, []);

    // Keys (name + brand) of everything the seller already lists. Rejected listings are left out on purpose:
    // the server lets those be resubmitted.
    const loadListed = useCallback(async () => {
        try {
            const r = await fetchAllMySubmissions(token);
            if (!r?.success) return null;
            const s = new Set();
            r.items.filter((i) => i.review_status !== "rejected").forEach((i) => {
                const k = productKey(i.product_name, i.brand_name, !i.brand_name);
                if (k) s.add(k);
            });
            setListedKeys(s);
            return s;
        } catch { return null; }
    }, [token]);

    /* ------------------------ first load / resume ------------------------ */
    useEffect(() => {
        if (initializing) return undefined;
        if (!isLoggedIn || !token) { setView("auth"); return undefined; }
        let live = true;
        fetchBulkItems(token).then((r) => {
            if (!live) return;
            if (!r?.success) { setView("blocked"); return; }
            setItems(r.items);
            if (r.items.length && sp.get("resume") === "1") { setCurId(r.items[0].id); setView("review"); } else setView("intro");
        });
        loadGeo(); loadPolicy(); loadListed();
        return () => { live = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initializing, isLoggedIn, token]);

    /* ------------------------ autosave ------------------------ */
    const dirty = useRef(new Map());
    const timer = useRef(null);
    const flush = useCallback(async ({ keepalive = false } = {}) => {
        clearTimeout(timer.current);
        const entries = [...dirty.current.entries()];
        if (!entries.length) return true;
        dirty.current = new Map();
        setSaveState("saving");
        const rs = await Promise.all(entries.map(([id, data]) => patchBulkItem(token, id, data, { keepalive })));
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

    useEffect(() => { // never lose edits when the tab is hidden, closed or the page unmounts
        const hide = () => { if (document.visibilityState === "hidden") flush({ keepalive: true }); };
        const gone = () => flush({ keepalive: true });
        document.addEventListener("visibilitychange", hide);
        window.addEventListener("pagehide", gone);
        return () => {
            document.removeEventListener("visibilitychange", hide);
            window.removeEventListener("pagehide", gone);
            flush();
        };
    }, [flush]);

    /* ------------------------ intro: template + upload ------------------------ */
    // The template and the file check only need the return/warranty lists. States are chosen on screen later.
    const getTemplate = async () => {
        if (busy) return;
        setBusy("template");
        try {
            const p = policy || await loadPolicy();
            if (!p) return say("Couldn't load the lists for the template. Please try again.");
            await downloadTemplate({ policy: p });
        } catch { say("Couldn't create the template. Please try again."); } finally { setBusy(""); }
    };

    const onFile = async (file) => {
        if (!file || busy) return;
        if (!/\.xlsx$/i.test(file.name)) return say("Please upload the .xlsx template file.");
        setBusy("parse");
        try {
            const p = policy || await loadPolicy();
            if (!p) return say("Couldn't load the lists needed to check your file. Please try again.");
            const { rows, samples } = await readProductSheet(file);
            if (!rows.length) return say("No products found. Fill in the Products sheet and upload again.");
            // fresh list of what is already in My products, plus what is still waiting from earlier uploads
            const listed = (await loadListed()) || listedKeys;
            const waiting = new Set(items.filter((i) => i.status !== "skipped").map((i) => itemKey(i.data)).filter(Boolean));
            const results = parseRows(rows, { policy: p, statesTotal: geo.states.length || 30, listedKeys: listed, waitingKeys: waiting });
            setParsed({ fileName: file.name, results, samples, batchId: uuid() });
            setView("summary");
        } catch (err) { say(err?.message || "Couldn't read this file."); } finally { setBusy(""); }
    };
    const drop = useDrop((files) => onFile(files[0]), { disabled: !!busy });

    const discardAll = async () => {
        if (!window.confirm(`Discard all ${items.filter((i) => i.status === "pending").length} unfinished products? This can't be undone.`)) return;
        const r = await clearBulkItems(token);
        if (!r?.success) return say(r?.message || "Couldn't discard. Try again.");
        dirty.current = new Map();
        setItems([]);
        say("Unfinished products discarded.");
    };

    /* ------------------------ summary -> review ------------------------ */
    // Every product continues. Gaps are completed on the review page.
    const startReview = async () => {
        const keep = (parsed?.results || []).filter((x) => !x.dup); // duplicates are never saved
        if (!keep.length || busy) return;
        setBusy("save");
        const r = await saveBulkItems(token, { batchId: parsed.batchId, fileName: parsed.fileName, rows: keep.map((x) => ({ rowNo: x.rowNo, data: x.data })) });
        setBusy("");
        if (!r?.success) return say(r?.message || "Couldn't save your products. Please try again.");
        setItems((prev) => [...prev.filter((p) => !r.items.some((f) => f.id === p.id)), ...r.items]);
        setParsed(null);
        setShowErr(false);
        setCurId(r.items[0]?.id || null);
        setView(r.items.length ? "review" : "intro");
    };

    /* ------------------------ review ------------------------ */
    const cur = items.find((i) => i.id === curId) || null;
    const pending = items.filter((i) => i.status === "pending");
    const submittedCount = items.filter((i) => i.status === "submitted").length;
    const pos = cur ? items.findIndex((i) => i.id === cur.id) + 1 : 0;
    // Same name + brand as something already listed, or as an earlier product in this upload: it cannot be submitted again.
    const dupMsg = useMemo(() => {
        if (!cur) return null;
        const key = itemKey(cur.data);
        if (!key) return null;
        if (listedKeys.has(key)) return "You already have this product in My products. Change the name or brand, or remove it from this upload.";
        const at = items.findIndex((i) => i.id === cur.id);
        const other = items.findIndex((i, idx) => idx < at && i.status !== "skipped" && itemKey(i.data) === key);
        return other >= 0 ? `Product ${other + 1} in this upload has the same name and brand. Change the name or brand, or remove this one.` : null;
    }, [cur, items, listedKeys]);
    const errors = useMemo(() => {
        if (!cur) return [];
        const list = validateData(cur.data, geo.states.length);
        return dupMsg ? [{ section: "product", field: "n", msg: dupMsg }, ...list] : list;
    }, [cur, geo.states.length, dupMsg]);
    // products that still have something missing (photos aside), shown as a dot on their number
    const flagged = useMemo(
        () => new Set(items.filter((i) => i.status === "pending" && quickIssues(i.data, geo.states.length || 30).length).map((i) => i.id)),
        [items, geo.states.length]
    );

    useEffect(() => { if (view === "review" && !cur) setView(pending.length ? "review" : "done"); }, [view, cur]); // eslint-disable-line
    useEffect(() => { if (view === "review" && !cur && pending.length) setCurId(pending[0].id); }, [view, cur, pending.length]); // eslint-disable-line

    const goTo = async (id) => { await flush(); setShowErr(false); setCurId(id); };
    const skip = async () => {
        await flush();
        const n = nextPending(items, curId);
        if (!n) { setView("done"); return; }
        setShowErr(false); setCurId(n.id);
    };
    const saveExit = async () => { await flush(); nav("/grow/products"); };

    const removeCurrent = async () => {
        if (!cur || busy) return;
        if (!window.confirm("Remove this product from the upload? It won't be submitted.")) return;
        const n = nextPending(items, cur.id);
        dirty.current.delete(cur.id);
        const r = await deleteBulkItem(token, cur.id);
        if (!r?.success) return say(r?.message || "Couldn't remove it. Try again.");
        setItems((l) => l.filter((i) => i.id !== cur.id));
        if (n) { setShowErr(false); setCurId(n.id); } else setView("done");
    };

    const confirm = async () => {
        if (!cur || busy) return;
        const issues = errors;
        if (issues.length) {
            setShowErr(true);
            say(issues[0].msg);
            jumpTo(issues[0]);
            return;
        }
        if (!geo.india) return say("Delivery places are still loading. Try again in a moment.");

        setBusy("submit");
        try {
            const P = cur.data;
            // Authoritative catalogue check right before submitting.
            const mr = await findBrandItemMatch(token, { productName: P.n.trim(), brandName: P.b.trim(), brandNotApplicable: P.nb });
            if (!mr?.success) return say("Couldn't check the catalogue. Please try again.");
            const match = mr.match || null;
            if (match) {
                const applied = applyMatch(P, match);
                if (packagingDiffers(P, applied)) {
                    onEdit(cur.id, applied);
                    setShowErr(true);
                    return say("This product is already on the marketplace, so its packing and GST were applied. Please check minimum order, stock and price again.");
                }
            }

            await flush();
            const payload = buildPayload(P, { india: geo.india, seller, match });
            const res = payload.genericProductBrandId ? await createListingForExistingBrand(token, payload) : await createSellerSubmission(token, payload);

            if (!res?.success) {
                const code = res?.code;
                if (res?.status === 409 || /already listing/i.test(res?.message || "")) {
                    await markBulkItem(token, cur.id, { status: "skipped" });
                    const list = items.map((i) => (i.id === cur.id ? { ...i, status: "skipped" } : i));
                    setItems(list);
                    say("You're already listing this product, so it was skipped.");
                    const n = nextPending(list, cur.id);
                    if (n) { setCurId(n.id); setShowErr(false); } else setView("done");
                    return;
                }
                if (code === "SELLER_NOT_ONBOARDED") return say("Please finish your seller setup first.");
                if (code === "NOT_AUTHENTICATED" || res?.status === 401) return say("Please sign in again to submit.");
                if (code === "SELLER_NOT_APPROVED") return say(res.sellerStatus === "pending_review" ? "Your shop is still under review. We will notify you once it is approved." : "Your shop is not approved yet.");
                return say(res?.message || "Could not submit. Please check the required fields.");
            }

            dirty.current.delete(cur.id);
            markBulkItem(token, cur.id, { status: "submitted", submissionId: res.submission?.id || null });
            const list = items.map((i) => (i.id === cur.id ? { ...i, status: "submitted" } : i));
            setItems(list);
            say(res.message || "Product submitted.");
            const n = nextPending(list, cur.id);
            if (n) { setShowErr(false); setCurId(n.id); } else setView("done");
        } finally { setBusy(""); }
    };

    /* ------------------------ render ------------------------ */
    const results = parsed?.results || [];
    const dupRows = results.filter((r) => r.dup);
    const readyRows = results.filter((r) => r.ok);
    const checkRows = results.filter((r) => !r.ok && !r.dup);
    const keepCount = results.length - dupRows.length;
    const noteRows = results.filter((r) => r.notes.length);
    const hasBar = view === "review";
    const lastPending = pending.length <= 1;

    return (
        <div className="gl gbk">
            <div className="gs">
                <div className={`bk-wrap${hasBar ? " hb" : ""}`}>
                    {view === "load" && <GrowCheckSkeleton />}

                    {view === "auth" && (
                        <section className="scr ctr">
                            <h2>Sign in to upload in bulk</h2>
                            <p className="sub">Bulk upload is available to approved sellers.</p>
                            <Link className="sbtn" to="/grow?start=1">Sign in as a seller</Link>
                        </section>
                    )}

                    {view === "blocked" && (
                        <section className="scr ctr">
                            <h2>Bulk upload isn't available yet</h2>
                            <p className="sub">Finish your seller setup and get your shop approved, then come back. If this keeps happening, check your internet and reload.</p>
                            <Link className="sbtn" to="/grow?start=1">Go to seller setup</Link>
                            <Link className="sbtn gh" to="/grow/products">Back to my products</Link>
                        </section>
                    )}

                    {/* ------------------------------ intro ------------------------------ */}
                    {view === "intro" && (
                        <section className="scr">
                            <p className="kick">Bulk upload</p>
                            <h2>Add many products at once</h2>
                            <p className="sub">Fill one Excel sheet and upload it. Then add photos and finish each product on the website.</p>

                            {pending.length > 0 && (
                                <div className="bk-resume">
                                    <div>
                                        <b>{plural(pending.length, "unfinished product", "unfinished products")}</b>
                                        <small>Saved from {pending[0].file_name || "your earlier upload"}. Pick up where you left off.</small>
                                    </div>
                                    <div className="bk-ra">
                                        <button className="sbtn sm" type="button" onClick={() => { setCurId(pending[0].id); setShowErr(false); setView("review"); }}>Continue</button>
                                        <button className="lnk" type="button" onClick={discardAll}>Discard all</button>
                                    </div>
                                </div>
                            )}

                            <div className="pn bk-step" style={{ marginTop: 18 }}>
                                <span className="bk-n">1</span>
                                <div>
                                    <h3>Download the Excel sheet</h3>
                                    <p>It has dropdowns, simple help on every column, and 3 example rows. Up to {MAX_ROWS} products in one file.</p>
                                    <button className="sbtn gh sm" type="button" onClick={getTemplate} disabled={!!busy}>{busy === "template" ? "Preparing…" : "Download Excel sheet (.xlsx)"}</button>
                                </div>
                            </div>

                            <div className="pn bk-step">
                                <span className="bk-n">2</span>
                                <div>
                                    <h3>Fill in your products</h3>
                                    <p>One product in each row. Use the dropdowns. A <b>grey</b> cell means you can skip it. An <b>orange</b> cell is still needed. You will choose delivery states and cities on the website, not in Excel.</p>
                                </div>
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
                            <Link className="sbtn gh" to="/grow/products" style={{ marginTop: 14 }}>Back to my products</Link>
                        </section>
                    )}

                    {/* ------------------------------ summary ------------------------------ */}
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
                                {!keepCount
                                    ? "Every product in this file is already added, so there is nothing new to continue with."
                                    : checkRows.length
                                        ? "All your new products will continue. You will finish the missing parts on the next screen, one product at a time. The missing parts are marked in red."
                                        : "Everything in your file looks good. Next you will add photos for each product."}
                            </p>

                            {dupRows.length > 0 && (
                                <div className="pn bk-dups" style={{ marginTop: 16 }}>
                                    <h3 className="bk-h3">Left out: already added</h3>
                                    <p className="cap" style={{ marginTop: 0 }}>Same product name and brand. These were not added again. Nothing to do.</p>
                                    <ul>
                                        {dupRows.slice(0, 40).map((r) => (
                                            <li key={r.rowNo}><b>Row {r.rowNo} · {r.data.n}</b><span>{r.dup.msg}</span></li>
                                        ))}
                                    </ul>
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
                                                    <ul>
                                                        {r.fixes.map((e, i) => <li key={`f${i}`}><b>{e.col}:</b> {e.msg}</li>)}
                                                        {r.issues.map((e, i) => <li key={`i${i}`}>{e.msg}</li>)}
                                                    </ul>
                                                </details>
                                            );
                                        })}
                                        {checkRows.length > 40 && <p className="cap">…and {checkRows.length - 40} more products.</p>}
                                    </div>
                                </div>
                            )}

                            {noteRows.length > 0 && (
                                <div className="pn" style={{ marginTop: 12 }}>
                                    <h3 className="bk-h3">Some answers were not needed</h3>
                                    <p className="cap" style={{ marginTop: 0 }}>We ignored these because another answer made them unnecessary. Nothing to do.</p>
                                    <div className="bk-errs">
                                        {noteRows.slice(0, 40).map((r) => (
                                            <details key={r.rowNo}>
                                                <summary>Row {r.rowNo}{r.data.n ? ` · ${r.data.n}` : ""} <em className="mute">{plural(r.notes.length, "answer", "answers")} ignored</em></summary>
                                                <ul>{r.notes.map((e, i) => <li key={i}>{e.msg}</li>)}</ul>
                                            </details>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button className="sbtn" type="button" style={{ marginTop: 18 }} disabled={!keepCount || !!busy} onClick={startReview}>
                                {busy === "save" ? "Saving…" : keepCount ? `Continue with ${plural(keepCount, "product", "products")}` : "Nothing new to add"}
                            </button>
                            <button className="sbtn gh" type="button" disabled={!!busy} onClick={() => { setParsed(null); setView("intro"); }}>Choose a different file</button>
                        </section>
                    )}

                    {/* ------------------------------ review ------------------------------ */}
                    {view === "review" && cur && (
                        <>
                            <section className="scr on">
                                <div className="bk-top">
                                    <p className="kick" style={{ margin: 0 }}>Product {pos} of {items.length} · {submittedCount} submitted</p>
                                    <div className="bk-top-r">
                                        <span className={`bk-save ${saveState}`} aria-live="polite">{saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved, trying again" : "Saved"}</span>
                                        <button className="lnk" type="button" onClick={saveExit}>Save and exit</button>
                                    </div>
                                </div>

                                <div className="bk-chips" role="tablist" aria-label="Products in this upload">
                                    {items.map((it, i) => (
                                        <button key={it.id} type="button" className={`${it.status}${it.id === cur.id ? " cur" : ""}${flagged.has(it.id) ? " flag" : ""}`} aria-current={it.id === cur.id}
                                            disabled={it.status !== "pending" || !!busy} onClick={() => goTo(it.id)}
                                            title={`${it.data?.n || `Product ${i + 1}`}${flagged.has(it.id) ? " (needs something)" : ""}`}>
                                            {it.status === "submitted" ? "✓" : it.status === "skipped" ? "–" : i + 1}
                                        </button>
                                    ))}
                                </div>

                                <div className="pv" aria-live="polite">
                                    <div className="th" style={cur.data.im?.[0] ? { backgroundImage: `url(${cur.data.im[0]})` } : undefined}>{cur.data.im?.[0] ? "" : (cur.data.n.trim()[0] || "+").toUpperCase()}</div>
                                    <div><b>{cur.data.n.trim() || "Your product"}</b><small>{[cur.data.nb ? "No brand" : cur.data.b.trim(), cur.data.price ? `₹${Number(cur.data.price).toLocaleString("en-IN")}` : ""].filter(Boolean).join(" · ") || "Check the details below"}</small></div>
                                </div>

                                {/* live to-do list: updates as the seller types; every line jumps to its field */}
                                <div className={`bk-todo${errors.length ? "" : " ok"}`} role="status" aria-live="polite">
                                    {errors.length ? (<>
                                        <b>{plural(errors.length, "thing", "things")} left to do</b>
                                        <small>Tap a line to go straight to it.</small>
                                        <div className="bk-todo-l">
                                            {errors.map((e, i) => (
                                                <button key={`${e.field}-${i}`} type="button" onClick={() => jumpTo(e)}><i>{i + 1}</i><span>{e.msg}</span></button>
                                            ))}
                                        </div>
                                    </>) : <b>Everything is filled in. Press “{lastPending ? "Confirm and finish" : "Confirm and next"}”.</b>}
                                </div>

                                <BulkItemForm key={cur.id} token={token} P={cur.data} onChange={(d) => onEdit(cur.id, d)} say={say}
                                    geo={{ ...geo, reload: loadGeo }} policy={policy} errors={errors} showErrors={showErr} />

                                <button className="lnk bk-rm" type="button" onClick={removeCurrent} disabled={!!busy}>Remove this product from the upload</button>
                            </section>

                            <div className="bar"><div>
                                <button className="sbtn gh sm" type="button" disabled={!!busy || lastPending} onClick={skip}>Skip for now</button>
                                <button className="sbtn" type="button" disabled={!!busy} onClick={confirm}>
                                    {busy === "submit" ? "Submitting…" : lastPending ? "Confirm and finish" : "Confirm and next"}
                                </button>
                            </div></div>
                        </>
                    )}

                    {/* ------------------------------ done ------------------------------ */}
                    {view === "done" && (
                        <section className="scr ctr">
                            <div className="big" aria-hidden="true">✓</div>
                            <h2>{pending.length ? "Upload paused" : "Bulk upload complete"}</h2>
                            <p className="sub">
                                {plural(submittedCount, "product", "products")} submitted
                                {pending.length ? `, ${pending.length} still waiting. They're saved, so you can finish any time.` : "."}
                            </p>
                            {pending.length > 0 && <button className="sbtn" type="button" onClick={() => { setCurId(pending[0].id); setShowErr(false); setView("review"); }}>Continue with the rest</button>}
                            <Link className="sbtn" to="/grow/products">Go to my products</Link>
                            <button className="sbtn gh" type="button" onClick={() => { setItems((l) => l.filter((i) => i.status === "pending")); setView("intro"); }}>Upload another file</button>
                        </section>
                    )}
                </div>
                <div className={`toast${toast ? " on" : ""}`} role="status">{toast}</div>
            </div>
        </div>
    );
}