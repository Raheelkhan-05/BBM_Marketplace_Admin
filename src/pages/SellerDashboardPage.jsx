// src/pages/SellerDashboardPage.jsx
import { useEffect, useState } from "react";
import {
  Loader2, Store, Eye, Building2, Camera, Package, Palette, AlertCircle, ShieldCheck,
  Plus, Pencil, X, Check, Trash2, RefreshCw, CheckCircle2, Smartphone, Monitor,
  Truck, Clock, // NEW
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import {
  fetchSellerDashboard, updateSellerProfile, updateSellerTheme,
  addSellerPhoto, deleteSellerPhoto, uploadSellerFile,
  fetchMySellerSubmissions, createSellerSubmission, updateSellerProductSubmission,
  deleteSellerProductSubmission,
  fetchApprovedCategories, fetchApprovedSubcategories, fetchApprovedGenericProducts,
  fetchSellerBankDetails, saveSellerBankDetails
} from "../utils/api.js";

import { TRANSPORT_OPTIONS } from "../../shared/transportOptions.js";
import { lookupPincode } from "../utils/sellerListingApi.js";
import ShopPage from "./ShopPage.jsx";

const TABS = [
  { key: "info", label: "Company Info", icon: Building2 },
  { key: "branding", label: "Branding", icon: Palette },
  { key: "operations", label: "Shop Settings", icon: Truck }, // NEW
];

const GST_FIELD_LABELS = { address: "Registered address", city: "City", state: "State", pincode: "PIN code", pan: "PAN" };

export default function SellerDashboardPage({ slug }) {
  const { token } = useAuth();
  const [view, setView] = useState("preview");
  const [tab, setTab] = useState("info");
  const [previewWidth, setPreviewWidth] = useState("desktop");
  const [loading, setLoading] = useState(true);
  const [editingPreviewId, setEditingPreviewId] = useState(null);
  const [dash, setDash] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Real product listings — same source used by the public shop page
  // (seller_product_submissions), not the stale dash.products field.
  const [submissions, setSubmissions] = useState(null);
  const loadSubmissions = async () => {
    const res = await fetchMySellerSubmissions(token);
    if (res?.success) setSubmissions(res.items);
  };

  const load = () => fetchSellerDashboard(token).then((res) => {
    if (res?.success) { setDash(res); setForm(res.seller); }
    setLoading(false);
  });
  useEffect(() => { if (token) { load(); loadSubmissions(); } }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  const saveInfo = async (fields) => {
    setSaving(true);
    const res = await updateSellerProfile(token, fields);
    if (res?.success) { setSaved(true); await load(); }
    setSaving(false);
  };
  const saveTheme = async (colors) => { const res = await updateSellerTheme(token, colors); if (res?.success) await load(); };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#047084]" /></div>;
  if (!dash) return null;
  const { seller } = dash;

  const fieldsToCheck = ["logo_url", "banner_url", "description", "website", "video_url"];
  const filled = fieldsToCheck.filter((f) => seller[f]).length;
  const completeness = Math.round(((6 + filled) / (6 + fieldsToCheck.length)) * 100);

  // Shape submissions exactly like getShopBySlug does for the public page,
  // but seller sees BOTH approved and pending (never rejected).
  const previewProducts = (submissions || [])
    .filter((s) => s.review_status !== "rejected")
    .map((s) => {
      const gp = s.brand?.generic_product;
      const sub = gp?.subcategory;
      const cat = sub?.category;
      return {
        id: s.id,
        name: s.brand?.name || "Product",
        brand_name: s.brand?.brand_name || null,
        image_url: s.image || s.brand?.image || null,
        price: s.price,
        unit: s.unit,
        moq: s.moq,
        lead_time: s.lead_time,
        pending_approval: s.review_status === "pending_review",
        category: cat ? { id: cat.id, name: cat.name } : null,
        subcategory: sub ? { id: sub.id, name: sub.name } : null,
        generic_product: gp ? { id: gp.id, name: gp.name } : null,
      };
    });

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#047084]" /></div>;
  if (!dash) return null;

  return (
    <div className="min-h-screen bg-slate-50/60">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
              {seller.logo_url ? <img src={seller.logo_url} className="h-full w-full object-contain p-0.5" alt="" /> : <Store className="h-4 w-4 text-slate-300" />}
            </div>
            <h1 className="text-[15px] font-extrabold text-slate-900 sm:text-[17px]">{seller.display_name}</h1>
          </div>
          <div className="flex shrink-0 rounded-full border border-slate-200 bg-slate-50 p-1">
            <button onClick={() => setView("manage")}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition sm:px-3.5 sm:text-[12.5px]"
              style={{ background: view === "manage" ? "#047084" : "transparent", color: view === "manage" ? "white" : "#64748b" }}>
              <Store className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Manage</span>
            </button>
            <button onClick={() => setView("preview")}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition sm:px-3.5 sm:text-[12.5px]"
              style={{ background: view === "preview" ? "#047084" : "transparent", color: view === "preview" ? "white" : "#64748b" }}>
              <Eye className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Live Preview</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl pt-4 sm:px-6 sm:pb-16">
        {seller.has_pending_changes && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] font-semibold text-amber-700 sm:px-4 sm:py-3 sm:text-[12.5px]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            You have changes waiting for admin review. Buyers still see your previously approved shop until they're approved.
          </div>
        )}
        {seller.status === "rejected" && seller.rejection_reason && (
          <div className="mb-4 rounded-xl border border-[#c71f11]/20 bg-[#c71f11]/[0.04] px-3.5 py-2.5 text-[12px] font-semibold text-[#c71f11] sm:px-4 sm:py-3 sm:text-[12.5px]">
            {seller.rejection_reason}
          </div>
        )}

        {view === "preview" ? (
          <div>
            <div className="mx-auto overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all"
              style={{ maxWidth: previewWidth === "mobile" ? "390px" : "100%" }}>
              <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-2">
                <span className="h-2 w-2 rounded-full bg-red-300" /><span className="h-2 w-2 rounded-full bg-amber-300" /><span className="h-2 w-2 rounded-full bg-emerald-300" />
                <span className="ml-2 text-[10.5px] font-medium text-slate-400">bbmpvtltd.com/shop/{seller.shop_slug}</span>
              </div>
              {submissions === null ? (
                <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-[#047084]" /></div>
              ) : (
                <ShopPage
                  previewData={{ seller: dash.effective, photos: dash.photos, certifications: dash.certifications, products: previewProducts }}
                  editable
                  onEditProduct={(p) => setEditingPreviewId(p.id)}
                />
              )}
            </div>

            {editingPreviewId && (
              <ProductEditModal
                item={submissions.find((s) => s.id === editingPreviewId)}
                token={token}
                onClose={() => setEditingPreviewId(null)}
                onSaved={() => { setEditingPreviewId(null); loadSubmissions(); }}
                onDeleted={() => { setEditingPreviewId(null); loadSubmissions(); }}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-5 lg:flex-row">
            {/* Tab sidebar */}
            <div className="flex shrink-0 gap-1.5 overflow-x-auto pb-1 lg:w-48 lg:flex-col lg:overflow-visible lg:pb-0">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-[13px] font-bold tracking-wide transition-colors lg:whitespace-normal"
                    style={{
                      background: active ? "#047084" : "transparent",
                      color: active ? "#fff" : "#64748b",
                    }}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className="min-w-0 flex-1 rounded-2xl border border-slate-100 bg-white p-4 sm:p-6">
              {tab === "info" && <InfoTab seller={seller} business={dash.business} email={dash.email} />}

              {tab === "branding" && <BrandingTab seller={seller} onSave={saveTheme} />}

              {tab === "operations" && (  // NEW
                <OperationsSettingsTab token={token} seller={seller} onSave={saveInfo} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function OperationsSettingsTab({ token, seller, onSave }) {
  const [form, setForm] = useState({
    working_days: seller.working_days || [],
    transport_options: seller.transport_options || [],
    order_acceptance_start: seller.order_acceptance_start || "",
    order_acceptance_end: seller.order_acceptance_end || "",
    dispatch_pincode: seller.dispatch_pincode || "",
    dispatch_district: seller.dispatch_district || "",
    dispatch_state: seller.dispatch_state || "",
  });
  const [pincodeStatus, setPincodeStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [bank, setBank] = useState({ bank_account_number: "", bank_ifsc_code: "" });
  const [bankLoaded, setBankLoaded] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [bankSaved, setBankSaved] = useState(false);
  const [bankErr, setBankErr] = useState(null);

  useEffect(() => {
    fetchSellerBankDetails(token).then((res) => {
      if (res?.success && res.bank) {
        setBank({
          bank_account_number: res.bank.account_number || "",
          bank_ifsc_code: res.bank.ifsc_code || "",
        });
      }
      setBankLoaded(true);
    });
  }, [token]);

  const update = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  const selected = form.working_days;
  const isAllWeek = WEEKDAYS.length === selected.length && WEEKDAYS.every((d) => selected.includes(d));
  const weekdaysOnly = WEEKDAYS.filter((d) => d !== "Sun");
  const isWeekdaysOnly = weekdaysOnly.length === selected.length && weekdaysOnly.every((d) => selected.includes(d));

  // Same confirm-on-blur pincode lookup as OperationsStep in onboarding.
  const confirmPincode = async (pincode) => {
    if (!/^\d{6}$/.test(pincode)) return;
    setPincodeStatus("checking");
    const res = await lookupPincode(pincode);
    if (res?.success) {
      update("dispatch_district", res.district);
      update("dispatch_state", res.state);
      setPincodeStatus("ok");
    } else {
      setPincodeStatus("error");
    }
  };

  const presetBtnClass = (active) =>
    `rounded-full border px-3 py-1 text-[12.5px] font-bold tracking-wide transition-colors ${active
      ? "border-[#047084] bg-[#047084] text-white"
      : "border-slate-200 bg-white text-slate-500 hover:border-[#047084]/40 hover:text-[#047084]"
    }`;

  const save = async () => {
    setSaving(true);
    await onSave({
      working_days: form.working_days,
      transport_options: form.transport_options,
      order_acceptance_start: form.order_acceptance_start,
      order_acceptance_end: form.order_acceptance_end,
      dispatch_pincode: form.dispatch_pincode,
      dispatch_district: form.dispatch_district,
      dispatch_state: form.dispatch_state,
    });
    setSaving(false);
    setSaved(true);
  };

  const saveBankInfo = async () => {
    setBankErr(null);
    setSavingBank(true);
    const res = await saveSellerBankDetails(token, {
      account_number: bank.bank_account_number,
      ifsc_code: bank.bank_ifsc_code,
    });
    setSavingBank(false);
    if (!res?.success) return setBankErr(res?.message || "Couldn't save bank details.");
    setBankSaved(true);
  };

  return (
    <div className="flex flex-col gap-8">
      {/* ===== Section 1: mirrors onboarding's OperationsStep exactly ===== */}

      {/* Working days — identical presets: All days / Sun off / Clear */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-slate-500">Working days</h3>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => update("working_days", [...WEEKDAYS])} className={presetBtnClass(isAllWeek)}>All days</button>
            <button type="button" onClick={() => update("working_days", weekdaysOnly)} className={presetBtnClass(isWeekdaysOnly)}>Sun off</button>
            <button type="button" onClick={() => update("working_days", [])} className={presetBtnClass(selected.length === 0)}>Clear</button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d) => {
            const active = selected.includes(d);
            return (
              <button key={d} type="button"
                onClick={() => update("working_days", active ? selected.filter((x) => x !== d) : [...selected, d])}
                className="rounded-lg border-2 px-3 py-1.5 text-[13.5px] font-bold tracking-wide"
                style={{ borderColor: active ? "#047084" : "#e5e9ea", color: active ? "#047084" : "#64748b", background: active ? "#04708410" : "white" }}>
                {d}
              </button>
            );
          })}
        </div>
      </div>

      {/* Transport channels — same field, same hint copy, same order as onboarding */}
      <div>
        <h3 className="text-[13px] font-bold uppercase tracking-wider text-slate-500">Transport channels you can service</h3>
        <p className="text-[12.5px] font-medium tracking-wide text-slate-400">
          Buyers will only be able to request methods you select here.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TRANSPORT_OPTIONS.map((t) => {
            const active = (form.transport_options || []).includes(t.key);
            return (
              <button key={t.key} type="button"
                onClick={() => update("transport_options", active
                  ? form.transport_options.filter((k) => k !== t.key)
                  : [...(form.transport_options || []), t.key])}
                className="rounded-lg border-2 px-3 py-1.5 text-[13.5px] font-bold tracking-wide"
                style={{ borderColor: active ? "#047084" : "#e5e9ea", color: active ? "#047084" : "#64748b", background: active ? "#04708410" : "white" }}>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Order acceptance hours — same two-field grid as onboarding */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[13px] font-bold uppercase tracking-wider text-slate-500">Order acceptance starts</label>
          <input type="time" value={form.order_acceptance_start || ""} onChange={(e) => update("order_acceptance_start", e.target.value)}
            className="rounded-md border-2 border-slate-200 px-3 py-2 text-[13px] font-semibold focus:border-[#047084] focus:outline-none" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[13px] font-bold uppercase tracking-wider text-slate-500">Order acceptance ends</label>
          <input type="time" value={form.order_acceptance_end || ""} onChange={(e) => update("order_acceptance_end", e.target.value)}
            className="rounded-md border-2 border-slate-200 px-3 py-2 text-[13px] font-semibold focus:border-[#047084] focus:outline-none" />
        </div>
      </div>

      {/* Dispatch pincode — same lookup + same three status messages, verbatim */}
      <div className="flex flex-col gap-1">
        <label className="text-[13px] font-bold uppercase tracking-wider text-slate-500">Dispatch pincode</label>
        <input
          value={form.dispatch_pincode || ""}
          onChange={(e) => { update("dispatch_pincode", e.target.value.replace(/\D/g, "").slice(0, 6)); setPincodeStatus(null); }}
          onBlur={(e) => confirmPincode(e.target.value)}
          inputMode="numeric"
          placeholder="6-digit pincode"
          className="w-full max-w-[200px] rounded-md border-2 border-slate-200 px-3 py-2 text-[13px] font-semibold focus:border-[#047084] focus:outline-none"
        />
        <p className="text-[12.5px] font-medium tracking-wide text-slate-400">
          Where you'll be dispatching orders from?
        </p>
        {pincodeStatus === "checking" && <p className="text-[12px] font-semibold text-slate-400">Checking…</p>}
        {pincodeStatus === "ok" && <p className="text-[12px] font-bold text-[#047084]">Dispatching from {form.dispatch_district}, {form.dispatch_state}</p>}
        {pincodeStatus === "error" && <p className="text-[12px] font-medium text-[#c71f11]">Couldn't verify this pincode — you can still continue.</p>}
        {pincodeStatus === null && form.dispatch_district && (
          <p className="text-[12px] font-medium text-slate-400">Currently: {form.dispatch_district}, {form.dispatch_state}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={saving}
          className="rounded-xl px-5 py-2.5 text-[13px] font-bold text-white" style={{ background: "linear-gradient(135deg,#047084,#0a95ab)" }}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saved && <span className="text-[12.5px] font-semibold text-emerald-600">Saved.</span>}
      </div>

      {/* ===== Section 2: mirrors onboarding's BankStep exactly ===== */}
      <div className="border-t border-slate-100 pt-6">
        <h3 className="text-[13px] font-bold uppercase tracking-wider text-slate-500">Bank details</h3>
        <p className="mt-1 text-[13px] font-medium leading-snug text-slate-500">
          This is the account where your order payouts will be sent.
        </p>
        {!bankLoaded ? (
          <div className="mt-3 flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-[#047084]" /></div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:max-w-sm">
            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-bold uppercase tracking-wider text-slate-500">Account number</label>
              <input value={bank.bank_account_number} inputMode="numeric"
                onChange={(e) => { setBank((b) => ({ ...b, bank_account_number: e.target.value.replace(/\D/g, "") })); setBankSaved(false); }}
                className="rounded-md border-2 border-slate-200 px-3 py-2 text-[13px] font-semibold focus:border-[#047084] focus:outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-bold uppercase tracking-wider text-slate-500">IFSC code</label>
              <input value={bank.bank_ifsc_code} placeholder="e.g. HDFC0001234"
                onChange={(e) => { setBank((b) => ({ ...b, bank_ifsc_code: e.target.value.toUpperCase() })); setBankSaved(false); }}
                className="rounded-md border-2 border-slate-200 px-3 py-2 text-[13px] font-semibold focus:border-[#047084] focus:outline-none" />
            </div>
            {bankErr && <p className="text-[12px] font-semibold text-[#c71f11]">{bankErr}</p>}
            <div className="flex items-center gap-3">
              <button onClick={saveBankInfo} disabled={savingBank}
                className="w-fit rounded-xl px-5 py-2.5 text-[13px] font-bold text-white" style={{ background: "linear-gradient(135deg,#047084,#0a95ab)" }}>
                {savingBank ? "Saving…" : "Save bank details"}
              </button>
              {bankSaved && <span className="text-[12.5px] font-semibold text-emerald-600">Saved.</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoTab({ seller, business, email }) {
  const gstData = business ? mapBusinessToDisplay(business) : null;

  const contactRows = [
    ["Contact person", seller.contact_person],
    ["Contact number", seller.whatsapp_number ? `+91 ${seller.whatsapp_number}` : null],
    ["Email", email],
  ].filter(([, v]) => v);


  return (
    <div className="flex flex-col gap-6">
      <GstReferencePanel gstData={gstData} />

      {contactRows.length > 0 && (
        <div className="rounded-xl border border-[#7fb3bd]/40 bg-[#047084]/[0.04] p-4">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-[#047084]" />
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#047084]">Contact details</p>
          </div>
          <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {contactRows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 border-b border-[#047084]/10 py-1.5 text-[12px]">
                <span className="font-semibold text-slate-500">{label}</span>
                <span className="max-w-[60%] text-right font-bold text-slate-800">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// business_profiles row already matches the mapGstResponse() shape from your API layer,
// so this is just a passthrough — kept as a named function in case the raw row and the
// mapped shape ever diverge (e.g. nature_of_business stored differently).
function mapBusinessToDisplay(business) {
  return {
    legal_name: business.legal_name,
    trade_name: business.trade_name,
    gstin_status: business.gstin_status ?? business.status,
    constitution: business.constitution,
    taxpayer_type: business.taxpayer_type,
    gst_registration_date: business.gst_registration_date ?? business.registration_date,
    gst_last_updated: business.gst_last_updated ?? business.last_updated,
    registered_address: business.registered_address ?? business.address,
    district: business.district,
    pincode: business.pincode,
    state: business.state,
    state_code: business.state_code,
    pan: business.pan,
    nature_of_business: business.nature_of_business,
  };
}

function MediaTab({ token, dash, onChange }) {
  const CATS = [
    { key: "office", label: "Office" }, { key: "factory", label: "Factory" },
    { key: "warehouse", label: "Warehouse" }, { key: "team", label: "Team" }, { key: "product", label: "Products" },
  ];
  const handleUpload = async (cat, file) => {
    const up = await uploadSellerFile(token, file, `photos/${cat}`);
    if (up?.success) { await addSellerPhoto(token, cat, up.url); onChange(); }
  };
  const removePhoto = async (id) => { await deleteSellerPhoto(token, id); onChange(); };

  return (
    <div className="flex flex-col gap-6">
      {CATS.map((c) => {
        const imgs = dash.photos.filter((p) => p.category === c.key);
        return (
          <div key={c.key}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{c.label}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {imgs.map((p) => (
                <div key={p.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200">
                  <img src={p.url} className="h-full w-full object-cover" alt="" />
                  {p.pending && <span className="absolute left-0.5 top-0.5 rounded bg-amber-500 px-1 text-[9px] font-bold text-white">Pending</span>}
                  <button onClick={() => removePhoto(p.id)} className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white text-[10px]">✕</button>
                </div>
              ))}
              <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-slate-300 hover:border-[#7fb3bd] hover:text-[#047084]">
                +
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(c.key, f); e.target.value = ""; }} />
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProductEditModal({ item, token, onClose, onSaved, onDeleted }) {
  const [price, setPrice] = useState(item.price);
  const [moq, setMoq] = useState(item.moq);
  const [unit, setUnit] = useState(item.unit);
  const [leadTime, setLeadTime] = useState(item.lead_time);
  const [image, setImage] = useState(item.image);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState(null);

  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const res = await uploadSellerFile(token, file, "products");
    if (res?.success) setImage(res.url);
    setUploading(false);
  };

  const save = async () => {
    setErr(null); setSaving(true);
    const res = await updateSellerProductSubmission(token, item.id, { price, moq, unit, leadTime, image });
    setSaving(false);
    if (!res?.success) return setErr(res?.message || "Couldn't save changes.");
    onSaved();
  };

  const remove = async () => {
    setDeleting(true);
    const res = await deleteSellerProductSubmission(token, item.id);
    setDeleting(false);
    if (res?.success) onDeleted();
    else setErr(res?.message || "Couldn't delete listing.");
  };

  return (
    <div className="fixed inset-0 z-[99] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-extrabold text-slate-900">{item.brand?.name || item.name}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-1 text-[11.5px] font-medium text-slate-400">Editing sends this listing back for admin review.</p>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <LabeledInput label="Price" value={price} onChange={setPrice} type="number" />
          <LabeledInput label="MOQ" value={moq} onChange={setMoq} type="number" />
          <LabeledInput label="Unit" value={unit} onChange={setUnit} />
          <LabeledInput label="Lead time (days)" value={leadTime} onChange={setLeadTime} type="number" />
        </div>

        {/* <div className="mt-3 flex items-center gap-2">
          <img src={image} alt="" className="h-10 w-10 rounded-lg border border-slate-200 object-cover" />
          <label className="cursor-pointer rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11.5px] font-bold text-slate-600">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Replace image"}
            <input type="file" accept="image/*" onChange={handleImage} className="hidden" />
          </label>
        </div> */}

        {err && <p className="mt-2.5 text-[11.5px] font-semibold text-[#c71f11]">{err}</p>}

        {!confirmDelete ? (
          <div className="mt-5 flex items-center justify-between">
            <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1 text-[12px] font-bold text-[#c71f11]">
              <Trash2 className="h-3.5 w-3.5" /> Delete listing
            </button>
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-white" style={{ background: "linear-gradient(135deg,#0a95ab,#047084)" }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4" /> Save</>}
            </button>
          </div>
        ) : (
          <div className="mt-5 flex items-center justify-between rounded-lg bg-[#c71f11]/[0.05] px-3 py-2.5">
            <p className="text-[12px] font-semibold text-[#c71f11]">Remove this listing?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="rounded-lg px-2.5 py-1 text-[12px] font-bold text-slate-500">Cancel</button>
              <button onClick={remove} disabled={deleting} className="rounded-lg bg-[#c71f11] px-2.5 py-1 text-[12px] font-bold text-white">
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Delete"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_STYLES = {
  approved: { label: "Live", color: "#047084", bg: "#04708414" },
  pending_review: { label: "Pending review", color: "#b45309", bg: "#fef3c7" },
  rejected: { label: "Rejected", color: "#c71f11", bg: "#fee2e2" },
};

function ProductsTab({ token, items, onChange }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);

  if (items === null) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#047084]" /></div>;

  return (
    <div className="flex flex-col gap-5">
      {!showAdd ? (
        <button onClick={() => setShowAdd(true)}
          className="flex w-fit items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white"
          style={{ background: "linear-gradient(135deg,#d2462b,#c71f11)" }}>
          <Plus className="h-4 w-4" /> List a product
        </button>
      ) : (
        <AddProductForm token={token} onCancel={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); onChange(); }} />
      )}

      {items.length === 0 ? (
        <p className="py-6 text-center text-[13px] font-medium text-slate-400">You haven't listed any products yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((it) => (
            <ProductRow
              key={it.id}
              item={it}
              token={token}
              editing={editingId === it.id}
              onEdit={() => setEditingId(it.id)}
              onCancel={() => setEditingId(null)}
              onSaved={() => { setEditingId(null); onChange(); }}
              onDeleted={onChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AddProductForm({ token, onCancel, onCreated }) {
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [genericProducts, setGenericProducts] = useState([]);

  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [genericProductId, setGenericProductId] = useState("");

  const [productName, setProductName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [price, setPrice] = useState("");
  const [moq, setMoq] = useState("");
  const [unit, setUnit] = useState("");
  const [leadTime, setLeadTime] = useState("");
  const [image, setImage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => { fetchApprovedCategories("").then((r) => setCategories(r?.items || [])); }, []);
  useEffect(() => {
    setSubcategoryId(""); setSubcategories([]);
    setGenericProductId(""); setGenericProducts([]);
    if (categoryId) fetchApprovedSubcategories(categoryId, "").then((r) => setSubcategories(r?.items || []));
  }, [categoryId]);
  useEffect(() => {
    setGenericProductId(""); setGenericProducts([]);
    if (subcategoryId) fetchApprovedGenericProducts(subcategoryId, "").then((r) => setGenericProducts(r?.items || []));
  }, [subcategoryId]);

  const uploadImage = async (file) => {
    setUploading(true);
    const up = await uploadSellerFile(token, file, "products");
    if (up?.success) setImage(up.url);
    setUploading(false);
  };

  const submit = async () => {
    setErr(null);
    if (!genericProductId) return setErr("Please select category, subcategory and product.");
    setSaving(true);
    const res = await createSellerSubmission(token, {
      genericProductId, productName, brandName, price, moq, unit, leadTime, image,
    });
    setSaving(false);
    if (!res?.success) return setErr(res?.message || "Couldn't submit.");
    onCreated();
  };

  return (
    <div className="rounded-xl border border-dashed border-slate-200 p-4">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">List a new product</p>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <PickerSelect label="Category" value={categoryId} onChange={setCategoryId} options={categories} />
        <PickerSelect label="Subcategory" value={subcategoryId} onChange={setSubcategoryId} options={subcategories} disabled={!categoryId} />
        <PickerSelect label="Product type" value={genericProductId} onChange={setGenericProductId} options={genericProducts} disabled={!subcategoryId} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <LabeledInput label="Product name" value={productName} onChange={setProductName} />
        <LabeledInput label="Brand name" value={brandName} onChange={setBrandName} />
        <LabeledInput label="Price" value={price} onChange={setPrice} type="number" />
        <LabeledInput label="MOQ" value={moq} onChange={setMoq} type="number" />
        <LabeledInput label="Unit" value={unit} onChange={setUnit} placeholder="e.g. Kg, Pieces" />
        {/* <LabeledInput label="Lead time" value={leadTime} onChange={setLeadTime} placeholder="e.g. 7-10 days" /> */}
        <LabeledInput label="Lead time (days)" value={leadTime} onChange={setLeadTime} type="number" placeholder="e.g. 7" />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <label className="flex h-14 w-14 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-slate-200 text-slate-300">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : image ? <img src={image} className="h-full w-full object-cover" alt="" /> : "img"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); }} />
        </label>
        <span className="text-[11px] font-medium text-slate-400">Product image, required</span>
      </div>

      {err && <p className="mt-2.5 text-[12px] font-semibold text-[#c71f11]">{err}</p>}

      <div className="mt-3 flex gap-2">
        <button onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-[12.5px] font-bold text-slate-500">Cancel</button>
        <button onClick={submit} disabled={saving}
          className="rounded-xl px-4 py-2 text-[12.5px] font-bold text-white" style={{ background: "linear-gradient(135deg,#0a95ab,#047084)" }}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit for review"}
        </button>
      </div>
    </div>
  );
}

function PickerSelect({ label, value, onChange, options, disabled }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className="rounded-md border-2 border-slate-200 px-2.5 py-2 text-[13px] font-semibold text-slate-700 focus:border-[#047084] focus:outline-none disabled:bg-slate-50 disabled:text-slate-300">
        <option value="">Select…</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}

function ProductRow({ item, token, editing, onEdit, onCancel, onSaved }) {
  const gp = item.generic_product;
  const sub = gp?.subcategory;
  const cat = sub?.category;
  const status = STATUS_STYLES[item.review_status] || STATUS_STYLES.pending_review;

  const [price, setPrice] = useState(item.price);
  const [moq, setMoq] = useState(item.moq);
  const [unit, setUnit] = useState(item.unit);
  const [leadTime, setLeadTime] = useState(item.lead_time);
  const [image, setImage] = useState(item.image);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState(null);

  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const res = await uploadSellerFile(token, file, "products");
    if (res?.success) setImage(res.url);
    setUploading(false);
  };

  const save = async () => {
    setErr(null); setSaving(true);
    const res = await updateSellerProductSubmission(token, item.id, { price, moq, unit, leadTime, image });
    setSaving(false);
    if (!res?.success) return setErr(res?.message || "Couldn't save changes.");
    onSaved();
  };

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <img src={image || item.generic_product_brand?.image} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-slate-100 object-cover" />
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
              {cat?.name}{sub?.name && ` › ${sub.name}`}{gp?.name && ` › ${gp.name}`}
            </p>
            <p className="text-[13.5px] font-extrabold text-slate-900">{item.brand?.name}</p>
            {item.brand?.brand_name && <p className="text-[11.5px] font-semibold text-slate-500">{item.brand.brand_name}</p>}
            <span className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: status.bg, color: status.color }}>
              {item.review_status === "pending_review" && <Clock className="h-2.5 w-2.5" />}
              {item.review_status === "rejected" && <AlertCircle className="h-2.5 w-2.5" />}
              {status.label}
            </span>
            {item.review_status === "rejected" && item.rejection_reason && (
              <p className="mt-1 text-[11px] font-medium text-[#c71f11]">{item.rejection_reason}</p>
            )}
          </div>
        </div>
        {!editing && (
          <button onClick={onEdit} className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11.5px] font-bold text-slate-600">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        )}
      </div>

      {!editing ? (
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-semibold text-slate-500">
          <span>₹{item.price} / {item.unit}</span>
          <span>MOQ: {item.moq} {item.unit}</span>
          <span>Lead time: {item.lead_time}</span>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2.5 border-t border-slate-100 pt-3">
          <p className="text-[11px] font-medium text-slate-400">Editing sends this listing back for admin review.</p>
          <div className="grid grid-cols-2 gap-2.5">
            <LabeledInput label="Price" value={price} onChange={setPrice} type="number" />
            <LabeledInput label="MOQ" value={moq} onChange={setMoq} type="number" />
            <LabeledInput label="Unit" value={unit} onChange={setUnit} />
            <LabeledInput label="Lead time" value={leadTime} onChange={setLeadTime} />
          </div>
          <div className="flex items-center gap-2">
            <img src={image} alt="" className="h-10 w-10 rounded-lg border border-slate-200 object-cover" />
            <label className="cursor-pointer rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11.5px] font-bold text-slate-600">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Replace image"}
              <input type="file" accept="image/*" onChange={handleImage} className="hidden" />
            </label>
          </div>
          {err && <p className="text-[11.5px] font-semibold text-[#c71f11]">{err}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onCancel} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-bold text-slate-500"><X className="h-3.5 w-3.5" /> Cancel</button>
            <button onClick={save} disabled={saving} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-bold text-white" style={{ background: "linear-gradient(135deg,#0a95ab,#047084)" }}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Check className="h-3.5 w-3.5" /> Save</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LabeledInput({ label, value, onChange, type = "text", placeholder }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border-2 border-slate-200 px-2.5 py-1.5 text-[13px] font-semibold text-slate-800 focus:border-[#047084] focus:outline-none" />
    </label>
  );
}

const SWATCHES = ["#047084", "#d2462b", "#7c3aed", "#16a34a", "#c026d3", "#0891b2", "#ea580c", "#1d4ed8"];
function BrandingTab({ seller, onSave }) {
  const [primary, setPrimary] = useState(seller.primary_color);
  const [secondary, setSecondary] = useState(seller.secondary_color);
  const dirty = primary !== seller.primary_color || secondary !== seller.secondary_color;

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex flex-1 flex-col gap-5">
        <p className="text-[12px] font-medium text-slate-500">Theme changes apply instantly — no approval needed.</p>
        {[["Primary color", primary, setPrimary], ["Secondary color", secondary, setSecondary]].map(([label, val, setter]) => (
          <div key={label} className="flex flex-col gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</label>
            <div className="grid grid-cols-5 gap-2 sm:flex sm:flex-wrap sm:items-center">
              {SWATCHES.map((c) => (
                <button key={c} onClick={() => setter(c)}
                  className="h-9 w-9 rounded-full border-2 transition-transform active:scale-95"
                  style={{ background: c, borderColor: val === c ? "#0f172a" : "transparent" }} />
              ))}
              <input type="color" value={val} onChange={(e) => setter(e.target.value)} className="h-9 w-9 rounded-full border border-slate-200" />
            </div>
          </div>
        ))}
        <button onClick={() => onSave({ primary_color: primary, secondary_color: secondary })} disabled={!dirty}
          className="w-fit rounded-xl px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-40" style={{ background: "linear-gradient(135deg,#047084,#0a95ab)" }}>
          Update theme
        </button>
      </div>

      {/* Live mini preview so the seller sees the effect before/without leaving the tab */}
      <div className="w-full lg:w-64">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Preview</p>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="h-16" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }} />
          <div className="flex items-center gap-2 bg-white p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white font-extrabold" style={{ background: primary }}>
              {(seller.display_name || "S")[0]}
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] font-extrabold text-slate-900">{seller.display_name || "Your Shop"}</p>
              <button className="mt-0.5 rounded-md px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: secondary }}>Contact Supplier</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


function GstReferencePanel({ gstData }) {
  if (!gstData) return null;
  const rows = [
    ["Legal name", gstData.legal_name],
    ["Trade name", gstData.trade_name],
    ["GSTIN status", gstData.gstin_status],
    ["Constitution", gstData.constitution],
    ["Taxpayer type", gstData.taxpayer_type],
    ["GST registration date", gstData.gst_registration_date],
    ["GST last updated", gstData.gst_last_updated],
    ["Registered address", gstData.registered_address],
    ["District", gstData.district],
    ["Pincode", gstData.pincode],
    ["State", gstData.state],
    ["State code", gstData.state_code],
    ["PAN (GST record)", gstData.pan],
    ["Nature of business", Array.isArray(gstData.nature_of_business) ? gstData.nature_of_business.join(", ") : gstData.nature_of_business],
  ].filter(([, v]) => v);

  return (
    <div className="rounded-xl border border-[#7fb3bd]/40 bg-[#047084]/[0.04] p-4">
      <div className="flex items-center gap-1.5">
        <ShieldCheck className="h-4 w-4 text-[#047084]" />
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#047084]">GST registered details (reference only)</p>
      </div>
      <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-[#047084]/10 py-1.5 text-[12px]">
            <span className="font-semibold text-slate-500">{label}</span>
            <span className="max-w-[60%] text-right font-bold text-slate-800">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}