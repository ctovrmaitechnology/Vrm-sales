const express = require('express');
const router = express.Router();
const { getWhatsAppInsights } = require('../controllers/insightsController');

router.get('/whatsapp', getWhatsAppInsights);

module.exports = router;
