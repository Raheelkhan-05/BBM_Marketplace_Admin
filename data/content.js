// Central place for landing-page copy & sample data.
// Replace the placeholder image URLs with real product photography later.

// export const TAGLINE = "Everyday . Quick Buying . More Selling";

// export const heroContent = {
//   eyebrow: "B2B Marketplace",
//   titleLine1: "Buy",
//   titleAccent1: "Better.",
//   titleLine2: "Sell",
//   titleAccent2: "Faster.",
//   subtitle: "Compare prices from verified suppliers across India.",
// };

export const TAGLINE = "Better Business Everyday";

export const heroContent = {
  eyebrow: "B2B Marketplace",
  titleLine1: "Buy",
  titleAccent1: "Better.",
  titleLine2: "Sell",
  titleAccent2: "Better.",
  subtitle: "Compare prices from verified suppliers across India.",
  bullets: [
    "Compare multiple quotations.",
    "Reduce procurement costs.",
    "Reach new customers.",
  ],
};


export const bannerCards = [
  { id: "compare", icon: "bar-chart", title: "Compare Multiple Quotations", desc: "Buy at competitive prices." },
  { id: "reduce", icon: "wallet", title: "Reduce Procurement Costs", desc: "Save on every purchase." },
  { id: "verified", icon: "building", title: "Verified Business Suppliers", desc: "Buy with confidence." },
  { id: "reorder", icon: "repeat", title: "Easy Repeat Ordering", desc: "Reorder in one click." },
  { id: "industries", icon: "boxes", title: "Buy Across Industries", desc: "Millions of products." },
];

// Stock/sample product photography (Unsplash) standing in for real catalogue shots.
export const showcaseProducts = [
  {
    id: "bearing",
    alt: "Industrial ball bearing",
    src: "./1.avif",
  },
  {
    id: "motor",
    alt: "Electric industrial motor",
    src: "./2.avif",
  },
  {
    id: "oil",
    alt: "Lubricant oil container",
    src: "./3.avif",
  },
  {
    id: "pipes",
    alt: "Steel pipes and fittings",
    src: "./1.avif",
  },
];

export const features = [
  { id: "compare", icon: "tag", title: "Compare Prices Instantly", desc: "Get the best rates from multiple suppliers", bg: "rgba(210, 70, 43, 0.10)", fg: "#d2462b" },
  { id: "verified", icon: "check-shield", title: "Verified Suppliers", desc: "Only trusted & verified businesses", bg: "rgba(5, 113, 132, 0.12)", fg: "#057184" },
  { id: "products", icon: "box", title: "Millions of Products", desc: "From 1000+ categories", bg: "rgba(238, 190, 179, 0.35)", fg: "#d85a41" },
  { id: "quotes", icon: "bolt", title: "Get Quotations in Minutes", desc: "Post RFQ and get quick responses", bg: "rgba(229, 151, 138, 0.20)", fg: "#d2462b" },
];

export const trustBadges = ["100% Secure", "Transparent", "Reliable"];

export const whyBBM = [
  {
    id: "platform",
    heading: "Why choose BBM?",
    hero: "Built for Indian Business.",
    accent: "#057184",
    tint: "rgba(5, 113, 132, 0.08)",
    points: [
      { icon: "flag", text: "Built for Indian businesses." },
      { icon: "check-shield", text: "Verified marketplace." },
      { icon: "users", text: "Buyers and sellers on one platform." },
      { icon: "lock", text: "Secure business connections." },
      { icon: "factory", text: "Industrial product focus." },
      { icon: "eye", text: "Transparent procurement." },
      { icon: "trending-up", text: "Increased business opportunities." },
      { icon: "wallet", text: "Designed to reduce procurement costs." },
    ],
  },
  {
    id: "buy",
    heading: "Why Buy from BBM",
    hero: "Buy Better. Save More.",
    accent: "#d2462b",
    tint: "rgba(210, 70, 43, 0.08)",
    points: [
      { icon: "scale", text: "Compare quotations from multiple suppliers." },
      { icon: "wallet", text: "Reduce procurement costs." },
      { icon: "check-shield", text: "Discover verified suppliers." },
      { icon: "repeat", text: "Easy repeat ordering." },
      { icon: "boxes", text: "Access products across industries." },
      { icon: "bolt", text: "Faster sourcing and RFQs." },
      { icon: "bar-chart", text: "Transparent supplier comparison." },
      { icon: "user-circle", text: "One account for all purchases." },
    ],
  },
  {
    id: "sell",
    heading: "Why Sell on BBM",
    hero: "Sell Better. Grow Faster.",
    accent: "#057184",
    tint: "rgba(5, 113, 132, 0.08)",
    points: [
      { icon: "map", text: "Reach new customers across India." },
      { icon: "check-shield", text: "100% assured payment on delivery." },
      { icon: "store", text: "Build your digital storefront." },
      { icon: "link", text: "Share one store link with customers." },
      { icon: "clock", text: "Sell 24×7." },
      { icon: "trending-down", text: "Reduce customer acquisition cost." },
      { icon: "layers", text: "Showcase unlimited products." },
      { icon: "tags", text: "Multiple pricing levels — retail to bulk." },
    ],
  },
];