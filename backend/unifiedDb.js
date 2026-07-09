const { PrismaClient } = require('@prisma/client');

const unifiedDatabaseUrl = process.env.DATABASE_URL;
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
    followUpCount,
    createdAt: lead.created_at,
    updatedAt: lead.updated_at,
    product: metadata.product_type || 'workflow_ai'
  };
}

function statusSummaryForLead(lead, statuses = []) {
  if (!lead) return {};

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
    deleted: lead.status === 'deleted',
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
    return leadToUser(saved, statusSummaryForLead(saved, await prisma.lead_status.findMany({ where: { lead_id: saved.id } })));
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
  return lead ? leadToUser(lead, statusSummaryForLead(lead, await prisma.lead_status.findMany({ where: { lead_id: lead.id } }))) : null;
}

async function getAllActiveLeads() {
  const [oldLeads, emailLeads, whatsappLeads, allOldStatuses] = await Promise.all([
    prisma.leads.findMany({ orderBy: { created_at: 'desc' } }),
    prisma.emailLeads.findMany({ orderBy: { created_at: 'desc' } }),
    prisma.whatsAppLeads.findMany({ orderBy: { created_at: 'desc' } }),
    prisma.lead_status.findMany({ orderBy: { created_at: 'asc' } })
  ]);
  
  const statusMap = {};
  for (const status of allOldStatuses) {
    if (!statusMap[status.lead_id]) statusMap[status.lead_id] = [];
    statusMap[status.lead_id].push(status);
  }

  const users = [];
  
  for (const lead of oldLeads) {
    const summary = statusSummaryForLead(lead, statusMap[lead.id] || []);
    if (!summary.deleted) users.push(leadToUser(lead, summary));
  }
  
  for (const lead of emailLeads) {
     if (lead.status === 'deleted') continue;
     users.push({
       id: lead.id,
       name: lead.name || '',
       full_name: lead.name || '',
       email: lead.email,
       phone: lead.phone || '',
       phoneNumber: lead.phone || '',
       company: lead.company || '',
       role: lead.role || '',
       source: lead.source || '',
       status: lead.status || null,
       clickCount: lead.click_count || 0,
       bookDemoClickCount: lead.demo_click_count || 0,
       videoClickCount: lead.video_click_count || 0,
       followUpCount: lead.follow_up_count || 0,
       createdAt: lead.created_at,
       updatedAt: lead.updated_at,
       product: lead.project || '',
       isEmailLead: true,
       initialEmailSent: lead.status !== 'new',
       initialEmailSentAt: lead.status !== 'new' ? lead.created_at : null
     });
  }

  for (const lead of whatsappLeads) {
     if (lead.status === 'deleted') continue;
     users.push({
       id: lead.id,
       name: lead.name || '',
       full_name: lead.name || '',
       email: lead.email || '',
       whatsappNumber: lead.whatsapp_number || '',
       whatsapp_number: lead.whatsapp_number || '',
       company: lead.company || '',
       role: lead.role || '',
       source: lead.source || '',
       status: lead.status || null,
       whatsappStatus: lead.whatsapp_status || null,
       whatsappClickCount: lead.click_count || 0,
       whatsappBookDemoClickCount: lead.demo_click_count || 0,
       whatsappVideoClickCount: lead.video_click_count || 0,
       followUpCount: lead.follow_up_count || 0,
       createdAt: lead.created_at,
       updatedAt: lead.updated_at,
       product: lead.project || '',
       isWhatsAppLead: true
     });
  }

  return users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getCampaignLeads() {
  const users = await getAllActiveLeads();
  return users.filter(user => user.isEmailLead && (!user.status || user.status === 'new'));
}

async function getFollowUpLeads() {
  const users = await getAllActiveLeads();
  return users.filter(
    (user) =>
      !user.unsubscribeStatus &&
      !user.isDeleted &&
      ['sent', 'clicked'].includes(user.status || user.Status) &&
      user.initialEmailSentAt &&
      user.followUpCount < 3
  );
}

async function updateLeadFields(email, fields = {}) {
  const existing = await prisma.leads.findUnique({ where: { email } });
  if (!existing) return null;

  const data = { updated_at: new Date() };

  if ("name" in fields) {
    data.name = fields.name;
    data.full_name = fields.name;
  }

  if ("phoneNumber" in fields || "phone" in fields) {
    data.phone_number = fields.phoneNumber || fields.phone || "";
  }

  if ("whatsappNumber" in fields) {
    data.whatsapp_number = fields.whatsappNumber;
  }

  if ("company" in fields) {
    data.company = fields.company;
  }

  if ("jobTitle" in fields || "role" in fields) {
    data.role = fields.jobTitle || fields.role;
  }

  if ("source" in fields) {
    data.source = fields.source;
  }

  if ("Status" in fields || "status" in fields) {
    data.status = fields.Status || fields.status;
  }

  // Update legacy leads table
  const updated = await prisma.leads.update({
    where: { email },
    data
  });

  // Sync EmailLeads only
  if ("Status" in fields || "status" in fields) {
    await prisma.emailLeads.updateMany({
      where: { email },
      data: {
        status: fields.Status || fields.status,
        updated_at: new Date()
      }
    });
  }

  return leadToUser(
    updated,
    statusSummaryForLead(
      updated,
      await prisma.lead_status.findMany({
        where: { lead_id: updated.id }
      })
    )
  );
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

// --- NEW DB FUNCTIONS FOR SPLIT MODELS ---

async function upsertEmailLead(user, action = 'email_lead_upsert') {
  if (!user.email) return null;
  const project = user.project || user.product_type || user.metadata?.product_type || 'workflow_ai';

  try {
    const saved = await prisma.emailLeads.upsert({
      where: { email: user.email },
      create: {
        name: user.name || user.full_name || '',
        email: user.email,
        phone: user.phone || user.phone_number || '',
        company: user.company || user.company_name || '',
        role: user.role || user.jobTitle || user.occupation || '',
        source: user.source || 'Email Upload',
        project,
        status: user.status || user.Status || 'new',
        updated_at: new Date()
      },
      update: {
        name: user.name || user.full_name || undefined,
        phone: user.phone || user.phone_number || undefined,
        company: user.company || user.company_name || undefined,
        role: user.role || user.jobTitle || user.occupation || undefined,
        source: user.source || undefined,
        project: user.project || undefined,
        status: user.status || user.Status || undefined,
        updated_at: new Date()
      }
    });
    dbLog(`DB_UPSERT_SUCCESS EmailLeads email=${user.email} action=${action}`);
    return saved;
  } catch (error) {
    dbLog(`DB_ERROR EmailLeads action=${action} ${error.message}`);
    throw error;
  }
}

async function upsertWhatsAppLead(user, action = 'whatsapp_lead_upsert') {
  const whatsappNumber = user.whatsapp_number || user.whatsappNumber || user.phone || user.phoneNumber;
  if (!whatsappNumber) return null;
  const project = user.project || user.product_type || user.metadata?.product_type || 'workflow_ai';

  try {
    const saved = await prisma.whatsAppLeads.upsert({
      where: { whatsapp_number: whatsappNumber },
      create: {
        name: user.name || user.full_name || '',
        whatsapp_number: whatsappNumber,
        email: user.email || '',
        company: user.company || user.company_name || '',
        role: user.role || user.jobTitle || user.occupation || '',
        source: user.source || 'WhatsApp Upload',
        project,
        status: user.status || user.Status || 'new',
        updated_at: new Date()
      },
      update: {
        name: user.name || user.full_name || undefined,
        email: user.email || undefined,
        company: user.company || user.company_name || undefined,
        role: user.role || user.jobTitle || user.occupation || undefined,
        source: user.source || undefined,
        project: user.project || undefined,
        status: user.status || user.Status || undefined,
        updated_at: new Date()
      }
    });
    dbLog(`DB_UPSERT_SUCCESS WhatsAppLeads phone=${whatsappNumber} action=${action}`);
    return saved;
  } catch (error) {
    dbLog(`DB_ERROR WhatsAppLeads action=${action} ${error.message}`);
    throw error;
  }
}

async function updateEmailLeadStatus(email, status, action, extra = {}) {
  try {
    const data = { updated_at: new Date() };
    if (status) data.status = status;
    if (extra.clicked) {
       data.click_count = { increment: 1 };
    }
    if (action === 'demo_clicked') {
       data.demo_click_count = { increment: 1 };
    } else if (action === 'video_clicked') {
       data.video_click_count = { increment: 1 };
    } else if (action.startsWith('follow_up_') && action.endsWith('_sent')) {
       data.follow_up_count = { increment: 1 };
    }

    const updated = await prisma.emailLeads.update({
      where: { email },
      data
    });
    dbLog(`DB_UPDATE_SUCCESS EmailLeads email=${email} action=${action}`);
    return updated;
  } catch (error) {
    dbLog(`DB_ERROR updateEmailLeadStatus email=${email} ${error.message}`);
    throw error;
  }
}

async function updateWhatsAppLeadStatus(whatsappNumber, status, action, extra = {}) {
  try {
    const data = { updated_at: new Date() };
    if (status) data.status = status;
    if (extra.whatsappStatus) data.whatsapp_status = extra.whatsappStatus;
    
    if (extra.clicked) {
       data.click_count = { increment: 1 };
    }
    if (action === 'demo_clicked') {
       data.demo_click_count = { increment: 1 };
    } else if (action === 'video_clicked') {
       data.video_click_count = { increment: 1 };
    } else if (action.startsWith('follow_up_') && action.endsWith('_sent')) {
       data.follow_up_count = { increment: 1 };
    }

    const updated = await prisma.whatsAppLeads.update({
      where: { whatsapp_number: whatsappNumber },
      data
    });
    dbLog(`DB_UPDATE_SUCCESS WhatsAppLeads number=${whatsappNumber} action=${action}`);
    return updated;
  } catch (error) {
    dbLog(`DB_ERROR updateWhatsAppLeadStatus number=${whatsappNumber} ${error.message}`);
    throw error;
  }
}

async function getEmailLeadByEmail(email) {
   return await prisma.emailLeads.findUnique({ where: { email } });
}

async function deleteUnifiedLead(identifier) {
  let deletedAny = false;
  const isEmail = identifier.includes('@');
  
  const legacyWhere = isEmail ? { email: identifier } : { whatsapp_number: identifier };
  const newWhere = isEmail ? { email: identifier } : { phone: identifier };
  const waWhere = isEmail ? { email: identifier } : { whatsapp_number: identifier };
  
  const legacyLead = await prisma.leads.findFirst({ where: legacyWhere });
  if (legacyLead) {
    await prisma.leads.delete({ where: { id: legacyLead.id } });
    deletedAny = true;
  }
  
  const emailRes = await prisma.emailLeads.deleteMany({
    where: newWhere
  });
  if (emailRes.count > 0) deletedAny = true;
  
  const waRes = await prisma.whatsAppLeads.deleteMany({
    where: waWhere
  });
  if (waRes.count > 0) deletedAny = true;
  
  return deletedAny;
}

async function getWhatsAppLeadByNumber(whatsappNumber) {
   return await prisma.whatsAppLeads.findUnique({ where: { whatsapp_number: whatsappNumber } });
}

async function getUnifiedLeadByIdentifier(identifier) {
  if (!identifier) return null;
  const isEmail = identifier.includes('@');
  
  const legacyWhere = isEmail ? { email: identifier } : { whatsapp_number: identifier };
  const emailWhere = isEmail ? { email: identifier } : { phone: identifier };
  const waWhere = isEmail ? { email: identifier } : { whatsapp_number: identifier };
  
  const legacyLead = await prisma.leads.findFirst({ where: legacyWhere });
  if (legacyLead) {
    const summary = statusSummaryForLead(legacyLead, await prisma.lead_status.findMany({ where: { lead_id: legacyLead.id } }));
    return leadToUser(legacyLead, summary);
  }
  
  const emailLead = await prisma.emailLeads.findFirst({ where: emailWhere });
  if (emailLead) return emailLead;
  
  const waLead = await prisma.whatsAppLeads.findFirst({ where: waWhere });
  if (waLead) return waLead;
  
  return null;
}

async function trackUnifiedClick(identifier, channel, action) {
  if (!identifier) return false;
  const isEmail = identifier.includes('@');
  
  const legacyWhere = isEmail ? { email: identifier } : { whatsapp_number: identifier };
  const emailWhere = isEmail ? { email: identifier } : { phone: identifier };
  const waWhere = isEmail ? { email: identifier } : { whatsapp_number: identifier };
  
  const isVideoClick = action === 'video_clicked';
  const isDemoClick = action === 'demo_clicked';

  let foundAny = false;

  // 1. Update Legacy Leads
  const legacyLead = await prisma.leads.findFirst({ where: legacyWhere });
  if (legacyLead) {
    foundAny = true;
    await updateUnifiedLeadStatus(legacyLead, channel, "clicked", action, { clicked: true, clickCount: 1, whatsappClickCount: 1 });
  }

  // 2. Update EmailLeads
  if (channel === 'email') {
    const emailLead = await prisma.emailLeads.findFirst({ where: emailWhere });
    if (emailLead && emailLead.status !== 'deleted') {
      foundAny = true;
      const data = { updated_at: new Date(), status: 'clicked' };
      data.click_count = { increment: 1 };
      if (isDemoClick) data.demo_click_count = { increment: 1 };
      if (isVideoClick) data.video_click_count = { increment: 1 };
      await prisma.emailLeads.update({ where: { id: emailLead.id }, data });
    }
  }

  // 3. Update WhatsAppLeads
  if (channel === 'whatsapp') {
    const waLead = await prisma.whatsAppLeads.findFirst({ where: waWhere });
    if (waLead && waLead.status !== 'deleted') {
      foundAny = true;
      const data = { updated_at: new Date(), status: 'clicked', whatsapp_status: 'clicked' };
      data.click_count = { increment: 1 };
      if (isDemoClick) data.demo_click_count = { increment: 1 };
      if (isVideoClick) data.video_click_count = { increment: 1 };
      await prisma.whatsAppLeads.update({ where: { id: waLead.id }, data });
    }
  }

  return foundAny;
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
  getAllActiveLeads,
  deleteUnifiedLead,
  getUnifiedLeadByIdentifier,
  trackUnifiedClick,
  upsertEmailLead,
  upsertWhatsAppLead,
  updateEmailLeadStatus,
  updateWhatsAppLeadStatus,
  getEmailLeadByEmail,
  getWhatsAppLeadByNumber
};
