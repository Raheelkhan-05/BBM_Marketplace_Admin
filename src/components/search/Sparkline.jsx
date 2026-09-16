//src/components/search/Sparkline.jsx

import { useId, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

function buildSmoothPath(points) {
  if (points.length < 2) return "";
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

// Assigns a stable id to each value in a sliding window: [150,140,155,145,170] -> [157...]
// becomes [140,155,145,170,157]. We detect "dropped first, appended one new at end" and
// carry ids forward for the surviving points, so React/motion can animate them sliding
// left instead of the whole line just popping to a new shape.
function useStableWindowIds(data) {
  const stateRef = useRef({ ids: [], values: [], counter: 0 });

  return useMemo(() => {
    const prev = stateRef.current;
    const isShiftedWindow =
      data.length === prev.values.length &&
      data.length > 1 &&
      prev.values.slice(1).every((v, i) => v === data[i]);

    let ids;
    if (isShiftedWindow) {
      // Drop oldest id, keep the rest, mint one new id for the newly appended value.
      ids = [...prev.ids.slice(1), prev.counter];
      stateRef.current = { ids, values: data, counter: prev.counter + 1 };
    } else if (data.length === prev.values.length) {
      // Same length but not a clean shift (e.g. in-place tick update) — keep existing ids.
      ids = prev.ids;
      stateRef.current = { ids, values: data, counter: prev.counter };
    } else {
      // First load / different length — mint fresh ids for everything.
      ids = data.map((_, i) => prev.counter + i);
      stateRef.current = { ids, values: data, counter: prev.counter + data.length };
    }

    return data.map((value, i) => ({ id: ids[i], value }));
  }, [data]);
}

export default function Sparkline({ data, color }) {
  const uid = useId();
  const w = 120;
  const h = 34;
  const padY = 4;
  const dotR = 2;

  const windowed = useStableWindowIds(data || []);

  const { linePath, areaPath, points } = useMemo(() => {
    if (windowed.length < 2) return {};
    const values = windowed.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const pts = windowed.map((p, i) => ({
      id: p.id,
      value: p.value,
      x: (i / (windowed.length - 1)) * w,
      y: padY + (h - padY * 2) - ((p.value - min) / range) * (h - padY * 2),
    }));

    const line = buildSmoothPath(pts);
    const area = `${line} L ${w},${h} L 0,${h} Z`;

    return { linePath: line, areaPath: area, points: pts };
  }, [windowed]);

  if (!linePath) return null;

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        <motion.path
          d={areaPath}
          fill={`url(#fill-${uid})`}
          animate={{ d: areaPath, opacity: 1 }}
          initial={false}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        />

        {/* Line morphs smoothly since point count stays constant — framer-motion
            interpolates the numbers inside the 'd' string tick to tick. */}
        <motion.path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          animate={{ d: linePath }}
          initial={false}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        />

        {/* Point markers — keyed by stable id so entering/exiting points animate
            in/out while surviving points glide to their new x/y. */}
        <AnimatePresence initial={false}>
          {points.map((p, i) => {
            const isLast = i === points.length - 1;
            return (
              <motion.circle
                key={p.id}
                r={isLast ? dotR + 0.5 : dotR}
                fill={isLast ? color : "white"}
                stroke={color}
                strokeWidth={isLast ? 0 : 1.5}
                initial={{ cx: w + 10, cy: p.y, opacity: 0 }}
                animate={{ cx: p.x, cy: p.y, opacity: 1 }}
                exit={{ cx: -10, opacity: 0 }}
                transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
              />
            );
          })}
        </AnimatePresence>
      </svg>
    </div>
  );
}