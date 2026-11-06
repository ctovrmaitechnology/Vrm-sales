const { PrismaClient } = require('@prisma/client');
const prisma = require('../prismaClient');
const { sendWhatsAppTemplateByName } = require('../services/whatsappService');
const { getAllActiveLeads, updateWhatsAppLeadStatus, getWhatsAppConversation } = require('../unifiedDb');
const { delay } = require('../utils/helpers');
const { FOLLOW_UP_TEMPLATE_NAME } = require('../constants/whatsappFollowUp');

// The "Send WhatsApp Campaign" modal only ever offers these two approved templates.
// They are resolved directly (not through the shared email product-campaign system,
// which maps both to the same 'it' product and would collapse a two-template send
// into one, and which defaults to a non-existent 'workflow' template name when its
// own env vars aren't set).
const WHATSAPP_CAMPAIGN_TEMPLATES = {
  workflow_ai: {
    whatsappTemplate: process.env.WHATSAPP_TEMPLATE_WORKFLOW_AI || 'workflow_final',
    whatsappLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE_WORKFLOW_FINAL || 'en'
  },
  bench_to_billing: {
    whatsappTemplate: process.env.WHATSAPP_TEMPLATE_BENCH_TO_BILLING || 'benchtodeploy_final',
    whatsappLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE_BENCHTODEPLOY_FINAL || 'en'
  }
};
const isValidWhatsAppCampaignTemplate = (value) => Object.prototype.hasOwnProperty.call(WHATSAPP_CAMPAIGN_TEMPLATES, value);
const getWhatsAppCampaignTemplate = (value) => WHATSAPP_CAMPAIGN_TEMPLATES[value];

let whatsappCampaignRunning = false;
let whatsappCampaignPaused = false;
let campaignMessageStatuses = new Map();

let whatsappCampaignProgress = {
  running: false,
  paused: false,
  total: 0,
  sent: 0,
  failed: 0,
  queued: 0,
  progress: 0,
  currentContact: '',
  isWaiting: false,
  waitingRemainingSeconds: 0,
  waitMessage: '',
  statusVersion: 0,
  startedAt: null,
  completedAt: null
};

function getWhatsAppCampaignStatus(req, res) {
  res.json({
    running: whatsappCampaignRunning,
    ...whatsappCampaignProgress
  });
}

function cancelWhatsAppCampaign(req, res) {
  if (!whatsappCampaignRunning) {
    return res.json({ success: true, message: 'No WhatsApp campaign is currently running.' });
  }
  whatsappCampaignRunning = false;
  whatsappCampaignProgress.isWaiting = false;
  whatsappCampaignProgress.waitingRemainingSeconds = 0;
  whatsappCampaignProgress.waitMessage = 'Campaign stopped.';
  return res.json({ success: true, message: 'WhatsApp campaign stopped.' });
}

async function startWhatsAppCampaign(req, res) {
  if (whatsappCampaignRunning) {
    return res.status(409).json({ error: 'A WhatsApp campaign is already running.' });
  }

  const { templateProduct, templateProducts, selectedPhones, selectedCompanyIds } = req.body || {};

  // ── Validate template ──────────────────────────────────────────────────────
  const requestedProducts = Array.isArray(templateProducts)
    ? templateProducts
    : templateProduct
      ? [templateProduct]
      : [];
  const products = [...new Set(requestedProducts.map((value) => String(value || '').trim().toLowerCase()))];

  if (
    products.length === 0 ||
    products.some((value) => !isValidWhatsAppCampaignTemplate(value))
  ) {
    return res.status(400).json({ error: 'Please select a valid WhatsApp template.' });
  }

  const campaigns = products.map((value) => ({ product: value, campaign: getWhatsAppCampaignTemplate(value) }));
  const product = products[0];

  // ── Validate selection ─────────────────────────────────────────────────────
  const hasPhones = Array.isArray(selectedPhones) && selectedPhones.length > 0;
  const hasCompanies = Array.isArray(selectedCompanyIds) && selectedCompanyIds.length > 0;

  if (!hasPhones && !hasCompanies) {
    return res.status(400).json({ error: 'Select at least one lead or company contact.' });
  }

  // Reserve the campaign slot before database reads so concurrent requests cannot overlap.
  whatsappCampaignRunning = true;
  whatsappCampaignPaused = false;
  campaignMessageStatuses = new Map();

  try {
    // ── Build recipients ───────────────────────────────────────────────────────
    let users = [];

    if (hasCompanies) {
      const companyIdList = selectedCompanyIds.map(Number).filter(n => Number.isInteger(n) && n > 0);
      const companies = await prisma.company.findMany({
        where: { id: { in: companyIdList } }
      });
      const companyUsers = companies
        .filter(c => c.whatsapp_number || c.phone_number)
        .map(c => ({
          id: c.id,
          originalId: c.id,
          name: c.full_name || c.company_name || 'Contact',
          email: c.email || '',
          company: c.company_name || '',
          company_name: c.company_name || '',
          role: c.role || '',
          source: c.source || 'Company',
          phone: c.whatsapp_number || c.phone_number,
          phoneNumber: c.whatsapp_number || c.phone_number,
          product_type: product,
          isCompanyContact: true
        }));
      users.push(...companyUsers);
    }

    if (hasPhones) {
      const allLeads = await getAllActiveLeads();
      const phoneSet = new Set(selectedPhones.map(p => String(p).trim()));
      const leadUsers = allLeads
        .filter(lead => {
          const phone = String(lead.whatsappNumber || lead.phoneNumber || lead.phone || '').trim();
          return phone && phoneSet.has(phone);
        })
        .map(lead => ({
          id: lead.id,
          name: lead.name || '',
          email: lead.email || '',
          phone: lead.whatsappNumber || lead.phoneNumber || lead.phone,
          phoneNumber: lead.whatsappNumber || lead.phoneNumber || lead.phone,
          product_type: product,
          isCompanyContact: false,
          isWhatsAppLead: Boolean(lead.isWhatsAppLead),
          isEmailLead: Boolean(lead.isEmailLead)
        }));
      users.push(...leadUsers);

      // Also check company contacts for any phone in selectedPhones not yet covered
      const coveredPhones = new Set(users.map(u => String(u.phone).trim()));
      const missingPhones = [...phoneSet].filter(p => !coveredPhones.has(p));
      if (missingPhones.length > 0) {
        const companiesByPhone = await prisma.company.findMany({
          where: {
            OR: [
              { phone_number: { in: missingPhones } },
              { whatsapp_number: { in: missingPhones } }
            ]
          }
        });
        const extraCompanies = companiesByPhone
          .filter(c => (c.whatsapp_number || c.phone_number) && !coveredPhones.has(String(c.whatsapp_number || c.phone_number).trim()))
          .map(c => ({
            id: c.id,
            originalId: c.id,
            name: c.full_name || c.company_name || 'Contact',
            email: c.email || '',
            company: c.company_name || '',
            company_name: c.company_name || '',
            role: c.role || '',
            source: c.source || 'Company',
            phone: c.whatsapp_number || c.phone_number,
            phoneNumber: c.whatsapp_number || c.phone_number,
            product_type: product,
            isCompanyContact: true
          }));
        users.push(...extraCompanies);
      }
    }

    // The UI can submit a company in both selectedPhones and selectedCompanyIds.
    // Use the last 10 digits to collapse equivalent phone formatting to one send.
    const usersByPhone = new Map();
    for (const user of users) {
      const phone = String(user.phone || user.phoneNumber || '').trim();
      const digits = phone.replace(/\D/g, '');
      const phoneKey = digits.length >= 10 ? digits.slice(-10) : phone;
      if (phoneKey && !usersByPhone.has(phoneKey)) {
        usersByPhone.set(phoneKey, { ...user, phone, phoneNumber: phone });
      }
    }
    users = [...usersByPhone.values()];

    if (users.length === 0) {
      whatsappCampaignRunning = false;
      return res.status(400).json({ error: 'No eligible contacts with phone numbers found for this selection.' });
    }

    // Build ordered list of all message tasks
    const messageTasks = [];
    for (const user of users) {
      for (const { product: campaignProduct, campaign } of campaigns) {
        messageTasks.push({ user, campaignProduct, campaign });
      }
    }

    const totalMessages = messageTasks.length;

    whatsappCampaignProgress = {
      running: true,
      total: totalMessages,
      sent: 0,
      failed: 0,
      queued: totalMessages,
      progress: 0,
      currentContact: users[0]?.name ? `${users[0].name} (${users[0].phone})` : String(users[0]?.phone || ''),
      isWaiting: false,
      waitingRemainingSeconds: 0,
      waitMessage: '',
      statusVersion: 0,
      startedAt: new Date(),
      completedAt: null
    };

    // Respond immediately, send in background
    res.json({
      success: true,
      message: `WhatsApp campaign started in background. Sending ${campaigns.length} template(s) to ${users.length} contact(s) (${totalMessages} total message(s)).`
    });

    (async () => {
      let success = 0;
      let failed = 0;

      // 120-second (2-minute) delay between consecutive messages
      const WHATSAPP_DELAY_SECONDS = process.env.WHATSAPP_CAMPAIGN_DELAY_SECONDS
        ? parseInt(process.env.WHATSAPP_CAMPAIGN_DELAY_SECONDS, 10)
        : 120;

      try {
        for (let i = 0; i < totalMessages; i++) {
          if (!whatsappCampaignRunning) {
            console.log('[WA Campaign] Campaign stopped by user or system.');
            break;
          }

          // Pause check — hold here until resumed or stopped
          while (whatsappCampaignPaused && whatsappCampaignRunning) {
            whatsappCampaignProgress.paused = true;
            whatsappCampaignProgress.waitMessage = 'Campaign paused. Click Resume to continue.';
            await delay(1000);
          }
          if (!whatsappCampaignRunning) break;
          whatsappCampaignProgress.paused = false;

          const { user, campaign } = messageTasks[i];

          whatsappCampaignProgress.isWaiting = false;
          whatsappCampaignProgress.waitingRemainingSeconds = 0;
          whatsappCampaignProgress.waitMessage = '';
          whatsappCampaignProgress.currentContact = `${user.name ? `${user.name} ` : ''}(${user.phone}) · ${campaign.whatsappTemplate}`;

          // Send template message immediately
          try {
            const result = await sendWhatsAppTemplateByName(user, campaign.whatsappTemplate, campaign.whatsappLanguage);
            const messageId = result?.messages?.[0]?.id;
            if (messageId && campaignMessageStatuses.get(messageId) === 'failed') {
              failed++;
              whatsappCampaignProgress.failed++;
            } else {
              success++;
              whatsappCampaignProgress.sent++;
              if (messageId) campaignMessageStatuses.set(messageId, 'sent');
            }
            console.log(`[WA Campaign] Accepted message ${i + 1}/${totalMessages} ('${campaign.whatsappTemplate}') for ${user.phone} (${user.name})`);
          } catch (err) {
            failed++;
            whatsappCampaignProgress.failed++;
            const apiError = err.response?.data?.error;
            const reason = apiError?.error_data?.details || apiError?.message || err.message || 'WhatsApp rejected the message.';
            try {
              await updateWhatsAppLeadStatus(user.phone, 'failed', 'failed', {
                whatsappStatus: 'failed',
                user,
                reason,
                errorCode: apiError?.code,
                metadata: {
                  templateName: campaign.whatsappTemplate,
                  whatsappNumber: user.phone,
                  reason,
                  code: apiError?.code || null,
                  details: apiError?.error_data?.details || null,
                },
              });
            } catch (statusError) {
              console.error(`[WA Campaign] Could not save failure for ${user.phone} using '${campaign.whatsappTemplate}':`, statusError.message);
            }
            console.error(`[WA Campaign] Failed message ${i + 1}/${totalMessages} for ${user.phone} using '${campaign.whatsappTemplate}':`, err.message);
          }

          whatsappCampaignProgress.queued = Math.max(0, totalMessages - (success + failed));
          whatsappCampaignProgress.progress = Math.min(100, Math.round(((success + failed) / totalMessages) * 100));

          // After message is processed, wait 2 minutes (120 seconds) before sending the next message
          if (i < totalMessages - 1 && whatsappCampaignRunning) {
            const nextTask = messageTasks[i + 1];
            const nextTarget = nextTask.user.name || nextTask.user.phone || 'next contact';
            const nextTemplateName = nextTask.campaign?.whatsappTemplate || nextTask.campaignProduct;

            console.log(`[WA Campaign] Message ${i + 1}/${totalMessages} processed. Waiting ${WHATSAPP_DELAY_SECONDS}s (2 minutes) before message ${i + 2}...`);

            whatsappCampaignProgress.isWaiting = true;
            for (let sec = WHATSAPP_DELAY_SECONDS; sec > 0; sec--) {
              if (!whatsappCampaignRunning) break;
              // Don't count down while paused — freeze the timer
              if (whatsappCampaignPaused) {
                whatsappCampaignProgress.waitMessage = 'Campaign paused. Click Resume to continue.';
                await delay(1000);
                sec++; // undo the loop decrement so we stay at the same second
                continue;
              }
              whatsappCampaignProgress.waitingRemainingSeconds = sec;
              const mins = Math.floor(sec / 60);
              const remainingSecs = sec % 60;
              const timeFormatted = mins > 0 ? `${mins}m ${remainingSecs}s` : `${sec}s`;
              whatsappCampaignProgress.waitMessage = `Waiting 2 min (${timeFormatted} remaining) · Next: ${nextTarget} (${nextTemplateName})`;
              await delay(1000);
            }

            whatsappCampaignProgress.isWaiting = false;
            whatsappCampaignProgress.waitingRemainingSeconds = 0;
            whatsappCampaignProgress.waitMessage = '';
          }
        }
        console.log(`[WA Campaign] Finished. Accepted: ${success}, API rejected: ${failed}`);
      } catch (err) {
        console.error('[WA Campaign] Background error:', err.message);
      } finally {
        whatsappCampaignRunning = false;
        whatsappCampaignPaused = false;
        whatsappCampaignProgress.running = false;
        whatsappCampaignProgress.paused = false;
        whatsappCampaignProgress.isWaiting = false;
        whatsappCampaignProgress.waitingRemainingSeconds = 0;
        whatsappCampaignProgress.waitMessage = '';
        whatsappCampaignProgress.queued = 0;
        whatsappCampaignProgress.progress = 100;
        whatsappCampaignProgress.completedAt = new Date();
        whatsappCampaignProgress.currentContact = '';
      }
    })();
  } catch (err) {
    whatsappCampaignRunning = false;
    whatsappCampaignProgress.running = false;
    whatsappCampaignProgress.isWaiting = false;
    whatsappCampaignProgress.waitingRemainingSeconds = 0;
    whatsappCampaignProgress.waitMessage = '';
    console.error('[WA Campaign] Failed to build recipients:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to build WhatsApp campaign recipients.' });
    }
  }
}

async function sendWhatsAppFollowUp(req, res) {
  const phone = String(req.body?.phone || '').trim();
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim();

  if (!phone) {
    return res.status(400).json({ error: 'A phone number is required.' });
  }

  try {
    const conversation = await getWhatsAppConversation(phone);
    const alreadySent = conversation.some(
      (event) => event.direction === 'outbound' && event.templateName === FOLLOW_UP_TEMPLATE_NAME && event.type === 'template'
    );
    if (alreadySent) {
      return res.status(409).json({ error: `'${FOLLOW_UP_TEMPLATE_NAME}' has already been sent to this contact.` });
    }
  } catch (error) {
    console.error(`[WA Follow-up] Could not check prior sends for ${phone}:`, error.message);
  }

  try {
    const result = await sendWhatsAppTemplateByName(
      { phone, phoneNumber: phone, name, email },
      FOLLOW_UP_TEMPLATE_NAME,
      undefined,
      { skipLeadFieldSync: true }
    );
    if (result?.skipped) {
      return res.status(503).json({ error: 'WhatsApp follow-up messaging is disabled or not configured on the server.' });
    }
    const messageId = result?.messages?.[0]?.id || null;
    return res.json({ success: true, messageId });
  } catch (error) {
    const apiError = error.response?.data?.error;
    const reason = apiError?.error_data?.details || apiError?.message || error.message || 'WhatsApp rejected the follow-up message.';
    try {
      await updateWhatsAppLeadStatus(phone, 'failed', 'failed', {
        whatsappStatus: 'failed',
        user: { phone, name, email },
        reason,
        errorCode: apiError?.code,
        skipLeadFieldSync: true,
        metadata: {
          templateName: FOLLOW_UP_TEMPLATE_NAME,
          whatsappNumber: phone,
          reason,
          code: apiError?.code || null,
          details: apiError?.error_data?.details || null,
        },
      });
    } catch (statusError) {
      console.error(`[WA Follow-up] Could not save failure for ${phone}:`, statusError.message);
    }
    console.error(`[WA Follow-up] Failed to send '${FOLLOW_UP_TEMPLATE_NAME}' to ${phone}:`, reason);
    return res.status(502).json({ error: reason });
  }
}

function pauseWhatsAppCampaign(req, res) {
  if (!whatsappCampaignRunning) {
    return res.status(400).json({ error: 'No WhatsApp campaign is currently running.' });
  }
  whatsappCampaignPaused = true;
  whatsappCampaignProgress.paused = true;
  return res.json({ success: true, message: 'WhatsApp campaign paused.' });
}

function resumeWhatsAppCampaign(req, res) {
  if (!whatsappCampaignRunning) {
    return res.status(400).json({ error: 'No WhatsApp campaign is currently running.' });
  }
  whatsappCampaignPaused = false;
  whatsappCampaignProgress.paused = false;
  whatsappCampaignProgress.waitMessage = '';
  return res.json({ success: true, message: 'WhatsApp campaign resumed.' });
}

function stopWhatsAppCampaign(req, res) {
  if (!whatsappCampaignRunning) {
    return res.status(400).json({ error: 'No WhatsApp campaign is currently running.' });
  }
  whatsappCampaignRunning = false;
  whatsappCampaignPaused = false;
  whatsappCampaignProgress.running = false;
  whatsappCampaignProgress.paused = false;
  whatsappCampaignProgress.isWaiting = false;
  whatsappCampaignProgress.waitingRemainingSeconds = 0;
  whatsappCampaignProgress.waitMessage = 'Campaign stopped.';
  return res.json({ success: true, message: 'WhatsApp campaign stopped.' });
}

function recordWhatsAppWebhookResult(recipientId, status, errorInfo, messageId) {
  const nextStatus = String(status || '').toLowerCase();
  const previousStatus = messageId ? campaignMessageStatuses.get(messageId) : null;
  if (!previousStatus || previousStatus === nextStatus) return;

  const priority = { sent: 1, delivered: 2, read: 3, failed: 4 };
  if ((priority[previousStatus] || 0) > (priority[nextStatus] || 0)) return;
  campaignMessageStatuses.set(messageId, nextStatus);
  whatsappCampaignProgress.statusVersion++;

  if (nextStatus === 'failed') {
    if (previousStatus !== 'failed') {
      whatsappCampaignProgress.failed++;
      whatsappCampaignProgress.sent = Math.max(0, whatsappCampaignProgress.sent - 1);
      whatsappCampaignProgress.sent = Math.min(whatsappCampaignProgress.sent, whatsappCampaignProgress.total);
      if (errorInfo?.reason) {
        whatsappCampaignProgress.lastError = errorInfo.reason;
      }
    }
  }
}

module.exports = {
  startWhatsAppCampaign,
  getWhatsAppCampaignStatus,
  cancelWhatsAppCampaign,
  pauseWhatsAppCampaign,
  resumeWhatsAppCampaign,
  stopWhatsAppCampaign,
  recordWhatsAppWebhookResult,
  sendWhatsAppFollowUp,
  FOLLOW_UP_TEMPLATE_NAME
};