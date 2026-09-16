// export const BUSINESS_TYPES = ["Manufacturer", "Distributor", "Wholesaler", "Retailer", "Exporter", "Importer", "Service Provider"];
export const BUSINESS_TYPES = ["Manufacturer", "Distributor", "Wholesaler", "Retailer", "Exporter", "Importer", "Service Provider"];


export const EMPLOYEE_RANGES = ["1-10", "11-50", "51-200", "201-500", "500+"];

// export const STEPS = [
//   { key: "basics", title: "Business Basics" },
//   { key: "contact", title: "Contact & WhatsApp" },
//   { key: "address", title: "Address" },
//   { key: "credentials", title: "Business Credentials" },
//   { key: "operations", title: "Operations & Availability" },
//   { key: "identity", title: "Shop Identity" },
//   { key: "review", title: "Review & Submit" },
// ];

// export const STEPS = [
//   { key: "basics", title: "Business Basics" },
//   { key: "contact", title: "Contact & WhatsApp" },
//   { key: "address", title: "Address" },
//   { key: "operations", title: "Operations & Availability" },
//   { key: "identity", title: "Shop Identity" },
//   { key: "review", title: "Review & Submit" },
// ];

// components/seller/fieldConfigs.js
export const STEPS = [
  { key: "operations", title: "Order Timing" },
  { key: "bank", title: "Bank Details" },   // NEW — see section 4
  { key: "identity", title: "Shop Logo" },
  { key: "review", title: "Review & Submit" },
];


// GSTN's fixed "nature of business" vocabulary, mapped to our business_type
// options. First match wins, "Others" is skipped. Always left editable —
// this is a best-effort guess, not authoritative.
const NATURE_TO_TYPE = [
  [/factory|manufactur/i, "Manufacturer"],
  [/export/i, "Exporter"],
  [/import/i, "Importer"],
  [/wholesale/i, "Wholesaler"],
  [/retail/i, "Retailer"],
  [/service/i, "Service Provider"],
];

export function guessBusinessType(natureOfBusiness) {
  if (!Array.isArray(natureOfBusiness)) return "";
  for (const [pattern, type] of NATURE_TO_TYPE) {
    if (natureOfBusiness.some((n) => pattern.test(n))) return type;
  }
  return "";
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// fieldConfigs.js
export const COUNTRIES = [
  { name: "United States", aliases: ["usa", "us", "united states of america", "america"] },
  { name: "United Kingdom", aliases: ["uk", "britain", "great britain", "england"] },
  { name: "United Arab Emirates", aliases: ["uae", "dubai", "emirates"] },
  { name: "South Korea", aliases: ["korea", "republic of korea"] },
  { name: "North Korea", aliases: ["dprk"] },
  { name: "Russia", aliases: ["russian federation"] },
  { name: "Czech Republic", aliases: ["czechia"] },
  { name: "Ivory Coast", aliases: ["cote d'ivoire", "cote divoire"] },
  { name: "Vietnam", aliases: ["viet nam"] },
  { name: "Laos", aliases: ["lao pdr"] },
  { name: "Syria", aliases: ["syrian arab republic"] },
  { name: "Iran", aliases: ["islamic republic of iran"] },
  { name: "Bolivia", aliases: [] },
  { name: "Tanzania", aliases: ["united republic of tanzania"] },
  { name: "Moldova", aliases: ["republic of moldova"] },
  { name: "North Macedonia", aliases: ["macedonia"] },
  { name: "Myanmar", aliases: ["burma"] },
  { name: "Hong Kong", aliases: ["hk"] },
  { name: "Macau", aliases: ["macao"] },
  { name: "Congo", aliases: ["republic of the congo", "drc", "congo-kinshasa", "congo-brazzaville"] },
  { name: "India", aliases: ["bharat"] },
  { name: "China", aliases: ["prc", "peoples republic of china"] },
  { name: "Netherlands", aliases: ["holland"] },
  { name: "Saudi Arabia", aliases: ["ksa"] },
  // ... plus every other country from the earlier list with aliases: []
  ...[
    "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan",
    "Bahamas", "Bahrain", "Bangladesh", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bosnia and Herzegovina",
    "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon", "Canada", "Chad", "Chile",
    "Colombia", "Comoros", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Denmark", "Djibouti",
    "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Estonia", "Ethiopia", "Fiji", "Finland", "France", "Gabon",
    "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Guatemala", "Guinea", "Haiti", "Honduras", "Hungary",
    "Iceland", "Indonesia", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan",
    "Kazakhstan", "Kenya", "Kuwait", "Kyrgyzstan", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Lithuania",
    "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Mauritania", "Mauritius", "Mexico",
    "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Namibia", "Nepal",
    "New Zealand", "Nicaragua", "Niger", "Nigeria", "Norway", "Oman", "Pakistan", "Panama",
    "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Rwanda",
    "Senegal", "Serbia", "Singapore", "Slovakia", "Slovenia", "Somalia", "South Africa",
    "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Taiwan", "Tajikistan",
    "Thailand", "Togo", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Uganda", "Ukraine",
    "Uruguay", "Uzbekistan", "Venezuela", "Yemen", "Zambia", "Zimbabwe",
  ].map((name) => ({ name, aliases: [] })),
];

export function searchCountries(query, exclude = []) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return COUNTRIES
    .filter((c) => !exclude.includes(c.name))
    .filter((c) => c.name.toLowerCase().includes(q) || c.aliases.some((a) => a.includes(q)))
    .sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q))
    .slice(0, 8)
    .map((c) => c.name);
}