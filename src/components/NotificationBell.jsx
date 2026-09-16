import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import { useNotifications } from "../context/NotificationsContext.jsx";
import SmartLink from "./SmartLink.jsx";
import NotificationIsland from "./NotificationIsland.jsx";

// Order notifications (purchase + sales) are excluded here — they live on
// the "My Orders" nav badge instead and toast from the center of the
// screen via OrderNotificationToast. See NotificationsContext for the
// link-based classification that makes this split.
export default function NotificationBell() {
  const { bellNotifications, bellUnreadCount, markRead, subscribeNonOrder } = useNotifications();
  const [open, setOpen] = useState(false);
  const bellRef = useRef(null);
  // Wraps both the bell button AND the dropdown — outside-click detection
  // below checks against this, not bellRef, so a click on the dropdown
  // itself never counts as "outside" and closes it out from under you.
  const containerRef = useRef(null);

  // Toasts still mid-flight through the island animation. Their ids stay in
  // `pendingIds` (and out of the visible badge count) until the island
  // finishes collapsing back into the bell.
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [originRect, setOriginRect] = useState(null);
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const [bumping, setBumping] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeNonOrder((payload) => {
      setPendingIds((prev) => new Set(prev).add(payload.id));
      setQueue((prev) => [...prev, payload]);
    });
    return unsubscribe;
  }, [subscribeNonOrder]);

  // Drain the queue one toast at a time so overlapping notifications don't
  // stack their animations on top of each other.
  useEffect(() => {
    if (current || queue.length === 0) return;
    const next = queue[0];
    setQueue((prev) => prev.slice(1));
    setOriginRect(bellRef.current?.getBoundingClientRect() ?? null);
    setCurrent(next);
  }, [queue, current]);

  const handleSettle = useCallback((id) => {
    setCurrent(null);
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setBumping(true);
    setTimeout(() => setBumping(false), 320);
  }, []);

  const displayUnreadCount = Math.max(0, bellUnreadCount - pendingIds.size);

  const handleClick = (n) => { if (!n.read) markRead(n.id); setOpen(false); };

  // Same pattern as Header.jsx's account dropdown (accountRef) — close on
  // a click/tap outside the bell+dropdown, or on Escape, instead of only
  // toggling via the bell button itself.
  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={bellRef}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full bg-[#FCFBF9] p-1.5 text-slate-500 transition-colors duration-150 hover:text-[#047084]"
      >
        <motion.span
          animate={bumping ? { rotate: [0, -14, 11, -6, 0] } : { rotate: 0 }}
          transition={{ duration: 0.45, ease: "easeInOut" }}
          className="block"
        >
          <Bell className="h-[18px] w-[18px]" />
        </motion.span>

        <AnimatePresence>
          {displayUnreadCount > 0 && (
            <motion.span
              key={displayUnreadCount}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: bumping ? [1.5, 1] : 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
              className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#d2462b] px-1 text-[9px] font-bold text-white ring-2 ring-white"
            >
              {displayUnreadCount > 9 ? "9+" : displayUnreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            // data-lenis-prevent hands scroll control back to this native
            // container the instant the cursor is over it, instead of the
            // page's Lenis smooth-scroll eating the wheel event — same
            // pattern used by the seller dropdown in HomeProductFeed.jsx.
            data-lenis-prevent
            className="absolute right-0 mt-2 w-72 max-h-80 overflow-y-auto rounded-xl border border-slate-100 bg-white py-1.5 shadow-xl"
          >
            {bellNotifications.length === 0 && <p className="px-4 py-6 text-center text-[12.5px] text-slate-400">No notifications yet.</p>}
            {bellNotifications.map((n) => (
              <SmartLink key={n.id} to={n.link || "#"} onClick={() => handleClick(n)}
                className={`block px-4 py-2.5 text-[12.5px] hover:bg-slate-50 ${!n.read ? "bg-[#047084]/[0.04]" : ""}`}>
                <p className="font-bold text-slate-800">{n.title}</p>
                {n.body && <p className="mt-0.5 text-slate-500">{n.body}</p>}
              </SmartLink>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <NotificationIsland notification={current} originRect={originRect} onSettle={handleSettle} />
    </div>
  );
}