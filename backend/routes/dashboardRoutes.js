const express = require('express');
const { requireRole } = require('../middleware/auth');
const adminOnly = requireRole('admin');
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
router.get('/overview-stats/workload-export', adminOnly,exportWorkload);
router.get('/search', searchLeadsAndCompanies);

module.exports = router;
