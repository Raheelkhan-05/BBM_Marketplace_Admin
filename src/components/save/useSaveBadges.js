// src/components/save/useSaveBadges.js
// Single source of truth for the buyer (Save) badge counts. Used by SaveTabs and the header cart button.
import { useMemo } from "react";
import { useNotifications } from "../../context/NotificationsContext.jsx";
import { useChatContext } from "../../context/ChatContext.jsx";
import { useCart } from "../../context/CartContext.jsx";

export default function useSaveBadges() {
    const { purchaseOrderUnreadCounts } = useNotifications();
    const { conversations } = useChatContext();
    const cartCtx = useCart();

    // CartContext exposes the item count under one of these names (it already has setCountOptimistic).
    const cart = cartCtx?.count ?? cartCtx?.cartCount ?? cartCtx?.itemCount;

    return useMemo(() => {
        // purchaseOrderUnreadCounts is a Map(orderId -> unread). Each order with unread activity counts once.
        let orders = 0;
        if (purchaseOrderUnreadCounts?.forEach) purchaseOrderUnreadCounts.forEach((v) => { if (Number(v) > 0) orders += 1; });
        const chat = (conversations || []).reduce((n, c) => n + (Number(c.unreadCount) || 0), 0);
        const cartCount = Number(cart) || 0;
        return { orders, cart: cartCount, chat, total: orders + cartCount + chat };
    }, [purchaseOrderUnreadCounts, conversations, cart]);
}