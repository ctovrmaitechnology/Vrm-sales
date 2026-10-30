const { PrismaClient } = require('@prisma/client');
const prisma = require('../prismaClient');
const { sendWhatsAppTemplate } = require('../services/whatsappService');
const { getCampaign, isValidProduct, resolveProduct } = require('../productCampaigns');
const { getAllActiveLeads, updateWhatsAppLeadStatus } = require('../unifiedDb');
const { delay } = require('../utils/helpers');

let whatsappCampaignRunning = false;
let campaignMessageStatuses = new Map();

let whatsappCampaignProgress = {
  running: false,
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
  const products = [...new Set(requestedProducts.map(resolveProduct))];

  if (
    requestedProducts.length === 0 ||
    requestedProducts.some(product => !isValidProduct(product))
  ) {
    return res.status(400).json({ error: 'Please select a valid WhatsApp template.' });
  }

  const campaigns = products.map(product => ({ product, campaign: getCampaign(product) }));
  const unconfiguredCampaign = campaigns.find(({ campaign }) => !campaign?.whatsappTemplate);
  if (unconfiguredCampaign) {
    return res.status(400).json({
      error: `No approved WhatsApp template configured for ${unconfiguredCampaign.product}.`
    });
  }
  const product = products[0];

  // ── Validate selection ─────────────────────────────────────────────────────
  const hasPhones = Array.isArray(selectedPhones) && selectedPhones.length > 0;
  const hasCompanies = Array.isArray(selectedCompanyIds) && selectedCompanyIds.length > 0;

  if (!hasPhones && !hasCompanies) {
    return res.status(400).json({ error: 'Select at least one lead or company contact.' });
  }

  // Reserve the campaign slot before database reads so concurrent requests cannot overlap.
  whatsappCampaignRunning = true;
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
      for (const { product: campaignProduct } of campaigns) {
        messageTasks.push({ user, campaignProduct });
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

          const { user, campaignProduct } = messageTasks[i];
          const campaign = getCampaign(campaignProduct);

          whatsappCampaignProgress.isWaiting = false;
          whatsappCampaignProgress.waitingRemainingSeconds = 0;
          whatsappCampaignProgress.waitMessage = '';
          whatsappCampaignProgress.currentContact = `${user.name ? `${user.name} ` : ''}(${user.phone}) · ${campaign.whatsappTemplate}`;

          // Send template message immediately
          try {
            const result = await sendWhatsAppTemplate(user, null, campaignProduct);
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
            const nextCampaign = getCampaign(nextTask.campaignProduct);
            const nextTarget = nextTask.user.name || nextTask.user.phone || 'next contact';
            const nextTemplateName = nextCampaign?.whatsappTemplate || nextTask.campaignProduct;

            console.log(`[WA Campaign] Message ${i + 1}/${totalMessages} processed. Waiting ${WHATSAPP_DELAY_SECONDS}s (2 minutes) before message ${i + 2}...`);

            whatsappCampaignProgress.isWaiting = true;
            for (let sec = WHATSAPP_DELAY_SECONDS; sec > 0; sec--) {
              if (!whatsappCampaignRunning) break;
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
        whatsappCampaignProgress.running = false;
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
  recordWhatsAppWebhookResult
};
