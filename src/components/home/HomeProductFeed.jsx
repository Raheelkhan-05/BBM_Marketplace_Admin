// components/home/HomeProductFeed.jsx
//
// PRICE BREAKDOWN + GST TOGGLE:
// - The seller's stored `price` is the source of truth, always keyed to
//   whatever basis that seller sells in (per Pack, or per Master Pack when
//   masterPackSize >= 1 — same convention as priceUnitLabel/packagingLabel
//   already used). From that single number we derive the other two prices:
//   unit price, pack price, and master-pack price (when applicable).
// - That stored price is GST-inclusive by convention (confirmed by seller
//   at listing time, using that same listing's gst_percent). A single
//   toggle — replacing the old static "X products" label — switches the
//   whole feed (rows + open seller dropdown) between showing GST-inclusive
//   and GST-exclusive prices. Exclusive is derived by reversing the GST
//   percent on the stored (inclusive) price: excl = incl / (1 + gst/100).
// - All of this is pure client-side arithmetic on numbers already present
//   in the row/seller payload (or, for the feed rows, one added field
//   `lowest_price_gst_percent` — see catalog_browse SQL), so toggling is
//   instant with no refetch.
//
// DUPLICATE-FETCH GUARD:
// - React 18 StrictMode (dev only) intentionally mounts every component
//   twice — mount, cleanup, mount — to help surface effect bugs. Without a
//   guard, that means this feed's main fetch effect fires twice back to
//   back on first load: fetch A starts, then almost immediately fetch B
//   starts too, setting loading=true again and hiding the rows fetch A
//   just rendered — visible as a "flicker" a moment after the page loads.
//   `lastRunRef` remembers the (category, q) key + timestamp of the last
//   run; if the exact same key shows up again within DUPLICATE_GUARD_MS,
//   it's treated as a spurious re-invocation and skipped, so only one
//   request actually goes out. A genuine category/search change always
//   produces a different key, so this never blocks real navigation.
//
// "SELL THIS PRODUCT" SELF-LISTING GUARD:
// - The CTA at the bottom of the seller dropdown used to show up
//   unconditionally once the sellers fetch settled — including for a
//   seller who already has their own listing for that exact product,
//   where "Sell this product" makes no sense (they're already selling
//   it). Fixed by reading `item.has_own_listing` straight off the feed
//   row instead of scanning the (wallet-filtered) sellers list — see
//   catalog_browse in fix_wallet_hidden_sellers.sql.
//
// FASTEST DELIVERY / MIN MOQ SORTING (this revision):
// - The three seller-sort tabs — "Min MOQ", "Best price", "Fastest
//   delivery" — used to all be sorted CLIENT-SIDE, only over whichever
//   ~30 sellers happened to already be loaded. That meant the seller
//   shown as "fastest" (or lowest-MOQ) could silently change once more
//   sellers loaded in — wrong, and confusing for buyers.
// - FIXED: "Min MOQ" and "Fastest delivery" are now sorted SERVER-SIDE,
//   across the FULL set of matching sellers for that product, by
//   catalog_brand_item_sellers (see that SQL function's own comments).
//   The page we fetch here is therefore already correctly ordered, and
//   stays correctly ordered no matter how many more sellers get paged in
//   later — nothing needs to be, or should be, re-sorted in the browser
//   for these two tabs anymore.
// - "Best price" is UNCHANGED (still sorted client-side, over the loaded
//   page only) — it depends on quantity-discount/price-slab math that's
//   meaningfully more work to move into SQL safely, and was out of scope
//   for this fix. This is a known, currently-accepted limitation, not an
//   oversight — flagged here on purpose so it doesn't get "fixed" twice.
// - The "Fastest delivery" tab only appears once we know the buyer's
//   destination city/state (their saved default address) — otherwise the
//   backend has nothing to compute a delivery estimate against.
// - Refetching sellers ONLY happens when the buyer switches tabs, or when
//   their address becomes known after a dropdown was already open — never
//   silently in the background — so nothing reshuffles under someone
//   while they're reading the list. (Exception: realtime updates, below.)
//
// MOBILE FULL-WIDTH LAYOUT:
// - The feed's outer wrapper used to always render as a "card":
//   `rounded-2xl border bg-white`, regardless of viewport. On phones that
//   reads as a boxed-in product list with visible margins on both sides.
// - FIXED: on mobile the wrapper now drops the rounded corners and side
//   border and bleeds edge-to-edge (`-mx-3` cancels a parent's assumed
//   `px-3` horizontal padding — adjust this if the parent uses a
//   different padding value), keeping only a top/bottom hairline
//   (`border-y`). The rounded "card" look (`sm:rounded-2xl sm:border`)
//   only kicks back in at the `sm:` breakpoint and up, where there's
//   room for it. Nothing about the row/column logic itself changed.
//
// SWIPE TO BUY:
// - On screens below the `md` breakpoint (< 768px), each seller row in the
//   dropdown is split into two columns: seller info on the left, price
//   block + a compact "Swipe to buy" slider on the right (the slider
//   spans the full width of that right column). The old "Buy now" button
//   only renders from `md` up.
// - Because the slider is the purchase gesture on mobile, tapping the
//   seller row itself no longer starts a purchase there (it would defeat
//   the point of swiping). On md+ the whole row is still clickable.
// - The slider is marked `data-swipe-buy` so useLenisPreventToggle's
//   capture-phase touch listeners leave its horizontal drag alone (same
//   idea as `data-price-editor`).
// - The dropdown closes as soon as a purchase starts (handleBuySeller →
//   closeDropdown), which unmounts the slider — so it never needs a
//   manual reset after confirming.
//
// SELLER ROW PRICE LABELS + REALTIME RELIABILITY (this revision):
// - SellerPriceBlock / OwnListingPriceCell now label prices exactly like
//   the product header's PriceBreakdown ("/Pc", "/10 Pc", "/50 Pc"; the
//   pack row is skipped when a pack is 1 unit). computeEffectivePricing
//   returns packQty/masterQty for this.
// - Realtime fixes:
//   1) The header-price-from-sellerState effect only trusts the OPEN
//      product's FULLY loaded list. Before, it ran over every cached
//      product (including stale closed ones) and over partial pages, and
//      could overwrite a correct header price with an old/wrong one.
//   2) refreshLowest probes LOWEST_PROBE_SIZE sellers (not 1) so an
//      out-of-stock cheapest seller can't make the header look sold out,
//      and drops stale out-of-order responses with a sequence guard.
//   3) After an in-place socket patch, the open dropdown silently
//      reconciles with the server shortly after (patches may not carry
//      slabs/discounts).
//   4) The out-of-order timestamp map is cleared on reconnect so a server
//      restart (timestamps resetting) can't make us drop every event.
//
// LOGIN RETURN URL (this revision):
// - When a logged-out visitor opens a shared store link such as
//   /home/?shop=shiv-shakti-auto-center and taps something that needs
//   login, confirmLogin now sends them to /login with
//   `state: { from: "<pathname><search>" }` — the FULL current URL,
//   including the ?shop= query string. AuthPage reads that and returns
//   them to exactly this page after login/onboarding, instead of a bare
//   /home.
//
// PROMOTION FLOW (this revision):
// - The own-listing price modal no longer has the old commission slider.
//   Its "Promotion X% · Manage →" row opens PromotionPlanModal, a PICKER
//   only (existing services pre-ticked). Done returns here and stages the
//   selection ("Promotion 5% → 7%"). The modal's single slide-to-confirm
//   then saves price and/or promotion together — there is no second
//   confirm step. Nothing is saved before the slide. Saved changes patch
//   the seller row in place and the open dropdown silently re-syncs.
//
// PINNED-FIRST FEED + STICKY TOOLBAR (this revision):
// - The Quick Buy tile and its "Following only" view are gone. Pinned
//   (followed) products are now ALWAYS listed first. That ordering is done
//   SERVER-SIDE (catalog_browse_feed for the feed, products-merged for
//   search) so it stays correct across pages — see
//   pinned_first_catalog_browse_feed.sql. Pinning/unpinning does NOT move
//   rows under the user's finger; the new order shows on the next
//   load / search / category change.
// - The `toolbar` prop (Category strip + search bar, rendered by HomePage)
//   and this component's own Deliver-to / GST row form ONE sticky block
//   right under the quick actions, so all four stay visible while the page
//   scrolls. Requirements for sticky to work: no ancestor may have
//   overflow-x:hidden (HomePage uses overflow-x-clip), and the block's `top`
//   is offset by the site header's height when that header is
//   fixed/sticky (useHeaderStickyOffset).
// - The GST toggle shows its label first and the switch on the right.
//
// ACTION COLOURS (this revision):
// - The GST toggle, "Swipe to buy" / "Buy now" and "Sell this product" used
//   to be solid black. They now use the Grow palette: green for the GST
//   switch (ON state), traffic-orange for every purchase action (swipe knob,
//   Buy now buttons) and blue for "Sell this product". Colour tokens live
//   in the `C` object below (buy / buyDeep / sell / sellDeep / green /
//   greenInk) so they can be tuned in one place.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { useNavigate, useLocation, Link, useSearchParams, useParams } from "react-router-dom";
import Seo from "../Seo.jsx";
import FeedQuickActions from "./FeedQuickActions.jsx";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useMotionValue, useTransform, animate, useReducedMotion } from "framer-motion";
import { ChevronDown, Package, Info, Store, Share2, Pointer, ChevronsUp, X, FileText, ChevronRight, ShieldCheck, LayoutGrid, Loader2, Pencil, Truck, ArrowDown, ArrowUp, Lock, Zap, MapPin, Pin, Clock, Ban } from "lucide-react";
import useFollowedItems from "../../hooks/useFollowedItems";
import { fetchBrandItemsFeed, fetchBrandItemSellers, observePriceTrends, fetchProductSearchMerged, updateSellerProductSubmission, fetchBrandItemSellerOffer, fetchOrderConstraints, fetchShopInfo } from "../../utils/api";
import { useBuyerAddress } from "../../context/BuyerAddressContext.jsx";
import useInfiniteScrollSentinel from "../../hooks/useInfiniteScrollSentinel";
import ImageLightbox from "../ImageLightbox.jsx";
import PromotionPlanModal, { PromotionRow, savePromotionPlan, saveResultMessage } from "../seller/listingForm/PromotionPlanModal.jsx";
import BrandItemDetailModal from "../catalog/BrandItemDetailModal";

import BuyNowModal from "../BuyNowModal";
import { shareProductLink } from "../../utils/share.js";
import { useSocket } from "../../context/SocketContext.jsx";
import { resizedImageUrl } from "../../utils/imageUrl";
import { useAuth } from "../../context/AuthContext.jsx";
import DeliverToBar from "../shipping/DeliverToBar.jsx";
import { round2 } from "../../shared/packUnits.js";
import { checkLocationServiceable } from "../../shared/orderConstraints.js";
import { InlineWheelField } from "../seller/listingForm/PriceWheelPicker.jsx";
import EditListingModal from "../seller/listingForm/EditListingModal.jsx";
import { useLenis } from "../../providers/SmoothScrollProvider.jsx";
import { toBuyerSellerPayload } from "../../utils/buyerSellerPayload";
import ActiveViewStrip from "./ActiveViewStrip.jsx";

const C = {
    ink: "#0B1116", muted: "#667077", primary: "#000000", secondary: "#000000",
    hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)", imgBg: "#F4F5F6",
    // RAL 2009 traffic orange
    brand: "#de3207ff", brandDeep: "#C44705", brandInk: "#8F3200",
    brandTint: "#FFF3EB", brandTint2: "#FFE2D1", brandHair: "rgba(222,83,7,0.25)",
    // Action colours (Grow palette)
    buy: "#D8420F",        // Swipe to buy knob + Buy now buttons (--orange)
    buyDeep: "#D2400E",    // pressed / hover shade of buy
    sell: "#1E78D6",       // "Sell this product" (--blue)
    sellDeep: "#1666B8",   // hover shade of sell
    green: "#22A06B",      // GST switch ON (--green)
    greenInk: "#12794A",   // GST label ON (readable dark green)
};
const EASE = [0.16, 1, 0.3, 1];
// Fewer rows per page means fewer images requested on first paint (each
// row can carry a product image + a brand badge). Infinite scroll still
// tops the list up as the user scrolls.
const PAGE_SIZE = 12;
const SELLER_PAGE_SIZE = 30;
// How many sellers the header-price refresh looks at (price_asc). More than
// 1 so an out-of-stock cheapest seller doesn't hide an in-stock one.
const LOWEST_PROBE_SIZE = 10;
// After a realtime in-place patch, wait this long then silently re-sync the
// open dropdown with the server (picks up slabs/discounts the patch lacked).
const RECONCILE_DELAY_MS = 800;
const DEBOUNCE_MS = 250;
// See "DUPLICATE-FETCH GUARD" note above.
const DUPLICATE_GUARD_MS = 300;
// Set to false to silence realtime debug logs.

const OFFER_CACHE_MS = 15000;
const SHOP_REFRESH_DELAY_MS = 400;

const FOLLOW_TIP_KEY = "bbm_follow_tip_dismissed_v1";

const EMPTY = [];

function readFlag(k) { try { return localStorage.getItem(k) === "1"; } catch { return false; } }
function writeFlag(k) { try { localStorage.setItem(k, "1"); } catch { /* private mode */ } }

// Tap-hint: dismissed => hidden for the rest of TODAY (local day), shows again tomorrow.
// For "never show again", store "1" instead of dayStamp().
const HINT_KEY = "bbm_tap_hint_day_v1";
const dayStamp = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
// function readHintDismissedToday() { try { return localStorage.getItem(HINT_KEY) === dayStamp(); } catch { return false; } }
function readHintDismissedToday() { try { return localStorage.getItem("HINT_KEY") === dayStamp(); } catch { return false; } }
function writeHintDismissedToday() { try { localStorage.setItem(HINT_KEY, dayStamp()); } catch { /* private mode */ } }

const DEBUG_RT = false;
const rtLog = (...args) => { if (DEBUG_RT) console.log("[RT]", ...args); };

// Deterministic-but-fake price per item, so it doesn't jump around on
// re-render — never derived from the real price, purely cosmetic.
function dummyPriceFor(seed) {
    const str = String(seed || "x");
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return 199 + (h % 4300);
}

function inr(n) {
    const val = Number(n) || 0;
    return val.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

const UNIT_SHORT = {
    pieces: "Pc",
    piece: "Pc",
    kg: "Kg",
    grams: "G",
    gram: "G",
    litres: "L",
    litre: "L",
    millilitres: "ml",
    millilitre: "ml",
    dozen: "doz",
    tons: "T",
    ton: "T",
};

// "Litres" -> "L", "Pieces" -> "pc", ... Unknown units are returned unchanged.
function shortUnit(unit) {
    if (!unit) return "";
    return UNIT_SHORT[String(unit).trim().toLowerCase()] || String(unit);
}

// 10 -> "10", 1000 -> "1,000", 0.5 -> "0.5" (max 3 decimals, no trailing zeros)
function fmtQty(n) {
    return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

// Same slab/discount resolution logic as BuyNowModal.js — kept in sync
// on purpose so "how much you'll actually pay" never disagrees between
// the feed dropdown and the checkout modal.
function resolveSlabUnitPrice(priceSlabs, quantity, fallbackPrice) {
    if (!Array.isArray(priceSlabs) || !priceSlabs.length) return fallbackPrice;
    const applicable = priceSlabs
        .filter((s) => Number(s.minQty) > 0 && quantity >= Number(s.minQty) && (!s.maxQty || quantity <= Number(s.maxQty)))
        .sort((a, b) => Number(b.minQty) - Number(a.minQty));
    return applicable.length ? Number(applicable[0].price) : fallbackPrice;
}
function resolveDiscountPercent(quantityDiscounts, quantity) {
    if (!Array.isArray(quantityDiscounts) || !quantityDiscounts.length) return 0;
    const applicable = quantityDiscounts
        .filter((d) => Number(d.minQty) > 0 && quantity >= Number(d.minQty))
        .sort((a, b) => Number(b.minQty) - Number(a.minQty));
    return applicable.length ? Number(applicable[0].discountPercent) || 0 : 0;
}

// Superset of every selectable tab. The caller (SellerDropdown) decides
// which subset is actually shown, based on whether we know the buyer's
// destination yet.
const SELLER_SORT_OPTIONS = [
    { value: "min_moq", label: "Min MOQ" },
    { value: "best_price", label: "Best price" },
    { value: "fastest_delivery", label: "Fastest delivery" },
];

// Maps our UI sort tab to the `sort` value the backend RPC understands.
// 'best_price' has no direct backend equivalent (it needs slab/discount
// math) — it fetches sorted by raw price as a reasonable base ordering,
// then gets refined further client-side (see sortedItems below).
function sortModeToApiSort(sortMode) {
    if (sortMode === "min_moq") return "moq_asc";
    if (sortMode === "fastest_delivery") return "fastest_delivery";
    return "price_asc";
}

// One grid cell whose text content animates in/out — used as a direct
// grid child, so it never disturbs the surrounding grid's columns or
// baseline alignment (previously wrapped in an extra flex span, which
// is what broke the layout).

function AnimatedPriceValue({ value, direction, className, style }) {
    return (
        <span className="relative inline-block overflow-hidden align-bottom" style={{ height: "1.15em" }}>
            <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                    key={value}
                    initial={{ y: direction >= 0 ? 14 : -14, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: direction >= 0 ? -14 : 14, opacity: 0 }}
                    transition={{ duration: 0.16, ease: EASE }}
                    className={className}
                    style={{ ...style, display: "block", whiteSpace: "nowrap" }}
                >
                    {value}
                </motion.span>
            </AnimatePresence>
        </span>
    );
}

// Own-listing price modal. Edits price AND can stage a promotion-services
// change via the picker (PromotionPlanModal). The single slide-to-confirm at
// the bottom saves whatever is pending — price, promotion, or both.
function OwnListingPriceModal({ seller, includeGst, submitting, token, onApply, onClose }) {
    const packSize = Number(seller.pack_size) > 0 ? Number(seller.pack_size) : 1;
    const masterPackSize = Number(seller.units_per_master_pack) > 0 ? Number(seller.units_per_master_pack) : 1;
    const hasOuter = hasOuterPack(seller.units_per_master_pack);
    const gst = Number(seller.gst_percent) || 0;
    const saleUnitLabelText = hasOuter ? "Master Pack" : "Pack";

    const canonicalInclusive = round2(Number(seller.price) || 0);
    const canonicalPerSaleUnit = round2(includeGst ? canonicalInclusive : canonicalInclusive / (1 + gst / 100));

    const reference = useMemo(
        () => threeTierFromSaleUnit(canonicalPerSaleUnit, packSize, masterPackSize, hasOuter),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );

    const rawPerSaleUnitRef = useRef(canonicalPerSaleUnit);
    const [values, setValues] = useState(reference);
    const [perSaleUnit, setPerSaleUnit] = useState(canonicalPerSaleUnit);
    const [promoOpen, setPromoOpen] = useState(false);
    const [pendingPromo, setPendingPromo] = useState(null); // { keys, percent } — staged, not saved yet

    const commitLevel = (level) => (v) => {
        const rawNext = saleUnitFromLevel(level, v, packSize, masterPackSize, hasOuter);
        rawPerSaleUnitRef.current = rawNext;
        const rounded = round2(rawNext);
        setPerSaleUnit(rounded);
        setValues((prev) => ({ ...threeTierFromSaleUnit(rawNext, packSize, masterPackSize, hasOuter), [level]: v }));
    };

    const priceDirty = round2(perSaleUnit) !== canonicalPerSaleUnit;
    const dirty = priceDirty || !!pendingPromo;
    const resetKey = `${perSaleUnit}|${pendingPromo ? pendingPromo.keys.join(",") : ""}`;

    useEffect(() => {
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prevOverflow; };
    }, []);

    const handleConfirm = () => {
        const exactPerSaleUnit = rawPerSaleUnitRef.current;
        const finalInclusive = round2(includeGst ? exactPerSaleUnit : exactPerSaleUnit * (1 + gst / 100));
        const newBasePrice = round2(finalInclusive / (1 + gst / 100));
        onApply({
            basePrice: newBasePrice,
            priceBasis: hasOuter ? "per_master_pack" : "per_pack",
            finalInclusive,
            priceChanged: priceDirty,
            promotionServices: pendingPromo ? pendingPromo.keys : null,
        });
    };

    const fields = [
        seller.unit ? { level: "unit", label: `Per ${seller.unit}`, value: values.unit, refValue: reference.unit } : null,
        { level: "pack", label: "Per Pack", value: values.pack, refValue: reference.pack },
        hasOuter ? { level: "master", label: "Per Master Pack", value: values.master, refValue: reference.master } : null,
    ].filter(Boolean);

    return createPortal(
        <motion.div
            className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6 overflow-y-auto"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={submitting ? undefined : onClose}
        >
            <motion.div
                initial={{ y: 24, opacity: 0, scale: 0.97 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 16, opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2, ease: EASE }}
                onClick={(e) => e.stopPropagation()}
                className="my-auto w-full max-w-sm rounded-[22px] bg-white p-5"
            >
                <div className="flex items-center justify-between">
                    <p className="text-[15px] font-extrabold tracking-wide" style={{ color: C.ink }}>Update your listing</p>
                    <button onClick={onClose} disabled={submitting} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/[0.05] disabled:opacity-40">
                        <X className="h-4 w-4" style={{ color: C.muted }} />
                    </button>
                </div>
                <p className="mt-1 text-[11.5px] font-semibold leading-snug tracking-wide" style={{ color: C.muted }}>
                    MOQ {seller.moq} {saleUnitLabelText}{Number(seller.moq) === 1 ? "" : "s"} · {includeGst ? "GST included" : "GST excluded"}
                </p>

                <div className="mt-4">
                    <div className={`grid gap-2.5 ${fields.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                        {fields.map((f) => (
                            <div key={f.level} className="flex flex-col gap-1">
                                <span className="truncate text-center text-[9.5px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                                    {f.label}
                                </span>
                                <InlineWheelField
                                    seed={f.value}
                                    step={round2((f.refValue || 1) * 0.02) || 1}
                                    gridAnchor={f.refValue || 1}
                                    filterFn={(v) => v > 0}
                                    formatValue={(v) => `₹${v.toLocaleString("en-IN")}`}
                                    prefix="₹" suffix={null}
                                    rangeMessage="Enter a price greater than ₹0."
                                    onCommit={commitLevel(f.level)}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <PromotionRow
                    currentPercent={seller.marketing_commission_percent}
                    pending={pendingPromo}
                    disabled={submitting}
                    onClick={() => setPromoOpen(true)}
                />

                <div className="mt-5">
                    <SlideToConfirm
                        resetKey={resetKey}
                        busy={submitting}
                        disabled={!dirty}
                        label={dirty ? "Slide to confirm changes" : "Change the price or promotion first"}
                        onConfirm={handleConfirm}
                    />
                </div>
            </motion.div>

            <AnimatePresence>
                {promoOpen && (
                    <PromotionPlanModal
                        submission={{
                            id: seller.submission_id,
                            ...(Object.prototype.hasOwnProperty.call(seller, "marketing_services") ? { marketing_services: seller.marketing_services } : {}),
                            marketing_commission_percent: seller.marketing_commission_percent,
                            marketing_legacy_percent: seller.marketing_legacy_percent,
                        }}
                        token={token}
                        title={seller.display_name}
                        stagedKeys={pendingPromo ? pendingPromo.keys : null}
                        onClose={() => setPromoOpen(false)}
                        onDone={(keys, percent) => {
                            setPendingPromo(keys ? { keys, percent } : null);
                            setPromoOpen(false);
                        }}
                    />
                )}
            </AnimatePresence>
        </motion.div>,
        document.body
    );
}

// Shares the public store link (same format the login-return note uses).
async function shareShopLink({ shopSlug, shopName }) {

    const url = `${window.location.origin}/sellers/${encodeURIComponent(shopSlug)}`;
    try {
        if (navigator.share) {
            await navigator.share({ title: shopName || "My shop", text: `Check out ${shopName || "my shop"} on BBM`, url });
            return "shared";
        }
        await navigator.clipboard.writeText(url);
        return "copied";
    } catch (e) {
        return e?.name === "AbortError" ? "cancelled" : "failed";
    }
}

// Compact trigger shown inline in the seller row — shows price breakdown
// AND the current commission %. Clicking either opens OwnListingPriceModal.
//
// VISUAL REDESIGN: replaced blue dotted-underline "fake link" text (which
// read as a broken hyperlink, not an editable control) with a contained
// card-like surface — a light bordered chip with its own background,
// subtle hover/press feedback, and a small pencil icon as the ONE clear
// "this is editable" cue. Price stays in high-contrast ink (it's the
// primary information), while the edit affordance is secondary and quiet
// — this mirrors how editable price/quantity fields read in most
// checkout/marketplace UIs (e.g. Amazon's own "Change" chips): the data
// is bold, the action to change it is a small, separate, low-emphasis tag.
//
// Price labels follow the same rules as the product header's PriceBreakdown
// ("/Pc", "/10 Pc", "/50 Pc"; pack row skipped when a pack is 1 unit).
function OwnListingPriceCell({ seller, includeGst, submitting, token, onApply }) {
    const [open, setOpen] = useState(false);
    const [pressed, setPressed] = useState(false);
    const packSize = Number(seller.pack_size) > 0 ? Number(seller.pack_size) : 1;
    const masterPackSize = Number(seller.units_per_master_pack) > 0 ? Number(seller.units_per_master_pack) : 1;
    const hasOuter = hasOuterPack(seller.units_per_master_pack);
    const gst = Number(seller.gst_percent) || 0;

    const canonicalInclusive = round2(Number(seller.price) || 0);
    const canonicalDisplayed = round2(includeGst ? canonicalInclusive : canonicalInclusive / (1 + gst / 100));
    const derived = deriveDisplayPrices(canonicalDisplayed, packSize, masterPackSize);
    const commissionPercent = Number(seller.marketing_commission_percent) || 0.25;

    const short = shortUnit(seller.unit);
    const masterQty = hasOuter ? packSize * masterPackSize : null;
    const packDuplicatesUnit = !!seller.unit && packSize === 1;

    const priceRows = [
        seller.unit ? { label: short, value: `₹${inr(derived.perBaseUnit)}` } : null,
        !packDuplicatesUnit
            ? { label: seller.unit ? `${fmtQty(packSize)} ${short}` : "Pack", value: `₹${inr(derived.perPack)}` }
            : null,
        hasOuter
            ? { label: seller.unit ? `${fmtQty(masterQty)} ${short}` : "M Pack", value: `₹${inr(derived.perMasterPack)}` }
            : null,
    ].filter(Boolean);

    return (
        <>
            <button
                type="button"
                data-price-editor=""
                onClick={(e) => { e.stopPropagation(); setOpen(true); }}
                onMouseDown={() => setPressed(true)}
                onMouseUp={() => setPressed(false)}
                onMouseLeave={() => setPressed(false)}
                className="group relative z-10 flex flex-col items-end gap-1 rounded-xl border px-2.5 py-2 text-left transition-all duration-150"
                style={{
                    borderColor: C.hair,
                    background: pressed ? C.hairSoft : "#fff",
                    transform: pressed ? "scale(0.98)" : "scale(1)",
                }}
            >
                {/* Price rows — high-contrast, the actual information */}
                <div className="grid items-baseline gap-x-1 gap-y-0.5" style={{ gridTemplateColumns: "auto auto" }}>
                    {priceRows.map((r) => (
                        <div key={r.label} className="contents">
                            <span className="text-right text-[13px] font-extrabold tabular-nums whitespace-nowrap" style={{ color: C.ink }}>
                                {r.value}
                            </span>
                            <span className="text-left text-[9px] font-semibold tracking-wide whitespace-nowrap" style={{ color: C.muted }}>
                                /{r.label}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Divider + Promo row, visually subordinate to price */}
                <div className="flex w-full items-center gap-1.5 border-t pt-1" style={{ borderColor: C.hairSoft }}>
                    <span className="text-[9.5px] font-bold tracking-wide" style={{ color: C.muted }}>Promo</span>
                    <span className="text-[10.5px] font-extrabold tabular-nums" style={{ color: C.ink }}>{commissionPercent}%</span>
                </div>

                {/* The ONE clear edit affordance — small, quiet, unmistakable */}
                <span
                    className="mt-0.5 flex items-center gap-1 self-stretch justify-center rounded-lg px-2 py-1 text-[9.5px] font-bold tracking-wide transition-colors duration-150"
                    style={{
                        background: pressed ? `${C.secondary}14` : C.hairSoft,
                        color: C.secondary,
                    }}
                >
                    <Pencil className="h-2.5 w-2.5" strokeWidth={2.5} />
                    Edit
                </span>
            </button>

            <AnimatePresence>
                {open && (
                    <OwnListingPriceModal
                        seller={seller}
                        includeGst={includeGst}
                        submitting={submitting}
                        token={token}
                        onClose={() => setOpen(false)}
                        onApply={(payload) => { onApply(payload); setOpen(false); }}
                    />
                )}
            </AnimatePresence>
        </>
    );
}

// Add near the other pure helpers (computePriceBreakdown, etc.):
function threeTierFromSaleUnit(perSaleUnit, packSize, masterPackSize, hasOuter) {
    const d = deriveDisplayPrices(perSaleUnit, packSize, masterPackSize);
    return { unit: d.perBaseUnit, pack: d.perPack, master: hasOuter ? d.perMasterPack : null };
}
function saleUnitFromLevel(level, value, packSize, masterPackSize, hasOuter) {
    if (level === "unit") return hasOuter ? value * packSize * masterPackSize : value * packSize;
    if (level === "pack") return hasOuter ? value * masterPackSize : value;
    return value;
}

function SellerSortToggle({ value, onChange, options = SELLER_SORT_OPTIONS }) {
    return (
        <div className="flex gap-1 rounded-full p-0.5" style={{ background: C.hairSoft }}>
            {options.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange(opt.value)}
                    className="rounded-full px-2 py-1 text-[10px] font-bold tracking-wide transition-colors duration-150"
                    style={value === opt.value ? { background: C.secondary, color: "#fff" } : { color: C.muted }}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

// Tracks how many columns are active at the current breakpoint, matching
// the sm/lg breakpoints used elsewhere (1 col mobile, 2 col tablet, 3 col
// desktop). Needed because manual column-bucketing (below) can't respond
// to Tailwind breakpoints on its own — it has to know the count in JS.
function useResponsiveColumnCount() {
    const getCount = () => {
        if (typeof window === "undefined") return 1;
        if (window.innerWidth >= 1024) return 3; // lg
        if (window.innerWidth >= 640) return 2;  // sm
        return 1;
    };
    const [count, setCount] = useState(getCount);
    useEffect(() => {
        const onResize = () => setCount(getCount());
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);
    return count;
}

// How far down the sticky toolbar must stick so it doesn't slide UNDER the
// site header. If the page's <header> is position:fixed/sticky we stick right
// below it (its live height); otherwise the offset is 0. Re-measured on
// resize and whenever the header changes size.
function useHeaderStickyOffset() {
    const [offset, setOffset] = useState(0);
    useLayoutEffect(() => {
        const header = document.querySelector("header");
        if (!header) return undefined;
        const measure = () => {
            const pos = window.getComputedStyle(header).position;
            const pinned = pos === "fixed" || pos === "sticky";
            setOffset(pinned ? Math.round(header.getBoundingClientRect().height) : 0);
        };
        measure();
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
        ro?.observe(header);
        window.addEventListener("resize", measure);
        return () => {
            ro?.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, []);
    return offset;
}

// Distributes items round-robin (item 0 → col 1, item 1 → col 2, item 2 →
// col 3, item 3 → col 1, ...) so reading order goes left-to-right across
// a row before wrapping — matches how a normal grid reads — while each
// column still renders as its own independent stack, so opening a
// dropdown never reflows sibling columns.
function bucketItemsByColumn(items, numCols) {
    const cols = Array.from({ length: numCols }, () => []);
    items.forEach((item, i) => {
        cols[i % numCols].push(item);
    });
    return cols;
}

function FreightPill({ included }) {
    return (
        <span
            className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-[3px] text-[9.5px] font-bold tracking-wide whitespace-nowrap"
            style={
                included
                    ? { background: `#006F8314`, color: "#006F83" }
                    : { background: C.hairSoft, color: C.muted }
            }
        >
            <Truck className="h-2.5 w-2.5" strokeWidth={2.5} />
            {included ? "Freight included" : "Freight extra"}
        </span>
    );
}

// Small badge marking the fastest seller when the "Fastest delivery" tab
// is active — purely visual.
function FastestBadge() {
    return (
        <span
            className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-[3px] text-[9.5px] font-bold tracking-wide whitespace-nowrap"
            style={{ background: "#00000010", color: C.ink }}
        >
            <Zap className="h-2.5 w-2.5" strokeWidth={2.5} />
            Fastest
        </span>
    );
}

// Seller-row price block. Uses the SAME labelling rules as the product
// header's PriceBreakdown: with a unit, every price is labelled by how many
// base units it covers ("/Pc", "/10 Pc", "/50 Pc"); without one it falls
// back to Pack / M Pack. A pack of exactly 1 unit would repeat the unit row,
// so that row is skipped.
function SellerPriceBlock({ pricing, unit }) {
    if (!pricing) return null;
    const { discountPercent, hasMasterPack, unit: u, pack, masterPack, packQty, masterQty } = pricing;
    const hasDiscount = discountPercent > 0;

    const short = shortUnit(unit);
    const packDuplicatesUnit = !!unit && Number(packQty) === 1;

    const rows = [
        unit ? { label: short, ...u } : null,
        !packDuplicatesUnit
            ? { label: unit ? `${fmtQty(packQty)} ${short}` : "Pack", ...pack }
            : null,
        hasMasterPack && masterPack
            ? { label: unit ? `${fmtQty(masterQty)} ${short}` : "M Pack", ...masterPack }
            : null,
    ].filter(Boolean);

    if (!rows.length) return null;

    return (
        <div className="grid shrink-0 items-baseline gap-x-1.5 gap-y-0.5" style={{ gridTemplateColumns: "auto auto auto" }}>
            {rows.map((r) => (
                <div key={r.label} className="contents">
                    {hasDiscount && (
                        <span className="text-[9.5px] text-right font-semibold tabular-nums line-through" style={{ color: C.muted }}>
                            ₹{inr(r.original)}
                        </span>
                    )}
                    <span
                        className="text-right text-[12.5px] font-extrabold tabular-nums whitespace-nowrap"
                        style={{ color: hasDiscount ? C.secondary : C.ink, gridColumn: hasDiscount ? "auto" : "1 / span 2" }}
                    >
                        ₹{inr(r.final)}
                    </span>
                    <span className="text-left text-[9px] font-semibold tracking-wide whitespace-nowrap" style={{ color: C.muted }}>
                        /{r.label}
                    </span>
                </div>
            ))}
        </div>
    );
}

// Merges a new page of results into the existing list, dropping any
// item whose id is already present. Needed because offset-based
// pagination can hand back an id that's already on screen — most
// commonly when a debounced search re-query (reset to page 0) races
// with an in-flight infinite-scroll append (page 2 of the PREVIOUS
// query), or when the underlying filtered set shifts between two
// fetches. React requires unique keys regardless of why a dup shows
// up, so this is the actual fix rather than a workaround.
function mergeUnique(prev, incoming) {
    const incomingById = new Map(incoming.map((it) => [it.id, it]));
    const seen = new Set();
    const merged = prev.map((it) => {
        seen.add(it.id);
        const fresh = incomingById.get(it.id);
        return fresh ? { ...it, is_pinned: fresh.is_pinned, default_rank: fresh.default_rank } : it;
    });
    for (const it of incoming) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        merged.push(it);
    }
    return merged;
}

// Whether this listing's price is priced per Pack or per Master Pack.
// masterPackSize >= 1 means a master pack applies; otherwise it's per Pack.
function priceUnitLabel(masterPackSize) {
    return Number(masterPackSize) >= 1 ? "master pack" : "pack";
}

function packagingLabel(packSize, masterPackSize, unit) {
    const pack = Number(packSize) || 0;
    const master = Number(masterPackSize) || 0;

    if (!pack || !unit) return null;

    if (master > 1) {
        return `1 Master Pack = ${master} Packs = ${master * pack} ${unit}`;
    }

    return `1 Pack = ${pack} ${unit}`;
}

// Premium locked pricing component
// Render as div so it is safe to nest inside cards / rows / clickable containers.
function LockedPriceBlock({ seed, unit, size = "row", onClick }) {
    const rows = [
        unit ? { label: unit, value: dummyPriceFor(seed + "u") } : null,
        { label: "Pack", value: dummyPriceFor(seed + "p") },
    ].filter(Boolean);

    const isCompact = size !== "row";

    const valueClass = isCompact
        ? "text-[11.5px]"
        : "text-[12px]";

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
                e.stopPropagation();
                onClick?.();
            }}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onClick?.();
                }
            }}
            aria-label="Login to view price"
            className="
                group
                flex
                min-w-[112px]
                flex-col
                items-end
                gap-1.5
                cursor-pointer
                select-none
            "
        >
            {/* Pricing area */}
            <div
                className="
                    rounded-md
                    px-2
                    py-1.5
                    transition-all
                    duration-150
                    group-hover:bg-black/[0.018]
                "
            >
                <div className="flex flex-col gap-[4px]">
                    {rows.map((r) => (
                        <div
                            key={r.label}
                            className="
                                grid
                                items-baseline
                                gap-x-1
                                leading-none
                            "
                            style={{
                                gridTemplateColumns:
                                    "10px minmax(42px, auto) 38px",
                            }}
                        >
                            {/* Currency */}
                            <span
                                className={`${valueClass} font-extrabold`}
                                style={{ color: C.ink }}
                            >
                                ₹
                            </span>

                            {/* Protected amount */}
                            <span
                                className={`
                                    ${valueClass}
                                    min-w-0
                                    text-right
                                    whitespace-nowrap
                                    font-extrabold
                                    tabular-nums
                                `}
                                style={{
                                    color: C.ink,
                                    filter: "blur(4.5px)",
                                    opacity: 0.55,
                                    userSelect: "none",
                                    pointerEvents: "none",
                                }}
                            >
                                {inr(r.value)}
                            </span>

                            {/* Unit */}
                            <span
                                className="
                                    text-[9px]
                                    font-semibold
                                    tracking-[0.01em]
                                    whitespace-nowrap
                                "
                                style={{ color: C.muted }}
                            >
                                /{r.label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Login CTA */}
            <span
                className="
                    inline-flex
                    items-center
                    gap-1.5
                    rounded-md
                    px-2.5
                    py-[4px]
                    text-[9.5px]
                    font-extrabold
                    leading-none
                    tracking-wide
                    whitespace-nowrap
                    transition-all
                    duration-150
                    group-hover:-translate-y-[1px]
                "
                style={{
                    color: "#000000",
                    background: `#0000000D`,
                    border: `1px solid #00000028`,
                }}
            >
                <span
                    className="
                        flex
                        h-3.5
                        w-3.5
                        items-center
                        justify-center
                        rounded-full
                    "
                >
                    <Lock
                        className="h-2.5 w-2.5"
                        strokeWidth={2.6}
                    />
                </span>

                Login to view
            </span>
        </div>
    );
}

// Compact, reusable price-breakdown block — shows whichever of
// unit/pack/master-pack prices are available, smallest to largest.
// `align` controls whether it's left- or right-aligned (rows want
// right-aligned in the price column; seller dropdown rows want the
// same but slightly denser).
function PriceBreakdown({ breakdown, unit, size = "row" }) {
    if (!breakdown) return null;
    const { unitPrice, packPrice, masterPackPrice, hasMasterPack, packQty, masterQty } = breakdown;

    const short = shortUnit(unit);

    // With a unit: label every price by how many base units it covers
    // ("/pc", "/10 pc", "/50 pc"). Without one, fall back to Pack / M Pack.
    // A pack of exactly 1 unit would just repeat the unit row ("/pc" and
    // "/1 pc" at the same price), so that row is skipped in that case.
    const packDuplicatesUnit = !!unit && Number(packQty) === 1;

    const rows = [
        unitPrice != null && unit ? { label: short, value: unitPrice } : null,
        packPrice != null && !packDuplicatesUnit
            ? { label: unit ? `${fmtQty(packQty)} ${short}` : "Pack", value: packPrice }
            : null,
        hasMasterPack && masterPackPrice != null
            ? { label: unit ? `${fmtQty(masterQty)} ${short}` : "M Pack", value: masterPackPrice }
            : null,
    ].filter(Boolean);

    if (!rows.length) return null;

    const isRow = size === "row";
    const valueClass = isRow
        ? "text-[12px] font-extrabold tabular-nums"
        : "text-[11.5px] font-extrabold tabular-nums";
    const labelClass = "text-[9px] font-semibold tracking-wide";

    return (
        <div className="grid items-baseline gap-x-1 gap-y-0.5" style={{ gridTemplateColumns: "auto auto" }}>
            {rows.map((r) => (
                <div key={r.label} className="contents">
                    <span className={`${valueClass} text-right whitespace-nowrap`} style={{ color: C.ink }}>
                        ₹{inr(r.value)}
                    </span>
                    <span className={`${labelClass} text-left whitespace-nowrap`} style={{ color: C.muted }}>
                        /{r.label}
                    </span>
                </div>
            ))}
        </div>
    );
}

// Same lead-time rule BuyNowModal/BrandItemSellersPage use.
function effectiveLeadTime(s) {
    return s.stock_type === "made_to_order" ? s.production_lead_time_days : s.dispatch_time_days;
}

function BrandBadge({ name, image }) {
    if (!name) return null;
    const initials = name.trim().slice(0, 2).toUpperCase();
    return image ? (
        <img
            src={resizedImageUrl(image, { width: 128 })}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-6 w-auto shrink-0 rounded-full object-cover"
        />
    ) : (
        <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[8.5px] font-extrabold leading-none"
            style={{ background: `${C.secondary} 18`, color: C.secondary }}
        >
            {initials}
        </span>
    );
}

// Whether a given seller row (from the sellers dropdown) belongs to the
// signed-in user — used only to label/disable a row "(You)" within the
// loaded sellers list. NOT used to decide whether the "Sell this product"
// CTA shows — see item.has_own_listing for that (SellerDropdown below),
// since this list is wallet-filtered and can omit the signed-in seller's
// own row entirely.
function isOwnSellerRow(sellerRow, currentUserId) {
    if (sellerRow?.is_own === true) return true;
    if (!currentUserId) return false;
    const ownerId = sellerRow?.shop_slug ?? null;
    return ownerId != null && String(ownerId) === String(currentUserId);
}

// Stable sort: items with an actual seller (lowest_price present) float
// to the top; order within each group (has-sellers / no-sellers) is
// left untouched, since Array.prototype.sort in modern JS engines is
// stable and we're only comparing a boolean, never index math.
function sortBySellerAvailability(list) {
    return [...list].sort((a, b) => {
        const aHas = a.lowest_price != null ? 0 : 1;
        const bHas = b.lowest_price != null ? 0 : 1;
        return aHas - bHas;
    });
}

function ProductImage({ src, alt, onOpen, priority = false }) {
    const [failed, setFailed] = useState(false);
    if (!src || failed) return <Package className="h-4.5 w-4.5" style={{ color: C.muted }} />;
    return (
        <img
            // Displayed at 64px (h-16 w-16) — 128px covers retina without
            // shipping a multi-megabyte original for a thumbnail.
            src={resizedImageUrl(src, { width: 256 })}
            alt={alt}
            referrerPolicy="no-referrer"
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            onError={() => setFailed(true)}
            onClick={(e) => { e.stopPropagation(); onOpen(src); }}
            className="h-full w-full object-cover cursor-zoom-in"
        />
    );
}

// GST toggle — replaces the old static "X products" label at the top of
// the feed. Purely a local UI switch; all price math it drives is
// recomputed client-side (useMemo), so flipping it is instant.
// Layout: label FIRST, switch on the right.
// Colours: ON = green track + dark-green label, OFF = soft grey track + grey label.
function GstToggle({ includeGst, onChange }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={includeGst}
            aria-label={`GST ${includeGst ? "included" : "excluded"}`}
            onClick={() => onChange(!includeGst)}
            className="group inline-flex h-7 items-center gap-2 rounded-full transition-all duration-200 cursor-pointer"
        >
            {/* Label: one line. Fixed min-width so the switch never shifts
                between "With GST" and "Without GST". */}
            <span
                className="min-w-[66px] whitespace-nowrap text-right text-[11px] font-bold leading-none tracking-wide"
                style={{ color: includeGst ? C.greenInk : "#7B858C" }}
            >
                {includeGst ? "With GST" : "Without GST"}
            </span>

            {/* Switch (h-4 w-8, knob h-3 w-3, travel 16px) */}
            <span
                className="relative flex h-4 w-8 shrink-0 items-center rounded-full p-0.5 transition-all duration-200"
                style={{ backgroundColor: includeGst ? C.green : "#D9DEE2" }}
            >
                <span
                    className="h-3 w-3 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-transform duration-200"
                    style={{ transform: includeGst ? "translateX(16px)" : "translateX(0px)" }}
                />
            </span>
        </button>
    );
}

// Labeled per-row pill. Words + icon + filled/outlined state = unmistakably a toggle.
function FollowButton({ following, onToggle }) {
    return (
        <motion.button
            type="button"
            aria-pressed={following}
            aria-label={following ? "Pinned. Tap to unpin" : "Pin this product to the top"}
            title={following ? "Tap to unpin" : "Pin to keep this product at the top of your feed"}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            onKeyDown={(e) => e.stopPropagation()}
            className="relative inline-flex h-7 w-7 items-center justify-center bg-transparent p-0 outline-none"
        >
            {/* Impact ripple where the pin lands (only plays when pinned) */}
            <AnimatePresence>
                {following && (
                    <motion.span
                        key="ripple"
                        className="pointer-events-none absolute rounded-full"
                        style={{ width: 6, height: 6, bottom: 4, background: "#000" }}
                        initial={{ opacity: 0.35, scale: 0.4 }}
                        animate={{ opacity: 0, scale: 3.2 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.35, ease: "easeOut", delay: 0.12 }}
                    />
                )}
            </AnimatePresence>

            <motion.span
                className="flex items-center justify-center"
                style={{ originX: 0.5, originY: 1 }}
                initial={false}
                animate={
                    following
                        ? {
                            // lift, then drive straight down, then settle
                            rotate: [45, 20, 0, 0, 0],
                            y: [0, -7, 2.5, 0, 0],
                            scaleY: [1, 1.08, 0.86, 1.03, 1],
                            scaleX: [1, 0.96, 1.08, 0.99, 1],
                        }
                        : {
                            rotate: 45,
                            y: 0,
                            scaleY: 1,
                            scaleX: 1,
                        }
                }
                transition={
                    following
                        ? { duration: 0.42, times: [0, 0.3, 0.55, 0.78, 1], ease: "easeOut" }
                        : { type: "spring", stiffness: 500, damping: 30 }
                }
            >
                <Pin
                    className="h-4 w-4"
                    strokeWidth={2.4}
                    style={{ color: following ? "#FED813 " : C.muted }}
                    fill={following ? "#FED813" : "none"}
                />
            </motion.span>
        </motion.button>
    );
}

// A category/subcategory literally named "Pending" is a placeholder bucket
// for not-yet-classified items — never meant to be shown to a shopper.
// Blank it out here rather than displaying it, same treatment as
// CategoryStrip's isHiddenCategory.
function isHiddenLabel(name) {
    return typeof name === "string" && name.trim().toLowerCase() === "pending";
}

function isFeedRowOutOfStock(item) {
    return item.lowest_price_stock_type === "ready_stock"
        && item.lowest_price_available_stock != null
        && item.lowest_price_moq != null
        && Number(item.lowest_price_available_stock) < Number(item.lowest_price_moq);
}

// MOQ + delivery + freight, shown on the row header in shop mode.
// Aligned spec strip + Buy button, shown under each row in shop mode.
// Aligned spec strip + buy action, shown under each row in shop mode.
// Mobile: "Swipe to buy" slider (same as the seller dropdown). md+: "Buy now" button.
function ShopOfferStrip({ offer, masterPackSize, outOfStock, opening, onBuy, breakdown, isOwner = false, onShare }) {
    const [slideKey, setSlideKey] = useState(0);
    if (!offer) return null;

    const moq = Number(offer.moq);
    const isMaster = Number(masterPackSize) >= 1;
    const moqValue = isMaster
        ? `${fmtQty(moq)} M Pack`
        : `${fmtQty(moq)} Pack${moq === 1 ? "" : "s"}`;
    const days = offer.total_delivery_days;

    const cells = [
        offer.moq != null
            ? { key: "moq", label: "MOQ", Icon: Package, value: moqValue }
            : null,
        days != null
            ? { key: "eta", label: "Delivery", Icon: Clock, value: `~${days} ${Number(days) === 1 ? "day" : "days"}` }
            : null,
        { key: "freight", label: "Freight", Icon: Truck, value: offer.freight_included ? "Included" : "Extra", accent: !!offer.freight_included },
    ].filter(Boolean);

    const handleSlideConfirm = () => {
        Promise.resolve(onBuy()).finally(() => setSlideKey((k) => k + 1));
    };

    const specBlock = (
        <div
            className="grid min-w-0 overflow-hidden rounded-xl border"
            style={{
                gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
                borderColor: C.hair,
                background: "#FCFBF9",
            }}
        >
            {cells.map(({ key, label, Icon, value, accent }, i) => (
                <div
                    key={key}
                    className="flex min-w-0 flex-col items-center justify-center gap-0.5 px-2 py-2 text-center tracking-wide"
                    style={i > 0 ? { borderLeft: `1px solid ${C.hairSoft}` } : undefined}
                >
                    <span className="flex items-center gap-1 text-[8.5px] font-bold uppercase leading-none tracking-wider" style={{ color: C.muted }}>
                        <Icon className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} />
                        {label}
                    </span>
                    <span
                        className="w-full truncate text-[12px] font-extrabold leading-tight tracking-wide"
                        style={{ color: accent ? "#006F83" : C.ink }}
                    >
                        {value}
                    </span>
                </div>
            ))}
        </div>
    );

    const ShareBtn = ({ className = "" }) => (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onShare?.(); }}
            aria-label="Share product"
            className={`inline-flex items-center justify-center gap-1.5 rounded-full border bg-white text-[11.5px] font-bold tracking-wide transition-colors hover:bg-black/[0.03] active:scale-[0.97] ${className}`}
            style={{ borderColor: C.hair, color: C.ink }}
        >
            <Share2 className="h-3.5 w-3.5" strokeWidth={2.3} /> Share
        </button>
    );

    return (
        <div className="px-3 pb-3 sm:px-4">
            {/* ── MOBILE: specs row, then [breakdown text | slider on the right] ── */}
            <div className="flex flex-col gap-2 md:hidden">
                {specBlock}

                <div className="flex items-center gap-2">
                    <div
                        className="min-w-0 flex-1 text-[11px] font-semibold leading-tight"
                        style={{ color: C.muted }}
                    >
                        {breakdown}
                    </div>

                    <div className="w-[48%] max-w-[190px] shrink-0">
                        {isOwner ? (
                            <ShareBtn className="h-10 w-full" />
                        ) : !outOfStock ? (
                            <div data-swipe-buy="" className="w-full" onClick={(e) => e.stopPropagation()}>
                                <SlideToConfirm compact label="Swipe to buy" busyLabel="Opening…" doneLabel="Opening…"
                                    resetKey={`${slideKey}`} onConfirm={handleSlideConfirm} />
                            </div>
                        ) : (
                            <div className="flex h-10 w-full items-center justify-center rounded-full text-[11px] font-extrabold tracking-wide"
                                style={{ background: "#f1f1f1", color: C.muted }}>OUT OF STOCK</div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── md and up: specs fill the row, smaller Buy now on the right ── */}
            <div className="hidden items-center gap-2.5 md:flex">
                <div className="min-w-0 flex-1">{specBlock}</div>

                {isOwner ? (
                    <ShareBtn className="h-9 w-28 shrink-0" />
                ) : !outOfStock ? (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onBuy(); }}
                        className="flex h-9 w-28 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#F4511E] text-[12px] font-extrabold tracking-wide text-white shadow-[0_6px_14px_-8px_rgba(244,81,30,0.8)] transition hover:bg-[#D83F0E] active:scale-95">
                        {opening && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Buy now
                    </button>
                ) : (
                    <div className="flex h-9 w-28 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold tracking-wide"
                        style={{ background: "#f1f1f1", color: C.muted }}>OUT OF STOCK</div>
                )}
            </div>
        </div>
    );
}

// Product name with the info icon INLINE at the very end. If the name is too
// long, the text is trimmed + "…" so the icon still fits on the last allowed line.
function ProductNameWithInfo({ name, onInfo }) {
    const pRef = useRef(null);
    const textRef = useRef(null);

    useLayoutEffect(() => {
        const p = pRef.current;
        const s = textRef.current;
        if (!p || !s) return;

        const fit = () => {
            const lines = window.matchMedia("(min-width: 768px)").matches ? 2 : 3;
            s.textContent = name;
            const lh = parseFloat(getComputedStyle(p).lineHeight) || 17.5;
            const max = lh * lines + 1;
            if (p.scrollHeight <= max) return; // fits, no trimming needed

            let lo = 0, hi = name.length;
            while (lo < hi) {
                const mid = Math.ceil((lo + hi) / 2);
                s.textContent = name.slice(0, mid).trimEnd() + "…";
                if (p.scrollHeight <= max) lo = mid; else hi = mid - 1;
            }
            s.textContent = name.slice(0, lo).trimEnd() + "…";
        };

        fit();
        let lastW = p.clientWidth;
        const ro = new ResizeObserver(() => {
            if (p.clientWidth !== lastW) { lastW = p.clientWidth; fit(); }
        });
        ro.observe(p);
        return () => ro.disconnect();
    }, [name]);

    return (
        <p
            ref={pRef}
            className="min-w-0 text-[14px] font-bold leading-tight tracking-wide"
            style={{ color: C.ink, overflowWrap: "anywhere" }}
        >
            <span ref={textRef} />
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onInfo(); }}
                aria-label="Product details"
                className="ml-1 inline-flex h-3.5 w-3.5 -translate-y-px items-center justify-center rounded-full align-middle transition-colors hover:bg-black/[0.05]"
            >
                <Info className="h-3 w-3" style={{ color: C.muted }} />
            </button>
        </p>
    );
}

// Looping "finger taps" icon: rises in, presses down (squash) and sends out ONE ripple.
// Ripple: a ring closes in from 60% -> 20% (fading in 0 -> 1) as the finger lands,
// then on the click it bursts out to 110% and vanishes almost instantly.

function TapHand({ light = false, size = 26 }) {
    const reduce = useReducedMotion();
    const color = light ? "#fff" : C.brand;
    const box = size + 10;
    const rgb = light ? "255,255,255" : "222,83,7";

    // 100% ring size = the icon box, so 110% just slightly overshoots it
    const ring = box;

    const tipX = (box - size) / 2 + (8 / 24) * size + 0.20;
    const tipY = (box - size) + (2 / 24) * size - 3;

    // Shared timeline: the click lands at 0.55 of the 2.4s loop
    const CLICK = 0.55;

    return (
        <span
            className="relative flex shrink-0 items-end justify-center"
            style={{ width: box, height: box }}
        >
            {!reduce && (
                <motion.span
                    aria-hidden
                    className="pointer-events-none absolute"
                    style={{
                        left: tipX - ring / 2,
                        top: tipY - ring / 2,
                        width: ring,
                        height: ring,
                    }}
                    animate={{ y: [8, 0, 0, 4.7, 0, 0] }}
                    transition={{
                        duration: 2.4,
                        times: [0, 0.22, 0.45, CLICK, 0.7, 1],
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                >
                    <motion.span
                        className="block h-full w-full rounded-full"
                        style={{
                            border: `1px solid rgba(${rgb},0.95)`,
                            background: `rgba(${rgb},0.16)`,
                        }}
                        animate={{
                            // 60% -> 20% while the finger comes down, then burst out to 110%
                            scale: [0.6, 0.2, 1.1, 0.6],
                            // fades in 0 -> 1 on approach, then drops to 0 fast after the click
                            opacity: [0, 1, 0.7, 0, 0],
                        }}
                        transition={{
                            repeat: Infinity,
                            duration: 2.4,
                            scale: {
                                duration: 2.4,
                                repeat: Infinity,
                                times: [0, CLICK, 0.66, 1],
                                ease: ["easeInOut", "easeOut", "linear"],
                            },
                            opacity: {
                                duration: 2.4,
                                repeat: Infinity,
                                times: [0, CLICK, 0.6, 0.66, 1],
                                ease: ["linear", "easeOut", "easeOut", "linear"],
                            },
                        }}
                    />
                </motion.span>
            )}

            <motion.span
                className="relative flex"
                style={{ color }}
                animate={
                    reduce
                        ? undefined
                        : {
                            y: [8, 0, 0, 3, 0, 0],
                            scale: [1, 1, 1, 0.84, 1, 1],
                            opacity: [0, 1, 1, 1, 1, 0],
                        }
                }
                transition={{
                    duration: 2.4,
                    times: [0, 0.22, 0.45, CLICK, 0.7, 1],
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
            >
                <Pointer size={size} strokeWidth={2.2} />
            </motion.span>
        </span>
    );
}

// Pulsing orange ring around the first product row.
function HintRing() {
    const reduce = useReducedMotion();
    return (
        <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-x-1.5 inset-y-0.5 rounded-2xl"
            style={{ boxShadow: `inset 0 0 0 1.5px ${C.brand}`, background: "rgba(222,83,7,0.035)" }}
            initial={{ opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: [0.55, 1, 0.55] }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={reduce ? { duration: 0.2 } : { duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />
    );
}

// Horizontal centre of the TapHand icon inside the strip:
// pl-2.5 (10px) + chevrons (18px) + gap-2 (8px) + half of the hand box (~16px).
function TapHintStrip({ onClick }) {
    const reduce = useReducedMotion();
    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="overflow-hidden"
        >
            <div className="px-3 pb-3 sm:px-4">
                <motion.button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onClick(); }}
                    whileTap={{ scale: 0.97 }}
                    aria-label="Tap to see pricing, suppliers and buy options"
                    className="relative flex w-full items-center gap-2 overflow-hidden rounded-xl py-2 pl-2.5 pr-3 text-left text-white"
                    style={{
                        background: `linear-gradient(100deg, ${C.brand} 0%, ${C.brandDeep} 100%)`,
                        boxShadow: "0 8px 18px -10px rgba(222, 72, 7, 0.75)",
                    }}
                >

                    <motion.span
                        className="flex shrink-0"
                        animate={reduce ? undefined : { y: [0, -3, 0], opacity: [0.65, 1, 0.65] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                    >
                        <ChevronsUp size={18} strokeWidth={2.6} />
                    </motion.span>
                    <TapHand light size={22} />
                    <span className="min-w-0 flex-1 text-[11.5px] font-bold leading-snug tracking-wide">
                        Tap to see pricing, suppliers and buy options
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.6} />
                </motion.button>
            </div>
        </motion.div>
    );
}

function ProductRow({ item, idx, isOpen, onToggle, onInfo, onImageOpen, includeGst, animateEntrance, isLoggedIn, onRequireLogin, isFollowed, onToggleFollow, shopMode = false, isOpening = false, onPrefetch, showTapHint = false, isOwnShop = false, onShareProduct }) {
    const subLabel = [item.brand_name, item.model_no].filter(Boolean).join(" · ");
    const categoryLabel = isHiddenLabel(item.category_name) ? null : item.category_name;
    const subcategoryLabel = isHiddenLabel(item.subcategory_name) ? null : item.subcategory_name;

    const packaging = packagingLabel(
        item.lowest_price_pack_size,
        item.lowest_price_master_pack_size,
        item.lowest_price_unit
    );

    const toTitleCase = (str = "") => str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

    const isOutOfStock = isFeedRowOutOfStock(item);

    // In a store view on phones, the slider is the only way to buy (same as the seller list).
    const guardedToggle = () => {
        if (isOwnShop) return;
        if (shopMode && typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) return;
        onToggle();
    };

    const breakdown = useMemo(() => {
        if (item.lowest_price == null) return null;
        return computePriceBreakdown({
            price: item.lowest_price,
            packSize: item.lowest_price_pack_size,
            masterPackSize: item.lowest_price_master_pack_size,
            gstPercent: item.lowest_price_gst_percent,
            includeGst,
            isCustomPriced: item.lowest_price_is_custom,
        });
    }, [item.lowest_price, item.lowest_price_pack_size, item.lowest_price_master_pack_size, item.lowest_price_gst_percent, item.lowest_price_is_custom, includeGst]);

    // Prefetch on real hover intent (120ms), or immediately on press/touch.
    const prefetchTimer = useRef(null);
    useEffect(() => () => clearTimeout(prefetchTimer.current), []);
    const startPrefetch = () => {
        if (!onPrefetch) return;
        clearTimeout(prefetchTimer.current);
        prefetchTimer.current = setTimeout(onPrefetch, 120);
    };
    const stopPrefetch = () => clearTimeout(prefetchTimer.current);

    const priceVerifying = item._priceVerified === false;

    return (
        <motion.div
            initial={animateEntrance ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            onPointerEnter={startPrefetch}
            onPointerLeave={stopPrefetch}
            onPointerDown={() => { stopPrefetch(); onPrefetch?.(); }}
            transition={{
                duration: 0.2,
                delay: animateEntrance ? Math.min(idx * 0.012, 0.18) : 0,
                ease: EASE,
            }}
            className={`relative w-full ${showTapHint ? "rounded-2xl" : ""}`}
            style={{
                background: isOpen ? C.hairSoft : "transparent",
                opacity: isOutOfStock ? 0.5 : isOpening ? 0.7 : 1,
            }}
        >
            <AnimatePresence>{showTapHint && <HintRing key="hint-ring" />}</AnimatePresence>
            <div className={`grid w-full grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-3 px-3 pt-3 sm:px-4 ${shopMode ? "pb-2.5" : "pb-3 min-h-[7.5rem]"}`}
            >
                {/* COL 1 — IMAGE */}
                <div className="flex h-full items-center justify-center">
                    <span
                        className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                        style={{ borderColor: C.hair, background: C.imgBg }}
                    >
                        <ProductImage src={item.image} alt="" onOpen={onImageOpen} priority={idx < 3} />
                    </span>
                </div>

                {/* COL 2 — PRODUCT INFO + PACKAGING */}
                <div
                    onClick={guardedToggle}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); guardedToggle(); } }}
                    role="button"
                    tabIndex={0}
                    className="min-w-0 cursor-pointer text-left min-h-[5rem] flex flex-col justify-center"
                >
                    <ProductNameWithInfo name={toTitleCase(item.name)} onInfo={onInfo} />
                    <p
                        className="mt-0.5 flex min-w-0 items-center gap-1 truncate uppercase text-[11.5px] font-bold tracking-wider"
                        style={{ color: "#006F83" }}
                    >
                        <BrandBadge name={item.brand_name} image={item.brand_image} />
                        <span className="truncate">{subLabel}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[10.5px] font-medium tracking-wide" style={{ color: C.muted }}>
                        {categoryLabel ? `${categoryLabel} · ` : ""}
                        {subcategoryLabel}
                    </p>
                    {!shopMode && <p
                        className="mt-1 text-[10px] sm:text-[11px] md:text-[11.5px] font-semibold leading-tight tracking-wide min-h-[1.2em]"
                        style={{ color: C.secondary }}
                    >
                        {packaging && !priceVerifying ? packaging : "\u00A0"}
                    </p>}
                    {shopMode && <p
                        className="mt-1 text-[11px] sm:text-[12px] md:text-[12.5px] font-semibold leading-tight tracking-wide min-h-[1.2em]"
                        style={{ color: C.secondary }}
                    >
                        {packaging && !priceVerifying ? packaging : "\u00A0"}
                    </p>}
                </div>

                {/* COL 3 — FOLLOW + PRICE */}
                <div
                    role="button"
                    tabIndex={0}
                    onClick={guardedToggle}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); guardedToggle(); } }}
                    aria-label={shopMode ? "Buy from this store" : isOpen ? "Collapse sellers" : "Expand sellers"}
                    className="flex h-full shrink-0 flex-col items-end justify-center gap-1 text-right cursor-pointer"
                >
                    <div className="flex items-center gap-1">
                        {/* {isLoggedIn && !isOutOfStock && <PriceTrendBadge trend={item.price_trend} />} */}
                        <FollowButton following={isFollowed} onToggle={onToggleFollow} />
                    </div>
                    {isOutOfStock ? (
                        <span className="rounded-full px-2 py-1 text-[10px] font-extrabold tracking-wide" style={{ background: "#f1f1f1", color: C.muted }}>
                            OUT OF STOCK
                        </span>
                    ) : !isLoggedIn ? (
                        <LockedPriceBlock seed={item.id} unit={item.lowest_price_unit} size="row" onClick={onRequireLogin} />
                    ) : priceVerifying ? (
                        <div className="flex flex-col items-end gap-1.5 py-1">
                            <span className="h-2.5 w-14 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                            <span className="h-3 w-16 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                            <span className="h-3 w-12 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                        </div>
                    ) : (
                        <>
                            {((isLoggedIn && item.price_trend) || (breakdown && !shopMode)) && (
                                <div className="flex items-center gap-1.5">
                                    {isLoggedIn && <PriceTrendBadge trend={item.price_trend} />}
                                    {breakdown && !shopMode && (
                                        <span className="text-[10px] font-semibold uppercase leading-tight tracking-wider" style={{ color: C.muted }}>from</span>
                                    )}
                                </div>
                            )}
                            <PriceBreakdown breakdown={breakdown} unit={item.lowest_price_unit} size="row" />
                        </>
                    )}
                </div>
            </div>

            {shopMode && (
                <ShopOfferStrip
                    offer={item.shop_offer}
                    masterPackSize={item.lowest_price_master_pack_size}
                    outOfStock={isOutOfStock}
                    opening={isOpening}
                    onBuy={onToggle}
                    isOwner={isOwnShop}
                    onShare={onShareProduct}
                />
            )}

            <AnimatePresence>
                {showTapHint && <TapHintStrip key="hint-strip" onClick={guardedToggle} />}
            </AnimatePresence>
        </motion.div>
    );
}

import { deriveDisplayPrices, hasOuterPack, getSaleUnit } from "../../shared/packUnits.js";


function computePriceBreakdown({ price, packSize, masterPackSize, gstPercent, includeGst, isCustomPriced }) {
    const sourcePrice = Number(price);
    if (!(sourcePrice > 0)) return null;
    const gst = Number(gstPercent) || 0;
    const priceExGst = includeGst ? sourcePrice : sourcePrice / (1 + gst / 100);
    const { perBaseUnit, perPack, perMasterPack } = deriveDisplayPrices(priceExGst, packSize, masterPackSize);

    const outer = hasOuterPack(masterPackSize);
    const packQty = Number(packSize) > 0 ? Number(packSize) : 1;               // base units in 1 pack
    const masterQty = outer ? packQty * Number(masterPackSize) : null;         // base units in 1 master pack

    return {
        unitPrice: perBaseUnit, packPrice: perPack, masterPackPrice: perMasterPack,
        hasMasterPack: outer, basis: getSaleUnit(masterPackSize),
        isCustomPriced: !!isCustomPriced,
        packQty, masterQty,
    };
}

// Single source of truth for "what does this seller actually charge at qty X",
// used by BOTH tabs so there's never a second, diverging implementation.
// Also returns packQty/masterQty (base units per pack / master pack) so the
// seller row can label prices exactly like the product header does.
function computeEffectivePricing(seller, saleQty, includeGst) {
    const gst = Number(seller.gst_percent) || 0;
    const pricePerSaleUnit = includeGst ? Number(seller.price) : Number(seller.price) / (1 + gst / 100);
    if (!(pricePerSaleUnit > 0)) return null;

    const slabPricePerSaleUnit = resolveSlabUnitPrice(seller.price_slabs, saleQty, pricePerSaleUnit);
    const discountPercent = resolveDiscountPercent(seller.quantity_discounts, saleQty);
    const finalPricePerSaleUnit = slabPricePerSaleUnit * (1 - discountPercent / 100);

    const orig = deriveDisplayPrices(slabPricePerSaleUnit, seller.pack_size, seller.units_per_master_pack);
    const fin = deriveDisplayPrices(finalPricePerSaleUnit, seller.pack_size, seller.units_per_master_pack);
    const outer = hasOuterPack(seller.units_per_master_pack);

    const packQty = Number(seller.pack_size) > 0 ? Number(seller.pack_size) : 1;
    const masterQty = outer ? packQty * Number(seller.units_per_master_pack) : null;

    return {
        saleUnit: getSaleUnit(seller.units_per_master_pack), saleQty, discountPercent, hasMasterPack: outer,
        packQty, masterQty,
        unit: { original: orig.perBaseUnit, final: fin.perBaseUnit },
        pack: { original: orig.perPack, final: fin.perPack },
        masterPack: outer ? { original: orig.perMasterPack, final: fin.perMasterPack } : null,
    };
}

function moqInSaleUnits(seller) {
    return Math.max(1, Number(seller.moq) || 1);
}

// Single definition of "out of stock", used by the list order, the row
// styling and the badge, so they can never disagree.
function isSellerOutOfStock(s) {
    return s.stock_type === "ready_stock" && Number(s.stock_quantity) < moqInSaleUnits(s);
}

// "Best price" tab only: search every real breakpoint (MOQ + every
// slab/discount minQty at or above it) and surface whichever gives the
// lowest actual price. This is the piece deliberately NOT moved into SQL
// in this revision — see the file header note on why.
function candidateSaleQuantities(seller) {
    const moq = moqInSaleUnits(seller);
    const quantities = new Set([moq]);
    (seller.price_slabs || []).forEach((s) => { const q = Number(s.minQty); if (q >= moq) quantities.add(q); });
    (seller.quantity_discounts || []).forEach((d) => { const q = Number(d.minQty); if (q >= moq) quantities.add(q); });
    return Array.from(quantities).sort((a, b) => a - b);
}

function bestAchievablePricing(seller, includeGst) {
    const quantities = candidateSaleQuantities(seller);
    let best = null;
    for (const qty of quantities) {
        const pricing = computeEffectivePricing(seller, qty, includeGst);
        if (!pricing) continue;
        if (!best || pricing.pack.final < best.pack.final) best = pricing;
    }
    return best || computeEffectivePricing(seller, moqInSaleUnits(seller), includeGst);
}

function LoginPromptModal({ open, message, onConfirm, onCancel }) {
    if (!open) return null;
    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4"
            onClick={onCancel}
        >
            <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.18, ease: EASE }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-[320px] rounded-2xl bg-white p-5 shadow-xl"
            >
                <div
                    className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full"
                    style={{ background: `${C.primary} 14` }}
                >
                    <Lock className="h-5 w-5" style={{ color: C.primary }} strokeWidth={2.5} />
                </div>
                <p className="text-center text-[14.5px] font-extrabold tracking-wide" style={{ color: C.ink }}>
                    Login required
                </p>
                <p className="mt-1.5 text-center text-[12.5px] font-medium leading-snug tracking-wide" style={{ color: C.muted }}>
                    {message || "You need to login to view seller pricing and place an order."}
                </p>
                <div className="mt-5 flex gap-2">
                    <button
                        onClick={onCancel}
                        className="flex-1 rounded-xl border py-2.5 text-[12.5px] font-bold tracking-wide"
                        style={{ borderColor: C.hair, color: C.ink }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 rounded-xl py-2.5 text-[12.5px] font-bold text-white tracking-wide"
                        style={{ background: C.primary }}
                    >
                        Login
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

function useLenisPreventToggle() {
    const lenis = useLenis();
    const ref = useRef(null);
    const touchStartYRef = useRef(0);

    const isAtBlockingEdge = useCallback((deltaY) => {
        const el = ref.current;
        if (!el) return true;
        const { scrollTop, scrollHeight, clientHeight } = el;
        const atTop = scrollTop <= 0;
        const atBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight;
        return (atTop && deltaY < 0) || (atBottom && deltaY > 0);
    }, []);

    const forwardToLenis = useCallback((deltaY) => {
        if (lenis && typeof lenis.scrollTo === "function") {
            lenis.scrollTo(lenis.scroll + deltaY, { immediate: true });
        } else {
            window.scrollBy(0, deltaY); // fallback if Lenis isn't mounted yet
        }
    }, [lenis]);

    const handleWheel = useCallback((e) => {
        if (isAtBlockingEdge(e.deltaY)) forwardToLenis(e.deltaY);
        else e.stopPropagation();
    }, [isAtBlockingEdge, forwardToLenis]);

    // components/home/HomeProductFeed.jsx — inside useLenisPreventToggle
    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        // Anything inside a price editor or the swipe-to-buy slider handles
        // its own drag/scroll — the list's own capture-phase listener must
        // never intercept those events, since capture fires before those
        // controls' own handlers ever get a chance to run.
        const isInsideOwnGesture = (e) => !!e.target?.closest?.("[data-price-editor],[data-swipe-buy]");

        const onTouchStart = (e) => {
            if (isInsideOwnGesture(e)) return;
            touchStartYRef.current = e.touches[0].clientY;
        };
        const onTouchMove = (e) => {
            if (isInsideOwnGesture(e)) return;
            const currentY = e.touches[0].clientY;
            const deltaY = touchStartYRef.current - currentY;
            touchStartYRef.current = currentY;
            if (isAtBlockingEdge(deltaY)) { e.preventDefault(); forwardToLenis(deltaY); }
            else e.stopPropagation();
        };

        el.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
        el.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
        return () => {
            el.removeEventListener("touchstart", onTouchStart, { capture: true });
            el.removeEventListener("touchmove", onTouchMove, { capture: true });
        };
    }, [isAtBlockingEdge, forwardToLenis]);

    return { ref, handleWheel };
}

const SLIDE_KNOB = 40;
const SLIDE_KNOB_COMPACT = 32;
const SLIDE_PAD = 4;

// Slide-to-confirm. Used for "Swipe to buy" and for the own-listing
// "Slide to confirm changes". Knob + progress fill use the buy colour (orange);
// the track stays a soft neutral so the white chevron on the knob reads clearly.
function SlideToConfirm({
    label, onConfirm, busy, resetKey, disabled = false,
    compact = false, busyLabel = "Updating…", doneLabel = "Updated",
}) {
    const knob = compact ? SLIDE_KNOB_COMPACT : SLIDE_KNOB;
    const trackRef = useRef(null);
    const x = useMotionValue(0);
    const [maxX, setMaxX] = useState(0);
    const [confirmed, setConfirmed] = useState(false);

    // ResizeObserver instead of a one-time measure: when the track is
    // inside a Tailwind `md:hidden` block, it measures 0 while hidden and
    // gets its real width the moment the breakpoint flips.
    useEffect(() => {
        const el = trackRef.current;
        if (!el) return;
        const measure = () => setMaxX(Math.max(0, el.offsetWidth - knob - SLIDE_PAD * 2));
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [knob]);

    useEffect(() => {
        setConfirmed(false);
        animate(x, 0, { duration: 0.2 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey]);

    const fillWidth = useTransform(x, (v) => v + knob + SLIDE_PAD * 2);
    const labelOpacity = useTransform(x, [0, Math.max(maxX * 0.6, 1)], [1, 0]);

    return (
        <div
            ref={trackRef}
            className={`relative ${compact ? "h-10" : "h-12"} w-full overflow-hidden rounded-full select-none`}
            style={{ background: "#FDE9E2", opacity: disabled ? 0.5 : 1 }}
        >
            <motion.div
                className="pointer-events-none absolute inset-y-0 left-0 rounded-full"
                style={{ width: fillWidth, background: `${C.buy}33` }}
            />
            <motion.p
                className={`pointer-events-none absolute inset-0 flex items-center justify-center text-center ${compact ? "text-[10px] whitespace-nowrap" : "text-[11px]"} font-bold tracking-wide`}
                style={{
                    color: C.buyDeep,
                    paddingLeft: knob + SLIDE_PAD * 2,
                    paddingRight: compact ? SLIDE_PAD * 2 : knob + SLIDE_PAD * 2,
                    opacity: busy || confirmed ? 1 : labelOpacity,
                }}
            >
                {busy ? busyLabel : confirmed ? doneLabel : label}
            </motion.p>
            <motion.div
                drag={busy || confirmed || disabled ? false : "x"}
                dragConstraints={{ left: 0, right: maxX }}
                dragElastic={0}
                dragMomentum={false}
                onDragEnd={() => {
                    if (maxX > 0 && x.get() >= maxX * 0.85) {
                        animate(x, maxX, { duration: 0.12 });
                        setConfirmed(true);
                        onConfirm();
                    } else {
                        animate(x, 0, { type: "spring", stiffness: 500, damping: 40 });
                    }
                }}
                className="absolute flex items-center justify-center rounded-full text-white"
                style={{
                    x,
                    top: SLIDE_PAD,
                    left: SLIDE_PAD,
                    width: knob,
                    height: knob,
                    background: C.buy,
                    boxShadow: "0 4px 10px -4px rgba(244, 81, 30, 0.75)",
                    cursor: disabled ? "not-allowed" : "grab",
                    touchAction: "pan-y",
                }}
                whileTap={disabled ? undefined : { cursor: "grabbing" }}
            >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
            </motion.div>
        </div>
    );
}

function sellerPricingForMode(seller, sortMode, includeGst) {
    if (sortMode === "min_moq") {
        return computeEffectivePricing(seller, moqInSaleUnits(seller), includeGst);
    }
    return bestAchievablePricing(seller, includeGst); // "best_price" and "fastest_delivery" both show effective-at-MOQ-style pricing here
}

const TREND_EPS = 5e-5;

// MUST match pricePerBaseUnit() in catalog.controller.js exactly.
function pricePerBaseUnit(price, packSize, masterPackSize) {
    const p = Number(price);
    if (!(p > 0)) return null;
    const pack = Number(packSize) > 0 ? Number(packSize) : 1;
    const master = Number(masterPackSize) > 0 ? Number(masterPackSize) : 1;
    return Math.round((p / (pack * master)) * 10000) / 10000;
}

// Mirrors the SQL rule: new price differs from the last shown one =>
// prev = last shown, cur = new. `pending` = not yet confirmed by the server.
function nextPriceTrend(trend, ppu) {
    if (ppu == null) return trend;
    if (!trend || trend.cur == null) return { cur: ppu, prev: null, dir: 0, pending: true };
    if (Math.abs(trend.cur - ppu) < TREND_EPS) return trend;
    return { cur: ppu, prev: trend.cur, dir: ppu < trend.cur ? -1 : 1, pending: true };
}

function applyLowestToItem(it, best) {
    const next = {
        ...it,
        lowest_price: best?.price ?? null,
        lowest_price_pack_size: best?.pack_size ?? null,
        lowest_price_master_pack_size: best?.units_per_master_pack ?? null,
        lowest_price_unit: best?.unit ?? null,
        lowest_price_gst_percent: best?.gst_percent ?? null,
        lowest_price_is_custom: best?.is_custom_priced ?? false,
        lowest_price_stock_type: best?.stock_type ?? null,
        lowest_price_available_stock: best?.stock_quantity ?? null,
        lowest_price_moq: best?.moq ?? null,
    };
    // undefined = row isn't tracked (e.g. search results) -> leave alone.
    // Out-of-stock "best" is never a shown price -> baseline is not touched.
    if (it.price_trend !== undefined && best && !isSellerOutOfStock(best)) {
        next.price_trend = nextPriceTrend(
            it.price_trend,
            pricePerBaseUnit(best.price, best.pack_size, best.units_per_master_pack)
        );
    }
    return next;
}

// Small filled triangle (ticker-style). Points down for a drop, up for a rise.
function TrendGlyph({ down, className }) {
    return (
        <svg viewBox="0 0 8 8" className={className} aria-hidden="true">
            <path d={down ? "M4 7 0.9 1.6h6.2z" : "M4 1 7.1 6.4H0.9z"} fill="currentColor" />
        </svg>
    );
}

// Green dot = cheaper than the last price you saw, red dot = more expensive.
// No chip/border: just a rippling dot and the percentage.

// Optical alignment: digits sit a touch below the line box's geometric middle,
// so the dot is nudged down by this many whole pixels. Try 0, 1 or 2.
const DOT_NUDGE_Y = 1;

function PriceTrendBadge({ trend }) {
    const reduce = useReducedMotion();
    const dir = Number(trend?.dir) || 0;
    if (!dir || !(trend.prev > 0) || !(trend.cur > 0)) return null;

    const down = dir < 0;
    const pct = Math.abs((trend.cur - trend.prev) / trend.prev) * 100;
    const pctLabel = pct < 1 ? "<1%" : `${Math.round(pct)}%`;
    const color = down ? "#059669" : "#B3261E";
    const label = `Price ${down ? "dropped" : "rose"} ${pctLabel} since you last saw it`;

    // Dot and ripple live in the SAME grid cell and are centred by the grid itself,
    // so they always share one exact centre (no manual left/top offsets).
    const dotStyle = { gridArea: "1 / 1", width: 6, height: 6, borderRadius: "9999px", background: color, placeSelf: "center" };

    return (
        <motion.span
            // Re-key on any change so a new movement replays the entrance once.
            key={`${dir}-${trend.cur}`}
            role="img"
            aria-label={label}
            title={label}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="inline-flex shrink-0 select-none items-center gap-1.5 text-[10px] font-extrabold leading-none tracking-wide tabular-nums"
            style={{ color }}
        >
            {/* Dot + ripple */}
            <span
                aria-hidden
                className="shrink-0"
                style={{
                    display: "grid",
                    placeItems: "center",
                    width: 8,
                    height: 8,
                    position: "relative",
                    top: DOT_NUDGE_Y,
                }}
            >
                {!reduce && (
                    <motion.span
                        className="pointer-events-none"
                        style={dotStyle}
                        initial={{ opacity: 0.5, scale: 1 }}
                        animate={{ opacity: 0, scale: 3 }}
                        transition={{
                            duration: 1.1,
                            ease: "easeOut",
                            delay: 0.15,
                            repeat: Infinity,   // constant "live" pulse
                            repeatDelay: 0.4,
                        }}
                    />
                )}
                <motion.span
                    style={dotStyle}
                    initial={reduce ? false : { scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 520, damping: 22, delay: 0.08 }}
                />
            </span>
            <span>{pctLabel}</span>
        </motion.span>
    );
}

function computeListingLowestFromSellers(sellers) {
    let bestIn = null;
    let bestOut = null;
    for (const s of sellers) {
        const price = Number(s.price);
        if (!(price > 0)) continue;
        if (isSellerOutOfStock(s)) {
            if (!bestOut || price < Number(bestOut.price)) bestOut = s;
        } else if (!bestIn || price < Number(bestIn.price)) {
            bestIn = s;
        }
    }
    return bestIn || bestOut;
}

// ─────────────────────────────────────────────────────────────────────────────
// DELIVERABILITY: which sellers can actually deliver to the buyer's selected address.
// Uses `dispatching_locations` on the seller row when the RPC provides it; otherwise
// lazily loads each seller's order constraints (max 6 at a time) into a module-level
// cache (60s TTL, shared across dropdowns), so reopening a list is instant.
// While a seller's data is still loading we treat it as deliverable (no false blocks);
// checkout re-validates on the server regardless.
// ─────────────────────────────────────────────────────────────────────────────
const CONSTRAINTS_TTL_MS = 60000;
const constraintsCache = new Map();    // submissionId -> { t, locations } | { t, failed: true }
const constraintsInflight = new Map(); // submissionId -> Promise

function loadDispatchingLocations(submissionId) {
    const hit = constraintsCache.get(submissionId);
    if (hit && Date.now() - hit.t < CONSTRAINTS_TTL_MS) return Promise.resolve(hit);
    if (constraintsInflight.has(submissionId)) return constraintsInflight.get(submissionId);

    const p = Promise.resolve()
        .then(() => fetchOrderConstraints(submissionId))
        .then((res) => {
            const entry = res?.success ? { t: Date.now(), locations: res.dispatchingLocations } : { t: Date.now(), failed: true };
            constraintsCache.set(submissionId, entry);
            return entry;
        })
        .catch(() => {
            const entry = { t: Date.now(), failed: true };
            constraintsCache.set(submissionId, entry);
            return entry;
        })
        .finally(() => { constraintsInflight.delete(submissionId); });

    constraintsInflight.set(submissionId, p);
    return p;
}

const hasEmbeddedLocations = (s) => Object.prototype.hasOwnProperty.call(s, "dispatching_locations");

function useSellerDeliverability(sellers, address, enabled) {
    const [version, setVersion] = useState(0);
    const aliveRef = useRef(true);
    useEffect(() => {
        aliveRef.current = true;
        return () => { aliveRef.current = false; };
    }, []);

    const city = address?.city || "";
    const state = address?.state || "";
    const pincode = address?.pincode || "";
    const active = !!enabled && /^\d{6}$/.test(pincode) && !!city && !!state;

    const idsKey = active
        ? sellers.filter((s) => s.submission_id && !hasEmbeddedLocations(s)).map((s) => s.submission_id).join(",")
        : "";

    useEffect(() => {
        if (!active || !idsKey) return;
        const ids = idsKey.split(",").filter(Boolean);
        let cancelled = false;
        (async () => {
            for (let i = 0; i < ids.length; i += 6) {
                await Promise.all(ids.slice(i, i + 6).map(loadDispatchingLocations));
                if (cancelled || !aliveRef.current) return;
                setVersion((v) => v + 1);
            }
        })();
        return () => { cancelled = true; };
    }, [active, idsKey]);

    // Returns null when deliverable/unknown, or the { serviceable:false, message } status.
    const check = (s) => {
        if (!active) return null;
        let locations;
        if (hasEmbeddedLocations(s)) {
            locations = s.dispatching_locations;
        } else {
            const hit = constraintsCache.get(s.submission_id);
            if (!hit || hit.failed) return null;
            locations = hit.locations;
        }
        const status = checkLocationServiceable(locations, { state, city });
        return status && status.serviceable === false ? status : null;
    };

    return { check, version };
}

// Inline seller accordion. `state` is { loading, items, error, total,
// hasMore } for this item's fetch — items already arrive from the
// backend correctly ordered for whichever `sortMode` was requested (see
// loadSellersFor in the parent). `buyerAddress` drives whether the
// "Fastest delivery" tab is even shown, and is what total_delivery_days
// on each seller row was computed against — and which sellers are shown
// as "Not deliverable" (no buy action at all).
function SellerDropdown({
    item, state, onBuySeller, onSell, includeGst, sortMode, onSortModeChange,
    currentUserId, onRequireLogin, isLoggedIn, buyerAddress, navigate,
    token, onOwnListingPriceApplied, onOwnListingPatched, onOwnListingSaved, onEditOwnListing,
}) {
    const { loading, isRefreshing, items = [], error, total = 0, hasMore } = state || {};

    const { ref: listRef, handleWheel } = useLenisPreventToggle();
    const { check: checkDeliverable, version: deliverabilityVersion } = useSellerDeliverability(items, buyerAddress, isLoggedIn);

    // Only the very first fetch (nothing on screen yet) shows the skeleton.
    const showSkeleton = loading && items.length === 0;

    const hasKnownDestination = !!(buyerAddress?.city && buyerAddress?.state);
    const availableSortOptions = useMemo(
        () => (hasKnownDestination ? SELLER_SORT_OPTIONS : SELLER_SORT_OPTIONS.filter((o) => o.value !== "fastest_delivery")),
        [hasKnownDestination]
    );

    const sortedItems = useMemo(() => {
        if (!items.length) return items;

        let list = items;
        if (sortMode === "best_price") {
            const withMeta = items.map((s) => ({ s, pricing: bestAchievablePricing(s, includeGst) }));
            withMeta.sort((a, b) => (a.pricing?.pack?.final ?? Infinity) - (b.pricing?.pack?.final ?? Infinity));
            list = withMeta.map((x) => x.s);
        }

        // Stable split: in-stock sellers keep their sorted order on top,
        // out-of-stock sellers keep theirs at the bottom.
        const inStock = [];
        const outOfStock = [];
        list.forEach((s) => (isSellerOutOfStock(s) ? outOfStock : inStock).push(s));
        return outOfStock.length ? [...inStock, ...outOfStock] : list;
    }, [items, sortMode, includeGst]);

    // "Fastest" badge must never land on an out-of-stock or non-deliverable seller.
    const fastestSubmissionId = useMemo(() => {
        if (sortMode !== "fastest_delivery" || !hasKnownDestination) return null;
        return sortedItems.find((s) => !isSellerOutOfStock(s) && !checkDeliverable(s))?.submission_id ?? null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sortMode, hasKnownDestination, sortedItems, deliverabilityVersion]);

    const firstOutOfStockId = useMemo(
        () => sortedItems.find(isSellerOutOfStock)?.submission_id ?? null,
        [sortedItems]
    );

    const alreadySelling = item?.has_own_listing === true;

    const [savingOwnPriceId, setSavingOwnPriceId] = useState(null);

    // Runs when the own-listing modal's slide-to-confirm completes. Saves the
    // price, the staged promotion plan, or both, then always re-syncs the row
    // from the server (which also repairs the optimistic price after a failure).
    const handleOwnPriceSave = async (submissionId, { basePrice, priceBasis, finalInclusive, priceChanged, promotionServices }) => {
        setSavingOwnPriceId(submissionId);
        let priceOk = null;
        let promoOk = null;
        let failMsg = null;

        if (priceChanged) {
            onOwnListingPriceApplied?.(submissionId, finalInclusive);
            const payload = { basePrice: String(basePrice), priceBasis, gstInclusive: false };
            let res = null;
            try { res = await updateSellerProductSubmission(token, submissionId, payload); } catch { res = null; }
            priceOk = !!res?.success;
            if (!priceOk) failMsg = res?.message || "Couldn't update the price. Try again.";
        }

        if (promotionServices) {
            const r = await savePromotionPlan(token, submissionId, promotionServices);
            promoOk = r.ok;
            if (r.ok) onOwnListingPatched?.(submissionId, r.patch);
            else failMsg = failMsg || r.message || "Couldn't update the promotion. Try again.";
        }

        setSavingOwnPriceId(null);
        onOwnListingSaved?.(saveResultMessage({ priceOk, promoOk, failMsg }));
    };

    return (
        <motion.div
            key="dropdown"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="overflow-hidden"
        >
            <div className="border-b px-3 py-2.5 sm:px-4" style={{ borderColor: C.hairSoft, background: "#FCFBF9" }}>
                <div className="flex flex-nowrap items-center justify-end gap-2 pb-2 overflow-x-auto">
                    {/* Pills stay mounted through a sort switch — never gated on loading */}
                    {items.length > 1 && (
                        <SellerSortToggle value={sortMode} onChange={onSortModeChange} options={availableSortOptions} />
                    )}
                </div>

                <div
                    ref={listRef}
                    onWheel={handleWheel}
                    className="max-h-64 overflow-y-auto overscroll-contain seller-scroll"
                    style={{ scrollbarGutter: "stable" }}
                >
                    {showSkeleton ? (
                        <div className="flex flex-col divide-y" style={{ borderColor: C.hairSoft }}>
                            <div className="flex items-center justify-between gap-3 py-3">
                                <div className="min-w-0 flex-1 space-y-1.5">
                                    <div className="h-2.5 w-32 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                                    <div className="h-2 w-24 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                                </div>
                                <div className="shrink-0 space-y-1.5 text-right">
                                    <div className="ml-auto h-2.5 w-12 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                                    <div className="ml-auto h-2 w-8 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                                </div>
                            </div>
                        </div>
                    ) : error ? (
                        <p className="py-3 text-center text-[12px] font-semibold" style={{ color: C.muted }}>{error}</p>
                    ) : sortedItems.length === 0 ? (
                        <p className="py-3 text-center text-[12px] font-semibold" style={{ color: C.muted }}>No sellers listing this yet.</p>
                    ) : (
                        <div className="flex flex-col divide-y" style={{ borderColor: C.hairSoft, opacity: isRefreshing ? 0.7 : 1, transition: "opacity 0.15s ease" }}>
                            {sortedItems.map((s) => {
                                const pricing = sellerPricingForMode(s, sortMode, includeGst);
                                const outOfStock = s.stock_type === "ready_stock" && Number(s.stock_quantity) < moqInSaleUnits(s);
                                const isOwn = isOwnSellerRow(s, currentUserId);
                                // Seller doesn't ship to the buyer's selected address -> no buy action at all.
                                const notDeliverable = !isOwn && !outOfStock && isLoggedIn ? checkDeliverable(s) : null;
                                const blocked = outOfStock || !!notDeliverable;
                                const totalDeliveryDays = s.total_delivery_days;
                                const isFastest = fastestSubmissionId != null && s.submission_id === fastestSubmissionId;

                                return (
                                    <Fragment key={s.submission_id}>
                                        {s.submission_id === firstOutOfStockId && (
                                            <p className="pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: C.muted }}>
                                                Out of stock
                                            </p>
                                        )}
                                        <motion.div
                                            key={s.submission_id}
                                            layout
                                            transition={{ layout: { duration: 0.35, ease: EASE } }}
                                            role="button"
                                            tabIndex={blocked ? -1 : 0}
                                            onClick={() => !blocked && !isOwn && onBuySeller(s)}
                                            onKeyDown={(e) => {
                                                if ((e.key === "Enter" || e.key === " ") && !blocked && !isOwn) { e.preventDefault(); onBuySeller(s); }
                                            }}
                                            aria-disabled={blocked || isOwn}
                                            className={`relative flex items-start gap-3 py-3 text-left transition-colors duration-150 bg-[#FCFBF9] max-md:cursor-default ${notDeliverable ? "cursor-not-allowed" : "hover:bg-black/[0.03] cursor-pointer"}`}
                                            style={outOfStock
                                                ? { opacity: 0.45, cursor: "not-allowed", pointerEvents: "none" }
                                                : notDeliverable ? { opacity: 0.62 } : undefined}
                                        >
                                            {/* Mobile only: swallow row taps so the slider is the only way to buy */}
                                            <div className="absolute inset-0 md:hidden" onClick={(e) => e.stopPropagation()} />
                                            {/* LEFT COL — seller info */}
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>
                                                    {s.display_name}{isOwn ? " (You)" : ""}
                                                </p>
                                                {(s.city || s.state) && (
                                                    <p className="mt-0.5 flex items-center gap-1 truncate text-[10.5px] font-medium tracking-wide" style={{ color: C.muted }}>
                                                        <MapPin className="h-3 w-3 shrink-0" /> {[s.city, s.state].filter(Boolean).join(", ")}
                                                    </p>
                                                )}
                                                <p className="mt-0.5 truncate text-[10.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                                    {s.moq ? `MOQ ${s.moq} ${priceUnitLabel(s.units_per_master_pack)} ` : priceUnitLabel(s.units_per_master_pack)}
                                                    {!notDeliverable && totalDeliveryDays != null ? ` · ~${totalDeliveryDays}d delivery` : ""}
                                                    {!notDeliverable && !s.is_custom_priced && pricing?.discountPercent > 0
                                                        ? ` · ${pricing.saleQty}+ ${pricing.saleUnit}${pricing.saleQty === 1 ? "" : "s"}: ${pricing.discountPercent}% off`
                                                        : ""}
                                                </p>
                                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                                    <FreightPill included={s.freight_included} />
                                                    {isFastest && <FastestBadge />}
                                                </div>
                                                {isOwn && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); onEditOwnListing(s.submission_id); }}
                                                        className="relative z-10 mt-2.5 rounded-lg px-2.5 py-1 text-[12.5px] font-bold tracking-wide text-white"
                                                        style={{ background: C.primary }}
                                                    >
                                                        Edit listing
                                                    </button>
                                                )}
                                            </div>

                                            {/* RIGHT COL — price + buy action (or the reason there is none) */}
                                            <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5 text-right">
                                                {outOfStock ? (
                                                    <span className="rounded-full px-2 py-1 text-[10px] font-extrabold tracking-wide" style={{ background: "#f1f1f1", color: C.muted }}>
                                                        OUT OF STOCK
                                                    </span>
                                                ) : notDeliverable ? (
                                                    <div className="relative z-10 flex max-w-[9.5rem] flex-col items-end gap-1">
                                                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-extrabold tracking-wide"
                                                            style={{ background: "#FDECEC", color: "#B3261E" }}>
                                                            <Ban className="h-2.5 w-2.5" strokeWidth={2.8} /> NOT DELIVERABLE
                                                        </span>
                                                        <span className="text-[10.5px] font-semibold leading-snug tracking-wide" style={{ color: C.muted }}>
                                                            Doesn't ship to {buyerAddress?.city}{buyerAddress?.state ? `, ${buyerAddress.state}` : ""}
                                                        </span>
                                                    </div>
                                                ) : !isLoggedIn ? (
                                                    <LockedPriceBlock seed={s.submission_id} unit={s.unit} size="pack" onClick={onRequireLogin} />
                                                ) : isOwn ? (
                                                    <OwnListingPriceCell
                                                        seller={s}
                                                        includeGst={includeGst}
                                                        token={token}
                                                        submitting={savingOwnPriceId === s.submission_id}
                                                        onApply={(payload) => handleOwnPriceSave(s.submission_id, payload)}
                                                    />
                                                ) : (
                                                    <>
                                                        {/* Mobile: price + swipe to buy, full width of the right column */}
                                                        <div className="relative z-10 flex w-[9.5rem] flex-col items-end gap-1.5 md:hidden">
                                                            <SellerPriceBlock pricing={pricing} unit={s.unit} />
                                                            <div data-swipe-buy="" className="w-full" onClick={(e) => e.stopPropagation()}>
                                                                <SlideToConfirm
                                                                    compact
                                                                    label="Swipe to buy"
                                                                    busyLabel="Opening…"
                                                                    doneLabel="Opening…"
                                                                    resetKey={s.submission_id}
                                                                    onConfirm={() => onBuySeller(s)}
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* md and up: price + Buy now button */}
                                                        <div className="hidden flex-col items-end gap-1.5 md:flex">
                                                            <SellerPriceBlock pricing={pricing} unit={s.unit} />
                                                            <span className="rounded-lg bg-[#F4511E] px-2.5 py-1 text-[12.5px] font-bold tracking-wide text-white shadow-[0_6px_14px_-8px_rgba(244,81,30,0.8)] transition-colors group-hover:bg-[#D83F0E]">
                                                                Buy now
                                                            </span>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </motion.div>
                                    </Fragment>
                                );
                            })}
                            {hasMore && (
                                <p className="pt-2 text-center text-[11px] font-semibold" style={{ color: C.muted }}>
                                    +{Math.max(total - items.length, 0)} more sellers
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {!showSkeleton && !alreadySelling && (
                    <button
                        onClick={onSell}
                        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-[#1E78D6] bg-[#1E78D6] px-3 py-2 text-[12.5px] font-bold tracking-wide text-white shadow-[0_8px_16px_-10px_rgba(30,120,214,0.9)] transition-colors duration-150 hover:border-[#1666B8] hover:bg-[#1666B8] active:scale-[0.99]"
                    >
                        <Store className="h-3.5 w-3.5" /> Sell this product
                    </button>
                )}
            </div>
        </motion.div>
    );
}

function RowSkeleton() {
    return (
        <div className="flex items-center gap-3 border-b px-3 py-3 sm:px-4" style={{ borderColor: C.hairSoft }}>
            <div className="h-16 w-16 shrink-0 animate-pulse rounded-xl" style={{ background: C.hairSoft }} />
            <div className="flex-1 space-y-2">
                <div className="h-3 w-2/5 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                <div className="h-2.5 w-1/4 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
            </div>
            <div className="h-3.5 w-14 shrink-0 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
        </div>
    );
}

// `q` is optional — pages that don't pass it (or pass "") get the exact
// same unfiltered behavior as before. Passing it wires up live search.
// `toolbar` is optional too: HomePage passes the Category strip + search bar,
// which this component renders inside its sticky block (see header note).
export default function HomeProductFeed({ category, q = "", shopSlug = null, brandName = null, toolbar = null, viaSellers = false }) {
    const params = useParams();
    const pathBrand = !!params.brandName;
    const pathShop = !!params.shopSlug;
    const navigate = useNavigate();
    const location = useLocation();
    const { profile, token, effectiveLoggedIn, needsOnboarding } = useAuth();
    const currentUserId = profile?.shop_slug ?? null;
    const [items, setItems] = useState([]);
    const seenItemIdsRef = useRef(new Set());
    const [total, setTotal] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [lightboxSrc, setLightboxSrc] = useState(null);

    const [editingSubmissionId, setEditingSubmissionId] = useState(null);
    const [infoItemId, setInfoItemId] = useState(null);

    const [sellerSortMode, setSellerSortMode] = useState("best_price");

    const [includeGst, setIncludeGst] = useState(true);

    const stickyTop = useHeaderStickyOffset();

    // Delivery address now comes from the shared context (same one shown at the top of Home),
    // so changing it there instantly updates delivery estimates in every seller list.
    const { selectedAddress: buyerAddress, shopName: myShopName } = useBuyerAddress();

    const clearBrand = () => {
        if (pathBrand) { navigate("/home"); return; }
        const next = new URLSearchParams(searchParams);
        next.delete("brand");
        setSearchParams(next, { replace: true });
    };

    const clearShop = () => {
        if (pathShop) { navigate("/home"); return; }
        const params = new URLSearchParams(location.search);
        params.delete("shop"); params.delete("via");
        setSearchParams(params);
    };

    const handleBrands = () => {
        if (brandName) { clearBrand(); return; }
        navigate("/brands");
    };

    // If the buyer's address becomes unavailable (logged out, fetch
    // failed) while "Fastest delivery" was selected, fall back to a mode
    // that still makes sense.
    useEffect(() => {
        if (sellerSortMode === "fastest_delivery" && !(buyerAddress?.city && buyerAddress?.state)) {
            setSellerSortMode("best_price");
        }
    }, [buyerAddress, sellerSortMode]);

    const [openItemId, setOpenItemId] = useState(null);
    const [sellerState, setSellerState] = useState({});
    const sellerAbortRef = useRef(null);

    const [buyState, setBuyState] = useState(null); // { item, seller }

    const [loginPrompt, setLoginPrompt] = useState(null);
    const isLoggedIn = effectiveLoggedIn;

    const [hintDismissed, setHintDismissed] = useState(readHintDismissedToday);
    const dismissHint = useCallback(() => {
        setHintDismissed(true);
        writeHintDismissedToday();
    }, []);
    // First in-stock row gets the highlight (an out-of-stock row would be a dead end).
    const firstHintId = useMemo(() => items.find((it) => !isFeedRowOutOfStock(it))?.id ?? null, [items]);
    // Browse mode only: store views buy via the slider, so "tap a product" doesn't apply there.
    const showHint = !hintDismissed && !shopSlug && !loading && items.length > 0;

    // Dismiss only when a sellers dropdown actually opens (not on pin / info / image taps).
    useEffect(() => {
        if (openItemId) dismissHint();
    }, [openItemId, dismissHint]);

    const [searchParams, setSearchParams] = useSearchParams();

    // Brand view comes from the URL (?brand=Name), set by the Brands page.
    const selectedBrands = useMemo(() => (brandName ? [brandName] : EMPTY), [brandName]);
    const brandsKey = brandName || "";
    const brandsRef = useRef(EMPTY);
    brandsRef.current = selectedBrands;

    const myShopSlug = profile?.shop_slug || null;
    const myShopActive = !!shopSlug && shopSlug === myShopSlug;
    const fromSellers = viaSellers;
    // Only one quick-action view is active at a time. Any store view lights up the Sellers tile.
    const activeTile = brandName ? "brands" : shopSlug ? "shop" : null;

    // Sellers tile: inside a store -> back to all products; otherwise open the Sellers page.
    const handleSellers = () => {
        if (shopSlug) { clearShop(); return; }
        navigate("/sellers");
    };

    // Store name for the banner.
    const [shopInfo, setShopInfo] = useState(null);
    useEffect(() => {
        if (!shopSlug) { setShopInfo(null); return; }
        const c = new AbortController();
        setShopInfo(null);
        fetchShopInfo(shopSlug, c.signal)
            .then((r) => { if (r?.success) setShopInfo(r.shop); })
            .catch(() => { /* banner falls back to the slug */ });
        return () => c.abort();
    }, [shopSlug]);

    const [followToast, setFollowToast] = useState(null); // { message, actionLabel?, onAction? }
    const [tipDismissed, setTipDismissed] = useState(() => readFlag(FOLLOW_TIP_KEY));
    const shopSlugRef = useRef(null);
    const categoryRef = useRef(null);
    const qRef = useRef("");
    shopSlugRef.current = shopSlug;
    categoryRef.current = category;
    qRef.current = q;

    const offerCacheRef = useRef(new Map());
    const shopRefreshTimerRef = useRef(null);
    const shopRefreshSeqRef = useRef(0);
    const [openingItemId, setOpeningItemId] = useState(null);

    useEffect(() => { offerCacheRef.current.clear(); }, [shopSlug, token]);
    useEffect(() => () => clearTimeout(shopRefreshTimerRef.current), []);
    const followToastTimerRef = useRef(null);

    const showToast = useCallback((toast, ms = 3000) => {
        clearTimeout(followToastTimerRef.current);
        setFollowToast(toast);
        followToastTimerRef.current = setTimeout(() => setFollowToast(null), ms);
    }, []);

    // Offer for one product from the shop being viewed. Prefetched on hover/touch,
    // short-lived so a stale price is never used for long.
    const getOffer = useCallback((itemId) => {
        const slug = shopSlugRef.current;
        const key = `${slug}::${itemId}`;
        const hit = offerCacheRef.current.get(key);
        if (hit && Date.now() - hit.t < OFFER_CACHE_MS) return hit.promise;
        const promise = fetchBrandItemSellerOffer(itemId, slug, { token }).catch(() => null);
        offerCacheRef.current.set(key, { t: Date.now(), promise });
        promise.then((res) => { if (!res?.success) offerCacheRef.current.delete(key); });
        return promise;
    }, [token]);

    // Shop mode: re-run the SAME feed query silently so price/custom price/visibility
    // always match what the server says this buyer can see.
    const refreshShopFeed = useCallback(() => {
        clearTimeout(shopRefreshTimerRef.current);
        shopRefreshTimerRef.current = setTimeout(async () => {
            const shop = shopSlugRef.current;

            if (!shop) return;
            const seq = ++shopRefreshSeqRef.current;
            const queryToken = queryTokenRef.current;
            const addr = buyerAddressRef.current;
            try {
                const res = await fetchBrandItemsFeed({
                    categoryId: categoryRef.current?.id || null,
                    q: qRef.current.trim(),
                    limit: Math.min(Math.max(itemsRef.current.length, PAGE_SIZE), 96),
                    offset: 0, token, shopSlug: shop,
                    brands: brandsRef.current,
                    destPincode: addr?.pincode || undefined, destState: addr?.state || undefined,
                });
                if (seq !== shopRefreshSeqRef.current) return;
                if (queryToken !== queryTokenRef.current || shopSlugRef.current !== shop) return;
                if (!res?.success) return;
                offerCacheRef.current.clear();
                setItems(res.items || []);
                setTotal(res.total ?? null);
                setHasMore(!!res.hasMore);
            } catch { /* next event retries */ }
        }, SHOP_REFRESH_DELAY_MS);
    }, [token]);

    const { isFollowed, toggle: toggleFollow } = useFollowedItems(isLoggedIn ? token : null, {
        onRevert: () => {
            showToast({ message: "Couldn't update." }, 2200);
        },
    });

    useEffect(() => () => clearTimeout(followToastTimerRef.current), []);

    const dismissTip = () => { setTipDismissed(true); writeFlag(FOLLOW_TIP_KEY); };

    const requireLogin = useCallback(
        (message) => setLoginPrompt({
            message: message || (needsOnboarding
                ? "Finish setting up your account to view seller pricing and place orders."
                : "You need to login to view seller pricing and place an order."),
        }),
        [needsOnboarding]
    );

    // Send the FULL current URL (path + query, e.g. "/home/?shop=shiv-shakti-auto-center")
    // to /login so AuthPage can bring the person back to exactly this store page
    // after login/onboarding, instead of a bare /home.
    const confirmLogin = useCallback(() => {
        setLoginPrompt(null);
        navigate("/login", {
            state: { from: `${location.pathname}${location.search}${location.hash || ""}` },
        });
    }, [navigate, location.pathname, location.search, location.hash]);
    const cancelLogin = useCallback(() => setLoginPrompt(null), []);


    const abortRef = useRef(null);
    const debounceRef = useRef(null);
    const queryTokenRef = useRef(0);
    const isFirstRun = useRef(true);
    const lastRunRef = useRef({ key: null, time: 0 });

    const shopDestKey = shopSlug ? (buyerAddress?.pincode || "") : "";

    const [highlightedItemId, setHighlightedItemId] = useState(null);
    const rowRefs = useRef({});
    const highlightTimeoutRef = useRef(null);

    // Fetches sellers for one product, sorted SERVER-SIDE (across the
    // full seller pool for that product) using whatever tab is currently
    // active — see the "FASTEST DELIVERY / MIN MOQ SORTING" note at the
    // top of this file for why this moved off the client.
    const loadSellersFor = useCallback((itemId, { silent = false } = {}) => {
        sellerAbortRef.current?.abort();
        const controller = new AbortController();
        sellerAbortRef.current = controller;

        setSellerState((prev) => ({
            ...prev,
            [itemId]: silent
                // Keep existing items + total on screen; just flag a quiet refresh.
                ? { ...(prev[itemId] || {}), isRefreshing: true }
                : { loading: true, items: [], error: null },
        }));

        const apiSort = sortModeToApiSort(sellerSortMode);

        fetchBrandItemSellers(itemId, {
            sort: apiSort,
            limit: SELLER_PAGE_SIZE,
            offset: 0,
            destPincode: buyerAddress?.pincode || undefined,
            destState: buyerAddress?.state || undefined,
            signal: controller.signal,
            token,
        })
            .then((res) => {
                if (!res?.success) {
                    setSellerState((prev) => ({
                        ...prev,
                        [itemId]: { loading: false, isRefreshing: false, items: [], error: "Couldn't load sellers." },
                    }));
                    return;
                }
                setSellerState((prev) => ({
                    ...prev,
                    [itemId]: {
                        loading: false,
                        isRefreshing: false,
                        items: res.items || [],
                        error: null,
                        total: res.total ?? (res.items || []).length,
                        hasMore: !!res.hasMore,
                    },
                }));
            })
            .catch((err) => {
                if (err?.name === "AbortError") return;
                setSellerState((prev) => ({
                    ...prev,
                    [itemId]: { loading: false, isRefreshing: false, items: [], error: "Couldn't load sellers." },
                }));
            });
    }, [token, sellerSortMode, buyerAddress]);

    const closeDropdown = useCallback(() => {
        sellerAbortRef.current?.abort();
        setOpenItemId(null);
    }, []);

    const toggleDropdown = useCallback((item) => {
        if (openItemId === item.id) {
            closeDropdown();
            return;
        }
        setOpenItemId(item.id);
        loadSellersFor(item.id);
    }, [openItemId, closeDropdown, loadSellersFor]);


    // ── REAL-TIME PRICE UPDATES ─────────────────────────────────────────
    const { socket, connected } = useSocket() || {};
    useEffect(() => {
        rtLog("socket state:", { hasSocket: !!socket, connected, id: socket?.id });
    }, [socket, connected]);

    // Logs EVERY event the socket receives, to check the event name
    useEffect(() => {
        if (!socket) return;
        const onConnect = () => rtLog("CONNECT", { id: socket.id, transport: socket.io?.engine?.transport?.name });
        const onDisconnect = (reason) => rtLog("DISCONNECT", reason);
        const onError = (err) => rtLog("CONNECT_ERROR", err?.message || err);
        const onReconnectAttempt = (n) => rtLog("RECONNECT_ATTEMPT", n);
        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);
        socket.on("connect_error", onError);
        socket.io?.on?.("reconnect_attempt", onReconnectAttempt);
        return () => {
            socket.off("connect", onConnect);
            socket.off("disconnect", onDisconnect);
            socket.off("connect_error", onError);
            socket.io?.off?.("reconnect_attempt", onReconnectAttempt);
        };
    }, [socket]);
    const itemsRef = useRef([]);
    const sellerStateRef = useRef({});
    const openItemIdRef = useRef(null);
    const loadSellersForRef = useRef(null);
    const buyerAddressRef = useRef(null);
    itemsRef.current = items;
    sellerStateRef.current = sellerState;
    openItemIdRef.current = openItemId;
    loadSellersForRef.current = loadSellersFor;
    buyerAddressRef.current = buyerAddress;

    const lastTsRef = useRef(new Map());        // drops out-of-order events
    const lowestTimersRef = useRef({});         // coalesces bursts per product
    const lowestSeqRef = useRef({});            // drops stale out-of-order refreshLowest responses
    const reconcileTimerRef = useRef(null);     // silent re-sync of the open dropdown after a patch

    // Product header = lowest price the SERVER says this buyer can see.
    // We probe a handful of sellers (not just 1): the raw-cheapest seller
    // may be out of stock, and computeListingLowestFromSellers needs at
    // least one in-stock candidate to prefer. Server-side means
    // visibility/wallet rules hold.
    const refreshLowest = useCallback((itemId) => {
        if (shopSlugRef.current) { refreshShopFeed(); return; }
        clearTimeout(lowestTimersRef.current[itemId]);
        lowestTimersRef.current[itemId] = setTimeout(async () => {
            const seq = (lowestSeqRef.current[itemId] = (lowestSeqRef.current[itemId] || 0) + 1);
            try {
                const addr = buyerAddressRef.current;
                const res = await fetchBrandItemSellers(itemId, {
                    sort: "price_asc", limit: LOWEST_PROBE_SIZE, offset: 0, token,
                    destPincode: addr?.pincode || undefined, destState: addr?.state || undefined,
                });
                // A newer refresh started while this one was in flight — ignore this stale answer.
                if (seq !== lowestSeqRef.current[itemId]) return;
                if (!res?.success) return;
                const best = computeListingLowestFromSellers(res.items || []);
                rtLog("refreshLowest result:", { itemId, probed: (res.items || []).length, bestPrice: best?.price, bestSeller: best?.display_name });
                setItems((prev) => prev.map((it) => (String(it.id) === String(itemId) ? applyLowestToItem(it, best) : it)));
            } catch { /* next event will retry */ }
        }, 120);
    }, [token, refreshShopFeed]);

    // Patches from the socket may not carry every derived field (price
    // slabs, discounts…), so shortly after an in-place patch we quietly
    // re-sync the open dropdown with the server's version.
    const scheduleReconcile = useCallback((itemId) => {
        clearTimeout(reconcileTimerRef.current);
        reconcileTimerRef.current = setTimeout(() => {
            if (String(openItemIdRef.current) === String(itemId)) {
                loadSellersForRef.current?.(itemId, { silent: true });
            }
        }, RECONCILE_DELAY_MS);
    }, []);

    useEffect(() => {
        if (!socket) return;
        const onUpdate = (evt) => {
            rtLog("listing:update received:", evt);
            const { brandItemId, submissionId, patch, available, ts } = evt || {};
            if (!brandItemId || !submissionId) {
                rtLog("DROP missing ids", { brandItemId, submissionId });
                return;
            }
            if ((lastTsRef.current.get(submissionId) || 0) > (ts || 0)) {
                rtLog("DROP out-of-order", { submissionId, ts, last: lastTsRef.current.get(submissionId) });
                return;
            }
            lastTsRef.current.set(submissionId, ts || 0);
            if (!itemsRef.current.some((it) => String(it.id) === String(brandItemId))) {
                rtLog("DROP product not in feed", { brandItemId, feedIds: itemsRef.current.map((i) => i.id) });
                return;
            }

            const entry = sellerStateRef.current[brandItemId];
            const known = entry?.items?.some((r) => r.submission_id === submissionId);
            rtLog("row known in dropdown?", known, "available?", available, "patch keys:", patch && Object.keys(patch));

            if (known) {
                setSellerState((prev) => {
                    const cur = prev[brandItemId];
                    if (!cur?.items) return prev;
                    const nextItems = available
                        ? cur.items.map((r) => (r.submission_id === submissionId ? { ...r, ...patch } : r))
                        : cur.items.filter((r) => r.submission_id !== submissionId);
                    const removed = cur.items.length - nextItems.length;
                    return { ...prev, [brandItemId]: { ...cur, items: nextItems, total: Math.max(0, (cur.total ?? cur.items.length) - removed) } };
                });
                if (String(openItemIdRef.current) === String(brandItemId)) scheduleReconcile(brandItemId);
            } else if (available && String(openItemIdRef.current) === String(brandItemId)) {
                rtLog("unknown row, silent reload");
                loadSellersForRef.current?.(brandItemId, { silent: true });
            }
            refreshLowest(brandItemId);
        };
        socket.on("listing:update", onUpdate);
        return () => socket.off("listing:update", onUpdate);
    }, [socket, refreshLowest, scheduleReconcile]);

    // After a dropped connection we may have missed events — resync quietly.
    const sawDisconnectRef = useRef(false);
    // Safety net: if the socket is down, poll the open product; and resync when the tab becomes visible again.
    useEffect(() => {
        const resync = () => {
            rtLog("resync (safety net)");
            if (openItemIdRef.current) loadSellersForRef.current?.(openItemIdRef.current, { silent: true });
            itemsRef.current.forEach((it) => refreshLowest(it.id));
        };
        const onVisible = () => { if (document.visibilityState === "visible") resync(); };
        document.addEventListener("visibilitychange", onVisible);
        const poll = !connected ? setInterval(resync, 15000) : null;
        return () => {
            document.removeEventListener("visibilitychange", onVisible);
            if (poll) clearInterval(poll);
        };
    }, [connected, refreshLowest]);
    useEffect(() => () => {
        Object.values(lowestTimersRef.current).forEach(clearTimeout);
        clearTimeout(reconcileTimerRef.current);
    }, []);

    // Keep the product header price in step with the OPEN dropdown's list.
    // Only trusts a FULLY loaded list of the open product: closed products'
    // cached lists can be stale, and a partial page (hasMore) may not
    // contain the true cheapest seller — both used to overwrite a correct
    // header price. refreshLowest covers those cases from the server.
    useEffect(() => {
        if (!openItemId) return;
        const entry = sellerState[openItemId];
        if (!entry?.items?.length || entry.hasMore || entry.loading || entry.isRefreshing) return;
        const best = computeListingLowestFromSellers(entry.items);
        if (!best) return;
        setItems((prev) => {
            let changed = false;
            const next = prev.map((it) => {
                if (String(it.id) !== String(openItemId)) return it;
                if (
                    it.lowest_price === best.price &&
                    it.lowest_price_pack_size === best.pack_size &&
                    it.lowest_price_master_pack_size === best.units_per_master_pack &&
                    it.lowest_price_unit === best.unit &&
                    it.lowest_price_gst_percent === best.gst_percent &&
                    it.lowest_price_stock_type === best.stock_type &&
                    it.lowest_price_available_stock === best.stock_quantity &&
                    it.lowest_price_moq === best.moq
                ) return it;
                changed = true;
                return applyLowestToItem(it, best);
            });
            return changed ? next : prev;
        });
    }, [sellerState, openItemId]);

    const trendFlushTimerRef = useRef(null);
    useEffect(() => {
        if (!isLoggedIn || !token || shopSlug) return;           // local updates only happen in global scope
        if (!items.some((it) => it.price_trend?.pending)) return;

        clearTimeout(trendFlushTimerRef.current);
        trendFlushTimerRef.current = setTimeout(async () => {
            const sent = itemsRef.current
                .filter((it) => it.price_trend?.pending && it.price_trend.cur != null)
                .slice(0, 50)
                .map((it) => ({ id: it.id, ppu: it.price_trend.cur }));
            if (!sent.length) return;

            let trends = null;
            try {
                const res = await observePriceTrends(token, sent);
                if (res?.success) trends = res.trends || {};
            } catch { /* keep the optimistic value */ }

            const sentPpu = new Map(sent.map((s) => [String(s.id), s.ppu]));
            setItems((prev) => prev.map((it) => {
                const key = String(it.id);
                const t = it.price_trend;
                if (!t?.pending || !sentPpu.has(key)) return it;
                // Price moved again while in flight: the next flush covers it.
                if (Math.abs(t.cur - sentPpu.get(key)) >= TREND_EPS) return it;
                const s = trends?.[key];
                return {
                    ...it,
                    price_trend: s
                        ? { cur: Number(s.cur), prev: s.prev != null ? Number(s.prev) : null, dir: Number(s.dir) || 0 }
                        : { ...t, pending: false },
                };
            }));
        }, 250);
    }, [items, isLoggedIn, token, shopSlug]);
    useEffect(() => () => clearTimeout(trendFlushTimerRef.current), []);

    // Refetch — with the new sort applied server-side — whenever the
    // buyer switches tabs on an already-open dropdown, or when their
    // address becomes known partway through. Apart from realtime
    // reconciliation, this is the ONLY thing that re-fetches sellers after
    // the initial open; nothing shifts silently in the background.
    useEffect(() => {
        if (!openItemId) return;
        loadSellersFor(openItemId, { silent: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sellerSortMode, buyerAddress]);

    const openSellersInline = useCallback((item) => {
        if (openItemId !== item.id) {
            setOpenItemId(item.id);
            loadSellersFor(item.id);
        }

        // Wait a tick so the dropdown/row has room to lay out before we scroll.
        requestAnimationFrame(() => {
            rowRefs.current[item.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
        });

        clearTimeout(highlightTimeoutRef.current);
        setHighlightedItemId(item.id);
        highlightTimeoutRef.current = setTimeout(() => {
            setHighlightedItemId((cur) => (cur === item.id ? null : cur));
        }, 1800);
    }, [openItemId, loadSellersFor]);

    useEffect(() => () => clearTimeout(highlightTimeoutRef.current), []);

    // Search results come from a source that doesn't apply wallet / custom-visibility
    // rules, so their header price can belong to a seller this buyer can't see.
    // Re-resolve each row's lowest price through the SAME filtered endpoint the
    // seller dropdown uses (4 at a time), then replace the row's price fields.
    const verifyLowestFor = useCallback(async (rows, requestToken) => {
        const queue = [...rows];
        const worker = async () => {
            while (queue.length) {
                const it = queue.shift();
                if (requestToken !== queryTokenRef.current) return;
                let best;
                let ok = false;
                try {
                    const addr = buyerAddressRef.current;
                    const res = await fetchBrandItemSellers(it.id, {
                        sort: "price_asc", limit: LOWEST_PROBE_SIZE, offset: 0, token,
                        destPincode: addr?.pincode || undefined, destState: addr?.state || undefined,
                    });
                    if (res?.success) { best = computeListingLowestFromSellers(res.items || []); ok = true; }
                } catch { /* keep the row's own value below */ }
                if (requestToken !== queryTokenRef.current) return;
                setItems((prev) => prev.map((row) => {
                    if (String(row.id) !== String(it.id)) return row;
                    // On failure keep the original numbers, just stop showing the skeleton.
                    return ok ? { ...applyLowestToItem(row, best), _priceVerified: true } : { ...row, _priceVerified: true };
                }));
            }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);
    }, [token]);

    // Single runQuery — the primary feed fetch, with tiered fallback
    // (subcategory, then category) when a live search comes up empty.
    // Pinned products come back FIRST from the server in both paths
    // (catalog_browse_feed / products-merged), so nothing is re-ordered here.
    const runQuery = useCallback((offset, { append }) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const requestToken = queryTokenRef.current;
        (append ? setLoadingMore : setLoading)(true);

        const trimmed = q.trim();
        const useFeedRpc = !!shopSlug || selectedBrands.length > 0;
        const addr = buyerAddressRef.current;
        const request = fetchBrandItemsFeed({
            categoryId: category?.id || null, q: trimmed, limit: PAGE_SIZE, offset,
            signal: controller.signal, token, shopSlug,
            brands: selectedBrands,
            destPincode: addr?.pincode || undefined, destState: addr?.state || undefined,
        });

        request
            .then((res) => {
                if (!res?.success) return;
                if (requestToken !== queryTokenRef.current) return;
                const incoming = res.items || [];
                setItems((prev) => (append ? mergeUnique(prev, incoming) : incoming));
                setTotal(res.total ?? incoming.length ?? null);
                setHasMore(!!res.hasMore);
            })
            .catch((err) => { if (err?.name !== "AbortError") setHasMore(false); })
            .finally(() => {
                if (requestToken !== queryTokenRef.current) return;
                setLoading(false);
                setLoadingMore(false);
            });
    }, [category?.id, q, token, shopSlug, brandsKey, isLoggedIn, verifyLowestFor]);

    useEffect(() => {
        const key = `${category?.id || ""}::${q}::${token || ""}::${shopSlug || ""}::${shopDestKey}::${brandsKey};`
        const now = Date.now();
        const isDuplicateInvocation =
            lastRunRef.current.key === key &&
            (now - lastRunRef.current.time) < DUPLICATE_GUARD_MS;

        if (isDuplicateInvocation) return;

        lastRunRef.current = { key, time: now };

        clearTimeout(debounceRef.current);
        queryTokenRef.current += 1;
        closeDropdown();

        abortRef.current?.abort();
        setLoading(true);

        if (isFirstRun.current) {
            isFirstRun.current = false;
            setHasMore(true);
            runQuery(0, { append: false });
            return;
        }

        setHasMore(true);
        debounceRef.current = setTimeout(
            () => runQuery(0, { append: false }),
            q ? DEBOUNCE_MS : 0
        );
        return () => clearTimeout(debounceRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category?.id, q, token, shopSlug, shopDestKey, brandsKey]);

    useEffect(() => () => sellerAbortRef.current?.abort(), []);

    // Live order: pinned group on top, everyone else in their DEFAULT order.
    // Derived from isFollowed(), so pin/unpin reorders instantly, and a failed
    // pin (onRevert) fixes itself.
    // An unpinned product whose default position is beyond what has been loaded
    // is hidden; it shows up in its right place when that page loads.

    const [unpinnedIds, setUnpinnedIds] = useState(() => new Set());
    const pinnedNow = (it) =>
        isFollowed(it.id) || (it.is_pinned === true && !unpinnedIds.has(it.id));

    // Hide products with no visible seller for THIS user. Rows still being
    // verified (search) and the row whose dropdown is open are kept, so
    // nothing vanishes under the user's finger.
    const visibleItems = items.filter(
        (it) =>
            it.lowest_price != null ||
            it._priceVerified === false ||
            String(it.id) === String(openItemId)
    );

    const displayItems = (() => {
        if (!visibleItems.length || visibleItems.some((it) => it.default_rank == null)) return visibleItems;
        let frontier = -1;
        for (const it of visibleItems) {
            if (it.is_pinned === false && it.default_rank > frontier) frontier = it.default_rank;
        }
        const visible = visibleItems.filter(
            (it) => hasMore === false || pinnedNow(it) || it.default_rank <= frontier
        );
        return visible.sort(
            (a, b) =>
                (Number(pinnedNow(b)) - Number(pinnedNow(a))) ||
                (a.default_rank - b.default_rank)
        );
    })();

    const lenis = useLenis();
    const stickyRef = useRef(null);
    const listWrapRef = useRef(null);
    const firstScrollRef = useRef(true);

    // Scroll so the first result sits just under the sticky toolbar.
    // If the user is already above that point, do nothing.
    const scrollListToTop = useCallback(() => {
        const list = listWrapRef.current;
        if (!list) return;
        const barH = stickyRef.current?.getBoundingClientRect().height || 0;
        const target = Math.max(0, list.getBoundingClientRect().top + window.scrollY - stickyTop - barH);
        if (window.scrollY <= target + 1) return;
        if (lenis && typeof lenis.scrollTo === "function") lenis.scrollTo(target, { immediate: true });
        else window.scrollTo(0, target);
    }, [lenis, stickyTop]);

    useEffect(() => {
        if (firstScrollRef.current) { firstScrollRef.current = false; return; }
        scrollListToTop();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q, category?.id, shopSlug, brandsKey]);

    const sentinelRef = useInfiniteScrollSentinel(
        () => !loadingMore && hasMore && runQuery(displayItems.length, { append: true }),
        { lookahead: 800, disabled: loading || loadingMore || !hasMore }
    );

    const goToSellers = (item) => navigate(`/brand-item/${item.slug || item.id}/sellers`, { state: { brandItem: item, category } });

    // Only shows TransportPreferenceModal the first time this buyer deals
    // with this seller. The decision (or explicit "no preference") is
    // looked up from the DB, per buyer-seller pair — not per device.
    const handleBuySeller = (item, seller) => {
        closeDropdown();

        if (!effectiveLoggedIn) {
            requireLogin();
            return;
        }
        if (!token) {
            requireLogin("You need to login to place an order with this seller.");
            return;
        }

        // Open the modal in the same tick as the click — no network round
        // trips gating it. BuyNowModal resolves the shipping address and
        // transport preference itself once its own "shipping" phase mounts
        // <AddressBook> (see its lastCheckedRouteRef effect) — that's the
        // exact same fetchBuyerTransportPreference logic that used to run
        // here, just deferred to when it's actually needed instead of
        // blocking the click.
        setBuyState({ item, seller });
    };

    const handleSell = (item) => {
        closeDropdown();
        navigate(`/grow/sell/${item.id}`, {
            state: {
                from: `${location.pathname}${location.search}${location.hash || ""}`,
                brandItem: item,
            },
        });
    };

    const handleShopBuy = async (item) => {
        if (!effectiveLoggedIn) { requireLogin(); return; }
        if (!token) { requireLogin("You need to login to place an order with this seller."); return; }
        if (isFeedRowOutOfStock(item)) { showToast({ message: "Out of stock" }, 2000); return; }
        if (openingItemId) return;

        const slug = shopSlugRef.current;
        if (currentUserId && String(slug) === String(currentUserId)) {
            showToast({ message: "This is your own listing" }, 2200);
            return;
        }

        setOpeningItemId(item.id);
        const res = await getOffer(item.id);
        setOpeningItemId(null);
        if (shopSlugRef.current !== slug) return; // user left the shop while loading

        if (!res?.success || !res.offer) {
            if (res?.code === "LISTING_GONE") {
                setItems((prev) => prev.filter((it) => String(it.id) !== String(item.id)));
                showToast({ message: "No longer available" }, 2500);
            } else {
                showToast({ message: "Couldn't open. Try again" }, 2200);
            }
            return;
        }
        setBuyState({ item, seller: res.offer });
    };

    const handleShareShop = async () => {
        const r = await shareShopLink({ shopSlug, shopName: myShopName });
        if (r === "copied") showToast({ message: "Shop link copied" }, 2000);
        else if (r === "failed") showToast({ message: "Couldn't share. Try again" }, 2200);
    };

    const handleShareProduct = async (item) => {
        let submissionId = item.shop_offer?.submission_id;
        if (!submissionId) {
            const res = await getOffer(item.id);
            submissionId = res?.offer?.submission_id;
        }
        if (!submissionId) { showToast({ message: "Couldn't share this product" }, 2200); return; }
        const result = await shareProductLink({
            submissionId,
            productName: item.name,
            sellerName: myShopName || "this seller",
        });
        if (result === "copied") showToast({ message: "Link copied to clipboard." }, 2000);
    };

    // Pin / unpin. Pinned products are listed first by the server, so the new
    // order appears on the next load or search; the row the user just tapped
    // deliberately stays where it is instead of jumping away under their finger.
    const handleToggleFollow = (item) => {
        if (!isLoggedIn || !token) {
            requireLogin("Login to pin products and keep them at the top of your feed.");
            return;
        }
        const willFollow = toggleFollow(item.id);
        if (willFollow === null) return;
        setUnpinnedIds((prev) => {
            const n = new Set(prev);
            if (willFollow) n.delete(item.id); else n.add(item.id);
            return n;
        });
        showToast({ message: willFollow ? "Pinned. It stays at the top of your feed" : "Unpinned" }, willFollow ? 2500 : 1800);
    };

    const buyerSellerPayload = buyState ? toBuyerSellerPayload(buyState.seller) : null;

    const showFullSkeleton = loading && items.length === 0;
    const newlyAppearedIds = useMemo(() => {
        const fresh = new Set();
        for (const it of items) {
            if (!seenItemIdsRef.current.has(it.id)) fresh.add(it.id);
        }
        fresh.forEach((id) => seenItemIdsRef.current.add(id));
        return fresh;
    }, [items]);

    // Merge a partial patch (price, promotion fields…) into ONE seller row of
    // one product's dropdown, so the UI updates instantly before the server
    // re-sync lands.
    const patchOwnListing = useCallback((itemId, submissionId, patch) => {
        setSellerState((prev) => {
            const entry = prev[itemId];
            if (!entry?.items) return prev;
            return {
                ...prev, [itemId]: {
                    ...entry, items: entry.items.map((row) =>
                        row.submission_id === submissionId ? { ...row, ...patch } : row)
                }
            };
        });
    }, []);

    const columnCount = useResponsiveColumnCount();
    const columns = bucketItemsByColumn(displayItems, columnCount);

    const seoPath = pathBrand ? `/brands/${encodeURIComponent(brandName)}`
        : pathShop ? `/sellers/${encodeURIComponent(shopSlug)}`
            : brandName ? `/brands/${encodeURIComponent(brandName)}`   // legacy ?brand= URL → canonical points to clean URL
                : shopSlug ? `/sellers/${encodeURIComponent(shopSlug)}`
                    : "/home";

    const sellerName = shopInfo?.display_name || shopSlug;
    const place = [shopInfo?.city, shopInfo?.state].filter(Boolean).join(", ");
    const thin = !!q || (!loading && items.length === 0);

    let seo;
    if (brandName) {
        seo = {
            title: `${brandName} Products – Wholesale Prices & Verified Sellers | BBM`,
            description: `Buy ${brandName} products wholesale on BBM. Compare verified sellers, MOQs and delivery times.`,
            jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: `${brandName} products`, about: { "@type": "Brand", name: brandName } },
        };
    } else if (shopSlug) {
        seo = {
            title: `${sellerName}${place ? ` – ${place}` : ""} | Wholesale Seller on BBM`,
            description: `Shop wholesale products from ${sellerName}${place ? ` in ${place}` : ""} on BBM. View MOQs, delivery and order directly.`,
            jsonLd: {
                "@context": "https://schema.org", "@type": "LocalBusiness", name: sellerName,
                address: { "@type": "PostalAddress", addressLocality: shopInfo?.city, addressRegion: shopInfo?.state, addressCountry: "IN" }
            },
        };
    } else {
        seo = {
            title: "BBM – Wholesale marketplace to buy & sell from verified sellers",
            description: "Compare wholesale prices, MOQs and delivery from verified sellers across India. Buy or sell on BBM.",
        };
    }

    return (
        <>
            <Seo {...seo} path={seoPath} noindex={thin} />
            <FeedQuickActions
                active={activeTile}
                brandLabel={brandName}
                onBrands={handleBrands}
                onMyShop={handleSellers}
            />

            <div
                ref={stickyRef}
                className="sticky z-30 -mx-3 border-b bg-white px-3 pb-1 sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6"
                style={{ top: stickyTop, borderColor: C.hairSoft }}
            >
                <div className="flex items-center justify-between gap-3 px-1 pt-0 mt-1.5">
                    <div className="min-w-0">
                        {myShopActive ? (
                            <button
                                type="button"
                                onClick={handleShareShop}
                                className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-white px-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-black/[0.03] active:scale-[0.98]"
                                style={{ borderColor: C.hair, color: C.ink }}
                            >
                                <Share2 className="h-3 w-3" strokeWidth={2.3} /> Share shop
                            </button>
                        ) : (
                            <DeliverToBar />
                        )}
                    </div>
                    <div className="shrink-0">
                        <GstToggle includeGst={includeGst} onChange={setIncludeGst} />
                    </div>
                </div>

                {toolbar}

                {brandName && (
                    <ActiveViewStrip
                        variant="brand"
                        label="Brand"
                        name={brandName}
                        changeTo="/brands"
                        onClear={clearBrand}
                        clearLabel="Clear brand"
                    />
                )}

                {shopSlug && fromSellers && (
                    <ActiveViewStrip
                        variant="seller"
                        label={myShopActive ? "Your shop" : "Seller"}
                        name={shopInfo?.display_name || shopSlug}
                        changeTo="/sellers"
                        onClear={clearShop}
                        clearLabel="Clear seller"
                    />
                )}

            </div>

            {/* MOBILE FULL-WIDTH LAYOUT: on phones this wrapper bleeds edge-to-edge
                (-mx-3 cancels a parent's assumed px-3 padding; tweak to match your
                actual page padding) with only a top/bottom hairline (border-y) —
                no rounded corners, no side border, so it never reads as a "card".
                The rounded/bordered "card" look returns from sm: and up. */}
            <div
                // className="-mx-3 bg-white sm:mx-0 sm:rounded-2xl sm:border"
                className="-mx-3 bg-white sm:mx-0 sm:rounded-2xl"
                ref={listWrapRef}
            >

                {showFullSkeleton
                    ? (
                        <div className="flex divide-x" style={{ borderColor: C.hair }}>
                            {Array.from({ length: columnCount }).map((_, colIdx) => (
                                <div key={colIdx} className="min-w-0 flex-1 divide-y pt-3" style={{ borderColor: C.hairSoft }}>
                                    {Array.from({ length: Math.ceil(8 / columnCount) }).map((_, i) => (
                                        <RowSkeleton key={i} />
                                    ))}
                                </div>
                            ))}
                        </div>
                    )
                    : items.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                            <Package className="h-6 w-6" style={{ color: C.hair }} />
                            <p className="text-[13px] font-bold" style={{ color: C.ink }}>
                                {shopSlug
                                    ? (q ? "No products from this store match" : "No products from this store are available to you")
                                    : (q ? "No products match that search" : "No products here yet")}
                            </p>
                            <p className="max-w-[260px] text-[11.5px] font-medium leading-snug" style={{ color: C.muted }}>
                                {q ? "Try a different search term." : shopSlug ? "Try a different category, or see all products." : "Try a different category."}
                            </p>
                        </div>
                    ) : (
                        <div
                            className="flex divide-x pt-3"
                            style={{ borderColor: C.hair, opacity: loading ? 0.55 : 1, transition: "opacity 0.15s ease" }}
                        >
                            {columns.map((colItems, colIdx) => (
                                // <div key={colIdx} className="min-w-0 flex-1 sm:divide-y" style={{ borderColor: C.hairSoft }}>
                                <div key={colIdx} className="min-w-0 flex-1" style={{ borderColor: C.hairSoft }}>
                                    {colItems.map((item) => {
                                        const isOpen = openItemId === item.id;
                                        const i = displayItems.indexOf(item);
                                        return (
                                            <motion.div
                                                key={item.id}
                                                ref={(el) => { if (el) rowRefs.current[item.id] = el; }}
                                                layout="position"
                                                transition={{ duration: 0.24, ease: EASE }}
                                                className="relative"
                                            >
                                                <ProductRow
                                                    item={item}
                                                    idx={i}
                                                    isOpen={isOpen}
                                                    // onToggle={() => toggleDropdown(item)}
                                                    onInfo={() => setInfoItemId(item.id)}
                                                    onImageOpen={setLightboxSrc}
                                                    isFollowed={pinnedNow(item)}
                                                    onToggleFollow={() => handleToggleFollow(item)}
                                                    includeGst={includeGst}
                                                    isLoggedIn={isLoggedIn}
                                                    isOwnShop={myShopActive}
                                                    onShareProduct={() => handleShareProduct(item)}
                                                    // onToggle={() => (shopSlug ? handleShopBuy(item) : toggleDropdown(item))}
                                                    onToggle={() => {
                                                        dismissHint(); // tapping any record ends the hint for today
                                                        return shopSlug ? handleShopBuy(item) : toggleDropdown(item);
                                                    }}
                                                    showTapHint={showHint && item.id === firstHintId}
                                                    shopMode={!!shopSlug}
                                                    isOpening={openingItemId === item.id}
                                                    onPrefetch={shopSlug ? () => { if (isLoggedIn && token) getOffer(item.id); } : undefined}
                                                    onRequireLogin={() => requireLogin("Login to view real seller pricing.")}
                                                    animateEntrance={newlyAppearedIds.has(item.id)}
                                                />

                                                <AnimatePresence>
                                                    {highlightedItemId === item.id && (
                                                        <motion.div
                                                            key="highlight"
                                                            initial={{ opacity: 0 }}
                                                            animate={{ opacity: [0, 1, 1, 0] }}
                                                            exit={{ opacity: 0 }}
                                                            transition={{ duration: 1.8, times: [0, 0.15, 0.8, 1], ease: "easeInOut" }}
                                                            className="pointer-events-none absolute inset-0 z-10 rounded-xl"
                                                            style={{ background: `${C.primary}07`, boxShadow: `0 0 0 2px ${C.primary}55 inset` }}
                                                        />
                                                    )}
                                                </AnimatePresence>

                                                <AnimatePresence initial={false}>
                                                    {isOpen && (
                                                        <SellerDropdown
                                                            item={item}
                                                            state={sellerState[item.id]}
                                                            onBuySeller={(seller) => handleBuySeller(item, seller)}
                                                            onSell={() => handleSell(item)}
                                                            includeGst={includeGst}
                                                            sortMode={sellerSortMode}
                                                            isLoggedIn={isLoggedIn}
                                                            onRequireLogin={() => requireLogin("Login to view real seller pricing.")}
                                                            onSortModeChange={setSellerSortMode}
                                                            currentUserId={currentUserId}
                                                            buyerAddress={buyerAddress}
                                                            navigate={navigate}
                                                            token={token}
                                                            onOwnListingPriceApplied={(submissionId, newPrice) => patchOwnListing(item.id, submissionId, { price: newPrice })}
                                                            onOwnListingPatched={(submissionId, patch) => patchOwnListing(item.id, submissionId, patch)}
                                                            onOwnListingSaved={(message) => {
                                                                if (message) showToast({ message }, 2200);
                                                                loadSellersFor(item.id, { silent: true });
                                                            }}
                                                            onEditOwnListing={(submissionId) => setEditingSubmissionId(submissionId)}
                                                        />
                                                    )}
                                                </AnimatePresence>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    )}
                {hasMore && !loading && (
                    <>
                        {loadingMore && (
                            <div className="flex divide-x border-t" style={{ borderColor: C.hair }}>
                                {Array.from({ length: columnCount }).map((_, colIdx) => (
                                    // <div key={colIdx} className="min-w-0 flex-1 divide-y" style={{ borderColor: C.hairSoft }}>
                                    <div key={colIdx} className="min-w-0 flex-1" style={{ borderColor: C.hairSoft }}>
                                        {Array.from({ length: Math.ceil(PAGE_SIZE / columnCount) }).map((_, i) => (
                                            <RowSkeleton key={i} />
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div ref={sentinelRef} className="h-1" />
                    </>
                )}
            </div>

            {infoItemId && (
                <BrandItemDetailModal
                    brandItemId={infoItemId}
                    onClose={() => setInfoItemId(null)}
                    onViewSellers={(item) => { setInfoItemId(null); goToSellers(item); }}
                />
            )}

            <AnimatePresence>
                {loginPrompt && (
                    <LoginPromptModal
                        open
                        message={loginPrompt.message}
                        onConfirm={confirmLogin}
                        onCancel={cancelLogin}
                    />
                )}
                {buyState && buyerSellerPayload && (
                    <BuyNowModal
                        seller={buyerSellerPayload}
                        product={{
                            id: buyState.item.id,
                            name: buyState.item.name,
                            brand_name: buyState.item.brand_name,
                            brand_image: buyState.item.brand_image,
                            image: buyState.item.image,
                            model_no: buyState.item.model_no,
                            category_name: buyState.item.category_name,
                            subcategory_name: buyState.item.subcategory_name,
                        }}
                        onClose={() => setBuyState(null)}
                    />
                )}


            </AnimatePresence>

            {editingSubmissionId && (
                EditListingModal
                    ? createPortal(
                        <EditListingModal
                            token={token}
                            submissionId={editingSubmissionId}
                            focusSection={null}
                            onClose={() => setEditingSubmissionId(null)}
                            onSaved={() => {
                                setEditingSubmissionId(null);
                                if (openItemId) loadSellersFor(openItemId, { silent: true });
                            }}
                        />,
                        document.body
                    )
                    : (console.error("EditListingModal failed to import — check the file path/export"), null)
            )}

            <div className="pointer-events-none fixed inset-x-0 z-[80] flex justify-center px-4 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] md:bottom-6">
                <AnimatePresence>
                    {followToast && (
                        <motion.div
                            role="status"
                            initial={{ opacity: 0, y: 10, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.96 }}
                            transition={{ duration: 0.18, ease: EASE }}
                            className="pointer-events-auto flex items-center gap-2 rounded-full bg-black py-1.5 pl-3.5 pr-1.5 text-[12px] font-bold text-white shadow-lg"
                        >
                            <span className="whitespace-nowrap">{followToast.message}</span>
                            {followToast.actionLabel ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        clearTimeout(followToastTimerRef.current);
                                        followToast.onAction?.();
                                        setFollowToast(null);
                                    }}
                                    className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-extrabold hover:bg-white/25"
                                >
                                    {followToast.actionLabel}
                                </button>
                            ) : (
                                <span className="w-1.5" />
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {lightboxSrc && <ImageLightbox src={lightboxSrc} alt="" onClose={() => setLightboxSrc(null)} />}
        </>
    );
}