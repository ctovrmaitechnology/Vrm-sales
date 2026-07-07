const { getUnifiedEmailDashboard, getUnifiedWhatsAppDashboard } = require('../unifiedDb');

async function getDashboard(req, res) {
  try {
    res.json(await getUnifiedEmailDashboard());
  } catch (error) {
    res.status(500).json({
      error: "Dashboard fetch failed"
    });
  }
}

async function getWhatsAppDashboard(req, res) {
  try {
    res.json(await getUnifiedWhatsAppDashboard());
  } catch (error) {
    res.status(500).json({
      error: "WhatsApp Dashboard fetch failed"
    });
  }
}

module.exports = {
  getDashboard,
  getWhatsAppDashboard
};
