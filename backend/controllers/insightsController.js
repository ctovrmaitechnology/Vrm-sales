const {
  getPhoneNumberHealth,
  getAccountInfo,
  getAccountBalance,
  getMessageTemplates,
  getMessageSpend,
  getMessageVolume,
  getTemplateAnalytics,
} = require('../services/insightsService');

// Meta Graph API is slow (several calls, ~5-9s). Cache per date range for 5 minutes.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // key -> { at, payload }
const inflight = new Map(); // key -> promise (share one load between simultaneous visitors)

async function load({ startDate, endDate }) {
  const accountPromise = getAccountInfo();
  const [phoneHealth, account, balance, messageTemplates, volume, templateStats, spend] = await Promise.all([
    getPhoneNumberHealth(),
    accountPromise,
    getAccountBalance(),
    getMessageTemplates(),
    getMessageVolume({ startDate, endDate }),
    getTemplateAnalytics({ startDate, endDate }),
    accountPromise.then((a) => getMessageSpend({ startDate, endDate, currency: a?.currency })),
  ]);
  return {
    phoneNumber: phoneHealth,
    account,
    balance,
    templates: messageTemplates,
    volume,
    spend,
    stats: templateStats,
    generatedAt: new Date().toISOString(),
  };
}

async function getWhatsAppInsights(req, res) {
  const { startDate, endDate, fresh } = req.query;
  const key = `${startDate || ''}|${endDate || ''}`;
  const hit = cache.get(key);

  if (!fresh && hit && Date.now() - hit.at < TTL_MS) {
    return res.json(hit.payload);
  }

  try {
    if (!inflight.has(key)) {
      inflight.set(key, load({ startDate, endDate }).finally(() => inflight.delete(key)));
    }
    const payload = await inflight.get(key);
    cache.set(key, { at: Date.now(), payload });
    return res.json(payload);
  } catch (error) {
    console.error('Failed to load WhatsApp insights:', error.message);
    if (hit) return res.json(hit.payload); // serve last good data instead of an error
    return res.status(500).json({ error: 'Failed to load WhatsApp insights.' });
  }
}

module.exports = { getWhatsAppInsights };