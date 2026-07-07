const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getAllLeads, updateStatus, deleteLead, uploadLeads } = require('../controllers/leadController');

const uploadDir = path.join(__dirname, '../uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

router.get('/ingestion/all', getAllLeads);
router.patch('/lead/:email/status', updateStatus);
router.delete('/lead/:email', deleteLead);
router.post('/upload-leads', upload.single('file'), uploadLeads);

module.exports = router;
