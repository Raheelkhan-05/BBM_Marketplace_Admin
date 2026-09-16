import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Scale, Wallet, ShieldCheck, Repeat, Boxes, Zap, BarChart3, CircleUserRound,
  MapPin, MessageSquareCheck, Store, Link2, Clock, TrendingDown, Layers, Tags,
  Flag, Users, Lock, Factory, Eye, TrendingUp, ChevronDown,
} from "lucide-react";
import { whyBBM } from "../../../data/content";

const ICONS = {
  scale: Scale, wallet: Wallet, "check-shield": ShieldCheck, repeat: Repeat,
  boxes: Boxes, bolt: Zap, "bar-chart": BarChart3, "user-circle": CircleUserRound,
  map: MapPin, "message-check": MessageSquareCheck, store: Store, link: Link2,
  clock: Clock, "trending-down": TrendingDown, layers: Layers, tags: Tags,
  flag: Flag, users: Users, lock: Lock, factory: Factory, eye: Eye,
  "trending-up": TrendingUp,
};

const HEADING_ICONS = { buy: Scale, sell: MapPin, platform: Flag };

// Duration/easing kept identical to the grid-row transition so the
// scroll and the panel-opening feel like a single, unified motion.
// Replace TRANSITION_MS/easeInOutCubic/animateScrollBy with this:

const TRANSITION_MS = 140;

// Continuously re-measures the panel's bottom edge (which moves every
// frame while the grid row is animating open) and nudges the scroll
// position toward it each frame, instead of calculating one fixed
// distance upfront. This keeps pace with the growing panel on any
// screen size, including mobile viewports where the panel height
// change is proportionally larger.
function chaseScrollToReveal(track, buffer = 64, durationMs = TRANSITION_MS) {
  const start = performance.now();

  function step(now) {
    const elapsed = now - start;
    const rect = track.getBoundingClientRect();
    const viewportH = window.visualViewport?.height ?? window.innerHeight;
    const overflow = rect.bottom + buffer - viewportH;

    if (overflow > 1) {
      // catch up faster as we approach the end of the animation window,
      // so we land exactly on target right as the panel finishes growing
      const remaining = Math.max(durationMs - elapsed, 32);
      const portion = Math.min(1, 32 / remaining);
      window.scrollBy(0, overflow * portion);
    }

    // keep chasing a little past the animation end in case of
    // late layout shifts (fonts, images) settling
    if (elapsed < durationMs + 150) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

function HeadingCard({ item, isOpen, onToggle }) {
  const Icon = HEADING_ICONS[item.id] ?? Boxes;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      className="flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center transition-all duration-300 sm:gap-3 sm:px-5 sm:py-6"
      style={{
        borderColor: isOpen ? item.accent : "#e7e5e4",
        backgroundColor: isOpen ? item.tint : "#ffffff",
        boxShadow: isOpen ? `0 4px 20px -6px ${item.accent}55` : "none",
      }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-300 sm:h-11 sm:w-11"
        style={{
          backgroundColor: isOpen ? item.accent : "#f8f7f6",
          color: isOpen ? "#ffffff" : item.accent,
        }}
      >
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
      </span>

      <span className="flex flex-col gap-0.5">
        <span className="text-[12px] font-bold leading-tight text-slate-900 sm:text-[15px]">
          {item.heading}
        </span>
        <span
          className="text-[10px] font-medium leading-tight sm:text-[12px]"
          style={{ color: item.accent }}
        >
          {item.hero}
        </span>
      </span>

      <motion.span
        animate={{ rotate: isOpen ? 180 : 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="text-slate-400"
      >
        <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </motion.span>
    </button>
  );
}

function PointRow({ point, accent, index }) {
  const PointIcon = ICONS[point.icon] ?? Boxes;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.04 * index }}
      className="grid items-center gap-x-2.5"
      style={{ gridTemplateColumns: "24px 1fr" }}
    >
      <span
        className="flex h-6 w-6 items-center justify-center self-center rounded-full bg-white"
        style={{ color: accent }}
      >
        <PointIcon className="h-3.5 w-3.5" />
      </span>
      <span className="text-[13px] leading-snug text-slate-700 sm:text-[14px]">
        {point.text}
      </span>
    </motion.div>
  );
}

function PanelContent({ item }) {
  return (
    <motion.div
      key={item.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-2xl border px-4 py-5 sm:px-6 sm:py-6"
      style={{ borderColor: item.accent + "33", backgroundColor: item.tint }}
    >
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {item.points.map((p, i) => (
          <PointRow key={p.text} point={p} accent={item.accent} index={i} />
        ))}
      </div>
    </motion.div>
  );
}

export default function WhyBBMSection() {
  const [activeId, setActiveId] = useState(null);
  const activeItem = whyBBM.find((i) => i.id === activeId);
  const trackRef = useRef(null);
  const panelInnerRef = useRef(null);
  const isOpen = Boolean(activeItem);

  const handleToggle = (id) => {
    const opening = activeId !== id;
    setActiveId(activeId === id ? null : id);
    if (!opening) return;

    requestAnimationFrame(() => {
      const track = trackRef.current;
      if (!track) return;
      chaseScrollToReveal(track);
    });
  };

  return (
    <div className="mt-6 lg:mt-14 lg:px-0">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.5 }}
        className="mx-auto lg:max-w-3xl"
      >
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {whyBBM.map((item) => (
            <HeadingCard
              key={item.id}
              item={item}
              isOpen={activeId === item.id}
              onToggle={() => handleToggle(item.id)}
            />
          ))}
        </div>

        <div
          ref={trackRef}
          className="scroll-mt-24 grid transition-[grid-template-rows] duration-[450ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="mt-3 sm:mt-4">
              <AnimatePresence mode="wait" initial={false}>
                {activeItem && <PanelContent item={activeItem} />}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}