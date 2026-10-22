import { useEffect, useState } from "react";

const DISMISS_KEY = "pwa_install_dismissed_at";

// Flip both to false before shipping
const TEST_MODE = false;
const DEBUG_LOGS = false;

const DELAY_MS = TEST_MODE ? 10 * 1000 : 10 * 1000;                      // time before prompt appears
const DISMISS_COOLDOWN_MS = TEST_MODE ? 10 * 1000 : 24 * 60 * 60 * 1000; // 1 min (test) / 1 day (prod)

/* ------------------------------------------------------------------
 * Logging helper: every line shows seconds since page load, so you can
 * see exactly when each thing happened.
 * ------------------------------------------------------------------ */
const sinceLoad = () => (performance.now() / 1000).toFixed(2);
const log = (...args) => {
    if (DEBUG_LOGS) console.log(`[PWA +${sinceLoad()}s]`, ...args);
};

/* ------------------------------------------------------------------
 * Capture `beforeinstallprompt` at module load, NOT inside a component.
 * The event can fire before DeferredMount mounts the prompt component,
 * and it only fires once per page load, so a late listener misses it.
 * ------------------------------------------------------------------ */
let deferredPromptEvent = null;
const subscribers = new Set();
const notify = () => subscribers.forEach((fn) => fn());

if (typeof window !== "undefined") {
    log("hook module loaded, listening for beforeinstallprompt");

    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        deferredPromptEvent = e;
        log("beforeinstallprompt FIRED (install event captured)");
        notify();
    });
    window.addEventListener("appinstalled", () => {
        deferredPromptEvent = null;
        log("appinstalled fired");
        notify();
    });
}

function isStandalone() {
    return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function isIos() {
    return (
        /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
        // iPadOS 13+ reports a Mac user agent
        (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1)
    );
}

export function usePwaInstallPrompt() {
    const [show, setShow] = useState(false);
    const [platform, setPlatform] = useState(null);

    useEffect(() => {
        log("hook mounted (DeferredMount released it)");

        if (isStandalone()) {
            log("SKIPPED: app is already running as an installed PWA");
            return;
        }

        const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
        if (dismissedAt) {
            const elapsed = Date.now() - dismissedAt;
            if (elapsed < DISMISS_COOLDOWN_MS) {
                log(
                    `SKIPPED: dismissed ${(elapsed / 1000).toFixed(1)}s ago, ` +
                    `cooldown ends in ${((DISMISS_COOLDOWN_MS - elapsed) / 1000).toFixed(1)}s ` +
                    `(reload after that)`
                );
                return;
            }
            log("previous dismissal found but cooldown has passed");
        }

        if (isIos()) {
            setPlatform("ios");
            log("platform detected: ios");
        }

        // Pick up an event that already fired, and any that arrives later
        const sync = () => {
            if (deferredPromptEvent) {
                setPlatform("android");
                log("platform detected: android (install event available)");
            } else {
                setPlatform((p) => (p === "android" ? null : p)); // app got installed
            }
        };
        sync();
        subscribers.add(sync);

        // ---- countdown logging ----
        const mountedAt = Date.now();
        log(`countdown started: prompt will show in ${DELAY_MS / 1000}s`);

        const tickId = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((DELAY_MS - (Date.now() - mountedAt)) / 1000));
            if (remaining > 0) log(`prompt shows in ${remaining}s`);
        }, 1000);

        const timeoutId = setTimeout(() => {
            clearInterval(tickId);
            log(`countdown finished after ${((Date.now() - mountedAt) / 1000).toFixed(2)}s, setShow(true)`);
            setShow(true);
        }, DELAY_MS);

        return () => {
            subscribers.delete(sync);
            clearInterval(tickId);
            clearTimeout(timeoutId);
            log("hook unmounted, timers cleared");
        };
    }, []);

    // Log whether the prompt is actually visible and why not
    useEffect(() => {
        if (!show) return;
        if (platform) {
            log(`PROMPT VISIBLE (platform: ${platform})`);
        } else {
            log("countdown finished but NOT shown: no platform detected (no beforeinstallprompt, not iOS)");
        }
    }, [show, platform]);

    async function promptInstall() {
        if (platform === "android" && deferredPromptEvent) {
            const evt = deferredPromptEvent;
            log("Install clicked, opening native install dialog");
            const t0 = performance.now();
            evt.prompt();
            const { outcome } = await evt.userChoice;
            log(`install dialog closed after ${((performance.now() - t0) / 1000).toFixed(2)}s, outcome: ${outcome}`);
            deferredPromptEvent = null;
            setShow(false);
            if (outcome === "accepted") localStorage.removeItem(DISMISS_KEY);
            else localStorage.setItem(DISMISS_KEY, String(Date.now()));
        } else {
            log("Install clicked but no install event available");
        }
    }

    function dismiss() {
        log(`dismissed by user, cooldown of ${DISMISS_COOLDOWN_MS / 1000}s starts now`);
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
        setShow(false);
    }

    return { show: show && platform, platform, promptInstall, dismiss };
}