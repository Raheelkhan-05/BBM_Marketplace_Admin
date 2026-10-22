// context/OrderResumeContext.jsx
import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useSocket } from "./SocketContext.jsx";
import { useAuth } from "./AuthContext.jsx";
import {
    getAllPendingIntents, markIntentResolved, clearIntent, getPendingIntent,
} from "../utils/orderIntentStore.js";
import { fetchBuyerTransportPreference } from "../utils/api.transport.js";

const OrderResumeContext = createContext(null);

export function useOrderResume() {
    const ctx = useContext(OrderResumeContext);
    if (!ctx) throw new Error("useOrderResume must be used inside <OrderResumeProvider>");
    return ctx;
}

export function OrderResumeProvider({ children }) {
    const { socket } = useSocket();
    const { token } = useAuth();

    const [resumableIntent, setResumableIntent] = useState(null);
    const [rejectedIntent, setRejectedIntent] = useState(null);
    const [launchOfferId, setLaunchOfferId] = useState(null); // drives GlobalBuyNowLauncher

    // ---- Registry of "currently open" orders, so the resumable banner
    // never appears for an order whose modal is already on screen. Keyed
    // by proposalRouteOptionId (buynow) or `cart:${sellerId}` (cart).
    const activeKeysRef = useRef(new Set());
    const registerActive = useCallback((key) => { if (key) activeKeysRef.current.add(key); }, []);
    const unregisterActive = useCallback((key) => { if (key) activeKeysRef.current.delete(key); }, []);
    const isActive = useCallback((key) => activeKeysRef.current.has(key), []);

    useEffect(() => {
        const intents = getAllPendingIntents();
        const approved = intents.find((i) => i.status === "approved" && !activeKeysRef.current.has(i.proposalRouteOptionId));
        const rejected = intents.find((i) => i.status === "rejected" && !activeKeysRef.current.has(i.proposalRouteOptionId));
        if (approved) setResumableIntent(approved);
        if (rejected) setRejectedIntent(rejected);
    }, []);

    const reportApproved = useCallback((proposalRouteOptionId, resolved) => {
        const updated = markIntentResolved(proposalRouteOptionId, {
            status: "approved",
            resolvedRouteOptionId: resolved.routeOptionId,
            resolvedMode: resolved.mode,
            resolvedFields: resolved.fields,
        });
        if (updated && !activeKeysRef.current.has(proposalRouteOptionId)) setResumableIntent(updated);
    }, []);

    const reportRejected = useCallback((proposalRouteOptionId, reason) => {
        const updated = markIntentResolved(proposalRouteOptionId, { status: "rejected", reason });
        if (updated && !activeKeysRef.current.has(proposalRouteOptionId)) setRejectedIntent(updated);
    }, []);

    // ---- INSTANT path: react to the socket event directly instead of
    // waiting for BuyNowModal/CartPage's 30s poll. This is what actually
    // closes the "sound plays instantly but modal updates 30s later" gap.
    useEffect(() => {
        if (!socket) return;

        const onNotif = async (payload) => {
            const routeOptionId = payload?.routeOptionId; // requires backend patch — see below
            if (!routeOptionId) return; // no id to match against — falls back to each page's own poll

            const intent = getPendingIntent(routeOptionId);
            if (!intent) return; // this device didn't originate that proposal — nothing to resume

            if (payload.type === "transport_proposal_approved") {
                // Resolve the actual approved option's mode/fields right now,
                // instead of waiting for BuyNowModal's own poll to do it.
                const res = await fetchBuyerTransportPreference(intent.sellerId, intent.destState, intent.destCity, token, routeOptionId);
                if (res?.checkedProposalStatus === "approved" && res?.decided && res?.preference) {
                    reportApproved(routeOptionId, res.preference);
                }
            } else if (payload.type === "transport_proposal_rejected") {
                reportRejected(routeOptionId, payload.reason || null);
            }
        };

        socket.on("notification:new", onNotif);
        return () => socket.off("notification:new", onNotif);
    }, [socket, token, reportApproved, reportRejected]);

    const resumeNow = useCallback(() => {
        if (!resumableIntent) return;
        const intent = resumableIntent;
        setResumableIntent(null);
        if (intent.source === "cart") {
            // Cart is a real route — this one CAN navigate directly.
            clearIntent(intent.proposalRouteOptionId);
            window.location.assign("/cart"); // hard nav is fine here; CartPage reads the intent itself (see step 4)
        } else {
            // BuyNow is not route-mounted anywhere — launch it globally.
            setLaunchOfferId(intent);
        }
    }, [resumableIntent]);

    const dismissResumable = useCallback(() => {
        if (resumableIntent) clearIntent(resumableIntent.proposalRouteOptionId);
        setResumableIntent(null);
    }, [resumableIntent]);

    const acknowledgeRejection = useCallback(() => {
        if (rejectedIntent) clearIntent(rejectedIntent.proposalRouteOptionId);
        setRejectedIntent(null);
    }, [rejectedIntent]);

    const closeLaunched = useCallback(() => {
        if (launchOfferId) clearIntent(launchOfferId.proposalRouteOptionId);
        setLaunchOfferId(null);
    }, [launchOfferId]);

    const value = {
        resumableIntent, rejectedIntent, launchOfferId,
        reportApproved, reportRejected,
        resumeNow, dismissResumable, acknowledgeRejection, closeLaunched,
        registerActive, unregisterActive, isActive,
    };

    return <OrderResumeContext.Provider value={value}>{children}</OrderResumeContext.Provider>;
}