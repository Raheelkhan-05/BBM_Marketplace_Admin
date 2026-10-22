import { createContext, useContext } from "react";

export const GrowSellerCtx = createContext(null);

export function useGrowSeller() {
    const c = useContext(GrowSellerCtx);
    if (!c) throw new Error("useGrowSeller must be used inside <GrowSellerLayout>");
    return c;
}
