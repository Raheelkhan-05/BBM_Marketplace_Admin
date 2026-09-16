import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu, X, ArrowUpRight, User, LogOut, ChevronDown, Store, ShieldCheck,
  Clock3, ListChecks, BookOpen, Users, IndianRupee,
  Skull,
  Boxes, Lightbulb
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { TAGLINE } from "../../data/content";
import { useAuth } from "../context/AuthContext.jsx";
import { useNotifications } from "../context/NotificationsContext.jsx";
import { useTransportLibrary } from "../context/TransportLibraryContext.jsx";
import NotificationBell from "../components/NotificationBell.jsx";
import SmartLink from "./SmartLink.jsx";
import { NAV_ITEMS } from "./navItems.js";
import { useCart } from "../context/CartContext.jsx";
import { preloadRoute } from "../routePreload.js";
import { useChatContext } from "../context/ChatContext.jsx";
import { useListings } from "../context/ListingsContext.jsx";


const C = {
  ink: "#141B22",
  muted: "#5B6672",
  primary: "#C2410C",
  secondary: "#0B7285",
  hair: "rgba(20,27,34,0.09)",
};

const DROPDOWN_ITEM =
  "flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-50";

const MOBILE_ROW =
  "flex min-h-[46px] items-center gap-3 rounded-lg px-3 text-[14.5px] font-semibold text-slate-700 transition-colors active:bg-slate-100";

function formatShopName(slug) {
  if (!slug) return "";
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function ScrollableNav({ navItems, pathname, navMaxWidth }) {
  const scrollRef = useRef(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const updateFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 4);
    setShowRightFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateFades();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateFades, { passive: true });
    const ro = new ResizeObserver(updateFades);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", updateFades); ro.disconnect(); };
  }, [updateFades, navMaxWidth, navItems.length]);

  return (
    <div
      style={{ maxWidth: navMaxWidth != null ? `${navMaxWidth}px` : undefined }}
      className="absolute left-1/2 hidden -translate-x-1/2 md:block"
    >
      <div className="relative">
        {showLeftFade && (
          <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-8 bg-gradient-to-r from-white/95 to-transparent" />
        )}
        {showRightFade && (
          <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-8 bg-gradient-to-l from-white/95 to-transparent" />
        )}
        <nav
          ref={scrollRef}
          className="flex items-center gap-1 py-5 -my-2 [scrollbar-width:none] lg:gap-1.5 [&::-webkit-scrollbar]:hidden"
        >
          {navItems.map((it) => {
            const Icon = it.icon;
            const active = it.match(pathname);
            return (
              <button
                key={it.id}
                onClick={it.onClick}
                // Prefetches this tab's page code the moment the cursor
                // arrives (desktop) or the finger touches down (mobile) —
                // typically 100-300ms before the click/tap itself actually
                // registers. By the time onClick fires, the chunk is
                // usually already cached, so the route switch renders
                // immediately instead of waiting on a network fetch.
                onMouseEnter={(e) => {
                  if (it.to) preloadRoute(it.to);
                  if (!active) e.currentTarget.style.background = "rgba(20,27,34,0.045)";
                }}
                onTouchStart={() => { if (it.to) preloadRoute(it.to); }}
                className="relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors duration-150 lg:px-4 lg:text-[13px]"
                style={{
                  color: active ? "#fff" : C.ink,
                  background: active ? C.secondary : "transparent",
                }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <Icon className="h-3.5 w-3.5 lg:h-4 lg:w-4" style={{ color: active ? "#fff" : C.muted }} />
                {it.label}
                {it.badge != null && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#d2462b] px-1 text-[10px] font-bold text-white ring-2 ring-white">
                    {it.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export default function Header({ onOpenRfq }) {
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(49);
  const [navMaxWidth, setNavMaxWidth] = useState(null);
  const { isLoggedIn, profile, signOut } = useAuth();
  const { orderUnreadCount } = useNotifications();
  const { cartCount } = useCart();
  const { unreadTotal: chatUnreadTotal } = useChatContext();
  const { totalBadgeCount: productsBadgeCount } = useListings();
  const { pendingProposalsCount } = useTransportLibrary();

  const navigate = useNavigate();
  const { pathname } = useLocation();


  // A logged-in-but-unfinished-onboarding user should look exactly like a
  // guest in the header — Sign In button, no account menu, no nav items
  // that assume a completed profile. Same condition as Layout.jsx's
  // onboardingIncomplete, kept in sync so both hide/show together.
  const onboardingDone = !isLoggedIn || profile?.onboarding_step === "done";
  const effectiveLoggedIn = isLoggedIn && onboardingDone;


  const headerRef = useRef(null);
  const rowRef = useRef(null);
  const logoRef = useRef(null);
  const rightRef = useRef(null);
  const accountRef = useRef(null);


  useEffect(() => {
    if (!headerRef.current) return;
    const update = () => setHeaderHeight(headerRef.current.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(headerRef.current);
    return () => ro.disconnect();
  }, []);

  // Nav stays perfectly centered on the whole row, but its max-width is
  // capped to whatever gap is smaller on either side of center — so it
  // can shrink but never overlap the logo or the notification bell /
  // account button, on either side. Recomputes on any resize: viewport
  // changes, the icon cluster growing/shrinking (e.g. bell appearing
  // after login), etc.
  useEffect(() => {
    if (!rowRef.current || !logoRef.current || !rightRef.current) return;
    const GAP = 2; // breathing room against whichever side is closer

    function recompute() {
      const rowWidth = rowRef.current.offsetWidth;
      const logoWidth = logoRef.current.offsetWidth;
      const rightWidth = rightRef.current.offsetWidth;
      const half = rowWidth / 2;
      const leftSlack = half - logoWidth - GAP;
      const rightSlack = half - rightWidth - GAP;
      const maxWidth = Math.max(0, 1.9 * Math.min(leftSlack, rightSlack));
      setNavMaxWidth(maxWidth);
    }

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(rowRef.current);
    ro.observe(logoRef.current);
    ro.observe(rightRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!accountOpen) return;
    function onClick(e) {
      if (accountRef.current && !accountRef.current.contains(e.target)) setAccountOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setAccountOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const displayName =
    formatShopName(profile?.shop_slug)
    || profile?.name?.trim().split(" ")[0]
    || "Account";

  const isAdmin = effectiveLoggedIn && profile?.role === "admin";
  const isApprovedSeller = effectiveLoggedIn && profile?.seller_status === "approved";

  const navItems = NAV_ITEMS({
    isLoggedIn: effectiveLoggedIn, isApprovedSeller, onOpenRfq, navigate,
    ordersBadgeCount: orderUnreadCount,
    cartBadgeCount: cartCount,
    chatBadgeCount: chatUnreadTotal,
    productsBadgeCount: productsBadgeCount,
    // Only ever meaningful for an approved seller — a buyer-only account
    // has nothing pending to action here, so the badge stays hidden for
    // everyone else regardless of what the context happens to hold.
    transportBadgeCount: isApprovedSeller ? pendingProposalsCount : 0,
  });



  return (
    <>
      <header
        ref={headerRef}
        className="relative sm:sticky top-0 z-50 border-b bg-white/95 backdrop-blur-md shadow-[0_1px_0_rgba(20,27,34,0.04)] transition-all duration-300"
        style={{ borderColor: C.hair }}
      >
        <div ref={rowRef} className="relative mx-auto flex h-14 max-w-7xl items-center justify-between px-4 lg:px-8">
          <div ref={logoRef} className="flex shrink-0 items-center">
            <SmartLink to="/" className="flex shrink-0 items-center gap-2">
              <img src="/Logo.png" alt="BBM" className="h-7 w-auto object-contain" />
              <h1
                className="text-[18px] font-extrabold tracking-wide"
                style={{ fontFamily: "'Bricolage Grotesque', sans-serif", color: C.ink }}
              >
                BBM
              </h1>
            </SmartLink>
          </div>

          <ScrollableNav navItems={navItems} pathname={pathname} navMaxWidth={navMaxWidth} />

          <div ref={rightRef} className="flex shrink-0 items-center gap-3">
            {effectiveLoggedIn ? (
              <>
                {/* Notification bell is admin-only — normal users neither see it nor get its toasts/sound (see NotificationsContext, which gates playback on role). */}
                {isAdmin && <NotificationBell />}
                <div className="relative hidden md:block" ref={accountRef}>
                  <button
                    onClick={() => setAccountOpen((v) => !v)}
                    title={displayName}
                    className="inline-flex w-[165px] items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] font-bold text-slate-700 transition hover:border-[#7fb3bd]"
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white"
                      style={{ background: "linear-gradient(135deg, #0B7285 0%, #4FA3B0 100%)" }}
                    >
                      <User className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left">{displayName}</span>
                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${accountOpen ? "rotate-180" : ""}`} />
                  </button>

                  <AnimatePresence>
                    {accountOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-[rgba(20,27,34,0.08)] bg-white py-1.5 shadow-xl"
                      >
                        {isApprovedSeller && (
                          <SmartLink
                            to={`/shop/${profile.shop_slug}`}
                            onClick={() => setAccountOpen(false)}
                            className={DROPDOWN_ITEM}
                          >
                            <Store className="h-3.5 w-3.5 text-[#0B7285]" />
                            My Shop
                          </SmartLink>
                        )}

                        {isAdmin && (
                          <>
                            {isApprovedSeller && <div className="my-1 border-t border-[rgba(20,27,34,0.08)]" />}
                            <SmartLink to="/sellers" onClick={() => setAccountOpen(false)} className={DROPDOWN_ITEM}>
                              <ShieldCheck className="h-3.5 w-3.5 text-[#0B7285]" />
                              Seller Applications
                            </SmartLink>
                            <SmartLink to="/catalog" onClick={() => setAccountOpen(false)} className={DROPDOWN_ITEM}>
                              <BookOpen className="h-3.5 w-3.5 text-[#0B7285]" />
                              Catalog
                            </SmartLink>
                            <SmartLink to="/admins" onClick={() => setAccountOpen(false)} className={DROPDOWN_ITEM}>
                              <Users className="h-3.5 w-3.5 text-[#0B7285]" />
                              Manage Admins
                            </SmartLink>
                            <SmartLink to="/listings" onClick={() => setAccountOpen(false)} className={DROPDOWN_ITEM}>
                              <ListChecks className="h-3.5 w-3.5 text-[#0B7285]" />
                              Product Review Requests
                            </SmartLink>
                            <SmartLink to="/support" onClick={() => setAccountOpen(false)} className={DROPDOWN_ITEM}>
                              <Lightbulb className="h-3.5 w-3.5 text-[#0B7285]" />
                              Support Requests
                            </SmartLink>
                            <SmartLink to="/payments" onClick={() => setAccountOpen(false)} className={DROPDOWN_ITEM}>
                              <IndianRupee className="h-3.5 w-3.5 text-[#0B7285]" />
                              Payment Verification
                            </SmartLink>
                            <SmartLink to="/database" onClick={() => setAccountOpen(false)} className={DROPDOWN_ITEM}>
                              <Skull className="h-3.5 w-3.5 text-[#0B7285]" />
                              Database
                            </SmartLink>
                            <SmartLink to="/product-commisions" onClick={() => setAccountOpen(false)} className={DROPDOWN_ITEM}>
                              <Boxes className="h-3.5 w-3.5 text-[#0B7285]" />
                              Product Commissions
                            </SmartLink>
                          </>
                        )}

                        <div className="my-1 border-t border-[rgba(20,27,34,0.08)]" />
                        <button
                          onClick={() => { setAccountOpen(false); signOut(); }}
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] font-semibold text-rose-600 hover:bg-slate-50"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          Sign out
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <SmartLink
                to="/login"
                className="hidden items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold text-white shadow-[0_6px_16px_-4px_rgba(194,65,12,0.4)] transition-transform duration-200 hover:-translate-y-0.5 md:inline-flex"
                style={{ background: "linear-gradient(135deg, #C2410C 0%, #9A2E0A 100%)" }}
              >
                Sign In
                <ArrowUpRight className="h-3.5 w-3.5" />
              </SmartLink>
            )}

            <button
              onClick={() => setOpen(!open)}
              aria-label="Toggle menu"
              aria-expanded={open}
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 transition hover:border-[#7fb3bd] hover:text-[#0B7285] md:hidden"
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-sm md:hidden"
            />
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              style={{ top: headerHeight }}
              className="fixed left-0 right-0 z-50 max-h-[calc(100dvh-var(--h))] overflow-y-auto border-b border-[rgba(20,27,34,0.08)] bg-[#FCFBF9] shadow-xl backdrop-blur-xl md:hidden"
            >
              <div className="mx-auto max-w-7xl px-5 py-4">
                {effectiveLoggedIn && (
                  <div className="mb-3 flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
                      style={{ background: "linear-gradient(135deg, #0B7285 0%, #4FA3B0 100%)" }}
                    >
                      <User className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-bold text-slate-800">{displayName}</p>
                      {isAdmin && <p className="text-[11px] font-semibold text-[#0B7285]">Admin</p>}
                    </div>
                  </div>
                )}

                <nav className="flex flex-col gap-0.5">
                  {effectiveLoggedIn && (
                    <>
                      {isApprovedSeller && (
                        <SmartLink to={`/shop/${profile.shop_slug}`} onClick={() => setOpen(false)} className={`${MOBILE_ROW} text-[#0B7285]`}>
                          <Store className="h-4 w-4 text-[#0B7285]" />
                          My Shop
                        </SmartLink>
                      )}

                      {isAdmin && (
                        <>
                          <p className="mb-1 mt-3 px-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Admin</p>
                          <SmartLink to="/admin/sellers" onClick={() => setOpen(false)} className={MOBILE_ROW}>
                            <ShieldCheck className="h-4 w-4 text-slate-400" />
                            Seller Applications
                          </SmartLink>
                          <SmartLink to="/admin/catalog" onClick={() => setOpen(false)} className={MOBILE_ROW}>
                            <BookOpen className="h-4 w-4 text-slate-400" />
                            Catalog
                          </SmartLink>
                          <SmartLink to="/admin/admins" onClick={() => setOpen(false)} className={MOBILE_ROW}>
                            <Users className="h-4 w-4 text-slate-400" />
                            Manage Admins
                          </SmartLink>
                          <SmartLink to="/admin/listings" onClick={() => setOpen(false)} className={MOBILE_ROW}>
                            <ListChecks className="h-4 w-4 text-slate-400" />
                            Product Review Requests
                          </SmartLink>
                          <SmartLink to="/admin/support" onClick={() => setOpen(false)} className={MOBILE_ROW}>
                            <Lightbulb className="h-4 w-4 text-slate-400" />
                            Support Requests
                          </SmartLink>
                          <SmartLink to="/admin/payments" onClick={() => setOpen(false)} className={MOBILE_ROW}>
                            <IndianRupee className="h-4 w-4 text-slate-400" />
                            Payment Verification
                          </SmartLink>
                          <SmartLink to="/admin/database" onClick={() => setOpen(false)} className={MOBILE_ROW}>
                            <Skull className="h-4 w-4 text-slate-400" />
                            Database
                          </SmartLink>
                          <SmartLink to="/admin/product-commisions" onClick={() => setOpen(false)} className={MOBILE_ROW}>
                            <Boxes className="h-4 w-4 text-slate-400" />
                            Product Commissions
                          </SmartLink>
                        </>
                      )}

                      <div className="my-2 border-t border-slate-100" />
                      <button
                        onClick={() => { setOpen(false); signOut(); }}
                        className={`${MOBILE_ROW} justify-start text-rose-600`}
                      >
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </button>
                    </>
                  )}

                  {!effectiveLoggedIn && (
                    <SmartLink
                      to="/login"
                      onClick={() => setOpen(false)}
                      className="mt-1 flex min-h-[46px] items-center justify-center gap-1.5 rounded-lg px-4 text-center text-sm font-bold text-white shadow-[0_6px_16px_-4px_rgba(194,65,12,0.35)]"
                      style={{ background: "linear-gradient(135deg, #C2410C 0%, #9A2E0A 100%)" }}
                    >
                      Sign In
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </SmartLink>
                  )}

                  <p className="mt-3 border-t border-slate-200 pt-3 text-center text-xs font-medium text-slate-400">
                    {TAGLINE}
                  </p>
                </nav>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}