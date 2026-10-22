// src/pages/SellerStorePage.jsx
// Route: /seller/store
// Shows ONLY what the seller filled in during onboarding, and lets them edit it in place.
//   1. GST registration  – read-only (comes from the GST record)
//   2. Contact           – contact person editable; contact number + email read-only
//   3. Operations        – working days, transport, order hours, dispatch pincode
//   4. Bank details
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, ShieldCheck, User, Truck, Landmark, Check, Link2, Copy, Share2, ExternalLink } from "lucide-react";
import {
    fetchSellerDashboard, updateSellerProfile,
    fetchSellerBankDetails, saveSellerBankDetails, uploadSellerFile,
} from "../utils/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { TRANSPORT_OPTIONS } from "../../shared/transportOptions.js";
import { lookupPincode } from "../utils/sellerListingApi.js";
import { SectionCard, TextField, Label, Pill, C } from "../components/seller/listingForm/FormPrimitives.jsx";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* ---------- shared bits ---------- */

async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
    try {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
    } catch { return false; }
}

function ShareStoreButton({ seller }) {
    const [copied, setCopied] = useState(false);
    const slug = seller.shop_slug;
    if (!slug) return null;

    const link = `${window.location.origin}/home/?shop=${encodeURIComponent(slug)}`;

    const onClick = async () => {
        // Start the copy and the share in the same tick. Some browsers (Safari especially)
        // only allow the share sheet right after a tap, so we must not await the copy first.
        const copyPromise = copyText(link);

        if (typeof navigator !== "undefined" && navigator.share) {
            try {
                await navigator.share({ title: seller.display_name || "Our store", text: "Browse our products", url: link });
            } catch { /* share sheet dismissed */ }
        }

        if (await copyPromise) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <button
            type="button"
            onClick={onClick}
            aria-label="Copy and share store link"
            title="Copy and share store link"
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-bold tracking-wide text-white transition-transform active:scale-95"
            style={{ background: "#000" }}
        >
            {copied ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Share2 className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Share"}
        </button>
    );
}

function SaveBar({ dirty, saving, saved, error, onSave, label = "Save changes" }) {
    return (
        <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
                type="button"
                onClick={onSave}
                disabled={!dirty || saving}
                className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13.5px] font-bold tracking-wide text-white transition-opacity disabled:opacity-30"
                style={{ background: "#000" }}
            >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {saving ? "Saving…" : label}
            </button>
            {saved && !dirty && (
                <span className="flex items-center gap-1 text-[13px] font-bold" style={{ color: "#15803d" }}>
                    <Check className="h-3.5 w-3.5" strokeWidth={3} /> Saved
                </span>
            )}
            {error && <span className="text-[13px] font-semibold" style={{ color: C.danger }}>{error}</span>}
        </div>
    );
}

function MultiChips({ label, hint, value, onChange, options }) {
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label hint={hint}>{label}</Label>
            <div className="flex flex-wrap gap-1.5">
                {options.map((o) => {
                    const v = o.value ?? o;
                    const active = value.includes(v);
                    return (
                        <button
                            key={v}
                            type="button"
                            onClick={() => onChange(active ? value.filter((x) => x !== v) : [...value, v])}
                            className="rounded-full border px-3 py-1.5 text-[13px] font-bold tracking-wide transition-colors duration-150"
                            style={active
                                ? { borderColor: "#000", background: "#000", color: "#fff" }
                                : { borderColor: C.hair, background: "#fff", color: C.muted }}
                        >
                            {o.label ?? o}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function ReadRow({ label, value }) {
    return (
        <div className="flex flex-col gap-0.5 border-b py-2 sm:flex-row sm:justify-between sm:gap-4" style={{ borderColor: C.hairSoft }}>
            <span className="text-[13px] font-semibold" style={{ color: C.muted }}>{label}</span>
            <span className="break-words text-[14px] font-bold sm:max-w-[60%] sm:text-right" style={{ color: C.ink }}>{value}</span>
        </div>
    );
}

/* ---------- sections ---------- */

function GstSection({ business }) {
    const b = business || {};
    const nature = Array.isArray(b.nature_of_business) ? b.nature_of_business.join(", ") : b.nature_of_business;
    const rows = [
        ["Legal name", b.legal_name],
        ["Trade name", b.trade_name],
        ["GSTIN status", b.gstin_status ?? b.status],
        ["Constitution", b.constitution],
        ["Taxpayer type", b.taxpayer_type],
        ["Registration date", b.gst_registration_date ?? b.registration_date],
        ["Registered address", b.registered_address ?? b.address],
        ["District", b.district],
        ["State", b.state],
        ["Pincode", b.pincode],
        ["PAN", b.pan],
        ["Nature of business", nature],
    ].filter(([, v]) => v);

    return (
        <SectionCard
            icon={ShieldCheck}
            title="GST registration"
            subtitle="Taken from your GST record"
            headerRight={<Pill>Read only</Pill>}
        >
            {rows.length ? rows.map(([l, v]) => <ReadRow key={l} label={l} value={v} />)
                : <p className="text-[13.5px] font-medium" style={{ color: C.muted }}>No GST details on file.</p>}
        </SectionCard>
    );
}

function ContactSection({ seller, email, token, onSaved }) {
    const initial = seller.contact_person || "";
    const initialLogo = seller.logo_url || "";
    const [person, setPerson] = useState(initial);
    const [logo, setLogo] = useState(initialLogo);
    const [logoBusy, setLogoBusy] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState(null);
    const dirty = (person !== initial || logo !== initialLogo) && !logoBusy;

    const pickLogo = async (file) => {
        if (!file) return;
        if (!file.type?.startsWith("image/")) return setError("Please choose an image file.");
        setError(null);
        setLogoBusy(true);
        try {
            const r = await uploadSellerFile(token, file, "logo");
            if (r?.success) { setLogo(r.url); setSaved(false); }
            else setError(r?.message || "Logo upload failed. Try again.");
        } catch {
            setError("Logo upload failed. Try again.");
        } finally {
            setLogoBusy(false);
        }
    };

    const save = async () => {
        setError(null);
        if (!person.trim()) return setError("Contact person can't be empty.");
        setSaving(true);
        const res = await updateSellerProfile(token, { contact_person: person.trim(), logo_url: logo || null });
        setSaving(false);
        if (!res?.success) return setError(res?.message || "Couldn't save changes.");
        setSaved(true);
        onSaved();
    };

    const letter = (seller.display_name || "S").trim()[0]?.toUpperCase();

    return (
        <SectionCard icon={User} title="Contact" subtitle="Who buyers and our team reach out to">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField label="Contact person" value={person} onChange={(v) => { setPerson(v); setSaved(false); }} />
                <TextField
                    label="Contact number"
                    value={seller.whatsapp_number ? `+91 ${seller.whatsapp_number}` : ""}
                    disabled
                    hint="Your contact number can't be changed."
                />
                <TextField label="Email" value={email || ""} disabled hint="Your login email can't be changed here." />
            </div>

            <div className="flex flex-col gap-1.5">
                <Label hint="Optional. Shown on your shop.">Company logo</Label>
                <div className="flex flex-wrap items-center gap-3">
                    <div
                        className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white text-[20px] font-extrabold"
                        style={{ borderColor: C.hair, color: C.muted }}
                    >
                        {logo ? <img src={logo} alt="Company logo" className="h-full w-full object-contain" /> : letter}
                    </div>
                    <label
                        className="cursor-pointer rounded-lg border px-3 py-2 text-[13px] font-bold tracking-wide"
                        style={{ borderColor: C.hair, color: C.ink, opacity: logoBusy ? 0.5 : 1 }}
                    >
                        {logoBusy ? "Uploading…" : logo ? "Replace logo" : "Add logo"}
                        <input
                            type="file"
                            accept="image/*"
                            hidden
                            disabled={logoBusy}
                            onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ""; }}
                        />
                    </label>
                    {logo && !logoBusy && (
                        <button
                            type="button"
                            onClick={() => { setLogo(""); setSaved(false); }}
                            className="text-[13px] font-bold"
                            style={{ color: C.danger }}
                        >
                            Remove
                        </button>
                    )}
                </div>
            </div>

            <SaveBar dirty={dirty} saving={saving} saved={saved} error={error} onSave={save} />
        </SectionCard>
    );
}

function OperationsSection({ seller, token, onSaved }) {
    const init = () => ({
        working_days: seller.working_days || [],
        transport_options: seller.transport_options || [],
        order_acceptance_start: seller.order_acceptance_start || "",
        order_acceptance_end: seller.order_acceptance_end || "",
        dispatch_pincode: seller.dispatch_pincode || "",
        dispatch_district: seller.dispatch_district || "",
        dispatch_state: seller.dispatch_state || "",
    });
    const [f, setF] = useState(init);
    const [base, setBase] = useState(init);
    const [pin, setPin] = useState(null); // null | checking | ok | error
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState(null);
    const dirty = JSON.stringify(f) !== JSON.stringify(base);
    const set = (patch) => { setF((p) => ({ ...p, ...patch })); setSaved(false); };

    const checkPin = async (pincode) => {
        if (!/^\d{6}$/.test(pincode)) return;
        setPin("checking");
        const res = await lookupPincode(pincode);
        if (res?.success) { set({ dispatch_district: res.district, dispatch_state: res.state }); setPin("ok"); }
        else setPin("error");
    };

    const save = async () => {
        setError(null);
        setSaving(true);
        const res = await updateSellerProfile(token, f);
        setSaving(false);
        if (!res?.success) return setError(res?.message || "Couldn't save changes.");
        setBase(f);
        setSaved(true);
        onSaved();
    };

    const timeCls = "w-full rounded-lg border bg-white px-3 py-2 text-[14.5px] font-bold tracking-wide focus:outline-none focus:ring-2";
    const timeStyle = { color: C.ink, borderColor: C.hair, ["--tw-ring-color"]: `${C.secondary}22` };

    return (
        <SectionCard icon={Truck} title="Operations" subtitle="Working days, transport and dispatch">
            <MultiChips
                label="Working days"
                value={f.working_days}
                onChange={(v) => set({ working_days: WEEKDAYS.filter((d) => v.includes(d)) })}
                options={WEEKDAYS}
            />
            <MultiChips
                label="Transport channels you can service"
                hint="Buyers can only request the methods you select here."
                value={f.transport_options}
                onChange={(v) => set({ transport_options: v })}
                options={TRANSPORT_OPTIONS.map((t) => ({ value: t.key, label: t.label }))}
            />
            <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                    <Label>Orders accepted from</Label>
                    <input type="time" value={f.order_acceptance_start} onChange={(e) => set({ order_acceptance_start: e.target.value })} className={timeCls} style={timeStyle} />
                </div>
                <div className="flex flex-col gap-1">
                    <Label>Orders accepted until</Label>
                    <input type="time" value={f.order_acceptance_end} onChange={(e) => set({ order_acceptance_end: e.target.value })} className={timeCls} style={timeStyle} />
                </div>
            </div>
            <div className="flex flex-col gap-1">
                <div className="max-w-[220px]">
                    <TextField
                        label="Dispatch pincode"
                        value={f.dispatch_pincode}
                        inputMode="numeric"
                        placeholder="6-digit pincode"
                        onChange={(v) => { set({ dispatch_pincode: v.replace(/\D/g, "").slice(0, 6) }); setPin(null); }}
                        onBlur={() => checkPin(f.dispatch_pincode)}
                    />
                </div>
                {pin === "checking" && <p className="text-[13px] font-semibold" style={{ color: C.muted }}>Checking…</p>}
                {pin === "ok" && <p className="text-[13px] font-bold" style={{ color: "#15803d" }}>Dispatching from {f.dispatch_district}, {f.dispatch_state}</p>}
                {pin === "error" && <p className="text-[13px] font-medium" style={{ color: C.danger }}>Couldn't verify this pincode. Check it and try again.</p>}
                {pin === null && f.dispatch_district && (
                    <p className="text-[13px] font-medium" style={{ color: C.muted }}>Currently: {f.dispatch_district}, {f.dispatch_state}</p>
                )}
            </div>
            <SaveBar dirty={dirty} saving={saving} saved={saved} error={error} onSave={save} />
        </SectionCard>
    );
}

function BankSection({ token }) {
    const [f, setF] = useState({ account_number: "", ifsc_code: "" });
    const [base, setBase] = useState(f);
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState(null);
    const dirty = f.account_number !== base.account_number || f.ifsc_code !== base.ifsc_code;

    useEffect(() => {
        fetchSellerBankDetails(token).then((res) => {
            if (res?.success && res.bank) {
                const b = { account_number: res.bank.account_number || "", ifsc_code: res.bank.ifsc_code || "" };
                setF(b); setBase(b);
            }
            setLoaded(true);
        });
    }, [token]);

    const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setSaved(false); };

    const save = async () => {
        setError(null);
        setSaving(true);
        const res = await saveSellerBankDetails(token, f);
        setSaving(false);
        if (!res?.success) return setError(res?.message || "Couldn't save bank details.");
        setBase(f);
        setSaved(true);
    };

    return (
        <SectionCard icon={Landmark} title="Bank details" subtitle="Where your order payouts are sent">
            {!loaded ? (
                <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" style={{ color: C.muted }} /></div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <TextField label="Account number" value={f.account_number} inputMode="numeric" onChange={(v) => set("account_number", v.replace(/\D/g, ""))} />
                        <TextField label="IFSC code" value={f.ifsc_code} placeholder="e.g. HDFC0001234" onChange={(v) => set("ifsc_code", v.toUpperCase())} />
                    </div>
                    <SaveBar dirty={dirty} saving={saving} saved={saved} error={error} onSave={save} label="Save bank details" />
                </>
            )}
        </SectionCard>
    );
}

/* ---------- page ---------- */

export default function SellerStorePage() {
    const { isLoggedIn, profile, token } = useAuth();
    const [dash, setDash] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = () =>
        fetchSellerDashboard(token).then((res) => {
            if (res?.success) setDash(res);
            setLoading(false);
        });

    const isApprovedSeller = isLoggedIn && profile?.seller_status === "approved";
    useEffect(() => { if (token && isApprovedSeller) load(); }, [token, isApprovedSeller]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isLoggedIn && !token) return <Navigate to="/login" replace />;
    if (isLoggedIn && !profile) return <Spinner />;
    if (!isApprovedSeller) return <Navigate to="/" replace />;
    if (loading) return <Spinner />;
    if (!dash) return null;

    const { seller, business, email } = dash;

    return (
        <div className="min-h-screen">
            <div className="mx-auto flex max-w-4xl flex-col gap-3 px-3 py-6 sm:px-4 sm:py-10">
                <header className="mb-2 flex items-center justify-between gap-3 px-1">
                    <h1 className="min-w-0 truncate text-[22px] font-extrabold tracking-wide" style={{ color: C.ink }}>
                        {seller.display_name || "Your store"}
                    </h1>
                    <ShareStoreButton seller={seller} />
                </header>
                {/* <ShareStoreSection seller={seller} /> */}
                <GstSection business={business} />
                <ContactSection seller={seller} email={email} token={token} onSaved={load} />
                <OperationsSection seller={seller} token={token} onSaved={load} />
                <BankSection token={token} />
            </div>
        </div>
    );
}

function Spinner() {
    return (
        <div className="flex min-h-[60vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: C.muted }} />
        </div>
    );
}