const express = require('express');
const router = express.Router();
const { healthCheck, resetSystem, submitContact } = require('../controllers/systemController');

router.get('/health', healthCheck);
router.post('/reset', resetSystem);
router.post('/contact', submitContact);

module.exports = router;
