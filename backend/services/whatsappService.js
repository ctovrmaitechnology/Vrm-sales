const axios = require('axios');
const { getCampaign } = require('../productCampaigns');
const { getFirstName, isWhatsAppEnabled, logWhatsAppDisabled } = require('../utils/helpers');
const { encodeLeadRef } = require('./trackingService');
const { updateWhatsAppLeadStatus } = require('../unifiedDb');

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

  // Dynamic buttons are only applied to templates that have URL buttons configured (e.g. not "workflow")
  const useDynamicWhatsAppUrlButton = process.env.WHATSAPP_DYNAMIC_URL_BUTTON === "true" && templateName !== 'workflow';
  const dynamicWhatsAppUrlButtonIndexes = String(
    process.env.WHATSAPP_DYNAMIC_URL_BUTTON_INDEXES ||
    process.env.WHATSAPP_DYNAMIC_URL_BUTTON_INDEX ||
    "0"
  )
    .split(",")
    .map(index => index.trim())
    .filter(Boolean);
  const demoRef = encodeLeadRef(user.email || user.phone || 'lead');

  // Clean phone number, ensure digits only
  let cleanPhone = String(phone).replace(/\D/g, '');

  // If the number is exactly 10 digits, assume it's an Indian number missing the '91' country code
  if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone;
  }

  const BACKEND_URL = process.env.BACKEND_BASE_URL || 'http://localhost:5002';
  const fullDemoLink = `${BACKEND_URL}/api/book-demo?ref=${demoRef}&kind=demo`;

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
          { type: "text", text: "&id=" + demoRef }
        ]
      });
    });
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
      user
    });
  } catch (dbErr) {
    console.error(`[WA DB Notice] Status update skipped for ${phone}:`, dbErr.message);
  }

  return response?.data;
}

module.exports = {
  sendWhatsAppTemplate
};
