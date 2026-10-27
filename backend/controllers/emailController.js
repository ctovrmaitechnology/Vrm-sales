const { PrismaClient } = require('@prisma/client');
const prisma = require('../prismaClient');
const { isValidProduct, resolveProduct } = require('../productCampaigns');
const { getCampaignLeads, updateUnifiedLeadStatus, updateEmailLeadStatus, updateUnifiedLeadEmailStatus, getEmailLeadsByEmails, recordEmailHistory } = require('../unifiedDb');
const { sendInitialEmail } = require('../services/emailService');
const { sendWhatsAppTemplate } = require('../services/whatsappService');
const { detectIndustry, delay, isWhatsAppEnabled, logWhatsAppDisabled, normalizeLeadProduct } = require('../utils/helpers');
const { runFollowUpEmailCheck } = require('../services/followUpService');

const EXCEL_PRODUCT_MODE = 'excel';
let emailCampaignRunning = false;
let followUpCheckRunning = false;

let emailCampaignProgress = {
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

async function startCampaign(req, res) {
  if (emailCampaignRunning) {
    return res.status(409).json({ error: 'An email campaign is already running.' });
  }

  emailCampaignRunning = true;

  try {
    const requestedProduct = String(req.body?.product || '').trim();
    const useExcelProductColumn = requestedProduct.toLowerCase() === EXCEL_PRODUCT_MODE;
    const batchSize = req.body?.batchSize === undefined || req.body.batchSize === ''
      ? null
      : Number(req.body.batchSize);
    const selectedEmails = Array.isArray(req.body?.selectedEmails)
      ? [...new Set(req.body.selectedEmails.map((email) => String(email).trim()).filter(Boolean))]
      : null;
    const selectedCompanyIds = Array.isArray(req.body?.selectedCompanyIds)
      ? [...new Set(req.body.selectedCompanyIds.map(Number))]
      : null;

    if (batchSize !== null && (!Number.isInteger(batchSize) || batchSize < 1)) {
      emailCampaignRunning = false;
      return res.status(400).json({ success: false, error: 'Batch size must be a positive whole number.' });
    }
    if (selectedEmails && selectedEmails.length === 0) {
      emailCampaignRunning = false;
      return res.status(400).json({ success: false, error: 'Select at least one lead to send.' });
    }
    if (selectedCompanyIds && (
      selectedCompanyIds.length === 0 ||
      selectedCompanyIds.some((id) => !Number.isInteger(id) || id < 1)
    )) {
      emailCampaignRunning = false;
      return res.status(400).json({ success: false, error: 'Select valid company contacts to send.' });
    }
    if (selectedEmails?.length && selectedCompanyIds?.length) {
      emailCampaignRunning = false;
      return res.status(400).json({ success: false, error: 'Send to either leads or company contacts in one campaign.' });
    }

    if (!useExcelProductColumn && !isValidProduct(requestedProduct)) {
      emailCampaignRunning = false;
      return res.status(400).json({ success: false, error: 'Please select a valid product.' });
    }
    const product = useExcelProductColumn ? null : resolveProduct(requestedProduct);

    let users;
    if (selectedCompanyIds?.length) {
      const companies = await prisma.company.findMany({
        where: {
          id: { in: selectedCompanyIds },
          email_status: { in: ['not sent', 'new', 'failed'] }
        },
        orderBy: { created_at: 'asc' }
      });
      users = companies.filter((company) => company.email).map((company) => ({
        id: company.id,
        name: company.full_name || '',
        email: company.email,
        company: company.company_name,
        product_type: product || 'workflow_ai',
        status: company.status || 'new',
        email_status: company.email_status,
        isCompanyContact: true
      }));
    } else if (selectedEmails && selectedEmails.length > 0) {
      // Send to specific selected leads
      users = await getEmailLeadsByEmails(selectedEmails);
    } else {
      // Send to all unsent leads (original behavior)
      users = await getCampaignLeads();
    }

    // Apply batch size limit if provided
    const totalAvailable = users.length;
    if (batchSize !== null && batchSize < users.length) {
      users = users.slice(0, batchSize);
    }

    if (users.length === 0) {
      emailCampaignRunning = false;
      return res.status(400).json({ success: false, error: 'No unsent eligible leads were found for this selection.' });
    }

    emailCampaignProgress = {
      running: true,
      total: users.length,
      sent: 0,
      failed: 0,
      queued: users.length,
      progress: 0,
      currentContact: users[0]?.email || '',
      startedAt: new Date(),
      completedAt: null
    };

    res.json({
      success: true,
      message: `Email campaign started in background. Sending to ${users.length} of ${totalAvailable} available leads.`
    });

    (async () => {
      try {
        let success = 0;
        let failed = 0;

        for (const user of users) {
          emailCampaignProgress.currentContact = user.email || '';
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
              emailCampaignProgress.sent = success;
              emailCampaignProgress.queued = Math.max(0, users.length - (success + failed));
              emailCampaignProgress.progress = Math.min(100, Math.round(((success + failed) / users.length) * 100));

              try {
                await recordEmailHistory({
                  email: user.email,
                  status: 'sent',
                  eventType: 'initial',
                  attemptNumber: attempts,
                  providerMessageId: brevoResult?.messageId || null,
                  companyId: user.isCompanyContact ? user.id : null
                });
              } catch (historyError) {
                console.error(`Failed to record successful email attempt for ${user.email}:`, historyError.message);
              }

              console.log(
                `Sent to ${user.email} (Attempt ${attempts}, Message ID: ${brevoResult?.messageId || "accepted"})`
              );

              // Trigger WhatsApp ONLY after successful email sending
              if (!user.isCompanyContact) {
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
              }

              // Update email_status in both company and leads table (do not save to EmailLeads)
              if (user.isCompanyContact && user.id) {
                await prisma.company.update({
                  where: { id: user.id },
                  data: { email_status: 'sent', updated_at: new Date() }
                }).catch(() => {});
              } else if (user.id) {
                await prisma.leads.update({
                  where: { id: user.id },
                  data: { email_status: 'sent', updated_at: new Date() }
                }).catch(() => {});
              }
              await updateUnifiedLeadEmailStatus(user.email, 'sent');

            } catch (error) {
              console.log(
                `Attempt ${attempts} failed for ${user.email}: ${error.message}`
              );

              if (!sentSuccessfully) {
                try {
                  await recordEmailHistory({
                    email: user.email,
                    status: 'failed',
                    eventType: 'initial',
                    attemptNumber: attempts,
                    errorMessage: error.message,
                    companyId: user.isCompanyContact ? user.id : null
                  });
                } catch (historyError) {
                  console.error(`Failed to record failed email attempt for ${user.email}:`, historyError.message);
                }
              }

              if (attempts >= 3) {
                failed++;
                emailCampaignProgress.failed = failed;
                emailCampaignProgress.queued = Math.max(0, users.length - (success + failed));
                emailCampaignProgress.progress = Math.min(100, Math.round(((success + failed) / users.length) * 100));
                if (user.isCompanyContact && user.id) {
                  await prisma.company.update({
                    where: { id: user.id },
                    data: { email_status: 'failed', updated_at: new Date() }
                  }).catch(() => {});
                } else if (user.id) {
                  await prisma.leads.update({
                    where: { id: user.id },
                    data: { email_status: 'failed', updated_at: new Date() }
                  }).catch(() => {});
                }
                await updateUnifiedLeadEmailStatus(user.email, 'failed').catch((statusError) => {
                  console.error(`Failed to record failed email status for ${user.email}:`, statusError.message);
                });

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
        emailCampaignProgress.running = false;
        emailCampaignProgress.queued = 0;
        emailCampaignProgress.progress = 100;
        emailCampaignProgress.completedAt = new Date();
        emailCampaignProgress.currentContact = '';
      }
    })();

  } catch (error) {
    console.error(
      "ERROR STARTING CAMPAIGN:",
      error.message
    );
    emailCampaignRunning = false;
    emailCampaignProgress.running = false;
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

function getCampaignStatus(req, res) {
  res.json({
    running: emailCampaignRunning,
    ...emailCampaignProgress
  });
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
  getCampaignStatus,
  unsubscribe,
  startManualFollowUpCheck,
  isFollowUpCheckRunning,
  setFollowUpCheckRunning
};
