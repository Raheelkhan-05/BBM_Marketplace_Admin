import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../utils/supabaseClient.js";
import { fetchMe } from "../utils/api.js";

const AuthContext = createContext(null);
const DEV_TOKEN_KEY = "bbm_dev_bypass_token";
const AUTH_TOKEN_KEY = "bbm_auth_token";

// REMOVED (this pass): the EVENTS list + channelRef/listenersRef/
// openChannel/scheduleResubscribe/subscribeUserEvent machinery that used
// to live here. It opened a Supabase Realtime broadcast channel
// (`supabase.channel(\`user-${chanToken}\`)`) — but nothing in this app's
// backend has ever published to Supabase Realtime. Every real-time push
// (notifications, submissions_changed, orders_changed) goes out through
// this app's own Socket.IO server instead (see services/realtimeBroadcast.js
// -> getIO().to(`user:${userId}`).emit(...), and socket/chatSocket.js,
// which is what actually joins `user:${userId}` on connect).
//
// That mismatch meant every consumer of subscribeUserEvent
// (useRealtimeOrder.js, useRealtimeOrders.js, and
// SellerManageListingsPage's "submissions_changed" listener) was
// subscribed to a channel nothing could ever reach — updates only ever
// appeared after a manual refresh or after the tab-visibility resync
// safety net below happened to fire.
//
// The fix is NOT here: real-time order/listing updates now go through
// useSocket() (context/SocketContext.jsx) directly, the same connection
// useRealtimeNotifications.js already used successfully. If you have any
// other call site still destructuring `subscribeUserEvent` from
// useAuth(), migrate it to `useSocket()` the same way.
//
// KEPT: registerResyncHandler/runResync. That part was never broken —
// it's a plain in-memory callback registry (no channel involved) used as
// a safety net for "the tab regained focus/visibility, re-fetch in case
// something was missed while it was backgrounded." Multiple pages
// (SellerManageListingsPage, and now the order hooks) still rely on it.

// Reads whichever session token is in localStorage, synchronously, with
// no async work at all. Used as AuthProvider's INITIAL state (see
// useState below) — not inside an effect — so "is this person logged
// in" is known the instant this component first renders, before the
// browser has even painted anything. This is what removes the
// spinner-while-we-check-auth gap: there's nothing to wait for, because
// a value already sitting in localStorage doesn't need a network round
// trip to read.
function readStoredSession() {
  if (typeof window === "undefined") return null;
  const authToken = localStorage.getItem(AUTH_TOKEN_KEY);
  if (authToken) return { access_token: authToken };
  const devToken = localStorage.getItem(DEV_TOKEN_KEY);
  if (devToken) return { access_token: devToken, dev_bypass: true };
  return null;
}

export function AuthProvider({ children }) {
  // Lazy initializer — runs once, synchronously, on first render.
  const [session, setSession] = useState(readStoredSession);
  const [profile, setProfile] = useState(null);

  // Renamed in spirit (kept as `initializing` for anything already
  // reading it) — this now ONLY tracks whether the PROFILE fetch for an
  // already-known session is still in flight. It never gates whether we
  // know if someone is logged in, since that's resolved synchronously
  // above. A guest (no stored token) starts with this already false —
  // there is nothing to wait for.
  const [profileLoading, setProfileLoading] = useState(!!session);

  // Consumers can register a "catch up" refetch that runs whenever the
  // tab regains focus/visibility, or comes back online. Real-time pushes
  // over a websocket are fire-and-forget: they WILL occasionally be
  // missed (backgrounded tab, laptop sleep, brief network loss). This is
  // the safety net that guarantees the UI is never more than a
  // reconnect/focus away from correct — independent of whichever
  // transport a given page's live updates use.
  const resyncRef = useRef(new Set());

  const registerResyncHandler = useCallback((callback) => {
    resyncRef.current.add(callback);
    return () => resyncRef.current.delete(callback);
  }, []);

  const runResync = useCallback(() => {
    resyncRef.current.forEach((cb) => {
      try { cb(); } catch (e) { console.error("[AuthContext] resync handler threw:", e); }
    });
  }, []);

  // Treat "tab became visible/focused again" (or came back online) as a
  // reconnect signal for anything registered via registerResyncHandler.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") runResync();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [runResync]);

  const loadProfile = useCallback(async (token) => {
    if (!token) {
      setProfile(null);
      return;
    }
    try {
      const res = await fetchMe(token);
      if (res?.success) {
        setProfile({
          ...res.profile,
          seller_status: res.seller_status,
          businessProfile: res.businessProfile,
          shop_slug: res.businessProfile?.shop_slug ?? res.shop_slug ?? null,
          notificationChannel: res.notificationChannel,
        });
        return;
      }
      if (res?.status === 401) {
        await clearSession();
      } else {
        setProfile(null);
      }
    } catch {
      setProfile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearSession = useCallback(async () => {
    localStorage.removeItem(DEV_TOKEN_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setSession(null);
    setProfile(null);
    await supabase.auth.signOut().catch(() => { });
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem(DEV_TOKEN_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const setDevSession = useCallback((token) => {
    localStorage.setItem(DEV_TOKEN_KEY, token);
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    setSession({ access_token: token, dev_bypass: true });
    return loadProfile(token);
  }, [loadProfile]);

  // Call this after OTP verify / onboarding. Stores the JWT in real-session
  // storage (not the dev-bypass key) so isLoggedIn flips true and protected
  // routes (like /home) unblock immediately.
  const setAuthSession = useCallback((token) => {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    setSession({ access_token: token });
    return loadProfile(token);
  }, [loadProfile]);

  useEffect(() => {
    let mounted = true;

    // The token (if any) was already read synchronously into `session`
    // by readStoredSession() above, before this component's first
    // render — so there's no "figuring out if you're logged in" step
    // left here. The only genuinely async part is fetching the PROFILE
    // for an existing session, which route guards no longer block on.
    async function init() {
      if (session?.access_token) {
        await loadProfile(session.access_token);
      }
      if (mounted) setProfileLoading(false);
    }
    init();

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "INITIAL_SESSION") return;
      if (newSession?.access_token) {
        localStorage.setItem(AUTH_TOKEN_KEY, newSession.access_token);
        setSession(newSession);
        loadProfile(newSession.access_token);
      } else if (
        !localStorage.getItem(DEV_TOKEN_KEY) &&
        !localStorage.getItem(AUTH_TOKEN_KEY)
      ) {
        setSession(null);
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLoggedIn = !!session?.access_token;

  return (
    <AuthContext.Provider
      value={{
        session,
        token: session?.access_token,
        profile,
        // Kept under the same name so nothing else calling useAuth()
        // needs to change — but it now only reflects "is the profile
        // for an already-known session still loading", never "do we
        // know yet whether this person is logged in at all".
        initializing: profileLoading,
        isLoggedIn,
        signOut,
        clearSession,
        setDevSession,
        setAuthSession,
        registerResyncHandler,
        refreshProfile: () => loadProfile(session?.access_token),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}