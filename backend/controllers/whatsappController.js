const { PrismaClient } = require('@prisma/client');
const prisma = require('../prismaClient');
const { sendWhatsAppTemplate } = require('../services/whatsappService');
const { getCampaign, isValidProduct, resolveProduct } = require('../productCampaigns');
const { getAllActiveLeads } = require('../unifiedDb');
const { delay } = require('../utils/helpers');

let whatsappCampaignRunning = false;

let whatsappCampaignProgress = {
  running: false,
  total: 0,
  sent: 0,
  failed: 0,
  queued: 0,
  progress: 0,
  currentContact: '',
  startedAt: null,
  completedAt: null
};

function getWhatsAppCampaignStatus(req, res) {
  res.json({
    running: whatsappCampaignRunning,
    ...whatsappCampaignProgress
  });
}

async function startWhatsAppCampaign(req, res) {
  if (whatsappCampaignRunning) {
    return res.status(409).json({ error: 'A WhatsApp campaign is already running.' });
  }

  const { templateProduct, selectedPhones, selectedCompanyIds } = req.body || {};

  // ── Validate template ──────────────────────────────────────────────────────
  if (!templateProduct || !isValidProduct(templateProduct)) {
    return res.status(400).json({ error: 'Please select a valid WhatsApp template.' });
  }

  const product = resolveProduct(templateProduct);
  const campaign = getCampaign(product);

  if (!campaign?.whatsappTemplate) {
    return res.status(400).json({ error: 'No approved WhatsApp template configured for this product.' });
  }

  // ── Validate selection ─────────────────────────────────────────────────────
  const hasPhones = Array.isArray(selectedPhones) && selectedPhones.length > 0;
  const hasCompanies = Array.isArray(selectedCompanyIds) && selectedCompanyIds.length > 0;

  if (!hasPhones && !hasCompanies) {
    return res.status(400).json({ error: 'Select at least one lead or company contact.' });
  }

  // Reserve the campaign slot before database reads so concurrent requests cannot overlap.
  whatsappCampaignRunning = true;

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
          isCompanyContact: false
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

    whatsappCampaignProgress = {
      running: true,
      total: users.length,
      sent: 0,
      failed: 0,
      queued: users.length,
      progress: 0,
      currentContact: users[0]?.name ? `${users[0].name} (${users[0].phone})` : String(users[0]?.phone || ''),
      startedAt: new Date(),
      completedAt: null
    };

    // Respond immediately, send in background
    res.json({
      success: true,
      message: `WhatsApp campaign started in background. Sending to ${users.length} contact(s).`
    });

    (async () => {
      let success = 0;
      let failed = 0;
      try {
        for (const user of users) {
          whatsappCampaignProgress.currentContact = user.name ? `${user.name} (${user.phone})` : String(user.phone || '');
          try {
            await sendWhatsAppTemplate(user, null, product);
            success++;
            whatsappCampaignProgress.sent = success;
            console.log(`[WA Campaign] Sent to ${user.phone} (${user.name})`);
          } catch (err) {
            failed++;
            whatsappCampaignProgress.failed = failed;
            console.error(`[WA Campaign] Failed for ${user.phone}:`, err.message);
          }
          whatsappCampaignProgress.queued = Math.max(0, users.length - (success + failed));
          whatsappCampaignProgress.progress = Math.min(100, Math.round(((success + failed) / users.length) * 100));
          // 2-second pause between sends to respect WhatsApp rate limits
          await delay(2000);
        }
        console.log(`[WA Campaign] Finished. Sent: ${success}, Failed: ${failed}`);
      } catch (err) {
        console.error('[WA Campaign] Background error:', err.message);
      } finally {
        whatsappCampaignRunning = false;
        whatsappCampaignProgress.running = false;
        whatsappCampaignProgress.queued = 0;
        whatsappCampaignProgress.progress = 100;
        whatsappCampaignProgress.completedAt = new Date();
        whatsappCampaignProgress.currentContact = '';
      }
    })();
  } catch (err) {
    whatsappCampaignRunning = false;
    whatsappCampaignProgress.running = false;
    console.error('[WA Campaign] Failed to build recipients:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to build WhatsApp campaign recipients.' });
    }
  }
}

function recordWhatsAppWebhookResult(recipientId, status, errorInfo) {
  if (status === 'failed') {
    if (whatsappCampaignProgress.running || (whatsappCampaignProgress.completedAt && (new Date() - new Date(whatsappCampaignProgress.completedAt) < 180000))) {
      whatsappCampaignProgress.failed++;
      whatsappCampaignProgress.sent = Math.max(0, whatsappCampaignProgress.sent - 1);
      if (errorInfo?.reason) {
        whatsappCampaignProgress.lastError = errorInfo.reason;
      }
    }
  }
}

module.exports = { startWhatsAppCampaign, getWhatsAppCampaignStatus, recordWhatsAppWebhookResult };
