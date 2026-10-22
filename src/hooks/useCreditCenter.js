// hooks/useCreditCenter.js
//
// All data + actions behind the Credit page.
//
// REALTIME: the server emits `credit:changed` to BOTH people's user rooms on
// every credit action. Any of those (plus reconnect and tab-becomes-visible)
// triggers a silent refetch, so the screen always converges on server truth.
// Actions also patch local state optimistically for an instant response; the
// refetch that follows every action corrects it if the server disagreed.
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import {
    fetchCreditSellers, fetchCreditIncoming, fetchCreditHistory,
    requestCredit, decideCredit, toggleCredit, updateCreditLimit,
    requestCreditIncrease, declineCreditIncrease,
    searchCreditBuyers, grantCreditToBuyer,
} from "../utils/api.js";

const HISTORY_PAGE = 30;

export default function useCreditCenter({ isSeller, historyOpen, historyRole }) {
    const { token } = useAuth();
    const { socket, connected } = useSocket();

    const [sellers, setSellers] = useState([]);
    const [sellersLoaded, setSellersLoaded] = useState(false);
    const [incoming, setIncoming] = useState([]);
    const [incomingLoaded, setIncomingLoaded] = useState(false);
    const [history, setHistory] = useState([]);
    const [historyHasMore, setHistoryHasMore] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
    const [busy, setBusy] = useState({});
    const [error, setError] = useState(null);

    const seq = useRef({ sellers: 0, incoming: 0, history: 0 });
    const historyRef = useRef([]);
    useEffect(() => { historyRef.current = history; }, [history]);

    // ---- loaders (stale-response safe) ----------------------------------

    const loadSellers = useCallback(async () => {
        if (!token) return;
        const my = ++seq.current.sellers;
        try {
            const res = await fetchCreditSellers(token);
            if (my !== seq.current.sellers) return;
            if (res?.success) setSellers(res.sellers || []);
            else setError(res?.message || "Couldn't load sellers.");
        } catch { /* network blip — the next event/refocus retries */ }
        if (my === seq.current.sellers) setSellersLoaded(true);
    }, [token]);

    const loadIncoming = useCallback(async () => {
        if (!token) return;
        const my = ++seq.current.incoming;
        try {
            const res = await fetchCreditIncoming(token);
            if (my !== seq.current.incoming) return;
            if (res?.success) setIncoming(res.requests || []);
            else setError(res?.message || "Couldn't load requests.");
        } catch { /* see above */ }
        if (my === seq.current.incoming) setIncomingLoaded(true);
    }, [token]);

    const loadHistory = useCallback(async ({ more = false, silent = false } = {}) => {
        if (!token) return;
        const my = ++seq.current.history;
        if (more) setHistoryLoadingMore(true);
        else if (!silent) setHistoryLoading(true);
        try {
            const before = more ? historyRef.current[historyRef.current.length - 1]?.createdAt : undefined;
            const res = await fetchCreditHistory(token, {
                as: historyRole === "all" ? undefined : historyRole,
                before,
                limit: HISTORY_PAGE,
            });
            if (my !== seq.current.history) return;
            if (res?.success) {
                const fresh = res.events || [];
                if (more) {
                    setHistory((prev) => {
                        const ids = new Set(prev.map((e) => e.id));
                        return [...prev, ...fresh.filter((e) => !ids.has(e.id))];
                    });
                    setHistoryHasMore(!!res.hasMore);
                } else if (silent && res.hasMore && historyRef.current.length > fresh.length) {
                    // Live refresh while the person has paged deeper: swap in the
                    // newest page but keep the older pages they already loaded.
                    setHistory((prev) => {
                        const freshIds = new Set(fresh.map((e) => e.id));
                        const oldest = fresh[fresh.length - 1]?.createdAt;
                        return [...fresh, ...prev.filter((e) => !freshIds.has(e.id) && oldest && e.createdAt < oldest)];
                    });
                } else {
                    setHistory(fresh);
                    setHistoryHasMore(!!res.hasMore);
                }
            }
        } catch { /* ignore */ }
        setHistoryLoading(false);
        setHistoryLoadingMore(false);
    }, [token, historyRole]);

    const reloadAll = useCallback(() => {
        loadSellers();
        if (isSeller) loadIncoming();
        if (historyOpen) loadHistory({ silent: true });
    }, [loadSellers, loadIncoming, loadHistory, isSeller, historyOpen]);

    const reloadRef = useRef(reloadAll);
    useEffect(() => { reloadRef.current = reloadAll; }, [reloadAll]);

    // ---- initial loads --------------------------------------------------
    useEffect(() => { loadSellers(); }, [loadSellers]);
    useEffect(() => { if (isSeller) loadIncoming(); }, [isSeller, loadIncoming]);
    useEffect(() => {
        if (!historyOpen) return;
        setHistory([]);
        setHistoryHasMore(false);
        loadHistory();
    }, [historyOpen, loadHistory]);

    // ---- realtime -------------------------------------------------------
    const timerRef = useRef(null);
    useEffect(() => {
        if (!socket) return;
        const schedule = () => {
            clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => reloadRef.current(), 100);
        };
        socket.on("credit:changed", schedule);
        return () => { socket.off("credit:changed", schedule); clearTimeout(timerRef.current); };
    }, [socket]);

    const prevConnected = useRef(connected);
    useEffect(() => {
        if (connected && !prevConnected.current) reloadRef.current(); // missed events while offline
        prevConnected.current = connected;
    }, [connected]);

    useEffect(() => {
        const onVisible = () => { if (document.visibilityState === "visible") reloadRef.current(); };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, []);

    // ---- actions --------------------------------------------------------
    const run = useCallback(async (key, fn) => {
        setBusy((b) => ({ ...b, [key]: true }));
        setError(null);
        let res;
        try { res = await fn(); } catch { res = { success: false, message: "Network problem. Please try again." }; }
        if (!res?.success) setError(res?.message || "Something went wrong. Please try again.");
        setBusy((b) => { const n = { ...b }; delete n[key]; return n; });
        reloadRef.current(); // always converge on server truth
        return res;
    }, []);

    const patchIncoming = (creditId, patch) =>
        setIncoming((prev) => prev.map((r) => (r.credit.id === creditId ? { ...r, credit: { ...r.credit, ...patch } } : r)));
    const patchSellerById = (sellerId, patch) =>
        setSellers((prev) => prev.map((s) => (s.sellerId === sellerId ? { ...s, credit: { ...(s.credit || {}), ...patch } } : s)));
    const patchSellerByCredit = (creditId, patch) =>
        setSellers((prev) => prev.map((s) => (s.credit?.id === creditId ? { ...s, credit: { ...s.credit, ...patch } } : s)));

    // buyer side
    const requestFrom = useCallback((seller) => {
        patchSellerById(seller.sellerId, { status: "pending" });
        return run(`s:${seller.sellerId}`, () => requestCredit(token, { sellerUserId: seller.sellerUserId }));
    }, [run, token]);

    const askIncrease = useCallback((credit) => {
        patchSellerByCredit(credit.id, { limit_increase_request_message_id: "pending" });
        return run(`c:${credit.id}`, () => requestCreditIncrease(token, credit.id));
    }, [run, token]);

    // seller side
    const approve = useCallback((credit, limit) => {
        patchIncoming(credit.id, { status: "approved", credit_limit: limit, credit_used: 0 });
        return run(`c:${credit.id}`, () => decideCredit(token, credit.id, "approved", limit));
    }, [run, token]);

    const decline = useCallback((credit) => {
        patchIncoming(credit.id, { status: "rejected" });
        return run(`c:${credit.id}`, () => decideCredit(token, credit.id, "rejected"));
    }, [run, token]);

    const setLimit = useCallback((credit, limit) => {
        patchIncoming(credit.id, { credit_limit: limit, credit_used: 0, limit_increase_request_message_id: null });
        return run(`c:${credit.id}`, () => updateCreditLimit(token, credit.id, limit));
    }, [run, token]);

    const declineIncrease = useCallback((credit) => {
        patchIncoming(credit.id, { limit_increase_request_message_id: null });
        return run(`c:${credit.id}`, () => declineCreditIncrease(token, credit.id));
    }, [run, token]);

    const setEnabled = useCallback((credit, enabled) => {
        patchIncoming(credit.id, { status: enabled ? "approved" : "revoked" });
        return run(`c:${credit.id}`, () => toggleCredit(token, credit.buyer_id, enabled));
    }, [run, token]);

    // seller side: proactive approval of a buyer who never asked.
    // No optimistic patch — the row doesn't exist locally yet; the refetch
    // that `run` triggers brings it in.
    const searchBuyers = useCallback((q) => searchCreditBuyers(token, q), [token]);

    const grantCredit = useCallback(
        (buyerId, limit) => run(`b:${buyerId}`, () => grantCreditToBuyer(token, { buyerId, creditLimit: limit })),
        [run, token]
    );

    return {
        sellers, sellersLoaded, incoming, incomingLoaded,
        history, historyHasMore, historyLoading, historyLoadingMore,
        loadMoreHistory: () => loadHistory({ more: true }),
        busy, error, clearError: () => setError(null),
        requestFrom, askIncrease, approve, decline, setLimit, declineIncrease, setEnabled,
        searchBuyers, grantCredit,
    };
}