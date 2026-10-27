
const { PrismaClient } = require('@prisma/client');
const { getActiveUserById, syncCompanyEmailLead } = require('../unifiedDb');

const prisma = require('../prismaClient');
const {
  sendTemplate,
  readImportRows,
  normalizeImportRow,
  getImportText,
  createDuplicateTracker,
  startImportProgress,
  writeImportProgress,
  finishImportProgress,
  failImportProgress,
} = require('../utils/excelImport');

const COMPANY_TEMPLATE_COLUMNS = [
  'full_name',
  'email',
  'company_name',
  'role',
  'phone_number',
  'whatsapp_number',
  'linkedin_url',
  'facebook_url',
  'source',
  'note',
  'address',
  'assigned_user_name',
];

function normalizeOptionalText(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined;
  return value.trim() || null;
}

async function sendCompanyTemplate(req, res) {
  const userId = Number(req.query.user_id);
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ error: 'Select an assigned user before downloading the template.' });
  }
  try {
    const user = await getActiveUserById(userId);
    if (!user) return res.status(400).json({ error: 'Selected employee was not found or is inactive.' });
    sendTemplate(res, {
      filename: 'companies_template.xlsx',
      sheetName: 'Companies',
      columns: COMPANY_TEMPLATE_COLUMNS,
      assignedUserName: user.employee_name,
    });
  } catch (error) {
    console.error('Failed to create company import template:', error.message);
    return res.status(500).json({ error: 'Failed to create company import template.' });
  }
}

async function importCompanies(req, res) {
  if (!req.file || !/\.(xlsx|xls|csv)$/i.test(req.file.originalname)) {
    return res.status(400).json({ error: 'Upload a CSV, XLS, or XLSX template.' });
  }

  try {
    const selectedUserId = Number(req.body?.user_id);
    const selectedUser = Number.isInteger(selectedUserId) && selectedUserId > 0
      ? await getActiveUserById(selectedUserId)
      : null;
    if (!selectedUser) {
      return res.status(400).json({ error: 'Select a valid active employee for this upload.' });
    }

    const rows = readImportRows(req.file.buffer);
    const activeUsers = await prisma.users.findMany({
      where: { is_active: true },
      select: { id: true, employee_name: true },
    });
    const [existingCompanies, existingLeads, existingEmailLeads, existingWhatsAppLeads] = await Promise.all([
      prisma.company.findMany({ select: { email: true, phone_number: true, whatsapp_number: true } }),
      prisma.leads.findMany({ select: { email: true, phone_number: true, whatsapp_number: true } }),
      prisma.emailLeads.findMany({ select: { email: true, phone: true } }),
      prisma.whatsAppLeads.findMany({ select: { email: true, whatsapp_number: true } }),
    ]);
    const duplicateTracker = createDuplicateTracker(
      [
        ...existingCompanies,
        ...existingLeads,
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
      const values = {
        full_name: getImportText(row, 'full_name', 'name'),
        company_name: getImportText(row, 'company_name', 'company'),
        role: getImportText(row, 'role', 'designation'),
        phone_number: getImportText(row, 'phone_number', 'phone'),
        whatsapp_number: getImportText(row, 'whatsapp_number'),
        email: getImportText(row, 'email').toLowerCase() || null,
        linkedin_url: getImportText(row, 'linkedin_url'),
        facebook_url: getImportText(row, 'facebook_url'),
        source: getImportText(row, 'source'),
        note: getImportText(row, 'note'),
        address: getImportText(row, 'address'),
      };

      if (!Object.values(values).some(Boolean)) {
        writeImportProgress(res, ++processed, rows.length);
        continue;
      }
      if (!values.full_name) {
        errors.push({ row: index + 2, name: values.full_name || 'Unnamed contact', error: 'Full name is required.' });
        writeImportProgress(res, ++processed, rows.length);
        continue;
      }
      if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
        errors.push({ row: index + 2, name: values.full_name, error: 'Email is invalid.' });
        writeImportProgress(res, ++processed, rows.length);
        continue;
      }
      const tooLong = Object.entries(values).some(([field, value]) =>
        value && value.length > (field === 'note' || field === 'address' ? 2000 : 255)
      );
      if (tooLong) {
        errors.push({ row: index + 2, name: values.full_name, error: 'A field exceeds the allowed length.' });
        writeImportProgress(res, ++processed, rows.length);
        continue;
      }

      const assignedUserName = getImportText(row, 'assigned_user_name', 'assigned_user', 'user_name');
      const assignedUser = assignedUserName
        ? usersByName.get(assignedUserName.toLowerCase())
        : selectedUser;
      if (!assignedUser) {
        errors.push({ row: index + 2, name: values.full_name, error: 'Assigned User Name does not match an active employee.' });
        writeImportProgress(res, ++processed, rows.length);
        continue;
      }

      const phoneValues = [values.phone_number, values.whatsapp_number];
      const duplicateReason = duplicateTracker.find(values.email, phoneValues);
      if (duplicateReason) {
        duplicates.push({
          row: index + 2,
          name: values.full_name,
          company: values.company_name,
          email: values.email,
          phone: values.phone_number || values.whatsapp_number,
          reason: `Duplicate ${duplicateReason}`,
        });
        writeImportProgress(res, ++processed, rows.length);
        continue;
      }

      try {
        const createdCompany = await prisma.company.create({
          data: {
            ...Object.fromEntries(
              Object.entries(values).map(([field, value]) => [
                field,
                field === 'email' ? value : normalizeOptionalText(value),
              ])
            ),
            user_id: assignedUser.id,
            status: 'new',
            email_status: 'not sent',
          },
          include: { owner: { select: { employee_name: true } } },
        });
        duplicateTracker.remember(values.email, phoneValues);
        imported += 1;
        try {
          await syncCompanyEmailLead(createdCompany, true);
        } catch (error) {
          console.error(`Company imported but email sync failed for row ${index + 2}:`, error.message);
          errors.push({ row: index + 2, name: values.full_name, error: 'Company was saved, but its email sync failed.' });
        }
      } catch (error) {
        if (error.code === 'P2002') {
          duplicates.push({
            row: index + 2,
            name: values.full_name,
            company: values.company_name,
            email: values.email,
            phone: values.phone_number || values.whatsapp_number,
            reason: 'Duplicate email',
          });
        } else {
          console.error(`Failed to import company row ${index + 2}:`, error.message);
          errors.push({ row: index + 2, name: values.full_name, error: 'Failed to save this company contact.' });
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
    console.error('Failed to import company contacts:', error.message);
    return failImportProgress(res, error.message || 'Failed to read the uploaded spreadsheet.');
  }
}

// GET all companies
const getCompanies = async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      include: {
        owner: { select: { employee_name: true } },
      },
      orderBy: {
        created_at: 'desc',
      },
    });
    const companiesByEmail = new Map();
    for (const company of companies) {
      if (!company.email) continue;
      const email = company.email.trim().toLowerCase();
      if (!companiesByEmail.has(email)) companiesByEmail.set(email, company);
    }
    const syncedEmailLeads = await Promise.all(
      [...companiesByEmail.entries()].map(async ([email, company]) => [
        email,
        await syncCompanyEmailLead(company),
      ])
    );
    const metricsByEmail = new Map(syncedEmailLeads.map(([email, emailLead]) => [
      email,
      {
        click_count: emailLead?.click_count || 0,
        demo_click_count: emailLead?.demo_click_count || 0,
        video_click_count: emailLead?.video_click_count || 0,
        follow_up_count: emailLead?.follow_up_count || 0,
      }
    ]));
    const companiesWithEmailMetrics = companies.map((company) => ({
      ...company,
      ...(company.email
        ? metricsByEmail.get(company.email.trim().toLowerCase())
        : {
          click_count: 0,
          demo_click_count: 0,
          video_click_count: 0,
          follow_up_count: 0,
        })
    }));

    return res.status(200).json({
      success: true,
      count: companiesWithEmailMetrics.length,
      data: companiesWithEmailMetrics,
    });
  } catch (error) {
    console.error('Failed to fetch companies:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch companies',
      error: error.message,
    });
  }
};

// GET company by ID
const getCompanyById = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid company ID',
      });
    }

    const company = await prisma.company.findUnique({
      where: { id },
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: company,
    });
  } catch (error) {
    console.error('Failed to fetch company:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch company',
      error: error.message,
    });
  }
};

// CREATE company
const createCompany = async (req, res) => {
  try {
    const {
      full_name,
      whatsapp_number,
      facebook_url,
      linkedin_url,
      company_name,
      phone_number,
      email,
      role,
      source,
      status,
      note,
      email_status,
      address,
      user_id,
    } = req.body;

    const optionalFields = {
      full_name,
      whatsapp_number,
      facebook_url,
      linkedin_url,
      company_name,
      phone_number,
      role,
      source,
      status,
      note,
      address,
    };
    const normalizedFields = Object.fromEntries(
      Object.entries(optionalFields).map(([key, value]) => [key, normalizeOptionalText(value)])
    );
    if (!normalizedFields.full_name) {
      return res.status(400).json({
        success: false,
        message: 'Full name is required.',
      });
    }
    if (email !== undefined && email !== null && typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Email must be text.',
      });
    }
    const normalizedEmail = normalizeOptionalText(email);
    const companyEmail = normalizedEmail?.toLowerCase() || null;
    if (Object.values(normalizedFields).includes(undefined)) {
      return res.status(400).json({
        success: false,
        message: 'Company contact fields must be text values.',
      });
    }
    if (Object.entries(normalizedFields).some(([field, value]) =>
      value && value.length > (field === 'note' || field === 'address' ? 2000 : 255)
    )) {
      return res.status(400).json({
        success: false,
        message: 'A company contact field exceeds the allowed length.',
      });
    }
    if (companyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid email address.',
      });
    }
    if (companyEmail && companyEmail.length > 255) {
      return res.status(400).json({
        success: false,
        message: 'Email exceeds the allowed length.',
      });
    }
    if (email_status !== undefined && email_status !== null && typeof email_status !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Email status must be text.',
      });
    }
    const emailStatus = typeof email_status === 'string'
      ? email_status.trim().toLowerCase() || 'not sent'
      : 'not sent';
    if (!['not sent', 'new', 'sent', 'failed'].includes(emailStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Email status must be Not Sent, New, Sent, or Failed.',
      });
    }

    const userId = user_id === undefined || user_id === '' || user_id === null
      ? null
      : Number(user_id);
    if (userId !== null && (!Number.isInteger(userId) || userId < 1 || !(await getActiveUserById(userId)))) {
      return res.status(400).json({
        success: false,
        message: 'Select a valid active employee',
      });
    }

    const createdCompany = await prisma.company.create({
      data: {
        ...normalizedFields,
        email: companyEmail,
        status: normalizedFields.status || 'new',
        email_status: emailStatus,
        user_id: userId,
      },
      include: {
        owner: { select: { employee_name: true } },
      },
    });
    await syncCompanyEmailLead(createdCompany, true);

    return res.status(201).json({
      success: true,
      message: 'Company created successfully',
      data: createdCompany,
    });
  } catch (error) {
    console.error('Failed to create company:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to create company',
      error: error.message,
    });
  }
};

// UPDATE company
const updateCompany = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid company ID',
      });
    }

    const {
      full_name,
      whatsapp_number,
      facebook_url,
      linkedin_url,
      company_name,
      phone_number,
      email,
      role,
      source,
      status,
      note,
      email_status,
      address,
      user_id,
    } = req.body;

    const data = {};
    const optionalTextFields = {
      full_name,
      whatsapp_number,
      facebook_url,
      linkedin_url,
      company_name,
      phone_number,
      role,
      source,
      status,
      note,
      address,
    };
    for (const [field, value] of Object.entries(optionalTextFields)) {
      if (value === undefined) continue;
      const normalizedValue = normalizeOptionalText(value);
      if (normalizedValue === undefined) {
        return res.status(400).json({
          success: false,
          message: `${field} must be text.`,
        });
      }
      data[field] = normalizedValue;
    }
    if (data.full_name !== undefined && !data.full_name) {
      return res.status(400).json({ success: false, message: 'Full name cannot be empty.' });
    }
    if (Object.entries(data).some(([field, value]) =>
      typeof value === 'string' && value.length > (field === 'note' || field === 'address' ? 2000 : 255)
    )) {
      return res.status(400).json({
        success: false,
        message: 'A company contact field exceeds the allowed length.',
      });
    }
    if (email !== undefined) {
      const emailValue = normalizeOptionalText(email);
      if (emailValue === undefined) {
        return res.status(400).json({ success: false, message: 'Email must be text.' });
      }
      if (emailValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
        return res.status(400).json({
          success: false,
          message: 'Enter a valid email address.',
        });
      }
      if (emailValue && emailValue.length > 255) {
        return res.status(400).json({
          success: false,
          message: 'Email exceeds the allowed length.',
        });
      }
      data.email = emailValue?.toLowerCase() || null;
    }

    if (email_status !== undefined) {
      if (typeof email_status !== 'string' ||
          !['not sent', 'new', 'sent', 'failed'].includes(email_status.trim().toLowerCase())) {
        return res.status(400).json({ success: false, message: 'Email status must be Not Sent, New, Sent, or Failed.' });
      }
      data.email_status = email_status.trim().toLowerCase();
    }

    if (user_id !== undefined) {
      const userId = user_id === '' || user_id === null ? null : Number(user_id);
      if (userId !== null && (!Number.isInteger(userId) || userId < 1 || !(await getActiveUserById(userId)))) {
        return res.status(400).json({
          success: false,
          message: 'Select a valid active employee',
        });
      }
      data.user_id = userId;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields provided to update',
      });
    }

    const company = await prisma.company.update({
      where: { id },
      data,
    });
    await syncCompanyEmailLead(company, email_status !== undefined);

    return res.status(200).json({
      success: true,
      message: 'Company updated successfully',
      data: company,
    });
  } catch (error) {
    console.error('Failed to update company:', error);

    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to update company',
      error: error.message,
    });
  }
};

// DELETE company
const deleteCompany = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid company ID',
      });
    }

    const company = await prisma.company.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: 'Company deleted successfully',
      data: company,
    });
  } catch (error) {
    console.error('Failed to delete company:', error);

    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to delete company',
      error: error.message,
    });
  }
};

module.exports = {
  getCompanies,
  getCompanyById,
  sendCompanyTemplate,
  importCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
};
