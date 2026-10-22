// src/pages/GrowPage.jsx
// Page content only. Header, footer and dock live in components/grow/GrowLayout.jsx.
// Images expected in /public: grow_listing.jpg and brands/<slug>.jpg

import { useState } from "react";
import { Link } from "react-router-dom";
import { MENU_ROUTES } from "../components/menuItems.js";
import { goTo } from "../components/grow/scrollTo.js";
import Seo from "../components/Seo.jsx";


const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ------------------------------ DATA ------------------------------ */
const BRANDS = [
    ["3M", 2], ["Aditya", 3], ["Asian Paints", 1], ["Bosch", 3], ["Castrol", 1],
    ["Ft Paint", 1], ["Mercedes", 1], ["Mobil", 4], ["Nerolac", 2], ["Oneida", 1],
    ["Securust", 1], ["Shaktiman", 1], ["Shell", 19], ["Sk Zic", 1], ["Skf", 1],
    ["Timken", 2], ["Unity", 0], ["Zerust", 2], ["ZXL", 2],
].map(([name, count]) => ({ name, count, src: `/brands/${slug(name)}.jpg` }));

const ROW_1 = BRANDS.filter((_, i) => i % 2 === 0);
const ROW_2 = BRANDS.filter((_, i) => i % 2 === 1);

const TOPICS = [
    {
        id: "buyers", tone: "o", tag: "Finding buyers",
        title: "“I have products. How do I get them in front of more buyers?”",
        intro: "The challenge is rarely the product. It is reaching the right buyer at the right time.",
        qa: [
            { q: "How do I find new B2B buyers?", ctx: "I already have customers, but finding new buyers takes time and effort.", sol: "Publish your products and make them discoverable to relevant B2B buyers." },
            { q: "Why am I so dependent on referrals and existing customers?", ctx: "My network is valuable, but I need a way to expand it.", sol: "Build a digital sales channel around your existing business and reach beyond your current network." },
            { q: "How do I get inquiries for products I actually sell?", ctx: "I do not want random leads. I want requirements relevant to my products.", sol: "Keep a structured product catalogue so buyers can discover exactly what you sell." },
        ],
        outcome: "More relevant visibility → more opportunities → more chances to win business.",
    },
    {
        id: "catalogue", tone: "b", tag: "Your product catalogue",
        title: "“Why am I still sending the same product information again and again?”",
        intro: "Your product information should be ready before the buyer asks for it.",
        qa: [
            { q: "Do I have to keep sending images, specifications and prices?", ctx: "Every inquiry means opening old files, finding product details and sending them again.", sol: "Add the product once. Keep images, specifications, TDS/certificates, pack size, MOQ and prices ready to share." },
            { q: "What if I have a large product range?", ctx: "Hundreds of SKUs quickly become difficult to manage through PDFs, spreadsheets and WhatsApp.", sol: "Keep your product range organised in one digital catalogue, ready to discover, share and sell." },
            { q: "Can I control how I sell each product?", ctx: "Different products have different packs, MOQs and fulfilment requirements.", sol: "Set selling unit, pack size, master pack and MOQ product by product." },
        ],
        outcome: "One catalogue. One source of product information. Less repetition.",
    },
    {
        id: "pricing", tone: "y", tag: "Pricing",
        title: "“How do I manage pricing without losing control?”",
        intro: "B2B pricing is rarely one-size-fits-all. BBM Marketplace is designed around that reality.",
        qa: [
            { q: "How do I manage different prices for different buyers?", ctx: "I sell the same product to different customers at different commercial prices.", sol: "Create buyer-specific pricing while keeping one central product catalogue." },
            { q: "Can I give better prices for larger quantities?", ctx: "Quantity often changes the economics of a B2B order.", sol: "Create quantity-based price slabs so the right price applies to the quantity ordered." },
            { q: "What happens when my base price changes?", ctx: "I do not want to update the same product price in multiple places.", sol: "Update the base price once and keep linked buyer pricing easier to manage." },
            { q: "Can I control who sees my products and prices?", ctx: "Not every buyer needs the same visibility or commercial terms.", sol: "Control buyer access and manage visibility and pricing according to your business model." },
        ],
        outcome: "More pricing control without more spreadsheets.",
    },
    {
        id: "delivery", tone: "g", tag: "Fulfilment & delivery",
        title: "“What happens when every product has different delivery terms?”",
        intro: "Stock, lead time, MOQ, freight and returns should be clear before an order arrives.",
        qa: [
            { q: "How do I tell buyers when I can deliver?", ctx: "Some products are ready stock. Others are made only after receiving an order.", sol: "Set ready-to-dispatch or made-to-order status, lead time and dispatch location for each product." },
            { q: "Can I set my own return, replacement and warranty terms?", ctx: "Different products and businesses require different policies.", sol: "Define your own return, replacement and warranty terms before the sale." },
            { q: "Why should I arrange transport from scratch for every order?", ctx: "I already have transporters and logistics partners I trust.", sol: "Use your preferred logistics partners and keep your delivery preferences part of the selling process." },
            { q: "Can I choose where I want to sell?", ctx: "I may only be able to serve certain locations or markets.", sol: "Choose the markets and locations where you want to receive orders." },
        ],
        outcome: "Clear expectations for buyers. Fewer fulfilment surprises for sellers.",
    },
    {
        id: "sales", tone: "o", tag: "Sales management",
        title: "“Why does selling take so much manual effort?”",
        intro: "A good sales team should spend more time selling, not repeatedly preparing information.",
        qa: [
            { q: "Why do inquiries, quotations and follow-ups take so much time?", ctx: "Product sharing, pricing and order information are often spread across different tools.", sol: "Keep the selling information organised so your team can respond faster and manage the journey more efficiently." },
            { q: "How do I respond faster to buyers?", ctx: "Buyers expect quick answers, but every quotation can require manual preparation.", sol: "Keep product, pricing and fulfilment information ready before the inquiry arrives." },
            { q: "Can I manage new and existing buyers together?", ctx: "I do not want a new channel that ignores the customers I already have.", sol: "Use the same selling environment to acquire new buyers and manage existing relationships." },
            { q: "What happens after an order arrives?", ctx: "The order still needs to be confirmed, dispatched and delivered.", sol: "Keep the journey clear: Confirm → Dispatch → Deliver." },
        ],
        outcome: "Faster response. Better organisation. More time for actual selling.",
    },
    {
        id: "credit", tone: "y", tag: "Credit & growth",
        title: "“How do I grow without losing control?”",
        intro: "More customers should create more business, not more chaos.",
        qa: [
            { q: "How do I manage customers who buy on credit?", ctx: "Credit is part of B2B, but different terms and outstanding payments can become difficult to manage.", sol: "Keep buyer-wise credit terms, orders and payment information organised in one selling environment." },
            { q: "Can I decide my own credit terms?", ctx: "Every buyer relationship is different.", sol: "Your business. Your terms. Set the credit arrangement you are comfortable offering." },
            { q: "How do I grow without increasing sales infrastructure at the same speed?", ctx: "More buyers can mean more people, follow-ups and administration.", sol: "Build a scalable selling process that reduces repetitive work as your business grows." },
            { q: "How do I turn one-time buyers into recurring customers?", ctx: "Winning the first order is only the beginning.", sol: "Keep products, pricing and buyer relationships ready so repeat business becomes easier to manage." },
        ],
        outcome: "More business, with more control over how you sell it.",
    },
];

const SETUP = [
    ["Products", "Your catalogue, images and specifications."],
    ["Packaging", "Pack size, master pack and MOQ."],
    ["Pricing", "Base, quantity and buyer-specific prices."],
    ["Fulfilment", "Stock, lead time, dispatch and returns."],
    ["Market", "Where you want to sell and receive orders."],
    ["Growth", "Promotion and buyer acquisition."],
    ["Delivery", "Your transport preferences and partners."],
    ["Credit", "Your buyer-wise commercial terms."],
];

/* ---------------------------- COMPONENTS ---------------------------- */
function Tile({ brand }) {
    const label = brand.count
        ? `${brand.name} · ${brand.count} ${brand.count > 1 ? "products" : "product"}`
        : brand.name;
    return (
        <div className="tile">
            <img
                src={brand.src}
                alt={`${brand.name} logo`}
                loading="lazy"
                decoding="async"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
            <span>{label}</span>
        </div>
    );
}

function Rail({ items, reverse = false }) {
    return (
        <div className={`rail${reverse ? " rev" : ""}`}>
            {[0, 1].map((k) => (
                <div className="track py-2" key={k} aria-hidden={k ? true : undefined}>
                    {items.map((b) => <Tile key={b.name} brand={b} />)}
                </div>
            ))}
        </div>
    );
}

// Plus icon drawn as SVG: the vertical stroke collapses when open (+ becomes -).
function PlusMinus({ open }) {
    return (
        <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--line)] bg-[var(--bg)] text-[var(--acc-t)]"
        >
            <svg
                viewBox="0 0 14 14"
                className={`block h-3.5 w-3.5 transition-transform duration-350 ease-[cubic-bezier(.4,0,.2,1)] ${open ? "rotate-45" : "rotate-0"
                    }`}
            >
                <line
                    x1="1.5"
                    y1="7"
                    x2="12.5"
                    y2="7"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                />
                <line
                    x1="7"
                    y1="1.5"
                    x2="7"
                    y2="12.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                />
            </svg>
        </span>
    );
}

// Controlled item: the parent decides which one is open (only one at a time page-wide).
function QA({ uid, open, onToggle, q, ctx, sol }) {
    return (
        <div className={`qa${open ? " open" : ""}`}>
            <h3 className="qh">
                <button
                    type="button"
                    className="qb flex w-full items-center justify-between gap-4"
                    id={`${uid}-b`}
                    aria-expanded={open}
                    aria-controls={`${uid}-p`}
                    onClick={() => onToggle(uid)}
                >
                    <span className="qt">{q}</span>
                    <PlusMinus open={open} />
                </button>
            </h3>

            <div
                className="ap"
                id={`${uid}-p`}
                role="region"
                aria-labelledby={`${uid}-b`}
            >
                <div className="aw">
                    <div className="ans">
                        <p>{ctx}</p>
                        <div className="sol">
                            <b>BBM Marketplace</b>
                            <span>{sol}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Topic({ topic, openId, onToggle }) {
    return (
        <section className={`topic ${topic.tone}`} id={`grow-${topic.id}`}>
            <div className="wrap">
                <div className="side">
                    <div className="tag">{topic.tag}</div>
                    <h2>{topic.title}</h2>
                    <p>{topic.intro}</p>
                </div>
                <div>
                    {topic.qa.map((item, i) => {
                        const uid = `gq-${topic.id}-${i}`;
                        return (
                            <QA
                                key={item.q}
                                uid={uid}
                                open={openId === uid}
                                onToggle={onToggle}
                                {...item}
                            />
                        );
                    })}
                    <div className="out"><span>The outcome</span>{topic.outcome}</div>
                </div>
            </div>
        </section>
    );
}

/* ------------------------------- PAGE ------------------------------- */
export default function GrowPage() {
    // Single source of truth: opening one item closes whichever was open.
    const [openId, setOpenId] = useState(null);
    const toggle = (uid) => setOpenId((cur) => (cur === uid ? null : uid));

    return (
        <>
            <Seo
                title="Sell B2B online with BBM Marketplace – Reach buyers, manage orders"
                description="List your products, set your own prices, MOQs and delivery terms, and reach verified B2B buyers. Transaction fees start as low as 0.25%."
                path="/grow/details"
            />
            {/* Hero */}
            <section className="hero">
                <div className="wrap">
                    <div>
                        <div className="tiles">
                            <a className="t2 o" href="#grow-brandwall" onClick={goTo("grow-brandwall")}>
                                <span className="ic">
                                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.4" /></svg>
                                </span>
                                <span className="tx"><b>Brands</b><small>Already on BBM Marketplace</small></span>
                                <span className="ch" aria-hidden="true">›</span>
                            </a>
                            <Link className="t2 b" to={"/grow?start=1"}>
                                <span className="ic">
                                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9l1-5h14l1 5M4 9v11h16V9M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9M9 20v-6h6v6" /></svg>
                                </span>
                                <span className="tx"><b>Sellers</b><small>Start selling</small></span>
                                <span className="ch" aria-hidden="true">›</span>
                            </Link>
                        </div>

                        <h1>Sell B2B with <em>confidence</em>.</h1>
                        <p className="lead">
                            Reach beyond your network, get requirements relevant to what you sell, and turn opportunities into orders.
                        </p>
                        <div>
                            <Link className="btn" to={'/grow?start=1'}>Add your products</Link>
                            <a className="btn ghost mt-3 sm:ms-2" href="#grow-pricing" onClick={goTo("grow-pricing")}>See how pricing works</a>
                        </div>
                        <div className="trio">
                            <span className="o">More buyers</span>
                            <span className="b">More inquiries</span>
                            <span className="g">More sales</span>
                        </div>
                    </div>

                    <figure className="shot">
                        <img
                            src="/Flamix_Hydraulic_Oil Supplier_Marketplace.png"
                            width="760"
                            height="745"
                            alt="Flamix Hydraulic Oil, Seller with master pack pricing, best price offer and a seller's own listing with promo"
                        />
                    </figure>
                </div>
            </section>

            {/* Value belt */}
            <div className="belt">
                <div className="wrap">
                    <div className="o"><b>Reach beyond your network</b><span>Get requirements relevant to what you sell.</span></div>
                    <div className="b"><b>Turn opportunities into orders</b><span>Quote, confirm, dispatch and deliver in one place.</span></div>
                    <div className="g"><b>Keep more of every order</b><span>Transaction fees start as low as 0.25%.</span></div>
                </div>
            </div>

            {/* Brand wall */}
            <section className="brands" id="grow-brandwall" aria-labelledby="grow-brands-h">
                <div className="wrap">
                    <h2 id="grow-brands-h">Brands buyers already trust on BBM Marketplace.</h2>
                    <p><b>23 brands</b> and <b>50+ products</b> are already listed on the marketplace.</p>
                </div>
                <Rail items={ROW_1} />
                <Rail items={ROW_2} reverse />
            </section>

            {/* Intro */}
            <section className="intro">
                <div className="wrap">
                    <h2>Selling a product is easy. Managing everything around the sale is not.</h2>
                    <p>
                        Finding buyers. Sharing product details. Managing prices. Handling inquiries. Coordinating delivery. Managing credit. BBM Marketplace brings the selling process together, so you can focus on growing the business.
                    </p>
                </div>
            </section>

            {TOPICS.map((t) => (
                <Topic key={t.id} topic={t} openId={openId} onToggle={toggle} />
            ))}

            {/* Set up once */}
            <section className="once">
                <div className="wrap">
                    <h2>What if selling could be set up once?</h2>
                    <p className="sub">
                        Instead of rebuilding the selling process for every buyer, set your business up once and keep it ready.
                    </p>
                    <div className="grid8">
                        {SETUP.map(([title, text]) => (
                            <div key={title}><b>{title}</b><span>{text}</span></div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Final CTA */}
            <section className="cta" id="grow-start">
                <div className="wrap">
                    <h2>You decide how you sell. BBM Marketplace helps you sell it better.</h2>
                    <div className="fee">
                        <b>0.25%</b>
                        <div className="fee-text">
                            <span>Transaction fees start as low as this.</span>
                            <span>Keep more of every order you win.</span>
                        </div>
                    </div>
                    <p>Add your products. Set your terms. Reach buyers. Manage orders. Build repeat business.</p>
                    <div className="button-grid flex items-center justify-center">
                        <Link className="btn" to={'/grow?start=1'}>
                            Add your products
                        </Link>

                        <br />

                        <a
                            className="btn green"
                            href="#grow-credit"
                            onClick={goTo("grow-credit")}
                        >
                            See how you grow
                        </a>
                    </div>
                </div>
            </section>
        </>
    );
}