// Page content only. Header, footer and dock live in components/save/SaveLayout.jsx.
// Optional images in /public: brands/<slug>.jpg (same as GROW).
// The compare card below is SAMPLE data (industrial supplies, fictional sellers) shown to explain how comparison works.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { goTo } from "../components/grow/scrollTo.js";
import { MENU_ROUTES } from "../components/menuItems.js";
import Seo from "../components/Seo.jsx";
import "../components/save/save.css";
import "../components/save/save-home.css";

const BUY_TO = MENU_ROUTES.home;
const EXPLORE_TO = MENU_ROUTES.home;
const GROW_TO = "/grow/details";

const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ------------------------------ DATA ------------------------------ */
const BRANDS = ["3M", "Aditya", "Asian Paints", "Bosch", "Castrol", "Ft Paint", "Mercedes", "Mobil", "Nerolac", "Oneida",
    "Securust", "Shaktiman", "Shell", "Sk Zic", "Skf", "Timken", "Unity", "Zerust", "ZXL"]
    .map((name) => ({ name, src: `/brands/${slug(name)}.jpg` }));
const ROW_1 = BRANDS.filter((_, i) => i % 2 === 0);
const ROW_2 = BRANDS.filter((_, i) => i % 2 === 1);

// SAMPLE offers (fictional sellers, close prices like a real market). Each one wins a different sort,
// so the re-ordering is easy to see. Prices are per pack (1 pack = 26 litres).
const SAMPLE_PRODUCT = {
    name: "Flamix Hydraulic Oil AW68 - 26 Ltr",
    meta: "Lubricant · Machine maintenance oil",
    pack: "1 Pack = 26 Litres",
    unit: "Pack",
};

const OFFERS = [
    { seller: "Sample Supplier A", city: "Rajkot, Gujarat", moq: 4, days: 4, freight: false, price: 3480 },
    { seller: "Sample Supplier B", city: "Ahmedabad, Gujarat", moq: 1, days: 3, freight: true, price: 3540 },
    { seller: "Sample Supplier C", city: "Surat, Gujarat", moq: 2, days: 1, freight: true, price: 3625 },
];

const SORTS = [
    { key: "moq", label: "Min MOQ", short: "Min MOQ", tag: "LOWEST MOQ", cmp: (a, b) => a.moq - b.moq },
    { key: "price", label: "Best price", short: "Best price", tag: "BEST PRICE", cmp: (a, b) => a.price - b.price },
    { key: "fast", label: "Fastest delivery", short: "Fastest", tag: "FASTEST", cmp: (a, b) => a.days - b.days },
];

const PAIN = ["Finding the right supplier.", "Getting the right price.", "Comparing alternatives.", "Checking specifications.",
    "Negotiating quantities.", "Managing delivery.", "Buying on the right terms.", "Repeating the purchase."];
const TONES = ["o", "b", "y", "g"];

const TOPICS = [
    {
        id: "find", tone: "o", tag: "Finding products",
        title: "“I know what I need. How do I find the right product?”",
        intro: ["The challenge isn't always availability.", "It is finding the right product from the right supplier at the right commercial terms."],
        qa: [
            ["How do I find new suppliers for products I already buy?", "I usually depend on my existing supplier network.", "Discover products and suppliers beyond your current network and create more options before making a purchase."],
            ["Why should I depend on only one supplier?", "My existing supplier works, but I want alternatives when price, availability or service changes.", "Keep alternative products and suppliers discoverable, so you have more choice when you need it."],
            ["How do I find a product when I don't know the exact brand?", "Sometimes I know the specification or application, but not which product to buy.", "Search by product, category, requirement or specification and explore relevant options."],
        ],
        outcome: "More options → better comparison → better buying decisions.",
    },
    {
        id: "info", tone: "b", tag: "Product information",
        title: "“Why does sourcing one product take so much back-and-forth?”",
        intro: ["A buyer shouldn't have to ask the same questions every time:"],
        chips: ["What is the specification?", "What is the pack size?", "What is the MOQ?", "What is the price?", "Is it available?", "When can you dispatch?"],
        qa: [
            ["Can I see complete product information before contacting the seller?", "I don't want to spend time asking for basic information.", "Product information, specifications, images, pack sizes and commercial details can be organised before you make your buying decision."],
            ["How do I compare two similar products?", "Different suppliers present information differently, making comparison difficult.", "Bring important product and commercial information into one buying environment so alternatives are easier to evaluate."],
            ["Can I check technical documents before buying?", "For many B2B products, specifications and certificates matter.", "Access available TDS, certificates, specifications and product information before moving ahead."],
        ],
        outcome: "Less back-and-forth. More information before you buy.",
    },
    {
        id: "price", tone: "y", tag: "Price & savings",
        title: "“How do I know I am getting the right price?”",
        intro: ["The lowest listed price is not always the lowest buying cost."],
        chips: ["Pack size", "MOQ", "Quantity", "Freight", "Taxes", "Payment terms", "Delivery location"],
        after: "The real cost is what matters.",
        qa: [
            ["Can I compare prices from different sellers?", "I don't want to accept the first quotation I receive.", "Explore multiple products and seller options before deciding where to buy."],
            ["Can I get a better price when I buy more?", "My purchase quantity should influence the economics of the order.", "See quantity-based pricing where sellers offer better rates for larger quantities."],
            ["How do I know which option actually saves me money?", "A cheaper unit price does not always mean a cheaper purchase.", "Consider pack size, MOQ, quantity, delivery and commercial terms together before choosing."],
            ["Can I negotiate or request a better offer?", "Some purchases require a conversation before the final price is decided.", "Connect with sellers when you need a specific quotation, quantity or commercial arrangement."],
        ],
        outcome: "Compare better → negotiate smarter → buy at better economics.",
    },
    {
        id: "delivery", tone: "g", tag: "Availability & delivery",
        title: "“What is the point of a good price if the product doesn't arrive when I need it?”",
        intro: ["Purchase decisions depend on more than price."],
        chips: ["Availability", "Lead time", "Dispatch location", "Delivery", "Freight"],
        qa: [
            ["How do I know whether a product is available?", "I don't want to place an order and discover later that the seller cannot supply it.", "See availability and fulfilment information before placing the order."],
            ["Can I know the expected lead time?", "Some products are ready stock while others take time to manufacture.", "See whether products are ready to dispatch or made to order, along with available lead-time information."],
            ["Can I choose how the product is delivered?", "Freight can significantly affect the final purchase cost.", "Understand the seller's delivery and freight terms before confirming the purchase."],
        ],
        outcome: "Clear availability → predictable delivery → fewer purchase surprises.",
    },
    {
        id: "orders", tone: "o", tag: "Buying & orders",
        title: "“Why should every purchase become a separate conversation?”",
        intro: ["B2B buying often involves:"],
        journey: ["Inquiry", "Quotation", "Negotiation", "Confirmation", "Payment", "Dispatch", "Delivery"],
        after: "BBM Marketplace should make this journey easier to manage.",
        qa: [
            ["Can I buy directly instead of starting from zero every time?", "Once I know what I want, I want the buying process to be simple.", "Move from product discovery to purchase with less unnecessary back-and-forth."],
            ["Can I manage multiple products in one purchase?", "My requirements often include several products from different suppliers.", "Organise your buying requirements and manage your orders from one environment."],
            ["Can I see what I have already ordered?", "I need to know what I bought, from whom and when.", "Keep your purchase history organised so repeat buying becomes easier."],
        ],
        outcome: "Less effort → faster buying → better organised purchasing.",
    },
    {
        id: "credit", tone: "b", tag: "Credit & commercial terms",
        title: "“How do I buy on terms that work for my business?”",
        intro: ["B2B purchasing is not always prepaid.", "Credit terms, payment arrangements and buyer-seller relationships can matter just as much as price."],
        qa: [
            ["Can I discuss credit terms with sellers?", "Different suppliers have different policies and different buyers have different requirements.", "Connect with sellers and discuss commercial terms that work for both sides."],
            ["Can I keep buying from suppliers I trust?", "Price matters, but reliability matters too.", "Build relationships with suppliers and make repeat purchasing easier."],
            ["Can I compare suppliers beyond just price?", "The cheapest supplier isn't always the best supplier.", "Consider product, price, availability, fulfilment and commercial terms together."],
        ],
        outcome: "Better terms. Better supplier relationships. Better purchasing decisions.",
    },
    {
        id: "repeat", tone: "y", tag: "Repeat buying",
        title: "“Why should I repeat the same sourcing work every time?”",
        intro: ["If you regularly buy the same products, your previous purchase should make the next purchase easier."],
        qa: [
            ["Can I easily find products I have bought before?", "I don't want to search from scratch every time.", "Keep your purchase journey organised so repeat buying becomes faster."],
            ["Can I return to suppliers I already trust?", "Once I find a reliable supplier, I want to continue the relationship.", "Keep trusted suppliers and previous buying relationships within your purchasing environment."],
            ["How do I reduce the time my team spends purchasing?", "Procurement teams spend significant time searching, comparing and following up.", "Create a more structured buying process so repetitive sourcing work takes less effort."],
        ],
        outcome: "Buy once → learn → repeat better.",
    },
];

const SETUP = [
    ["Products", "Find what your business needs."],
    ["Suppliers", "Discover and retain trusted sellers."],
    ["Specifications", "Keep important product information accessible."],
    ["Prices", "Compare available commercial options."],
    ["Quantity", "Buy according to your actual requirement."],
    ["Delivery", "Understand availability, lead time and fulfilment."],
    ["Orders", "Keep your purchase history organised."],
    ["Savings", "Make better buying decisions over time."],
];

const inr = (n) => `₹${n.toLocaleString("en-IN")}`;

// Optional: put a real product image URL here (e.g. the Flamix Hydraulic Oil listing photo).
// While it is empty, a simple drum icon is shown instead.
const PRODUCT_IMG = "/Flamix_Hydraulic_Oil.png";

function ProductThumb() {
    const [bad, setBad] = useState(false);
    return (
        <div className="cmp-th">
            {bad || !PRODUCT_IMG
                ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5c0-1.1 2.7-2 6-2s6 .9 6 2-2.7 2-6 2-6-.9-6-2zM6 5v14c0 1.1 2.7 2 6 2s6-.9 6-2V5M6 10c0 1.1 2.7 2 6 2s6-.9 6-2M6 15c0 1.1 2.7 2 6 2s6-.9 6-2" /></svg>
                : <img src={PRODUCT_IMG} alt={SAMPLE_PRODUCT.name} onError={() => setBad(true)} />}
        </div>
    );
}

/* -------------------------- COMPARE WIDGET -------------------------- */
function CompareCard() {
    const reduce = useReducedMotion();
    const [sortKey, setSortKey] = useState("price");
    const sort = SORTS.find((s) => s.key === sortKey);
    // Sorted by the chosen metric ONLY. Array.sort is stable, so ties keep their original order.
    const list = useMemo(() => [...OFFERS].sort(sort.cmp), [sort]);
    const spring = reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36, mass: 0.9 };

    return (
        <div className="cmp" aria-label="Compare offers example">
            <div className="cmp-top">
                <ProductThumb />
                <div>
                    <h3>{SAMPLE_PRODUCT.name}</h3>
                    <small>{SAMPLE_PRODUCT.meta} · {OFFERS.length} sellers</small>
                    <small>{SAMPLE_PRODUCT.pack}</small>
                </div>
            </div>

            <div className="sgm" role="group" aria-label="Sort offers">
                {SORTS.map((s) => {
                    const active = s.key === sortKey;
                    return (
                        <button key={s.key} type="button" aria-pressed={active} onClick={() => setSortKey(s.key)}>
                            {active && <motion.span layoutId="sv-pill" className="pill" transition={spring} />}
                            <span><span className="full">{s.label}</span><span className="short">{s.short}</span></span>
                        </button>
                    );
                })}
            </div>
            <p className="sr" aria-live="polite">Sorted by {sort.label}. Top offer: {list[0].seller}.</p>

            <ul className="ofl">
                {list.map((o, i) => (
                    <motion.li key={o.seller} layout="position" transition={spring} className={`of${i === 0 ? " top" : ""}`}>
                        <div>
                            <h4>
                                {o.seller}
                                {i === 0 && (
                                    <motion.span key={sort.key} className="tg"
                                        initial={reduce ? false : { opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
                                        {sort.tag}
                                    </motion.span>
                                )}
                            </h4>
                            <p>{o.city}</p>
                            <div className="mt">
                                <span className={`mp${sortKey === "moq" ? " hl" : ""}`}>MOQ {o.moq} {o.moq === 1 ? "pack" : "packs"}</span>
                                <span className={`mp${sortKey === "fast" ? " hl" : ""}`}>~{o.days}d delivery</span>
                                <span className={`mp${o.freight ? " in" : ""}`}>
                                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>
                                    Freight {o.freight ? "included" : "extra"}
                                </span>
                            </div>
                        </div>
                        <div className={`pr${sortKey === "price" ? " hl" : ""}`}>
                            <b>{inr(o.price)}</b><small>/{SAMPLE_PRODUCT.unit}</small>
                        </div>
                    </motion.li>
                ))}
            </ul>

            <p className="nt">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>
                The lowest listed price is not always the lowest buying cost. Compare MOQ, freight and delivery together. Sample data for illustration only.
            </p>
        </div>
    );
}

/* ---------------------------- COMPONENTS ---------------------------- */
function Tile({ brand }) {
    const [failed, setFailed] = useState(false);
    return (
        <div className="tile">
            {failed
                ? <span>{brand.name}</span>
                : <img src={brand.src} alt={`${brand.name} logo`} loading="lazy" decoding="async" onError={() => setFailed(true)} />}
        </div>
    );
}

function Rail({ items, reverse = false }) {
    return (
        <div className={`rail${reverse ? " rev" : ""}`}>
            {[0, 1].map((k) => (
                <div className="track" key={k} aria-hidden={k ? true : undefined}>
                    {items.map((b) => <Tile key={b.name} brand={b} />)}
                </div>
            ))}
        </div>
    );
}

// Controlled item: the parent decides which one is open (only one at a time page-wide).
function QA({ uid, open, onToggle, q, ctx, sol }) {
    return (
        <div className={`qa${open ? " open" : ""}`}>
            <h3 className="qh">
                <button type="button" className="qb" id={`${uid}-b`} aria-expanded={open} aria-controls={`${uid}-p`} onClick={() => onToggle(uid)}>
                    <span className="qt">{q}</span>
                    <span className="pm" aria-hidden="true" />
                </button>
            </h3>
            <div className="ap" id={`${uid}-p`} role="region" aria-labelledby={`${uid}-b`}>
                <div className="aw">
                    <div className="ans">
                        <p>{ctx}</p>
                        <div className="sol"><b>BBM Marketplace</b><span>{sol}</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Topic({ topic, openId, onToggle }) {
    return (
        <section className={`topic ${topic.tone}`} id={`save-${topic.id}`}>
            <div className="wrap">
                <div className="side">
                    <div className="tag">{topic.tag}</div>
                    <h2>{topic.title}</h2>
                    {topic.intro.map((t) => <p key={t}>{t}</p>)}
                    {topic.chips && <div className="chp">{topic.chips.map((c) => <span key={c}>{c}</span>)}</div>}
                    {topic.journey && (
                        <div className="jr">
                            {topic.journey.map((c, i) => (
                                <span key={c} style={{ display: "contents" }}>{i > 0 && <i aria-hidden="true">→</i>}<span>{c}</span></span>
                            ))}
                        </div>
                    )}
                    {topic.after && <p className="strong">{topic.after}</p>}
                </div>
                <div>
                    {topic.qa.map(([q, ctx, sol], i) => {
                        const uid = `sq-${topic.id}-${i}`;
                        return <QA key={q} uid={uid} open={openId === uid} onToggle={onToggle} q={q} ctx={ctx} sol={sol} />;
                    })}
                    <div className="out"><span>The outcome</span>{topic.outcome}</div>
                </div>
            </div>
        </section>
    );
}

/* ------------------------------- PAGE ------------------------------- */
export default function SavePage() {
    // Single source of truth: opening one item closes whichever was open.
    const [openId, setOpenId] = useState(null);
    const toggle = (uid) => setOpenId((cur) => (cur === uid ? null : uid));

    useEffect(() => {
        const prev = document.title;
        document.title = "SAVE | Buy B2B with confidence";
        return () => { document.title = prev; };
    }, []);

    return (
        <div className="sv">
            <Seo
                title="Buy B2B with confidence – Compare sellers, prices and MOQs | BBM"
                description="Find industrial and wholesale products, compare verified sellers, prices, MOQs and delivery terms, and buy at the right terms on BBM."
                path="/save"
            />
            {/* Hero */}
            <section className="hero">
                <div className="wrap">
                    <div>
                        <h1>Buy B2B <br /> with <br /> <em>confidence</em>.</h1>
                        <p className="lead">Find the right products, compare your options, buy at the right terms, and save more on every purchase.</p>
                        <div className="cr">
                            <Link className="btn" to={BUY_TO}>Start buying</Link>
                            <Link className="btn ghost" to={EXPLORE_TO}>Explore products</Link>
                        </div>
                    </div>
                    <CompareCard />
                </div>
                <div className="wrap">
                    <div className="tri">
                        <div className="o"><b>More choice</b><span>Discover products beyond your existing suppliers.</span></div>
                        <div className="b"><b>Better buying</b><span>Compare products, prices and commercial terms.</span></div>
                        <div className="g"><b>More savings</b><span>Reduce purchase cost, effort and unnecessary buying friction.</span></div>
                    </div>
                </div>
            </section>

            {/* Value belt */}
            <div className="belt">
                <div className="wrap">
                    <div className="o"><em>01</em><b>Find beyond your network</b><span>Discover products and suppliers you may not already know.</span></div>
                    <div className="b"><em>02</em><b>Compare before you buy</b><span>See products, packs, prices, MOQ and fulfilment terms together.</span></div>
                    <div className="g"><em>03</em><b>Save on every purchase</b><span>Better quantities, better prices and better sourcing can improve your buying economics.</span></div>
                </div>
            </div>

            {/* Brand wall */}
            <section className="bw" aria-labelledby="save-brands-h">
                <div className="wrap">
                    <h2 id="save-brands-h">Brands you can buy on BBM.</h2>
                    <p>Real products from brands buyers already know.</p>
                </div>
                <Rail items={ROW_1} />
                <Rail items={ROW_2} reverse />
            </section>

            {/* Intro */}
            <section className="intro">
                <div className="wrap">
                    <h2>Buying a product is easy. Buying it well is not.</h2>
                    <div className="pn">
                        {PAIN.map((x, i) => <span key={x} className={TONES[i % 4]}>{x}</span>)}
                    </div>
                    <p className="cl"><b>BBM Marketplace</b> brings the buying process together, so you can spend less time sourcing and more time running your business.</p>
                </div>
            </section>

            {TOPICS.map((t) => <Topic key={t.id} topic={t} openId={openId} onToggle={toggle} />)}

            {/* Set up once */}
            <section className="once">
                <div className="wrap">
                    <h2>What if buying could be set up once?</h2>
                    <p className="sub">Instead of starting every purchase from a blank screen, keep your buying environment ready.</p>
                    <div className="g8">
                        {SETUP.map(([title, text]) => <div key={title}><b>{title}</b><span>{text}</span></div>)}
                    </div>
                </div>
            </section>

            {/* Final CTA */}
            <section className="cta" id="save-start">
                <div className="wrap">
                    <div className="box">
                        <h2>You decide what to buy. BBM Marketplace helps you buy it better.</h2>
                        <p>Find products. Compare options. Choose suppliers. Buy smarter. Save more.</p>
                        <div className="cr">
                            <Link className="btn" to={BUY_TO}>Start buying</Link>
                            <Link className="btn ghost" to={EXPLORE_TO}>Explore products</Link>
                        </div>
                        <small>More choice. Better decisions. Lower buying effort.</small>
                    </div>
                    <div className="xl">
                        <div><b>Selling instead?</b><span>BBM Marketplace: More buyers. More business. Less selling effort.</span></div>
                        <Link className="btn green sm" to={GROW_TO}>Go to BBM Marketplace</Link>
                    </div>
                </div>
            </section>
        </div>
    );
}