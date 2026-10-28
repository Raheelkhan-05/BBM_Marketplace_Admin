// components/home/GroupBannerBlock.jsx — one full-width "block" of 1–4 banners, shown between feed sections.
// Layout is driven by `columnCount` (1 = phone) instead of CSS breakpoints, so it always matches the feed
// and the admin preview. Template names/counts MUST match TEMPLATES in services/groupBanners.service.js.
import { motion } from "framer-motion";
import { resizedImageUrl } from "../../utils/imageUrl";
import { pickImage } from "./bannerShapes.js";

const EASE = [0.16, 1, 0.3, 1];
const GAP = "gap-2.5 sm:gap-3";
const COUNT = { hero: 1, duo: 2, trio: 3, mosaic: 3, quad: 4 };
const BY_COUNT = ["hero", "duo", "trio", "quad"];

function Slot({ banner, ratio, cls = "", width = 720, priority = false, onOpen }) {
    const pick = pickImage(banner, ratio);
    if (!pick) return null;
    const count = Number(banner.variant_count) || 0;
    return (
        <button
            type="button"
            onClick={() => onOpen?.(banner)}
            aria-label={`${banner.name}${count ? `, ${count} variants` : ""}. View all variants`}
            className={`group relative block w-full overflow-hidden rounded-2xl bg-[#F4F5F6] outline-none focus-visible:ring-2 focus-visible:ring-[#de3207] ${cls}`}
        >
            <img
                src={resizedImageUrl(pick.url, { width })}
                alt={banner.alt_text || banner.name || ""}
                loading={priority ? "eager" : "lazy"}
                decoding="async"
                referrerPolicy="no-referrer"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
        </button>
    );
}

// Simple grid templates. Each slot: its own aspect classes + the ratio used to pick the best image shape.
const GRIDS = {
    hero: (c) => ({ grid: "grid-cols-1", width: 1280, slots: [{ cls: c ? "aspect-[16/9]" : "aspect-[2/1]", ratio: 16 / 9 }] }),
    duo: (c) => ({ grid: "grid-cols-2", width: 800, slots: [0, 1].map(() => ({ cls: c ? "aspect-square" : "aspect-[4/3]", ratio: c ? 1 : 4 / 3 })) }),
    trio: (c) => c
        ? { grid: "grid-cols-2", width: 800, slots: [{ cls: "col-span-2 aspect-[16/9]", ratio: 16 / 9 }, { cls: "aspect-square", ratio: 1 }, { cls: "aspect-square", ratio: 1 }] }
        : { grid: "grid-cols-3", width: 640, slots: [0, 1, 2].map(() => ({ cls: "aspect-[3/4]", ratio: 3 / 4 })) },
    quad: (c) => ({ grid: c ? "grid-cols-2" : "grid-cols-4", width: 640, slots: [0, 1, 2, 3].map(() => ({ cls: "aspect-square", ratio: 1 })) }),
};

export default function GroupBannerBlock({ block, bannersById, columnCount = 3, onOpen, priority = false }) {
    const compact = columnCount <= 1;
    const items = (block?.groups || []).map((id) => bannersById.get(String(id))).filter(Boolean);
    if (!items.length) return null;

    // If a banner went missing, fall back to the template that fits what is left.
    const tpl = COUNT[block.template] === items.length ? block.template : BY_COUNT[Math.min(items.length, 4) - 1];

    let body;
    if (tpl === "mosaic") {
        body = (
            <div className={`grid grid-cols-2 ${GAP}`}>
                <Slot banner={items[0]} ratio={3 / 4} cls="aspect-[3/4]" width={720} priority={priority} onOpen={onOpen} />
                <div className={`grid grid-rows-2 ${GAP}`}>
                    <Slot banner={items[1]} ratio={4 / 3} cls="h-full" width={720} priority={priority} onOpen={onOpen} />
                    <Slot banner={items[2]} ratio={4 / 3} cls="h-full" width={720} priority={priority} onOpen={onOpen} />
                </div>
            </div>
        );
    } else {
        const spec = GRIDS[tpl](compact);
        body = (
            <div className={`grid ${spec.grid} ${GAP}`}>
                {items.map((b, i) => (
                    <Slot key={b.group_id} banner={b} ratio={spec.slots[i].ratio} cls={spec.slots[i].cls}
                        width={spec.width} priority={priority && i === 0} onOpen={onOpen} />
                ))}
            </div>
        );
    }

    return (
        <motion.section
            aria-label="Featured product ranges"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "0px 0px -8% 0px" }}
            transition={{ duration: 0.35, ease: EASE }}
            className="px-2.5 py-3 sm:px-3"
        >
            {body}
        </motion.section>
    );
}