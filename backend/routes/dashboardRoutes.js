const express = require('express');
const router = express.Router();
const {
  getDashboard,
  getWhatsAppDashboard,
  getOverviewStats,
  exportWorkload,
  searchLeadsAndCompanies
} = require('../controllers/dashboardController');

router.get('/dashboard', getDashboard);
router.get('/whatsapp/dashboard', getWhatsAppDashboard);
router.get('/overview-stats', getOverviewStats);
router.get('/overview-stats/workload-export', exportWorkload);
router.get('/search', searchLeadsAndCompanies);

module.exports = router;
