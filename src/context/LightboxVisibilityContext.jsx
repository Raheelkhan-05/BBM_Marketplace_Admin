// src/context/LightboxVisibilityContext.jsx
// Provided ONCE by AppShell, so every page (Layout, Grow, Save, Sales) can open the ImageLightbox.
import { createContext, useContext } from "react";

export const LightboxVisibilityContext = createContext(null);

export function useLightboxVisibility() {
    const ctx = useContext(LightboxVisibilityContext);
    if (!ctx) throw new Error("useLightboxVisibility must be used inside <AppShell>");
    return ctx;
}