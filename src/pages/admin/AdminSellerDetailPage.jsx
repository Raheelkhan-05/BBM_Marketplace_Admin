import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, CheckCircle2, XCircle, ArrowLeft, Save, Award, FileText, ShieldCheck } from "lucide-react";
import { Image as ImageIcon, X as XIcon } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { adminGetSeller, adminUpdateSeller, adminApproveSeller, adminRejectSeller } from "../../utils/api.js";


const SECTIONS = [
  { title: "Basics", fields: ["display_name", "business_type", "industry", "year_established", "employee_range", "annual_turnover"] },
  { title: "Contact", fields: ["contact_person", "designation", "whatsapp_number", "website"] },
  { title: "Dispatch / operating address", fields: ["address", "pincode", "city", "state", "country"] },
  { title: "Credentials", fields: ["pan", "iec_code", "udyam_number", "cin"] },
  { title: "Operations", fields: ["manufacturing_facility", "production_capacity"] },
  { title: "Digital Presence", fields: ["linkedin_url", "facebook_url", "instagram_url", "youtube_url"] },
];

export default function AdminSellerDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [lightbox, setLightbox] = useState(null);

  const [seller, setSeller] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // inside the component, after the state hooks:
  const [business, setBusiness] = useState(null);

  useEffect(() => {
    if (!token) return;
    adminGetSeller(token, id).then((res) => {
      if (res?.success) {
        setSeller(res.seller); setForm(res.seller);
        setPhotos(res.photos); setCertifications(res.certifications); setProducts(res.products || []);
        setBusiness(res.business);
      }
      setLoading(false);
    });
  }, [id, token]);

  useEffect(() => {
    if (!token) return;
    adminGetSeller(token, id).then((res) => {
      if (res?.success) {
        setSeller(res.seller); setForm(res.seller);
        setPhotos(res.photos); setCertifications(res.certifications); setProducts(res.products || []);
      }
      setLoading(false);
    });
  }, [id, token]);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const res = await adminUpdateSeller(token, id, form);
    if (res?.success) setSeller(res.seller);
    setSaving(false);
  };
  const handleApprove = async () => {
    setActionLoading(true);
    const res = await adminApproveSeller(token, id);
    if (res?.success) setSeller(res.seller);
    setActionLoading(false);
  };
  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setActionLoading(true);
    const res = await adminRejectSeller(token, id, rejectReason);
    if (res?.success) { setSeller(res.seller); setRejectOpen(false); }
    setActionLoading(false);
  };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#047084]" /></div>;
  if (!seller) return <p className="py-16 text-center text-slate-400">Seller not found.</p>;

  const hasReviewable = seller.status === "pending_review" || (seller.status === "approved" && seller.has_pending_changes);
  const pendingPhotos = photos.filter((p) => p.pending);
  const pendingCerts = certifications.filter((c) => c.pending);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
      <button onClick={() => navigate("/sellers")} className="flex items-center gap-1.5 text-[13px] font-bold text-slate-500">
        <ArrowLeft className="h-4 w-4" /> Back to list
      </button>

      <div className="mt-3 flex items-center gap-3">
        <button onClick={() => seller.logo_url && setLightbox({ url: seller.logo_url, label: "Logo" })}
          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
          {seller.logo_url && <img src={seller.logo_url} alt="" className="h-full w-full object-contain p-1" />}
        </button>
        <div>
          <h1 className="text-[20px] font-extrabold text-slate-900">{seller.display_name}</h1>
        </div>
      </div>

      {seller.banner_url && (
        <button onClick={() => setLightbox({ url: seller.banner_url, label: "Banner" })}
          className="mt-4 block aspect-[21/6] w-full overflow-hidden rounded-xl border border-slate-100">
          <img src={seller.banner_url} alt="" className="h-full w-full object-cover" />
        </button>
      )}

      <GstReferencePanel gstData={business ? mapBusinessToDisplay(business) : null} />

      {/* Tag-list fields not covered by SECTIONS */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          ["Categories", seller.categories], ["Products / Brands", seller.products_brands],
          ["Export countries", seller.export_countries], ["Industries served", seller.industries_served],
        ].map(([label, arr]) => (arr?.length ? (
          <div key={label}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {arr.map((t) => <span key={t} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11.5px] font-bold text-slate-600">{t}</span>)}
            </div>
          </div>
        ) : null))}
      </div>

      {hasReviewable && (
        <div className="mt-5 flex gap-2.5">
          <button onClick={handleApprove} disabled={actionLoading}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-bold text-white">
            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {seller.status === "pending_review" ? "Approve & Go Live" : "Approve Changes"}
          </button>
          <button onClick={() => setRejectOpen(true)} className="flex items-center gap-1.5 rounded-xl border border-[#c71f11]/30 px-4 py-2.5 text-[13px] font-bold text-[#c71f11]">
            <XCircle className="h-4 w-4" /> Reject
          </button>
        </div>
      )}

      {rejectOpen && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 rounded-xl border border-[#c71f11]/20 bg-[#c71f11]/[0.03] p-4">
          <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="Explain what needs fixing…"
            className="w-full rounded-md border-2 border-slate-200 px-3 py-2 text-[13px] focus:border-[#c71f11] focus:outline-none" />
          <div className="mt-2 flex gap-2">
            <button onClick={handleReject} disabled={actionLoading || !rejectReason.trim()} className="rounded-lg bg-[#c71f11] px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-40">Confirm Reject</button>
            <button onClick={() => setRejectOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-[12.5px] font-bold text-slate-500">Cancel</button>
          </div>
        </motion.div>
      )}

      {seller.has_pending_changes && seller.pending_changes && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-[12.5px] font-extrabold uppercase tracking-wide text-amber-700">Proposed changes (not yet live)</h3>
          <div className="mt-2 flex flex-col gap-1.5">
            {Object.entries(seller.pending_changes).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 text-[12.5px]">
                <span className="font-semibold text-slate-500">{k.replace(/_/g, " ")}</span>
                <span className="max-w-[60%] text-right font-bold text-slate-800">
                  {typeof v === "boolean" ? String(v) : Array.isArray(v) ? v.join(", ") : String(v || "—")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {seller.status === "approved" && !seller.has_pending_changes && (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-emerald-700">
          This shop is live. Edits below save immediately and stay visible to buyers — the seller is notified of changes.
        </p>
      )}

      {SECTIONS.map((sec) => (
        <div key={sec.title} className="mt-6">
          <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-slate-500">{sec.title}</h3>
          <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {sec.fields.map((f) => (
              <div key={f} className="flex flex-col gap-1">
                <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{f.replace(/_/g, " ")}</label>
                <input value={form[f] ?? ""} onChange={(e) => update(f, e.target.value)}
                  className="rounded-md border-2 border-slate-200 px-3 py-2 text-[13px] font-semibold focus:border-[#047084] focus:outline-none" />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="mt-6">
        <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-slate-500">Description</h3>
        <p className="mt-2 whitespace-pre-line rounded-md border border-slate-200 bg-slate-50 px-3.5 py-3 text-[13px] text-slate-700">{seller.description || "—"}</p>
      </div>

      <div className="mt-6 flex flex-wrap gap-4">
        {seller.brochure_url && (
          <a href={seller.brochure_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] font-bold text-[#047084]">
            <FileText className="h-4 w-4" /> Brochure
          </a>
        )}
        {seller.video_url && (
          <a href={seller.video_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] font-bold text-[#047084]">
            Video
          </a>
        )}
      </div>

      {photos.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-slate-500">
            Gallery {pendingPhotos.length > 0 && <span className="ml-1.5 text-amber-600">({pendingPhotos.length} pending)</span>}
          </h3>
          {["office", "factory", "warehouse", "team", "product"].map((cat) => {
            const imgs = photos.filter((p) => p.category === cat);
            if (!imgs.length) return null;
            return (
              <div key={cat} className="mt-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{cat}</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {imgs.map((p) => (
                    <button key={p.id} onClick={() => setLightbox({ url: p.url, label: `${cat} photo` })}
                      className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200">
                      <img src={p.url} alt="" className="h-full w-full object-cover" />
                      {p.pending && <span className="absolute left-0.5 top-0.5 rounded bg-amber-500 px-1 text-[9px] font-bold text-white">Pending</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {certifications.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-slate-500">
            Certifications {pendingCerts.length > 0 && <span className="ml-1.5 text-amber-600">({pendingCerts.length} pending)</span>}
          </h3>
          <div className="mt-2.5 flex flex-wrap gap-2.5">
            {certifications.map((c) => {
              const FileIcon = isPdf(c.file_url) ? FileText : ImageIcon;
              return (
                <div key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2">
                  <Award className="h-4 w-4 shrink-0 text-[#047084]" />
                  <div className="flex flex-col">
                    <span className="text-[12.5px] font-bold text-slate-700">{c.name}</span>
                    {c.issued_by && <span className="text-[10.5px] font-medium text-slate-400">{c.issued_by}</span>}
                  </div>
                  {c.pending && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-700">Pending</span>}
                  {c.file_url ? (
                    isPdf(c.file_url) ? (
                      <a href={c.file_url} target="_blank" rel="noreferrer" className="ml-1 flex items-center gap-1 text-[11px] font-bold text-[#047084]">
                        <FileIcon className="h-3.5 w-3.5" /> View PDF
                      </a>
                    ) : (
                      <button onClick={() => setLightbox({ url: c.file_url, label: c.name })} className="ml-1 flex items-center gap-1 text-[11px] font-bold text-[#047084]">
                        <FileIcon className="h-3.5 w-3.5" /> View
                      </button>
                    )
                  ) : (
                    <span className="ml-1 text-[10.5px] font-medium text-slate-300">No file attached</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {products.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-slate-500">Products ({products.length})</h3>

          <div className="mt-2.5 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            {products.map((p) => (
              <button key={p.id} onClick={() => p.image_url && setLightbox({ url: p.image_url, label: p.name })}
                className="overflow-hidden rounded-lg border border-slate-100 text-left">
                <div className="aspect-square bg-slate-50">{p.image_url && <img src={p.image_url} className="h-full w-full object-cover" alt="" />}</div>
                <p className="truncate px-1.5 py-1 text-[11px] font-bold text-slate-700">{p.name}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <button onClick={handleSave} disabled={saving}
        className="mt-7 flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-[13.5px] font-bold text-white"
        style={{ background: "linear-gradient(135deg, #047084, #0a95ab)" }}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
      </button>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setLightbox(null)}>
          <div className="relative max-h-[85vh] max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.url} alt={lightbox.label} className="max-h-[85vh] max-w-full rounded-lg object-contain" />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[12.5px] font-semibold text-white/80">{lightbox.label}</span>
              <a href={lightbox.url} target="_blank" rel="noreferrer" className="text-[12.5px] font-bold text-white underline">Open original</a>
            </div>
            <button onClick={() => setLightbox(null)} className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg">
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
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

function isPdf(url) {
  return typeof url === "string" && url.toLowerCase().split("?")[0].endsWith(".pdf");
}