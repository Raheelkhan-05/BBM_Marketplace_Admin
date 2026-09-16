import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
    ShieldCheck,
    ListChecks,
    BookOpen,
    Users,
    IndianRupee,
    Skull,
    Boxes,
    Lightbulb,
    LogOut,
    User,
    ChevronLeft,
    ChevronRight,
    Menu,
    X,
} from "lucide-react";

import { useAuth } from "../context/AuthContext.jsx";
import NotificationBell from "./NotificationBell.jsx";

export const ADMIN_NAV_ITEMS = [
    {
        id: "sellers",
        label: "Seller Applications",
        icon: ShieldCheck,
        to: "/sellers",
    },
    {
        id: "catalog",
        label: "Catalog",
        icon: BookOpen,
        to: "/catalog",
    },
    {
        id: "admins",
        label: "Manage Admins",
        icon: Users,
        to: "/admins",
    },
    {
        id: "listings",
        label: "Product Review",
        icon: ListChecks,
        to: "/listings",
    },
    {
        id: "support",
        label: "Support",
        icon: Lightbulb,
        to: "/support",
    },
    {
        id: "payments",
        label: "Payments",
        icon: IndianRupee,
        to: "/payments",
    },
    {
        id: "database",
        label: "Database",
        icon: Skull,
        to: "/database",
    },
    {
        id: "commissions",
        label: "Commissions",
        icon: Boxes,
        to: "/product-commisions",
    },
];

const NAV_ITEM_CLASS =
    "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-colors duration-150";

function AdminScrollableNav({ pathname, navigate }) {
    const scrollRef = useRef(null);

    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const updateScrollState = useCallback(() => {
        const el = scrollRef.current;

        if (!el) return;

        const maxScrollLeft =
            el.scrollWidth - el.clientWidth;

        setCanScrollLeft(el.scrollLeft > 4);
        setCanScrollRight(
            el.scrollLeft < maxScrollLeft - 4
        );
    }, []);

    useEffect(() => {
        const el = scrollRef.current;

        if (!el) return;

        updateScrollState();

        el.addEventListener(
            "scroll",
            updateScrollState,
            { passive: true }
        );

        const resizeObserver = new ResizeObserver(
            updateScrollState
        );

        resizeObserver.observe(el);

        return () => {
            el.removeEventListener(
                "scroll",
                updateScrollState
            );

            resizeObserver.disconnect();
        };
    }, [updateScrollState]);

    /*
     * Whenever the active route changes, make sure the
     * active navigation item is visible.
     */
    useEffect(() => {
        const el = scrollRef.current;

        if (!el) return;

        const activeButton =
            el.querySelector(
                '[data-admin-nav-active="true"]'
            );

        if (!activeButton) return;

        activeButton.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "nearest",
        });

        requestAnimationFrame(updateScrollState);
    }, [pathname, updateScrollState]);

    const scrollByAmount = (direction) => {
        const el = scrollRef.current;

        if (!el) return;

        const amount =
            Math.max(180, el.clientWidth * 0.55);

        el.scrollBy({
            left:
                direction === "left"
                    ? -amount
                    : amount,
            behavior: "smooth",
        });
    };

    return (
        <div className="absolute left-1/2 hidden w-[min(52vw,760px)] -translate-x-1/2 md:block lg:w-[min(55vw,820px)]">
            <div className="relative flex items-center">
                {/* LEFT ARROW */}

                {canScrollLeft && (
                    <button
                        type="button"
                        aria-label="Scroll admin navigation left"
                        onClick={() => scrollByAmount("left")}
                        className="absolute -left-1 z-30 flex h-8 w-8 items-center justify-center text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-[#0B7285]"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                )}

                {/* LEFT FADE */}

                {canScrollLeft && (
                    <div className="pointer-events-none absolute -left-1 top-0 z-20 h-full w-12 bg-gradient-to-r from-white via-white/90 to-transparent" />
                )}

                {/* SCROLL AREA */}

                <nav
                    ref={scrollRef}
                    aria-label="Admin navigation"
                    className="flex w-full min-w-0 items-center justify-start gap-1 overflow-x-auto py-1.5 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                    {ADMIN_NAV_ITEMS.map((item) => {
                        const Icon = item.icon;

                        const active =
                            pathname === item.to ||
                            pathname.startsWith(`${item.to}/`);

                        return (
                            <button
                                key={item.id}
                                type="button"
                                data-admin-nav-active={active}
                                onClick={() => navigate(item.to)}
                                className={`${NAV_ITEM_CLASS} ${active
                                    ? "text-white"
                                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                    }`}
                                style={{
                                    background: active
                                        ? "#0B7285"
                                        : undefined,
                                }}
                            >
                                <Icon
                                    className="h-3.5 w-3.5 shrink-0"
                                    style={{
                                        color: active
                                            ? "#fff"
                                            : "#5B6672",
                                    }}
                                />

                                <span>{item.label}</span>
                            </button>
                        );
                    })}
                </nav>

                {/* RIGHT FADE */}

                {canScrollRight && (
                    <div className="pointer-events-none absolute right-0 top-0 z-20 h-full w-12 bg-gradient-to-l from-white via-white/90 to-transparent" />
                )}

                {/* RIGHT ARROW */}

                {canScrollRight && (
                    <button
                        type="button"
                        aria-label="Scroll admin navigation right"
                        onClick={() => scrollByAmount("right")}
                        className="absolute -right-3 z-30 flex h-8 w-8 items-center justify-center text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-[#0B7285]"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                )}
            </div>
        </div>
    );
}

export default function AdminHeader() {
    const { profile, signOut } = useAuth();

    const navigate = useNavigate();
    const { pathname } = useLocation();

    const [menuOpen, setMenuOpen] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    const menuRef = useRef(null);

    /*
     * Close account dropdown when clicking outside.
     */
    useEffect(() => {
        if (!menuOpen) return;

        const handleClick = (event) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(event.target)
            ) {
                setMenuOpen(false);
            }
        };

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                setMenuOpen(false);
            }
        };

        document.addEventListener(
            "mousedown",
            handleClick
        );

        document.addEventListener(
            "keydown",
            handleKeyDown
        );

        return () => {
            document.removeEventListener(
                "mousedown",
                handleClick
            );

            document.removeEventListener(
                "keydown",
                handleKeyDown
            );
        };
    }, [menuOpen]);

    /*
     * Close mobile menu when route changes.
     */
    useEffect(() => {
        setMobileOpen(false);
        setMenuOpen(false);
    }, [pathname]);

    /*
     * Lock page scrolling while mobile menu is open.
     */
    useEffect(() => {
        if (!mobileOpen) return;

        const previousOverflow =
            document.body.style.overflow;

        document.body.style.overflow = "hidden";

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                setMobileOpen(false);
            }
        };

        document.addEventListener(
            "keydown",
            handleKeyDown
        );

        return () => {
            document.body.style.overflow =
                previousOverflow;

            document.removeEventListener(
                "keydown",
                handleKeyDown
            );
        };
    }, [mobileOpen]);

    const handleNavigate = (to) => {
        setMobileOpen(false);
        setMenuOpen(false);
        navigate(to);
    };

    const handleSignOut = () => {
        setMenuOpen(false);
        setMobileOpen(false);
        signOut();
    };

    const firstName =
        profile?.name?.trim()?.split(/\s+/)?.[0] ||
        "Admin";

    return (
        <>
            <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 shadow-[0_1px_0_rgba(20,27,34,0.04)] backdrop-blur-md">
                <div className="relative mx-auto flex h-14 max-w-7xl items-center justify-between px-4 lg:px-8">
                    {/* LOGO */}

                    <div className="z-20 flex shrink-0 items-center">
                        <button
                            type="button"
                            onClick={() => handleNavigate("/")}
                            className="flex items-center gap-2"
                            aria-label="BBM Admin home"
                        >
                            <img
                                src="/Logo.png"
                                alt="BBM"
                                className="h-6 w-auto"
                            />

                            <span className="whitespace-nowrap text-[15px] font-extrabold text-slate-900">
                                BBM Admin
                            </span>
                        </button>
                    </div>

                    {/* DESKTOP SCROLLABLE NAV */}

                    <AdminScrollableNav
                        pathname={pathname}
                        navigate={navigate}
                    />

                    {/* RIGHT SIDE */}

                    <div
                        ref={menuRef}
                        className="z-20 flex shrink-0 items-center gap-2"
                    >
                        <NotificationBell />

                        {/* ACCOUNT */}

                        <div className="relative hidden md:block">
                            <button
                                type="button"
                                onClick={() =>
                                    setMenuOpen((value) => !value)
                                }
                                aria-expanded={menuOpen}
                                aria-haspopup="menu"
                                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-slate-700 transition hover:border-[#7fb3bd] hover:text-[#0B7285]"
                            >
                                <User className="h-3.5 w-3.5" />

                                <span className="max-w-[90px] truncate">
                                    {firstName}
                                </span>
                            </button>

                            {menuOpen && (
                                <div
                                    role="menu"
                                    className="absolute right-0 mt-2 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
                                >
                                    <button
                                        type="button"
                                        onClick={handleSignOut}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-semibold text-rose-600 hover:bg-slate-50"
                                    >
                                        <LogOut className="h-3.5 w-3.5" />

                                        Sign out
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* MOBILE MENU BUTTON */}

                        <button
                            type="button"
                            onClick={() =>
                                setMobileOpen((value) => !value)
                            }
                            aria-label={
                                mobileOpen
                                    ? "Close admin menu"
                                    : "Open admin menu"
                            }
                            aria-expanded={mobileOpen}
                            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 transition hover:border-[#7fb3bd] hover:text-[#0B7285] md:hidden"
                        >
                            {mobileOpen ? (
                                <X className="h-[18px] w-[18px]" />
                            ) : (
                                <Menu className="h-[18px] w-[18px]" />
                            )}
                        </button>
                    </div>
                </div>
            </header>

            {/* MOBILE ADMIN NAV */}

            {mobileOpen && (
                <>
                    <button
                        type="button"
                        aria-label="Close menu"
                        onClick={() => setMobileOpen(false)}
                        className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm md:hidden"
                    />

                    <div className="fixed left-0 right-0 top-14 z-50 max-h-[calc(100dvh-56px)] overflow-y-auto border-b border-slate-200 bg-white shadow-xl md:hidden">
                        <nav className="mx-auto flex max-w-7xl flex-col gap-1 p-3">
                            {ADMIN_NAV_ITEMS.map((item) => {
                                const Icon = item.icon;

                                const active =
                                    pathname === item.to ||
                                    pathname.startsWith(
                                        `${item.to}/`
                                    );

                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() =>
                                            handleNavigate(item.to)
                                        }
                                        className={[
                                            "flex min-h-[46px] items-center gap-3 rounded-lg px-3",
                                            "text-sm font-semibold transition-colors",
                                            active
                                                ? "bg-[#0B7285] text-white"
                                                : "text-slate-700 hover:bg-slate-50",
                                        ].join(" ")}
                                    >
                                        <Icon
                                            className="h-4 w-4 shrink-0"
                                            style={{
                                                color: active
                                                    ? "#fff"
                                                    : "#64748B",
                                            }}
                                        />

                                        {item.label}
                                    </button>
                                );
                            })}

                            <div className="my-1 border-t border-slate-100" />

                            <button
                                type="button"
                                onClick={handleSignOut}
                                className="flex min-h-[46px] items-center gap-3 rounded-lg px-3 text-sm font-semibold text-rose-600 hover:bg-slate-50"
                            >
                                <LogOut className="h-4 w-4" />

                                Sign out
                            </button>
                        </nav>
                    </div>
                </>
            )}
        </>
    );
}