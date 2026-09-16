// components/catalog/BrandItemDetailModal.jsx
import { useEffect, useState } from "react";
import { X, Loader2, Package, IndianRupee, Boxes, Archive, Truck, FileText, Handshake, ShieldCheck, ListChecks } from "lucide-react";
import { fetchPublicListingDetail } from "../../utils/api";
import { C } from "./tokens";

function ReadRow({ label, value }) {
    if (value === "" || value === null || value === undefined) return null;
    return (
        <div className="flex items-baseline justify-between gap-3 py-1 text-[12px]">
            <span className="shrink-0 font-semibold" style={{ color: C.muted }}>{label}</span>
            <span className="text-right font-bold" style={{ color: C.ink }}>{String(value)}</span>
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

export default function BrandItemDetailModal({ submissionId, onClose, onImageClick, onBuy }) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        fetchPublicListingDetail(submissionId).then((res) => {
            if (cancelled) return;
            if (res?.success) setData(res.listing); else setError(res?.message || "Couldn't load this listing.");
            setLoading(false);
            console.log(res.listing);
        });


        return () => { cancelled = true; };
    }, [submissionId]);

    const s = data;
    const images = s?.brand?.images?.length ? s.brand.images : (s?.brand?.image ? [s.brand.image] : []);
    const finalPrice = s ? Math.round(Number(s.base_price || 0) * (1 + Number(s.gst_percent || 0) / 100) * 100) / 100 : 0;

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white" style={{ height: "88vh" }}>
                <div className="flex shrink-0 items-center justify-between border-b px-5 py-3.5" style={{ borderColor: C.hairSoft }}>
                    <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-extrabold" style={{ color: C.ink }}>{s?.brand?.name || "Product details"}</h3>
                        {s?.brand?.brand_name && <p className="text-[11.5px] font-semibold" style={{ color: C.muted }}>{s.brand.brand_name}</p>}
                    </div>
                    <button onClick={onClose} className="shrink-0 rounded-full p-1.5 hover:bg-black/[0.05]" style={{ color: C.muted }}><X className="h-4 w-4" /></button>
                </div>

                {loading && <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: C.muted }} /></div>}
                {!loading && error && <p className="flex-1 px-5 py-8 text-center text-[13px] font-semibold" style={{ color: "#c71f11" }}>{error}</p>}

                {!loading && s && (
                    <div className="flex-1 overflow-y-auto px-5 py-3.5" data-lenis-prevent style={{ minHeight: 0, overscrollBehavior: "contain" }}>
                        {images.length > 0 && (
                            <div className="mb-3 flex flex-wrap gap-1.5">
                                {images.map((src, i) => (
                                    <button key={src + i} onClick={() => onImageClick?.({ images, index: i, alt: s.brand?.name })} className="relative h-16 w-16">
                                        <img src={src} alt="" className="h-full w-full rounded-md border object-cover" style={{ borderColor: C.hair }} />
                                    </button>
                                ))}
                            </div>
                        )}
                        <SectionBlock icon={Package} title="Product">
                            <ReadRow label="Manufacturer" value={s.manufacturer} />
                            <ReadRow label="Model / Part No." value={s.model_no} />
                            <ReadRow label="Grade / Variant" value={s.grade_variant} />
                        </SectionBlock>

                        {Array.isArray(s.specifications) && s.specifications.length > 0 && (
                            <SectionBlock icon={ListChecks} title="Specifications">
                                {s.specifications.map((spec, i) => (
                                    <ReadRow key={spec.key + i} label={spec.key} value={spec.value} />
                                ))}
                            </SectionBlock>
                        )}

                        <SectionBlock icon={IndianRupee} title="Pricing">
                            <ReadRow label="Base price" value={s.base_price != null ? `₹${s.base_price}` : null} />
                            <ReadRow label="GST %" value={s.gst_percent != null ? `${s.gst_percent}%` : null} />
                            <ReadRow label="Final price" value={`₹${finalPrice.toLocaleString("en-IN")}`} />
                            <ReadRow label="Valid till" value={s.price_validity_till} />
                        </SectionBlock>
                        <SectionBlock icon={Boxes} title="Quantity">
                            <ReadRow label="MOQ" value={s.moq != null ? `${s.moq} ${s.unit || ""}` : null} />
                            <ReadRow label="Sample" value={s.sample_available ? (s.sample_price ? `₹${s.sample_price}` : "Free") : "Not available"} />
                        </SectionBlock>
                        <SectionBlock icon={Archive} title="Packaging">
                            <ReadRow label="Pack size" value={s.pack_size} />
                            <ReadRow label="Packaging type" value={s.packaging_type} />
                        </SectionBlock>
                        <SectionBlock icon={Boxes} title="Availability">
                            <ReadRow label="Stock" value={s.stock_quantity} />
                            <ReadRow label="Fulfilment" value={s.stock_type === "made_to_order" ? "Made-to-order" : "Ready stock"} />
                            <ReadRow label="Dispatch time" value={s.dispatch_time_days != null ? `${s.dispatch_time_days}d` : null} />
                        </SectionBlock>
                        <SectionBlock icon={Truck} title="Delivery">
                            <ReadRow label="Dispatch location" value={s.dispatch_location} />
                            <ReadRow label="Timeline" value={s.delivery_timeline} />
                        </SectionBlock>
                        <SectionBlock icon={FileText} title="Tax & Legal">
                            <ReadRow label="HSN Code" value={s.hsn_code} />
                            <ReadRow label="Tax invoice" value={s.tax_invoice_available ? "Yes" : "No"} />
                        </SectionBlock>
                        <SectionBlock icon={Handshake} title="Commercial Terms" />
                        <ReadRow label="Warranty" value={s.warranty} />
                        <ReadRow label="Payment terms" value={s.payment_terms} />
                        <ReadRow label="Return policy" value={s.return_policy} />
                    </div>
                )}

                {!loading && s && (
                    <div className="flex shrink-0 items-center justify-end gap-2 border-t px-5 py-3" style={{ borderColor: C.hairSoft }}>
                        <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-[12.5px] font-bold" style={{ color: C.muted }}>Close</button>
                        <button onClick={onBuy} className="rounded-lg px-4 py-2 text-[12.5px] font-bold text-white" style={{ background: C.secondary }}>Buy from this seller</button>
                    </div>
                )}
            </div>
        </div>
    );
}