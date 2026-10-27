const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getAllLeads, getManualLeadsController, createManualLeadController, updateManualLeadController, deleteManualLeadController, getWhatsAppLeads, getEmailLeads, updateStatus, deleteLead, uploadLeads, uploadSingleLead, sendLeadTemplate, importManualLeads } = require('../controllers/leadController');

const uploadDir = path.join(__dirname, '../uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});
const handleImportUpload = (req, res, next) => {
  importUpload.single('file')(req, res, (error) => {
    if (!error) return next();
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({
      error: tooLarge
        ? 'The spreadsheet is larger than the 25 MB upload limit.'
        : error.message || 'The spreadsheet could not be uploaded.',
    });
  });
};

router.get('/ingestion/all', getAllLeads);
router.get('/manual-leads/template', sendLeadTemplate);
router.post('/manual-leads/import', handleImportUpload, importManualLeads);
router.get('/manual-leads', getManualLeadsController);
router.post('/manual-leads', createManualLeadController);
router.put('/manual-leads/:id', updateManualLeadController);
router.delete('/manual-leads/:id', deleteManualLeadController);
router.get('/ingestion/whatsapp', getWhatsAppLeads);
router.get('/ingestion/email', getEmailLeads);
router.patch('/lead/:email/status', updateStatus);
router.delete('/delete', deleteLead);
router.post('/upload-leads', upload.single('file'), uploadLeads);
router.post('/upload-lead-json', uploadSingleLead);

module.exports = router;
