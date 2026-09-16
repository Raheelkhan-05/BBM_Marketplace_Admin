import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Loader2, ArrowLeft, Check, X, Save, ImageIcon, Trash2, ChevronDown } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { AnimatePresence } from "framer-motion";
import {
    adminGetCatalogEntry, adminUpdateCatalogEntry, adminApproveCatalogEntry,
    adminRejectCatalogEntry, adminGetCatalogOptions, adminCreateCatalogOption,
    adminListBrandItemSubmissions, adminDeleteCatalogEntry
} from "../../utils/api.js";
import CascadingHierarchyPicker from "../../components/CascadingHierarchyPicker.jsx";
import ImageLightbox from "../../components/ImageLightbox";

const PARENT_FIELD = { subcategory: "category_id", product: "subcategory_id", brand: "product_id", generic_product: "subcategory_id" };
const PARENT_LEVEL = { subcategory: "category", product: "subcategory", brand: "product", generic_product: "subcategory" };
const LEVEL_TO_PARENT_ID_FIELD = { subcategory: "category", product: "subcategory", brand: "product", generic_product: "subcategory", brand_item: "product" };
const LEVEL_LABEL = { category: "Category", subcategory: "Subcategory", product: "Product", brand: "Brand Item", generic_product: "Generic Product" };
// specifications is stored as jsonb key/value pairs — same free-form
// editor treatment as variants/attributes.
const JSON_FIELDS = new Set(["variants", "attributes", "specifications"]);
// Nicer labels for the new brand_item identity fields than the default
// title-cased-from-snake-case fallback would produce.
const FIELD_LABEL_OVERRIDES = {
    model_no: "Model / Part No. / SKU",
    grade_variant: "Product Grade / Variant",
    hsn_code: "HSN Code",
    manufacturing_details: "Manufacturing Details",
};
const MULTILINE_FIELDS = new Set(["description", "overview", "tagline", "manufacturing_details"]);


const STATUS_STYLE = {
    approved: { bg: "rgba(22,163,74,0.1)", fg: "#15803d", dot: "#22c55e" },
    rejected: { bg: "rgba(199,31,17,0.1)", fg: "#c71f11", dot: "#ef4444" },
    pending_review: { bg: "rgba(217,119,6,0.1)", fg: "#b45309", dot: "#f59e0b" },
};

function fieldLabel(key) {
    if (FIELD_LABEL_OVERRIDES[key]) return FIELD_LABEL_OVERRIDES[key];
    return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function DetailSkeleton() {
    return (
        <div className="mx-auto max-w-3xl animate-pulse px-4 pt-6 sm:px-6">
            <div className="h-4 w-32 rounded bg-slate-100" />
            <div className="mt-5 h-7 w-1/2 rounded bg-slate-100" />
            <div className="mt-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-slate-100" />)}
            </div>
        </div>
    );
}

export default function AdminCatalogDetailPage() {
    const { level, id } = useParams();
    const { token } = useAuth();
    const navigate = useNavigate();
    const [entry, setEntry] = useState(null);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [editableFields, setEditableFields] = useState([]);
    const [form, setForm] = useState({});
    const [chain, setChain] = useState({ category: null, subcategory: null, product: null });
    const [deleting, setDeleting] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [rejectReason, setRejectReason] = useState("");
    const [showReject, setShowReject] = useState(false);
    const [parentRejected, setParentRejected] = useState(false);
    const [error, setError] = useState("");

    // Linked seller listings — only relevant for level === "brand_item",
    // since commercial terms (price/MOQ/packaging/delivery/etc.) live on
    // seller_product_submissions, not on the brand item itself. Lets an
    // admin editing a brand item's identity see who's actually selling
    // it and jump straight to their full commercial-spec edit.
    const [linkedSubmissions, setLinkedSubmissions] = useState([]);
    const [loadingSubmissions, setLoadingSubmissions] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        adminGetCatalogEntry(token, level, id).then((res) => {
            if (res?.success) {
                setEntry(res.entry);
                setEditableFields(res.editableFields);
                setParentRejected(!!res.parentRejected);
                const initial = {};
                for (const key of res.editableFields) {
                    initial[key] = JSON_FIELDS.has(key) ? JSON.stringify(res.entry[key] ?? (key === "specifications" ? [] : key === "variants" ? [] : {}), null, 2) : res.entry[key];
                }
                setForm(initial);
                setChain({
                    category: res.ancestors?.category || null,
                    subcategory: res.ancestors?.subcategory || null,
                    product: res.ancestors?.product || null,
                });
            }
            setLoading(false);
        });
    }, [token, level, id]);

    useEffect(() => { if (token) load(); }, [token, load]);

    useEffect(() => {
        if (level !== "brand_item" || !entry?.id || !token) { setLinkedSubmissions([]); return; }
        setLoadingSubmissions(true);
        adminListBrandItemSubmissions(token, entry.id).then((res) => {
            setLinkedSubmissions(res?.success ? res.items : []);
            setLoadingSubmissions(false);
        });
    }, [level, entry?.id, token]);

    function buildPayload() {
        const payload = {};
        for (const key of editableFields) {
            if (JSON_FIELDS.has(key)) {
                try { payload[key] = JSON.parse(form[key]); }
                catch { throw new Error(`"${fieldLabel(key)}" is not valid JSON.`); }
            } else {
                payload[key] = form[key];
            }
        }
        // hs_product_brands.brand_name / hs_generic_product_brands fields
        // that are NOT NULL in the DB — block a save that would null them out.
        if (level === "brand" && !(payload.brand_name || "").trim()) {
            throw new Error("Brand name can't be empty.");
        }
        if (level === "brand_item") {
            if (!(payload.brand_name || "").trim()) throw new Error("Brand name can't be empty.");
            if (!(payload.manufacturer || "").trim()) throw new Error("Manufacturer can't be empty.");
            if (!(payload.model_no || "").trim()) throw new Error("Model / Part No. / SKU can't be empty.");
        }
        const rung = LEVEL_TO_PARENT_ID_FIELD[level];
        if (rung) {
            if (!chain[rung]?.id) throw new Error(`Select a ${rung} before saving.`);
            payload.parentId = chain[rung].id;
        }
        return payload;
    }

    async function handleSave() {
        setError("");
        try {
            setSaving(true);
            const payload = buildPayload();
            const res = await adminUpdateCatalogEntry(token, level, id, payload);
            if (!res?.success) throw new Error(res?.message || "Save failed.");
            setEntry(res.entry);
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    }

    async function handleApprove() {
        setError("");
        try {
            setSaving(true);
            // NEW: brand_item can't approve without a mapped generic product
            if (level === "brand_item" && !chain.product?.id) {
                throw new Error("Map this item's Category / Subcategory / Generic Product before approving.");
            }
            const payload = buildPayload();
            const res = await adminApproveCatalogEntry(token, level, id, payload);
            if (!res?.success) throw new Error(res?.message || "Approve failed.");
            navigate("/catalog");
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        const confirmed = window.confirm(
            level === "brand_item"
                ? `Delete "${entry.name}"? This removes it from the catalog and hides it from buyers immediately.`
                : `Delete "${entry.name}"? This will also remove everything nested under it (subcategories, generic products, brand items) from view.`
        );
        if (!confirmed) return;
        setDeleting(true);
        const res = await adminDeleteCatalogEntry(token, level, id);
        setDeleting(false);
        if (!res?.success) return setError(res?.message || "Couldn't delete that.");
        navigate("/catalog");
    }

    async function handleReject() {
        if (!rejectReason.trim()) return;
        setSaving(true);
        const res = await adminRejectCatalogEntry(token, level, id, rejectReason.trim());
        setSaving(false);
        if (res?.success) navigate("/catalog");
        else setError(res?.message || "Reject failed.");
    }

    if (loading) return <DetailSkeleton />;
    if (!entry) return <p className="py-16 text-center text-slate-400">Not found.</p>;

    const parentField = PARENT_FIELD[level];
    const tone = STATUS_STYLE[entry.review_status] || STATUS_STYLE.pending_review;
    const visibleFields = editableFields.filter((f) => f !== parentField);

    return (
        <div className="mx-auto max-w-3xl px-4 pb-28 pt-6 sm:px-6">
            <button onClick={() => navigate("/catalog")} className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-bold text-slate-500 transition-colors hover:text-[#047084]">
                <ArrowLeft className="h-4 w-4" /> Back to review queue
            </button>

            {/* Header card */}
            <div className="flex items-start gap-4 rounded-xl border border-slate-100 bg-white p-5">
                <button
                    type="button"
                    onClick={() => entry.image && setLightboxOpen(true)}
                    disabled={!entry.image}
                    className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-100 transition-shadow disabled:cursor-default enabled:hover:ring-2 enabled:hover:ring-[#047084]/30"
                >
                    {entry.image ? (
                        <img src={entry.image} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    ) : (
                        <ImageIcon className="h-6 w-6 text-slate-300" />
                    )}
                </button>

                <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] font-bold uppercase tracking-wide text-slate-400">{LEVEL_LABEL[level]}</p>
                    <h1 className="mt-0.5 truncate text-[19px] font-extrabold text-slate-900">{entry.name}</h1>
                    {level === "brand_item" && (entry.manufacturer || entry.model_no) && (
                        <p className="mt-0.5 truncate text-[12px] font-semibold text-slate-500">
                            {entry.manufacturer}{entry.manufacturer && entry.model_no ? " · " : ""}{entry.model_no}
                        </p>
                    )}
                    <div className="mt-2 flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.dot }} />
                        <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
                            {entry.review_status.replace("_", " ")}
                        </span>
                        {entry.is_ai_generated && <span className="text-[11px] font-semibold text-slate-400">· AI-generated</span>}
                    </div>
                </div>
            </div>

            {entry.rejection_reason && (
                <p className="mt-3 rounded-lg border border-[#c71f11]/15 bg-[#c71f11]/5 px-3.5 py-2.5 text-[12.5px] font-medium text-[#c71f11]">
                    <span className="font-bold">Rejected:</span> {entry.rejection_reason}
                </p>
            )}

            {parentRejected && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] font-medium text-amber-700">
                    <span className="font-bold">Heads up:</span> a parent in this entry's hierarchy has been rejected. It's hidden from the review queue and can't go live until its parent chain is valid again.
                </p>
            )}

            {/* Hierarchy mapping */}
            {level !== "category" && (
                <div className="mt-5 rounded-xl border border-slate-100 bg-white p-5">
                    <p className="mb-3 text-[13px] font-bold text-slate-700">Hierarchy mapping</p>
                    <CascadingHierarchyPicker
                        token={token}
                        entityLevel={level}
                        ancestors={{ category: chain.category, subcategory: chain.subcategory, product: chain.product }}
                        onChange={setChain}
                    />
                </div>
            )}

            {level === "brand_item" && !chain.product?.id && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] font-medium text-amber-700">
                    <span className="font-bold">Needs mapping:</span> this item was submitted without a category. Select Category → Subcategory → Generic Product below before approving.
                </p>
            )}

            {/* Seller listings — brand_item only. Identity lives here;
                commercial terms live on seller_product_submissions. */}
            {level === "brand_item" && (
                <div className="mt-5 rounded-xl border border-slate-100 bg-white p-5">
                    <p className="mb-1 text-[13px] font-bold text-slate-700">
                        Seller listings {linkedSubmissions.length > 0 && `(${linkedSubmissions.length})`}
                    </p>
                    <p className="mb-3 text-[11.5px] font-medium text-slate-400">
                        Commercial terms (price, MOQ, packaging, delivery, tax &amp; legal, quality) are set
                        per-seller, not on this brand item — edit them from a specific listing below.
                    </p>
                    {loadingSubmissions && <div className="h-16 animate-pulse rounded-lg bg-slate-50" />}
                    {!loadingSubmissions && linkedSubmissions.length === 0 && (
                        <p className="rounded-lg bg-slate-50 px-3.5 py-3 text-[12.5px] font-medium text-slate-400">
                            No seller has listed this item yet.
                        </p>
                    )}
                    {!loadingSubmissions && linkedSubmissions.length > 0 && (
                        <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                            {linkedSubmissions.map((s) => {
                                const stone = STATUS_STYLE[s.review_status] || STATUS_STYLE.pending_review;
                                return (
                                    <Link
                                        key={s.id}
                                        to={`/seller-submissions?highlight=${s.id}`}
                                        className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-slate-50"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-[12.5px] font-bold text-slate-800">{s.seller?.display_name || "Unknown seller"}</p>
                                            <p className="text-[11px] font-medium text-slate-400">
                                                ₹{s.price} · MOQ {s.moq} {s.unit} · {s.stock_type === "made_to_order" ? "Made-to-order" : "Ready stock"}
                                            </p>
                                        </div>
                                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: stone.bg, color: stone.fg }}>
                                            {s.review_status.replace("_", " ")}
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Fields */}
            <div className="mt-5 rounded-xl border border-slate-100 bg-white p-5">
                <p className="mb-3 text-[13px] font-bold text-slate-700">Details</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {visibleFields.map((key) => {
                        const isWide = JSON_FIELDS.has(key) || MULTILINE_FIELDS.has(key);
                        const isRequiredIdentityField = level === "brand_item" && ["brand_name", "manufacturer", "model_no"].includes(key);
                        return (
                            <div key={key} className={isWide ? "sm:col-span-2" : ""}>
                                <label className="mb-1.5 block text-[12px] font-bold text-slate-500">
                                    {fieldLabel(key)}{isRequiredIdentityField ? " *" : ""}
                                </label>
                                {JSON_FIELDS.has(key) ? (
                                    <textarea rows={4} value={form[key] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-mono text-[12px] focus:outline-none focus:ring-2 focus:ring-[#047084]/25" />
                                ) : MULTILINE_FIELDS.has(key) ? (
                                    <textarea rows={3} value={form[key] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#047084]/25" />
                                ) : (
                                    <input value={form[key] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#047084]/25" />
                                )}
                                {key === "specifications" && (
                                    <p className="mt-1 text-[11px] font-medium text-slate-400">JSON array of {"{ key, value }"} pairs, e.g. [{"{"}"key":"Material","value":"SS304"{"}"}]</p>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {error && (
                <p className="mt-3 rounded-lg border border-[#c71f11]/15 bg-[#c71f11]/5 px-3.5 py-2.5 text-[12.5px] font-semibold text-[#c71f11]">{error}</p>
            )}

            {/* Sticky action bar */}
            <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md">
                <div className="mx-auto flex max-w-3xl items-center gap-2">
                    <button onClick={handleSave} disabled={saving || deleting}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2.5 text-[13px] font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50">
                        <Save className="h-3.5 w-3.5" /> Save
                    </button>
                    <button onClick={() => setShowReject(true)} disabled={saving || deleting}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#c71f11]/25 px-4 py-2.5 text-[13px] font-bold text-[#c71f11] transition-colors hover:bg-[#c71f11]/5 disabled:opacity-50">
                        <X className="h-3.5 w-3.5" /> Reject
                    </button>
                    <button onClick={handleDelete} disabled={saving || deleting}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] font-bold text-slate-500 transition-colors hover:border-[#c71f11]/25 hover:bg-[#c71f11]/5 hover:text-[#c71f11] disabled:opacity-50">
                        {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={handleApprove} disabled={saving || deleting}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#047084] px-4 py-2.5 text-[13px] font-bold text-white shadow-sm shadow-[#047084]/20 transition-transform hover:scale-[1.01] disabled:opacity-50">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Approve{entry.review_status === "approved" ? " (save corrections)" : ""}
                    </button>
                </div>
            </div>

            {showReject && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 px-4 sm:items-center" onClick={() => setShowReject(false)}>
                    <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl">
                        <h3 className="text-[15px] font-bold text-slate-900">Reject this entry</h3>
                        <p className="mt-1 text-[12.5px] text-slate-500">It stays in the database (so the AI won't recreate it) but stops showing to buyers.</p>
                        <textarea autoFocus rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason…"
                            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#c71f11]/20" />
                        <div className="mt-3 flex justify-end gap-2">
                            <button onClick={() => setShowReject(false)} className="rounded-lg px-3 py-1.5 text-[13px] font-bold text-slate-500">Cancel</button>
                            <button onClick={handleReject} disabled={!rejectReason.trim() || saving} className="rounded-lg bg-[#c71f11] px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-50">Reject</button>
                        </div>
                    </div>
                </div>
            )}
            <AnimatePresence>
                {lightboxOpen && entry.image && (
                    <ImageLightbox src={entry.image} alt={entry.name} onClose={() => setLightboxOpen(false)} />
                )}
            </AnimatePresence>
        </div>
    );
}