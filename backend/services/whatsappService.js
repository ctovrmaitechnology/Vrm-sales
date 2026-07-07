const axios = require('axios');
const { getCampaign } = require('../productCampaigns');
const { getFirstName, isWhatsAppEnabled, logWhatsAppDisabled } = require('../utils/helpers');
const { encodeLeadRef } = require('./trackingService');
const { updateUnifiedLeadStatus } = require('../unifiedDb');

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
  const templateName = getCampaign(product)?.whatsappTemplate;
  if (!templateName) {
    console.log(`WhatsApp skipped for ${user.email} - No approved template configured for ${product}.`);
    return { skipped: true, reason: "product_template_not_configured" };
  }

  const firstName = getFirstName(user.name);
  const useDynamicWhatsAppUrlButton = process.env.WHATSAPP_DYNAMIC_URL_BUTTON === "true";
  const dynamicWhatsAppUrlButtonIndexes = String(
    process.env.WHATSAPP_DYNAMIC_URL_BUTTON_INDEXES ||
    process.env.WHATSAPP_DYNAMIC_URL_BUTTON_INDEX ||
    "0"
  )
    .split(",")
    .map(index => index.trim())
    .filter(Boolean);
  const demoRef = encodeLeadRef(user.email);

  // Clean phone number, ensure digits only
  let cleanPhone = String(phone).replace(/\D/g, '');

  // If the number is exactly 10 digits, assume it's an Indian number missing the '91' country code
  if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone;
  }

  const components = [
    {
      type: "body",
      parameters: [
        { type: "text", text: firstName }
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
  }

  // Sample WhatsApp API payload for all configured product templates
  const payload = {
    messaging_product: "whatsapp",
    to: cleanPhone,
    type: "template",
    template: {
      name: templateName,
      language: {
        code: "en" // or en_US, adjust to match your approved template language
      },
      components
    }
  };

  // 4. Detailed console logs & proper try-catch handling
  try {
    const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

    // Use axios as requested
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    await updateUnifiedLeadStatus(user, "whatsapp", "sent", "template_sent", {
      whatsappStatus: "sent"
    });

    console.log(`WhatsApp template '${templateName}' sent to ${phone} (User: ${user.email}) - Message ID: ${response.data.messages[0].id}`);
  } catch (error) {
    // 5. If WhatsApp sending fails: email flow should continue normally, server should not crash
    console.log(`WhatsApp API Error for ${user.email}:`, error.response?.data || error.message);
  }
}

module.exports = {
  sendWhatsAppTemplate
};
