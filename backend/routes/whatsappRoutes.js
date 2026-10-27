const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { startWhatsAppCampaign, getWhatsAppCampaignStatus, recordWhatsAppWebhookResult } = require('../controllers/whatsappController');
const { updateWhatsAppLeadStatus } = require('../unifiedDb');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20
});

router.post('/send-campaign', apiLimiter, startWhatsAppCampaign);
router.get('/send-campaign/status', getWhatsAppCampaignStatus);

// ── Meta Webhook Verification (GET) ──────────────────────────────────────────
router.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'vrm_webhook_verify_123';
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WhatsApp webhook verified ✅');
    return res.status(200).send(challenge);
  }
  console.warn('WhatsApp webhook verification failed ❌');
  return res.sendStatus(403);
});

// ── Meta Webhook Incoming Events (POST) ──────────────────────────────────────
router.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log('WhatsApp webhook event received:', JSON.stringify(body, null, 2));

  // Acknowledge immediately so Meta doesn't retry
  res.sendStatus(200);

  try {
    if (body.object === 'whatsapp_business_account' && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        if (!Array.isArray(entry.changes)) continue;
        for (const change of entry.changes) {
          const value = change.value;
          if (!value) continue;

          // Process status updates (sent, read, delivered, etc.)
          if (Array.isArray(value.statuses)) {
            for (const statusObj of value.statuses) {
              const recipientId = statusObj.recipient_id || statusObj.recipient_user_id;
              const waStatus = statusObj.status;
              console.log(`[WA Webhook] Status update for ${recipientId}: ${waStatus}`);

              if (!recipientId) continue;

              if (waStatus === 'sent') {
                await updateWhatsAppLeadStatus(recipientId, 'sent', 'sent', {
                  whatsappStatus: 'sent',
                  read: false
                });
              } else if (waStatus === 'read') {
                await updateWhatsAppLeadStatus(recipientId, 'sent', 'read', {
                  whatsappStatus: 'sent',
                  read: true
                });
              } else if (waStatus === 'delivered') {
                await updateWhatsAppLeadStatus(recipientId, 'sent', 'delivered', {
                  whatsappStatus: 'sent'
                });
              } else if (waStatus === 'failed') {
                const errorObj = statusObj.errors?.[0];
                const failReason = errorObj?.title || errorObj?.message || errorObj?.error_data?.details || 'Message undeliverable';
                const errorCode = errorObj?.code;

                await updateWhatsAppLeadStatus(recipientId, 'failed', 'failed', {
                  whatsappStatus: 'failed',
                  reason: failReason,
                  errorCode,
                  metadata: {
                    reason: failReason,
                    code: errorCode,
                    details: errorObj?.error_data?.details || null
                  }
                });

                recordWhatsAppWebhookResult(recipientId, 'failed', { reason: failReason, code: errorCode });
              }
            }
          }

          // Process incoming messages (if any)
          if (Array.isArray(value.messages)) {
            value.messages.forEach(msg => {
              console.log(`📩 Message from ${msg.from}: ${msg.text?.body || '[non-text]'}`);
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('[WA Webhook Error] Failed to process webhook payload:', err.message);
  }
});

module.exports = router;
