// context/CartContext.jsx
//
// Single source of truth for the cart item count, shared by Header (desktop
// nav) and BottomNavStrip (mobile nav) — so the "Cart" badge stays in sync
// without either of them independently re-fetching the cart. CartPage still
// owns the full cart item list/mutations itself (via cartApi.js); this
// context only tracks the count for badge display, and CartPage calls
// `reload()` after any mutation so the badge reflects it immediately.
import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { fetchCart } from "../utils/cartApi.js";

const CartContext = createContext(null);

export function useCart() {
    const ctx = useContext(CartContext);
    if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
    return ctx;
}

export function CartProvider({ children }) {
    const { token } = useAuth();
    const [cartCount, setCartCount] = useState(0);

    const reload = useCallback(async () => {
        if (!token) { setCartCount(0); return; }
        const res = await fetchCart(token);
        if (res?.success) setCartCount((res.items || []).length);
    }, [token]);

    useEffect(() => { reload(); }, [reload]);

    // Lets CartPage update the badge instantly on add/remove without
    // waiting on a round trip — same optimistic pattern it already uses
    // for its own item list.
    const setCountOptimistic = useCallback((count) => setCartCount(count), []);

    return (
        <CartContext.Provider value={{ cartCount, reload, setCountOptimistic }}>
            {children}
        </CartContext.Provider>
    );
}