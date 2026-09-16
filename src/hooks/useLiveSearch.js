//src/hooks/useLiveSearch.js

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchSearchResults, jitterProducts } from "../../data/mockProducts";

const LIVE_UPDATE_INTERVAL = 4000;

// Later: point this at your real search endpoint + a websocket/poll for
// price ticks. Everything downstream (SearchResultsPage, ProductResultCard)
// only cares about the `data` shape, so no UI changes will be required.
export default function useLiveSearch(query) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);

  const loadResults = useCallback(async (q) => {
    setLoading(true);
    const res = await fetchSearchResults(q);
    setData(res);
    setLastUpdated(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadResults(query);
  }, [query, loadResults]);

  // Live price ticking — updates in place, no refetch/reload.

  useEffect(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setData((prev) => {
        if (!prev || prev.products.length === 0) return prev;
        return { ...prev, products: jitterProducts(prev.products) };
      });
      setLastUpdated(Date.now());
    }, LIVE_UPDATE_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [query]);

  return { data, loading, lastUpdated };
}