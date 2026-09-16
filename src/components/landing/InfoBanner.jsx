//InfoBanner.jsx

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  Wallet,
  Building2,
  Repeat,
  Boxes,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { bannerCards } from "../../../data/content";

const ICONS = {
  "bar-chart": BarChart3,
  wallet: Wallet,
  building: Building2,
  repeat: Repeat,
  boxes: Boxes,
};

const AUTOPLAY_DELAY = 3000;

export default function InfoBanner() {
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState(1);
  const isInteractingRef = useRef(false);
  const resumeTimeoutRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => {
      if (!isInteractingRef.current) {
        setDirection(1);
        setActive((prev) => (prev + 1) % bannerCards.length);
      }
    }, AUTOPLAY_DELAY);
    return () => clearInterval(id);
  }, []);

  const pause = useCallback(() => {
    isInteractingRef.current = true;
    window.clearTimeout(resumeTimeoutRef.current);
  }, []);

  const resumeDelayed = useCallback(() => {
    window.clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = window.setTimeout(() => {
      isInteractingRef.current = false;
    }, 4000);
  }, []);

  const goTo = (i) => {
    pause();
    setDirection(i > active ? 1 : -1);
    setActive(i);
    resumeDelayed();
  };

  const goNext = () => {
    pause();
    setDirection(1);
    setActive((prev) => (prev + 1) % bannerCards.length);
    resumeDelayed();
  };

  const goPrev = () => {
    pause();
    setDirection(-1);
    setActive((prev) => (prev - 1 + bannerCards.length) % bannerCards.length);
    resumeDelayed();
  };

  const touchStartX = useRef(0);
  const onTouchStart = (e) => {
    pause();
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e) => {
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (delta > 40) goPrev();
    else if (delta < -40) goNext();
    else resumeDelayed();
  };

  const card = bannerCards[active];
  const Icon = ICONS[card.icon];

  const variants = {
    enter: (dir) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
  };

  // ...keep all existing state, refs, handlers, and `variants` unchanged above...

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      onMouseEnter={pause}
      onMouseLeave={resumeDelayed}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="mt-4 relative flex items-center gap-3 rounded-xl px-4 py-3 lg:max-w-xl overflow-hidden select-none shadow-[0_8px_24px_-14px_rgba(4,112,132,0.35)]"
      style={{
        background: "linear-gradient(135deg, rgba(4,112,132,0.07) 0%, rgba(127,179,189,0.12) 100%)",
        borderWidth: 1,
        borderColor: "rgba(4,112,132,0.18)",
      }}
    >
      <div className="flex-1 min-w-0 relative h-[38px] overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={card.id}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="absolute inset-0 flex items-center gap-2.5"
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-[0_4px_10px_-3px_rgba(4,112,132,0.5)]"
              style={{ background: "linear-gradient(135deg, #047084 0%, #7fb3bd 100%)" }}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-slate-900 tracking-wide truncate">
                {card.title}
              </p>
              <p className="text-[11px] font-medium text-slate-500 truncate">
                {card.desc}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="hidden sm:flex items-center gap-1 shrink-0">
        {bannerCards.map((c, i) => (
          <button
            key={c.id}
            onClick={() => goTo(i)}
            aria-label={`Go to card ${i + 1}`}
            className="h-1.5 rounded-full transition-all duration-300"
            style={{
              width: i === active ? 16 : 5,
              backgroundColor: i === active ? "#d2462b" : "rgba(4,113,132,0.25)",
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}