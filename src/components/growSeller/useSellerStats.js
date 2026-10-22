// KPI numbers for the seller home. Cached at module level so the home paints instantly on every visit.
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSocket } from "../../context/SocketContext.jsx";
import { fetchSellerOrders, fetchMySellerSubmissions } from "../../utils/api.js";
import { fetchRfqList } from "../../utils/rfqApi.js";
import { getListingExpiry } from "../../shared/listingValidity.js";

let CACHE = { token: null, v: { enq: null, ord: null, prod: null } };

export default function useSellerStats() {
    const { token } = useAuth();
    const { socket } = useSocket();
    const [v, setV] = useState(() => (CACHE.token === token ? CACHE.v : { enq: null, ord: null, prod: null }));

    const load = useCallback(async () => {
        if (!token) return;
        const [a, b, c] = await Promise.all([
            fetchRfqList(token, { scope: "all", limit: 1, offset: 0 }).catch(() => null),
            fetchSellerOrders(token, "pending_confirmation").catch(() => null),
            fetchMySellerSubmissions(token).catch(() => null),
        ]);
        setV((prev) => {
            const now = Date.now();
            const next = {
                enq: a?.success ? (a.total ?? 0) : prev.enq,
                ord: b?.success ? (b.orders || []).length : prev.ord,
                prod: c?.success
                    ? (c.items || []).filter((it) => it.is_active !== false && it.review_status === "approved" && !getListingExpiry(it, now).expired).length
                    : prev.prod,
            };
            CACHE = { token, v: next };
            return next;
        });
    }, [token]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (!socket) return undefined;
        const h = () => load();
        socket.on("orders_changed", h);
        socket.on("submissions_changed", h);
        return () => { socket.off("orders_changed", h); socket.off("submissions_changed", h); };
    }, [socket, load]);

    return v;
}