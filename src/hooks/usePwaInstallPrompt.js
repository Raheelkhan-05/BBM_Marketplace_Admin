import { useEffect, useRef, useState } from "react";

const DISMISS_KEY = "pwa_install_dismissed_at";
const DISMISS_COOLDOWN_DAYS = 1;
const DELAY_MS = 60 * 1000;

function isStandalone() {
    return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function isIos() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function usePwaInstallPrompt() {
    const [show, setShow] = useState(false);
    const [platform, setPlatform] = useState(null);
    const deferredPrompt = useRef(null);

    useEffect(() => {
        if (isStandalone()) return;
        const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
        const cooldownMs = DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
        if (dismissedAt && Date.now() - dismissedAt < cooldownMs) return;

        function onBeforeInstallPrompt(e) {
            e.preventDefault();
            deferredPrompt.current = e;
            setPlatform("android");
        }
        window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
        if (isIos()) setPlatform("ios");

        const timeoutId = setTimeout(() => setShow(true), DELAY_MS);
        return () => {
            window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
            clearTimeout(timeoutId);
        };
    }, []);

    async function promptInstall() {
        if (platform === "android" && deferredPrompt.current) {
            deferredPrompt.current.prompt();
            const { outcome } = await deferredPrompt.current.userChoice;
            deferredPrompt.current = null;
            setShow(false);
            if (outcome === "accepted") localStorage.removeItem(DISMISS_KEY);
            else localStorage.setItem(DISMISS_KEY, String(Date.now()));
        }
    }

    function dismiss() {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
        setShow(false);
    }

    return { show: show && platform, platform, promptInstall, dismiss };
}