const prisma = require('./prismaClient');

function dbLog(message) {
  console.log(message);
}

const FOLLOW_UP_ACTIVE_STATUSES = ['sent', 'clicked'];
const FOLLOW_UP_STOP_STATUSES = ['converted_to_lead', 'follow_up_sent'];

function normalizeLead(user = {}) {
  return {
    full_name: user.full_name || user.name || '',
    email: user.email || '',
    phone_number: user.phone_number || user.phoneNumber || user.phone || null,
    whatsapp_number: user.whatsapp_number || user.whatsappNumber || null,
    facebook_url: user.facebook_url || null,
    linkedin_url: user.linkedin_url || null,
    company_name: user.company_name || user.company || null,
    address: user.address || null,
    note: user.note || user.notes || null,
    role: user.role || user.jobTitle || null,
    source: user.source || 'Email Upload',
    status: user.status || user.Status || 'new',
    email_status: user.email_status || 'not sent',
    user_id: user.user_id || undefined,
  };
}

function leadToUser(lead, statusSummary = {}) {
  if (!lead) return null;
  const followUpCount = [
    statusSummary.followUp1Sent,
    statusSummary.followUp2Sent,
    statusSummary.followUp3Sent
  ].filter(Boolean).length;
  return {
    id: lead.id,
    name: lead.full_name || '',
    full_name: lead.full_name || '',
    email: lead.email,
    phoneNumber: lead.phone_number || '',
    phone: lead.phone_number || '',
    whatsappNumber: lead.whatsapp_number || '',
    whatsapp_number: lead.whatsapp_number || '',
    company: lead.company_name || '',
    note: lead.note || '',
    notes: lead.note || '',
    jobTitle: lead.role || '',
    role: lead.role || '',
    source: lead.source || '',
    status: lead.status || null,
    email_status: lead.email_status || 'not sent',
    address: lead.address || '',
    facebook_url: lead.facebook_url || '',
    linkedin_url: lead.linkedin_url || '',
    user_id: lead.user_id || null,
    createdByName: lead.owner?.employee_name || null,
    clickCount: statusSummary.emailClicks || 0,
    bookDemoClickCount: statusSummary.bookDemoClicks || 0,
    videoClickCount: statusSummary.videoClicks || 0,
    whatsappClickCount: statusSummary.whatsappClicks || 0,
    whatsappBookDemoClickCount: statusSummary.whatsappBookDemoClicks || 0,
    whatsappVideoClickCount: statusSummary.whatsappVideoClicks || 0,
    whatsappStatus: statusSummary.whatsappStatus || (lead.status === 'sent' ? 'sent' : (lead.status === 'failed' ? 'failed' : null)),
    failureReason: statusSummary.whatsappFailReason || (lead.status === 'failed' ? (statusSummary.whatsappFailReason || 'Message undeliverable') : null),
    read: Boolean(lead.whatsapp_read || statusSummary.whatsappRead),
    unsubscribeStatus: Boolean(statusSummary.unsubscribed),
    isDeleted: Boolean(statusSummary.deleted),
    initialEmailSentAt: statusSummary.initialEmailSentAt || null,
    initialEmailSent: Boolean(statusSummary.initialEmailSent),
    lastEmailSentAt: statusSummary.lastEmailSentAt || null,
    followUpCount,
    createdAt: lead.created_at,
    updatedAt: lead.updated_at,
    product: 'workflow_ai'
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
    whatsappFailReason: latestWhatsApp?.status === 'failed' ? (latestWhatsApp?.metadata?.reason || latestWhatsApp?.metadata?.error || 'Message undeliverable') : null,
    whatsappRead: Boolean(lead.whatsapp_read || whatsappStatuses.some((row) => row.action === 'read' || row.status === 'read')),
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

function getWhatsAppTemplateStatuses(statusRows, leads = []) {
  const statusesByPhone = new Map();
  const phoneByLeadId = new Map(leads.map((lead) => [
    lead.id,
    String(lead.whatsapp_number || lead.phone_number || '').replace(/\D/g, '').slice(-10)
  ]));

  const addStatus = (phone, templateName, messageStatus, reason, messageId, timestamp) => {
    const digits = String(phone || '').replace(/\D/g, '');
    const phoneKey = digits.slice(-10);
    if (!phoneKey || !templateName) return;

    let templates = statusesByPhone.get(phoneKey);
    if (!templates) {
      templates = new Map();
      statusesByPhone.set(phoneKey, templates);
    }

    const current = templates.get(templateName);
    const updatedAt = timestamp ? new Date(timestamp).getTime() : 0;
    const currentUpdatedAt = current?.updatedAt ? new Date(current.updatedAt).getTime() : 0;
    if (current && currentUpdatedAt > updatedAt) return;

    templates.set(templateName, {
      templateName,
      status: messageStatus || 'sent',
      failureReason: reason || null,
      messageId: messageId || null,
      updatedAt: timestamp || null
    });
  };

  for (const row of statusRows) {
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    if (row.action === 'whatsapp_conversation') {
      const chats = Array.isArray(metadata.Chat)
        ? metadata.Chat
        : (metadata.Chat && typeof metadata.Chat === 'object' ? [metadata.Chat] : []);
      for (const chat of chats) {
        if (chat?.direction !== 'outbound') continue;
        const error = chat.error || {};
        const templateName = chat.templateName
          || chat.template?.name
          || String(chat.text || '').match(/^Template sent:\s*(.+)$/i)?.[1]?.trim();
        addStatus(
          chat.to || chat.recipientId,
          templateName,
          chat.status || 'accepted',
          error.details || error.message || error.title,
          chat.messageId,
          chat.statusTimestamp || chat.timestamp || row.updated_at || row.created_at
        );
      }
    }

    if (metadata.templateName && (row.status === 'failed' || row.status === 'sent')) {
      const phone = metadata.company?.phone
        || metadata.lead?.phone
        || metadata.phone
        || metadata.whatsappNumber
        || (row.lead_id ? phoneByLeadId.get(row.lead_id) : null)
        || row.email;
      addStatus(
        phone,
        metadata.templateName,
        row.status,
        metadata.reason || metadata.details || metadata.error,
        metadata.messageId,
        row.updated_at || row.created_at
      );
    }
  }

  return statusesByPhone;
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
        metadata: {}
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
    const saved = await prisma.leads.upsert({
      where: { email: lead.email },
      create: {
        ...lead,
        updated_at: new Date()
      },
      update: {
        full_name: lead.full_name || undefined,
        phone_number: lead.phone_number || undefined,
        whatsapp_number: lead.whatsapp_number || undefined,
        company_name: lead.company_name || undefined,
        role: lead.role || undefined,
        source: lead.source || undefined,
        status: lead.status || undefined,
        email_status: user.email_status ? lead.email_status : undefined,
        note: lead.note || undefined,
        address: lead.address || undefined,
        facebook_url: lead.facebook_url || undefined,
        linkedin_url: lead.linkedin_url || undefined,
        user_id: lead.user_id,
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
    prisma.leads.findMany({
      orderBy: { created_at: 'desc' },
      include: { owner: { select: { employee_name: true } } }
    }),
    prisma.emailLeads.findMany({ orderBy: { created_at: 'desc' } }),
    prisma.whatsAppLeads.findMany({ orderBy: { created_at: 'desc' } }),
    prisma.lead_status.findMany({ orderBy: { created_at: 'asc' } })
  ]);
  
  const statusMap = {};
  const failReasonByPhone = {};
  for (const status of allOldStatuses) {
    if (status.lead_id) {
      if (!statusMap[status.lead_id]) statusMap[status.lead_id] = [];
      statusMap[status.lead_id].push(status);
    }
    if (status.channel === 'whatsapp' && status.status === 'failed') {
      const reason = status.metadata?.reason || status.metadata?.error || 'Message undeliverable';
      if (status.email) {
        const digits = String(status.email).replace(/\D/g, '');
        if (digits.length >= 10) failReasonByPhone[digits.slice(-10)] = reason;
      }
    }
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
     const pDigits = String(lead.whatsapp_number || '').replace(/\D/g, '');
     const pLast10 = pDigits.slice(-10);
     const isFailed = lead.whatsapp_status === 'failed' || lead.status === 'failed';
     const failReason = isFailed
       ? (failReasonByPhone[pLast10] || 'Message undeliverable')
       : null;

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
       read: Boolean(lead.read),
       failureReason: failReason,
       createdAt: lead.created_at,
       updatedAt: lead.updated_at,
       product: lead.project || '',
       isWhatsAppLead: true
     });
  }

  const templateStatusesByPhone = getWhatsAppTemplateStatuses(allOldStatuses, oldLeads);
  for (const user of users) {
    const digits = String(user.whatsappNumber || user.phoneNumber || user.phone || '').replace(/\D/g, '');
    const templateStatuses = [...(templateStatusesByPhone.get(digits.slice(-10))?.values() || [])];
    if (!templateStatuses.length) {
      user.whatsappTemplateStatuses = [];
      continue;
    }

    user.whatsappTemplateStatuses = templateStatuses;
    const failures = templateStatuses
      .filter((item) => item.status === 'failed')
      .map((item) => `${item.templateName}: ${item.failureReason || 'Message undeliverable'}`);
    if (failures.length) user.failureReason = failures.join('; ');
  }

  return users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getManualLeads() {
  return prisma.leads.findMany({
    where: {
      OR: [
        { source: 'Manual Entry' },
        { user_id: { not: null } },
      ],
    },
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      full_name: true,
      company_name: true,
      email: true,
      phone_number: true,
      whatsapp_number: true,
      facebook_url: true,
      linkedin_url: true,
      role: true,
      note: true,
      email_status: true,
      address: true,
      source: true,
      status: true,
      created_at: true,
      user_id: true,
      owner: { select: { employee_name: true } }
    }
  });
}

async function getActiveUserById(id) {
  return prisma.users.findFirst({
    where: { id, is_active: true },
    select: { id: true, employee_name: true }
  });
}

async function createManualLead(lead) {
  return prisma.$transaction(async (transaction) => {
    const savedLead = await transaction.leads.create({
      data: {
        ...lead,
        source: lead.source || 'Manual Entry',
        status: lead.status || 'new',
        email_status: lead.email_status || 'not sent',
        user_id: lead.user_id || undefined,
        updated_at: new Date()
      },
      select: {
        id: true,
        full_name: true,
        email: true,
        phone_number: true,
        whatsapp_number: true,
        facebook_url: true,
        linkedin_url: true,
        company_name: true,
        role: true,
        source: true,
        status: true,
        note: true,
        email_status: true,
        address: true,
        created_at: true,
        user_id: true,
        owner: { select: { employee_name: true } }
      }
    });

    return savedLead;
  });
}

async function updateManualLead(id, lead) {
  const existing = await prisma.leads.findUnique({ where: { id } });
  if (!existing || (existing.source !== 'Manual Entry' && existing.user_id === null)) return null;

  const updated = await prisma.leads.update({
    where: { id },
    data: {
      full_name: lead.full_name ?? existing.full_name,
      whatsapp_number: lead.whatsapp_number ?? existing.whatsapp_number,
      facebook_url: lead.facebook_url ?? existing.facebook_url,
      linkedin_url: lead.linkedin_url ?? existing.linkedin_url,
      company_name: lead.company_name ?? existing.company_name,
      phone_number: lead.phone_number ?? existing.phone_number,
      email: 'email' in lead ? lead.email : existing.email,
      role: lead.role ?? existing.role,
      source: lead.source || 'Manual Entry',
      status: lead.status ?? existing.status,
      note: lead.note ?? existing.note,
      email_status: lead.email_status ?? existing.email_status,
      address: lead.address ?? existing.address,
      user_id: 'user_id' in lead ? (lead.user_id || null) : existing.user_id,
      updated_at: new Date()
    },
    select: {
      id: true,
      full_name: true,
      email: true,
      phone_number: true,
      whatsapp_number: true,
      facebook_url: true,
      linkedin_url: true,
      company_name: true,
      role: true,
      source: true,
      status: true,
      note: true,
      email_status: true,
      address: true,
      created_at: true,
      user_id: true,
      owner: { select: { employee_name: true } }
    }
  });

  return updated;
}

async function recordEmailHistory({
  email,
  status,
  attemptNumber = 1,
  eventType = 'initial',
  providerMessageId = null,
  errorMessage = null,
  companyId = null
}) {
  const [lead, company] = await Promise.all([
    companyId || !email
      ? Promise.resolve(null)
      : prisma.leads.findUnique({
        where: { email },
        select: { id: true, user_id: true }
      }),
    companyId
      ? prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, user_id: true }
      })
      : Promise.resolve(null)
  ]);
  const attemptedAt = new Date();

  return prisma.email_history.create({
    data: {
      user_id: company?.user_id || lead?.user_id || null,
      lead_id: lead?.id || null,
      company_id: company?.id || null,
      recipient_email: email,
      event_type: eventType,
      status,
      attempt_number: attemptNumber,
      provider_message_id: providerMessageId,
      error_message: errorMessage,
      attempted_at: attemptedAt,
      sent_at: status === 'sent' ? attemptedAt : null
    }
  });
}

async function syncCompanyEmailLead(company, syncEmailStatus = false) {
  if (!company.email) return null;

  const email = company.email.trim().toLowerCase();
  // Do not save or create in emailLeads table
  return prisma.emailLeads.findUnique({ where: { email } }).catch(() => null);
}

function companyEmailContact(company, emailLead) {
  const trackedStatus = emailLead?.status;
  const status = ['clicked', 'follow_up_sent', 'converted_to_lead'].includes(trackedStatus)
    ? trackedStatus
    : company.email_status || trackedStatus || 'not sent';

  return {
    id: company.id,
    name: company.full_name || '',
    full_name: company.full_name || '',
    email: company.email.trim().toLowerCase(),
    phone: company.phone_number || '',
    phoneNumber: company.phone_number || '',
    company: company.company_name || '',
    role: company.role || '',
    source: company.source || 'Company',
    status,
    email_status: company.email_status || 'not sent',
    clickCount: emailLead?.click_count || 0,
    bookDemoClickCount: emailLead?.demo_click_count || 0,
    videoClickCount: emailLead?.video_click_count || 0,
    followUpCount: emailLead?.follow_up_count || 0,
    createdAt: company.created_at,
    updatedAt: company.updated_at,
    product_type: emailLead?.project || 'workflow_ai',
    isEmailLead: true,
    isCompanyContact: true
  };
}

async function getCampaignLeads() {
  const [users, companies] = await Promise.all([
    getAllActiveLeads(),
    prisma.company.findMany({
      where: { email_status: { in: ['not sent', 'new', 'failed'] } },
      orderBy: { created_at: 'desc' }
    })
  ]);
  const leadsByEmail = new Map();
  for (const user of users) {
    const isUnsent = ['not sent', 'new', 'failed'].includes(user.email_status) ||
      (user.isEmailLead && (!user.status || ['new', 'failed'].includes(user.status)));
    if (user.email && isUnsent) {
      leadsByEmail.set(user.email.toLowerCase(), user);
    }
  }
  const companyEmailLeads = await Promise.all(
    companies.map((company) => syncCompanyEmailLead(company))
  );
  for (const [index, company] of companies.entries()) {
    if (!company.email) continue;
    leadsByEmail.set(
      company.email.toLowerCase(),
      companyEmailContact(company, companyEmailLeads[index])
    );
  }
  return [...leadsByEmail.values()];
}

async function getCompanyEmailContacts() {
  const companies = await prisma.company.findMany({
    orderBy: { created_at: 'desc' }
  });
  const companiesByEmail = new Map();
  for (const company of companies) {
    if (!company.email) continue;
    const email = company.email.trim().toLowerCase();
    if (!companiesByEmail.has(email)) companiesByEmail.set(email, company);
  }

  const companyEntries = [...companiesByEmail.entries()];
  const emailLeads = await Promise.all(
    companyEntries.map(([, company]) => syncCompanyEmailLead(company))
  );
  return companyEntries.map(([email, company], index) => {
    const contact = companyEmailContact(company, emailLeads[index]);
    return { ...contact, email };
  });
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

  if ("name" in fields || "full_name" in fields) {
    data.full_name = fields.full_name || fields.name;
  }

  if ("phoneNumber" in fields || "phone" in fields) {
    data.phone_number = fields.phoneNumber || fields.phone || "";
  }

  if ("whatsappNumber" in fields) {
    data.whatsapp_number = fields.whatsappNumber;
  }

  if ("company" in fields) {
    data.company_name = fields.company;
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

async function syncCompanyWhatsAppLead(company) {
  const whatsappNumber = String(company.whatsapp_number || company.phone_number || '').trim();
  if (!whatsappNumber) return null;

  const digits = whatsappNumber.replace(/\D/g, '');
  const last10 = digits.slice(-10);
  const existing = await prisma.whatsAppLeads.findFirst({
    where: {
      OR: [
        { whatsapp_number: whatsappNumber },
        { whatsapp_number: digits },
        { whatsapp_number: `+${digits}` },
        ...(last10 ? [{ whatsapp_number: { contains: last10 } }] : [])
      ]
    }
  });
  const companyData = {
    name: company.full_name || company.company_name || 'Company Contact',
    email: company.email || undefined,
    company: company.company_name || undefined,
    role: company.role || undefined,
    source: company.source || 'Company',
    updated_at: new Date()
  };

  const saved = existing
    ? await prisma.whatsAppLeads.update({
      where: { id: existing.id },
      data: companyData
    })
    : await prisma.whatsAppLeads.create({
      data: {
        ...companyData,
        whatsapp_number: whatsappNumber,
        status: company.status || 'new',
        project: 'workflow_ai',
        created_at: new Date()
      }
    });

  const statusHistory = await prisma.lead_status.findFirst({
    where: {
      channel: 'whatsapp',
      action: 'company_contact_synced',
      email: company.email || whatsappNumber
    }
  });
  if (!statusHistory) {
    await prisma.lead_status.create({
      data: {
        email: company.email || whatsappNumber,
        channel: 'whatsapp',
        action: 'company_contact_synced',
        status: company.status || 'new',
        metadata: {
          company: {
            id: company.id,
            name: company.company_name || null,
            phone: whatsappNumber
          }
        },
        created_at: new Date()
      }
    });
  }

  return saved;
}

async function updateUnifiedLeadEmailStatus(email, status) {
  if (!email) return null;
  const normalizedEmail = email.trim();
  const [leadsRes, companyRes] = await Promise.allSettled([
    prisma.leads.updateMany({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      data: { email_status: status, updated_at: new Date() }
    }),
    prisma.company.updateMany({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      data: { email_status: status, updated_at: new Date() }
    })
  ]);
  return { leadsRes, companyRes };
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
    const rawNumber = String(whatsappNumber || '').trim();
    const digits = rawNumber.replace(/\D/g, '');
    const last10 = digits.slice(-10);

    // 1. Resolve the matching lead and company contact.
    let manualLead = null;
    if (extra.user?.id && !extra.user?.isCompanyContact && !extra.user?.isWhatsAppLead && !extra.user?.isEmailLead && Number.isInteger(Number(extra.user.id))) {
      manualLead = await prisma.leads.findUnique({ where: { id: Number(extra.user.id) } });
    } else if (!extra.user?.isCompanyContact && !extra.user?.isWhatsAppLead && !extra.user?.isEmailLead && extra.user?.email) {
      manualLead = await prisma.leads.findUnique({ where: { email: extra.user.email } });
    } else if (!extra.user?.isCompanyContact && !extra.user?.isWhatsAppLead && !extra.user?.isEmailLead && last10) {
      manualLead = await prisma.leads.findFirst({
        where: {
          OR: [
            { whatsapp_number: { contains: last10 } },
            { phone_number: { contains: last10 } }
          ]
        }
      });
    }

    let companyRecord = null;
    const companyIdValue = extra.user?.originalId || (extra.user?.isCompanyContact ? Number(String(extra.user.id).replace('company-', '')) : null);
    const companyId = Number(companyIdValue);
    if (Number.isInteger(companyId) && companyId > 0) {
      companyRecord = await prisma.company.findUnique({ where: { id: companyId } });
    } else if (last10) {
      companyRecord = await prisma.company.findFirst({
        where: {
          OR: [
            { whatsapp_number: { contains: last10 } },
            { phone_number: { contains: last10 } }
          ]
        }
      });
    }

    const companyName = extra.user?.company || extra.user?.company_name || companyRecord?.company_name || null;
    const statusMetadata = {
      ...(extra.metadata && typeof extra.metadata === 'object' && !Array.isArray(extra.metadata) ? extra.metadata : {}),
      ...(extra.reason ? { reason: extra.reason, code: extra.errorCode } : {}),
      ...(companyRecord || extra.user?.isCompanyContact ? {
        company: {
          id: companyRecord?.id || (Number.isInteger(companyId) ? companyId : null),
          name: companyName,
          phone: companyRecord?.whatsapp_number || companyRecord?.phone_number || rawNumber
        }
      } : {})
    };

    // Chat and button events share one conversation row; other status changes remain event rows.
    if (!extra.skipStatusHistory) {
      try {
        await prisma.lead_status.create({
          data: {
            lead_id: manualLead ? manualLead.id : null,
            email: manualLead?.email || companyRecord?.email || extra.user?.email || rawNumber,
            channel: 'whatsapp',
            action: action || (status === 'failed' ? 'failed' : 'template_sent'),
            status: status || 'sent',
            click_count: extra.clicked ? 1 : 0,
            metadata: Object.keys(statusMetadata).length > 0 ? statusMetadata : null,
            created_at: new Date()
          }
        });
      } catch (err) {
        dbLog(`lead_status create notice: ${err.message}`);
      }
    }

    if (manualLead) {
      try {
        const leadUpdateData = {
          updated_at: new Date()
        };
        if (extra.read === true || action === 'read') {
          leadUpdateData.whatsapp_read = true;
        }
        await prisma.leads.update({
          where: { id: manualLead.id },
          data: leadUpdateData
        });
      } catch (err) {
        dbLog(`leads update notice: ${err.message}`);
      }
    }
    // 2. Update company contacts (prisma.company).
    if (companyRecord) {
      const companyData = {
        updated_at: new Date()
      };
      if (extra.read === true || action === 'read') {
        companyData.whatsapp_read = true;
      }
      if (action === 'demo_clicked') {
        companyData.demo_click_count = (companyRecord.demo_click_count || 0) + 1;
      } else if (action === 'video_clicked') {
        companyData.video_click_count = (companyRecord.video_click_count || 0) + 1;
      }
      try {
        await prisma.company.update({
          where: { id: companyRecord.id },
          data: companyData
        });
      } catch (err) {
        dbLog(`company update notice: ${err.message}`);
      }
    }

    // 3. Update or upsert in WhatsAppLeads table.
    const waLead = await prisma.whatsAppLeads.findFirst({
      where: {
        OR: [
          { whatsapp_number: rawNumber },
          { whatsapp_number: digits },
          { whatsapp_number: `+${digits}` },
          ...(last10 ? [{ whatsapp_number: { contains: last10 } }] : [])
        ]
      }
    });

    const waData = { updated_at: new Date() };
    if (extra.user?.name || companyRecord?.full_name || manualLead?.full_name) {
      waData.name = extra.user?.name || companyRecord?.full_name || manualLead?.full_name;
    }
    if (extra.user?.email || companyRecord?.email || manualLead?.email) {
      waData.email = extra.user?.email || companyRecord?.email || manualLead?.email;
    }
    if (companyName || manualLead?.company_name) {
      waData.company = companyName || manualLead.company_name;
    }
    if (extra.user?.role || companyRecord?.role || manualLead?.role) {
      waData.role = extra.user?.role || companyRecord?.role || manualLead?.role;
    }
    if (extra.user?.source || companyRecord?.source || manualLead?.source) {
      waData.source = extra.user?.source || companyRecord?.source || manualLead?.source;
    }
    if (extra.user?.product_type || extra.user?.project) {
      waData.project = extra.user.project || extra.user.product_type;
    }
    if (status) waData.status = status;
    if (extra.whatsappStatus) waData.whatsapp_status = extra.whatsappStatus;
    if (extra.read === true || action === 'read') waData.read = true;
    if (extra.clicked) waData.click_count = { increment: 1 };
    if (action === 'demo_clicked') waData.demo_click_count = { increment: 1 };
    else if (action === 'video_clicked') waData.video_click_count = { increment: 1 };
    else if (action && action.startsWith('follow_up_') && action.endsWith('_sent')) {
      waData.follow_up_count = { increment: 1 };
    }

    let updated = null;
    if (waLead) {
      updated = await prisma.whatsAppLeads.update({
        where: { id: waLead.id },
        data: waData
      });
    } else if (rawNumber) {
      try {
        updated = await prisma.whatsAppLeads.create({
          data: {
            name: extra.user?.name || manualLead?.full_name || companyRecord?.full_name || 'Contact',
            whatsapp_number: rawNumber,
            email: extra.user?.email || manualLead?.email || companyRecord?.email || null,
            company: companyName || manualLead?.company_name || null,
            role: extra.user?.role || companyRecord?.role || manualLead?.role || null,
            source: extra.user?.source || companyRecord?.source || manualLead?.source || 'WhatsApp',
            project: extra.user?.project || extra.user?.product_type || null,
            status: status || 'sent',
            whatsapp_status: extra.whatsappStatus || status || 'sent',
            read: Boolean(extra.read === true || action === 'read'),
            created_at: new Date(),
            updated_at: new Date()
          }
        });
      } catch (err) {
        dbLog(`WhatsAppLeads create fallback notice: ${err.message}`);
      }
    }

    if (!extra.quiet) {
      dbLog(`DB_UPDATE_SUCCESS WhatsAppLeads number=${whatsappNumber} action=${action}`);
    }
    return updated || manualLead || companyRecord;
  } catch (error) {
    dbLog(`DB_ERROR updateWhatsAppLeadStatus number=${whatsappNumber} ${error.message}`);
    return null;
  }
}

async function recordWhatsAppChat(whatsappNumber, message, contactName) {
  const contact = await findWhatsAppContactByNumber(whatsappNumber);
  if (!contact.last10) return null;
  const createdAtSeconds = Number(message?.timestamp);
  const parsedCreatedAt = Number.isFinite(createdAtSeconds) && createdAtSeconds > 0
    ? new Date(createdAtSeconds * 1000)
    : null;
  const createdAt = parsedCreatedAt && !Number.isNaN(parsedCreatedAt.getTime())
    ? parsedCreatedAt
    : new Date();
  const messageType = String(message?.type || 'unknown');
  const chat = {
    from: contact.rawNumber,
    contactName: contactName || null,
    messageId: message?.id || null,
    timestamp: message?.timestamp || createdAt.toISOString(),
    type: messageType,
  };

  if (messageType === 'text') {
    chat.text = message.text?.body || '';
  } else if (messageType === 'interactive') {
    chat.interactive = message.interactive || null;
  } else if (messageType === 'button') {
    chat.button = message.button || null;
  } else {
    chat.content = message[messageType] || null;
  }

  return upsertWhatsAppConversationEvent(contact, { kind: 'message', chat }, createdAt);
}

async function findWhatsAppContactByNumber(whatsappNumber) {
  const rawNumber = String(whatsappNumber || '').trim();
  const digits = rawNumber.replace(/\D/g, '');
  const last10 = digits.slice(-10);
  if (!rawNumber || !last10) return { rawNumber, digits, last10, manualLead: null, companyRecord: null, whatsappLead: null };

  const phoneMatch = {
    OR: [
      { whatsapp_number: { contains: last10 } },
      { phone_number: { contains: last10 } },
    ],
  };
  const [manualLead, companyRecord, whatsappLead] = await Promise.all([
    prisma.leads.findFirst({ where: phoneMatch }),
    prisma.company.findFirst({ where: phoneMatch }),
    prisma.whatsAppLeads.findFirst({ where: { whatsapp_number: { contains: last10 } } }),
  ]);
  return { rawNumber, digits, last10, manualLead, companyRecord, whatsappLead };
}

function getWhatsAppContactMetadata(contact) {
  const metadata = {};
  if (contact.companyRecord) {
    metadata.company = {
      id: contact.companyRecord.id,
      name: contact.companyRecord.company_name || contact.companyRecord.full_name || null,
      phone: contact.companyRecord.whatsapp_number || contact.companyRecord.phone_number || contact.rawNumber,
    };
  } else if (contact.manualLead) {
    metadata.lead = {
      id: contact.manualLead.id,
      name: contact.manualLead.full_name,
      phone: contact.manualLead.whatsapp_number || contact.manualLead.phone_number || contact.rawNumber,
    };
  }
  return metadata;
}

function getWhatsAppConversationIdentity(contact) {
  return contact.manualLead?.email
    || contact.companyRecord?.email
    || contact.whatsappLead?.email
    || contact.last10;
}

async function upsertWhatsAppConversationEvent(contact, event, eventDate = new Date()) {
  const identity = getWhatsAppConversationIdentity(contact);
  const chatEvent = event.kind === 'message' ? event.chat : null;
  const buttonEvent = event.kind === 'button' ? event.button : null;

  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT 1::int AS locked
      FROM (SELECT pg_advisory_xact_lock(hashtext(${contact.last10}))) AS contact_lock
    `;

    const existing = await transaction.lead_status.findFirst({
      where: {
        channel: 'whatsapp',
        action: 'whatsapp_conversation',
        OR: [
          { email: identity },
          { email: { contains: contact.last10 } },
        ],
      },
      orderBy: { updated_at: 'desc' },
    });
    const metadata = existing?.metadata && typeof existing.metadata === 'object'
      ? { ...existing.metadata }
      : getWhatsAppContactMetadata(contact);
    if (!metadata.company && !metadata.lead) {
      Object.assign(metadata, getWhatsAppContactMetadata(contact));
    }

    const chatHistory = Array.isArray(metadata.Chat)
      ? [...metadata.Chat]
      : (metadata.Chat && typeof metadata.Chat === 'object' ? [metadata.Chat] : []);
    const buttonHistory = Array.isArray(metadata.Buttons)
      ? [...metadata.Buttons]
      : (metadata.Button && typeof metadata.Button === 'object' ? [metadata.Button] : []);

    if (chatEvent) {
      const existingMessageIndex = chatEvent.messageId
        ? chatHistory.findIndex((item) => item?.messageId === chatEvent.messageId)
        : -1;
      if (existingMessageIndex >= 0) {
        const previousMessage = chatHistory[existingMessageIndex];
        const statusPriority = { sent: 1, delivered: 2, read: 3, failed: 4 };
        const previousPriority = statusPriority[previousMessage.status] || 0;
        const nextPriority = statusPriority[chatEvent.status] || 0;
        const mergedMessage = {
          ...previousMessage,
          ...chatEvent,
        };
        if (chatEvent.status && previousMessage.timestamp) {
          mergedMessage.timestamp = previousMessage.timestamp;
        }
        if (previousPriority > nextPriority) {
          mergedMessage.status = previousMessage.status;
          mergedMessage.statusTimestamp = previousMessage.statusTimestamp;
        }
        chatHistory[existingMessageIndex] = {
          ...mergedMessage,
        };
      } else {
        chatHistory.push(chatEvent);
      }
    }
    if (buttonEvent) {
      const alreadyStored = buttonEvent.eventId
        && buttonHistory.some((item) => item?.eventId === buttonEvent.eventId);
      if (!alreadyStored) buttonHistory.push(buttonEvent);
    }
    metadata.Chat = chatHistory;
    delete metadata.Button;
    if (buttonHistory.length) metadata.Buttons = buttonHistory;

    const data = {
      lead_id: contact.manualLead?.id || existing?.lead_id || null,
      email: identity,
      channel: 'whatsapp',
      action: 'whatsapp_conversation',
      status: 'active',
      metadata,
      updated_at: new Date(),
    };
    if (existing) {
      return transaction.lead_status.update({
        where: { id: existing.id },
        data,
      });
    }
    return transaction.lead_status.create({
      data: { ...data, created_at: eventDate },
    });
  });
}

async function recordWhatsAppButtonEvent(whatsappNumber, button) {
  const contact = await findWhatsAppContactByNumber(whatsappNumber);
  if (!contact.last10) return null;
  return upsertWhatsAppConversationEvent(contact, {
    kind: 'button',
    button: {
      name: button.name,
      url: button.url,
      timestamp: button.timestamp || new Date().toISOString(),
      eventId: button.eventId || null,
    },
  }, new Date(button.timestamp || Date.now()));
}

async function recordWhatsAppMessageStatus(whatsappNumber, statusUpdate) {
  const contact = await findWhatsAppContactByNumber(whatsappNumber);
  const messageId = String(statusUpdate?.id || '').trim();
  const status = String(statusUpdate?.status || '').trim().toLowerCase();
  if (!contact.last10 || !messageId || !status) return null;

  const timestampSeconds = Number(statusUpdate.timestamp);
  const timestamp = Number.isFinite(timestampSeconds) && timestampSeconds > 0
    ? new Date(timestampSeconds * 1000).toISOString()
    : new Date().toISOString();
  const error = statusUpdate.errors?.[0];
  return upsertWhatsAppConversationEvent(contact, {
    kind: 'message',
    chat: {
      from: process.env.PHONE_NUMBER_ID || null,
      to: contact.rawNumber,
      direction: 'outbound',
      messageId,
      timestamp,
      status,
      statusTimestamp: timestamp,
      ...(error ? {
        error: {
          code: error.code || null,
          title: error.title || null,
          details: error.error_data?.details || error.message || null,
        },
      } : {}),
    },
  }, new Date(timestamp));
}

async function getWhatsAppConversation(whatsappNumber) {
  const contact = await findWhatsAppContactByNumber(whatsappNumber);
  if (!contact.last10) return [];

  const emails = [
    contact.manualLead?.email,
    contact.companyRecord?.email,
    contact.whatsappLead?.email,
  ].filter(Boolean);
  const statusFilters = [
    { email: { contains: contact.last10 } },
    ...(emails.length ? [{ email: { in: emails } }] : []),
    ...(contact.manualLead ? [{ lead_id: contact.manualLead.id }] : []),
  ];
  const history = await prisma.lead_status.findMany({
    where: {
      channel: 'whatsapp',
      OR: statusFilters,
    },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  });

  const events = history.flatMap((entry) => {
    const metadata = entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
    const events = [];
    if (metadata.Chat && typeof metadata.Chat === 'object') {
      const chats = Array.isArray(metadata.Chat) ? metadata.Chat : [metadata.Chat];
      chats.forEach((chat, index) => {
        const interactiveReply = chat.interactive?.button_reply?.title;
        const buttonReply = chat.button?.text || chat.button?.payload;
        const body = chat.text || interactiveReply || buttonReply || '';
        const timestampSeconds = Number(chat.timestamp);
        const timestamp = Number.isFinite(timestampSeconds) && timestampSeconds > 0
          ? new Date(timestampSeconds * 1000)
          : (chat.timestamp || entry.created_at);
        events.push({
          id: `chat-${entry.id}-${index}`,
          kind: 'message',
          direction: chat.direction || (entry.action === 'chat_sent' ? 'outbound' : 'inbound'),
          messageId: chat.messageId || null,
          templateName: chat.templateName || null,
          text: body || (chat.type && chat.type !== 'text' ? `[${chat.type} message]` : ''),
          type: chat.type || 'text',
          interactive: chat.interactive || null,
          status: chat.status || null,
          statusTimestamp: chat.statusTimestamp || null,
          error: chat.error || null,
          timestamp,
        });
      });
    }

    if (metadata.Button && typeof metadata.Button === 'object') {
      events.push({
        id: `button-${entry.id}`,
        kind: 'button',
        name: metadata.Button.name || 'Button clicked',
        timestamp: entry.created_at,
      });
    }
    if (Array.isArray(metadata.Buttons)) {
      metadata.Buttons.forEach((button, index) => {
        events.push({
          id: `button-${entry.id}-${index}`,
          kind: 'button',
          name: button.name || 'Button clicked',
          timestamp: button.timestamp || entry.created_at,
        });
      });
    }
    return events;
  });
  return events.sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
}

async function recordWhatsAppOutboundChat(whatsappNumber, text, messageId, messageDetails = null) {
  const contact = await findWhatsAppContactByNumber(whatsappNumber);
  if (!contact.last10) throw new Error('A valid WhatsApp phone number is required.');

  const timestamp = new Date();
  return upsertWhatsAppConversationEvent(contact, {
    kind: 'message',
    chat: {
      from: process.env.PHONE_NUMBER_ID || null,
      to: contact.rawNumber,
      direction: 'outbound',
      messageId: messageId || null,
      timestamp: timestamp.toISOString(),
      type: messageDetails?.type === 'cta_url' ? 'interactive' : (messageDetails?.type || 'text'),
      text,
      ...(messageDetails?.type === 'cta_url' || messageDetails?.type === 'interactive'
        ? { interactive: { ...messageDetails, type: 'cta_url' } }
        : {}),
      ...(messageDetails?.templateName ? { templateName: messageDetails.templateName } : {}),
    },
  }, timestamp);
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

    // 2b. Also update Company table if this email belongs to a company contact
    if (isEmail) {
      try {
        const company = await prisma.company.findFirst({
          where: { email: { equals: identifier, mode: 'insensitive' } }
        });
        if (company) {
          foundAny = true;
          await prisma.company.update({
            where: { id: company.id },
            data: { status: 'clicked', updated_at: new Date() }
          });
          dbLog(`DB_UPDATE_SUCCESS company email_click company_id=${company.id}`);
        }
      } catch (companyErr) {
        dbLog(`DB_ERROR company click update ${companyErr.message}`);
      }
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

async function getEmailLeadsByEmails(emails = []) {
  if (!emails.length) return [];
  const uniqueEmails = [...new Set(emails.map((email) => String(email).trim()).filter(Boolean))];
  if (!uniqueEmails.length) return [];
  const [leads, generalLeads, companies] = await Promise.all([
    prisma.emailLeads.findMany({
      where: {
        email: { in: uniqueEmails, mode: 'insensitive' },
        OR: [{ status: 'new' }, { status: 'failed' }, { status: null }]
      },
      orderBy: { created_at: 'desc' }
    }),
    prisma.leads.findMany({
      where: {
        email: { in: uniqueEmails, mode: 'insensitive' },
        email_status: { in: ['not sent', 'new', 'failed'] }
      },
      orderBy: { created_at: 'desc' }
    }),
    prisma.company.findMany({
      where: {
        email: { in: uniqueEmails, mode: 'insensitive' },
        email_status: { in: ['not sent', 'new', 'failed'] }
      },
      orderBy: { created_at: 'desc' }
    })
  ]);
  const resultsByEmail = new Map(leads.map((lead) => [
    lead.email.toLowerCase(),
    {
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
      email_status: lead.status === 'new' ? 'not sent' : (lead.status || 'not sent'),
      clickCount: lead.click_count || 0,
      bookDemoClickCount: lead.demo_click_count || 0,
      videoClickCount: lead.video_click_count || 0,
      followUpCount: lead.follow_up_count || 0,
      createdAt: lead.created_at,
      updatedAt: lead.updated_at,
      product: lead.project || '',
      product_type: lead.project || '',
      isEmailLead: true,
      initialEmailSent: lead.status !== 'new',
      initialEmailSentAt: lead.status !== 'new' ? lead.created_at : null
    }
  ]));
  for (const lead of generalLeads) {
    if (!lead.email) continue;
    const emailKey = lead.email.toLowerCase();
    if (!resultsByEmail.has(emailKey)) {
      resultsByEmail.set(emailKey, {
        id: lead.id,
        name: lead.full_name || '',
        full_name: lead.full_name || '',
        email: lead.email,
        phone: lead.phone_number || '',
        phoneNumber: lead.phone_number || '',
        company: lead.company_name || '',
        role: lead.role || '',
        source: lead.source || 'Leads',
        status: lead.status || null,
        email_status: lead.email_status || 'not sent',
        clickCount: 0,
        bookDemoClickCount: 0,
        videoClickCount: 0,
        followUpCount: 0,
        createdAt: lead.created_at,
        updatedAt: lead.updated_at,
        product: 'workflow_ai',
        product_type: 'workflow_ai',
        isLead: true,
        initialEmailSent: lead.email_status === 'sent'
      });
    }
  }
  const companyEmailLeads = await Promise.all(
    companies.map((company) => syncCompanyEmailLead(company))
  );
  for (const [index, company] of companies.entries()) {
    resultsByEmail.set(
      company.email.toLowerCase(),
      companyEmailContact(company, companyEmailLeads[index])
    );
  }
  return [...resultsByEmail.values()];
}

module.exports = {
  upsertUnifiedLead,
  updateUnifiedLeadStatus,
  insertAutomationLog,
  getUnifiedEmailDashboard,
  getUnifiedWhatsAppDashboard,
  getCampaignLeads,
  getCompanyEmailContacts,
  getFollowUpLeads,
  getLeadByEmail,
  updateLeadFields,
  resetCampaignLeads,
  findLeadIdByEmail,
  getAllActiveLeads,
  getManualLeads,
  getActiveUserById,
  createManualLead,
  updateManualLead,
  recordEmailHistory,
  deleteUnifiedLead,
  getUnifiedLeadByIdentifier,
  trackUnifiedClick,
  upsertEmailLead,
  upsertWhatsAppLead,
  syncCompanyWhatsAppLead,
  updateEmailLeadStatus,
  updateUnifiedLeadEmailStatus,
  updateWhatsAppLeadStatus,
  recordWhatsAppChat,
  recordWhatsAppButtonEvent,
  recordWhatsAppMessageStatus,
  getWhatsAppConversation,
  recordWhatsAppOutboundChat,
  syncCompanyEmailLead,
  getEmailLeadByEmail,
  getWhatsAppLeadByNumber,
  getEmailLeadsByEmails
};
