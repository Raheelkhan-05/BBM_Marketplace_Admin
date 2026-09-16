//src/data/mockProducts.js

// Generic, non-company-specific catalogue shape. Replace `fetchSearchResults`
// with a real `fetch('/api/search?q=...')` later — the shape returned here
// is exactly what the UI expects, so no component changes will be needed.

const SAMPLE_TAGS = [
  { icon: "brand", label: "MNC Brand" },
  { icon: "original", label: "100% Original" },
  { icon: "delivery", label: "Fast Delivery" },
];

function randBetween(min, max) {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

// Generates a trend that actually *moves toward* the current price,
// instead of pure random noise — so the sparkline tells a story
// (e.g. price was higher a week ago, settling down to today's value).
function makeTrend(current, points = TREND_WINDOW) {
  const volatility = current * 0.05;
  // Start the walk 8-18% away from current, in a random direction,
  // then drift steadily toward `current` by the last point.
  const startOffset = current * randBetween(0.08, 0.18) * (Math.random() > 0.5 ? 1 : -1);
  const start = Math.max(current * 0.5, current + startOffset);

  const arr = [];
  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1); // 0 -> 1
    const eased = 1 - Math.pow(1 - progress, 2); // ease-out toward target
    const base = start + (current - start) * eased;
    const noise = (Math.random() - 0.5) * volatility * (1 - progress * 0.6);
    arr.push(Number(Math.max(1, base + noise).toFixed(2)));
  }
  // Force the last point to exactly match the displayed current price.
  arr[arr.length - 1] = Number(current.toFixed(2));
  return arr;
}

function makeProduct(id, seed) {
  const lowest = randBetween(seed * 0.8, seed * 0.9);
  const average = randBetween(seed * 0.95, seed * 1.05);
  const highest = randBetween(seed * 1.1, seed * 1.25);

  return {
    id,
    badge: "Popular Choice",
    name: seed.name,
    subtitle: seed.subtitle,
    image: seed.image || "./1.avif",
    tags: SAMPLE_TAGS,
    packSizes: seed.packSizes || ["1 Ltr", "5 Ltr", "15 Ltr", "18 Ltr"],
    pricing: {
      lowest,
      average,
      highest,
      suppliersQuoting: Math.floor(randBetween(30, 60)),
      trend: {
        lowest: makeTrend(lowest),
        average: makeTrend(average),
        highest: makeTrend(highest),
      },
      updatedAt: Date.now(),
    },
    moq: seed.moq || "20 Ltrs",
    deliveryDays: seed.deliveryDays || "2 Days",
    paymentTerms: seed.paymentTerms || "Flexible",
  };
}


function deriveFromSeed(seed) {
  const lowest = randBetween(seed * 0.8, seed * 0.9);
  const average = randBetween(seed * 0.95, seed * 1.05);
  const highest = randBetween(seed * 1.1, seed * 1.25);
  return {
    lowest,
    average,
    highest,
    suppliersQuoting: Math.floor(randBetween(30, 60)),
    trend: {
      lowest: makeTrend(lowest),
      average: makeTrend(average),
      highest: makeTrend(highest),
    },
    updatedAt: Date.now(),
  };
}


// Small, deliberately limited catalogue — keeps the demo believable instead
// of pretending to have 10,00,000+ real products. Each entry has `keywords`
// so a query like "engine oil" or "15w40" can match the same product.
const CATALOGUE = [
  {
    name: "Heavy Duty Engine Oil",
    subtitle: "API CI-4 | Heavy Duty Diesel Engine Oil",
    image: "./1.avif",
    keywords: ["engine oil", "15w40", "diesel oil", "lubricant", "rimula"],
  },
  {
    name: "Industrial Gear Oil",
    subtitle: "ISO VG 220 | High Load Gear Protection",
    image: "./2.avif",
    keywords: ["gear oil", "industrial oil", "vg220", "gearbox oil"],
  },
  {
    name: "Multi-Purpose Grease",
    subtitle: "Lithium Complex | High Temperature Grease",
    image: "./3.avif",
    keywords: ["grease", "lithium grease", "bearing grease"],
  },
  {
    name: "Steel Pipes",
    subtitle: "ASTM A106 | Seamless Carbon Steel Pipes",
    image: "./p3.avif",
    keywords: ["steel pipes", "pipes", "pipe fittings", "steel pipe"],
  },
  {
    name: "Industrial Ball Bearings",
    subtitle: "Chrome Steel | High Precision Bearings",
    image: "./p1.avif",
    keywords: ["bearings", "ball bearing", "bearing"],
  },
  {
    name: "Electric Industrial Motor",
    subtitle: "3-Phase | High Torque Induction Motor",
    image: "./p2.avif",
    keywords: ["motor", "motors", "induction motor", "electric motor"],
  },
];

// Case-insensitive match against product name or keyword list.
function findCatalogueMatch(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return CATALOGUE.find(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      item.keywords.some((k) => k.includes(q) || q.includes(k))
  );
}

// Builds a single product result from a catalogue entry. Swap this whole
// function for a real `fetch('/api/search?q=...')` later — keep the same
// returned shape (products: [] or products: [one item]) so
// SearchResultsPage doesn't need to change.
export function fetchSearchResults(query) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const label = query.trim();
      const match = findCatalogueMatch(label);

      if (!match) {
        resolve({ query: label, totalCount: 0, supplierCount: 0, products: [] });
        return;
      }

      const seedBase = 150 + (hashString(match.name) % 120);
      const product = makeProduct(`${match.name}-result`, match);
      const seeded = { ...product, pricing: { ...product.pricing, ...deriveFromSeed(seedBase) } };

      resolve({
        query: label,
        totalCount: 125,
        supplierCount: seeded.pricing.suppliersQuoting,
        products: [seeded],
      });
    }, 350);
  });
}

// Simple deterministic hash so the same product gets consistent-looking
// placeholder pricing across reloads.
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}


const TREND_WINDOW = 6;

// Produces one plausible next value near `lastValue`, gently pulled toward
// `target` (the current displayed price) so the line trends realistically
// instead of wandering randomly.
function nextTrendValue(lastValue, target) {
  const volatility = target * 0.035;
  const pull = (target - lastValue) * 0.25;
  const next = lastValue + pull + (Math.random() - 0.5) * volatility;
  return Number(Math.max(1, next).toFixed(2));
}

// Sliding window: drop the oldest point, append the new one, keep length fixed.
function pushWindow(arr, value, size = TREND_WINDOW) {
  const next = [...arr, value];
  return next.length > size ? next.slice(next.length - size) : next;
}

// Simulates a live feed by pushing ONE new point onto each existing trend
// window (sliding it), rather than regenerating the whole series — this is
// what makes the sparkline visually "scroll" instead of resetting.
// Swap this for a websocket/poll handler later; same output shape.
export function jitterProducts(products) {
  return products.map((p) => {
    const newLowest = nextTrendValue(p.pricing.trend.lowest.at(-1), p.pricing.lowest);
    const newAverage = nextTrendValue(p.pricing.trend.average.at(-1), p.pricing.average);
    const newHighest = nextTrendValue(p.pricing.trend.highest.at(-1), p.pricing.highest);

    return {
      ...p,
      pricing: {
        ...p.pricing,
        lowest: newLowest,
        average: newAverage,
        highest: newHighest,
        suppliersQuoting: Math.max(20, p.pricing.suppliersQuoting + (Math.random() > 0.5 ? 1 : -1)),
        trend: {
          lowest: pushWindow(p.pricing.trend.lowest, newLowest),
          average: pushWindow(p.pricing.trend.average, newAverage),
          highest: pushWindow(p.pricing.trend.highest, newHighest),
        },
        updatedAt: Date.now(),
      },
    };
  });
}



