// src/components/landing/BackgroundAmbience.jsx
import { motion } from "framer-motion";

// A quiet, premium surface: cool near-white base, a single faint dot grid,
// and two soft diffused color blooms — enough depth to feel considered,
// restrained enough to stay well behind content.
export default function BackgroundAmbience() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden bg-[#FCFBF9]">
      {/* Single faint dot grid */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(4,55,64,0.06) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Very subtle top-down light falloff, keeps the page from feeling flat */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(4,55,64,0.025) 0%, transparent 22%, transparent 78%, rgba(4,55,64,0.02) 100%)",
        }}
      />

      <motion.div
        className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full blur-[110px]"
        style={{ background: "radial-gradient(circle, rgba(4,112,132,0.09) 0%, transparent 70%)" }}
        animate={{ x: [0, 26, 0], y: [0, 18, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-44 -right-36 h-[32rem] w-[32rem] rounded-full blur-[110px]"
        style={{ background: "radial-gradient(circle, rgba(199,31,17,0.05) 0%, transparent 70%)" }}
        animate={{ x: [0, -20, 0], y: [0, -14, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}