// src/pages/GrowPage.jsx
//
// /grow shows one of two views:
//   1. INTRO (landing layout): for logged-out visitors every time, and for
//      logged-in users once a week. Clicking any button in it hides the intro
//      for 7 days (logged-in users only; logged-out users go to login/register).
//   2. GROW PLACEHOLDER (coming soon): what logged-in users see the rest of the time.
// The footer dock (Home, Products, Sales Orders) is kept for logged-in users in both views.
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
    Menu, X, ChevronDown, Check, GripVertical, Sparkles, BadgeCheck, Globe,
    Store, FileText, Truck, HandCoins, MessageCircle, ShieldCheck, Smartphone,
    Search, PackagePlus, Boxes, Home, TrendingUp, Rocket, BarChart3, Users,
    Mail, Phone,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { MENU_ROUTES } from "../components/menuItems.js";

// ---- Intro dismissal (1 week) ---------------------------------------------
const INTRO_KEY = "bbm_grow_intro_dismissed_at";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function introDismissedRecently() {
    try {
        const t = Number(localStorage.getItem(INTRO_KEY));
        return t > 0 && Date.now() - t < WEEK_MS;
    } catch { return false; }
}
function rememberIntroDismissed() {
    try { localStorage.setItem(INTRO_KEY, String(Date.now())); } catch { /* storage blocked: intro will show again */ }
}

// ---- Tokens ----------------------------------------------------------------
const T = {
    ink: "#141B22", muted: "#5B6672", teal: "#0B7285", tealDeep: "#0B4F5C", hero: "#0B3C47",
    tint: "#E3F3F5", green: "#1F7A4D", greenDark: "#14573A", greenTint: "#E8F3EC", greenBorder: "#BCDCC9",
    amber: "#FED813", sand: "#F3F0E6", hair: "rgba(20,27,34,0.10)",
};
const EASE = [0.16, 1, 0.3, 1];

// ---- Dummy content (edit freely) ------------------------------------------
const NAV = [
    { label: "Home", to: "/" }, { label: "How it works", to: "#how" }, { label: "Pricing", to: "#pricing" },
    { label: "Blog", to: "#blog" }, { label: "FAQs", to: "#faq" }, { label: "Contact us", to: "#contact" },
];
const COVER = [
    [{ title: "Shiv Shakti Auto Centre", sub: "Surat, Gujarat", tone: T.tint }, { title: "Order #1048 confirmed", sub: "Dispatch in 2 days", tone: T.greenTint }],
    [{ title: "Mild steel angles, 40 x 40 mm", sub: "From ₹58 per kg · 12 sellers", tone: T.sand, tall: true }],
    [{ title: "Corrugated boxes, 5 ply", sub: "From ₹14 per piece · 8 sellers", tone: T.tint, tall: true }],
    [{ title: "Quote received", sub: "Patel Traders offered ₹61 per kg", tone: T.greenTint }, { title: "Transport booked", sub: "Pickup tomorrow, 10 am", tone: T.sand }],
];
const TRADE_ROWS = [
    { Icon: Boxes, label: "Steel and metals" }, { Icon: PackagePlus, label: "Packaging" },
    { Icon: Store, label: "Electricals" }, { Icon: Truck, label: "Auto parts" },
];
const ORDER_ROWS = [
    { init: "PT", name: "Patel Traders", sub: "Sales order · ₹48,200" },
    { init: "SK", name: "Shree Krishna Pack", sub: "Purchase order · ₹21,900" },
    { init: "RA", name: "Raj Auto Spares", sub: "Credit request · ₹60,000" },
    { init: "GL", name: "Gujarat Logistics", sub: "Transport · Surat to Pune" },
];
const FEATURE_POINTS = [
    "List products once and reach buyers across the city.",
    "Compare quotes from verified sellers in one place.",
    "Track every order, payment and delivery.",
];
const USE_CASES = [
    { Icon: PackagePlus, title: "List your products", text: "Add products with photos, prices and minimum order quantities in minutes." },
    { Icon: FileText, title: "Send one request", text: "Post what you need once and get quotes from several sellers." },
    { Icon: Store, title: "Your own store page", text: "Every seller gets a store page buyers can browse and share." },
    { Icon: Truck, title: "Book transport", text: "Pick a transporter at checkout and follow the shipment." },
    { Icon: HandCoins, title: "Buy on credit", text: "Request a credit limit and pay suppliers on agreed terms." },
    { Icon: MessageCircle, title: "Chat with sellers", text: "Ask about specs and negotiate rates without leaving the app." },
    { Icon: Search, title: "Search that finds it", text: "Filter by category, city and price to reach the right product." },
    { Icon: Smartphone, title: "Works on your phone", text: "Run your orders from any device. Nothing to install." },
    { Icon: ShieldCheck, title: "Verified sellers", text: "Every store is checked before it can list." },
];
const STEPS = [
    { title: "Post what you need", text: "Share the product, quantity and delivery city." },
    { title: "Compare quotes", text: "Sellers reply with price and delivery time. Pick the best fit." },
    { title: "Order and track", text: "Pay, book transport and follow the order to your door." },
];
const FAQS = [
    { q: "How do I start selling?", a: "Create an account, complete your store details and submit them for approval. Once approved, you can list products and receive orders." },
    { q: "Is there a fee to buy?", a: "Browsing and buying are free. Sellers pay a small fee only when an order is completed." },
    { q: "How does credit work?", a: "Send a credit request from your account. After review, you get a limit you can use with eligible sellers." },
    { q: "Who arranges transport?", a: "You choose a transporter when you place the order, or the seller arranges it. Either way you can track it in the app." },
];
const GROW_STEPS = [
    { Icon: Rocket, title: "Boost your products", text: "Promote your best listings so more buyers see them first." },
    { Icon: BarChart3, title: "Track your performance", text: "See views, enquiries and orders for every product in one place." },
    { Icon: Users, title: "Reach more buyers", text: "Get matched with buyers who are looking for what you sell." },
];

// ---- Footer dock (icon + label), kept from before --------------------------
const FOOTER_ITEMS = [
    { key: "home", label: "Home", Icon: Home, to: MENU_ROUTES.home, match: (p) => p === "/home" || p === "/home/" },
    { key: "products", label: "Products", Icon: Boxes, to: MENU_ROUTES.manageProducts, match: (p) => p.startsWith("/seller/products") },
    {
        key: "sales", label: "Sales Orders", Icon: FileText, to: MENU_ROUTES.salesOrders,
        match: (p, s) => (p === "/orders" && new URLSearchParams(s || "").get("tab") === "sales") || p.startsWith("/seller/orders"),
    },
];

function FooterDock() {
    const { pathname, search } = useLocation();
    return (
        <nav aria-label="Quick navigation" className="fixed inset-x-0 z-40 flex justify-center" style={{ bottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}>
            <div className="flex items-center gap-1 rounded-full bg-white p-1.5 shadow-[0_10px_30px_-8px_rgba(20,27,34,0.35)] ring-1 ring-black/10">
                {FOOTER_ITEMS.map(({ key, label, Icon, to, match }) => {
                    const active = match(pathname, search);
                    return (
                        <Link key={key} to={to} aria-current={active ? "page" : undefined}
                            className="flex min-w-[68px] flex-col items-center gap-0.5 rounded-full px-3.5 py-1.5 transition-colors active:scale-95"
                            style={{ background: active ? T.greenTint : "transparent", color: active ? T.green : "#0B1116" }}>
                            <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2.1} />
                            <span className="whitespace-nowrap text-[10.5px] font-bold leading-none tracking-wide">{label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}

// ---- Intro pieces ----------------------------------------------------------
// Logged-out: a normal link to `to`. Logged-in: a button that dismisses the intro for a week.
function Cta({ isLoggedIn, onDismiss, to, className, style, children }) {
    return isLoggedIn
        ? <button type="button" onClick={onDismiss} className={className} style={style}>{children}</button>
        : <Link to={to} className={className} style={style}>{children}</Link>;
}

function Pill({ children }) {
    return <span className="inline-block rounded-full px-3 py-1.5 text-[12px] font-bold tracking-wide" style={{ background: T.tint, color: T.teal }}>{children}</span>;
}

function Logo({ light }) {
    return (
        <span className="flex items-center gap-2 text-[20px] font-extrabold tracking-tight" style={{ color: light ? "#fff" : T.ink }}>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg text-[13px]" style={{ background: T.amber, color: T.ink }}>B</span>
            BBM
        </span>
    );
}

function NavItem({ item, className, style, onClick }) {
    return item.to.startsWith("#")
        ? <a href={item.to} className={className} style={style} onClick={onClick}>{item.label}</a>
        : <Link to={item.to} className={className} style={style} onClick={onClick}>{item.label}</Link>;
}

function MockCard({ title, sub, tone, tall }) {
    return (
        <div className="rounded-2xl bg-white p-4 shadow-[0_12px_30px_-14px_rgba(11,60,71,0.45)]" style={{ border: `1px solid ${T.hair}` }}>
            <div className={`mb-3 w-full rounded-xl ${tall ? "h-56" : "h-24"}`} style={{ background: tone }} />
            <p className="text-[13.5px] font-extrabold tracking-wide" style={{ color: T.ink }}>{title}</p>
            <p className="mt-0.5 text-[12px] font-medium" style={{ color: T.muted }}>{sub}</p>
        </div>
    );
}

function Faq({ item, open, onToggle }) {
    return (
        <div className="rounded-2xl bg-white" style={{ border: `1px solid ${open ? T.teal : T.hair}` }}>
            <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
                <span className="text-[15px] font-extrabold" style={{ color: T.ink }}>{item.q}</span>
                <ChevronDown className="h-5 w-5 shrink-0 transition-transform duration-200" style={{ color: T.teal, transform: open ? "rotate(180deg)" : "none" }} />
            </button>
            {open && <p className="px-5 pb-5 text-[14px] leading-relaxed" style={{ color: T.muted }}>{item.a}</p>}
        </div>
    );
}

function Intro({ isLoggedIn, onDismiss }) {
    const [openFaq, setOpenFaq] = useState(0);
    const cta = { isLoggedIn, onDismiss, to: "/register" };
    const amberBtn = { background: T.amber, color: T.ink };

    return (
        <div className="bg-white antialiased" style={{ color: T.ink }}>
            {/* HERO */}
            <section style={{ background: T.hero }}>
                <div className="relative overflow-hidden px-5 pb-32 pt-44 text-center">
                    <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.12]"
                        style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "26px 26px" }} />
                    <div className="relative mx-auto max-w-3xl">
                        <h1 className="text-[40px] font-extrabold leading-[1.05] tracking-tight text-white sm:text-[56px] md:text-[64px]">Grow your trade, sorted in minutes</h1>
                        <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-white/75">
                            List what you sell, ask for quotes on what you need and move goods with credit and transport built in. One account for buying and selling.
                        </p>
                        <div className="mt-8 flex justify-center">
                            <Cta {...cta} className="inline-flex h-12 items-center gap-2 rounded-full px-6 text-[14px] font-extrabold" style={amberBtn}>
                                <Sparkles className="h-4 w-4" /> Get started
                            </Cta>
                        </div>
                    </div>
                </div>
            </section>

            {/* COVER MOCKUPS */}
            <section className="hidden lg:block">
                <div className="mx-auto max-w-6xl px-5">
                    <div className="-mt-24 flex items-center gap-4">
                        {COVER.map((col, i) => (
                            <div key={i} className="flex w-1/4 flex-col gap-4">{col.map((c) => <MockCard key={c.title} {...c} />)}</div>
                        ))}
                    </div>
                </div>
            </section>

            {/* FEATURE SPLIT */}
            <section id="how" className="px-5 pb-28 pt-24">
                <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-12">
                    <div className="hidden space-y-5 lg:col-span-6 lg:block">
                        <div className="rounded-3xl p-6" style={{ background: T.tint }}>
                            <h3 className="mb-4 text-[18px] font-extrabold">Browse by what you trade</h3>
                            <div className="space-y-3">
                                {TRADE_ROWS.map(({ Icon, label }) => (
                                    <div key={label} className="flex items-center justify-between rounded-xl bg-white px-4 py-3" style={{ border: `1px solid ${T.hair}` }}>
                                        <span className="flex items-center gap-3 text-[15px] font-semibold"><Icon className="h-5 w-5" style={{ color: T.teal }} /> {label}</span>
                                        <GripVertical className="h-5 w-5" style={{ color: "#9AA5AF" }} />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-3xl p-6" style={{ background: T.sand }}>
                            <h3 className="mb-4 text-[18px] font-extrabold">Manage every order in one place</h3>
                            <div className="space-y-3.5">
                                {ORDER_ROWS.map((r) => (
                                    <div key={r.name} className="flex items-center gap-3.5">
                                        <span className="flex h-[50px] w-[50px] items-center justify-center rounded-xl text-[14px] font-extrabold text-white" style={{ background: T.tealDeep }}>{r.init}</span>
                                        <div className="min-w-0">
                                            <p className="truncate text-[14px] font-extrabold">{r.name}</p>
                                            <p className="truncate text-[13px]" style={{ color: T.muted }}>{r.sub}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="lg:col-span-5 lg:col-start-8">
                        <Pill>Features</Pill>
                        <h2 className="mt-4 text-[34px] font-extrabold leading-tight tracking-tight sm:text-[40px]">Everything your trade needs, in one app</h2>
                        <p className="mt-4 text-[16px] leading-relaxed" style={{ color: T.muted }}>
                            From the first enquiry to the delivered order, buyers and sellers work in the same place, so nothing gets lost in phone calls and chats.
                        </p>
                        <ul className="mt-7 space-y-5">
                            {FEATURE_POINTS.map((p) => (
                                <li key={p} className="flex items-start gap-3 text-[15px] font-medium">
                                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: T.greenTint }}>
                                        <Check className="h-3 w-3" strokeWidth={3} style={{ color: T.green }} />
                                    </span>
                                    {p}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>

            {/* USE CASES */}
            <section className="px-5 pb-24">
                <div className="mx-auto max-w-6xl rounded-[28px] px-5 py-16 sm:px-10" style={{ background: T.sand }}>
                    <div className="mx-auto max-w-xl text-center">
                        <Pill>Use cases</Pill>
                        <h2 className="mt-4 text-[34px] font-extrabold tracking-tight">Built for how you actually trade</h2>
                        <p className="mt-3 text-[16px]" style={{ color: T.muted }}>Sell more, buy smarter and keep every conversation attached to its order.</p>
                    </div>
                    <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {USE_CASES.map(({ Icon, title, text }) => (
                            <div key={title} className="rounded-2xl bg-white p-6" style={{ border: `1px solid ${T.hair}` }}>
                                <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: T.tint }}><Icon className="h-6 w-6" style={{ color: T.teal }} /></span>
                                <h4 className="mb-2 mt-5 text-[18px] font-extrabold">{title}</h4>
                                <p className="text-[14px] leading-relaxed" style={{ color: T.muted }}>{text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* SPLIT WITH STEPS */}
            <section className="px-5 pb-24">
                <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-12">
                    <div className="lg:col-span-5">
                        <Pill>Update anytime</Pill>
                        <h2 className="mt-4 text-[34px] font-extrabold leading-tight tracking-tight">Make every enquiry work for you</h2>
                        <div className="mt-8 space-y-7">
                            {STEPS.map((s) => (
                                <div key={s.title} className="flex items-start gap-4">
                                    <BadgeCheck className="mt-0.5 h-7 w-7 shrink-0" style={{ color: T.green }} />
                                    <div>
                                        <h4 className="text-[17px] font-extrabold">{s.title}</h4>
                                        <p className="mt-1 text-[14px]" style={{ color: T.muted }}>{s.text}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="hidden lg:col-span-5 lg:col-start-8 lg:block">
                        <div className="space-y-4 rounded-3xl p-8" style={{ background: T.tint }}>
                            <MockCard title="Request: 2 tonne MS angles" sub="Surat · needed by Friday" tone="#fff" />
                            <MockCard title="3 quotes received" sub="Lowest ₹58 per kg · fastest 2 days" tone={T.greenTint} />
                        </div>
                    </div>
                </div>
            </section>

            {/* FAQ */}
            <section id="faq" className="px-5 pb-24">
                <div className="mx-auto max-w-3xl">
                    <div className="text-center">
                        <Pill>FAQs</Pill>
                        <h2 className="mt-4 text-[34px] font-extrabold tracking-tight">Frequently asked questions</h2>
                        <p className="mx-auto mt-3 max-w-md text-[15px]" style={{ color: T.muted }}>Quick answers about buying, selling, credit and delivery.</p>
                    </div>
                    <div className="mt-10 space-y-3">
                        {FAQS.map((f, i) => <Faq key={f.q} item={f} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? -1 : i)} />)}
                    </div>
                </div>
            </section>

            {/* COMMUNITY CTA */}
            <section className="px-5 pb-24">
                <div className="mx-auto max-w-6xl rounded-[28px] px-6 py-20 text-center" style={{ background: T.tealDeep }}>
                    <h2 className="text-[15px] font-bold text-white/70">Join our community</h2>
                    <h3 className="mx-auto mt-3 max-w-2xl text-[28px] font-extrabold leading-tight text-white sm:text-[36px]">Trusted by over 5,000 traders. Join them and grow your business.</h3>
                    <Cta {...cta} className="mt-8 inline-flex h-12 items-center rounded-full px-7 text-[14px] font-extrabold" style={amberBtn}>Get started</Cta>
                </div>
            </section>

            {/* FOOTER (extra bottom padding clears the fixed dock for logged-in users) */}
            <footer id="contact" className={`px-5 ${isLoggedIn ? "pb-28" : "pb-10"}`}>
                <div className="mx-auto max-w-6xl">
                    <div className="flex flex-col items-center gap-4">
                        <Logo />
                        <div className="flex gap-6 text-[15px] font-semibold">
                            <Link to="/" className="hover:underline">Home</Link>
                            <a href="#blog" className="hover:underline">Blog</a>
                        </div>
                    </div>
                    <div className="my-8 h-px" style={{ background: T.hair }} />
                    <div className="grid items-center gap-5 md:grid-cols-3">
                        <p className="order-last text-center text-[13px] md:order-first md:text-left" style={{ color: T.muted }}>© 2026 BBM. All rights reserved.</p>
                        <div className="flex justify-center"><a href="#contact" className="text-[14px] font-semibold hover:underline">Contact</a></div>
                        <div className="flex justify-center gap-3 md:justify-end">
                            {[
                                { Icon: Mail, href: "mailto:communication@bbmpvtltd.com", label: "Email us" },
                                { Icon: Phone, href: "tel:+919537284774", label: "Call us" },
                            ].map(({ Icon, href, label }) => (
                                <a key={label} href={href} aria-label={label} className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ border: `1px solid ${T.hair}` }}><Icon className="h-4 w-4" /></a>
                            ))}
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}

// ---- Grow placeholder (what logged-in users normally see) ------------------
function GrowSoon() {
    const reduce = useReducedMotion();
    return (
        <main className="mx-auto flex min-h-screen max-w-xl flex-col px-4 pb-28 pt-4">
            <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
                <motion.div
                    initial={reduce ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease: EASE }}
                    className="relative flex h-20 w-20 items-center justify-center rounded-full" style={{ background: T.green }}
                >
                    {!reduce && (
                        <motion.span aria-hidden className="absolute inset-0 rounded-full" style={{ background: T.green }}
                            initial={{ opacity: 0.35, scale: 1 }} animate={{ opacity: 0, scale: 1.6 }}
                            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }} />
                    )}
                    <TrendingUp className="relative h-9 w-9 text-white" strokeWidth={2} />
                </motion.div>

                <span className="mt-5 rounded-full border px-3 py-1 text-[10.5px] font-extrabold uppercase tracking-wider" style={{ background: T.greenTint, borderColor: T.greenBorder, color: T.greenDark }}>Coming soon</span>
                <h1 className="mt-3 text-[26px] font-extrabold leading-tight tracking-wide" style={{ color: "#0B1116" }}>Grow your business</h1>
                <p className="mt-2 max-w-sm text-[13.5px] font-medium leading-relaxed tracking-wide" style={{ color: "#667077" }}>
                    Soon you will be able to promote your products, track how they perform and reach more buyers, all from here. We are putting the finishing touches on it.
                </p>

                <div className="mt-8 grid w-full gap-2.5 text-left">
                    {GROW_STEPS.map(({ Icon, title, text }, i) => (
                        <motion.div key={title} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, ease: EASE, delay: 0.1 + i * 0.06 }}
                            className="flex items-start gap-3 rounded-md border px-3 py-3" style={{ background: T.greenTint, borderColor: T.greenBorder }}>
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: T.green }}><Icon className="h-4 w-4 text-white" strokeWidth={2} /></span>
                            <span className="min-w-0 leading-tight">
                                <span className="block text-[13px] font-extrabold tracking-wide" style={{ color: T.greenDark }}>{title}</span>
                                <span className="mt-0.5 block text-[11.5px] font-medium leading-snug tracking-wide" style={{ color: "#667077" }}>{text}</span>
                            </span>
                        </motion.div>
                    ))}
                </div>
            </div>
        </main>
    );
}

// ---- Page ------------------------------------------------------------------
export default function GrowPage() {
    const { isLoggedIn } = useAuth();
    const [dismissed, setDismissed] = useState(introDismissedRecently);

    // Logged-out: always the intro. Logged-in: the intro until a button is clicked, then a week of the placeholder.
    const showIntro = !isLoggedIn || !dismissed;

    const dismissIntro = () => {
        rememberIntroDismissed();
        setDismissed(true);
        window.scrollTo({ top: 0 });
    };

    return (
        <div className="min-h-screen bg-white text-slate-900 antialiased">
            {showIntro ? <Intro isLoggedIn={isLoggedIn} onDismiss={dismissIntro} /> : <GrowSoon />}
            {isLoggedIn && <FooterDock />}
        </div>
    );
}