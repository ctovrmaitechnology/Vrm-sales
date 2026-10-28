const axios = require('axios');
const { getCampaign } = require('../productCampaigns');
const { getFirstName, isWhatsAppEnabled, logWhatsAppDisabled } = require('../utils/helpers');
const { encodeLeadRef } = require('./trackingService');
const {
  updateWhatsAppLeadStatus,
  recordWhatsAppOutboundChat,
} = require('../unifiedDb');

async function sendWhatsAppTemplate(user, industry, product) {
  if (!isWhatsAppEnabled()) {
    logWhatsAppDisabled();
    return { skipped: true, reason: "whatsapp_disabled" };
  }

  // 1. WhatsApp message should send only if phone number exists
  // (Assuming phone is stored as user.phone or user.phoneNumber in DB)
  const phone = user.phone || user.phoneNumber;
  if (!phone) {
    console.log(`WhatsApp skipped for ${user.email} - No phone number found.`);
    return;
  }

  // 2. Use environment variables
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.log("WhatsApp skipped - Missing WHATSAPP_TOKEN or PHONE_NUMBER_ID in .env");
    return;
  }

  // 3. Dynamic template selection logic based on user type
  const campaign = getCampaign(product);
  const templateName = campaign?.whatsappTemplate || (product === 'workflow' || product === 'workflow_ai' ? 'workflow' : null);
  const templateLanguage = campaign?.whatsappLanguage || 'en';

  if (!templateName) {
    console.log(`WhatsApp skipped for ${user.email} - No approved template configured for ${product}.`);
    return { skipped: true, reason: "product_template_not_configured" };
  }

  // Name resolution for {{1}} parameter
  const rawName = user.name || user.full_name || (user.isCompanyContact ? user.company_name : '');
  const userName = rawName ? getFirstName(rawName) : "there";

  const normalizeTemplateName = (name) => String(name || '').trim().toLowerCase();
  const dynamicButtonTemplates = String(process.env.WHATSAPP_DYNAMIC_URL_BUTTON_TEMPLATES || '')
    .split(',')
    .map(normalizeTemplateName)
    .filter(Boolean);
  const quickReplyTemplates = String(process.env.WHATSAPP_QUICK_REPLY_TEMPLATES || 'workflow')
    .split(',')
    .map(normalizeTemplateName)
    .filter(Boolean);
  const isQuickReplyTemplate =
    product === 'workflow_ai' ||
    product === 'workflow' ||
    quickReplyTemplates.includes(normalizeTemplateName(templateName));
  const useDynamicWhatsAppUrlButton =
    process.env.WHATSAPP_DYNAMIC_URL_BUTTON === "true" &&
    dynamicButtonTemplates.includes(normalizeTemplateName(templateName)) &&
    !isQuickReplyTemplate;
  const dynamicWhatsAppUrlButtonIndexes = String(
    process.env.WHATSAPP_DYNAMIC_URL_BUTTON_INDEXES ||
    process.env.WHATSAPP_DYNAMIC_URL_BUTTON_INDEX ||
    "0"
  )
    .split(",")
    .map(index => Number(index.trim()))
    .filter(index => Number.isInteger(index) && index >= 0);
  const demoRef = encodeLeadRef(user.phone || user.phoneNumber || user.email || 'lead');

  // Clean phone number, ensure digits only
  let cleanPhone = String(phone).replace(/\D/g, '');

  // If the number is exactly 10 digits, assume it's an Indian number missing the '91' country code
  if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone;
  }

  // Body component: {{1}} is replaced with the user's name
  const components = [
    {
      type: "body",
      parameters: [
        { type: "text", text: userName }
      ]
    }
  ];

  if (useDynamicWhatsAppUrlButton) {
    dynamicWhatsAppUrlButtonIndexes.forEach(index => {
      components.push({
        type: "button",
        sub_type: "url",
        index,
        parameters: [
          { type: "text", text: demoRef }
        ]
      });
    });
  } else if (
    isQuickReplyTemplate &&
    process.env.WHATSAPP_DYNAMIC_URL_BUTTON === "true" &&
    dynamicButtonTemplates.includes(normalizeTemplateName(templateName))
  ) {
    console.warn(
      `[WA Campaign] Skipping URL-button parameters for quick-reply template '${templateName}'.`
    );
  }

  // WhatsApp API payload
  const payload = {
    messaging_product: "whatsapp",
    to: cleanPhone,
    type: "template",
    template: {
      name: templateName,
      language: {
        code: templateLanguage
      },
      components
    }
  };

  // 4. Send message via Meta WhatsApp Cloud API
  let response;
  try {
    const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

    // Use axios as requested
    response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`WhatsApp template '${templateName}' sent to ${phone} (User: ${user.email}) - Message ID: ${response.data?.messages?.[0]?.id}`);
  } catch (error) {
    // 5. If WhatsApp sending fails: log the actual Meta API error and do not crash
    console.error(`WhatsApp API Error for ${user.email}:`, error.response?.data || error.message);
    throw error;
  }

  // 6. Update lead & status in database
  try {
    await updateWhatsAppLeadStatus(phone, "sent", "template_sent", {
      whatsappStatus: "sent",
      user,
      skipStatusHistory: true,
      quiet: true,
    });
    const messageId = response.data?.messages?.[0]?.id || null;
    if (messageId) {
      await recordWhatsAppOutboundChat(phone, `Template sent: ${templateName}`, messageId, {
        type: 'template',
        templateName,
      });
    }
  } catch (dbErr) {
    console.error('[WA DB Notice] Failed to record WhatsApp template message:', dbErr.message);
  }

  return response?.data;
}

async function sendWhatsAppText(phone, text) {
  if (!isWhatsAppEnabled()) {
    logWhatsAppDisabled();
    return { skipped: true, reason: 'whatsapp_disabled' };
  }

  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error('WhatsApp reply skipped because WHATSAPP_TOKEN or PHONE_NUMBER_ID is missing.');
  }

  const recipient = String(phone || '').replace(/\D/g, '');
  if (!recipient) {
    throw new Error('WhatsApp reply skipped because the recipient number is invalid.');
  }

  const response = await axios.post(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'text',
      text: {
        body: text,
        preview_url: true
      }
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  console.log(`[WA Reply] Text sent to ${recipient} - Message ID: ${response.data?.messages?.[0]?.id}`);
  return response.data;
}

async function sendWhatsAppCtaUrl(phone, { body, displayText, url }) {
  if (!isWhatsAppEnabled()) {
    logWhatsAppDisabled();
    return { skipped: true, reason: 'whatsapp_disabled' };
  }

  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error('WhatsApp CTA message skipped because WHATSAPP_TOKEN or PHONE_NUMBER_ID is missing.');
  }

  const recipient = String(phone || '').replace(/\D/g, '');
  if (!recipient) throw new Error('WhatsApp CTA message skipped because the recipient number is invalid.');
  if (!/^https:\/\//i.test(String(url || ''))) {
    throw new Error('WhatsApp CTA button must use an HTTPS URL.');
  }
  if (!body?.trim() || !displayText?.trim()) {
    throw new Error('WhatsApp CTA message requires body text and a button label.');
  }

  const response = await axios.post(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: body },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: displayText,
            url,
          },
        },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  console.log(`[WA CTA] Sent '${displayText}' button to ${recipient} - Message ID: ${response.data?.messages?.[0]?.id}`);
  return response.data;
}

module.exports = {
  sendWhatsAppTemplate,
  sendWhatsAppText,
  sendWhatsAppCtaUrl,
};
