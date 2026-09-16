import { useState, useEffect, useCallback, useRef } from "react";
import { searchShops } from "../utils/api.js";

const DEBOUNCE_MS = 300;

// Mirrors useLiveSearch's shape ({ data, loading }) so SearchResultsPage
// can consume both hooks the same way.
export default function useShopSearch(query) {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const run = useCallback(async (q) => {
    if (!q || q.trim().length < 2) { setShops([]); setLoading(false); return; }
    setLoading(true);
    const res = await searchShops(q.trim());
    setShops(res?.success ? res.shops : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => run(query), DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [query, run]);

  return { shops, loading };
}