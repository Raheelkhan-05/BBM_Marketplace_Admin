// hooks/useSellerProfileStatus.js
//
// Mirrors useChatMessages.js's pattern: fetch on mount, listen for the
// live event over the shared socket.io connection, resync on regaining
// connection after a drop, and expose a refetch() the caller can also
// trigger manually. Used by SellerOnboardingForm so a seller's open tab
// picks up an admin's approve/reject the moment it happens, instead of
// only finding out on next page load — which is what let a stale tab's
// save/submit silently revert an already-approved shop back to pending.
import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "../context/SocketContext.jsx";
import { fetchSellerOnboarding } from "../utils/api.js";

export default function useSellerProfileStatus(token) {
    const { socket, connected } = useSocket();

    const [profile, setProfile] = useState(null);
    const [business, setBusiness] = useState(null);
    const [seller, setSeller] = useState(null);
    const [photos, setPhotos] = useState([]);
    const [certifications, setCertifications] = useState([]);
    const [loading, setLoading] = useState(true);

    // Bumped on every fetch kicked off; a response only gets applied if
    // it's still the most recent request in flight — same stale-response
    // guard pattern used elsewhere in this codebase (HomeProductFeed's
    // queryTokenRef), so a slow initial load landing after a socket-
    // triggered refetch can't clobber fresher data.
    const requestTokenRef = useRef(0);

    const load = useCallback(async () => {
        if (!token) { setLoading(false); return; }
        const myToken = ++requestTokenRef.current;
        const res = await fetchSellerOnboarding(token);
        if (myToken !== requestTokenRef.current) return; // superseded by a newer call
        if (res?.success) {
            setProfile(res.profile || null);
            setBusiness(res.business || null);
            setSeller(res.seller || null);
            setPhotos(res.photos || []);
            setCertifications(res.certifications || []);
        }
        setLoading(false);
    }, [token]);

    useEffect(() => { load(); }, [load]);

    // Live update — fires the instant an admin approves/rejects this
    // seller (see notifySellerProfileChanged on the backend).
    useEffect(() => {
        if (!socket || !connected || !token) return;
        const onProfileChanged = () => load();
        socket.on("seller_profile_changed", onProfileChanged);
        return () => socket.off("seller_profile_changed", onProfileChanged);
    }, [socket, connected, token, load]);

    // Resync on regaining connection — same "closed laptop, reopened
    // later" coverage useChatMessages already has, in case the socket
    // event above was missed entirely while disconnected.
    const prevConnectedRef = useRef(connected);
    useEffect(() => {
        if (connected && !prevConnectedRef.current && token) load();
        prevConnectedRef.current = connected;
    }, [connected, token, load]);

    return { profile, business, seller, photos, certifications, loading, refetch: load };
}