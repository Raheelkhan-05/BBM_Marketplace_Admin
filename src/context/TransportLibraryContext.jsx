// context/TransportLibraryContext.jsx
//
// Tracks the seller's count of PENDING transport proposals — i.e. buyer
// proposals awaiting approve/reject — so the "Transport Library" nav item
// can show a live badge the same way My Orders / My Products do.
//
// This is deliberately NOT wired through NotificationsContext's read/unread
// system: the badge here means "records needing action", not "notification
// you haven't opened yet". A seller can have opened the bell and seen the
// "new proposal" toast and still have that proposal sitting unresolved —
// the badge must keep showing it until they actually approve/reject, not
// just until they've seen it. So this holds its own count, seeded from the
// real list of pending proposals, bumped optimistically the moment a new
// proposal notification arrives over the socket, and decremented the
// instant the seller resolves one.
import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { useSocket } from "./SocketContext.jsx";
import { fetchPendingProposals } from "../utils/api.transport.js";

const TransportLibraryContext = createContext(null);

export function useTransportLibrary() {
    const ctx = useContext(TransportLibraryContext);
    if (!ctx) throw new Error("useTransportLibrary must be used inside <TransportLibraryProvider>");
    return ctx;
}

export function TransportLibraryProvider({ children }) {
    const { token, profile } = useAuth();
    const isApprovedSeller = profile?.seller_status === "approved";
    const { socket } = useSocket();
    const [pendingCount, setPendingCount] = useState(0);

    const refresh = useCallback(async () => {
        if (!token || !isApprovedSeller) { setPendingCount(0); return; }
        const res = await fetchPendingProposals(token);
        setPendingCount(res?.proposals?.length || 0);
    }, [token, isApprovedSeller]);

    useEffect(() => { refresh(); }, [refresh]);

    // A new proposal notifies the seller with type "transport_proposal_received"
    // (see transportLibrary.controller.js's notifyUser calls). Bump the
    // count the moment it lands instead of waiting for the seller to open
    // the Manage tab, so this badge stays "live" like the other nav badges.
    useEffect(() => {
        if (!socket || !isApprovedSeller) return;
        const onNotif = (payload) => {
            if (payload?.type === "transport_proposal_received") {
                setPendingCount((prev) => prev + 1);
            }
        };
        socket.on("notification:new", onNotif);
        return () => socket.off("notification:new", onNotif);
    }, [socket, isApprovedSeller]);

    // Called by the Manage tab the instant a proposal is approved/rejected
    // — decrements immediately so the badge updates in the same tick as
    // the button press, instead of waiting on a refetch.
    const markProposalResolved = useCallback(() => {
        setPendingCount((prev) => Math.max(0, prev - 1));
    }, []);

    // Called by the Manage tab whenever it loads its own proposal list —
    // resyncs the badge to the authoritative server count, self-healing
    // any drift from the optimistic socket increment / resolve decrement
    // above (e.g. a proposal that got auto-cancelled, or a missed socket
    // event after a reconnect).
    const syncPendingCount = useCallback((count) => {
        setPendingCount(Math.max(0, count));
    }, []);

    const value = {
        pendingProposalsCount: pendingCount,
        refreshPendingProposals: refresh,
        markProposalResolved,
        syncPendingCount,
    };

    return <TransportLibraryContext.Provider value={value}>{children}</TransportLibraryContext.Provider>;
}