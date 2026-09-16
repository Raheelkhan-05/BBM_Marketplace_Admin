//ShowcaseHub.jsx

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { showcaseProducts, features } from "../../../data/content";

const ICONS = {
  tag: () => (
    <svg className="h-6 w-6 sm:h-7 sm:w-7" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.72 2.29a2.75 2.75 0 0 0-3.89 0L2.29 8.83a2.75 2.75 0 0 0 0 3.89l7.46 7.46a2.75 2.75 0 0 0 3.89 0l6.54-6.54a2.75 2.75 0 0 0 0-3.89l-7.46-7.46ZM7 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"/>
    </svg>
  ),
  "check-shield": () => (
    <svg className="h-6 w-6 sm:h-7 sm:w-7" viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M12.5 2.25a.75.75 0 0 0-1 0 11.96 11.96 0 0 1-7.83 3.31.75.75 0 0 0-.67.74c0 6.13 3.73 11.38 9 13.12a.75.75 0 0 0 .5 0c5.27-1.74 9-7 9-13.12a.75.75 0 0 0-.67-.74A11.96 11.96 0 0 1 12.5 2.25Zm3.28 7.78a.75.75 0 0 0-1.06-1.06l-4.22 4.22-1.72-1.72a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.75-4.75Z" clipRule="evenodd" />
    </svg>
  ),
  box: () => (
    <svg className="h-6 w-6 sm:h-7 sm:w-7" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.644 1.44a.75.75 0 0 1 .712 0l7.75 4.173a.75.75 0 0 1 0 1.314l-7.75 4.173a.75.75 0 0 1-.712 0L3.894 6.927a.75.75 0 0 1 0-1.314l7.75-4.173Z" />
      <path d="M11.25 12.54 3.75 8.5v8.586a.75.75 0 0 0 .394.657l7.106 3.826V12.54Zm1.5 0v9.069l7.106-3.826a.75.75 0 0 0 .394-.657V8.5l-7.5 4.04Z" />
    </svg>
  ),
  bolt: () => (
    <svg className="h-6 w-6 sm:h-7 sm:w-7" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.828 2.285a.75.75 0 0 0-1.293.44l-2.5 10.5a.75.75 0 0 0 .937.894l3.184-1.062-2.184 8.653a.75.75 0 0 0 1.293.44l6.5-10.5a.75.75 0 0 0-.64-1.144l-3.69.123 2.194-7.344Z" />
    </svg>
  ),
};

const AUTOPLAY_DELAY = 3500;
const SWIPE_THRESHOLD = 40;

export default function ShowcaseHub() {
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState(1); // 1 = forward (R->L), -1 = backward (L->R)
  const isInteractingRef = useRef(false);
  const resumeTimeoutRef = useRef(null);
  const touchStartX = useRef(0);

  // Autoplay always advances forward, regardless of which way the
  // user last swiped manually.
  useEffect(() => {
    const id = setInterval(() => {
      if (!isInteractingRef.current) {
        setDirection(1);
        setActive((prev) => (prev + 1) % showcaseProducts.length);
      }
    }, AUTOPLAY_DELAY);
    return () => clearInterval(id);
  }, []);

  const pauseAutoplay = useCallback(() => {
    isInteractingRef.current = true;
    window.clearTimeout(resumeTimeoutRef.current);
  }, []);

  const resumeAutoplayDelayed = useCallback(() => {
    window.clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = window.setTimeout(() => {
      isInteractingRef.current = false;
    }, 4000);
  }, []);

  const goTo = useCallback((i) => {
    setActive((prev) => {
      const total = showcaseProducts.length;
      const next = ((i % total) + total) % total;
      setDirection(next > prev || (prev === total - 1 && next === 0) ? 1 : -1);
      return next;
    });
  }, []);

  const goNext = useCallback(() => {
    setDirection(1);
    setActive((prev) => (prev + 1) % showcaseProducts.length);
  }, []);

  const goPrev = useCallback(() => {
    setDirection(-1);
    setActive((prev) => (prev - 1 + showcaseProducts.length) % showcaseProducts.length);
  }, []);

  const onTouchStart = (e) => {
    pauseAutoplay();
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e) => {
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (delta < -SWIPE_THRESHOLD) goNext();      // swiped right -> left
    else if (delta > SWIPE_THRESHOLD) goPrev();  // swiped left -> right
    resumeAutoplayDelayed();
  };

  // direction-aware slide+fade, shared by mobile and desktop
  const variants = {
    enter: (dir) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
  };

  const slide = (className) => (
    <AnimatePresence mode="popLayout" custom={direction} initial={false}>
      {showcaseProducts[active] && (
        <motion.img
          key={active}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
          src={showcaseProducts[active].src}
          alt={showcaseProducts[active].alt}
          className={className}
          draggable={false}
        />
      )}
    </AnimatePresence>
  );

return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center p-4 md:p-8 md:pt-4">
      <div className="relative w-full overflow-hidden flex flex-col items-center justify-center">
        <div
          className="absolute inset-0 rounded-[28px]"
          style={{ background: "radial-gradient(ellipse at center, rgba(4,112,132,0.06) 0%, transparent 70%)" }}
        />

        {/* Mobile */}
        <div className="w-full lg:hidden relative flex flex-col items-center sm:px-4" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div
            className="relative w-full aspect-[4/3] max-w-sm overflow-hidden rounded-2xl ring-1 ring-black/5"
            style={{ boxShadow: "0 24px 48px -20px rgba(4,112,132,0.35)" }}
          >
            {slide("absolute inset-0 h-full w-full object-cover select-none")}
            <div
              className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold text-white shadow-md"
              style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}
            >
              Verified Supplier
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-3 pb-4">
            {showcaseProducts.map((p, i) => (
              <button
                key={p.id}
                onClick={() => { pauseAutoplay(); goTo(i); resumeAutoplayDelayed(); }}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? "w-5 bg-[#d2462b]" : "w-1.5 bg-slate-300/70"}`}
              />
            ))}
          </div>
        </div>

        {/* Desktop */}
        <div className="hidden lg:flex w-full items-center justify-center p-6" onMouseEnter={pauseAutoplay} onMouseLeave={resumeAutoplayDelayed}>
          <div
            className="relative w-full max-w-2xl aspect-[4/3] overflow-hidden rounded-[28px] ring-1 ring-black/5"
            style={{ boxShadow: "0 32px 64px -24px rgba(4,112,132,0.4)" }}
          >
            <motion.div
              className="absolute inset-0"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.15}
              onDragStart={pauseAutoplay}
              onDragEnd={(e, info) => {
                if (info.offset.x < -SWIPE_THRESHOLD) goNext();
                else if (info.offset.x > SWIPE_THRESHOLD) goPrev();
                resumeAutoplayDelayed();
              }}
            >
              {slide("absolute inset-0 h-full w-full object-cover select-none")}
            </motion.div>

            <div
              className="absolute left-4 top-4 rounded-full px-3 py-1.5 text-[11px] font-bold text-white shadow-lg"
              style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}
            >
              Verified Supplier
            </div>

            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/35 to-transparent" />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
              {showcaseProducts.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => { pauseAutoplay(); goTo(i); resumeAutoplayDelayed(); }}
                  aria-label={`Go to slide ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? "w-5 bg-white" : "w-1.5 bg-white/60"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="w-full bg-white rounded-2xl border border-slate-100 shadow-[0_20px_48px_-16px_rgba(4,112,132,0.18)] px-0 py-5 sm:px-6 sm:py-5 md:px-2">
        <div className="grid grid-cols-4 w-full gap-x-1">
          {features.map((f, i) => {
            const IconComponent = ICONS[f.icon];
            return (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="flex flex-col items-center text-center relative px-1.5 sm:px-3 min-w-0"
              >
                {i !== 0 && <div className="absolute left-0 top-2 bottom-2 w-px bg-slate-100" />}
                <div
                  className="flex h-11 w-11 sm:h-[52px] sm:w-[52px] md:h-[58px] md:w-[58px] shrink-0 items-center justify-center rounded-2xl shadow-[0_6px_16px_-6px_rgba(4,112,132,0.35)]"
                  style={{ backgroundColor: f.bg, color: f.fg }}
                >
                  <IconComponent />
                </div>
                <h3
                  className="mt-3 sm:mt-4 text-[12px] leading-[1.15] px-0.5 sm:text-[14px] font-extrabold tracking-tight text-slate-900 sm:leading-snug w-full"
                  style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
                >
                  {f.title}
                </h3>
                <p className="mt-1.5 sm:mt-2 max-w-[92px] sm:max-w-[150px] md:max-w-[165px] text-[10px] leading-[1.3] sm:text-[12px] text-slate-400 font-medium">
                  {f.desc}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}