const ExcelJS = require('exceljs');
const prisma = require('../prismaClient');

async function getUsers(req, res) {
  try {
    const users = await prisma.users.findMany({
      where: { is_active: true },
      orderBy: { employee_name: 'asc' },
      include: {
        _count: {
          select: { leads: true, companies: true, email_history: true, called_leads: true }
        }
      }
    });
    return res.json({ success: true, data: users });
  } catch (error) {
    console.error('Failed to fetch employees:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch employees.' });
  }
}

async function createUser(req, res) {
  const employeeName = typeof req.body?.employee_name === 'string'
    ? req.body.employee_name.trim()
    : '';
  if (!employeeName || employeeName.length > 255) {
    return res.status(400).json({ success: false, error: 'Employee name is required and must be 255 characters or fewer.' });
  }

  try {
    const user = await prisma.users.create({
      data: { employee_name: employeeName },
      include: {
        _count: {
          select: { leads: true, companies: true, email_history: true, called_leads: true }
        }
      }
    });
    return res.status(201).json({ success: true, data: user });
  } catch (error) {
    console.error('Failed to create employee:', error);
    return res.status(500).json({ success: false, error: 'Failed to create employee.' });
  }
}
async function deleteUser(req, res) {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ success: false, error: 'Invalid employee ID.' });
  }
  try {
    const user = await prisma.users.findFirst({ where: { id: userId, is_active: true } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'Employee not found.' });
    }
    await prisma.users.update({
      where: { id: userId },
      data: { is_active: false, updated_at: new Date() }
    });
    return res.json({ success: true, message: `${user.employee_name} was removed.` });
  } catch (error) {
    console.error('Failed to delete employee:', error);
    return res.status(500).json({ success: false, error: 'Failed to remove employee.' });
  }
}
function parseDateBound(value, endOfDay = false) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? undefined
    : date;
}

async function getUserHistory(req, res) {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ success: false, error: 'Invalid employee ID.' });
  }

  const from = parseDateBound(req.query.from);
  const to = parseDateBound(req.query.to, true);
  if (from === undefined || to === undefined || (from && to && from > to)) {
    return res.status(400).json({ success: false, error: 'Enter a valid date range.' });
  }
  const dateFilter = {};
  if (from) dateFilter.gte = from;
  if (to) dateFilter.lte = to;

  try {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, employee_name: true, is_active: true, created_at: true }
    });
    if (!user) {
      return res.status(404).json({ success: false, error: 'Employee not found.' });
    }

    const [leads, companies, emailHistory] = await Promise.all([
      prisma.leads.findMany({
        where: { user_id: userId, ...(Object.keys(dateFilter).length && { created_at: dateFilter }) },
        orderBy: { created_at: 'desc' },
        select: {
          id: true, full_name: true, company_name: true, email: true,
          phone_number: true, source: true, status: true, email_status: true,
          created_at: true
        }
      }),
      prisma.company.findMany({
        where: { user_id: userId, ...(Object.keys(dateFilter).length && { created_at: dateFilter }) },
        orderBy: { created_at: 'desc' },
        select: {
          id: true, full_name: true, company_name: true, email: true,
          phone_number: true, email_status: true, status: true, created_at: true
        }
      }),
      prisma.email_history.findMany({
        where: {
          user_id: userId,
          ...(Object.keys(dateFilter).length && { attempted_at: dateFilter })
        },
        orderBy: { attempted_at: 'desc' },
        select: {
          id: true, lead_id: true, company_id: true, recipient_email: true,
          event_type: true, status: true, attempt_number: true,
          provider_message_id: true, error_message: true, attempted_at: true, sent_at: true
        }
      })
    ]);

    return res.json({
      success: true,
      data: { user, leads, companies, email_history: emailHistory }
    });
  } catch (error) {
    console.error('Failed to fetch employee history:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch employee history.' });
  }
}
const IST_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const istDate = (ms) => new Date(ms + IST_MS).toISOString().slice(0, 10);

// Monday 00:00 to Sunday 23:59:59.999 India time. weeksAgo 1 = last completed week, 0 = this week.
// One day, 00:00 to 23:59:59.999 India time. dateStr (YYYY-MM-DD) wins; otherwise daysAgo (1 = yesterday, 0 = today).
function getIstDay(dateStr, daysAgo) {
  let startMs;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) {
    startMs = Date.parse(`${dateStr}T00:00:00.000Z`) - IST_MS;
  } else {
    const istNow = new Date(Date.now() + IST_MS);
    const istMidnight = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
    startMs = istMidnight - daysAgo * DAY_MS - IST_MS;
  }
  return { start: new Date(startMs), end: new Date(startMs + DAY_MS - 1) };
}

async function exportdailyReport(req, res) {
  try {
const week = getIstDay(req.query.date, 0);
  if (Number.isNaN(week.start.getTime())) {
    return res.status(400).json({ success: false, error: 'Enter a valid date (YYYY-MM-DD).' });
  }    
    const range = { gte: week.start, lte: week.end };
    const prevRange = {
      gte: new Date(week.start.getTime() - 7 * DAY_MS),
      lte: new Date(week.start.getTime() - 1),
    };
    const hasUser = { not: null };

    const [
      users, leadsW, companiesW, emailsW,
      leadsP, companiesP, emailsP, callsW, callsP,
      ownedLeads, ownedCompanies, waLeads, waCompanies,
    ] = await Promise.all([
      prisma.users.findMany({
        where: { is_active: true },
        orderBy: { employee_name: 'asc' },
        select: { id: true, employee_name: true },
      }),
      prisma.leads.findMany({ where: { user_id: hasUser, created_at: range }, select: { user_id: true, created_at: true } }),
      prisma.company.findMany({ where: { user_id: hasUser, created_at: range }, select: { user_id: true, created_at: true } }),
      prisma.email_history.findMany({ where: { user_id: hasUser, attempted_at: range }, select: { user_id: true, status: true, attempted_at: true } }),
      prisma.leads.groupBy({ by: ['user_id'], where: { user_id: hasUser, created_at: prevRange }, _count: { _all: true } }),
      prisma.company.groupBy({ by: ['user_id'], where: { user_id: hasUser, created_at: prevRange }, _count: { _all: true } }),
      prisma.email_history.groupBy({ by: ['user_id'], where: { user_id: hasUser, attempted_at: prevRange, status: 'sent' }, _count: { _all: true } }),
      prisma.leads.findMany({
        where: { is_called: true, called_by_user_id: hasUser, called_at: range },
        select: { called_by_user_id: true, called_at: true },
      }),
      prisma.leads.groupBy({
        by: ['called_by_user_id'],
        where: { is_called: true, called_by_user_id: hasUser, called_at: prevRange },
        _count: { _all: true },
      }),
      prisma.leads.groupBy({ by: ['user_id'], where: { user_id: hasUser }, _count: { _all: true } }),
      prisma.company.groupBy({ by: ['user_id'], where: { user_id: hasUser }, _count: { _all: true } }),
      prisma.leads.groupBy({ by: ['user_id'], where: { user_id: hasUser, whatsapp_read: true }, _count: { _all: true } }),
      prisma.company.groupBy({ by: ['user_id'], where: { user_id: hasUser, whatsapp_read: true }, _count: { _all: true } }),
    ]);
       // Converted leads: manual "Convert to Lead" events in the report period, credited to the lead's owner
    const convertedEvents = await prisma.lead_status.findMany({
      where: { action: 'converted_to_lead', lead_id: { not: null }, created_at: range },
      select: { lead_id: true },
    });
    const convertedIds = [...new Set(convertedEvents.map((e) => e.lead_id))];
    const convertedLeads = convertedIds.length
      ? await prisma.leads.findMany({
          where: { id: { in: convertedIds }, user_id: hasUser },
          select: { user_id: true },
        })
      : [];
    const convertedMap = new Map();
    for (const l of convertedLeads) convertedMap.set(l.user_id, (convertedMap.get(l.user_id) || 0) + 1);
    const toMap = (rows) => new Map(rows.map((r) => [r.user_id, r._count._all]));
    const get = (map, id) => map.get(id) || 0;
    const leadsPMap = toMap(leadsP), companiesPMap = toMap(companiesP), emailsPMap = toMap(emailsP);
    const ownedLeadsMap = toMap(ownedLeads), ownedCompaniesMap = toMap(ownedCompanies);
    const waLeadsMap = toMap(waLeads), waCompaniesMap = toMap(waCompanies);
    const callsPMap = new Map(callsP.map((r) => [r.called_by_user_id, r._count._all]));

    const stats = new Map(users.map((u) => [u.id, {
      name: u.employee_name, leads: 0, companies: 0, attempts: 0, sent: 0, failed: 0, calls: 0,
      daily: Array.from({ length: 7 }, () => ({ records: 0, emails: 0, calls: 0 })),
    }]));

    const dayIndex = (d) => Math.floor((new Date(d).getTime() - week.start.getTime()) / DAY_MS);

    

    for (const r of leadsW) {
      const s = stats.get(r.user_id); if (!s) continue;
      s.leads++; const i = dayIndex(r.created_at); if (s.daily[i]) s.daily[i].records++;
    }
    for (const r of companiesW) {
      const s = stats.get(r.user_id); if (!s) continue;
      s.companies++; const i = dayIndex(r.created_at); if (s.daily[i]) s.daily[i].records++;
    }
    for (const r of emailsW) {
      const s = stats.get(r.user_id); if (!s) continue;
      s.attempts++;
      if (r.status === 'failed') s.failed++;
      if (r.status === 'sent') {
        s.sent++; const i = dayIndex(r.attempted_at); if (s.daily[i]) s.daily[i].emails++;
      }
    }
    for (const r of callsW) {
      const s = stats.get(r.called_by_user_id); if (!s) continue;
      s.calls++; const i = dayIndex(r.called_at); if (s.daily[i]) s.daily[i].calls++;
    }

    const rows = [];
    for (const [id, s] of stats) {
      const records = s.leads + s.companies;
      rows.push({
        s, records,
        converted: get(convertedMap, id),
        wa: get(waLeadsMap, id) + get(waCompaniesMap, id),
        owned: get(ownedLeadsMap, id) + get(ownedCompaniesMap, id),
        recChange: records - (get(leadsPMap, id) + get(companiesPMap, id)),
        emailChange: s.sent - get(emailsPMap, id),
        callChange: s.calls - get(callsPMap, id),
      });
    }
    const teamRecords = rows.reduce((n, r) => n + r.records, 0);
    const sum = (fn) => rows.reduce((n, r) => n + fn(r), 0);

   const headers = [
      'Employee', 'New Leads', 'New Companies', 'Total New Records',
      'Emails Attempted', 'Emails Sent', 'Emails Failed', 'Email Success Rate',
      'WhatsApp Read (records)', 'Calls Made', 'Converted Leads',
      'Total Records Owned',
    ];
   const line = (name, r) => [
      name, r.s.leads, r.s.companies, r.records,
      r.s.attempts, r.s.sent, r.s.failed, r.s.attempts ? r.s.sent / r.s.attempts : 0,
      r.wa, r.s.calls, r.converted,
      r.owned,
    ];
    const totalRow = {
      s: {
        leads: sum((r) => r.s.leads), companies: sum((r) => r.s.companies),
        attempts: sum((r) => r.s.attempts), sent: sum((r) => r.s.sent),
        failed: sum((r) => r.s.failed), calls: sum((r) => r.s.calls),
      },
      records: teamRecords, wa: sum((r) => r.wa),converted: sum((r) => r.converted),owned: sum((r) => r.owned),
      recChange: sum((r) => r.recChange), emailChange: sum((r) => r.emailChange),
      callChange: sum((r) => r.callChange),
    };

    const fromStr = istDate(week.start.getTime());
    const toStr = istDate(week.end.getTime());
    const styleHeader = (row) => {
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      row.alignment = { vertical: 'middle', wrapText: true };
      row.height = 32;
    };

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'VRM Sales Dashboard';

    // Sheet 1: Summary
    const summary = workbook.addWorksheet('Summary');
      summary.addRow([`Daily Team Report: ${fromStr}`]).font = { bold: true, size: 14 };
    summary.addRow([`Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST | Prepared by Admin`]);
    summary.addRow([]);
    styleHeader(summary.addRow(headers));
    for (const r of rows) summary.addRow(line(r.s.name, r));
    summary.addRow(line('TEAM TOTAL', totalRow)).font = { bold: true };
    headers.forEach((h, i) => { summary.getColumn(i + 1).width = i === 0 ? 28 : Math.max(14, h.length + 2); });
    const last = headers.length;
    summary.eachRow((row, n) => {
      if (n <= 4) return;
      row.getCell(8).numFmt = '0%';
    });
    summary.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }];

        // Sheet 2: Hourly activity
    const hourly = workbook.addWorksheet('Hourly Activity');
    const hourHeaders = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
    styleHeader(hourly.addRow(['Employee', 'Metric', ...hourHeaders, 'Day Total']));
    const metrics = [['New Records', 'records'], ['Emails Sent', 'emails'], ['Calls Made', 'calls']];
    for (const { s } of rows) {
      for (const [label, key] of metrics) {
        const vals = s.daily.map((d) => d[key]);
        hourly.addRow([s.name, label, ...vals, vals.reduce((a, b) => a + b, 0)]);
      }
    }
    hourly.getColumn(1).width = 28; hourly.getColumn(2).width = 16;
    for (let c = 3; c <= 27; c++) hourly.getColumn(c).width = 8;
    hourly.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="team-daily-report-${fromStr}_to_${toStr}.xlsx"`);
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Failed to build daily report:', error);
    return res.status(500).json({ success: false, error: 'Failed to build the daily report.' });
  }
}

module.exports = { getUsers, createUser, getUserHistory, exportdailyReport, deleteUser };
