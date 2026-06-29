const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const xlsx = require('xlsx');
const cron = require('node-cron');
const domainMap = require('./domainMap.json');
const axios = require('axios');
const { getCampaign, isValidProduct, resolveProduct } = require('./productCampaigns');
const {
  getUnifiedEmailDashboard,
  getUnifiedWhatsAppDashboard,
  getCampaignLeads,
  getFollowUpLeads,
  syncExistingCustomersToUnified,
  updateUnifiedLeadStatus,
  getLeadByEmail,
  upsertUnifiedLead,
  getAllActiveLeads
} = require('./unifiedDb');

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 5002;
const uploadDir = path.join(__dirname, 'uploads');

fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir });

function cleanUrl(url) {
  return String(url || "").trim().replace(/\/$/, "");
}

const BACKEND_BASE_URL = cleanUrl(
  process.env.BACKEND_BASE_URL ||
  process.env.BASE_URL ||
  ""
);

const FRONTEND_BASE_URL = cleanUrl(
  process.env.FRONTEND_BASE_URL ||
  "https://vrmaitechnology.com"
);

const SENDER_EMAIL =
  process.env.SENDER_EMAIL ||
  "contactus@vrmaitechnology.com";

function isWhatsAppEnabled() {
  return process.env.ENABLE_WHATSAPP === "true";
}

function logWhatsAppDisabled() {
  console.log("WhatsApp module disabled via ENABLE_WHATSAPP flag");
}

const POSTER_URL =
  process.env.POSTER_URL ||
  "https://drive.google.com/file/d/1w47KXS2Hpu5xu9o5H7U9qkZLFJfIw8oR/view?usp=drive_link";

function isTemporaryTunnelUrl(url) {
  return /ngrok(?:-free)?\.|trycloudflare\.com/i.test(String(url || ""));
}

function hasPublicBackendUrl() {
  // DEV TESTING ONLY: Bypassing temporary URL restriction
  // to allow tracking testing on localhost/ngrok
  return (
    process.env.ENABLE_CLICK_TRACKING_LINKS === "true" &&
    Boolean(BACKEND_BASE_URL)
  );
}

function encodeLeadRef(email) {
  return encodeURIComponent(Buffer.from(email).toString('base64'));
}

function decodeLeadRef(ref) {
  return Buffer
    .from(decodeURIComponent(ref), 'base64')
    .toString('utf8');
}

function getCookieValue(req, name) {
  const cookies = String(req.headers.cookie || "")
    .split(";")
    .map(cookie => cookie.trim());

  const match =
    cookies.find(cookie => cookie.startsWith(`${name}=`));

  return match
    ? decodeURIComponent(match.slice(name.length + 1))
    : null;
}

function getFirstName(name) {
  if (!name) return "there";

  const cleanedName = String(name)
    .replace(/[,|()/\\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanedName) return "there";

  return cleanedName.split(" ")[0];
}

function detectIndustry(email) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return "generic";

  if (domainMap[domain]) return domainMap[domain];

  const itKeywords = [
    "tech", "software", "systems", "cloud", "data", "consulting",
    "infosys", "accenture", "cognizant", "capgemini", "zoho", "oracle",
    "ibm", "deloitte", "wipro", "hcl", "tcs", "digital", "solutions",
    "cyber", "enterprise", "network", "analytics", "innovations", "labs"
  ];

  const recruitmentKeywords = [
    "staff", "recruit", "talent", "hr", "hire", "workforce", "placement", "randstad"
  ];

  const bpoKeywords = [
    "bpo", "support", "customer", "service", "outsourcing", "concentrix"
  ];

  if (itKeywords.some(kw => domain.includes(kw))) return "it_services";
  if (recruitmentKeywords.some(kw => domain.includes(kw))) return "recruitment";
  if (bpoKeywords.some(kw => domain.includes(kw))) return "bpo";

  return "generic";
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'email-whatsapp-backend'
  });
});

const LINKEDIN_BACKEND_URL = cleanUrl(
  process.env.LINKEDIN_BACKEND_URL ||
  "http://localhost:3000"
);

app.use('/linkedin-api', async (req, res) => {
  try {
    const targetUrl = `${LINKEDIN_BACKEND_URL}${req.originalUrl.replace(/^\/linkedin-api/, '')}`;
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: ['GET', 'HEAD'].includes(req.method)
        ? undefined
        : (/multipart\/form-data/i.test(req.headers['content-type'] || '') ? req : req.body),
      responseType: 'stream',
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
      headers: {
        'content-type': req.headers['content-type'] || 'application/json',
      },
    });

    res.status(response.status);
    Object.entries(response.headers || {}).forEach(([key, value]) => {
      if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    response.data.pipe(res);
  } catch (error) {
    res.status(502).json({
      error: 'LinkedIn backend unavailable',
      detail: error.message,
    });
  }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

app.use('/api/send-emails', apiLimiter);

const delay = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function randomDelayMs(minMinutes, maxMinutes) {
  const minMs = minMinutes * 60 * 1000;
  const maxMs = maxMinutes * 60 * 1000;

  return Math.floor(
    Math.random() *
    (maxMs - minMs + 1) +
    minMs
  );
}

function buildUnsubscribeUrl(email) {
  if (hasPublicBackendUrl()) {
    const token = encodeURIComponent(Buffer.from(email).toString('base64'));
    return `${BACKEND_BASE_URL}/api/unsubscribe?token=${token}`;
  }

  const body =
    encodeURIComponent(`Please unsubscribe ${email}`);

  return `mailto:${SENDER_EMAIL}?subject=Unsubscribe&body=${body}`;
}

function buildUnsubscribeHeaders(unsubscribeUrl) {
  if (process.env.ENABLE_UNSUBSCRIBE_HEADERS !== "true") {
    return {};
  }

  const headers = {
    'List-Unsubscribe': `<${unsubscribeUrl}>`
  };

  if (/^https:\/\//i.test(unsubscribeUrl)) {
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  return headers;
}

function buildDemoUrl(email) {
  return buildPosterUrl(email);
}

function buildWhatsAppDemoUrl(email) {
  if (hasPublicBackendUrl()) {
    return `${BACKEND_BASE_URL}/api/book-demo?email=${encodeURIComponent(email)}&src=wa`;
  }

  return `https://drive.google.com/file/d/1w47KXS2Hpu5xu9o5H7U9qkZLFJfIw8oR/view?usp=drive_link`;
}

function buildPosterUrl(email) {
  if (BACKEND_BASE_URL && email) {
    return `${BACKEND_BASE_URL}/api/poster?ref=${encodeLeadRef(email)}`;
  }

  return POSTER_URL;
}

function buildDeliverabilityHeaders(user, unsubscribeUrl) {
  const recipientKey =
    Buffer.from(String(user.email || "").toLowerCase())
      .toString('hex')
      .slice(0, 16);

  return {
    ...buildUnsubscribeHeaders(unsubscribeUrl),
    'X-Mailin-Track': 'false',
    'Message-ID': `<vrm-${Date.now()}-${user.id || recipientKey}@vrmaitechnology.com>`,
    'X-Priority': '3 (Normal)',
    'X-MSMail-Priority': 'Normal',
    'Importance': 'Normal',
    'X-Entity-Ref-ID': `vrm-${user.id || recipientKey}`
  };
}

async function executeBrevoApi(user, subject, messageText) {
  const firstName = getFirstName(user.name);
  const demoLink = buildDemoUrl(user.email);
  const unsubscribeUrl = buildUnsubscribeUrl(user.email);
  const deliverabilityHeaders = buildDeliverabilityHeaders(user, unsubscribeUrl);
  const hasGreeting = /^hi\b/i.test(String(messageText || "").trim());
  const textIntro = hasGreeting ? messageText : `Hi ${firstName},\n\n${messageText}`;
  const htmlIntro = hasGreeting
    ? ""
    : `<p style="margin-bottom: 16px;">Hi ${firstName},</p>`;

  const finalMessage = `${textIntro}\n\nBook a demo:\n${demoLink}`;

  const finalHtml = `
    <html>
      <body style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333333; margin: 0; padding: 20px;">
        ${htmlIntro}
        ${messageText.split('\n\n').map(p => `<p style="margin-bottom: 16px;">${p.trim().replace(/\n/g, '<br>')}</p>`).join('')}
        <p style="margin-bottom: 16px; margin-top: 24px;">
          <a href="${demoLink}" style="background-color: #0076FF; color: #ffffff; padding: 10px 18px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">Book a Demo</a>
        </p>
      </body>
    </html>
  `;

  const emailPayload = {
    sender: { name: "VRM AI Technology", email: "contactus@vrmaitechnology.com" },
    to: [{ email: user.email, name: firstName }],
    replyTo: { email: "contactus@vrmaitechnology.com", name: "Harini" },
    subject,
    textContent: finalMessage,
    htmlContent: finalHtml,
    headers: deliverabilityHeaders
  };

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify(emailPayload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  return response.json();
}

async function sendInitialEmail(user, product) {
  const campaign = getCampaign(product);
  if (campaign && product !== "workflow_ai") {
    const firstName = getFirstName(user.name);
    return executeBrevoApi(
      user,
      campaign.subject,
      campaign.email.replace(/\[Name\]/g, firstName)
    );
  }
  const industry = detectIndustry(user.email);
  const isTechCompany = industry === "it_services";
  const isPlacementConsultancy = industry === "recruitment";

  const subject = "Thought this may be useful";

  let messageText = "";

  if (isTechCompany) {
    messageText = `Hi ${getFirstName(user.name)},

I came across your company while looking at growing technology teams and thought I'd reach out.

We've been building WorkflowAI to simplify parts of the hiring process by reducing repetitive coordination involved in candidate management.

I wasn't sure whether your team is currently exploring tools like this, but I thought it might be worth introducing.

If it sounds relevant, I'd be happy to walk you through it in a short demo.

Best,
VRM AI Technology (OPC) PVT LTD`;
  } else if (isPlacementConsultancy) {
    messageText = `Hi ${getFirstName(user.name)},

I was looking at recruitment and staffing firms and came across your company.

We've been building WorkflowAI to help recruitment teams manage candidate pipelines and reduce manual follow-ups during the hiring process.

I thought it might be relevant to the work your team does.

If you're interested, I'd be happy to show how it works in a short demo.

Best,
VRM AI Technology (OPC) PVT LTD`;
  } else {
    messageText = `Hi ${getFirstName(user.name)},

I came across your company and wanted to briefly introduce ourselves.

We've been working on WorkflowAI to simplify routine HR activities by reducing manual coordination and helping teams manage employee-related workflows more efficiently.

I'm not sure if this is something your team is currently exploring, but I thought it might be worth sharing.

If it sounds relevant, I'd be happy to show you how it works in a short demo.

Best,
VRM AI Technology (OPC) PVT LTD`;
  }

  console.log("Tracking enabled:", hasPublicBackendUrl());
  console.log("Generated demo URL:", buildDemoUrl(user.email));

  return executeBrevoApi(user, subject, messageText);
}

async function sendFollowUp1(user) {
  const subject = "Following up: WorkflowAI";
  const messageText = "I wanted to quickly follow up on my previous email. I know things can get busy, but I genuinely believe WorkflowAI could save your team significant hours every week by automating manual hiring steps.\n\nDo you have a few minutes this week to see a quick demo?";
  return executeBrevoApi(user, subject, messageText);
}

async function sendFollowUp2(user) {
  const subject = "Checking in one last time";
  const messageText = "I'm checking in one last time regarding WorkflowAI. If automation isn't a priority for your team right now, I completely understand and won't crowd your inbox further.\n\nHowever, if you're still curious about how we streamline screening and assessments, you can always book a quick walkthrough below.";
  return executeBrevoApi(user, subject, messageText);
}

async function saveLeads(results, filePath, res) {
  let added = 0;
  let skipped = 0;
  const uploadBatchId = `email-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const uploadedAt = new Date().toISOString();

  for (let user of results) {
    try {
      const existing = await getLeadByEmail(user.email);

      await upsertUnifiedLead({
        name: user.name,
        email: user.email,
        phoneNumber: user.phone,
        product_type: user.product_type || 'workflow_ai',
        metadata: {
          product_type: user.product_type || 'workflow_ai',
          email_campaign_uploaded: true,
          email_campaign_uploaded_at: uploadedAt,
          email_upload_batch_id: uploadBatchId
        },
        source: "File Upload",
        Status: existing?.Status || existing?.status || "new"
      }, "email_excel_uploaded");

      if (existing) {
        skipped++;
      } else {
        added++;
      }
    } catch (err) {
      console.log("Lead save error:", err.message);
    }
  }

  fs.unlinkSync(filePath);

  return res.json({
    message: `Added ${added} new leads. Updated ${skipped} existing leads. This upload batch contains ${results.length} campaign leads.`,
    uploadBatchId,
    campaignLeadCount: results.length
  });
}

app.get('/api/ingestion/all', async (req, res) => {
  try {
    res.json(await getAllActiveLeads());
  } catch (err) {
    console.error("Failed to fetch unified email leads:", err.message);
    res.status(500).json({
      error: "Failed to fetch customers"
    });
  }
});

app.post('/api/upload-leads', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded"
      });
    }

    const fileName = req.file.originalname.toLowerCase();
    const results = [];
    console.log("------ UPLOAD DEBUG LOGS ------");
    console.log("Uploaded filename:", req.file.originalname);

    if (fileName.endsWith('.csv')) {
      fs.createReadStream(req.file.path)
        .pipe(
          csv({
            mapHeaders: ({ header }) =>
              header.toLowerCase().trim()
          })
        )
        .on('data', (data) => {
          const keys = Object.keys(data);
          if (results.length === 0) {
            console.log("CSV Columns detected:", keys);
          }

          const nameKey =
            keys.find(k => k.includes('name'));

          const emailKey =
            keys.find(k => k.includes('email'));

          const phoneKey = keys.find(k => k.includes('phone'));
          const productKey = keys.find(k => k.includes('product_type') || k.includes('product type'));

          if (results.length === 0) {
            console.log("CSV First row detected keys -> emailKey:", emailKey, "nameKey:", nameKey);
          }

          const name =
            nameKey ? String(data[nameKey]).trim() : "";

          const email =
            emailKey ? String(data[emailKey]).trim() : "";

          const phone =
            phoneKey ? String(data[phoneKey]).trim() : "";

          if (email) {
            results.push({
              name,
              email,
              phone,
              product_type: productKey ? String(data[productKey]).trim() || 'workflow_ai' : 'workflow_ai'
            });
          }
        })
        .on('end', async () => {
          console.log(`CSV Extract Complete. Final results.length: ${results.length}`);
          console.log("Sample extracted rows:", results.slice(0, 2));
          await saveLeads(results, req.file.path, res);
        });

    } else if (
      fileName.endsWith('.xlsx') ||
      fileName.endsWith('.xls')
    ) {
      const workbook = xlsx.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      const rows =
        xlsx.utils.sheet_to_json(sheet, {
          defval: ""
        });

      console.log("XLSX Total raw rows read:", rows.length);
      if (rows.length > 0) {
        console.log("XLSX Columns detected (from first row):", Object.keys(rows[0]));
      }

      rows.forEach((data, index) => {
        const keys = Object.keys(data);

        const nameKey =
          keys.find(k =>
            k.toLowerCase().includes('name')
          );

        const emailKey =
          keys.find(k =>
            k.toLowerCase().includes('email')
          );

        const phoneKey =
          keys.find(k =>
            k.toLowerCase().includes('phone')
          );
        const productKey = keys.find(k => {
          const key = k.toLowerCase();
          return key.includes('product_type') || key.includes('product type');
        });

        if (index === 0) {
          console.log("XLSX First row detected keys -> emailKey:", emailKey, "nameKey:", nameKey);
        }

        const name =
          nameKey ? String(data[nameKey]).trim() : "";

        const email =
          emailKey ? String(data[emailKey]).trim() : "";

        const phone =
          phoneKey ? String(data[phoneKey]).trim() : "";

        if (email) {
          results.push({
            name,
            email,
            phone,
            product_type: productKey ? String(data[productKey]).trim() || 'workflow_ai' : 'workflow_ai'
          });
        }
      });

      console.log(`XLSX Extract Complete. Final results.length: ${results.length}`);
      console.log("Sample extracted rows:", results.slice(0, 2));

      await saveLeads(results, req.file.path, res);

    } else {
      fs.unlinkSync(req.file.path);

      return res.status(400).json({
        error: "Invalid file type. Please upload CSV, XLSX, or XLS file."
      });
    }

  } catch (err) {
    console.error("Upload error:", err.message);

    res.status(500).json({
      error: "Upload failed"
    });
  }
});

// --- WHATSAPP CLOUD API INTEGRATION ---
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

  // Support template variables: customer name, company name, demo link
  const firstName = getFirstName(user.name);
  const companyName = industry === "it_services" ? "your tech team" : (industry === "recruitment" ? "your staffing team" : "your team");
  const demoLink = buildWhatsAppDemoUrl(user.email);

  // Clean phone number, ensure digits only
  let cleanPhone = String(phone).replace(/\D/g, '');

  // If the number is exactly 10 digits, assume it's an Indian number missing the '91' country code
  if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone;
  }

  // Sample WhatsApp API payload for all 3 templates
  const payload = {
    messaging_product: "whatsapp",
    to: cleanPhone,
    type: "template",
    template: {
      name: templateName,
      language: {
        code: "en" // or en_US, adjust to match your approved template language
      },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: firstName }
          ]
        }
      ]
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

async function sendWhatsAppFollowUp(user, followUpNumber, industry) {
  if (!isWhatsAppEnabled()) {
    logWhatsAppDisabled();
    return { skipped: true, reason: "whatsapp_disabled" };
  }

  const phone = user.phone || user.phoneNumber;
  if (!phone) {
    console.log(`WhatsApp Follow-Up skipped for ${user.email} - No phone number found.`);
    return;
  }

  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.log("WhatsApp skipped - Missing WHATSAPP_TOKEN or PHONE_NUMBER_ID in .env");
    return;
  }

  let templateName = "";
  if (industry === "it_services") {
    templateName = "techhiring_v3";
  } else if (industry === "recruitment") {
    templateName = "placement_v3";
  } else {
    templateName = "nontech_v3";
  }

  const firstName = getFirstName(user.name);
  const demoLink = buildWhatsAppDemoUrl(user.email);

  let cleanPhone = String(phone).replace(/\D/g, '');
  if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone;
  }

  const payload = {
    messaging_product: "whatsapp",
    to: cleanPhone,
    type: "template",
    template: {
      name: templateName,
      language: {
        code: "en"
      },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: firstName }
          ]
        }
      ]
    }
  };

  try {
    const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    await updateUnifiedLeadStatus(user, "whatsapp", "sent", `follow_up_${followUpNumber}_sent`, {
      whatsappStatus: "sent"
    });

    console.log(`WhatsApp Follow-Up ${followUpNumber} '${templateName}' sent to ${phone} (User: ${user.email}) - Message ID: ${response.data.messages[0].id}`);
  } catch (error) {
    console.log(`WhatsApp Follow-Up API Error for ${user.email}:`, error.response?.data || error.message);
  }
}
// --------------------------------------

app.post('/api/reset', async (req, res) => {
  await prisma.customer.updateMany({
    data: {
      Status: null,
      clickCount: 0,
      reminderCount: 0,
      lastEmailSentAt: null
    }
  });

  res.json({
    success: true
  });
});

let emailCampaignRunning = false;

app.post('/api/send-emails', async (req, res) => {
  if (emailCampaignRunning) {
    return res.status(409).json({ error: 'An email campaign is already running.' });
  }

  emailCampaignRunning = true;

  try {
    const requestedProduct = String(req.body?.product || '').trim();
    if (!isValidProduct(requestedProduct)) {
      emailCampaignRunning = false;
      return res.status(400).json({ success: false, error: 'Please select a valid product.' });
    }
    const product = resolveProduct(requestedProduct);
    const users = await getCampaignLeads(product);

    res.json({
      success: true,
      message: "Email campaign started in background"
    });

    (async () => {
      try {
        let success = 0;
        let failed = 0;

        for (const [userIndex, user] of users.entries()) {
          let sentSuccessfully = false;
          let attempts = 0;

          while (!sentSuccessfully && attempts < 3) {
            try {
              attempts++;

              const leadProduct = product;
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

              if (user.Status !== "clicked") {
                await updateUnifiedLeadStatus(user, "email", "sent", "initial_sent", {
                  Status: "sent",
                  lastEmailSentAt: new Date(),
                  initialEmailSentAt: new Date()
                });
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

          if (userIndex < users.length - 1) {
            const randomDelay = randomDelayMs(3, 5);

            console.log(
              `Waiting ${Math.round(randomDelay / 60000)} minutes before next email...`
            );

            await delay(randomDelay);
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
});

app.get('/api/demo', async (req, res) => {
  const ref = req.query.ref || getCookieValue(req, 'vrm_lead_ref');
  const queryEmail = String(req.query.email || "").trim();

  if (ref || queryEmail) {
    try {
      const email = ref ? decodeLeadRef(ref) : queryEmail;
      const user = await getLeadByEmail(email);

      await updateUnifiedLeadStatus(user || { email }, "email", "clicked", "demo_clicked", {
        Status: "clicked",
        clicked: true,
        clickCount: 1
      });

      console.log("Demo clicked by:", email);

    } catch (error) {
      console.log("Demo tracking error:", error.message);
    }
  }

  if (req.query.redirectUrl) {
    return res.redirect(String(req.query.redirectUrl));
  }

  return res.redirect(`${FRONTEND_BASE_URL}/contactus/#send-message-section`);
});

app.get('/api/poster', async (req, res) => {
  const { ref } = req.query;

  if (ref) {
    try {
      const email = decodeLeadRef(ref);
      const user = await getLeadByEmail(email);

      await updateUnifiedLeadStatus(user || { email }, "email", "clicked", "poster_clicked", {
        Status: "clicked",
        clicked: true,
        clickCount: 1
      });

      console.log("Poster clicked by:", email);

    } catch (error) {
      console.log("Poster tracking error:", error.message);
    }
  }

  return res.redirect(POSTER_URL);
});

app.get('/api/book-demo', async (req, res) => {
  const { email, src } = req.query;

  if (email && src === 'wa') {
    try {
      const user = await getLeadByEmail(email);

      await updateUnifiedLeadStatus(user || { email }, "whatsapp", "clicked", "demo_clicked", {
        whatsappStatus: "clicked",
        clicked: true,
        clickCount: 1,
        whatsappClickCount: 1
      });

      console.log(`WhatsApp Demo clicked by: ${email}`);
    } catch (error) {
      console.log("WhatsApp Demo tracking error:", error.message);
    }
  }

  return res.redirect(`${FRONTEND_BASE_URL}/contactus`);
});

app.all('/api/unsubscribe', async (req, res) => {
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
    await updateUnifiedLeadStatus({ email }, "email", "unsubscribed", "unsubscribe", {
      unsubscribeStatus: true
    });

    return res.status(200).send("You have been unsubscribed.");

  } catch (error) {
    console.log("Unsubscribe error:", error.message);

    return res.status(400).send("Unable to unsubscribe this address.");
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    res.json(await getUnifiedEmailDashboard());

  } catch (error) {
    res.status(500).json({
      error: "Dashboard fetch failed"
    });
  }
});

app.get('/api/whatsapp/dashboard', async (req, res) => {
  try {
    res.json(await getUnifiedWhatsAppDashboard());
  } catch (error) {
    res.status(500).json({
      error: "WhatsApp Dashboard fetch failed"
    });
  }
});

app.delete('/api/lead/:email', async (req, res) => {
  const email = req.params.email;

  try {
      const deletedLead =
      await prisma.customer.update({
        where: {
          email
        },
        data: {
          isDeleted: true
        }
      });
      await updateUnifiedLeadStatus(deletedLead, "email", "deleted", "lead_deleted", {
        source: "deleted"
      });

    res.json({
      success: true,
      message: "Lead deleted successfully",
      lead: deletedLead
    });

  } catch (error) {
    if (error.code === 'P2025') {
      res.status(404).json({
        error: "Lead not found"
      });
    } else {
      res.status(500).json({
        error: "Failed to delete lead"
      });
    }
  }
});

app.post('/api/contact', async (req, res) => {
  try {
    console.log("Contact form received:", req.body);

    return res.status(200).json({
      success: true,
      message: "Message received successfully"
    });

  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

let lastFollowUpDbWarningAt = 0;
let followUpCheckRunning = false;
const DEFAULT_FOLLOW_UP_CRON_SCHEDULE = '0 10,18 * * *';
const FOLLOW_UP_CRON_SCHEDULE = cron.validate(process.env.FOLLOW_UP_CRON_SCHEDULE || '')
  ? process.env.FOLLOW_UP_CRON_SCHEDULE
  : DEFAULT_FOLLOW_UP_CRON_SCHEDULE;
const FOLLOW_UP_CRON_TIMEZONE = process.env.FOLLOW_UP_CRON_TIMEZONE || 'Asia/Kolkata';

async function runFollowUpEmailCheck() {
  console.log("Checking follow-up emails...");

  try {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (dbError) {
      const nowMs = Date.now();
      if (nowMs - lastFollowUpDbWarningAt > 5 * 60 * 1000) {
        console.log(
          "Follow-up check skipped: database unavailable"
        );
        lastFollowUpDbWarningAt = nowMs;
      }
      return {
        success: false,
        skipped: true,
        reason: "database_unavailable"
      };
    }

    const now = new Date();
    let checked = 0;
    let eligible = 0;
    let sent = 0;
    let failed = 0;

    // Find users who received initial email but haven't clicked
    const followUpUsers = await getFollowUpLeads();

    for (let user of followUpUsers) {
      checked++;
      const timeSinceInitial = now - new Date(user.initialEmailSentAt);
      const dayMs = 1000 * 60 * 60 * 24;

      let sendFollowUp = null;

      // Day 3 Follow-up
      if (!user.followUp1Sent && timeSinceInitial >= (3 * dayMs)) {
        sendFollowUp = "1";
      }
      // Day 7 Follow-up
      else if (user.followUp1Sent && !user.followUp2Sent && timeSinceInitial >= (7 * dayMs)) {
        sendFollowUp = "2";
      }

      if (!sendFollowUp) {
        continue;
      }

      eligible++;

      try {
        let brevoResult;

        if (sendFollowUp === "1") {
          brevoResult = await sendFollowUp1(user);
          await updateUnifiedLeadStatus(user, "email", "sent", "follow_up_1_sent", {
            followUp1Sent: true,
            lastEmailSentAt: new Date()
          });
        } else if (sendFollowUp === "2") {
          brevoResult = await sendFollowUp2(user);
          await updateUnifiedLeadStatus(user, "email", "sent", "follow_up_2_sent", {
            followUp2Sent: true,
            lastEmailSentAt: new Date()
          });
        }

        console.log(
          `Follow-up ${sendFollowUp} sent to ${user.email} (Message ID: ${brevoResult?.messageId || "accepted"})`
        );

        sent++;

        const randomDelay = randomDelayMs(3, 5);
        await delay(randomDelay);

      } catch (error) {
        failed++;
        console.log(
          `Follow-up ${sendFollowUp} failed for ${user.email}: ${error.message}`
        );
      }
    }

    console.log(
      `Follow-up check finished. Checked: ${checked}, Eligible: ${eligible}, Sent: ${sent}, Failed: ${failed}`
    );

    return {
      success: true,
      checked,
      eligible,
      sent,
      failed
    };

  } catch (error) {
    console.log(
      "Follow-up check error:",
      error.message
    );
    return {
      success: false,
      error: error.message
    };
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

app.get('/api/follow-ups/check', startManualFollowUpCheck);
app.post('/api/follow-ups/check', startManualFollowUpCheck);

if (process.env.ENABLE_FOLLOW_UP_CRON === "true") {
  cron.schedule(FOLLOW_UP_CRON_SCHEDULE, async () => {
    if (followUpCheckRunning) {
      console.log("Follow-up cron skipped: check already running");
      return;
    }

    followUpCheckRunning = true;
    try {
      await runFollowUpEmailCheck();
    } finally {
      followUpCheckRunning = false;
    }
  }, {
    timezone: FOLLOW_UP_CRON_TIMEZONE
  });
} else {
  console.log("Automatic follow-up cron disabled. Use /api/follow-ups/check to run follow-ups manually.");
}

//async function backfillExistingCustomersToUnifiedDb() {
 // try {
 //   const customers = await prisma.customer.findMany({
   //   where: { isDeleted: false }
    //});
    //await syncExistingCustomersToUnified(customers);
  //} catch (error) {
   // console.log(`DB_ERROR existing_customer_backfill ${error.message}`);
 // }
//}

const server = app.listen(PORT, () => {
  console.log(
    `Server running on port ${PORT}`
  );

  //backfillExistingCustomersToUnifiedDb();
});

async function shutdown(signal) {
  console.log(`${signal} received. Closing server...`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log("Database connection closed.");
      process.exit(0);
    } catch (error) {
      console.error("Shutdown error:", error.message);
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
