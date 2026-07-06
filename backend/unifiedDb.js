const { PrismaClient } = require('@prisma/client');

const unifiedDatabaseUrl = process.env.UNIFIED_DATABASE_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: unifiedDatabaseUrl
    }
  }
});

function dbLog(message) {
  console.log(message);
}

const FOLLOW_UP_ACTIVE_STATUSES = ['sent', 'clicked'];
const FOLLOW_UP_STOP_STATUSES = ['converted_to_lead', 'follow_up_sent'];

function normalizeLead(user = {}) {
  const productType = user.product_type || user.productType || user.metadata?.product_type || 'workflow_ai';
  return {
    full_name: user.full_name || user.name || '',
    name: user.name || user.full_name || '',
    email: user.email || '',
    phone_number: user.phone_number || user.phoneNumber || user.phone || '',
    whatsapp_number:
      user.whatsapp_number ||
      user.whatsappNumber ||
      user.phone_number ||
      user.phoneNumber ||
      user.phone ||
      '',
    company: user.company || user.company_name || '',
    company_name: user.company_name || user.company || '',
    role: user.role || user.jobTitle || user.occupation || '',
    occupation: user.occupation || user.jobTitle || user.role || '',
    source: user.source || 'Email Upload',
    status: user.status || user.Status || 'new',
    metadata: { ...(user.metadata || {}), product_type: productType }
  };
}

function leadToUser(lead, statusSummary = {}) {
  if (!lead) return null;
  const metadata = lead.metadata && typeof lead.metadata === 'object' ? lead.metadata : {};
  const followUpCount = [
    statusSummary.followUp1Sent,
    statusSummary.followUp2Sent,
    statusSummary.followUp3Sent
  ].filter(Boolean).length;
  return {
    id: lead.id,
    name: lead.name || lead.full_name || '',
    full_name: lead.full_name || lead.name || '',
    email: lead.email,
    phoneNumber: lead.phone_number || '',
    phone: lead.phone_number || '',
    whatsappNumber: lead.whatsapp_number || '',
    whatsapp_number: lead.whatsapp_number || '',
    company: lead.company || lead.company_name || '',
    jobTitle: lead.role || lead.occupation || '',
    role: lead.role || lead.occupation || '',
    source: lead.source || '',
    Status: lead.status || null,
    status: lead.status || null,
    clickCount: statusSummary.emailClicks || 0,
    bookDemoClickCount: statusSummary.bookDemoClicks || 0,
    videoClickCount: statusSummary.videoClicks || 0,
    whatsappClickCount: statusSummary.whatsappClicks || 0,
    whatsappBookDemoClickCount: statusSummary.whatsappBookDemoClicks || 0,
    whatsappVideoClickCount: statusSummary.whatsappVideoClicks || 0,
    whatsappStatus: statusSummary.whatsappStatus || null,
    unsubscribeStatus: Boolean(statusSummary.unsubscribed),
    isDeleted: Boolean(statusSummary.deleted),
    initialEmailSentAt: statusSummary.initialEmailSentAt || null,
    initialEmailSent: Boolean(statusSummary.initialEmailSent),
    lastEmailSentAt: statusSummary.lastEmailSentAt || null,
    followUp1Sent: Boolean(statusSummary.followUp1Sent),
    followUp2Sent: Boolean(statusSummary.followUp2Sent),
    followUp3Sent: Boolean(statusSummary.followUp3Sent),
    followUpCount,
    followUpStatus: followUpCount > 0 ? `Follow-up ${followUpCount} Sent` : 'No Follow-up Sent',
    createdAt: lead.created_at,
    updatedAt: lead.updated_at,
    product_type: metadata.product_type || 'workflow_ai',
    metadata
  };
}

async function statusSummaryForLead(lead) {
  if (!lead) return {};
  const statuses = await prisma.lead_status.findMany({
    where: {
      lead_id: lead.id
    },
    orderBy: { created_at: 'asc' }
  });

  const emailStatuses = statuses.filter((row) => row.channel === 'email');
  const whatsappStatuses = statuses.filter((row) => row.channel === 'whatsapp');
  const initial = emailStatuses.find((row) => row.action === 'initial_sent');
  const latestEmail = emailStatuses[emailStatuses.length - 1];
  const latestWhatsApp = whatsappStatuses[whatsappStatuses.length - 1];
  const postInitialEmailStatuses = initial
    ? emailStatuses.filter((row) => row.created_at >= initial.created_at)
    : [];

  return {
    emailClicks: postInitialEmailStatuses.reduce(
      (total, row) => total + Number(row.click_count || 0),
      0
    ),
    bookDemoClicks: postInitialEmailStatuses.reduce(
      (total, row) =>
        row.action === 'demo_clicked'
          ? total + Number(row.click_count || 0)
          : total,
      0
    ),
    videoClicks: postInitialEmailStatuses.filter((row) => row.action === 'video_clicked').length,
    whatsappClicks: whatsappStatuses.reduce(
      (total, row) => total + Number(row.click_count || (row.clicked ? 1 : 0)),
      0
    ),
    whatsappBookDemoClicks: whatsappStatuses.reduce(
      (total, row) =>
        row.action === 'demo_clicked'
          ? total + Number(row.click_count || (row.clicked ? 1 : 0))
          : total,
      0
    ),
    whatsappVideoClicks: whatsappStatuses.reduce(
      (total, row) =>
        row.action === 'video_clicked'
          ? total + Number(row.click_count || (row.clicked ? 1 : 0))
          : total,
      0
    ),
    whatsappStatus: latestWhatsApp?.status || null,
    unsubscribed: statuses.some(
      (row) => row.action === 'unsubscribe' || row.status === 'unsubscribed'
    ),
    deleted: statuses.some(
      (row) => row.action === 'lead_deleted' || row.status === 'deleted'
    ),
    initialEmailSentAt: initial?.created_at || null,
    initialEmailSent: Boolean(initial),
    lastEmailSentAt: latestEmail?.created_at || null,
    followUp1Sent: statuses.some((row) => row.action === 'follow_up_1_sent'),
    followUp2Sent: statuses.some((row) => row.action === 'follow_up_2_sent'),
    followUp3Sent: statuses.some((row) => row.action === 'follow_up_3_sent')
  };
}

async function insertAutomationLog(action, message, lead = {}, level = 'info') {
  const EXCLUDED_LOG_ACTIONS = [
    'email_excel_uploaded',
    'email_initial_sent_lead_sync',
    'email_poster_clicked_lead_sync',
    'email_demo_clicked_lead_sync'
  ];

  if (EXCLUDED_LOG_ACTIONS.includes(action)) {
    return;
  }

  try {
    const leadId = lead.id || (lead.email
      ? (await prisma.leads.findUnique({ where: { email: lead.email } }))?.id
      : null);
    await prisma.automation_logs.create({
      data: {
        lead_id: leadId || null,
        email: lead.email || null,
        level,
        action,
        message,
        source: 'email_whatsapp_backend',
        metadata: lead.metadata || {}
      }
    });
    dbLog(`DB_INSERT_SUCCESS automation_logs action=${action}`);
  } catch (error) {
    dbLog(`DB_ERROR automation_logs action=${action} ${error.message}`);
  }
}

async function upsertUnifiedLead(user, action = 'lead_upsert') {
  const lead = normalizeLead(user);
  if (!lead.email) return null;

  try {
    const existing = await prisma.leads.findUnique({ where: { email: lead.email } });
    const existingMetadata = existing?.metadata && typeof existing.metadata === 'object'
      ? existing.metadata
      : {};
    const mergedMetadata = { ...existingMetadata, ...(lead.metadata || {}) };
    const saved = await prisma.leads.upsert({
      where: { email: lead.email },
      create: {
        ...lead,
        updated_at: new Date()
      },
      update: {
        full_name: lead.full_name || undefined,
        name: lead.name || undefined,
        phone_number: lead.phone_number || undefined,
        whatsapp_number: lead.whatsapp_number || undefined,
        company: lead.company || undefined,
        company_name: lead.company_name || undefined,
        role: lead.role || undefined,
        occupation: lead.occupation || undefined,
        source: lead.source || undefined,
        status: lead.status || undefined,
        metadata: mergedMetadata,
        updated_at: new Date()
      }
    });
    dbLog(`DB_UPDATE_SUCCESS leads action=${action}`);
    await insertAutomationLog(action, `Lead synced: ${lead.email}`, saved);
    return leadToUser(saved, await statusSummaryForLead(saved));
  } catch (error) {
    dbLog(`DB_ERROR leads action=${action} ${error.message}`);
    throw error;
  }
}

async function updateUnifiedLeadStatus(user, channel, status, action, extra = {}) {
  const existing = user?.email
    ? await prisma.leads.findUnique({ where: { email: user.email } })
    : null;
  const isProtectedFollowUpStatus =
    FOLLOW_UP_STOP_STATUSES.includes(existing?.status) &&
    channel !== 'manual' &&
    status !== 'follow_up_sent' &&
    !['deleted', 'unsubscribed'].includes(status);
  const nextStatus = isProtectedFollowUpStatus ? existing.status : status;

  const savedUser = await upsertUnifiedLead(
    { ...user, status: nextStatus, Status: nextStatus },
    `${channel}_${action}_lead_sync`
  );
  if (!savedUser?.email) return null;

  try {
    const created = await prisma.lead_status.create({
      data: {
        lead_id: savedUser.id,
        email: savedUser.email,
        channel,
        action,
        status: nextStatus,
        clicked: Boolean(extra.clicked),
        click_count: Number(extra.clickCount || extra.whatsappClickCount || 0),
        metadata: extra,
        updated_at: new Date()
      }
    });
    dbLog(`DB_INSERT_SUCCESS lead_status channel=${channel} status=${nextStatus}`);
    await insertAutomationLog(
      `${channel}.${action}`,
      `${channel} status ${nextStatus}: ${savedUser.email}`,
      savedUser
    );
    return created;
  } catch (error) {
    dbLog(`DB_ERROR lead_status channel=${channel} status=${status} ${error.message}`);
    throw error;
  }
}

async function getLeadByEmail(email) {
  if (!email) return null;
  const lead = await prisma.leads.findUnique({ where: { email } });
  return lead ? leadToUser(lead, await statusSummaryForLead(lead)) : null;
}

async function getAllActiveLeads() {
  const leads = await prisma.leads.findMany({
    orderBy: { created_at: 'desc' }
  });
  const users = [];
  for (const lead of leads) {
    const summary = await statusSummaryForLead(lead);
    if (!summary.deleted) users.push(leadToUser(lead, summary));
  }
  return users;
}

async function getCampaignLeads() {
  const users = await getAllActiveLeads();
  const uploaded = users.filter(
    (user) =>
      !user.unsubscribeStatus &&
      !user.isDeleted &&
      (!user.Status || user.Status === 'new') &&
      !user.initialEmailSent &&
      user.clickCount === 0 &&
      user.whatsappClickCount === 0 &&
      user.metadata?.email_campaign_uploaded === true &&
      Boolean(user.metadata?.email_upload_batch_id)
  );
  const latestBatch = uploaded
    .map(user => ({
      id: user.metadata.email_upload_batch_id,
      at: String(user.metadata.email_campaign_uploaded_at || '')
    }))
    .sort((a, b) => b.at.localeCompare(a.at))[0]?.id;

  if (!latestBatch) return [];
  return uploaded.filter(user => user.metadata.email_upload_batch_id === latestBatch);
}

async function getFollowUpLeads() {
  const users = await getAllActiveLeads();
  return users.filter(
    (user) =>
      !user.unsubscribeStatus &&
      !user.isDeleted &&
      FOLLOW_UP_ACTIVE_STATUSES.includes(user.Status) &&
      !FOLLOW_UP_STOP_STATUSES.includes(user.Status) &&
      user.initialEmailSentAt &&
      (!user.followUp1Sent || !user.followUp2Sent || !user.followUp3Sent)
  );
}

async function updateLeadFields(email, fields = {}) {
  const existing = await prisma.leads.findUnique({ where: { email } });
  if (!existing) return null;

  const data = { updated_at: new Date() };
  if ('name' in fields) {
    data.name = fields.name;
    data.full_name = fields.name;
  }
  if ('phoneNumber' in fields || 'phone' in fields) {
    data.phone_number = fields.phoneNumber || fields.phone || '';
  }
  if ('whatsappNumber' in fields) data.whatsapp_number = fields.whatsappNumber;
  if ('company' in fields) data.company = fields.company;
  if ('jobTitle' in fields || 'role' in fields) {
    data.role = fields.jobTitle || fields.role;
  }
  if ('source' in fields) data.source = fields.source;
  if ('Status' in fields || 'status' in fields) {
    data.status = fields.Status || fields.status;
  }

  const updated = await prisma.leads.update({
    where: { email },
    data
  });
  return leadToUser(updated, await statusSummaryForLead(updated));
}

async function resetCampaignLeads() {
  await prisma.leads.updateMany({
    data: {
      status: null,
      updated_at: new Date()
    }
  });
  await prisma.lead_status.deleteMany({
    where: {
      action: {
        in: [
          'initial_sent',
          'follow_up_1_sent',
          'follow_up_2_sent',
          'demo_clicked',
          'poster_clicked',
          'template_sent'
        ]
      }
    }
  });
}

async function getUnifiedEmailDashboard() {
  const users = await getAllActiveLeads();
  const sentUsers = users.filter((user) => user.initialEmailSent);
  return {
    total: users.length,
    sent: sentUsers.length,
    clickedUsers: sentUsers.filter((user) => user.clickCount > 0).length,
    totalClicks: sentUsers.reduce((total, user) => total + user.clickCount, 0)
  };
}

async function getUnifiedWhatsAppDashboard() {
  const users = await getAllActiveLeads();
  const metaWebsiteClicks = Number(process.env.WHATSAPP_WEBSITE_CLICK_COUNT || 0);
  const trackedClicks = users.reduce(
    (total, user) => total + user.whatsappClickCount,
    0
  );

  return {
    totalLeads: users.length,
    whatsappSent: users.filter((user) =>
      ['sent', 'clicked'].includes(user.whatsappStatus)
    ).length,
    clickedUsers: users.filter((user) => user.whatsappClickCount > 0).length,
    bookDemoClicks: users.reduce(
      (total, user) => total + user.whatsappBookDemoClickCount,
      0
    ),
    videoClicks: users.reduce(
      (total, user) => total + user.whatsappVideoClickCount,
      0
    ),
    totalClicks: metaWebsiteClicks || trackedClicks,
    users
  };
}

async function findLeadIdByEmail(email) {
  return (await prisma.leads.findUnique({
    where: { email },
    select: { id: true }
  }))?.id || null;
}

module.exports = {
  upsertUnifiedLead,
  updateUnifiedLeadStatus,
  insertAutomationLog,
  getUnifiedEmailDashboard,
  getUnifiedWhatsAppDashboard,
  getCampaignLeads,
  getFollowUpLeads,
  getLeadByEmail,
  updateLeadFields,
  resetCampaignLeads,
  findLeadIdByEmail,
  getAllActiveLeads
};
