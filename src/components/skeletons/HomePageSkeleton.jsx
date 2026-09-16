// components/skeletons/HomePageSkeleton.jsx
//
// Mirrors HomePage's current section structure exactly:
// Hero16by9Banner -> AmazonSearchHeader (md+) -> WelcomeBanner ->
// QuickActionsJustBelowBanner -> TrustStripLogos -> TopCategoriesAccordion ->
// TrustStrip -> StartSellingBanner
//
// Same container (max-w-[1400px], px-2.5/4/6, space-y-6) and same
// rounded-radii/breakpoints as the real components, so swapping in
// real content causes no layout jump.

const C = {
  hair: "rgba(11,17,22,0.09)",
  hairSoft: "rgba(11,17,22,0.05)",
};

export default function HomePageSkeleton() {
  return (
    <div className="min-h-screen bg-[#FCFBF9] antialiased overflow-x-hidden">
      <main className="mx-auto max-w-[1400px] px-2.5 sm:px-4 lg:px-6 pb-5 sm:pb-20 pt-3 space-y-6">
        <HeroSkeleton />
        <span className="hidden md:block">
          <SearchBarSkeleton />
        </span>
        <WelcomeBannerSkeleton />
        <QuickActionsSkeleton />
        <TrustStripLogosSkeleton />
        <TopCategoriesSkeleton />
        <StartSellingBannerSkeleton />
      </main>
    </div>
  );
}

/* ---------------- Hero16by9Banner ---------------- */
function HeroSkeleton() {
  return (
    <section
      className="relative w-full overflow-hidden rounded-[28px] border bg-[#FBFCFD]"
      style={{ borderColor: C.hair }}
    >
      <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_1.05fr] lg:items-center">
        {/* text side */}
        <div className="order-2 px-6 pb-8 pt-7 sm:px-10 sm:pb-10 sm:pt-9 lg:order-1 lg:px-14 lg:py-0">
          <Shimmer className="h-2.5 w-40 rounded" />
          <Shimmer className="mt-5 h-10 w-64 rounded sm:h-12 sm:w-80" />
          <Shimmer className="mt-2.5 h-10 w-48 rounded sm:h-12 sm:w-60" />
          <Shimmer className="mt-5 h-3.5 w-full max-w-sm rounded" />
          <Shimmer className="mt-2 h-3.5 w-4/5 max-w-sm rounded" />
          <Shimmer className="mt-6 h-8 w-44 rounded-full sm:mt-8" />
        </div>

        {/* image panel */}
        <div className="relative order-1 px-0 pt-0 sm:px-8 sm:pt-8 lg:order-2 lg:px-8 lg:py-8">
          <div className="relative overflow-hidden rounded-[20px] p-[1px]" style={{ background: C.hair }}>
            <Shimmer className="h-[220px] w-full rounded-[19px] sm:h-[300px] lg:h-[420px]" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- AmazonSearchHeader (md+ only) ---------------- */
function SearchBarSkeleton() {
  return <Shimmer className="h-11 w-full rounded-full" />;
}

/* ---------------- WelcomeBanner ---------------- */
function WelcomeBannerSkeleton() {
  return (
    <div className="w-full px-1 pt-2 pb-0 sm:px-0">
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />
        <Shimmer className="h-2.5 w-28 rounded" />
      </div>
      <Shimmer className="mt-3 h-7 w-56 rounded sm:h-8 sm:w-72" />
      <Shimmer className="mt-2 h-3 w-64 rounded" />
    </div>
  );
}

/* ---------------- QuickActionsJustBelowBanner ---------------- */
function QuickActionsSkeleton() {
  return (
    <div className="w-full rounded-[16px] border bg-white pb-6 pt-6 lg:pb-8 lg:pt-5" style={{ borderColor: C.hair }}>
      <Shimmer className="mx-auto h-5 w-48 rounded" />
      <Shimmer className="mx-auto mt-2 h-3 w-56 rounded" />

      {/* mobile: icon grid x2 groups */}
      <div className="mt-4 space-y-4 px-4 lg:hidden">
        {Array.from({ length: 2 }).map((_, g) => (
          <div key={g}>
            <Shimmer className="mx-auto h-2.5 w-16 rounded" />
            <div className="mt-4 grid grid-cols-4 gap-x-2 gap-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <Shimmer className="h-14 w-14 rounded-2xl" />
                  <Shimmer className="h-2.5 w-10 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* desktop: row cards x2 columns */}
      <div className="mt-8 hidden w-full flex-row gap-0 px-8 lg:flex">
        {Array.from({ length: 2 }).map((_, g) => (
          <div key={g} className={`flex-1 ${g === 1 ? "pl-8" : ""}`} style={g === 1 ? { borderLeft: `1px solid ${C.hair}` } : undefined}>
            <Shimmer className="h-2.5 w-20 rounded" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-2xl border p-4" style={{ borderColor: C.hair }}>
                  <Shimmer className="h-11 w-11 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Shimmer className="h-3 w-4/5 rounded" />
                    <Shimmer className="h-2.5 w-3/5 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- TrustStripLogos ---------------- */
function TrustStripLogosSkeleton() {
  return (
    <div className="w-full overflow-hidden rounded-[24px] border bg-white pb-2 pt-4 lg:pb-0 lg:pt-5" style={{ borderColor: C.hair }}>
      <Shimmer className="mx-auto h-2.5 w-56 rounded" />
      <div className="mt-5 space-y-3 px-6 lg:mt-6">
        {Array.from({ length: 2 }).map((_, row) => (
          <div key={row} className="flex items-center justify-between gap-6 py-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Shimmer key={i} className="h-6 w-16 shrink-0 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- TopCategoriesAccordion ---------------- */
function TopCategoriesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pt-1">
        <div>
          <Shimmer className="h-6 w-44 rounded" />
        </div>
        <Shimmer className="h-3 w-14 rounded" />
      </div>

      <div className="overflow-hidden rounded-[24px] border bg-white lg:flex lg:items-start" style={{ borderColor: C.hair }}>
        {Array.from({ length: 2 }).map((_, col) => (
          <div
            key={col}
            className="lg:flex-1"
            style={col === 0 ? { borderRight: `1px solid ${C.hair}` } : undefined}
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={i !== 0 ? { borderTop: `1px solid ${C.hair}` } : undefined}>
                <Shimmer className="aspect-[3/1] w-full rounded-none lg:aspect-[16/7]" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- StartSellingBanner ---------------- */
function StartSellingBannerSkeleton() {
  return (
    <div
      className="mt-4 flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 sm:px-3.5 sm:py-3"
      style={{ borderColor: C.hair }}
    >
      <Shimmer className="h-8 w-8 shrink-0 rounded-lg sm:h-9 sm:w-9" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Shimmer className="h-3 w-40 rounded" />
        <Shimmer className="h-2.5 w-28 rounded" />
      </div>
      <Shimmer className="hidden h-7 w-28 shrink-0 rounded-full sm:block" />
    </div>
  );
}

/* ---------------- Shimmer primitive ---------------- */
function Shimmer({ className = "", style }) {
  return (
    <div
      className={`relative overflow-hidden bg-[rgba(11,17,22,0.06)] ${className}`}
      style={style}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </div>
  );
}