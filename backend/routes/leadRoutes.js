const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getAllLeads, getWhatsAppLeads, getEmailLeads, updateStatus, deleteLead, uploadLeads, uploadSingleLead } = require('../controllers/leadController');

const uploadDir = path.join(__dirname, '../uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

router.get('/ingestion/all', getAllLeads);
router.get('/ingestion/whatsapp', getWhatsAppLeads);
router.get('/ingestion/email', getEmailLeads);
router.patch('/lead/:email/status', updateStatus);
router.delete('/delete', deleteLead);
router.post('/upload-leads', upload.single('file'), uploadLeads);
router.post('/upload-lead-json', uploadSingleLead);

module.exports = router;
