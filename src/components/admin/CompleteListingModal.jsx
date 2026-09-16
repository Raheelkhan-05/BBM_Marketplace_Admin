// components/admin/CompleteListingModal.jsx
//
// Shown when an admin clicks "Approve" on a listing whose brand item isn't
// mapped to a category yet (approveSellerSubmission returns code:
// "NOT_MAPPED"). Combines hierarchy mapping (required) with the optional
// admin-only identity fields (manufacturer, model/part no., grade/variant,
// description, manufacturing details, specifications) in one flow, then
// re-attempts approve. All fields here are skippable except the mapping.
import { useState, useEffect, useRef } from "react";
import { Loader2, CheckCircle2, X, SkipForward, Check } from "lucide-react";
import { adminUpdateCatalogEntry, adminListCatalog, adminCreateCatalogEntry, adminUpdateSellerSubmission } from "../../utils/api.js";
import HierarchyCombobox from "../seller/listingForm/HierarchyCombobox.jsx";
import { C, TextField, TextAreaField, RepeatableRows, SectionCard } from "../seller/listingForm/FormPrimitives.jsx";
import { Package, FileText } from "lucide-react";

// Same Lenis-hijack behavior used by DispatchingLocationsPicker's inner
// scroll areas, applied here to the whole modal body so background page
// scroll doesn't fight the modal while it's open.
function useLenisModalLock(active) {
    useEffect(() => {
        if (!active) return;
        const lenis = typeof window !== "undefined" ? window.lenis : null;
        const { overflow } = document.body.style;
        document.body.style.overflow = "hidden";
        if (typeof lenis?.stop === "function") lenis.stop();
        return () => {
            document.body.style.overflow = overflow;
            if (typeof lenis?.start === "function") lenis.start();
        };
    }, [active]);
}

export default function CompleteListingModal({ token, submissionId, brandItemId, productName, suggestedManufacturer, onClose, onApproved }) {
    useLenisModalLock(true);

    const [step, setStep] = useState("mapping");
    const [categoryEntry, setCategoryEntry] = useState(null);
    const [subcategoryEntry, setSubcategoryEntry] = useState(null);
    const [genericProductEntry, setGenericProductEntry] = useState(null);
    const [mappingSaving, setMappingSaving] = useState(false);
    const [mappingError, setMappingError] = useState("");

    const [details, setDetails] = useState({
        manufacturer: suggestedManufacturer || "", modelNo: "", gradeVariant: "",
        description: "", manufacturingDetails: "", specifications: [],
    });
    const [manufacturerAutoFilled, setManufacturerAutoFilled] = useState(!!suggestedManufacturer);
    const [finishing, setFinishing] = useState(false);
    const [finishError, setFinishError] = useState("");

    async function saveMapping() {
        if (!genericProductEntry) { setMappingError("Pick or create a generic product to map this item under."); return; }
        setMappingSaving(true); setMappingError("");
        const res = await adminUpdateCatalogEntry(token, "brand_item", brandItemId, { parentId: genericProductEntry.id });
        setMappingSaving(false);
        if (!res?.success) { setMappingError(res?.message || "Couldn't save the mapping."); return; }
        setStep("details");
    }

    async function finish(applyDetails) {
        setFinishing(true); setFinishError("");
        if (applyDetails) {
            const hasAny = details.manufacturer.trim() || details.modelNo.trim() || details.gradeVariant.trim()
                || details.description.trim() || details.manufacturingDetails.trim() || details.specifications.length;
            if (hasAny) {
                const res = await adminUpdateSellerSubmission(token, submissionId, {
                    manufacturer: details.manufacturer, modelNo: details.modelNo, gradeVariant: details.gradeVariant,
                    description: details.description, manufacturingDetails: details.manufacturingDetails,
                    specifications: details.specifications,
                });
                if (!res?.success) { setFinishing(false); setFinishError(res?.message || "Couldn't save those details."); return; }
            }
        }
        const approveRes = await onApproved(submissionId); // parent's approve(), now that mapping exists
        setFinishing(false);
        if (approveRes?.success) onClose();
        else setFinishError(approveRes?.message || "Mapping saved, but approval still failed — check the listing.");
    }

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white" style={{ maxHeight: "88vh" }}>
                <div className="flex shrink-0 items-center justify-between border-b px-5 py-4" style={{ borderColor: C.hairSoft }}>
                    <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-extrabold" style={{ color: C.ink }}>
                            {step === "mapping" ? "Map before approving" : "Optional product details"}
                        </h3>
                        <p className="truncate text-[11.5px] font-medium" style={{ color: C.muted }}>{productName}</p>
                    </div>
                    <button onClick={onClose} className="shrink-0 rounded-full p-1.5" style={{ color: C.muted }}><X className="h-4 w-4" /></button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4" style={{ minHeight: 0 }}>
                    {step === "mapping" && (
                        <div className="flex flex-col gap-3">
                            <p className="text-[12.5px] font-medium" style={{ color: C.muted }}>
                                This item hasn't been mapped to a category yet — it can't be approved until it is.
                            </p>
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
                            {mappingError && <p className="text-[11.5px] font-semibold" style={{ color: C.danger }}>{mappingError}</p>}
                        </div>
                    )}

                    {step === "details" && (
                        <div className="flex flex-col gap-3">
                            <p className="text-[12.5px] font-medium" style={{ color: C.muted }}>
                                Optional — fill in what you have, or skip and approve as-is. Shared across every seller listing this item.
                            </p>
                            <SectionCard icon={Package} title="Identity" alwaysOpen>
                                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                                    {manufacturerAutoFilled ? (
                                        <div
                                            className="relative rounded-lg border bg-white px-3 py-2.5 transition-colors"
                                            style={{ borderColor: C.hair }}
                                        >
                                            {/* Label */}
                                            <div className="mb-1 flex items-center justify-between gap-2">
                                                <p
                                                    className="text-[11px] font-extrabold uppercase tracking-[1.15px]"
                                                    style={{ color: C.muted }}
                                                >
                                                    Manufacturer
                                                </p>

                                                <span
                                                    className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold tracking-wider"
                                                    style={{
                                                        background: `${C.secondary}10`,
                                                        color: C.secondary,
                                                    }}
                                                >
                                                    <Check className="h-2.5 w-2.5" strokeWidth={2.5} />
                                                    Auto-filled
                                                </span>
                                            </div>

                                            {/* Value + Edit */}
                                            <div className="flex items-center gap-2">
                                                <p
                                                    className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-wide"
                                                    style={{ color: C.ink }}
                                                >
                                                    {details.manufacturer || "—"}
                                                </p>

                                                <button
                                                    type="button"
                                                    onClick={() => setManufacturerAutoFilled(false)}
                                                    className="shrink-0 rounded-md px-1.5 py-1 text-[10px] font-bold transition-colors duration-150 hover:bg-black/[0.04] tracking-wider"
                                                    style={{ color: C.secondary }}
                                                >
                                                    Edit
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <TextField
                                            label="Manufacturer"
                                            value={details.manufacturer}
                                            onChange={(v) =>
                                                setDetails((d) => ({ ...d, manufacturer: v }))
                                            }
                                        />
                                    )}

                                    <TextField
                                        label="Model / Part No."
                                        value={details.modelNo}
                                        onChange={(v) =>
                                            setDetails((d) => ({ ...d, modelNo: v }))
                                        }
                                    />
                                </div>
                                <TextField label="Grade / Variant" value={details.gradeVariant} onChange={(v) => setDetails((d) => ({ ...d, gradeVariant: v }))} />
                            </SectionCard>
                            <SectionCard icon={FileText} title="Description" alwaysOpen>
                                <TextAreaField label="Description" value={details.description} onChange={(v) => setDetails((d) => ({ ...d, description: v }))} rows={3} />
                                {/* <TextAreaField label="Manufacturing details" value={details.manufacturingDetails} onChange={(v) => setDetails((d) => ({ ...d, manufacturingDetails: v }))} rows={2} /> */}
                                <RepeatableRows label="Specifications" rows={details.specifications} onChange={(rows) => setDetails((d) => ({ ...d, specifications: rows }))} addLabel="Add specification"
                                    columns={[{ key: "key", placeholder: "Attribute" }, { key: "value", placeholder: "Value" }]} />
                            </SectionCard>
                            {finishError && <p className="text-[11.5px] font-semibold" style={{ color: C.danger }}>{finishError}</p>}
                        </div>
                    )}
                </div>

                <div className="flex shrink-0 items-center justify-end gap-2 border-t px-5 py-3.5" style={{ borderColor: C.hairSoft }}>
                    {step === "mapping" ? (
                        <>
                            <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-[13px] font-bold" style={{ color: C.muted }}>Cancel</button>
                            <button onClick={saveMapping} disabled={mappingSaving || !genericProductEntry}
                                className="rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.secondary }}>
                                {mappingSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save mapping & continue"}
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => finish(false)} disabled={finishing}
                                className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[13px] font-bold disabled:opacity-50" style={{ borderColor: C.hair, color: C.ink }}>
                                <SkipForward className="h-3.5 w-3.5" /> Skip & approve
                            </button>
                            <button onClick={() => finish(true)} disabled={finishing}
                                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.secondary }}>
                                {finishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Save & approve
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}