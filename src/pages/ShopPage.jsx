import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Loader2, ShieldCheck, MapPin, Calendar, Users, Globe, FileText,
  MessageCircle, Award, Building2, Package, Pencil, Trash2,
} from "lucide-react";
import { FaFacebook, FaInstagram, FaLinkedin, FaYoutube } from "react-icons/fa";
import { fetchShopBySlug } from "../utils/api.js";

const CAT_LABELS = { office: "Office", factory: "Factory", warehouse: "Warehouse", team: "Team", product: "Products" };

// group products into Category > Subcategory > Generic Product buckets,
// with an "Uncategorized" fallback for older rows that predate the hierarchy join
function groupProducts(products) {
  const tree = new Map();
  for (const p of products) {
    const catKey = p.category?.id || "uncategorized";
    const catName = p.category?.name || "Other";
    const subKey = p.subcategory?.id || "uncategorized";
    const subName = p.subcategory?.name || "Other";
    const gpKey = p.generic_product?.id || "uncategorized";
    const gpName = p.generic_product?.name || "Other";

    if (!tree.has(catKey)) tree.set(catKey, { name: catName, subs: new Map() });
    const cat = tree.get(catKey);
    if (!cat.subs.has(subKey)) cat.subs.set(subKey, { name: subName, gps: new Map() });
    const sub = cat.subs.get(subKey);
    if (!sub.gps.has(gpKey)) sub.gps.set(gpKey, { name: gpName, items: [] });
    sub.gps.get(gpKey).items.push(p);
  }
  return tree;
}

// ShopPage.jsx — hero section replacement
export default function ShopPage({ slug: slugProp, previewData = null, editable = false, onEditProduct, onDeleteProduct }) {
  const { slug: slugParam } = useParams();
  const slug = slugProp || slugParam;
  const [data, setData] = useState(previewData);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (previewData) { setData(previewData); return; }
    fetchShopBySlug(slug).then((res) => { if (res?.success) setData(res); else setNotFound(true); });
  }, [slug, previewData]);

  if (notFound) return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-[16px] font-bold text-slate-700">This shop isn't available.</p>
      <p className="mt-1 text-[13px] text-slate-400">It may still be under review or doesn't exist.</p>
    </div>
  );
  if (!data) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#047084]" /></div>;

  const { seller, photos, certifications, products = [] } = data;
  const primary = seller.primary_color || "#047084";
  const secondary = seller.secondary_color || "#d2462b";
  const AVATAR = 84; // px, mobile size — desktop scales via sm: classes below

  return (
    <div style={{ "--shop-primary": primary, "--shop-secondary": secondary }} className="bg-slate-50/50">
      {seller.is_preview && (
        <div className="bg-amber-50 px-4 py-2 text-center text-[12px] font-bold text-amber-700 sm:text-[12.5px]">
          Previewing unsaved changes — buyers still see the last approved version.
        </div>
      )}

      {/* Banner — matches the onboarding IdentityStep preview: soft two-tone
    gradient fading through both brand colors, not a hard diagonal split */}
      <div className="relative h-32 w-full overflow-hidden sm:h-48 md:h-60"
        style={{ background: `linear-gradient(135deg, ${primary}, ${primary}50, ${secondary}50, ${secondary})` }}>
        {seller.banner_url && <img src={seller.banner_url} alt="" className="h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Header block — avatar floats over the seam via absolute positioning; text is a sibling
            with its own top padding, so it's guaranteed to sit below the banner, never on it. */}
        <div className="relative pb-1">
          <div
            className="absolute -top-10 left-0 h-[84px] w-[84px] overflow-hidden rounded-2xl border-4 border-white bg-white shadow-lg sm:-top-12 sm:h-28 sm:w-28"
          >
            {seller.logo_url ? (
              <img src={seller.logo_url} alt="" className="h-full w-full object-contain p-1.5" />
            ) : (
              <div className="flex h-full w-full items-center justify-center" style={{ background: primary }}>
                <Building2 className="h-7 w-7 text-white/80 sm:h-8 sm:w-8" />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 pt-14 sm:flex-row sm:items-end sm:justify-between sm:pt-3 sm:pl-[136px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[19px] font-extrabold text-slate-900 sm:text-[24px]">{seller.display_name}</h1>
                <span className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold text-white sm:px-2.5 sm:py-1 sm:text-[11px]" style={{ background: secondary }}>
                  <ShieldCheck className="h-3 w-3" /> GST Verified
                </span>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold text-slate-500 sm:text-[12.5px]">
                <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" />{seller.city}, {seller.state}</span>
                {seller.year_established && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5 shrink-0" />Est. {seller.year_established}</span>}
                {seller.employee_range && <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5 shrink-0" />{seller.employee_range} employees</span>}
              </p>
            </div>
          </div>
        </div>

        {(seller.categories?.length > 0 || seller.products_brands?.length > 0) && (
          <div className="mt-5 flex flex-wrap gap-1.5">
            {[...(seller.categories || []), ...(seller.products_brands || [])].map((t) => (
              <span key={t} className="rounded-full px-2.5 py-1 text-[11px] font-bold sm:px-3 sm:text-[11.5px]" style={{ background: `${primary}14`, color: primary }}>{t}</span>
            ))}
          </div>
        )}

        {seller.description && (
          <div className="mt-6 rounded-xl border border-slate-100 bg-white p-4 sm:mt-7 sm:p-5">
            <h2 className="text-[14px] font-extrabold text-slate-900 sm:text-[15px]">About {seller.display_name}</h2>
            <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-slate-600 sm:text-[13.5px]">{seller.description}</p>
            {seller.brochure_url && (
              <a href={seller.brochure_url} target="_blank" rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold" style={{ color: primary }}>
                <FileText className="h-4 w-4" /> Download Company Brochure
              </a>
            )}
          </div>
        )}

        {products.length > 0 && (
          <div className="mt-6 sm:mt-7">
            <h2 className="flex items-center gap-1.5 text-[13.5px] font-extrabold text-slate-900 sm:text-[14px]">
              <Package className="h-4 w-4" style={{ color: primary }} /> Products
            </h2>

            {[...groupProducts(products).entries()].map(([catKey, cat]) => (
              <div key={catKey} className="mt-4">
                <p className="text-[12px] font-extrabold uppercase tracking-wide" style={{ color: primary }}>{cat.name}</p>

                {[...cat.subs.entries()].map(([subKey, sub]) => (
                  <div key={subKey} className="mt-3 pl-1">
                    <p className="text-[11.5px] font-bold text-slate-500">{sub.name}</p>

                    {[...sub.gps.entries()].map(([gpKey, gp]) => (
                      <div key={gpKey} className="mt-2 pl-2">
                        {gp.name !== "Other" && (
                          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{gp.name}</p>
                        )}
                        <div className="mt-1.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4">
                          {gp.items.map((p) => (
                            <div
                              key={p.id}
                              className="relative overflow-hidden rounded-xl border border-slate-100 bg-white transition-shadow hover:shadow-md"
                            >
                              {p.pending_approval && (
                                <span className="absolute left-2 top-2 z-10 rounded-full bg-amber-100 px-2 py-0.5 text-[9.5px] font-bold text-amber-700">
                                  Pending approval
                                </span>
                              )}

                              {editable && !p.pending_approval && (
                                <div className="absolute right-1.5 top-1.5 z-10 flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => onEditProduct?.(p)}
                                    className="flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-slate-600 shadow hover:text-[#047084]"
                                    aria-label="Edit product"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onDeleteProduct?.(p)}
                                    className="flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-slate-600 shadow hover:text-[#c71f11]"
                                    aria-label="Delete product"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              )}

                              <div className="aspect-square w-full bg-slate-50">
                                {p.image_url ? <img src={p.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><Package className="h-6 w-6 text-slate-300" /></div>}
                              </div>
                              <div className="p-2.5">
                                <p className="text-[12px] font-bold text-slate-800 sm:text-[12.5px]">{p.name}</p>
                                {p.brand_name && <p className="text-[10.5px] font-semibold text-slate-400">{p.brand_name}</p>}
                                {p.price && <p className="text-[11px] font-semibold sm:text-[11.5px]" style={{ color: primary }}>{p.price}{p.unit ? ` / ${p.unit}` : ""}</p>}
                                {p.moq && <p className="mt-0.5 text-[10.5px] font-medium text-slate-400">MOQ: {p.moq} {p.unit}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {certifications?.length > 0 && (
          <div className="mt-6 sm:mt-7">
            <h2 className="text-[13.5px] font-extrabold text-slate-900 sm:text-[14px]">Certifications & Credentials</h2>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {certifications.map((c, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-lg border border-slate-100 bg-white px-2.5 py-2 sm:gap-2 sm:px-3">
                  <Award className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" style={{ color: primary }} />
                  <span className="text-[12px] font-bold text-slate-700 sm:text-[12.5px]">{c.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {photos?.length > 0 && (
          <div className="mt-6 sm:mt-7">
            <h2 className="text-[13.5px] font-extrabold text-slate-900 sm:text-[14px]">Gallery</h2>
            {Object.entries(CAT_LABELS).map(([cat, label]) => {
              const imgs = photos.filter((p) => p.category === cat);
              if (!imgs.length) return null;
              return (
                <div key={cat} className="mt-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 sm:text-[11.5px]">{label}</p>
                  <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
                    {imgs.map((p, i) => (
                      <motion.div key={i} whileHover={{ scale: 1.03 }} className="h-24 w-24 shrink-0 overflow-hidden rounded-lg sm:h-36 sm:w-36">
                        <img src={p.url} alt="" className="h-full w-full object-cover" />
                      </motion.div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 mb-14 flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-5 sm:gap-3">
          {seller.website && <ShopSocialLink href={seller.website} icon={Globe} />}
          {seller.linkedin_url && <ShopSocialLink href={seller.linkedin_url} icon={FaLinkedin} />}
          {seller.facebook_url && <ShopSocialLink href={seller.facebook_url} icon={FaFacebook} />}
          {seller.instagram_url && <ShopSocialLink href={seller.instagram_url} icon={FaInstagram} />}
          {seller.youtube_url && <ShopSocialLink href={seller.youtube_url} icon={FaYoutube} />}
        </div>
      </div>
    </div>
  );
}

function ShopSocialLink({ href, icon: Icon }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:border-[#047084] hover:text-[#047084] sm:h-9 sm:w-9">
      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
    </a>
  );
}