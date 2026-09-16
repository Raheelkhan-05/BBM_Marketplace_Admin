import { motion } from "framer-motion";

/* ------------------------------------------------------------------
   DESIGN NOTES — trust strip, matched to the hero/quick-actions system
   ------------------------------------------------------------------
   Updates in this pass:
     - Logos now render in full color at rest (no grayscale/opacity
       dimming) — only a subtle scale lift remains on hover.
     - Removed the hairline divider between the two marquee rows;
       the two rows now sit directly stacked with just spacing.
     - Edge fade extended to the whole card, not just each row: the
       outer wrapper itself carries the mask-image gradient so the
       white background dissolves at the left/right edges along with
       the logos, instead of the card having a hard rectangular edge.

   Palette/tokens: ink #0B1116, muted #667077, hairline
   rgba(11,17,22,0.09) — same as hero/quick actions. No new colors
   introduced.
   Data contract (`trustBrands`, `onSelect` behavior) unchanged.
   ------------------------------------------------------------------ */

const C = {
    ink: "#0B1116",
    muted: "#667077",
    hair: "rgba(11,17,22,0.09)",
};

const trustBrands = [
    { name: "SKF Group", logo: "https://upload.wikimedia.org/wikipedia/commons/b/b8/SKF_logo.svg" },
    { name: "Shell", logo: "https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/shell.svg" },
    { name: "3M", logo: "https://upload.wikimedia.org/wikipedia/commons/1/15/3M_wordmark.svg" },
    { name: "Schneider Electric", logo: "https://upload.wikimedia.org/wikipedia/commons/9/95/Schneider_Electric_2007.svg" },
    { name: "Bosch Rexroth", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Logo_of_Bosch_Rexroth_AG.svg/1280px-Logo_of_Bosch_Rexroth_AG.svg.png" },
    { name: "Würth Group", logo: "https://upload.wikimedia.org/wikipedia/commons/2/26/WURTH.png" },
    { name: "Honeywell", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Honeywell_logo.svg/1280px-Honeywell_logo.svg.png" },
    { name: "ArcelorMittal", logo: "https://upload.wikimedia.org/wikipedia/commons/c/cd/Arcelormittal-logo.svg" },
    { name: "Sandvik", logo: "https://upload.wikimedia.org/wikipedia/commons/b/b8/SANDVIK.svg" },
    { name: "Siemens", logo: "https://upload.wikimedia.org/wikipedia/commons/5/5f/Siemens-logo.svg" },
    { name: "ABB", logo: "https://upload.wikimedia.org/wikipedia/commons/0/00/ABB_logo.svg" },
    { name: "Parker Hannifin", logo: "https://upload.wikimedia.org/wikipedia/commons/9/9e/Parker_Hannifin.svg" },
    { name: "Eaton", logo: "https://upload.wikimedia.org/wikipedia/commons/2/2b/Eaton_Corporation_logo.svg" },
    { name: "Festool", logo: "https://upload.wikimedia.org/wikipedia/commons/4/4d/Festool.svg" },
    { name: "Danfoss", logo: "https://upload.wikimedia.org/wikipedia/commons/f/f2/Danfoss-Logo.svg" },
    { name: "Emerson", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Logo_Emerson.svg/1280px-Logo_Emerson.svg.png" },
    { name: "Rockwell Automation", logo: "https://upload.wikimedia.org/wikipedia/commons/a/a5/Rockwell_Automation_logo_%282019%29.svg" },
    { name: "Atlas Copco", logo: "https://upload.wikimedia.org/wikipedia/commons/4/42/Atlas_logo.png" },
];

function TrustLogo({ brand, onSelect }) {
    return (
        <button
            onClick={() => onSelect(brand.name)}
            className="group mx-4 flex shrink-0 items-center justify-center sm:mx-5 lg:mx-8"
            title={`Search ${brand.name}`}
        >
            <img
                src={brand.logo}
                alt={brand.name}
                loading="lazy"
                className="h-5 w-auto object-contain transition-transform duration-300 ease-out group-hover:scale-110 sm:h-6 lg:h-8"
            />
        </button>
    );
}

function MarqueeRow({ brands, direction = "left", onSelect }) {
    const loop = [...brands, ...brands];
    return (
        <div className="relative overflow-hidden">
            <div
                className={`flex w-max items-center py-3 lg:py-4 ${direction === "left" ? "animate-marquee-left" : "animate-marquee-right"
                    }`}
            >
                {loop.map((brand, i) => (
                    <TrustLogo key={`${brand.name}-${i}`} brand={brand} onSelect={onSelect} />
                ))}
            </div>
        </div>
    );
}

function TrustStripLogos() {
    const handleSelect = (name) => {
        window.location.href = `/search?query=${encodeURIComponent(name)}`;
    };

    return (
        <div
            className="w-full overflow-hidden rounded-[8px] sm:rounded-[20px] border bg-white pb-2 pt-4 lg:pb-0 lg:pt-5"
            style={{
                borderColor: C.hair,
                maskImage: "linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)",
            }}
        >
            <motion.div
                initial={{ opacity: 0, y: 6 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center justify-center gap-2"
            >
                <h3
                    className="font-mono text-[10.5px] sm:text-[12.5px] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: C.muted }}
                >
                    Trusted by teams sourcing from
                </h3>
            </motion.div>

            <div className="mt-5 space-y-1 lg:mt-6">
                <MarqueeRow brands={trustBrands} direction="left" onSelect={handleSelect} />
                <MarqueeRow brands={[...trustBrands].reverse()} direction="right" onSelect={handleSelect} />
            </div>

            <style>{`
        @keyframes marquee-left {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes marquee-right {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        .animate-marquee-left {
          animation: marquee-left 64s linear infinite;
        }
        .animate-marquee-right {
          animation: marquee-right 64s linear infinite;
        }
        .animate-marquee-left:hover,
        .animate-marquee-right:hover {
          animation-play-state: paused;
        }
        @media (min-width: 1024px) {
          .animate-marquee-left,
          .animate-marquee-right {
            animation-duration: 90s;
          }
        }
      `}</style>
        </div>
    );
}

export default TrustStripLogos;