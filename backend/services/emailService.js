const { FRONTEND_BASE_URL } = require('../utils/config');
const { getFirstName, delay, randomDelayMs, escapeHtml, hasPublicBackendUrl, detectIndustry } = require('../utils/helpers');
const { buildTrackedDemoRedirectUrl, buildDemoUrl } = require('./trackingService');
const { getCampaign } = require('../productCampaigns');

let emailSendQueue = Promise.resolve();

function enqueueEmailSend(recipientEmail, sendFn) {
  const queuedSend = emailSendQueue.then(() => sendFn());

  emailSendQueue = queuedSend.then(async () => {
    const randomDelay = randomDelayMs(3, 5);

    console.log(
      `Shared email queue waiting ${Math.round(randomDelay / 60000)} minutes before next email...`
    );

    await delay(randomDelay);
  }).catch(error => {
    console.log(`Shared email queue recovered after ${recipientEmail}: ${error.message}`);
  });

  return queuedSend;
}

function buildDeliverabilityHeaders(user) {
  const recipientKey =
    Buffer.from(String(user.email || "").toLowerCase())
      .toString('hex')
      .slice(0, 16);

  return {
    'X-Mailin-Track': 'false',
    'Message-ID': `<vrm-${Date.now()}-${user.id || recipientKey}@vrmaitechnology.com>`,
    'X-Priority': '3 (Normal)',
    'X-MSMail-Priority': 'Normal',
    'Importance': 'Normal',
    'X-Entity-Ref-ID': `vrm-${user.id || recipientKey}`
  };
}

function renderButton(href, label, backgroundColor) {
  return `
    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 16px; margin-top: 20px;">
      <tr>
        <td bgcolor="${backgroundColor}" style="border-radius: 4px;">
          <a href="${escapeHtml(href)}" target="_blank" style="background-color: ${backgroundColor}; border: 1px solid ${backgroundColor}; border-radius: 4px; color: #ffffff; display: inline-block; font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; line-height: 20px; padding: 10px 18px; text-decoration: none;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

function renderEmailParagraphs(messageText, getTrackedHref, bookDemoHref) {
  const paragraphs = String(messageText || "").split('\n\n');
  const html = [];
  let hasBookDemoButton = false;

  for (let index = 0; index < paragraphs.length; index++) {
    const paragraph = paragraphs[index].trim();
    const nextParagraph = paragraphs[index + 1]?.trim() || "";
    const lines = paragraph.split('\n').map((line) => line.trim()).filter(Boolean);

    if (lines.length === 2 && /^watch demo video:$/i.test(lines[0]) && /^https?:\/\//i.test(lines[1])) {
      html.push(renderButton(getTrackedHref(lines[1], "video"), "Watch Demo Video", "#111827"));
      continue;
    }

    if (lines.length === 2 && /^book a demo:$/i.test(lines[0]) && /^https?:\/\//i.test(lines[1])) {
      hasBookDemoButton = true;
      html.push(renderButton(getTrackedHref(bookDemoHref, "demo"), "Book a Demo", "#0076FF"));
      continue;
    }

    if (/^watch demo video:$/i.test(paragraph) && /^https?:\/\//i.test(nextParagraph)) {
      html.push(renderButton(getTrackedHref(nextParagraph, "video"), "Watch Demo Video", "#111827"));
      index++;
      continue;
    }

    if (/^book a demo:$/i.test(paragraph) && /^https?:\/\//i.test(nextParagraph)) {
      hasBookDemoButton = true;
      html.push(renderButton(getTrackedHref(bookDemoHref, "demo"), "Book a Demo", "#0076FF"));
      index++;
      continue;
    }

    if (paragraph) {
      html.push(
        `<p style="margin-bottom: 16px;">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`
      );
    }
  }

  return {
    html: html.join(''),
    hasBookDemoButton
  };
}

async function executeBrevoApiNow(user, subject, messageText) {
  const firstName = getFirstName(user.name);
  const bookDemoHref = `${FRONTEND_BASE_URL}/contactus/#send-message-section`;
  const demoLink = buildTrackedDemoRedirectUrl(user.email, bookDemoHref, "demo");
  const getTrackedHref = (redirectUrl, kind) => buildTrackedDemoRedirectUrl(user.email, redirectUrl, kind);
  const deliverabilityHeaders = buildDeliverabilityHeaders(user);
  const hasGreeting = /^hi\b/i.test(String(messageText || "").trim());
  const htmlIntro = hasGreeting
    ? ""
    : `<p style="margin-bottom: 16px;">Hi ${firstName},</p>`;
  const renderedContent = renderEmailParagraphs(messageText, getTrackedHref, bookDemoHref);

  const finalHtml = `
    <html>
      <body style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333333; margin: 0; padding: 20px;">
        ${htmlIntro}
        ${renderedContent.html}
        ${renderedContent.hasBookDemoButton ? "" : `
          ${renderButton(demoLink, "Book a Demo", "#0076FF")}
        `}
      </body>
    </html>
  `;

  const emailPayload = {
    sender: { name: "VRM AI Technology", email: "contactus@vrmaitechnology.com" },
    to: [{ email: user.email, name: firstName }],
    replyTo: { email: "contactus@vrmaitechnology.com", name: "Harini" },
    subject,
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

async function executeBrevoApi(user, subject, messageText) {
  return enqueueEmailSend(user.email, () =>
    executeBrevoApiNow(user, subject, messageText)
  );
}

async function sendInitialEmail(user, product) {
  const campaign = getCampaign(product);
  if (campaign) {
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
  const campaign = getCampaign(user.product_type);
  if (campaign?.followUps?.[0]) {
    const firstName = getFirstName(user.name);
    return executeBrevoApi(
      user,
      campaign.followUps[0].subject,
      campaign.followUps[0].email.replace(/\[Name\]/g, firstName)
    );
  }

  const subject = "Following up: WorkflowAI";
  const messageText = "I wanted to quickly follow up on my previous email. I know things can get busy, but I genuinely believe WorkflowAI could save your team significant hours every week by automating manual hiring steps.\n\nDo you have a few minutes this week to see a quick demo?";
  return executeBrevoApi(user, subject, messageText);
}

async function sendFollowUp2(user) {
  const campaign = getCampaign(user.product_type);
  if (campaign?.followUps?.[1]) {
    const firstName = getFirstName(user.name);
    return executeBrevoApi(
      user,
      campaign.followUps[1].subject,
      campaign.followUps[1].email.replace(/\[Name\]/g, firstName)
    );
  }

  const subject = "Checking in one last time";
  const messageText = "I'm checking in one last time regarding WorkflowAI. If automation isn't a priority for your team right now, I completely understand and won't crowd your inbox further.\n\nHowever, if you're still curious about how we streamline screening and assessments, you can always book a quick walkthrough below.";
  return executeBrevoApi(user, subject, messageText);
}

async function sendFollowUp3(user) {
  const campaign = getCampaign(user.product_type);
  if (campaign?.followUps?.[2]) {
    const firstName = getFirstName(user.name);
    return executeBrevoApi(
      user,
      campaign.followUps[2].subject,
      campaign.followUps[2].email.replace(/\[Name\]/g, firstName)
    );
  }

  const subject = "Final follow-up: WorkflowAI";
  const messageText = "This is my final follow-up regarding WorkflowAI. If automation becomes a priority for your team later, you can always use the demo link below to book a quick walkthrough.\n\nWishing you and your team the best.";
  return executeBrevoApi(user, subject, messageText);
}

module.exports = {
  enqueueEmailSend,
  executeBrevoApiNow,
  executeBrevoApi,
  sendInitialEmail,
  sendFollowUp1,
  sendFollowUp2,
  sendFollowUp3
};
