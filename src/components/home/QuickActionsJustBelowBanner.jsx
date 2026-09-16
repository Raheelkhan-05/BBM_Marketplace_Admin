import { motion } from "framer-motion";
import { Box } from "lucide-react";
import { quickActions } from "../../../data/homeData";
import {
    ArrowDown, Users, ShoppingCart, Tag, FileText, Zap,
    BadgePercent, Circle, TrendingUp, Truck, CreditCard, Plus,
    ScanLine, ClipboardList, Repeat, ShieldCheck, Lock, FileCheck, Clock
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useNavigate } from "react-router-dom";
import { fetchMyOrders, fetchSellerOrders } from "../../utils/api.js";

/* ------------------------------------------------------------------
   DESIGN NOTES — v4, mobile 3-across icon grid, desktop single-row
   ------------------------------------------------------------------
   Same MOBILE icon-on-top tile pattern as before (Paytm/GPay style),
   just switched from a 4-column grid to a 3-column grid so each row
   holds exactly the 3 actions per group — no leftover 4th slot on a
   short row.

   DESKTOP row-cards previously wrapped 3 cards into a 2-column grid
   (2 + 1, uneven last row). Now each group renders its 3 cards across
   a single horizontal row (grid-cols-3) so Purchase and Sales each
   read as one clean line instead of wrapping.

   Palette/tokens unchanged: ink #0B1116, muted #667077,
   primary #D2462B, secondary #006F83, hairline rgba(11,17,22,0.09).
   Props/data contract (`quickActions`, item shape, `onOpenRfq`)
   unchanged.
   ------------------------------------------------------------------ */

const C = {
    ink: "#0B1116",
    muted: "#667077",
    primary: "#D2462B",
    secondary: "#006F83",
    hair: "rgba(11,17,22,0.09)",
};

const ICONS = {
    "trend-down": ArrowDown, users: Users, cart: ShoppingCart,
    tag: Tag, file: FileText, bolt: Zap, badge: BadgePercent,
    circle: Circle, trend: TrendingUp, "trend-up": TrendingUp, truck: Truck, card: CreditCard,
    plus: Plus, scan: ScanLine, clipboard: ClipboardList, repeat: Repeat,
    shield: ShieldCheck, lock: Lock, invoice: FileCheck, box: Box, clock: Clock,
    "shield-check": ShieldCheck, "file-check": FileCheck, "part-scan": ScanLine,
    "gst-credit": FileCheck, "credit-line": CreditCard, samples: ShieldCheck
};

function QuickActionsJustBelowBanner({ onOpenRfq }) {
    const navigate = useNavigate();
    const { token, profile } = useAuth();

    const isLoggedIn = !!token;
    const isApprovedSeller = profile?.seller_status === "approved";

    const [purchaseOrderCount, setPurchaseOrderCount] = useState(null);
    const [salesOrderCount, setSalesOrderCount] = useState(null);

    const ACTIVE_PURCHASE_STATUSES = ["pending_confirmation", "confirmed", "processing", "shipped"];
    const ACTIVE_SALES_STATUSES = ["pending_confirmation", "confirmed", "processing", "shipped"];

    useEffect(() => {
        if (!isLoggedIn) { setPurchaseOrderCount(null); return; }
        let cancelled = false;
        fetchMyOrders(token)
            .then((res) => {
                if (cancelled || !res?.success) return;
                const count = (res.orders || []).filter((o) => ACTIVE_PURCHASE_STATUSES.includes(o.status)).length;
                setPurchaseOrderCount(count);
            })
            .catch(() => { });
        return () => { cancelled = true; };
    }, [isLoggedIn, token]);

    useEffect(() => {
        if (!isApprovedSeller) { setSalesOrderCount(null); return; }
        let cancelled = false;
        fetchSellerOrders(token)
            .then((res) => {
                if (cancelled || !res?.success) return;
                const count = (res.orders || []).filter((o) => ACTIVE_SALES_STATUSES.includes(o.status)).length;
                setSalesOrderCount(count);
            })
            .catch(() => { });
        return () => { cancelled = true; };
    }, [isApprovedSeller, token]);

    const purchaseActions = quickActions
        .filter((a) => ["explore", "purchase-order", "post-rfq"].includes(a.id))
        .map((a) =>
            a.id === "purchase-order"
                ? { ...a, count: isLoggedIn && purchaseOrderCount > 0 ? purchaseOrderCount : undefined }
                : a
        );

    const salesActions = quickActions
        .filter((a) => ["add-product", "seller-orders", "marketing"].includes(a.id))
        .map((a) =>
            a.id === "seller-orders"
                ? { ...a, count: isApprovedSeller && salesOrderCount > 0 ? salesOrderCount : undefined }
                : a
        );

    const handleActionClick = (id) => {
        switch (id) {
            case "add-product":
                return () => navigate("/seller/sell");
            case "post-rfq":
                return onOpenRfq;
            case "seller-orders":
                return () => {
                    if (!isApprovedSeller) {
                        navigate("/seller/onboarding");
                        return;
                    }
                    navigate("/seller/orders");
                };
            case "purchase-order":
                return () => {
                    if (!isLoggedIn) {
                        navigate("/login", { state: { from: "/orders" } });
                        return;
                    }
                    navigate("/orders");
                };
            case "explore":
                return () => navigate("/categories"); // ← confirm this route

            default:
                return undefined;
        }
    };

    /* ---------- MOBILE: icon-on-top tile (Paytm/GPay pattern) ---------- */
    const renderTile = (a, accent, i) => {
        const Icon = ICONS[a.icon] || Box;
        const chipBg = a.bg ?? `${accent}14`;
        const chipFg = a.fg ?? accent;

        return (
            <motion.button
                key={a.id}
                onClick={handleActionClick(a.id)}
                initial={{ opacity: 0, y: 6 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ duration: 0.35, delay: i * 0.035, ease: [0.16, 1, 0.3, 1] }}
                whileTap={{ scale: 0.95 }}
                className="flex flex-col items-center gap-1.5 outline-none"
            >
                <span
                    className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-transform duration-150 active:scale-95"
                    style={{ background: chipBg, color: chipFg }}
                >
                    <Icon className="h-6 w-6" />
                    {a.count && (
                        <span
                            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums text-white ring-2 ring-white"
                            style={{ background: accent }}
                        >
                            {a.count}
                        </span>
                    )}
                </span>
                <p
                    className="w-full text-center text-[11px] tracking-[0.0em] font-bold leading-tight"
                    style={{ color: C.ink }}
                >
                    {a.label}
                </p>
            </motion.button>
        );
    };

    /* ---------- DESKTOP: enhanced tile — same icon-first language as
       mobile, but sized and spaced for a pointer/hover context: larger
       chip, room for a one-line description, hover lift + shadow + a
       subtle accent-tinted ring instead of a flat tap target. ---------- */
    const renderDesktopTile = (a, accent, i) => {
        const Icon = ICONS[a.icon] || Box;
        const chipBg = a.bg ?? `${accent}14`;
        const chipFg = a.fg ?? accent;

        return (
            <motion.button
                key={a.id}
                onClick={handleActionClick(a.id)}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ y: -3 }}
                whileTap={{ y: 0, scale: 0.98 }}
                className="group relative flex w-[168px] shrink-0 flex-col items-center gap-2.5 rounded-2xl p-4 text-center outline-none transition-colors duration-200 hover:bg-black/[0.025] focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{ ["--tw-ring-color"]: accent }}
            >
                <span
                    className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-[1.06] group-hover:shadow-[0_8px_20px_-8px_var(--glow)]"
                    style={{ background: chipBg, color: chipFg, ["--glow"]: `${accent}55` }}
                >
                    <Icon className="h-6 w-6" />
                    {a.count && (
                        <span
                            className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums text-white ring-2 ring-white"
                            style={{ background: accent }}
                        >
                            {a.count}
                        </span>
                    )}
                </span>
                <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-bold leading-tight tracking-[0.005em]" style={{ color: C.ink }}>
                        {a.label}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] font-medium leading-tight" style={{ color: C.muted }}>
                        {a.desc}
                    </p>
                </div>
                <span
                    className="pointer-events-none absolute inset-x-5 bottom-1.5 h-[2px] scale-x-0 rounded-full transition-transform duration-200 group-hover:scale-x-100"
                    style={{ background: accent, transformOrigin: "center" }}
                />
            </motion.button>
        );
    };

    /* ---------- DESKTOP: detailed row card ---------- */
    const renderCard = (a, accent, i) => {
        const Icon = ICONS[a.icon] || Box;
        const chipBg = a.bg ?? `${accent}14`;
        const chipFg = a.fg ?? accent;

        return (
            <motion.button
                key={a.id}
                onClick={handleActionClick(a.id)}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ y: -2 }}
                whileTap={{ y: 0 }}
                className="group relative flex w-full cursor-pointer items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-[0_1px_2px_rgba(11,17,22,0.03)] outline-none transition-shadow duration-200 hover:shadow-[0_10px_24px_-10px_rgba(11,17,22,0.14)] focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{ borderColor: C.hair, ["--tw-ring-color"]: accent }}
            >
                <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105"
                    style={{ background: chipBg, color: chipFg }}
                >
                    <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold leading-tight tracking-[0.01em]" style={{ color: C.ink }}>
                        {a.label}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-medium leading-tight" style={{ color: C.muted }}>
                        {a.desc}
                    </p>
                </div>
                {a.count && (
                    <span
                        className="absolute right-2.5 top-2.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10.5px] font-bold tabular-nums text-white"
                        style={{ background: accent }}
                    >
                        {a.count}
                    </span>
                )}
                <span
                    className="pointer-events-none absolute inset-x-3 bottom-0 h-[2px] scale-x-0 rounded-full transition-transform duration-200 group-hover:scale-x-100"
                    style={{ background: accent, transformOrigin: "left" }}
                />
            </motion.button>
        );
    };

    const groupLabel = (title, count, accent, align = "justify-start") => (
        <div className={`flex items-center gap-2 ${align}`}>
            <span className="h-1 w-1 rounded-full" style={{ background: accent }} />
            <h3 className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: C.muted }}>
                {title}
            </h3>
        </div>
    );

    return (
        <div className="w-full rounded-[16px] border bg-white pb-6 pt-6 lg:pb-8 lg:pt-5" style={{ borderColor: C.hair }}>
            <h2
                className="text-center font-extrabold leading-tight tracking-[-0.01em]"
                style={{ color: C.ink, fontSize: "clamp(19px, 1.8vw, 27px)" }}
            >
                Daily business tools
            </h2>
            <p className="mx-auto mt-0.5 sm:mt-0.5 max-w-xs text-center text-[12.5px] font-medium leading-relaxed" style={{ color: C.muted }}>
                Everything you need to buy or sell, one tap away.
            </p>

            {/* ---------------- MOBILE: icon grid, 3-across ---------------- */}
            <div className="mt-4 space-y-4 px-4 lg:hidden">
                <div>
                    {groupLabel("Purchase", purchaseActions.length, C.primary, "justify-center")}
                    <div className="mt-4 grid grid-cols-3 gap-x-2 gap-y-4">
                        {purchaseActions.map((a, i) => renderTile(a, C.primary, i))}
                    </div>
                </div>
                <div className="h-px w-full hidden sm:block" style={{ background: C.hair }} />
                <div>
                    {groupLabel("Sales", salesActions.length, C.secondary, "justify-center")}
                    <div className="mt-4 grid grid-cols-3 gap-x-2 gap-y-4">
                        {salesActions.map((a, i) => renderTile(a, C.secondary, i))}
                    </div>
                </div>
            </div>

            {/* ---------------- DESKTOP: enhanced tiles, all 6 in one balanced row ---------------- */}
            <div className="mt-8 hidden w-full items-start justify-center gap-2 px-8 lg:flex xl:gap-6">
                <div className="flex flex-col items-center">
                    {groupLabel("Purchase", purchaseActions.length, C.primary, "justify-center")}
                    <div className="mt-4 flex items-start justify-center gap-1 xl:gap-3">
                        {purchaseActions.map((a, i) => renderDesktopTile(a, C.primary, i))}
                    </div>
                </div>
                <div className="mt-10 h-24 w-px self-start" style={{ background: C.hair }} />
                <div className="flex flex-col items-center">
                    {groupLabel("Sales", salesActions.length, C.secondary, "justify-center")}
                    <div className="mt-4 flex items-start justify-center gap-1 xl:gap-3">
                        {salesActions.map((a, i) => renderDesktopTile(a, C.secondary, i))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default QuickActionsJustBelowBanner;