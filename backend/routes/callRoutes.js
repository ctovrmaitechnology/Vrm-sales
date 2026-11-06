const express = require('express');
const router = express.Router();
const {
  getCallableContacts,
  startCallCampaign,
  getCallCampaignStatus,
  cancelCallCampaign,
  pauseCallCampaign,
  resumeCallCampaign,
  stopCallCampaign,
  startSingleCall,
  handleVapiWebhook,
  syncCallStatus,
  getCallHistory,
  getTransferSettings,
  saveTransferSettings,
  applyTransferToVapi,
  removeTransferFromVapi,
} = require('../controllers/callController');

router.get('/contacts', getCallableContacts);
router.post('/campaign/start', startCallCampaign);
router.get('/campaign/status', getCallCampaignStatus);
router.post('/campaign/cancel', cancelCallCampaign);
router.post('/campaign/pause', pauseCallCampaign);
router.post('/campaign/resume', resumeCallCampaign);
router.post('/campaign/stop', stopCallCampaign);
router.post('/single', startSingleCall);
router.get('/history', getCallHistory);
router.get('/sync/:vapiCallId', syncCallStatus);
router.post('/webhook', handleVapiWebhook);

// Transfer settings
router.get('/transfer/settings', getTransferSettings);
router.post('/transfer/settings', saveTransferSettings);
router.post('/transfer/apply', applyTransferToVapi);
router.post('/transfer/remove', removeTransferFromVapi);

module.exports = router;