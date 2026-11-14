const express = require('express');
const { requireRole } = require('../middleware/auth');
const adminOnly = requireRole('admin');
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
router.post('/campaign/start',adminOnly, startCallCampaign);
router.get('/campaign/status', adminOnly,getCallCampaignStatus);
router.post('/campaign/cancel', adminOnly, cancelCallCampaign);
router.post('/campaign/pause', adminOnly, pauseCallCampaign);
router.post('/campaign/resume', adminOnly, resumeCallCampaign);
router.post('/campaign/stop', adminOnly, stopCallCampaign);
router.post('/single', startSingleCall);
router.get('/history', getCallHistory);
router.get('/sync/:vapiCallId', syncCallStatus);
router.post('/webhook', handleVapiWebhook);

// Transfer settings
router.get('/transfer/settings',adminOnly, getTransferSettings);
router.post('/transfer/settings', adminOnly, saveTransferSettings);
router.post('/transfer/apply', adminOnly, applyTransferToVapi);
router.post('/transfer/remove', adminOnly, removeTransferFromVapi);

module.exports = router;