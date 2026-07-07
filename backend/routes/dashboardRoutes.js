const express = require('express');
const router = express.Router();
const { getDashboard, getWhatsAppDashboard } = require('../controllers/dashboardController');

router.get('/dashboard', getDashboard);
router.get('/whatsapp/dashboard', getWhatsAppDashboard);

module.exports = router;
