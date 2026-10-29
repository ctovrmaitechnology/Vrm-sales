const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { startWhatsAppCampaign, getWhatsAppCampaignStatus, recordWhatsAppWebhookResult } = require('../controllers/whatsappController');
const { decodeLeadRef } = require('../services/trackingService');
const { sendWhatsAppText, sendWhatsAppCtaUrl } = require('../services/whatsappService');
const {
  updateWhatsAppLeadStatus,
  recordWhatsAppChat,
  recordWhatsAppButtonEvent,
  recordWhatsAppMessageStatus,
  getWhatsAppConversation,
  recordWhatsAppOutboundChat,
} = require('../unifiedDb');

const WHATSAPP_TEMPLATE_VIDEO_URLS = {
  workflow_final: 'https://drive.google.com/file/d/1aCEqwMIpUgY1NXAoTQqCbJIwqPutku3f/view?usp=sharing',
  benchtodeploy_final: 'https://drive.google.com/file/d/1xtNqQX7qHogouW1wLUAz1dLt2o7N-KQQ/view?usp=sharing',
};

const WHATSAPP_BUTTON_DESTINATIONS = {
  video: {
    action: 'video_clicked',
    name: 'Demo Video',
    displayText: 'Watch Demo Video',
    body: 'Tap below to watch our demo video.',
  },
  demo: {
    action: 'demo_clicked',
    name: 'Book Demo',
    url: 'https://www.vrmaitechnology.com/contactus#send-message',
    displayText: 'Book Demo',
    body: 'Tap below to book a demo.',
  },
};

function getWhatsAppVideoDestination(template) {
  const templateName = String(template || '').trim().toLowerCase();
  const destination = WHATSAPP_TEMPLATE_VIDEO_URLS[templateName];
  if (!destination) {
    throw new Error(`No demo-video destination is configured for WhatsApp template '${templateName || 'unknown'}'.`);
  }
  return destination;
}

function getWhatsAppButtonReply(message) {
  const reply = message.interactive?.button_reply;
  const buttonText = String(reply?.title || message.button?.text || '').trim().toLowerCase();
  const buttonId = String(reply?.id || message.button?.payload || '').trim().toLowerCase();
  const values = [buttonText, buttonId].map(value => value.replace(/[^a-z0-9]+/g, ''));

  if (values.includes('demovideo') || values.includes('videoclicked')) {
    return WHATSAPP_BUTTON_DESTINATIONS.video;
  }
  if (values.includes('bookdemo') || values.includes('democlicked')) {
    return WHATSAPP_BUTTON_DESTINATIONS.demo;
  }
  return null;
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20
});

router.post('/send-campaign', apiLimiter, startWhatsAppCampaign);
router.get('/send-campaign/status', getWhatsAppCampaignStatus);

router.get('/conversation/:phone', async (req, res) => {
  try {
    const history = await getWhatsAppConversation(req.params.phone);
    return res.json(history);
  } catch (error) {
    console.error('[WA Conversation] Failed to load history:', error.message);
    return res.status(500).json({ error: 'Failed to load WhatsApp conversation.' });
  }
});

router.post('/conversation/:phone/messages', async (req, res) => {
  const text = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!text) return res.status(400).json({ error: 'Enter a message before sending.' });
  if (text.length > 4096) return res.status(400).json({ error: 'WhatsApp messages must be 4096 characters or fewer.' });

  try {
    const result = await sendWhatsAppText(req.params.phone, text);
    if (result?.skipped) {
      return res.status(503).json({ error: 'WhatsApp messaging is disabled on the server.' });
    }

    const messageId = result?.messages?.[0]?.id || null;
    await recordWhatsAppOutboundChat(req.params.phone, text, messageId);
    return res.status(201).json({ success: true, messageId });
  } catch (error) {
    const metaError = error.response?.data?.error;
    console.error('[WA Conversation] Failed to send message:', metaError || error.message);
    return res.status(502).json({
      error: metaError?.message || error.message || 'WhatsApp could not send this message.',
    });
  }
});

router.get('/button-click', async (req, res) => {
  const kind = String(req.query.kind || '').toLowerCase();
  const baseButton = WHATSAPP_BUTTON_DESTINATIONS[kind];
  let button = baseButton;
  if (kind === 'video' && baseButton) {
    try {
      button = {
        ...baseButton,
        url: getWhatsAppVideoDestination(req.query.template),
      };
    } catch (error) {
      console.error('[WA Button] Invalid video destination:', error.message);
      return res.status(500).send('WhatsApp video destination is not configured correctly.');
    }
  }
  if (!button) return res.sendStatus(400);

  const encodedRef = String(req.query.id || '');
  if (encodedRef) {
    try {
      const phone = decodeLeadRef(encodedRef);
      if (!phone || phone === 'lead') throw new Error('Invalid WhatsApp contact reference.');

      const updated = await updateWhatsAppLeadStatus(phone, 'clicked', button.action, {
        whatsappStatus: 'clicked',
        clicked: true,
        skipStatusHistory: true,
      });
      if (!updated) console.error(`[WA Button] Could not record ${button.name} click for contact.`);
      await recordWhatsAppButtonEvent(phone, {
        name: button.name,
        url: button.url,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`[WA Button] Failed to record ${button.name} click:`, error.message);
    }
  } else {
    console.warn(`[WA Button] ${button.name} opened without a contact reference.`);
  }

  return res.redirect(302, button.url);
});

// ── Meta Webhook Verification (GET) ──────────────────────────────────────────
router.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'vrm_webhook_verify_123';
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (!mode && !token && !challenge) {
    return res.status(200).send('WhatsApp webhook endpoint is reachable.');
  }

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
  console.log(
    `[WA Webhook] POST received: object=${body?.object || 'unknown'}, entries=${Array.isArray(body?.entry) ? body.entry.length : 0}`
  );

  // Acknowledge immediately so Meta doesn't retry
  res.sendStatus(200);

  try {
    if (body.object === 'whatsapp_business_account' && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        if (!Array.isArray(entry.changes)) continue;
        for (const change of entry.changes) {
          const value = change.value;
          if (!value) continue;

          if (Array.isArray(value.messages)) {
            console.log(`[WA Webhook] Inbound messages received: ${value.messages.length}`);
          }

          // Process status updates (sent, read, delivered, etc.)
          if (Array.isArray(value.statuses)) {
            for (const statusObj of value.statuses) {
              const recipientId = statusObj.recipient_id || statusObj.recipient_user_id;
              const waStatus = statusObj.status;

              if (!recipientId) continue;

              await recordWhatsAppMessageStatus(recipientId, statusObj);
              const statusError = statusObj.errors?.[0];
              recordWhatsAppWebhookResult(recipientId, waStatus, {
                reason: statusError?.error_data?.details || statusError?.message || statusError?.title,
                code: statusError?.code
              }, statusObj.id);
              if (waStatus === 'sent') {
                await updateWhatsAppLeadStatus(recipientId, 'sent', 'sent', {
                  whatsappStatus: 'sent',
                  read: false,
                  skipStatusHistory: true,
                  quiet: true,
                });
              } else if (waStatus === 'read') {
                await updateWhatsAppLeadStatus(recipientId, 'sent', 'read', {
                  whatsappStatus: 'sent',
                  read: true,
                  skipStatusHistory: true,
                  quiet: true,
                });
              } else if (waStatus === 'delivered') {
                await updateWhatsAppLeadStatus(recipientId, 'sent', 'delivered', {
                  whatsappStatus: 'sent',
                  skipStatusHistory: true,
                  quiet: true,
                });
              } else if (waStatus === 'failed') {
                const errorObj = statusObj.errors?.[0];
                const failReason = errorObj?.error_data?.details || errorObj?.message || errorObj?.title || 'Message undeliverable';
                const errorCode = errorObj?.code;

                await updateWhatsAppLeadStatus(recipientId, 'failed', 'failed', {
                  whatsappStatus: 'failed',
                  reason: failReason,
                  errorCode,
                  skipStatusHistory: true,
                  quiet: true,
                  metadata: {
                    reason: failReason,
                    code: errorCode,
                    details: errorObj?.error_data?.details || null
                  }
                });
              }
            }
          }

          // Store each inbound message as a timestamped WhatsApp interaction.
          if (Array.isArray(value.messages)) {
            for (const msg of value.messages) {
              const contact = value.contacts?.find((item) => item.wa_id === msg.from);
              await recordWhatsAppChat(msg.from, msg, contact?.profile?.name);
              console.log(`[WA Webhook] Stored inbound ${msg.type || 'unknown'} message from ${msg.from}`);

              let button = getWhatsAppButtonReply(msg);
              if (!button) continue;

              if (button.action === 'video_clicked') {
                const conversation = await getWhatsAppConversation(msg.from);
                const sourceMessage = conversation.find(
                  (event) => msg.context?.id
                    && event.messageId === msg.context.id
                );
                if (!sourceMessage?.templateName) {
                  console.warn(
                    `[WA Button] Cannot resolve the source template for demo-video reply from ${msg.from}; skipping generic video link.`
                  );
                  continue;
                }
                try {
                  button = {
                    ...button,
                    url: getWhatsAppVideoDestination(sourceMessage.templateName),
                  };
                  console.log(
                    `[WA Button] Resolved demo video for template '${sourceMessage.templateName}' to ${button.url}`
                  );
                } catch (error) {
                  console.warn(`[WA Button] ${error.message}`);
                  continue;
                }
              }

              let replyResult = null;
              let replyError = null;
              try {
                replyResult = await sendWhatsAppCtaUrl(
                  msg.from,
                  {
                    body: button.body,
                    displayText: button.displayText,
                    url: button.url,
                  }
                );
              } catch (error) {
                replyError = error;
              }

              const replySent = Boolean(replyResult && !replyResult.skipped);
              if (replySent) {
                await recordWhatsAppOutboundChat(
                  msg.from,
                  button.body,
                  replyResult.messages?.[0]?.id || null,
                  {
                    type: 'cta_url',
                    displayText: button.displayText,
                    url: button.url,
                  }
                );
              }
              await updateWhatsAppLeadStatus(msg.from, 'clicked', button.action, {
                whatsappStatus: 'sent',
                clicked: true,
                skipStatusHistory: true,
              });
              await recordWhatsAppButtonEvent(msg.from, {
                name: button.name,
                url: button.url,
                timestamp: new Date().toISOString(),
                eventId: msg.id || null,
              });

              if (replyError) {
                console.error(`[WA Button] Failed to send ${button.name} link to ${msg.from}:`, replyError.response?.data || replyError.message);
              } else if (!replySent) {
                console.warn(`[WA Button] Did not send ${button.name} link to ${msg.from}: ${replyResult?.reason || 'unknown reason'}`);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[WA Webhook Error] Failed to process webhook payload:', err.message);
  }
});

module.exports = router;
