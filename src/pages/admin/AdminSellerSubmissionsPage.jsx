// pages/admin/AdminSellerSubmissionsPage.jsx — REALIGNED + INFINITE SCROLL
//
// Rebuilt on the same visual language as SellerListingForm (same C tokens,
// SectionCard, PolicySelect, DispatchingLocationsPicker — reused directly,
// not re-skinned) and the current seller_product_submissions schema, so
// every field a seller actually submits (note to admin, dispatch pincode +
// locations, price basis, GST-inclusive/freight flags, policy keys, etc.)
// is visible and editable here.
//
// "NEEDS MAPPING" TAB: brand-new products submitted by a seller are
// fast-approved server-side, so they never show under "Pending". The
// "Needs mapping" tab (status=unmapped) lets admin find and map them.
//
// BULK MAPPING: search the list, tick many listings (Shift-click for a
// range, or Select all) and map all their catalog items in a single step.
//
// INFINITE SCROLL (this pass):
//  - The header always shows the REAL total for the current tab + search
//    (comes from the server, not from how many rows happen to be loaded).
//  - Only 100 listings are fetched first; the next 100 load automatically
//    as you scroll near the bottom (IntersectionObserver sentinel).
//  - Search is now done by the server (debounced), so it covers every
//    record, not only the ones already loaded.
//  - Background refreshes (realtime event, tab focus, after approve/map)
//    are SILENT: no spinner, no scroll jump, the list just updates in place.
//  - Stale responses are ignored (request sequence), so quickly switching
//    tabs / typing never shows results of an older request.
//  - SELECT ALL covers EVERY matching listing, not just the loaded ones:
//    The single select-all checkbox (and the bottom bar) asks the server for all matching ids, so no scrolling is needed
//    before bulk-mapping. The select row is sticky, so it stays reachable
//    while scrolling. Selection is kept locally (Shift-click range works
//    over the loaded rows) and is cleared whenever the tab / search changes.
//  - Rows are memoised and use content-visibility, so a few hundred cards
//    stay smooth; the per-row framer-motion enter/exit animation was
//    dropped because it was the main source of jank on long lists.
//
// FIX: ViewSubmissionModal / EditSubmissionModal treated the object returned
// by approve() as truthy ("success"), so the modal closed even when approve
// failed. They now check `.success`.
import { useCallback, useEffect, useMemo, useState, useRef, memo } from "react";
import {
    Loader2, CheckCircle2, X, ImageIcon, Pencil, ChevronDown,
    Package, IndianRupee, Boxes, Truck, FileText, ShieldCheck, Plus, Trash2, AlertTriangle,
    Layers, Search,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../utils/supabaseClient.js";
import { useAuth } from "../../context/AuthContext.jsx";
import {
    adminListSellerSubmissions, adminListSellerSubmissionIds, adminApproveSellerSubmission,
    adminRejectSellerSubmission, adminUpdateSellerSubmission, adminGetSellerSubmission,
    adminUpdateCatalogEntry, adminListCatalog, adminCreateCatalogEntry,
} from "../../utils/api.js";
import { lookupPincode } from "../../utils/sellerListingApi.js";
import HierarchyCombobox from "../../components/seller/listingForm/HierarchyCombobox.jsx";
import ImageLightbox from "../../components/ImageLightbox.jsx";
import {
    C, Label, TextField, TextAreaField, SelectField, ToggleField, ChipToggleGroup,
    RepeatableRows, SectionCard,
} from "../../components/seller/listingForm/FormPrimitives.jsx";
import PolicySelect from "../../components/seller/listingForm/PolicySelect.jsx";
import DispatchingLocationsPicker from "../../components/seller/listingForm/DispatchingLocationsPicker.jsx";
import CompleteListingModal from "../../components/admin/CompleteListingModal.jsx";
import BulkMapModal from "../../components/admin/BulkMapModal.jsx";
import { Checkbox, SelectAllRow, SelectionBar, BarButton } from "../../components/admin/bulkSelect.jsx";


const PAGE_SIZE = 100;          // rows fetched per request
const REFRESH_MAX = 300;        // a silent refresh re-fetches what's loaded, up to this many
const fmt = (n) => Number(n || 0).toLocaleString("en-IN");

const STATUS_TABS = [
    { key: "pending_review", label: "Pending" },
    { key: "approved", label: "Approved" },
    // approved-but-unmapped items (fast-approved brand-new products
    // still waiting on a category/subcategory/generic-product mapping).
    { key: "unmapped", label: "Needs mapping" },
    { key: "rejected", label: "Rejected" },
    { key: "all", label: "All" },
];

const UNITS = ["Pieces", "Kg", "Grams", "Litres", "Millilitres", "Dozen", "Tons"];
const GST_OPTIONS = [0, 0.25, 3, 5, 12, 18, 28];
const PRICE_BASIS_OPTIONS = [
    { value: "per_unit", label: "Per unit" },
    { value: "per_pack", label: "Per pack" },
    { value: "per_master_pack", label: "Per master pack" },
];

// ---- dispatching_locations: submission row stores the flattened jsonb
// array shape; DispatchingLocationsPicker works with a nested UI shape.
// Same conversion SellerListingForm does inline on submit — extracted
// here (and duplicated there) since both need it going in different
// directions. Worth hoisting into sellerListingApi.js if a third
// consumer shows up.
function unflattenDispatchingLocations(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const countryEntry = arr.find((e) => e.type === "country");
    if (!countryEntry) return null;
    const country = { name: countryEntry.name, code: countryEntry.code };
    if (countryEntry.includeOnly) {
        const includedStates = [];
        const includedCitiesByState = {};
        arr.filter((e) => e.type === "state").forEach((e) => {
            includedStates.push(e.name);
            if (e.includedCities !== undefined) includedCitiesByState[e.name] = e.includedCities;
        });
        return { country, mode: "include", includedStates, includedCitiesByState, excludedStates: [], citiesByState: {} };
    }
    const excludedStates = countryEntry.excludedStates || [];
    const citiesByState = {};
    arr.filter((e) => e.type === "state").forEach((e) => {
        if (e.excludedCities?.length) citiesByState[e.name] = e.excludedCities;
    });
    return { country, mode: "exclude", excludedStates, citiesByState, includedStates: [], includedCitiesByState: {} };
}

function flattenDispatchingLocations(dl) {
    if (!dl?.country) return [];
    if (dl.mode === "include") {
        return [
            { type: "country", name: dl.country.name, code: dl.country.code, includeOnly: true },
            ...(dl.includedStates || []).map((state) => {
                const cities = dl.includedCitiesByState?.[state];
                return cities !== undefined ? { type: "state", name: state, includedCities: cities } : { type: "state", name: state };
            }),
        ];
    }
    return [
        { type: "country", name: dl.country.name, code: dl.country.code, excludedStates: dl.excludedStates || [] },
        ...Object.entries(dl.citiesByState || {}).filter(([, cities]) => cities?.length).map(([state, cities]) => ({ type: "state", name: state, excludedCities: cities })),
    ];
}

function dispatchingLocationsSummary(arr) {
    const dl = unflattenDispatchingLocations(arr);
    if (!dl?.country) return "Not set";
    if (dl.mode === "include") {
        return dl.includedStates?.length ? `Only ${dl.includedStates.length} state${dl.includedStates.length === 1 ? "" : "s"} in ${dl.country.name}` : "No states selected";
    }
    const n = dl.excludedStates?.length || 0;
    return n === 0 ? `All of ${dl.country.name}` : `${dl.country.name} except ${n} state${n === 1 ? "" : "s"}`;
}

/* ===================== list row (memoised) ===================== */

const SubmissionRow = memo(function SubmissionRow({
    it, isSel, isHighlight, busy,
    registerRef, onToggle, onView, onLightbox, onEdit, onApprove, onReject,
}) {
    return (
        <div
            ref={(el) => registerRef(it.id, el)}
            onClick={() => onView(it.id)}
            role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") onView(it.id); }}
            className="flex cursor-pointer gap-3 rounded-2xl border bg-white p-4 transition-shadow duration-300"
            style={{
                borderColor: isHighlight || isSel ? C.secondary : C.hair,
                background: isSel ? `${C.secondary}08` : "#fff",
                boxShadow: isHighlight ? `0 0 0 3px ${C.secondary}2e` : undefined,
                // skip layout/paint work for rows that are off-screen
                contentVisibility: "auto",
                containIntrinsicSize: "auto 120px",
            }}
        >
            <div className="pt-0.5">
                <Checkbox checked={isSel} onChange={(e) => onToggle(it.id, e)} accent={C.secondary} label={`Select ${it.product_name || "listing"}`} />
            </div>
            <button onClick={(e) => { e.stopPropagation(); onLightbox(it); }}
                className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl" style={{ background: C.hairSoft }}
                aria-label="View image">
                {it.image ? <img src={it.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <ImageIcon className="m-auto h-6 w-6" style={{ color: C.hair }} />}
                {it.images?.length > 1 && (
                    <span className="absolute bottom-0.5 right-0.5 rounded-full bg-black/60 px-1 text-[8.5px] font-bold text-white">+{it.images.length - 1}</span>
                )}
            </button>
            <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold" style={{ color: C.ink }}>{it.product_name}</p>
                <p className="text-[12px] font-semibold" style={{ color: C.muted }}>
                    {it.brand_name || "No brand"} · {it.generic_product?.subcategory?.category?.name || "Not mapped"} / {it.generic_product?.subcategory?.name || "—"} / {it.generic_product?.name || "—"}
                </p>
                <p className="mt-1 text-[12.5px] font-medium" style={{ color: C.ink }}>
                    ₹{it.price} · MOQ {it.moq} {it.unit} · {it.stock_type === "made_to_order" ? `Lead time ${it.lead_time}d` : "Ready stock"}
                </p>
                <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>
                    Seller: {it.seller?.display_name || "—"}
                    {it.hsn_code && <span> · HSN {it.hsn_code}</span>}
                    {it.note_to_admin && <span className="ml-1.5 font-bold" style={{ color: C.secondary }}>· Has a note to admin</span>}
                    {it.is_active === false && <span className="ml-1.5 font-bold" style={{ color: "#a16207" }}>· Hidden by seller</span>}
                    {/* surfaces regardless of which tab is active: an already-
                        approved (live) item that still has no category mapping. */}
                    {it.review_status === "approved" && !it.generic_product && (
                        <span className="ml-1.5 font-bold" style={{ color: "#a16207" }}>· Needs category mapping</span>
                    )}
                </p>
                {it.rejection_reason && <p className="mt-1 text-[11.5px] font-semibold" style={{ color: C.danger }}>Rejected: {it.rejection_reason}</p>}
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
                <button onClick={(e) => { e.stopPropagation(); onEdit(it.id); }}
                    className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[12px] font-bold" style={{ borderColor: C.hair, color: C.muted }}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                {it.review_status === "pending_review" && (
                    <>
                        <button onClick={(e) => { e.stopPropagation(); onApprove(it.id); }} disabled={busy}
                            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: C.secondary }}>
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Approve
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onReject(it.id); }}
                            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[12px] font-bold" style={{ borderColor: `${C.danger}40`, color: C.danger }}>
                            <X className="h-3.5 w-3.5" /> Reject
                        </button>
                    </>
                )}
            </div>
        </div>
    );
});

export default function AdminSellerSubmissionsPage() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [status, setStatus] = useState(() => (searchParams.get("highlight") ? "all" : "pending_review"));
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);           // real total for current tab + search (from server)
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);    // first page / filter change
    const [loadingMore, setLoadingMore] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [loadMoreError, setLoadMoreError] = useState("");
    const [busyId, setBusyId] = useState(null);
    const [rejecting, setRejecting] = useState(null);
    const [reason, setReason] = useState("");
    const [lightbox, setLightbox] = useState(null);
    const [editing, setEditing] = useState(null);
    const [viewing, setViewing] = useState(null);
    const [highlightId, setHighlightId] = useState(null);
    const itemRefs = useRef(new Map());
    const [completing, setCompleting] = useState(null);

    // search + bulk selection / mapping
    const [query, setQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [mapping, setMapping] = useState(false);
    const [notice, setNotice] = useState(null);

    // request bookkeeping
    const reqSeq = useRef(0);               // bumped by every first-page/refresh fetch; stale responses are dropped
    const offsetRef = useRef(0);            // how many rows the server has already handed us
    const itemsRef = useRef([]);
    const hasMoreRef = useRef(false);
    const loadingMoreRef = useRef(false);
    const sentinelRef = useRef(null);
    const lastRefreshRef = useRef(0);
    const refreshTimerRef = useRef(null);
    itemsRef.current = items;
    hasMoreRef.current = hasMore;

    const visible = items; // search is server-side now, so what's loaded is what's shown
    const unmappedIds = useMemo(() => visible.filter((i) => !i.generic_product).map((i) => i.id), [visible]);

    // ---- selection (local, so it can cover rows that aren't loaded yet)
    const [selected, setSelected] = useState(() => new Set());
    const [selectingAll, setSelectingAll] = useState(false);
    const selectedRef = useRef(selected);
    selectedRef.current = selected;
    const extraItemsRef = useRef(new Map());   // lightweight items fetched by "select all matching"
    const lastClickedRef = useRef(null);
    const visibleIdsRef = useRef([]);
    visibleIdsRef.current = visible.map((i) => i.id);
    const filterKeyRef = useRef("");
    filterKeyRef.current = `${status}|${debouncedQuery}`;

    const clearSelection = useCallback(() => {
        setSelected(new Set());
        extraItemsRef.current = new Map();
        lastClickedRef.current = null;
    }, []);

    const loadedAllSelected = visible.length > 0 && visible.every((i) => selected.has(i.id));
    const allMatchingSelected = total > 0 && selected.size >= total;
    const allSelected = allMatchingSelected || (!hasMore && loadedAllSelected);

    function selectLoaded() {
        setSelected((prev) => { const next = new Set(prev); visible.forEach((i) => next.add(i.id)); return next; });
    }

    async function selectAllMatching() {
        if (selectingAll) return;
        const key = filterKeyRef.current;
        setSelectingAll(true);
        let res;
        try { res = await adminListSellerSubmissionIds(token, status, debouncedQuery); }
        catch { res = { success: false, message: "Network error. Please try again." }; }
        setSelectingAll(false);
        if (key !== filterKeyRef.current) return; // tab / search changed meanwhile
        if (!res?.success) { setNotice({ ok: false, text: res?.message || "Couldn't select all listings." }); return; }
        const list = res.items || [];
        extraItemsRef.current = new Map(list.map((i) => [i.id, i]));
        setSelected(new Set(list.map((i) => i.id)));
        if (res.truncated) {
            setNotice({ ok: false, text: `Selected the first ${fmt(list.length)} of ${fmt(res.total)} listings (per-run limit). Map these, then select the rest.` });
        }
    }

    // loaded items win over the lightweight ones from "select all matching"
    const selectedItems = useMemo(() => {
        const byId = new Map(items.map((i) => [i.id, i]));
        const out = [];
        selected.forEach((id) => { const it = byId.get(id) || extraItemsRef.current.get(id); if (it) out.push(it); });
        return out;
    }, [selected, items]);

    // ---- debounce the search box so we don't hit the server on every keystroke
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
        return () => clearTimeout(t);
    }, [query]);

    // ---- first page (or silent refresh of what's already loaded)
    const fetchFirst = useCallback(async ({ silent = false } = {}) => {
        if (!token) return;
        const my = ++reqSeq.current;
        if (!silent) { setLoading(true); setLoadError(""); setLoadMoreError(""); clearSelection(); }
        const limit = silent ? Math.min(Math.max(itemsRef.current.length, PAGE_SIZE), REFRESH_MAX) : PAGE_SIZE;
        try {
            const res = await adminListSellerSubmissions(token, status, debouncedQuery, { limit, offset: 0 });
            if (my !== reqSeq.current) return; // a newer request superseded this one
            if (res?.success) {
                const list = res.items || [];
                offsetRef.current = list.length;
                setItems(list);
                setTotal(res.total ?? list.length);
                setHasMore(!!res.hasMore);
                setLoadError("");
            } else if (!silent) {
                setLoadError(res?.message || "Couldn't load listings.");
            }
        } catch {
            if (my === reqSeq.current && !silent) setLoadError("Network error. Check your connection and try again.");
        } finally {
            if (my === reqSeq.current && !silent) setLoading(false);
        }
    }, [token, status, debouncedQuery, clearSelection]);

    // ---- next page (called by the scroll sentinel)
    const loadMore = useCallback(async () => {
        if (!token || loadingMoreRef.current || !hasMoreRef.current) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
        setLoadMoreError("");
        const my = reqSeq.current;
        try {
            const res = await adminListSellerSubmissions(token, status, debouncedQuery, { limit: PAGE_SIZE, offset: offsetRef.current });
            if (my !== reqSeq.current) return;
            if (res?.success) {
                const list = res.items || [];
                offsetRef.current += list.length;
                setItems((prev) => {
                    const seen = new Set(prev.map((i) => i.id));
                    return [...prev, ...list.filter((i) => !seen.has(i.id))];
                });
                setTotal(res.total ?? offsetRef.current);
                setHasMore(!!res.hasMore && list.length > 0);
            } else {
                setLoadMoreError(res?.message || "Couldn't load more listings.");
            }
        } catch {
            if (my === reqSeq.current) setLoadMoreError("Network error while loading more.");
        } finally {
            loadingMoreRef.current = false;
            setLoadingMore(false);
        }
    }, [token, status, debouncedQuery]);

    const loadMoreRef = useRef(loadMore);
    loadMoreRef.current = loadMore;
    const fetchFirstRef = useRef(fetchFirst);
    fetchFirstRef.current = fetchFirst;

    // reload whenever the tab, the (debounced) search, or the token changes
    useEffect(() => { fetchFirst(); }, [fetchFirst]);

    // silent, throttled refresh helpers
    const refreshSilently = useCallback(() => {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => {
            lastRefreshRef.current = Date.now();
            fetchFirstRef.current({ silent: true });
        }, 500);
    }, []);
    useEffect(() => () => clearTimeout(refreshTimerRef.current), []);

    // ---- infinite scroll: load the next page when the sentinel nears the viewport
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || !hasMore || loading || loadMoreError) return undefined;
        const io = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting) loadMoreRef.current();
        }, { rootMargin: "700px 0px" });
        io.observe(el);
        return () => io.disconnect();
        // items.length: re-observe after each page so a still-visible sentinel keeps loading
    }, [hasMore, loading, loadMoreError, items.length]);

    useEffect(() => {
        const id = searchParams.get("highlight");
        if (id) { setHighlightId(id); setStatus("all"); }
    }, [searchParams]);

    // refresh when the tab regains focus (throttled, silent — no spinner / scroll jump)
    useEffect(() => {
        function onVisible() {
            if (document.visibilityState !== "visible") return;
            if (Date.now() - lastRefreshRef.current < 5000) return;
            lastRefreshRef.current = Date.now();
            fetchFirstRef.current({ silent: true });
        }
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", onVisible);
        return () => {
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("focus", onVisible);
        };
    }, []);

    // realtime: something changed somewhere — update in place
    useEffect(() => {
        if (!token) return undefined;
        const channel = supabase
            .channel("admin-submissions")
            .on("broadcast", { event: "submissions_changed" }, () => refreshSilently())
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [token, refreshSilently]);

    // scroll to (and flash) a highlighted row; keeps loading pages until it's found
    useEffect(() => {
        if (!highlightId) return undefined;
        let cancelled = false;
        let attempts = 0;
        function tryScroll() {
            if (cancelled) return;
            const el = itemRefs.current.get(highlightId);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                setTimeout(() => {
                    if (cancelled) return;
                    setHighlightId(null);
                    const next = new URLSearchParams(searchParams);
                    next.delete("highlight");
                    setSearchParams(next, { replace: true });
                }, 2500);
                return;
            }
            if (hasMoreRef.current && !loadingMoreRef.current) loadMoreRef.current();
            attempts += 1;
            if (attempts < 150) setTimeout(tryScroll, 100);
        }
        tryScroll();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [highlightId]);

    // Returns the full API result (not just a boolean) so callers can tell
    // WHY an approve was blocked.
    const approve = useCallback(async (id) => {
        setBusyId(id);
        const res = await adminApproveSellerSubmission(token, id);
        setBusyId(null);
        if (res?.success) { fetchFirstRef.current({ silent: true }); return res; }
        if (res?.code === "NOT_MAPPED") {
            const it = itemsRef.current.find((i) => i.id === id);
            setCompleting({
                id,
                brandItemId: it?.brand?.id,
                productName: it?.product_name || it?.brand?.name || "Listing",
                suggestedManufacturer: it?.suggested_manufacturer || null,
            });
            return res;
        }
        window.alert(res?.message || "Couldn't approve this listing.");
        return res || { success: false };
    }, [token]);

    async function submitReject() {
        if (!reason.trim()) return;
        setBusyId(rejecting);
        const res = await adminRejectSellerSubmission(token, rejecting, reason.trim());
        setBusyId(null);
        if (res?.success) { setRejecting(null); setReason(""); fetchFirst({ silent: true }); }
        else window.alert(res?.message || "Couldn't reject this listing.");
    }

    // stable handlers for the memoised rows
    const registerRef = useCallback((id, el) => { if (el) itemRefs.current.set(id, el); }, []);
    const onToggle = useCallback((id, e) => {
        const prev = selectedRef.current;
        const next = new Set(prev);
        const turnOn = !prev.has(id);
        const ids = visibleIdsRef.current;
        const last = lastClickedRef.current;
        const a = e?.shiftKey && last && last !== id ? ids.indexOf(last) : -1;
        const b = a !== -1 ? ids.indexOf(id) : -1;
        if (a !== -1 && b !== -1) {
            const [lo, hi] = a < b ? [a, b] : [b, a];
            for (let i = lo; i <= hi; i++) { if (turnOn) next.add(ids[i]); else next.delete(ids[i]); }
        } else if (turnOn) next.add(id); else next.delete(id);
        lastClickedRef.current = id;
        setSelected(next);
    }, []);
    const onView = useCallback((id) => setViewing(id), []);
    const onEdit = useCallback((id) => setEditing(id), []);
    const onReject = useCallback((id) => { setRejecting(id); setReason(""); }, []);
    const onLightbox = useCallback((it) => {
        const gallery = it.images?.length ? it.images : (it.image ? [it.image] : []);
        if (!gallery.length) return;
        setLightbox({ images: gallery });
    }, []);

    function onMapped(r) {
        setMapping(false);
        clearSelection();
        setNotice({ ok: !r.failed, text: r.message });
        fetchFirst({ silent: true });
    }

    const tabLabel = STATUS_TABS.find((t) => t.key === status)?.label || "";

    return (
        <div className="mx-auto min-h-screen max-w-4xl px-4 pb-24 pt-6 sm:px-6" style={{ background: "#FFFFFF" }}>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-[20px] font-extrabold sm:text-[22px]" style={{ color: C.ink }}>Product Review Requests</h1>
                    <p className="text-[12.5px] font-medium" style={{ color: C.muted }}>Approve or reject what sellers have submitted</p>
                </div>
            </div>

            <div className="mt-5 flex gap-1.5 overflow-x-auto pb-1">
                {STATUS_TABS.map((t) => (
                    <button key={t.key} onClick={() => setStatus(t.key)}
                        className="shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors"
                        style={{ background: status === t.key ? C.secondary : C.hairSoft, color: status === t.key ? "#fff" : C.muted }}>
                        {t.label}
                    </button>
                ))}
            </div>

            {notice && (
                <div role="status" className="mt-3 flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px] font-semibold"
                    style={{ background: notice.ok ? "#dcfce7" : "#fef3c7", color: notice.ok ? "#15803d" : "#a16207" }}>
                    {notice.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                    <span className="min-w-0 flex-1">{notice.text}</span>
                    <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0"><X className="h-4 w-4" /></button>
                </div>
            )}

            <label className="mt-3 flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5" style={{ borderColor: C.hair }}>
                <Search className="h-4 w-4 shrink-0" style={{ color: C.muted }} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by product, brand, seller or category" aria-label="Search listings"
                    className="w-full text-[13px] font-medium outline-none" style={{ color: C.ink }} />
                {query && <button type="button" onClick={() => { setQuery(""); setDebouncedQuery(""); }} aria-label="Clear search"><X className="h-4 w-4" style={{ color: C.muted }} /></button>}
            </label>

            {!loading && visible.length > 0 && (
                <div className="sticky top-0 z-20 -mx-1 mt-2 bg-white px-1 pb-1 pt-1">
                    <div className="rounded-xl border bg-white px-2.5 py-1.5 shadow-sm" style={{ borderColor: C.hair }}>
                        <SelectAllRow accent={C.secondary} checked={allSelected} indeterminate={selected.size > 0 && !allSelected}
                            count={selected.size} total={total} noun="listings"
                            onChange={() => {
                                if (selectingAll) return;
                                if (allSelected || selected.size > 0 && !hasMore && loadedAllSelected) clearSelection();
                                else if (!hasMore) selectLoaded();   // everything is already loaded, no need to ask the server
                                else selectAllMatching();
                            }}>
                            {selectingAll && (
                                <span className="inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: C.muted }}>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Selecting all {fmt(total)}…
                                </span>
                            )}
                            {!allSelected && unmappedIds.length > 0 && unmappedIds.length < visible.length && (
                                <button type="button" onClick={() => setSelected(new Set(unmappedIds))} className="text-[12px] font-bold underline underline-offset-2" style={{ color: C.secondary }}>
                                    Select only unmapped ({unmappedIds.length})
                                </button>
                            )}
                            <span className="text-[11.5px] font-medium" style={{ color: C.muted }}>Hold Shift to select a range.</span>
                        </SelectAllRow>
                    </div>
                </div>
            )}

            <div className="mt-3 flex flex-col gap-3">
                {loading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl" style={{ background: C.hairSoft }} />)}

                {!loading && loadError && (
                    <div className="flex flex-col items-center gap-3 py-14 text-center">
                        <p className="text-[13px] font-semibold" style={{ color: C.danger }}>{loadError}</p>
                        <button onClick={() => fetchFirst()} className="rounded-lg border px-4 py-2 text-[12.5px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>Try again</button>
                    </div>
                )}

                {!loading && !loadError && visible.length === 0 && (
                    <p className="py-14 text-center text-[13px] font-medium" style={{ color: C.muted }}>{debouncedQuery ? "No listings match your search." : "Nothing here."}</p>
                )}

                {!loading && visible.map((it) => (
                    <SubmissionRow
                        key={it.id}
                        it={it}
                        isSel={selected.has(it.id)}
                        isHighlight={highlightId === it.id}
                        busy={busyId === it.id}
                        registerRef={registerRef}
                        onToggle={onToggle}
                        onView={onView}
                        onLightbox={onLightbox}
                        onEdit={onEdit}
                        onApprove={approve}
                        onReject={onReject}
                    />
                ))}

                {/* infinite-scroll footer */}
                {!loading && visible.length > 0 && (
                    <div className="flex flex-col items-center gap-2 py-4">
                        {hasMore && !loadMoreError && <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />}
                        {loadingMore && (
                            <p className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: C.muted }}>
                                <Loader2 className="h-4 w-4 animate-spin" /> Loading more…
                            </p>
                        )}
                        {loadMoreError && (
                            <div className="flex flex-col items-center gap-2">
                                <p className="text-[12px] font-semibold" style={{ color: C.danger }}>{loadMoreError}</p>
                                <button onClick={() => { setLoadMoreError(""); loadMore(); }} className="rounded-lg border px-4 py-1.5 text-[12px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>Retry</button>
                            </div>
                        )}
                        {!hasMore && !loadingMore && !loadMoreError && (
                            <p className="text-[11.5px] font-medium tabular-nums" style={{ color: C.muted }}>
                                {fmt(total)} {total === 1 ? "listing" : "listings"} · you've reached the end
                            </p>
                        )}
                    </div>
                )}
            </div>

            <SelectionBar count={selected.size} total={total} noun="listings" onSelectAll={selectAllMatching} onClear={clearSelection}>
                <BarButton icon={Layers} onClick={() => setMapping(true)}>Map category</BarButton>
            </SelectionBar>

            {mapping && selectedItems.length > 0 && (
                <BulkMapModal token={token} items={selectedItems} onClose={() => setMapping(false)} onDone={onMapped} />
            )}

            {rejecting && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 px-4 sm:items-center" onClick={() => setRejecting(null)}>
                    <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl">
                        <h3 className="text-[15px] font-bold" style={{ color: C.ink }}>Reject this listing</h3>
                        <p className="mt-1 text-[12.5px]" style={{ color: C.muted }}>The seller will be notified with this reason.</p>
                        <textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason…"
                            className="mt-3 w-full rounded-lg border px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2" style={{ borderColor: C.hair }} />
                        <div className="mt-3 flex justify-end gap-2">
                            <button onClick={() => setRejecting(null)} className="rounded-lg px-3 py-1.5 text-[13px] font-bold" style={{ color: C.muted }}>Cancel</button>
                            <button onClick={submitReject} disabled={!reason.trim() || busyId === rejecting} className="rounded-lg px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.danger }}>Reject</button>
                        </div>
                    </div>
                </div>
            )}

            {lightbox && <ImageLightbox images={lightbox.images} alt="" onClose={() => setLightbox(null)} />}

            {editing && (
                <EditSubmissionModal
                    token={token} submissionId={editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); fetchFirst({ silent: true }); }}
                    onApprove={approve}
                />
            )}

            {viewing && (
                <ViewSubmissionModal
                    token={token} submissionId={viewing}
                    onClose={() => setViewing(null)}
                    onEdit={() => { const id = viewing; setViewing(null); setEditing(id); }}
                    onImageClick={(images) => setLightbox({ images })}
                    onApprove={approve}
                />
            )}
            {completing && (
                <CompleteListingModal
                    token={token}
                    submissionId={completing.id}
                    brandItemId={completing.brandItemId}
                    productName={completing.productName}
                    suggestedManufacturer={completing.suggestedManufacturer}
                    onClose={() => setCompleting(null)}
                    onApproved={approve}
                />
            )}
        </div>
    );
}

/* ===================== shared read-only bits ===================== */

function ReadRow({ label, value }) {
    if (value === "" || value === null || value === undefined) return null;
    return (
        <div className="flex items-baseline justify-between gap-3 py-1 text-[12px]">
            <span className="shrink-0 font-semibold" style={{ color: C.muted }}>{label}</span>
            <span className="text-right font-bold" style={{ color: C.ink }}>{String(value)}</span>
        </div>
    );
}
function ReadRowsList({ rows, columns }) {
    if (!rows?.length) return null;
    return (
        <div className="mt-1 flex flex-col gap-1">
            {rows.map((row, i) => (
                <div key={i} className="rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold" style={{ background: C.hairSoft, color: C.ink }}>
                    {columns.map((c) => row[c.key]).filter(Boolean).join(" — ")}
                </div>
            ))}
        </div>
    );
}
function SectionBlock({ icon: Icon, title, children }) {
    return (
        <div className="border-t pt-3 first:border-t-0 first:pt-0" style={{ borderColor: C.hairSoft }}>
            <div className="mb-1.5 flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" style={{ color: C.secondary }} />
                <span className="text-[11.5px] font-extrabold uppercase tracking-wide" style={{ color: C.muted }}>{title}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4">{children}</div>
        </div>
    );
}

/* ===================== hierarchy mapping (shared) ===================== */

function FixMappingPicker({ token, brandItemId, current, onDone, onCancel }) {
    const [categoryEntry, setCategoryEntry] = useState(null);
    const [subcategoryEntry, setSubcategoryEntry] = useState(null);
    const [genericProductEntry, setGenericProductEntry] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    async function save() {
        if (!genericProductEntry) return setError("Pick or create a generic product to map this item under.");
        setSaving(true); setError("");
        const res = await adminUpdateCatalogEntry(token, "brand_item", brandItemId, { parentId: genericProductEntry.id });
        setSaving(false);
        if (!res?.success) return setError(res?.message || "Couldn't update the mapping.");
        onDone();
    }

    return (
        <div className="mt-2 flex flex-col gap-2 rounded-xl border p-3" style={{ borderColor: `${C.secondary}33`, background: `${C.secondary}0a` }}>
            <p className="text-[11px] font-semibold break-words" style={{ color: C.muted }}>
                Currently under: <span className="font-bold" style={{ color: C.ink }}>{current || "—"}</span>
            </p>
            <div className="grid grid-cols-1 gap-2">
                <HierarchyCombobox
                    label="Category" required value={categoryEntry}
                    fetcher={(q) => adminListCatalog(token, { level: "category", q })}
                    onCreate={(name) => adminCreateCatalogEntry(token, "category", { name })}
                    onSelect={(entry) => { setCategoryEntry(entry); setSubcategoryEntry(null); setGenericProductEntry(null); }}
                    placeholder="Search or create a category…"
                />
                {categoryEntry && (
                    <HierarchyCombobox
                        label="Subcategory" required value={subcategoryEntry}
                        fetcher={(q) => adminListCatalog(token, { level: "subcategory", parentId: categoryEntry.id, q })}
                        onCreate={(name) => adminCreateCatalogEntry(token, "subcategory", { name, parentId: categoryEntry.id })}
                        onSelect={(entry) => { setSubcategoryEntry(entry); setGenericProductEntry(null); }}
                        placeholder="Search or create a subcategory…"
                    />
                )}
                {subcategoryEntry && (
                    <HierarchyCombobox
                        label="Generic product" required value={genericProductEntry}
                        fetcher={(q) => adminListCatalog(token, { level: "generic_product", parentId: subcategoryEntry.id, q })}
                        onCreate={(name) => adminCreateCatalogEntry(token, "generic_product", { name, parentId: subcategoryEntry.id })}
                        onSelect={setGenericProductEntry}
                        placeholder="Search or create a generic product…"
                    />
                )}
            </div>
            {error && <p className="text-[11.5px] font-semibold" style={{ color: C.danger }}>{error}</p>}
            <div className="flex justify-end gap-2">
                <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-[12px] font-bold" style={{ color: C.muted }}>Cancel</button>
                <button onClick={save} disabled={saving || !genericProductEntry} className="rounded-lg px-3.5 py-1.5 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: C.secondary }}>
                    {saving ? "Saving…" : "Save mapping"}
                </button>
            </div>
        </div>
    );
}

/* ===================== view modal ===================== */

function ViewSubmissionModal({ token, submissionId, onClose, onEdit, onImageClick, onApprove }) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [fixingMapping, setFixingMapping] = useState(false);
    const [approving, setApproving] = useState(false);

    function reload() {
        setLoading(true);
        adminGetSellerSubmission(token, submissionId).then((res) => {
            if (res?.success) setData(res.submission); else setError(res?.message || "Couldn't load this listing.");
            setLoading(false);
        });
    }
    useEffect(() => { reload(); /* eslint-disable-next-line */ }, [token, submissionId]);

    async function handleApprove() {
        setApproving(true);
        const result = await onApprove(submissionId);
        setApproving(false);
        if (result?.success) onClose(); // only close on success — a failed approve should stay visible with its error
        else reload();
    }

    const s = data;
    const images = s?.images?.length ? s.images : (s?.image ? [s.image] : []);
    const gp = s?.generic_product;
    const crumb = [gp?.subcategory?.category?.name, gp?.subcategory?.name, gp?.name].filter(Boolean).join(" › ");

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white" style={{ height: "88vh" }}>
                <div className="flex shrink-0 items-center justify-between border-b px-5 py-3.5" style={{ borderColor: C.hairSoft }}>
                    <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-extrabold" style={{ color: C.ink }}>{s?.product_name || "Listing details"}</h3>
                        {s?.brand_name && <p className="text-[11.5px] font-semibold" style={{ color: C.muted }}>{s.brand_name}</p>}
                    </div>
                    <button onClick={onClose} className="shrink-0 rounded-full p-1.5" style={{ color: C.muted }}><X className="h-4 w-4" /></button>
                </div>

                {loading && <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: C.muted }} /></div>}
                {!loading && error && <p className="flex-1 px-5 py-8 text-center text-[13px] font-semibold" style={{ color: C.danger }}>{error}</p>}

                {!loading && s && (
                    <div className="flex-1 overflow-y-auto px-5 py-3.5" style={{ minHeight: 0 }}>
                        <div className="flex flex-wrap items-center gap-1.5 pb-3">
                            <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                                style={{
                                    background: s.review_status === "approved" ? "#dcfce7" : s.review_status === "rejected" ? "#fee2e2" : "#fef3c7",
                                    color: s.review_status === "approved" ? "#15803d" : s.review_status === "rejected" ? "#b91c1c" : "#a16207",
                                }}>
                                {s.review_status === "approved" ? "Approved" : s.review_status === "rejected" ? "Rejected" : "Pending review"}
                            </span>
                            {s.review_status === "approved" && !gp && (
                                <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: "#fef3c7", color: "#a16207" }}>Needs category mapping</span>
                            )}
                            {s.is_active === false && <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: C.hairSoft, color: C.muted }}>Hidden by seller</span>}
                            <span className="text-[11px] font-medium" style={{ color: C.muted }}>Seller: {s.seller?.display_name || "—"}</span>
                        </div>
                        {s.rejection_reason && (
                            <p className="mb-3 rounded-lg px-3 py-2 text-[11.5px] font-semibold" style={{ background: "#fee2e2", color: C.danger }}>Rejected: {s.rejection_reason}</p>
                        )}
                        {s.note_to_admin && (
                            <div className="mb-3 rounded-lg px-3 py-2.5" style={{ background: `${C.secondary}0c` }}>
                                <p className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: C.secondary }}>Note to admin</p>
                                <p className="mt-0.5 text-[12.5px] font-medium" style={{ color: C.ink }}>{s.note_to_admin}</p>
                            </div>
                        )}

                        <div className="mb-3 flex items-start justify-between gap-2 rounded-lg px-3 py-2" style={{ background: C.hairSoft }}>
                            <div className="min-w-0">
                                <p className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>Catalog mapping</p>
                                <p className="text-[12px] font-bold break-words" style={{ color: C.ink }}>{crumb || "Not mapped to a catalog hierarchy"}</p>
                            </div>
                            <button onClick={() => setFixingMapping((v) => !v)} className="shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>
                                {fixingMapping ? "Cancel" : "Fix mapping"}
                            </button>
                        </div>
                        {fixingMapping && (
                            <FixMappingPicker token={token} brandItemId={s.brand?.id || s.generic_product_brand_id} current={crumb}
                                onCancel={() => setFixingMapping(false)} onDone={() => { setFixingMapping(false); reload(); }} />
                        )}

                        <div className="flex flex-col gap-1 pt-1">
                            <SectionBlock icon={Package} title="Product">
                                <ReadRow label="Manufacturer" value={s.manufacturer} />
                                <ReadRow label="Model / Part No." value={s.model_no} />
                                <ReadRow label="Grade / Variant" value={s.grade_variant} />
                            </SectionBlock>
                            {(s.specifications?.length > 0 || s.description || images.length > 0) && (
                                <div className="-mt-1">
                                    {s.description && <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>{s.description}</p>}
                                    {s.specifications?.length > 0 && <ReadRowsList rows={s.specifications} columns={[{ key: "key" }, { key: "value" }]} />}
                                    {images.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {images.map((src, i) => (
                                                <button key={src + i} onClick={() => onImageClick(images)} className="relative h-14 w-14">
                                                    <img src={src} alt="" className="h-full w-full rounded-md border object-cover" style={{ borderColor: C.hair }} />
                                                    {i === 0 && <span className="absolute bottom-0 left-0 right-0 rounded-b-md bg-black/60 py-0.5 text-center text-[7.5px] font-bold text-white">Cover</span>}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <SectionBlock icon={IndianRupee} title="Pricing">
                                <ReadRow label="Base price (ex GST)" value={s.base_price != null ? `₹${s.base_price}` : null} />
                                <ReadRow label="GST %" value={s.gst_percent != null ? `${s.gst_percent}%` : null} />
                                <ReadRow label="Final price" value={s.price != null ? `₹${s.price}` : null} />
                                <ReadRow label="Price basis" value={PRICE_BASIS_OPTIONS.find((o) => o.value === s.price_basis)?.label} />
                                <ReadRow label="GST inclusive?" value={s.gst_inclusive_input ? "Yes" : "No"} />
                                <ReadRow label="Freight included?" value={s.freight_included ? "Yes" : "No"} />
                            </SectionBlock>

                            <SectionBlock icon={Boxes} title="Quantity & samples">
                                <ReadRow label="MOQ" value={s.moq != null ? `${s.moq} ${s.unit || ""}` : null} />
                                <ReadRow label="Sample" value={s.sample_available ? `${s.sample_quantity ?? "—"} (${s.sample_unit_basis || "—"})` : "Not available"} />
                            </SectionBlock>
                            {s.quantity_discounts?.length > 0 && (
                                <div className="-mt-1">
                                    <ReadRowsList rows={s.quantity_discounts} columns={[{ key: "minQty" }, { key: "discountPercent" }]} />
                                </div>
                            )}

                            <SectionBlock icon={Boxes} title="Packaging & availability">
                                <ReadRow label="Pack size" value={s.pack_size} />
                                <ReadRow label="Units/master pack" value={s.units_per_master_pack} />
                                <ReadRow label="Stock" value={s.stock_quantity} />
                                <ReadRow label="Fulfilment" value={s.stock_type === "made_to_order" ? "Made-to-order" : "Ready stock"} />
                                <ReadRow label="Production lead" value={s.production_lead_time_days != null ? `${s.production_lead_time_days}d` : null} />
                            </SectionBlock>

                            <SectionBlock icon={Truck} title="Delivery">
                                <ReadRow label="Dispatch pincode" value={s.dispatch_pincode} />
                                <ReadRow label="Dispatch district" value={s.dispatch_district} />
                                <ReadRow label="Dispatch state" value={s.dispatch_state} />
                                <ReadRow label="Locations" value={dispatchingLocationsSummary(s.dispatching_locations)} />
                            </SectionBlock>

                            <SectionBlock icon={FileText} title="Tax & terms">
                                <ReadRow label="HSN Code" value={s.hsn_code} />
                            </SectionBlock>
                            <ReadRow label="Return / replacement policy" value={s.return_policy} />
                            <ReadRow label="Warranty" value={s.warranty} />

                            {s.quality_certificates?.length > 0 && (
                                <SectionBlock icon={ShieldCheck} title="Quality & certifications">
                                    <div className="col-span-2 flex flex-col gap-1.5">
                                        <ReadRowsList rows={s.quality_certificates} columns={[{ key: "name" }, { key: "url" }]} />
                                    </div>
                                </SectionBlock>
                            )}
                        </div>
                    </div>
                )}

                {!loading && s && (
                    <div className="flex shrink-0 items-center justify-end gap-2 border-t px-5 py-3" style={{ borderColor: C.hairSoft }}>
                        <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-[12.5px] font-bold" style={{ color: C.muted }}>Close</button>
                        <button onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-[12.5px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>
                            <Pencil className="h-3.5 w-3.5" /> Edit this listing
                        </button>
                        {s.review_status === "pending_review" && (
                            <button onClick={handleApprove} disabled={approving}
                                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: C.secondary }}>
                                {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Approve
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ===================== edit modal ===================== */

function computeAdminMissing(form, images) {
    const missing = [];
    if (!form.productName?.trim()) missing.push("Product name");
    if (!form.brandNotApplicable && !form.brandName?.trim()) missing.push("Brand");
    if (!images.length) missing.push("At least one image");
    if (!form.unit) missing.push("Unit");
    if (!(Number(form.basePrice) > 0)) missing.push("Base price");
    if (!(Number(form.moq) > 0)) missing.push("MOQ");
    return missing;
}

function EditSubmissionModal({ token, submissionId, onClose, onSaved, onApprove }) {
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState(null);
    const [images, setImages] = useState([]);
    const [dispatchingLocations, setDispatchingLocations] = useState(null);
    const [saving, setSaving] = useState(false);
    const [approving, setApproving] = useState(false);
    const [error, setError] = useState("");
    const [manufacturerAutoFilled, setManufacturerAutoFilled] = useState(false);
    const [brandItemId, setBrandItemId] = useState(null);
    const [reviewStatus, setReviewStatus] = useState(null);
    const [gp, setGp] = useState(null);
    const [fixingMapping, setFixingMapping] = useState(false);
    const [pincodeStatus, setPincodeStatus] = useState(null);

    function load() {
        setLoading(true);
        adminGetSellerSubmission(token, submissionId).then((res) => {
            if (res?.success) {
                const s = res.submission;
                const manufacturerValue = s.manufacturer || s.suggested_manufacturer || "";
                setForm({
                    productName: s.product_name || "",
                    brandName: s.brand_name || "",
                    brandNotApplicable: !!s.brand_not_applicable,
                    manufacturer: manufacturerValue,
                    modelNo: s.model_no || "",
                    gradeVariant: s.grade_variant || "",
                    description: s.description || "",
                    manufacturingDetails: s.manufacturing_details || "",
                    specifications: s.specifications || [],
                    noteToAdmin: s.note_to_admin || "",

                    unit: s.unit || "",
                    packSize: s.pack_size ?? "",
                    masterPackSize: s.units_per_master_pack ?? "",
                    gstPercent: s.gst_percent ?? 18,

                    basePrice: s.base_price ?? "",
                    priceBasis: s.price_basis || "per_unit",
                    gstInclusive: !!s.gst_inclusive_input,
                    freightIncluded: !!s.freight_included,

                    sampleAvailable: s.sample_available || false,
                    sampleQuantity: s.sample_quantity ?? "",
                    sampleUnitBasis: s.sample_unit_basis || "per_unit",

                    priceSlabs: s.quantity_discounts || [],

                    stockType: s.stock_type || "ready_stock",
                    stockQuantity: s.stock_quantity ?? "",
                    productionLeadTimeDays: s.production_lead_time_days ?? "",
                    moq: s.moq ?? "",

                    dispatchPincode: s.dispatch_pincode || "",
                    dispatchDistrict: s.dispatch_district || "",
                    dispatchState: s.dispatch_state || "",

                    returnPolicyKey: s.return_policy_key || "",
                    warrantyKey: s.warranty_key || "",

                    qualityCertificates: s.quality_certificates || [],
                });
                setManufacturerAutoFilled(!s.manufacturer?.trim() && !!s.suggested_manufacturer);
                setImages(s.images?.length ? s.images : (s.image ? [s.image] : []));
                setDispatchingLocations(unflattenDispatchingLocations(s.dispatching_locations));
                setBrandItemId(s.brand?.id || s.generic_product_brand_id || null);
                setReviewStatus(s.review_status);
                setGp(s.generic_product || null);
            } else {
                setError(res?.message || "Couldn't load this listing.");
            }
            setLoading(false);
        });
    }

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [token, submissionId]);

    const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
    const removeImageAt = (i) => setImages((imgs) => imgs.filter((_, idx) => idx !== i));

    const finalPrice = form ? Math.round(Number(form.basePrice || 0) * (1 + Number(form.gstPercent || 0) / 100) * 100) / 100 : 0;
    const crumb = [gp?.subcategory?.category?.name, gp?.subcategory?.name, gp?.name].filter(Boolean).join(" › ");

    async function confirmPincode() {
        if (!/^\d{6}$/.test(form.dispatchPincode)) return;
        setPincodeStatus("checking");
        const res = await lookupPincode(form.dispatchPincode);
        if (res?.success) {
            setForm((f) => ({ ...f, dispatchDistrict: res.district, dispatchState: res.state }));
            setPincodeStatus("ok");
        } else setPincodeStatus("error");
    }

    async function persist() {
        const missing = computeAdminMissing(form, images);
        if (missing.length) { setError(`Please complete: ${missing.join(", ")}.`); return false; }
        setError("");
        setSaving(true);
        try {
            const res = await adminUpdateSellerSubmission(token, submissionId, {
                productName: form.productName.trim(),
                brandName: form.brandName.trim(),
                brandNotApplicable: form.brandNotApplicable,
                images,
                manufacturer: form.manufacturer,
                modelNo: form.modelNo,
                gradeVariant: form.gradeVariant,
                description: form.description,
                manufacturingDetails: form.manufacturingDetails,
                specifications: form.specifications,

                unit: form.unit,
                packSize: form.packSize,
                masterPackSize: form.masterPackSize,
                // hsnCode: form.hsnCode,
                gstPercent: form.gstPercent,

                basePrice: form.basePrice,
                priceBasis: form.priceBasis,
                gstInclusive: form.gstInclusive,
                freightIncluded: form.freightIncluded,

                sampleAvailable: form.sampleAvailable,
                sampleQuantity: form.sampleQuantity,
                sampleUnitBasis: form.sampleUnitBasis,

                priceSlabs: form.priceSlabs,

                stockType: form.stockType,
                stockQuantity: form.stockQuantity,
                productionLeadTimeDays: form.productionLeadTimeDays,
                moq: form.moq,

                dispatchPincode: form.dispatchPincode,
                dispatchDistrict: form.dispatchDistrict,
                dispatchState: form.dispatchState,
                dispatchingLocations: flattenDispatchingLocations(dispatchingLocations),

                returnPolicyKey: form.returnPolicyKey,
                warrantyKey: form.warrantyKey,

                qualityCertificates: form.qualityCertificates,
            });
            if (!res?.success) throw new Error(res?.message || "Couldn't save changes.");
            return true;
        } catch (e) {
            setError(e.message);
            return false;
        } finally {
            setSaving(false);
        }
    }

    async function handleSave() {
        const ok = await persist();
        if (ok) onSaved();
    }

    async function handleSaveAndApprove() {
        const ok = await persist();
        if (!ok) return;
        setApproving(true);
        const result = await onApprove(submissionId);
        setApproving(false);
        if (result?.success) onSaved();
        else load(); // refresh so the mapping panel / status reflect reality
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white" style={{ height: "90vh" }}>
                <div className="flex shrink-0 items-center justify-between border-b px-5 py-4" style={{ borderColor: C.hairSoft }}>
                    <h3 className="text-[16px] font-extrabold" style={{ color: C.ink }}>Edit listing</h3>
                    <button onClick={onClose} className="rounded-full p-1.5" style={{ color: C.muted }}><X className="h-4.5 w-4.5" /></button>
                </div>

                {loading && <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: C.muted }} /></div>}

                {!loading && form && (
                    <div className="flex-1 overflow-y-auto px-5 py-4" style={{ minHeight: 0 }}>
                        <div className="mb-3 flex items-start justify-between gap-2 rounded-lg px-3 py-2" style={{ background: C.hairSoft }}>
                            <div className="min-w-0">
                                <p className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>Catalog mapping</p>
                                <p className="text-[12px] font-bold break-words" style={{ color: C.ink }}>{crumb || "Not mapped to a catalog hierarchy"}</p>
                            </div>
                            <button onClick={() => setFixingMapping((v) => !v)} className="shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>
                                {fixingMapping ? "Cancel" : "Fix mapping"}
                            </button>
                        </div>
                        {!crumb && reviewStatus === "pending_review" && (
                            <p className="mb-3 flex items-start gap-1.5 rounded-lg px-3 py-2 text-[11.5px] font-semibold" style={{ background: "#fef3c7", color: "#a16207" }}>
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> This item can't be approved until it's mapped to a category above.
                            </p>
                        )}
                        {!crumb && reviewStatus === "approved" && (
                            <p className="mb-3 flex items-start gap-1.5 rounded-lg px-3 py-2 text-[11.5px] font-semibold" style={{ background: "#fef3c7", color: "#a16207" }}>
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> This product is already live for buyers, but still needs a category mapping — map it above whenever you're ready.
                            </p>
                        )}
                        {fixingMapping && brandItemId && (
                            <FixMappingPicker token={token} brandItemId={brandItemId} current={crumb}
                                onCancel={() => setFixingMapping(false)} onDone={() => { setFixingMapping(false); load(); }} />
                        )}

                        <div className="mt-3 flex flex-col gap-3">
                            <SectionCard icon={Package} title="Product" alwaysOpen>
                                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                                    <TextField required label="Product name" value={form.productName} onChange={(v) => set("productName", v)} />
                                    <ToggleField label="Brand applicable?" value={!form.brandNotApplicable} onChange={(v) => set("brandNotApplicable", !v)} />
                                </div>
                                {!form.brandNotApplicable && (
                                    <TextField required label="Brand name" value={form.brandName} onChange={(v) => set("brandName", v)} />
                                )}
                                <div className="flex flex-col gap-1.5">
                                    <Label>Images ({images.length})</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {images.map((src, i) => (
                                            <div key={src + i} className="relative h-16 w-16">
                                                <img src={src} alt="" className="h-full w-full rounded-lg border object-cover" style={{ borderColor: C.hair }} />
                                                <button type="button" onClick={() => removeImageAt(i)} className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] leading-none text-white">×</button>
                                                {i === 0 && <span className="absolute bottom-0 left-0 right-0 rounded-b-lg bg-black/60 py-0.5 text-center text-[7.5px] font-bold text-white">Cover</span>}
                                            </div>
                                        ))}
                                        {images.length === 0 && <p className="text-[11.5px] font-medium" style={{ color: C.danger }}>Needs at least one image.</p>}
                                    </div>
                                    <p className="text-[10.5px] font-medium" style={{ color: C.muted }}>Remove/reorder only — new photo uploads aren't supported here yet.</p>
                                </div>
                                {form.noteToAdmin && (
                                    <div className="rounded-lg px-3 py-2.5" style={{ background: `${C.secondary}0c` }}>
                                        <p className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: C.secondary }}>Seller's note to admin</p>
                                        <p className="mt-0.5 text-[12.5px] font-medium" style={{ color: C.ink }}>{form.noteToAdmin}</p>
                                    </div>
                                )}
                            </SectionCard>

                            <SectionCard icon={FileText} title="Admin-only details" subtitle="Shared across every seller listing this item">
                                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                                    {manufacturerAutoFilled ? (
                                        <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2" style={{ borderColor: C.hair, background: C.hairSoft }}>
                                            <div className="min-w-0">
                                                <p className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: C.muted }}>Manufacturer</p>
                                                <p className="truncate text-[13px] font-bold" style={{ color: C.ink }}>{form.manufacturer}</p>
                                            </div>
                                            <button type="button" onClick={() => setManufacturerAutoFilled(false)} className="shrink-0 text-[11px] font-bold" style={{ color: C.secondary }}>
                                                Edit
                                            </button>
                                        </div>
                                    ) : (
                                        <TextField label="Manufacturer" value={form.manufacturer} onChange={(v) => set("manufacturer", v)} />
                                    )}
                                    <TextField label="Model / Part No." value={form.modelNo} onChange={(v) => set("modelNo", v)} />
                                </div>
                                <TextField label="Grade / Variant" value={form.gradeVariant} onChange={(v) => set("gradeVariant", v)} />
                                <TextAreaField label="Description" value={form.description} onChange={(v) => set("description", v)} rows={3} />
                                <TextAreaField label="Manufacturing details" value={form.manufacturingDetails} onChange={(v) => set("manufacturingDetails", v)} rows={2} />
                                <RepeatableRows label="Specifications" rows={form.specifications} onChange={(rows) => set("specifications", rows)} addLabel="Add specification"
                                    columns={[{ key: "key", placeholder: "Attribute" }, { key: "value", placeholder: "Value" }]} />
                            </SectionCard>

                            <SectionCard icon={Boxes} title="Packaging & tax" alwaysOpen>
                                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                                    <SelectField required dense label="Unit" value={form.unit} onChange={(v) => set("unit", v)} options={UNITS} />
                                    <TextField required dense label="Pack size" value={form.packSize} onChange={(v) => set("packSize", v.replace(/[^\d.]/g, ""))} inputMode="decimal" />
                                    <TextField dense label="Master pack size" value={form.masterPackSize} onChange={(v) => set("masterPackSize", v.replace(/[^\d.]/g, ""))} inputMode="decimal" />
                                    <TextField required dense label="MOQ" value={form.moq} onChange={(v) => set("moq", v.replace(/[^\d.]/g, ""))} inputMode="decimal" />
                                </div>
                                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                                    {/* <TextField required dense label="HSN Code" value={form.hsnCode} onChange={(v) => set("hsnCode", v)} /> */}
                                    <ChipToggleGroup dense label="GST %" value={Number(form.gstPercent)} onChange={(v) => set("gstPercent", Number(v))} options={GST_OPTIONS.map((g) => ({ value: g, label: `${g}%` }))} />
                                </div>
                            </SectionCard>

                            <SectionCard icon={IndianRupee} title="Pricing" alwaysOpen>
                                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                                    <TextField required dense label="Base price (₹, ex GST per unit)" value={form.basePrice} onChange={(v) => set("basePrice", v.replace(/[^\d.]/g, ""))} inputMode="decimal" />
                                    <ChipToggleGroup dense label="As submitted, price was" value={form.priceBasis} onChange={(v) => set("priceBasis", v)} options={PRICE_BASIS_OPTIONS} />
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <ToggleField label="GST inclusive (as submitted)?" value={form.gstInclusive} onChange={(v) => set("gstInclusive", v)} />
                                    <ToggleField label="Freight included?" value={form.freightIncluded} onChange={(v) => set("freightIncluded", v)} />
                                </div>
                                <div className="flex items-center justify-between rounded-xl px-3.5 py-2.5" style={{ background: `${C.secondary}0c` }}>
                                    <span className="text-[11px] font-bold" style={{ color: C.muted }}>Final price (base + GST)</span>
                                    <span className="text-[14.5px] font-extrabold tabular-nums" style={{ color: C.secondary }}>₹{finalPrice.toLocaleString("en-IN")}</span>
                                </div>
                                <ToggleField label="Sample available?" value={form.sampleAvailable} onChange={(v) => set("sampleAvailable", v)} />
                                {form.sampleAvailable && (
                                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                                        <TextField dense label="Sample quantity" value={form.sampleQuantity} onChange={(v) => set("sampleQuantity", v.replace(/[^\d.]/g, ""))} inputMode="decimal" />
                                        <ChipToggleGroup dense label="Basis" value={form.sampleUnitBasis} onChange={(v) => set("sampleUnitBasis", v)} options={PRICE_BASIS_OPTIONS} />
                                    </div>
                                )}
                                <RepeatableRows label="Discount slabs" rows={form.priceSlabs} onChange={(rows) => set("priceSlabs", rows)} addLabel="Add slab"
                                    columns={[{ key: "minQty", placeholder: `Min qty (${form.unit || "units"})` }, { key: "discountPercent", placeholder: "Discount %" }]} />
                            </SectionCard>

                            <SectionCard icon={Truck} title="Fulfilment & delivery" alwaysOpen>
                                <ChipToggleGroup label="Fulfilment" value={form.stockType} onChange={(v) => set("stockType", v)}
                                    options={[{ value: "ready_stock", label: "Ready stock" }, { value: "made_to_order", label: "Made-to-order" }]} />
                                {form.stockType === "ready_stock" ? (
                                    <TextField required dense label={`Available stock (${form.unit || "units"})`} value={form.stockQuantity} onChange={(v) => set("stockQuantity", v.replace(/[^\d.]/g, ""))} inputMode="decimal" />
                                ) : (
                                    <TextField required dense label="Production lead time (days)" value={form.productionLeadTimeDays} onChange={(v) => set("productionLeadTimeDays", v.replace(/[^\d]/g, ""))} inputMode="numeric" />
                                )}
                                <div className="flex flex-col gap-1">
                                    <TextField required dense label="Dispatch pincode" value={form.dispatchPincode}
                                        onChange={(v) => { set("dispatchPincode", v.replace(/[^\d]/g, "")); setPincodeStatus(null); }}
                                        onBlur={confirmPincode} inputMode="numeric" />
                                    {pincodeStatus === "checking" && <p className="text-[10.5px] font-medium" style={{ color: C.muted }}>Checking…</p>}
                                    {pincodeStatus === "ok" && <p className="text-[10.5px] font-bold" style={{ color: C.secondary }}>Dispatching from {form.dispatchDistrict}, {form.dispatchState}</p>}
                                    {pincodeStatus === "error" && <p className="text-[10.5px] font-medium" style={{ color: C.primary }}>Couldn't verify this pincode.</p>}
                                    {!pincodeStatus && form.dispatchDistrict && <p className="text-[10.5px] font-bold" style={{ color: C.muted }}>{form.dispatchDistrict}, {form.dispatchState}</p>}
                                </div>
                                <DispatchingLocationsPicker value={dispatchingLocations} onChange={setDispatchingLocations} />
                            </SectionCard>

                            <SectionCard icon={FileText} title="Terms" alwaysOpen>
                                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                                    <PolicySelect kind="return_policy" label="Return / replacement policy" required value={form.returnPolicyKey} onChange={(v) => set("returnPolicyKey", v)} />
                                    <PolicySelect kind="warranty" label="Warranty" required value={form.warrantyKey} onChange={(v) => set("warrantyKey", v)} />
                                </div>
                            </SectionCard>

                            <SectionCard icon={ShieldCheck} title="Quality & certifications">
                                <RepeatableRows label="Certificates" rows={form.qualityCertificates} onChange={(rows) => set("qualityCertificates", rows)} addLabel="Add certificate"
                                    columns={[{ key: "name", placeholder: "Certificate name" }, { key: "url", placeholder: "Link to file" }]} />
                            </SectionCard>

                            {error && <p className="rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ background: "#fee2e2", color: C.danger }}>{error}</p>}
                        </div>
                    </div>
                )}

                {!loading && form && (
                    <div className="flex shrink-0 items-center justify-end gap-2 border-t px-5 py-3.5" style={{ borderColor: C.hairSoft }}>
                        <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-[13px] font-bold" style={{ color: C.muted }}>Cancel</button>
                        <button onClick={handleSave} disabled={saving || approving}
                            className="rounded-lg border px-4 py-2 text-[13px] font-bold disabled:opacity-50" style={{ borderColor: C.hair, color: C.ink }}>
                            {saving && !approving ? "Saving…" : "Save changes"}
                        </button>
                        {reviewStatus === "pending_review" && (
                            <button onClick={handleSaveAndApprove} disabled={saving || approving}
                                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.secondary }}>
                                {(saving || approving) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                Save &amp; Approve
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}