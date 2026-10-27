const fs = require('fs');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const prisma = require('../prismaClient');
const { getLeadByEmail, upsertUnifiedLead, updateLeadFields, updateUnifiedLeadStatus, getAllActiveLeads, getCompanyEmailContacts, getManualLeads, getActiveUserById, createManualLead, updateManualLead, recordEmailHistory, upsertEmailLead, upsertWhatsAppLead, syncCompanyWhatsAppLead, deleteUnifiedLead, getUnifiedLeadByIdentifier, updateEmailLeadStatus, updateUnifiedLeadEmailStatus } = require('../unifiedDb');
const { findProductColumn, normalizeLeadProduct } = require('../utils/helpers');
const {
  sendTemplate,
  readImportRows,
  normalizeImportRow,
  getImportText,
  getImportPhoneText,
  createDuplicateTracker,
  startImportProgress,
  writeImportProgress,
  finishImportProgress,
  failImportProgress,
} = require('../utils/excelImport');

const LEAD_TEMPLATE_COLUMNS = [
  'full_name',
  'email',
  'phone_number',
  'whatsapp_number',
  'company_name',
  'role',
  'linkedin_url',
  'facebook_url',
  'source',
  'note',
  'address',
  'assigned_user_name',
];

function isValidImportFile(file) {
  return file && /\.(xlsx|xls|csv)$/i.test(file.originalname);
}

async function getSelectedImportUser(userId) {
  const parsedId = Number(userId);
  if (!Number.isInteger(parsedId) || parsedId < 1) return null;
  return getActiveUserById(parsedId);
}

async function getImportUserId(row, selectedUser, usersByName) {
  const assignedUserName = getImportText(row, 'assigned_user_name', 'assigned_user', 'user_name');
  if (!assignedUserName) return selectedUser.id;
  const user = usersByName.get(assignedUserName.toLowerCase());
  return user?.id || null;
}

async function sendLeadTemplate(req, res) {
  const userId = Number(req.query.user_id);
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ error: 'Select an assigned user before downloading the template.' });
  }
  try {
    const user = await getActiveUserById(userId);
    if (!user) return res.status(400).json({ error: 'Selected employee was not found or is inactive.' });
    sendTemplate(res, {
      filename: 'leads_template.xlsx',
      sheetName: 'Leads',
      columns: LEAD_TEMPLATE_COLUMNS,
      assignedUserName: user.employee_name,
    });
  } catch (error) {
    console.error('Failed to create lead import template:', error.message);
    return res.status(500).json({ error: 'Failed to create lead import template.' });
  }
}

async function importManualLeads(req, res) {
  if (!isValidImportFile(req.file)) {
    return res.status(400).json({ error: 'Upload a CSV, XLS, or XLSX template.' });
  }

  try {
    const selectedUser = await getSelectedImportUser(req.body?.user_id);
    if (!selectedUser) {
      return res.status(400).json({ error: 'Select a valid active employee for this upload.' });
    }

    const rows = readImportRows(req.file.buffer);
    const activeUsers = await prisma.users.findMany({
      where: { is_active: true },
      select: { id: true, employee_name: true },
    });
    const [existingLeads, existingCompanies, existingEmailLeads, existingWhatsAppLeads] = await Promise.all([
      prisma.leads.findMany({ select: { email: true, phone_number: true, whatsapp_number: true } }),
      prisma.company.findMany({ select: { email: true, phone_number: true, whatsapp_number: true } }),
      prisma.emailLeads.findMany({ select: { email: true, phone: true } }),
      prisma.whatsAppLeads.findMany({ select: { email: true, whatsapp_number: true } }),
    ]);
    const duplicateTracker = createDuplicateTracker(
      [
        ...existingLeads,
        ...existingCompanies,
        ...existingEmailLeads.map((lead) => ({ ...lead, phone_number: lead.phone })),
        ...existingWhatsAppLeads,
      ],
      'email',
      ['phone_number', 'whatsapp_number']
    );
    const usersByName = new Map(activeUsers.map((user) => [user.employee_name.trim().toLowerCase(), user]));
    let imported = 0;
    const errors = [];
    const duplicates = [];
    startImportProgress(res, rows.length);
    let processed = 0;

    for (const [index, rawRow] of rows.entries()) {
      const row = normalizeImportRow(rawRow);
      const full_name = getImportText(row, 'full_name', 'name');
      const values = {
        full_name,
        email: getImportText(row, 'email').toLowerCase() || null,
        phone_number: getImportPhoneText(row, 'phone_number', 'phone'),
        whatsapp_number: getImportPhoneText(row, 'whatsapp_number'),
        company_name: getImportText(row, 'company_name', 'company'),
        role: getImportText(row, 'role', 'designation'),
        linkedin_url: getImportText(row, 'linkedin_url'),
        facebook_url: getImportText(row, 'facebook_url'),
        source: getImportText(row, 'source') || 'Manual Entry',
        note: getImportText(row, 'note'),
        address: getImportText(row, 'address'),
      };

      if (!Object.values(values).some(Boolean)) {
        writeImportProgress(res, ++processed, rows.length);
        continue;
      }
      if (!full_name) {
        errors.push({ row: index + 2, name: full_name || 'Unnamed lead', error: 'Full name is required.' });
        writeImportProgress(res, ++processed, rows.length);
        continue;
      }
      if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
        errors.push({ row: index + 2, name: full_name, error: 'Email is invalid.' });
        writeImportProgress(res, ++processed, rows.length);
        continue;
      }
      const tooLong = Object.entries(values).some(([field, value]) =>
        value && value.length > (field === 'note' || field === 'address' ? 2000 : 255)
      );
      if (tooLong) {
        errors.push({ row: index + 2, name: full_name, error: 'A field exceeds the allowed length.' });
        writeImportProgress(res, ++processed, rows.length);
        continue;
      }

      const userId = await getImportUserId(row, selectedUser, usersByName);
      if (!userId) {
        errors.push({ row: index + 2, name: full_name, error: 'Assigned User Name does not match an active employee.' });
        writeImportProgress(res, ++processed, rows.length);
        continue;
      }

      const phoneValues = [values.phone_number, values.whatsapp_number];
      const duplicateReason = duplicateTracker.find(values.email, phoneValues);
      if (duplicateReason) {
        duplicates.push({
          row: index + 2,
          name: values.full_name,
          email: values.email,
          phone: values.phone_number || values.whatsapp_number,
          reason: `Duplicate ${duplicateReason}`,
        });
        writeImportProgress(res, ++processed, rows.length);
        continue;
      }

      try {
        await createManualLead({
          ...values,
          user_id: userId,
          status: 'new',
          email_status: 'not sent',
        });
        duplicateTracker.remember(values.email, phoneValues);
        imported += 1;
      } catch (error) {
        if (error.code === 'P2002') {
          duplicates.push({
            row: index + 2,
            name: values.full_name,
            email: values.email,
            phone: values.phone_number || values.whatsapp_number,
            reason: 'Duplicate email',
          });
        } else {
          console.error(`Failed to import lead row ${index + 2}:`, error.message);
          errors.push({ row: index + 2, name: full_name, error: 'Failed to save this lead.' });
        }
      }
      writeImportProgress(res, ++processed, rows.length);
    }

    finishImportProgress(res, {
      imported,
      skipped: errors.length + duplicates.length,
      duplicates,
      errors,
    });
  } catch (error) {
    console.error('Failed to import manually added leads:', error.message);
    failImportProgress(res, error.message || 'Failed to read the uploaded spreadsheet.');
  }
}

async function getAllLeads(req, res) {
  try {
    res.json(await getAllActiveLeads());
  } catch (err) {
    console.error("Failed to fetch unified leads:", err.message);
    res.status(500).json({
      error: "Failed to fetch customers"
    });
  }
}

async function getManualLeadsController(req, res) {
  try {
    res.json(await getManualLeads());
  } catch (err) {
    console.error("Failed to fetch manually added leads:", err.message);
    res.status(500).json({ error: "Failed to fetch manually added leads" });
  }
}

async function createManualLeadController(req, res) {
  const body = req.body || {};
  const userIdValue = body.user_id;
  const userId = userIdValue === undefined || userIdValue === '' || userIdValue === null
    ? null
    : Number(userIdValue);
  const textFields = [
    'full_name', 'whatsapp_number', 'facebook_url', 'linkedin_url',
    'company_name', 'phone_number', 'role', 'source', 'status', 'note', 'address'
  ];
  const lead = Object.fromEntries(textFields.map((field) => [
    field,
    body[field] === undefined || body[field] === null
      ? null
      : typeof body[field] === 'string' ? body[field].trim() || null : undefined
  ]));
  if (body.email !== undefined && body.email !== null && typeof body.email !== 'string') {
    return res.status(400).json({ error: 'Email must be text.' });
  }
  lead.email = typeof body.email === 'string' ? body.email.trim().toLowerCase() || null : null;
  lead.user_id = userId;
  lead.status = lead.status || 'new';
  if (body.email_status !== undefined && body.email_status !== null &&
      typeof body.email_status !== 'string') {
    return res.status(400).json({ error: 'Email status must be text.' });
  }
  lead.email_status = typeof body.email_status === 'string'
    ? body.email_status.trim().toLowerCase() || 'not sent'
    : 'not sent';

  if (Object.values(lead).includes(undefined)) {
    return res.status(400).json({ error: "Lead fields must contain valid text values." });
  }
  if (userId !== null && (!Number.isInteger(userId) || userId < 1)) {
    return res.status(400).json({ error: "Select a valid employee." });
  }
  if (!lead.full_name) {
    return res.status(400).json({ error: "Full name is required." });
  }
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (textFields.some((field) => lead[field] &&
      lead[field].length > (field === 'note' || field === 'address' ? 2000 : 255)) ||
      (lead.email && lead.email.length > 255)) {
    return res.status(400).json({ error: "Field length exceeds the allowed limit." });
  }
  if (!['not sent', 'new', 'sent', 'failed'].includes(lead.email_status)) {
    return res.status(400).json({ error: "Email status must be Not Sent, New, Sent, or Failed." });
  }

  try {
    if (userId !== null && !(await getActiveUserById(userId))) {
      return res.status(400).json({ error: "Selected employee was not found or is inactive." });
    }
    res.status(201).json(await createManualLead(lead));
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: "A lead with this email already exists." });
    }
    console.error("Failed to create manually added lead:", err.message);
    res.status(500).json({ error: "Failed to save lead." });
  }
}

async function getWhatsAppLeads(req, res) {
  try {
    const companyContacts = await prisma.company.findMany({
      where: {
        OR: [
          { phone_number: { not: null } },
          { whatsapp_number: { not: null } }
        ]
      },
      orderBy: { created_at: 'desc' },
      include: { owner: { select: { employee_name: true } } }
    });
    await Promise.all(companyContacts.map(syncCompanyWhatsAppLead));
    const allLeads = await getAllActiveLeads();

    const formattedCompanies = companyContacts.map(c => ({
      id: `company-${c.id}`,
      originalId: c.id,
      name: c.full_name || c.company_name || 'Company Contact',
      email: c.email || '',
      phone: c.whatsapp_number || c.phone_number || '',
      phoneNumber: c.whatsapp_number || c.phone_number || '',
      whatsappNumber: c.whatsapp_number || c.phone_number || '',
      company: c.company_name || '',
      role: c.role || '',
      status: c.status || 'new',
      whatsappStatus: c.status === 'sent' ? 'sent' : (c.status === 'failed' ? 'failed' : 'not sent'),
      whatsappBookDemoClickCount: c.demo_click_count || 0,
      whatsappVideoClickCount: c.video_click_count || 0,
      read: Boolean(c.whatsapp_read),
      failureReason: c.status === 'failed' ? 'Message undeliverable' : null,
      createdByName: c.owner?.employee_name || null,
      isCompanyContact: true,
      isWhatsAppLead: true,
      created_at: c.created_at
    }));

    const rawLeads = [
      ...formattedCompanies,
      ...allLeads.filter(lead => lead.isWhatsAppLead || lead.whatsappNumber || lead.phone || lead.phoneNumber)
    ];

    const seenMap = new Map();
    const unique = [];
    for (const lead of rawLeads) {
      const p = (lead.whatsappNumber || lead.phoneNumber || lead.phone || '').trim();
      const digits = p.replace(/\D/g, '');
      const key = digits.length >= 10 ? digits.slice(-10) : p;
      if (!key) continue;
      if (seenMap.has(key)) {
        const existing = seenMap.get(key);
        if (!existing.read && lead.read) existing.read = true;
        if ((!existing.whatsappStatus || existing.whatsappStatus === 'not sent') && lead.whatsappStatus && lead.whatsappStatus !== 'not sent') {
          existing.whatsappStatus = lead.whatsappStatus;
        }
        if ((!existing.status || existing.status === 'new') && lead.status && lead.status !== 'new') {
          existing.status = lead.status;
        }
        if (!existing.failureReason && lead.failureReason) {
          existing.failureReason = lead.failureReason;
        }
        if (!existing.createdByName && lead.createdByName) {
          existing.createdByName = lead.createdByName;
        }
        continue;
      }
      lead.read = Boolean(lead.read);
      seenMap.set(key, lead);
      unique.push(lead);
    }

    res.json(unique);
  } catch (err) {
    console.error("Failed to fetch WhatsApp leads:", err.message);
    res.status(500).json({
      error: "Failed to fetch WhatsApp leads"
    });
  }
}

async function getEmailLeads(req, res) {
  try {
    const [allLeads, companyContacts] = await Promise.all([
      getAllActiveLeads(),
      getCompanyEmailContacts()
    ]);
    const leadsByEmail = new Map();
    for (const lead of [...allLeads, ...companyContacts]) {
      if (!lead.email) continue;
      const emailKey = lead.email.toLowerCase();
      const existing = leadsByEmail.get(emailKey);
      if (!existing || lead.isEmailLead) {
        leadsByEmail.set(emailKey, lead);
      }
    }
    res.json([...leadsByEmail.values()]);
  } catch (err) {
    console.error("Failed to fetch Email leads:", err.message);
    res.status(500).json({
      error: "Failed to fetch Email leads"
    });
  }
}

async function updateStatus(req, res) {
  const email = req.params.email;
  const { status } = req.body || {};

  if (status !== 'converted_to_lead') {
    return res.status(400).json({
      error: "Only Converted to Lead can be set manually"
    });
  }

  try {
    const updatedLead = await updateLeadFields(email, { status });
    if (!updatedLead) {
      return res.status(404).json({
        error: "Lead not found"
      });
    }

    await updateUnifiedLeadStatus(updatedLead, "manual", status, "converted_to_lead", {
      manual: true
    });

    res.json({
      success: true,
      lead: await getLeadByEmail(email)
    });
  } catch (error) {
    console.error("Manual lead status update failed:", error.message);
    res.status(500).json({
      error: "Failed to update lead status"
    });
  }
}

async function deleteLead(req, res) {
  const identifier = req.body.identifier;

  try {
    const deleted = await deleteUnifiedLead(identifier);

    if (!deleted) {
      return res.status(404).json({
        error: "Lead not found"
      });
    }

    res.json({
      success: true,
      message: "Lead deleted successfully",
      identifier
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
}

async function saveLeads(results, filePath, res) {
  let added = 0;
  let skipped = 0;

  for (let user of results) {
    try {
      const existing = await getUnifiedLeadByIdentifier(user.email || user.phone);
      const isDeleted = existing && (existing.status === 'deleted' || existing.Status === 'deleted' || existing.status === 'lead_deleted');
      const isNew = !existing || isDeleted;
      let emailTargetStatus = 'new';
      if (!isDeleted && existing?.isEmailLead) {
        emailTargetStatus = existing.status || 'new';
      } else if (!isDeleted && existing?.email_status === 'sent') {
        emailTargetStatus = ['clicked', 'converted_to_lead', 'follow_up_sent'].includes(existing.status)
          ? existing.status
          : 'sent';
      } else if (!isDeleted && existing?.email_status === 'failed') {
        emailTargetStatus = 'failed';
      }
      const whatsappTargetStatus = isDeleted
        ? 'new'
        : existing?.whatsappStatus || (existing?.isWhatsAppLead ? existing.status : null) || 'new';

      if (user.email) {
         await upsertEmailLead({
           name: user.name,
           email: user.email,
           phone: user.phone,
           project: user.product_type || 'workflow_ai',
           source: "File Upload",
           status: emailTargetStatus
         }, "email_excel_uploaded");
      }

      if (user.phone) {
         await upsertWhatsAppLead({
           name: user.name,
           email: user.email,
           phone: user.phone,
           project: user.product_type || 'workflow_ai',
           source: "File Upload",
           status: whatsappTargetStatus
         }, "whatsapp_excel_uploaded");
      }

      await upsertUnifiedLead({
        name: user.name,
        email: user.email,
        phoneNumber: user.phone,
        product_type: user.product_type || 'workflow_ai',
        metadata: {
          product_type: user.product_type || 'workflow_ai'
        },
        source: "File Upload",
        Status: emailTargetStatus,
        user_id: user.user_id
      }, "excel_uploaded");

      if (!isNew) {
        skipped++;
      } else {
        added++;
      }
    } catch (err) {
      console.log("Lead save error:", err.message);
    }
  }

  if (filePath) {
    fs.unlinkSync(filePath);
  }

  return res.json({
    message: `Added ${added} new leads. Updated ${skipped} existing leads. This upload batch contains ${results.length} campaign leads.`,
    campaignLeadCount: results.length
  });
}

async function uploadLeads(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded"
      });
    }

    const userId = req.body?.user_id === undefined || req.body.user_id === ''
      ? null
      : Number(req.body.user_id);
    if (userId !== null && (!Number.isInteger(userId) || userId < 1 || !(await getActiveUserById(userId)))) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Select a valid active employee for this upload." });
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
          const productKey = findProductColumn(keys);

          if (results.length === 0) {
            console.log("CSV First row detected keys -> emailKey:", emailKey, "nameKey:", nameKey);
          }

          const name =
            nameKey ? String(data[nameKey]).trim() : "";

          const email =
            emailKey ? String(data[emailKey]).trim() : "";

          const phone =
            phoneKey ? String(data[phoneKey]).trim() : "";

          if (email || phone) {
            results.push({
              name,
              email,
              phone,
              product_type: normalizeLeadProduct(productKey ? data[productKey] : ''),
              user_id: userId
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
        const productKey = findProductColumn(keys);

        if (index === 0) {
          console.log("XLSX First row detected keys -> emailKey:", emailKey, "nameKey:", nameKey);
        }

        const name =
          nameKey ? String(data[nameKey]).trim() : "";

        const email =
          emailKey ? String(data[emailKey]).trim() : "";

        const phone =
          phoneKey ? String(data[phoneKey]).trim() : "";

        if (email || phone) {
          results.push({
            name,
            email,
            phone,
            product_type: normalizeLeadProduct(productKey ? data[productKey] : ''),
            user_id: userId
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
}

async function uploadSingleLead(req, res) {
  try {
    const data = req.body;
    const userId = data?.user_id === undefined || data.user_id === '' || data.user_id === null
      ? null
      : Number(data.user_id);

    if (!data || (!data.email && !data.phone)) {
      return res.status(400).json({ error: "Email or phone number is required." });
    }
    if (userId !== null && (!Number.isInteger(userId) || userId < 1 || !(await getActiveUserById(userId)))) {
      return res.status(400).json({ error: "Select a valid active employee." });
    }

    const results = [{
      name: data.name || data.full_name || "",
      email: data.email || "",
      phone: data.phone || data.phone_number || data.whatsapp_number || "",
      product_type: normalizeLeadProduct(data.project || data.product_type || data.product || ""),
      user_id: userId
    }];

    // Using the same logic as CSV but without a file
    const fakeRes = {
      json: (data) => data
    };
    
    const responseData = await saveLeads(results, null, fakeRes);

    if (data.sendImmediately) {
      const { sendInitialEmail } = require('../services/emailService');
      const { sendWhatsAppTemplate } = require('../services/whatsappService');
      
      const lead = results[0];
      let emailSent = false;
      try {
        if (lead.email) {
          const brevoResult = await sendInitialEmail(lead, lead.product_type);
          emailSent = true;
          try {
            await recordEmailHistory({
              email: lead.email,
              status: 'sent',
              eventType: 'initial',
              attemptNumber: 1,
              providerMessageId: brevoResult?.messageId || null
            });
          } catch (historyError) {
            console.error(`Failed to record email history for ${lead.email}:`, historyError.message);
          }
          await updateUnifiedLeadEmailStatus(lead.email, "sent");
        }
        if (lead.phone) {
          await sendWhatsAppTemplate(lead, lead.product_type);
        }
      } catch (sendErr) {
        if (lead.email && !emailSent) {
          try {
            await recordEmailHistory({
              email: lead.email,
              status: 'failed',
              eventType: 'initial',
              attemptNumber: 1,
              errorMessage: sendErr.message
            });
          } catch (historyError) {
            console.error(`Failed to record email history for ${lead.email}:`, historyError.message);
          }
        }
        console.error("Error sending immediate campaign to single lead:", sendErr.message);
      }
    }

    return res.json(responseData);

  } catch (err) {
    console.error("Single lead upload error:", err.message);
    res.status(500).json({ error: "Failed to save and send to lead" });
  }
}

async function updateManualLeadController(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid lead ID.' });
  }

  const body = req.body || {};
  const userIdValue = body.user_id;
  const userId = userIdValue === undefined || userIdValue === '' || userIdValue === null
    ? null
    : Number(userIdValue);

  const textFields = [
    'full_name', 'whatsapp_number', 'facebook_url', 'linkedin_url',
    'company_name', 'phone_number', 'role', 'source', 'status', 'note', 'address'
  ];
  const lead = Object.fromEntries(textFields.map((field) => [
    field,
    body[field] === undefined || body[field] === null
      ? null
      : typeof body[field] === 'string' ? body[field].trim() || null : undefined
  ]));

  if (body.email !== undefined && body.email !== null && typeof body.email !== 'string') {
    return res.status(400).json({ error: 'Email must be text.' });
  }
  if (body.email !== undefined) {
    lead.email = typeof body.email === 'string' ? body.email.trim().toLowerCase() || null : null;
  }
  lead.user_id = userId;

  if (body.full_name !== undefined && !lead.full_name) {
    return res.status(400).json({ error: 'Full name cannot be empty.' });
  }

  if (Object.values(lead).includes(undefined)) {
    return res.status(400).json({ error: 'Lead fields must contain valid text values.' });
  }
  if (userId !== null && (!Number.isInteger(userId) || userId < 1)) {
    return res.status(400).json({ error: 'Select a valid employee.' });
  }
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (textFields.some((field) => lead[field] &&
      lead[field].length > (field === 'note' || field === 'address' ? 2000 : 255)) ||
      (lead.email && lead.email.length > 255)) {
    return res.status(400).json({ error: 'Field length exceeds the allowed limit.' });
  }
  if (lead.email_status && !['not sent', 'new', 'sent', 'failed'].includes(lead.email_status)) {
    return res.status(400).json({ error: 'Email status must be Not Sent, New, Sent, or Failed.' });
  }

  try {
    const updated = await updateManualLead(id, lead);
    if (!updated) return res.status(404).json({ error: 'Lead not found or not a manual lead.' });
    res.json(updated);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A lead with this email already exists.' });
    }
    console.error('Failed to update manual lead:', err.message);
    res.status(500).json({ error: 'Failed to update lead.' });
  }
}

async function deleteManualLeadController(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid lead ID.' });
  }

  try {
    const lead = await prisma.leads.findUnique({ where: { id } });
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });

    await prisma.lead_status.deleteMany({ where: { lead_id: id } }).catch(() => {});
    await prisma.automation_logs.deleteMany({ where: { lead_id: id } }).catch(() => {});
    await prisma.leads.delete({ where: { id } });

    if (lead.email) {
      await prisma.emailLeads.deleteMany({ where: { email: lead.email } }).catch(() => {});
    }

    res.json({ success: true, message: 'Lead deleted successfully.' });
  } catch (err) {
    console.error('Failed to delete manual lead:', err.message);
    res.status(500).json({ error: 'Failed to delete lead.' });
  }
}

module.exports = {
  getAllLeads,
  sendLeadTemplate,
  importManualLeads,
  getManualLeadsController,
  createManualLeadController,
  updateManualLeadController,
  deleteManualLeadController,
  getWhatsAppLeads,
  getEmailLeads,
  updateStatus,
  deleteLead,
  uploadLeads,
  uploadSingleLead
};
