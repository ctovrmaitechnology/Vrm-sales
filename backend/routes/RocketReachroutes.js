const express = require('express');
const router = express.Router();
const { parsePrompt, searchPeople, revealContacts, exportExcel } = require('../controllers/rocketReachController');

router.post('/parse', parsePrompt);
router.post('/search', searchPeople);
router.post('/reveal', revealContacts);
router.post('/export', exportExcel);

module.exports = router;