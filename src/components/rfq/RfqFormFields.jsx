// components/rfq/RfqFormFields.jsx
// Presentational fields shared by the buyer's post/edit modal and the admin review modal.
import { useRef, useState } from "react";
import { ImagePlus, Loader2, Check } from "lucide-react";
import { C, TextField, TextAreaField, SelectField, ChipToggleGroup } from "../seller/listingForm/FormPrimitives.jsx";
import DispatchingLocationsPicker from "../seller/listingForm/DispatchingLocationsPicker.jsx";
import { uploadSellerFile } from "../../utils/api.js";
import { lookupPincode } from "../../utils/sellerListingApi.js";
import { RFQ_UNITS, PAYMENT_OPTIONS, FREQ_OPTIONS, fmtNum } from "../../utils/rfqUtils.js";

function Block({ title, hint, children }) {
    return (
        <div className="flex flex-col gap-2.5 rounded-2xl border bg-white p-3" style={{ borderColor: C.hair }}>
            <div>
                <p className="text-[14.5px] font-extrabold tracking-wide" style={{ color: C.ink }}>{title}</p>
                {hint && <p className="text-[12px] font-medium tracking-wide" style={{ color: C.muted }}>{hint}</p>}
            </div>
            {children}
        </div>
    );
}

function Err({ msg }) {
    return msg ? <p className="text-[11.5px] font-semibold tracking-wide" style={{ color: C.danger }}>{msg}</p> : null;
}

const Anchor = ({ k, children }) => <div id={`rfq-field-${k}`} className="min-w-0 rounded-xl">{children}</div>;

export default function RfqFormFields({ form, setForm, errors = {}, token, readOnly = false }) {
    const [uploading, setUploading] = useState(false);
    const [imgError, setImgError] = useState(null);
    const [lookingUp, setLookingUp] = useState(false);
    const fileRef = useRef(null);

    const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const handleFiles = async (e) => {
        const files = Array.from(e.target.files || []).filter((f) => f.type?.startsWith("image/"));
        e.target.value = "";
        if (!files.length) return;
        const room = 5 - form.images.length;
        if (room <= 0) { setImgError("You can add up to 5 images."); return; }
        setUploading(true); setImgError(null);
        try {
            const urls = [];
            for (const file of files.slice(0, room)) {
                const res = await uploadSellerFile(token, file, "listings");
                if (!res?.success) throw new Error("Image upload failed. Please try again.");
                urls.push(res.url);
            }
            setForm((f) => ({ ...f, images: [...f.images, ...urls].slice(0, 5) }));
        } catch (err) {
            setImgError(err.message);
        } finally {
            setUploading(false);
        }
    };

    const onPincode = async (raw) => {
        const pin = raw.replace(/\D/g, "").slice(0, 6);
        setField("deliveryPincode", pin);
        if (pin.length !== 6) return;
        setLookingUp(true);
        try {
            const res = await lookupPincode(pin);
            if (res?.success) {
                setForm((f) => (f.deliveryPincode === pin ? { ...f, deliveryCity: res.district || f.deliveryCity, deliveryState: res.state || f.deliveryState } : f));
            }
        } finally {
            setLookingUp(false);
        }
    };

    const qty = Number(form.quantity);
    const pack = Number(form.packSize);
    const showTotal = qty > 0 && pack > 0 && form.unit;
    const eq = form.acceptEquivalent;

    return (
        <div className={`flex flex-col gap-3 ${readOnly ? "pointer-events-none opacity-80" : ""}`}>
            {/* Product */}
            <Block title="Product" hint="What do you need to buy?">
                <Anchor k="productName">
                    <TextField required label="Product name" value={form.productName} onChange={(v) => setField("productName", v)}
                        error={!!errors.productName} placeholder="e.g. Stainless Steel Hinges 4 inch" />
                    <Err msg={errors.productName} />
                </Anchor>

                <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: C.muted }}>
                        Product images {form.images.length > 0 && `(${form.images.length}/5)`}
                    </span>
                    <div className="flex flex-wrap gap-2">
                        {form.images.map((src, i) => (
                            <div key={src + i} className="relative h-16 w-16 sm:h-[72px] sm:w-[72px]">
                                <img src={src} alt="" className="h-full w-full rounded-xl border object-cover" style={{ borderColor: C.hair }} />
                                <button type="button" onClick={() => setForm((f) => ({ ...f, images: f.images.filter((_, idx) => idx !== i) }))}
                                    className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-[10px] leading-none text-white">×</button>
                            </div>
                        ))}
                        {form.images.length < 5 && (
                            <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed sm:h-[72px] sm:w-[72px]" style={{ borderColor: C.hair, color: C.muted }}>
                                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                                <span className="text-[9px] font-bold">{uploading ? "Uploading…" : "Add"}</span>
                                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} disabled={uploading} />
                            </label>
                        )}
                    </div>
                    <Err msg={imgError} />
                </div>

                <TextAreaField label="Specifications" rows={3} value={form.specifications} onChange={(v) => setField("specifications", v)}
                    placeholder="Grade, size, material, brand preference, standards… (optional)" />
            </Block>

            {/* Quantity */}
            <Block title="Quantity & packing">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <Anchor k="quantity">
                        <TextField required dense label="Quantity (in Packs)" inputMode="decimal" placeholder="e.g. 500"
                            hint="How many Packs do you want to buy?"
                            value={form.quantity} onChange={(v) => setField("quantity", v.replace(/[^\d.]/g, ""))} error={!!errors.quantity} />
                        <Err msg={errors.quantity} />
                    </Anchor>
                    <Anchor k="unit">
                        <SelectField required dense label="Unit" hint="Smallest measure this product is sold in" value={form.unit}
                            onChange={(v) => setField("unit", v)} error={!!errors.unit} options={RFQ_UNITS} />
                        <Err msg={errors.unit} />
                    </Anchor>
                    <Anchor k="packSize">
                        <TextField required dense label={form.unit ? `Pack size (${form.unit})` : "Pack size"} inputMode="decimal" placeholder="e.g. 10"
                            hint={form.unit ? `How many ${form.unit} make up 1 Pack. Use 1 if you buy loose.` : "How many Units make up 1 Pack. Use 1 if you buy loose."}
                            value={form.packSize} onChange={(v) => setField("packSize", v.replace(/[^\d.]/g, ""))} error={!!errors.packSize} />
                        <Err msg={errors.packSize} />
                    </Anchor>
                </div>
                {showTotal && (
                    <p className="text-[13px] font-bold tracking-wider" style={{ color: C.ink }}>
                        Total required: {fmtNum(qty * pack)} {form.unit}
                        <span className="font-semibold" style={{ color: C.muted }}> ({fmtNum(qty)} Pack{qty === 1 ? "" : "s"} × {fmtNum(pack)} {form.unit})</span>
                    </p>
                )}
            </Block>

            {/* Same vs equivalent */}
            <button type="button" role="checkbox" aria-checked={eq} onClick={() => setField("acceptEquivalent", !eq)}
                className="flex items-start gap-2.5 rounded-2xl border p-3 text-left transition-colors duration-150"
                style={{ borderColor: eq ? C.ink : C.hair, background: eq ? "rgba(11,17,22,0.03)" : "#fff" }}>
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border"
                    style={{ background: eq ? "#000" : "#fff", borderColor: eq ? "#000" : "rgba(11,17,22,0.3)" }}>
                    {eq && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                    <span className="block text-[14px] font-extrabold tracking-wide" style={{ color: C.ink }}>Equivalent products are acceptable</span>
                    <span className="mt-0.5 block text-[12px] font-medium leading-snug tracking-wide" style={{ color: C.muted }}>
                        Suppliers can quote a comparable alternative. Leave unticked if you need exactly this product.
                    </span>
                </span>
            </button>

            {/* Payment */}
            <Block title="Expected payment terms">
                <Anchor k="paymentTerms">
                    <ChipToggleGroup value={form.paymentTerms} onChange={(v) => setField("paymentTerms", v)} options={PAYMENT_OPTIONS} />
                    <Err msg={errors.paymentTerms} />
                </Anchor>
                {form.paymentTerms === "credit" && (
                    <Anchor k="creditDays">
                        <div className="sm:w-1/2">
                            <TextField dense label="Credit period (days)" inputMode="numeric" placeholder="e.g. 30 (optional)"
                                value={form.creditDays} onChange={(v) => setField("creditDays", v.replace(/\D/g, "").slice(0, 3))} error={!!errors.creditDays} />
                        </div>
                        <Err msg={errors.creditDays} />
                    </Anchor>
                )}
            </Block>

            {/* Delivery */}
            <Block title="Delivery location" hint="Pre-filled from your saved address. You can change it for this enquiry.">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <Anchor k="deliveryPincode">
                        <TextField required dense label="Pincode" inputMode="numeric" placeholder="6 digits" value={form.deliveryPincode}
                            onChange={onPincode} error={!!errors.deliveryPincode} />
                        <Err msg={errors.deliveryPincode} />
                    </Anchor>
                    <Anchor k="deliveryCity">
                        <TextField required dense label={lookingUp ? "City…" : "City"} value={form.deliveryCity}
                            onChange={(v) => setField("deliveryCity", v)} error={!!errors.deliveryCity} />
                        <Err msg={errors.deliveryCity} />
                    </Anchor>
                    <Anchor k="deliveryState">
                        <TextField required dense label="State" value={form.deliveryState}
                            onChange={(v) => setField("deliveryState", v)} error={!!errors.deliveryState} />
                        <Err msg={errors.deliveryState} />
                    </Anchor>
                </div>
                <TextField dense label="Address / landmark" placeholder="Optional" value={form.deliveryAddress} onChange={(v) => setField("deliveryAddress", v)} />
            </Block>

            {/* Suppliers */}
            <Block title="Looking for suppliers from">
                <ChipToggleGroup value={form.supplierScope} onChange={(v) => setField("supplierScope", v)}
                    options={[{ value: "any", label: "Anywhere in India" }, { value: "specific", label: "Specific locations" }]} />
                {form.supplierScope === "specific" && (
                    <Anchor k="supplierLocations">
                        <DispatchingLocationsPicker value={form.supplierLocations} onChange={(v) => setField("supplierLocations", v)} />
                        <Err msg={errors.supplierLocations} />
                    </Anchor>
                )}
            </Block>

            {/* Consumption */}
            <Block title="Is this regular consumption?">
                <ChipToggleGroup value={form.consumptionType} onChange={(v) => setField("consumptionType", v)}
                    options={[{ value: "one_time", label: "One-time" }, { value: "regular", label: "Regular" }]} />
                {form.consumptionType === "regular" && (
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <Anchor k="recurringFrequency">
                            <ChipToggleGroup label="How often?" value={form.recurringFrequency} onChange={(v) => setField("recurringFrequency", v)} options={FREQ_OPTIONS} />
                            <Err msg={errors.recurringFrequency} />
                        </Anchor>
                        <Anchor k="recurringQuantity">
                            <TextField required dense label={`Quantity per period${form.unit ? ` (${form.unit})` : ""}`} inputMode="decimal" placeholder="e.g. 200"
                                value={form.recurringQuantity} onChange={(v) => setField("recurringQuantity", v.replace(/[^\d.]/g, ""))} error={!!errors.recurringQuantity} />
                            <Err msg={errors.recurringQuantity} />
                        </Anchor>
                    </div>
                )}
            </Block>
        </div>
    );
}