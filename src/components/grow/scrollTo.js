// Smooth in-page scroll that never touches the URL (safe for BrowserRouter and HashRouter).
export const goTo = (id) => (e) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const reduce =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
};