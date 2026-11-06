const express = require('express');
const router = express.Router();
const { trackDemo, trackPoster, trackBookDemo } = require('../controllers/trackingController');

router.get('/demo', trackDemo);
router.get('/poster', trackPoster);
router.get('/book-demo', trackBookDemo);

module.exports = router;
