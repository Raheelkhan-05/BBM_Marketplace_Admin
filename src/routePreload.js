// src/routePreload.js
//
// Every lazy-loaded page in App.jsx is registered here under the same
// import path. Calling that same import() function early — on a link
// hover/touch, or during an idle moment — warms the browser's module
// cache for that chunk. When the person actually clicks, App.jsx's
// lazy() resolves instantly from that warm cache instead of firing a
// fresh network request at the exact moment they're waiting on it. This
// is what makes route switches feel instant/native instead of "click,
// then wait for a download."

export const routeImports = {
    "/home": () => import("./pages/HomePage.jsx"),
    "/seller/listings": () => import("./pages/SellerManageListingsPage.jsx"),
    "/seller/sell": () => import("./pages/SellPublishProductPage.jsx"),
    "/chat": () => import("./pages/ChatPage.jsx"),
    "/cart": () => import("./pages/CartPage.jsx"),
    "/orders": () => import("./pages/OrdersPage.jsx"),
    "/seller/wallet": () => import("./pages/SellerWalletPage.jsx"),
};

const preloaded = new Set();

/**
 * Kicks off the dynamic import for a route ahead of navigation. Safe to
 * call many times — after the first call for a given path the module is
 * already cached or in flight, so re-hovering the same nav item repeatedly
 * is a no-op.
 */
export function preloadRoute(path) {
    if (preloaded.has(path)) return;
    const importFn = routeImports[path];
    if (!importFn) return;
    preloaded.add(path);
    importFn().catch(() => {
        // A failed prefetch (offline, a flaky connection) isn't fatal — the
        // real navigation's own lazy() call retries the fetch normally, so
        // just let this attempt go rather than treating it as permanent.
        preloaded.delete(path);
    });
}

/**
 * Prefetches a batch of routes one at a time, only when the browser
 * reports idle, spaced out so they never compete with the current page's
 * own data requests. Used for "likely next" destinations — e.g. the
 * bottom-nav tabs — so they're already warm before the person taps them.
 */
export function preloadRoutesWhenIdle(paths) {
    let i = 0;
    function next() {
        if (i >= paths.length) return;
        const path = paths[i++];
        if ("requestIdleCallback" in window) {
            window.requestIdleCallback(() => { preloadRoute(path); next(); }, { timeout: 2000 });
        } else {
            setTimeout(() => { preloadRoute(path); next(); }, 400);
        }
    }
    next();
}