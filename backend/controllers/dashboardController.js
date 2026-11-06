const { PrismaClient } = require('@prisma/client');
const prisma = require('../prismaClient');
const { getUnifiedEmailDashboard, getUnifiedWhatsAppDashboard } = require('../unifiedDb');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

function addAssignedChannelCounts(users, assignedLeads, assignedCompanies) {
  const emailLeadIdsByOwner = new Map();
  const whatsappLeadIdsByOwner = new Map();
  const addAssignedChannelLead = (counts, userId, id, entityType) => {
    if (!userId || !id) return;
    if (!counts.has(userId)) counts.set(userId, new Set());
    counts.get(userId).add(`${entityType}:${id}`);
  };

  for (const [entityType, contacts] of [['lead', assignedLeads], ['company', assignedCompanies]]) {
    for (const contact of contacts) {
      const hasEmail = Boolean(String(contact.email || '').trim());
      const hasWhatsApp = Boolean(String(contact.whatsapp_number || contact.phone_number || '').replace(/\D/g, ''));
      if (hasEmail) addAssignedChannelLead(emailLeadIdsByOwner, contact.user_id, contact.id, entityType);
      if (hasWhatsApp) addAssignedChannelLead(whatsappLeadIdsByOwner, contact.user_id, contact.id, entityType);
    }
  }

  return users.map((user) => ({
    ...user,
    emailLeadCount: emailLeadIdsByOwner.get(user.id)?.size || 0,
    whatsappLeadCount: whatsappLeadIdsByOwner.get(user.id)?.size || 0
  }));
}

async function getWorkloadUsers() {
  const [users, assignedLeads, assignedCompanies] = await Promise.all([
    prisma.users.findMany({
      where: { is_active: true },
      orderBy: { employee_name: 'asc' },
      include: {
        _count: {
          select: { leads: true, companies: true, email_history: true }
        }
      }
    }),
    prisma.leads.findMany({
      where: { user_id: { not: null } },
      select: { id: true, user_id: true, email: true, phone_number: true, whatsapp_number: true }
    }),
    prisma.company.findMany({
      where: { user_id: { not: null } },
      select: { id: true, user_id: true, email: true, phone_number: true, whatsapp_number: true }
    })
  ]);
  return addAssignedChannelCounts(users, assignedLeads, assignedCompanies);
}

function getWorkloadExportRows(users) {
  return users.map((user) => ({
    Employee: user.employee_name || '',
    'Employee ID': user.id,
    Leads: user._count?.leads || 0,
    Companies: user._count?.companies || 0,
    'Assigned Email Leads': user.emailLeadCount || 0,
    'Assigned WhatsApp Leads': user.whatsappLeadCount || 0,
    'Email Attempts': user._count?.email_history || 0,
    'Total Workload': (user._count?.leads || 0) + (user._count?.companies || 0)
  }));
}

async function getDashboard(req, res) {
  try {
    res.json(await getUnifiedEmailDashboard());
  } catch (error) {
    res.status(500).json({
      error: "Dashboard fetch failed"
    });
  }
}

async function getWhatsAppDashboard(req, res) {
  try {
    res.json(await getUnifiedWhatsAppDashboard());
  } catch (error) {
    res.status(500).json({
      error: "WhatsApp Dashboard fetch failed"
    });
  }
}

async function getOverviewStats(req, res) {
  try {
    const [
      totalLeads,
      totalCompanies,
      leadsEmailsSent,
      companyEmailsSent,
      emailHistorySent,
      users
    ] = await Promise.all([
      prisma.leads.count(),
      prisma.company.count(),
      prisma.leads.count({ where: { email_status: 'sent' } }),
      prisma.company.count({ where: { email_status: 'sent' } }),
      prisma.email_history.count({ where: { status: 'sent' } }),
      getWorkloadUsers()
    ]);

    const totalEmailsSent = Math.max(emailHistorySent, leadsEmailsSent + companyEmailsSent);

    return res.json({
      success: true,
      totalLeads,
      totalCompanies,
      totalEmailsSent,
      totalUsers: users.length,
      users
    });
  } catch (error) {
    console.error('Failed to get overview stats:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch overview stats.' });
  }
}

async function exportWorkload(req, res) {
  const format = String(req.query.format || '').toLowerCase();
  if (!['xlsx', 'pdf'].includes(format)) {
    return res.status(400).json({ success: false, error: 'Choose xlsx or pdf format.' });
  }

  try {
    const users = await getWorkloadUsers();
    const rows = getWorkloadExportRows(users);
    const dateStamp = new Date().toISOString().slice(0, 10);

    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'VRM Sales Dashboard';
      workbook.created = new Date();
      const sheet = workbook.addWorksheet('Team Workload');
      sheet.columns = [
        { header: 'Employee', key: 'Employee', width: 28 },
        { header: 'Employee ID', key: 'Employee ID', width: 14 },
        { header: 'Leads', key: 'Leads', width: 12 },
        { header: 'Companies', key: 'Companies', width: 14 },
        { header: 'Assigned Email Leads', key: 'Assigned Email Leads', width: 23 },
        { header: 'Assigned WhatsApp Leads', key: 'Assigned WhatsApp Leads', width: 26 },
        { header: 'Email Attempts', key: 'Email Attempts', width: 17 },
        { header: 'Total Workload', key: 'Total Workload', width: 17 }
      ];
      sheet.addRows(rows);
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      sheet.getRow(1).height = 24;
      sheet.autoFilter = { from: 'A1', to: 'H1' };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="team-workload-${dateStamp}.xlsx"`);
      return res.send(Buffer.from(buffer));
    }

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="team-workload-${dateStamp}.pdf"`);
    doc.pipe(res);
    doc.fontSize(18).font('Helvetica-Bold').text('Team Members & Assigned Workload');
    doc.moveDown(0.35);
    doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(`Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

    const columns = [
      { label: 'Employee', width: 140, key: 'Employee' },
      { label: 'ID', width: 46, key: 'Employee ID' },
      { label: 'Leads', width: 54, key: 'Leads' },
      { label: 'Companies', width: 70, key: 'Companies' },
      { label: 'Email Leads', width: 94, key: 'Assigned Email Leads' },
      { label: 'WhatsApp Leads', width: 108, key: 'Assigned WhatsApp Leads' },
      { label: 'Email Attempts', width: 95, key: 'Email Attempts' },
      { label: 'Total', width: 54, key: 'Total Workload' }
    ];
    const tableWidth = columns.reduce((total, column) => total + column.width, 0);
    const pageLeft = doc.page.margins.left;
    const drawHeader = () => {
      const y = doc.y + 10;
      doc.rect(pageLeft, y, tableWidth, 24).fill('#eaf1ff');
      let x = pageLeft;
      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(8);
      for (const column of columns) {
        doc.text(column.label, x + 5, y + 8, { width: column.width - 10, lineBreak: false });
        x += column.width;
      }
      doc.y = y + 24;
    };
    drawHeader();

    for (const [index, row] of rows.entries()) {
      if (doc.y + 26 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        drawHeader();
      }
      const y = doc.y;
      if (index % 2 === 1) doc.rect(pageLeft, y, tableWidth, 24).fill('#f8fafc');
      let x = pageLeft;
      doc.fillColor('#0f172a').font('Helvetica').fontSize(8);
      for (const column of columns) {
        doc.text(String(row[column.key]), x + 5, y + 8, { width: column.width - 10, lineBreak: false });
        x += column.width;
      }
      doc.moveTo(pageLeft, y + 24).lineTo(pageLeft + tableWidth, y + 24).strokeColor('#e2e8f0').stroke();
      doc.y = y + 24;
    }
    return doc.end();
  } catch (error) {
    console.error('Failed to export team workload:', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Failed to export team workload.' });
    }
    return res.destroy(error);
  }
}

async function searchLeadsAndCompanies(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json({ success: true, leads: [], companies: [], totalFound: 0 });
    }

    const [leads, companies] = await Promise.all([
      prisma.leads.findMany({
        where: {
          OR: [
            { full_name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone_number: { contains: q, mode: 'insensitive' } },
            { whatsapp_number: { contains: q, mode: 'insensitive' } },
            { company_name: { contains: q, mode: 'insensitive' } },
          ]
        },
        include: {
          owner: { select: { id: true, employee_name: true } }
        },
        orderBy: { created_at: 'desc' },
        take: 20
      }),
      prisma.company.findMany({
        where: {
          OR: [
            { full_name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone_number: { contains: q, mode: 'insensitive' } },
            { whatsapp_number: { contains: q, mode: 'insensitive' } },
            { company_name: { contains: q, mode: 'insensitive' } },
          ]
        },
        include: {
          owner: { select: { id: true, employee_name: true } }
        },
        orderBy: { created_at: 'desc' },
        take: 20
      })
    ]);

    return res.json({
      success: true,
      query: q,
      totalFound: leads.length + companies.length,
      leads,
      companies
    });
  } catch (error) {
    console.error('Failed to search leads and companies:', error);
    return res.status(500).json({ success: false, error: 'Search failed.' });
  }
}

module.exports = {
  getDashboard,
  getWhatsAppDashboard,
  getOverviewStats,
  exportWorkload,
  searchLeadsAndCompanies
};
