// src/components/Header.jsx
//
// Header only shows the shop name (desktop) or the guest Sign In bar.
// All navigation (Home, Cart, Orders, Chats ... and Sign out) lives in the menu
// modal opened from the floating dock (BottomNavStrip), so it is NOT repeated here.
import { useState, useEffect, useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import SmartLink from "./SmartLink.jsx";

const C = { ink: "#141B22" };

// Fixed-width box for the shop name. If the text fits, it renders normally.
// If it overflows, it switches to a marquee loop (measured by real pixel widths).
function MarqueeText({ text, width = 96, className, style }) {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [singleWidth, setSingleWidth] = useState(0);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const el = textRef.current;
    if (!container || !el) return;

    const measure = () => {
      const overflow = el.scrollWidth - container.clientWidth;
      setIsOverflowing(overflow > 1);
      setSingleWidth(el.scrollWidth);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, isMobile]);

  const shouldScroll = isOverflowing && !isMobile;
  const duration = Math.max(4, singleWidth / 40);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden whitespace-nowrap"
      style={isMobile ? { width: "auto", maxWidth: "100%" } : { width: `${width}px` }}
    >
      <div
        className="inline-flex"
        style={shouldScroll ? { animation: `marquee-scroll ${duration}s linear infinite` } : undefined}
      >
        <span ref={textRef} className={`inline-block ${className || ""}`} style={style}>
          {text}
        </span>
        {shouldScroll && (
          <span aria-hidden="true" className={`inline-block pl-8 ${className || ""}`} style={style}>
            {text}
          </span>
        )}
      </div>
    </div>
  );
}

function formatShopName(slug) {
  if (!slug) return "";
  // Drop the numeric suffix added for slug uniqueness (e.g. "acme-traders-2").
  return slug
    .replace(/-\d+$/, "")
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function GuestHeader() {
  return (
    <header
      className="z-50 border-b border-[#DCE6E9] bg-white/85 backdrop-blur-[14px]"
      style={{ top: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:px-7">
        <SmartLink to="/" aria-label="BBM home" className="flex min-w-0 items-center gap-2">
          <img src="/Logo.png" alt="BBM" className="block h-7 w-auto object-contain" />
          <span
            className="whitespace-nowrap text-[18px] font-extrabold leading-none tracking-[.02em] text-[#08222B]"
            style={{ fontFamily: "'Bricolage Grotesque','Figtree',system-ui,sans-serif" }}
          >
            BBM
          </span>
        </SmartLink>
        <span className="flex-1" />
        <SmartLink
          to="/login"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[#FFD60A] bg-[#FFD60A] px-5 text-[13px] font-extrabold text-[#06161C] transition hover:brightness-105 active:scale-[.985]"
        >
          Sign In <ArrowUpRight className="h-3.5 w-3.5" />
        </SmartLink>
      </div>
    </header>
  );
}

export default function Header() {
  const { profile, effectiveLoggedIn } = useAuth();

  if (!effectiveLoggedIn) return <GuestHeader />;

  return (
    <header
      className="relative top-0 z-50 bg-white md:my-3 md:pt-3"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px))" }}
    >
      <div className="mx-auto hidden h-7 max-w-7xl items-center px-4 md:flex lg:px-8">
        <SmartLink to="/" className="flex shrink-0 items-center gap-2">
          <MarqueeText
            text={profile?.shop_slug ? formatShopName(profile.shop_slug) : "BBM"}
            width={256}
            className="text-[16px] font-extrabold tracking-wide"
            style={{ fontFamily: "'Bricolage Grotesque', sans-serif", color: C.ink }}
          />
        </SmartLink>
      </div>
    </header>
  );
}