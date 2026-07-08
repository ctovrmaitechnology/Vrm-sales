const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { isValidProduct, resolveProduct } = require('../productCampaigns');
const { getCampaignLeads, updateUnifiedLeadStatus, updateEmailLeadStatus } = require('../unifiedDb');
const { sendInitialEmail } = require('../services/emailService');
const { sendWhatsAppTemplate } = require('../services/whatsappService');
const { detectIndustry, delay, isWhatsAppEnabled, logWhatsAppDisabled, normalizeLeadProduct } = require('../utils/helpers');
const { runFollowUpEmailCheck } = require('../services/followUpService');

const EXCEL_PRODUCT_MODE = 'excel';
let emailCampaignRunning = false;
let followUpCheckRunning = false;

async function startCampaign(req, res) {
  if (emailCampaignRunning) {
    return res.status(409).json({ error: 'An email campaign is already running.' });
  }

  emailCampaignRunning = true;

  try {
    const requestedProduct = String(req.body?.product || '').trim();
    const useExcelProductColumn = requestedProduct.toLowerCase() === EXCEL_PRODUCT_MODE;

    if (!useExcelProductColumn && !isValidProduct(requestedProduct)) {
      emailCampaignRunning = false;
      return res.status(400).json({ success: false, error: 'Please select a valid product.' });
    }
    const product = useExcelProductColumn ? null : resolveProduct(requestedProduct);
    const users = await getCampaignLeads();

    res.json({
      success: true,
      message: "Email campaign started in background"
    });

    (async () => {
      try {
        let success = 0;
        let failed = 0;

        for (const user of users) {
          let sentSuccessfully = false;
          let attempts = 0;

          while (!sentSuccessfully && attempts < 3) {
            try {
              attempts++;

              const leadProduct = useExcelProductColumn
                ? normalizeLeadProduct(user.product_type)
                : product;
              const brevoResult = await sendInitialEmail(user, leadProduct);

              sentSuccessfully = true;
              success++;

              console.log(
                `Sent to ${user.email} (Attempt ${attempts}, Message ID: ${brevoResult?.messageId || "accepted"})`
              );

              // Trigger WhatsApp ONLY after successful email sending
              try {
                if (isWhatsAppEnabled()) {
                  const industry = detectIndustry(user.email);
                  await sendWhatsAppTemplate(user, industry, leadProduct);
                } else {
                  logWhatsAppDisabled();
                }
              } catch (waErr) {
                console.log(`Unexpected WhatsApp flow error for ${user.email}:`, waErr.message);
              }

              if (user.status !== "clicked") {
                await updateEmailLeadStatus(user.email, "sent", "initial_sent");
              }

            } catch (error) {
              console.log(
                `Attempt ${attempts} failed for ${user.email}: ${error.message}`
              );

              if (attempts >= 3) {
                failed++;

                console.log(
                  `Final failure for ${user.email}`
                );
              } else {
                await delay(2000);
              }
            }
          }

        }

        console.log(
          `Campaign finished. Sent: ${success}, Failed: ${failed}`
        );

      } catch (error) {
        console.error("Error in background campaign execution:", error.message);
      } finally {
        emailCampaignRunning = false;
      }
    })();

  } catch (error) {
    console.error(
      "ERROR STARTING CAMPAIGN:",
      error.message
    );
    emailCampaignRunning = false;
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

async function unsubscribe(req, res) {
  const token = req.query.token || req.body?.token;

  if (!token) {
    return res.status(400).send("Missing unsubscribe token");
  }

  try {
    const email =
      Buffer
        .from(decodeURIComponent(token), 'base64')
        .toString('utf8');

    await prisma.customer.update({
      where: {
        email
      },
      data: {
        unsubscribeStatus: true
      }
    });
    await updateEmailLeadStatus(email, "unsubscribed", "unsubscribe", {
      unsubscribeStatus: true
    });

    return res.status(200).send("You have been unsubscribed.");

  } catch (error) {
    console.log("Unsubscribe error:", error.message);

    return res.status(400).send("Unable to unsubscribe this address.");
  }
}

async function startManualFollowUpCheck(req, res) {
  if (followUpCheckRunning) {
    return res.status(409).json({
      success: false,
      message: "Follow-up check is already running"
    });
  }

  followUpCheckRunning = true;

  res.json({
    success: true,
    message: "Follow-up check started"
  });

  runFollowUpEmailCheck()
    .catch((error) => {
      console.log("Manual follow-up check error:", error.message);
    })
    .finally(() => {
      followUpCheckRunning = false;
    });
}

function isFollowUpCheckRunning() {
    return followUpCheckRunning;
}
function setFollowUpCheckRunning(status) {
    followUpCheckRunning = status;
}

module.exports = {
  startCampaign,
  unsubscribe,
  startManualFollowUpCheck,
  isFollowUpCheckRunning,
  setFollowUpCheckRunning
};
