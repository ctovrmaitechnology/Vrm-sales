const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { startCampaign, unsubscribe, startManualFollowUpCheck } = require('../controllers/emailController');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

router.post('/send-emails', apiLimiter, startCampaign);
router.all('/unsubscribe', unsubscribe);
router.post('/follow-ups/check', startManualFollowUpCheck);

module.exports = router;
