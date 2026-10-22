// src/components/growSeller/useGrowBadges.js
// Single source of truth for Grow badge counts. Used by the Grow FAB (BottomNavStrip)
// and by GrowTabs, so the two can never disagree.
import { useMemo } from "react";
import { useNotifications } from "../../context/NotificationsContext.jsx";
import { useListings } from "../../context/ListingsContext.jsx";
import { useChatContext } from "../../context/ChatContext.jsx";
import { useTransportLibrary } from "../../context/TransportLibraryContext.jsx";

export default function useGrowBadges() {
    const { salesUnreadCount } = useNotifications();
    const { totalBadgeCount } = useListings();
    const { conversations } = useChatContext();
    const transport = useTransportLibrary();

    const pending = transport?.pendingProposalsCount;

    return useMemo(() => {
        const orders = Number(salesUnreadCount) || 0;
        const products = Number(totalBadgeCount) || 0;
        const chat = (conversations || []).reduce((n, c) => n + (Number(c.unreadCount) || 0), 0);
        const transportCount = Number(pending) || 0;
        return {
            orders,
            products,
            chat,
            transport: transportCount,
            total: orders + products + chat + transportCount,
        };
    }, [salesUnreadCount, totalBadgeCount, conversations, pending]);
}