const domainMap = require('../domainMap.json');
const { resolveProduct } = require('../productCampaigns');
const { BACKEND_BASE_URL } = require('./config');

function findProductColumn(keys) {
  return keys.find(k => {
    const normalized = String(k || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    return ['product', 'product_type', 'product_name'].includes(normalized);
  });
}

function normalizeLeadProduct(product) {
  return product ? resolveProduct(product) : resolveProduct();
}

function isWhatsAppEnabled() {
  return process.env.ENABLE_WHATSAPP === "true";
}

function logWhatsAppDisabled() {
  console.log("WhatsApp module disabled via ENABLE_WHATSAPP flag");
}

function isTemporaryTunnelUrl(url) {
  return /ngrok(?:-free)?\.|trycloudflare\.com/i.test(String(url || ""));
}

function hasPublicBackendUrl() {
  // DEV TESTING ONLY: Bypassing temporary URL restriction
  // to allow tracking testing on localhost/ngrok
  return (
    process.env.ENABLE_CLICK_TRACKING_LINKS === "true" &&
    Boolean(BACKEND_BASE_URL)
  );
}

function getCookieValue(req, name) {
  const cookies = String(req.headers.cookie || "")
    .split(";")
    .map(cookie => cookie.trim());

  const match =
    cookies.find(cookie => cookie.startsWith(`${name}=`));

  return match
    ? decodeURIComponent(match.slice(name.length + 1))
    : null;
}

function getFirstName(name) {
  if (!name) return "there";

  const cleanedName = String(name)
    .replace(/[,|()/\\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanedName) return "there";

  return cleanedName.split(" ")[0];
}

function detectIndustry(email) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return "generic";

  if (domainMap[domain]) return domainMap[domain];

  const itKeywords = [
    "tech", "software", "systems", "cloud", "data", "consulting",
    "infosys", "accenture", "cognizant", "capgemini", "zoho", "oracle",
    "ibm", "deloitte", "wipro", "hcl", "tcs", "digital", "solutions",
    "cyber", "enterprise", "network", "analytics", "innovations", "labs"
  ];

  const recruitmentKeywords = [
    "staff", "recruit", "talent", "hr", "hire", "workforce", "placement", "randstad"
  ];

  const bpoKeywords = [
    "bpo", "support", "customer", "service", "outsourcing", "concentrix"
  ];

  if (itKeywords.some(kw => domain.includes(kw))) return "it_services";
  if (recruitmentKeywords.some(kw => domain.includes(kw))) return "recruitment";
  if (bpoKeywords.some(kw => domain.includes(kw))) return "bpo";

  return "generic";
}

const delay = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function randomDelayMs(minMinutes, maxMinutes) {
  const minMs = minMinutes * 60 * 1000;
  const maxMs = maxMinutes * 60 * 1000;

  return Math.floor(
    Math.random() *
    (maxMs - minMs + 1) +
    minMs
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = {
  findProductColumn,
  normalizeLeadProduct,
  isWhatsAppEnabled,
  logWhatsAppDisabled,
  isTemporaryTunnelUrl,
  hasPublicBackendUrl,
  getCookieValue,
  getFirstName,
  detectIndustry,
  delay,
  randomDelayMs,
  escapeHtml
};
