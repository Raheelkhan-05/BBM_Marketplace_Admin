//src/components/landing/SearchBar.jsx

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, SlidersHorizontal } from "lucide-react";

const QUICK_TAGS = ["Steel Pipes", "Bearings", "Motors", "Valves"];

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const goToSearch = (q) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    goToSearch(query);
  };

  const handleTagClick = (tag) => {
    setQuery(tag);
    goToSearch(tag);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.48 }}
      className="mt-6 lg:max-w-xl"
    >
      <form
        onSubmit={handleSubmit}
        className="flex w-full items-center overflow-hidden rounded-xl border-2 border-slate-100 bg-white shadow-[0_12px_32px_-14px_rgba(4,112,132,0.28)] transition-colors focus-within:border-[#7fb3bd]"
      >
        <Search className="ml-3.5 h-4 w-4 shrink-0 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for products, brands, categories..."
          className="w-full bg-transparent px-3 py-3.5 text-[13.5px] font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none"
        />
        <button
          type="button"
          className="hidden shrink-0 items-center gap-1.5 border-l border-slate-100 px-3.5 py-3.5 text-[12px] font-semibold text-slate-500 hover:text-[#047084] sm:inline-flex"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </button>
        <button
          type="submit"
          aria-label="Search"
          className="m-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white shadow-[0_6px_14px_-4px_rgba(199,31,17,0.5)] transition-transform hover:-translate-y-0.5"
          style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}
        >
          <Search className="h-4 w-4" />
        </button>
      </form>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-slate-400">Popular:</span>
        {QUICK_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => handleTagClick(tag)}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:border-[#7fb3bd] hover:bg-[#e6ecee] hover:text-[#047084]"
          >
            {tag}
          </button>
        ))}
      </div>
    </motion.div>
  );
}