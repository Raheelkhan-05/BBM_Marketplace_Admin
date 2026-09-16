// src/components/CreateSimpleCatalogModal.jsx
import { useEffect, useState } from "react";
import { X, Loader2, Plus, ImagePlus, Save, Trash2 } from "lucide-react";
import { adminCreateCatalogEntry, adminUpdateCatalogEntry, adminUploadCatalogImage, adminGetCatalogEntry } from "../utils/api.js";

const LEVEL_META = {
    category: { title: "category", folder: "categories" },
    subcategory: { title: "subcategory", folder: "subcategories" },
    generic_product: { title: "generic product", folder: "generic-products" },
    brand_item: { title: "brand item", folder: "brand-items" },
};

const UNITS = ["Pieces", "Kg", "Grams", "Litres", "Millilitres", "Dozen", "Tons"];

// Handles create AND edit for every "simple" catalog level — category,
// subcategory, generic_product, and brand_item. brand_item is IDENTITY
// ONLY (this is the catalog's canonical description of the product, not
// a seller's commercial listing of it): name + brand_name + manufacturer
// + model/part no./SKU + grade/variant + specifications + images[].
// Commercial terms (price, MOQ, packaging, delivery, etc.) are entered
// per-seller elsewhere (seller_product_submissions / SellerListingForm)
// and never touched here. Every other level keeps the original
// single-image shape (name + image).
export default function CreateSimpleCatalogModal({ token, isOpen, onClose, level, parentId, onCreated, onUpdated, editEntry }) {
    const isEdit = !!editEntry;
    const isBrandItem = level === "brand_item";
    const [name, setName] = useState("");
    const [brandName, setBrandName] = useState("");

    // Brand-item-only identity fields
    const [manufacturer, setManufacturer] = useState("");
    const [modelNo, setModelNo] = useState("");
    const [gradeVariant, setGradeVariant] = useState("");
    const [specifications, setSpecifications] = useState([]); // [{ key, value }]

    // Multi-image state (brand_item only)
    const [imageFiles, setImageFiles] = useState([]);       // newly picked File objects, in order
    const [imagePreviews, setImagePreviews] = useState([]); // mixed: existing https URLs + blob: URLs for new files, in display order

    // Single-image state (category / subcategory / generic_product)
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const [unit, setUnit] = useState("");
    const [packSize, setPackSize] = useState("");
    const [masterPackSize, setMasterPackSize] = useState("");

    // Edit mode (brand_item only) re-fetches the full row via GET /:level/:id
    // when the modal opens, rather than trusting whatever columns the LIST
    // query happens to include — the list is intentionally lightweight and
    // can lag behind full-record fields like `specifications` (a jsonb
    // column that's easy to forget to add to a hand-maintained SELECT list).
    // This makes the edit form correct regardless of that.
    const [loadingFull, setLoadingFull] = useState(false);

    useEffect(() => {
        if (isOpen && editEntry) {
            setName(editEntry.name || "");
            setBrandName(editEntry.brand_name || "");
            if (isBrandItem) {
                setManufacturer(editEntry.manufacturer || "");
                setModelNo(editEntry.model_no || "");
                setGradeVariant(editEntry.grade_variant || "");
                setSpecifications(editEntry.specifications || []);
                setImagePreviews(editEntry?.images?.length ? editEntry.images : editEntry?.image ? [editEntry.image] : []);
                setUnit(editEntry.unit || "");
                setPackSize(editEntry.pack_size ?? "");
                setMasterPackSize(editEntry.units_per_master_pack ?? "");
                setImageFiles([]);

                // Refresh from the full record so fields the list row
                // might be missing (specifications, etc.) always show up.
                if (token && editEntry.id) {
                    setLoadingFull(true);
                    adminGetCatalogEntry(token, "brand_item", editEntry.id).then((res) => {
                        if (!res?.success) { setLoadingFull(false); return; }
                        const full = res.entry;
                        setName(full.name || "");
                        setBrandName(full.brand_name || "");
                        setManufacturer(full.manufacturer || "");
                        setModelNo(full.model_no || "");
                        setGradeVariant(full.grade_variant || "");
                        setSpecifications(full.specifications || []);
                        setImagePreviews(full?.images?.length ? full.images : full?.image ? [full.image] : []);
                        setUnit(full.unit || "");
                        setPackSize(full.pack_size ?? "");
                        setMasterPackSize(full.units_per_master_pack ?? "");
                        setLoadingFull(false);
                    });
                }
            } else {
                setImagePreview(editEntry.image || null);
                setImageFile(null);
            }
        } else if (isOpen) {
            setName(""); setBrandName("");
            setManufacturer(""); setModelNo(""); setGradeVariant(""); setSpecifications([]);
            setImagePreviews([]); setImageFiles([]);
            setUnit(""); setPackSize(""); setMasterPackSize("");
            setImagePreview(null); setImageFile(null);
        }
        setError("");
    }, [isOpen, editEntry, isBrandItem, token]);

    if (!isOpen || !level) return null;
    const meta = LEVEL_META[level];

    function handleClose() { onClose(); }

    // --- specifications editor (brand_item) ---
    function updateSpec(i, field, val) {
        setSpecifications((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));
    }
    function removeSpec(i) {
        setSpecifications((rows) => rows.filter((_, idx) => idx !== i));
    }
    function addSpec() {
        setSpecifications((rows) => [...rows, { key: "", value: "" }]);
    }

    // --- multi-image handlers (brand_item) ---
    function handleFiles(e) {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setImageFiles((f) => [...f, ...files]);
        setImagePreviews((p) => [...p, ...files.map((f) => URL.createObjectURL(f))]);
        e.target.value = "";
    }
    function removeImageAt(i) {
        const removedUrl = imagePreviews[i];
        setImagePreviews((p) => p.filter((_, idx) => idx !== i));
        // Only newly-added files are blob: URLs — keep imageFiles in sync
        // by dropping the matching File whose object URL we just removed.
        if (removedUrl?.startsWith("blob:")) {
            setImageFiles((files) => {
                const blobIdx = imagePreviews.slice(0, i).filter((u) => u.startsWith("blob:")).length;
                return files.filter((_, idx) => idx !== blobIdx);
            });
        }
    }

    // --- single-image handler (other levels) ---
    function handleFile(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
    }

    async function handleSubmit() {
        setError("");
        const trimmed = name.trim();
        if (trimmed.length < 2) return setError("Name must be at least 2 characters.");
        if (isBrandItem && !brandName.trim()) return setError("Brand name is required.");
        if (isBrandItem && !manufacturer.trim()) return setError("Manufacturer is required.");
        if (isBrandItem && !modelNo.trim()) return setError("Model / Part No. / SKU is required.");
        if (!isEdit && level !== "category" && !parentId) return setError("Missing parent — please reopen this from inside the list.");
        if (isBrandItem && !unit) return setError("Unit is required.");
        if (isBrandItem && !(Number(packSize) > 0)) return setError("Pack size is required.");
        if (isBrandItem && !(Number(masterPackSize) > 0)) return setError("Units per master pack is required.");

        setSaving(true);
        try {
            const payload = { name: trimmed };

            if (isBrandItem) {
                const finalUrls = imagePreviews.filter((p) => !p.startsWith("blob:")); // kept existing urls
                for (const file of imageFiles) {
                    const up = await adminUploadCatalogImage(token, file, meta.folder);
                    if (!up?.success) throw new Error(up?.message || "Image upload failed.");
                    finalUrls.push(up.url);
                }
                if (!finalUrls.length) throw new Error("At least one product image is required.");
                payload.images = finalUrls;
                payload.image = finalUrls[0] || null;
                payload.brand_name = brandName.trim();
                payload.manufacturer = manufacturer.trim();
                payload.model_no = modelNo.trim();
                payload.grade_variant = gradeVariant.trim() || null;
                payload.specifications = specifications.filter((s) => s?.key?.trim());
                payload.unit = unit;
                payload.pack_size = Number(packSize);
                payload.units_per_master_pack = Number(masterPackSize);
            } else {
                let imageUrl = imagePreview && !imageFile ? editEntry?.image : null;
                if (imageFile) {
                    const up = await adminUploadCatalogImage(token, imageFile, meta.folder);
                    if (!up?.success) throw new Error(up?.message || "Image upload failed.");
                    imageUrl = up.url;
                }
                payload.image = imageUrl;
            }

            if (isEdit) {
                const res = await adminUpdateCatalogEntry(token, level, editEntry.id, payload);
                if (!res?.success) throw new Error(res?.message || "Couldn't save changes.");
                onUpdated?.(level, res.entry);
            } else {
                if (level !== "category") payload.parentId = parentId;
                const res = await adminCreateCatalogEntry(token, level, payload);
                if (!res?.success) throw new Error(res?.message || "Couldn't create that.");
                onCreated?.(level, res.entry);
            }
            handleClose();
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onClick={handleClose}>
            <div onClick={(e) => e.stopPropagation()} className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white sm:max-w-3xl sm:rounded-2xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <h3 className="text-[16px] font-extrabold text-slate-900">{isEdit ? `Edit ${meta.title}` : `Add ${meta.title}`}</h3>
                    <button onClick={handleClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600"><X className="h-4.5 w-4.5" /></button>
                </div>
                <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
                    <div>
                        <label className="mb-1.5 block text-[12px] font-bold text-slate-500">{isBrandItem ? "Product name *" : "Name *"}</label>
                        <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#047084]/25" />
                    </div>
                    {isBrandItem && (
                        <div>
                            <label className="mb-1.5 block text-[12px] font-bold text-slate-500">Brand *</label>
                            <input value={brandName} onChange={(e) => setBrandName(e.target.value)}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#047084]/25" />
                        </div>
                    )}
                    {isBrandItem && (
                        <div>
                            <label className="mb-1.5 block text-[12px] font-bold text-slate-500">Manufacturer *</label>
                            <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#047084]/25" />
                        </div>
                    )}
                    {isBrandItem && (
                        <div>
                            <label className="mb-1.5 block text-[12px] font-bold text-slate-500">Model / Part No. / SKU *</label>
                            <input value={modelNo} onChange={(e) => setModelNo(e.target.value)}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#047084]/25" />
                        </div>
                    )}
                    {isBrandItem && (
                        <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-1">
                                <label className="mb-1.5 block text-[12px] font-bold text-slate-500">Unit *</label>
                                <select value={unit} onChange={(e) => setUnit(e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#047084]/25">
                                    <option value="">Select…</option>
                                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                            <div className="col-span-1">
                                <label className="mb-1.5 block text-[12px] font-bold text-slate-500">Pack size *</label>
                                <input value={packSize} onChange={(e) => setPackSize(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 1"
                                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#047084]/25" />
                            </div>
                            <div className="col-span-1">
                                <label className="mb-1.5 block text-[12px] font-bold text-slate-500">Units / master pack *</label>
                                <input value={masterPackSize} onChange={(e) => setMasterPackSize(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 12"
                                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#047084]/25" />
                            </div>
                            <p className="col-span-3 text-[11px] font-medium text-slate-400">
                                e.g. "1 Litre bottle, 12 per master carton" — fixed for this product, every seller who lists it inherits these.
                            </p>
                        </div>
                    )}
                    {isBrandItem && (
                        <div>
                            <label className="mb-1.5 block text-[12px] font-bold text-slate-500">Product Grade / Variant</label>
                            <input value={gradeVariant} onChange={(e) => setGradeVariant(e.target.value)} placeholder="Where applicable"
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#047084]/25" />
                        </div>
                    )}
                    {isBrandItem && (
                        <div>
                            <label className="mb-1.5 block text-[12px] font-bold text-slate-500">
                                Specifications / Technical Data Sheet {loadingFull && <span className="font-normal text-slate-400">(loading…)</span>}
                            </label>
                            <div className="flex flex-col gap-2">
                                {specifications.map((row, i) => (
                                    <div key={i} className="flex items-center gap-1.5">
                                        <input
                                            value={row.key || ""}
                                            placeholder="Attribute (e.g. Material)"
                                            onChange={(e) => updateSpec(i, "key", e.target.value)}
                                            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-2 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-[#047084]/25"
                                        />
                                        <input
                                            value={row.value || ""}
                                            placeholder="Value (e.g. SS304)"
                                            onChange={(e) => updateSpec(i, "value", e.target.value)}
                                            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-2 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-[#047084]/25"
                                        />
                                        <button type="button" onClick={() => removeSpec(i)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-red-50">
                                            <Trash2 className="h-3.5 w-3.5 text-[#c71f11]" />
                                        </button>
                                    </div>
                                ))}
                                <button type="button" onClick={addSpec} className="flex w-fit items-center gap-1 text-[12px] font-bold text-[#047084]">
                                    <Plus className="h-3.5 w-3.5" /> Add specification
                                </button>
                            </div>
                        </div>
                    )}

                    {isBrandItem ? (
                        <div>
                            <label className="mb-1.5 block text-[12px] font-bold text-slate-500">Images {imagePreviews.length > 0 && `(${imagePreviews.length})`} *</label>
                            <div className="flex flex-wrap gap-2">
                                {imagePreviews.map((src, i) => (
                                    <div key={src + i} className="relative h-20 w-20">
                                        <img src={src} alt="" className="h-full w-full rounded-lg border border-slate-200 object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => removeImageAt(i)}
                                            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] leading-none text-white"
                                            aria-label="Remove image"
                                        >
                                            ×
                                        </button>
                                        {i === 0 && (
                                            <span className="absolute bottom-0 left-0 right-0 rounded-b-lg bg-black/60 py-0.5 text-center text-[8.5px] font-bold text-white">Cover</span>
                                        )}
                                    </div>
                                ))}
                                <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-200 text-slate-400">
                                    <ImagePlus className="h-5 w-5" />
                                    <span className="text-[9px] font-bold">Add</span>
                                    <input type="file" accept="image/*" multiple onChange={handleFiles} className="hidden" />
                                </label>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label className="mb-1.5 block text-[12px] font-bold text-slate-500">Image</label>
                            <label className="flex h-28 w-28 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-200 text-slate-400">
                                {imagePreview ? <img src={imagePreview} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6" />}
                                <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
                            </label>
                        </div>
                    )}

                    {error && <p className="text-[12.5px] font-semibold text-[#c71f11]">{error}</p>}
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3.5">
                    <button onClick={handleClose} className="rounded-lg px-3.5 py-2 text-[13px] font-bold text-slate-500">Cancel</button>
                    <button onClick={handleSubmit} disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#047084] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isEdit ? <Save className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        {isEdit ? "Save" : "Create"}
                    </button>
                </div>
            </div>
        </div>
    );
}