const axios = require('axios');

const sendWhatsAppTemplate = async ({
  to,
  templateName,
  name,
  demoLink,
  posterLink
}) => {
  if (process.env.ENABLE_WHATSAPP !== "true") {
    console.log("WhatsApp module disabled via ENABLE_WHATSAPP flag");
    return { skipped: true, reason: "whatsapp_disabled" };
  }

  try {

    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",

        to: to,

        type: "template",

        template: {

          name: templateName,

          language: {
            code: "en"
          },

          components: [

            {
              type: "header",
              parameters: [
                {
                  type: "document",
                  document: {
                    link: "https://drive.google.com/uc?export=download&id=11SrbgirIe0x2B02uaHcCYpgniV6K4Hjl",
                    filename: "VRM_AI_Brochure.pdf"
                  }
                }
              ]
            },

            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  text: name || "there"
                }
              ]
            }

          ]
        }
      },

      {
        headers: {
          Authorization:
            `Bearer ${process.env.WHATSAPP_TOKEN}`,

          "Content-Type":
            "application/json",
        },
      }
    );

    console.log(
      "WhatsApp Template Sent:",
      response.data
    );

    return response.data;

  } catch (error) {

    console.error(
      "WhatsApp Template Error:",
      error.response?.data || error.message
    );

    throw error;
  }
};

module.exports = {
  sendWhatsAppTemplate,
};
