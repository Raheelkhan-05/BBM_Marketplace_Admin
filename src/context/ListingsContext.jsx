// context/ListingsContext.jsx
//
// "My Products" nav badge = four independent sources, each cleared by a
// DIFFERENT rule — this is why they can't share one simple "unread count":
//   - listing approvals/rejections: cleared by VIEWING (SellerManageListingsPage mount)
//   - restock-needed items:        cleared by the ITEM'S OWN STATE changing
//                                   (deactivated or stock topped back up) —
//                                   never by merely looking at it
//   - wallet top-up success:       cleared by opening the Wallet page
//   - wallet low balance:          cleared ONLY when the wallet itself is
//                                   no longer blocked — persists through
//                                   any number of page visits until then
import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { useSocket } from "./SocketContext.jsx";
import { useNotifications } from "./NotificationsContext.jsx";
import { fetchMySellerSubmissions } from "../utils/api.js";
import { fetchWalletStatus } from "../utils/walletApi.js";
import {
    isSalesOrderNotification, isWalletTopupNotification,
    isWalletLowBalanceNotification, isListingsSectionNotification,
} from "../utils/notificationTypes.js";
import { needsRestock } from "../components/growSeller/sellerHelpers.js";


const ListingsContext = createContext(null);

export function useListings() {
    const ctx = useContext(ListingsContext);
    if (!ctx) throw new Error("useListings must be used inside <ListingsProvider>");
    return ctx;
}

export function ListingsProvider({ children }) {
    const { token, profile } = useAuth();
    const { socket } = useSocket();
    const {
        listingApprovalUnreadCount, listingRejectionUnreadCount,
        walletTopupUnreadCount, markListingsViewed, markWalletTopupViewed,
    } = useNotifications();

    const isApprovedSeller = profile?.seller_status === "approved";

    const [restockCount, setRestockCount] = useState(0);
    const [wallet, setWallet] = useState(null);

    // Own background fetch, same pattern as CartContext — keeps the
    // header badge correct even if SellerManageListingsPage was never
    // opened this session. If that page IS mounted, it reports live
    // numbers via reportRestockCount/reportWallet below instead, so this
    // fetch is only ever the fallback source of truth.
    const reload = useCallback(async () => {
        if (!token || !isApprovedSeller) { setRestockCount(0); setWallet(null); return; }
        const [subsRes, walletRes] = await Promise.all([
            fetchMySellerSubmissions(token),
            fetchWalletStatus(token),
        ]);
        if (subsRes?.success) {
            setRestockCount((subsRes.items || []).filter(needsRestock).length);
        }
        if (walletRes?.success) setWallet(walletRes.wallet);
    }, [token, isApprovedSeller]);

    useEffect(() => { reload(); }, [reload]);

    // Live-updates the moment the page itself has fresher data — avoids
    // this context's own fetch racing/disagreeing with what's on screen.
    const reportRestockCount = useCallback((count) => setRestockCount(count), []);
    const reportWallet = useCallback((w) => setWallet(w), []);

    // Socket events that mean "submissions / wallet changed".
    // ASSUMPTION: "wallet_changed" is emitted by the backend. If your event has a
    // different name, rename it here. The notification listener below is the fallback.
    useEffect(() => {
        if (!socket) return;
        const onChanged = () => reload();
        socket.on("submissions_changed", onChanged);
        socket.on("wallet_changed", onChanged);
        return () => { socket.off("submissions_changed", onChanged); socket.off("wallet_changed", onChanged); };
    }, [socket, reload]);

    // Fallback: refetch when a relevant notification arrives. An order can lower
    // stock (restock count) and a wallet deduction can block the wallet, and neither
    // is guaranteed to emit the events above. Debounced so a burst causes one refetch.
    useEffect(() => {
        if (!socket) return;
        let t;
        const onNotif = (p) => {
            if (!p?.id) return;
            const relevant =
                isSalesOrderNotification(p) || isWalletTopupNotification(p) ||
                isWalletLowBalanceNotification(p) || isListingsSectionNotification(p);
            if (!relevant) return;
            clearTimeout(t);
            t = setTimeout(reload, 400);
        };
        socket.on("notification:new", onNotif);
        return () => { clearTimeout(t); socket.off("notification:new", onNotif); };
    }, [socket, reload]);

    const walletLowBalance = !!wallet?.is_blocked;

    const totalBadgeCount =
        listingApprovalUnreadCount + listingRejectionUnreadCount +
        walletTopupUnreadCount + (walletLowBalance ? 1 : 0) +
        restockCount;

    const value = {
        restockCount, wallet, walletLowBalance, totalBadgeCount,
        reportRestockCount, reportWallet, reloadWallet: reload,
        markListingsViewed, markWalletTopupViewed,
    };

    return <ListingsContext.Provider value={value}>{children}</ListingsContext.Provider>;
}