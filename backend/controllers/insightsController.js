const {
  getPhoneNumberHealth,
  getAccountInfo,
  getAccountBalance,
  getMessageTemplates,
  getMessageSpend,
  getMessageVolume,
  getTemplateAnalytics,
} = require('../services/insightsService');

async function getWhatsAppInsights(req, res) {
  const { startDate, endDate } = req.query;

  try {
    const [phoneHealth, account, balance, messageTemplates, volume, templateStats] = await Promise.all([
      getPhoneNumberHealth(),
      getAccountInfo(),
      getAccountBalance(),
      getMessageTemplates(),
      getMessageVolume({ startDate, endDate }),
      getTemplateAnalytics({ startDate, endDate }),
    ]);

    const spend = await getMessageSpend({ startDate, endDate, currency: account?.currency });

    res.json({
      phoneNumber: phoneHealth,
      account,
      balance,
      templates: messageTemplates,
      volume,
      spend,
      stats: templateStats,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to load WhatsApp insights:', error.message);
    res.status(500).json({ error: 'Failed to load WhatsApp insights.' });
  }
}

module.exports = { getWhatsAppInsights };
