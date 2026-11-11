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

const UNASSIGNED = 'Unassigned';
const MAX_RANGE_DAYS = 92;

// Builds the single "Team Report" sheet: one block per team.
// Day columns = From..To dates. Overall columns = everything up to the To date.
async function addTeamReportSheet(workbook, rangeStart, rangeEnd) {
  const [users, teams, leads, calls] = await Promise.all([
    prisma.users.findMany({
      where: { is_active: true },
      orderBy: { employee_name: 'asc' },
      select: { id: true, employee_name: true, team_id: true },
    }),
    prisma.teams.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.leads.findMany({
      where: { user_id: { not: null }, created_at: { lte: rangeEnd } },
      select: { user_id: true, created_at: true, lead_status: true },
    }),
    prisma.leads.findMany({
      where: { is_called: true, called_by_user_id: { not: null }, called_at: { lte: rangeEnd } },
      select: { called_by_user_id: true, called_at: true },
    }),
  ]);

  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const blank = () => ({
    callsDay: 0, leadsDay: 0, callsAll: 0, leadsAll: 0,
    interested: 0, not_interested: 0, converted: 0,
  });
  const keys = ['callsDay', 'leadsDay', 'callsAll', 'leadsAll', 'interested', 'not_interested', 'converted'];
  const inDay = (d) => new Date(d) >= rangeStart;

  const people = new Map(users.map((u) => [u.id, {
    name: u.employee_name,
    team: (u.team_id && teamName.get(u.team_id)) || UNASSIGNED,
    ...blank(),
  }]));

  for (const l of leads) {
    const p = people.get(l.user_id); if (!p) continue;
    p.leadsAll++;
    if (inDay(l.created_at)) p.leadsDay++;
    if (['interested', 'not_interested', 'converted'].includes(l.lead_status)) p[l.lead_status]++;
  }
  for (const c of calls) {
    const p = people.get(c.called_by_user_id); if (!p) continue;
    p.callsAll++;
    if (inDay(c.called_at)) p.callsDay++;
  }

  const totalOf = (list) => keys.map((k) => list.reduce((n, x) => n + x[k], 0));
  const COLS = 8;

  const sheet = workbook.addWorksheet('Team Report');
  sheet.columns = [{ width: 28 }, ...Array.from({ length: COLS - 1 }, () => ({ width: 16 }))];

  const fromStr = istDate(rangeStart.getTime());
  const toStr = istDate(rangeEnd.getTime());
  sheet.mergeCells(1, 1, 1, COLS);
  sheet.getCell(1, 1).value = fromStr === toStr ? `Team Report: ${fromStr}` : `Team Report: ${fromStr} to ${toStr}`;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.addRow([]);

  const thin = { style: 'thin', color: { argb: 'FFCBD5E1' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const styleRowCells = (r, opts = {}) => {
    for (let c = 1; c <= COLS; c++) {
      const cell = r.getCell(c);
      cell.border = border;
      if (c > 1) cell.alignment = { horizontal: 'center' };
      if (opts.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
      if (opts.bold) cell.font = { bold: true, color: opts.color ? { argb: opts.color } : undefined };
    }
  };

  const blockHeaders = ['Person', 'Calls (day)', 'Leads (day)', 'Calls (overall)', 'Leads (overall)', 'Interested', 'Not Interested', 'Converted'];

  const addBlock = (name, members) => {
    // Team name: one merged cell across all 8 columns
    const titleRow = sheet.addRow([name]);
    sheet.mergeCells(titleRow.number, 1, titleRow.number, COLS);
    const t = sheet.getCell(titleRow.number, 1);
    t.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    t.alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 26;

    styleRowCells(sheet.addRow(blockHeaders), { fill: 'FF2563EB', bold: true, color: 'FFFFFFFF' });

    if (members.length === 0) {
      const empty = sheet.addRow(['(no members)']);
      styleRowCells(empty);
      empty.getCell(1).font = { italic: true, color: { argb: 'FF94A3B8' } };
    }
    for (const p of members) {
      styleRowCells(sheet.addRow([p.name, ...keys.map((k) => p[k])]));
    }
    styleRowCells(sheet.addRow(['TEAM TOTAL', ...totalOf(members)]), { fill: 'FFDBEAFE', bold: true });
    sheet.addRow([]);
  };

  const listed = [];
  for (const team of teams) {
    const members = [...people.values()].filter((p) => p.team === team.name);
    listed.push(...members);
    addBlock(team.name, members);
  }
  const unassigned = [...people.values()].filter((p) => p.team === UNASSIGNED);
  if (unassigned.length) {
    listed.push(...unassigned);
    addBlock(UNASSIGNED, unassigned);
  }
  styleRowCells(sheet.addRow(['GRAND TOTAL', ...totalOf(listed)]), { fill: 'FF1E3A8A', bold: true, color: 'FFFFFFFF' });
}

async function exportdailyReport(req, res) {
  try {
    const day = getIstDay(req.query.date, 0);
    if (Number.isNaN(day.start.getTime())) {
      return res.status(400).json({ success: false, error: 'Enter a valid date (YYYY-MM-DD).' });
    }

    let rangeEnd = day.end;
    if (req.query.to) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to))) {
        return res.status(400).json({ success: false, error: 'Enter a valid "to" date (YYYY-MM-DD).' });
      }
      rangeEnd = getIstDay(req.query.to, 0).end;
      if (Number.isNaN(rangeEnd.getTime()) || rangeEnd < day.start) {
        return res.status(400).json({ success: false, error: 'The "to" date must be on or after the "from" date.' });
      }
      if (rangeEnd - day.start > MAX_RANGE_DAYS * DAY_MS) {
        return res.status(400).json({ success: false, error: `Date range can be at most ${MAX_RANGE_DAYS} days.` });
      }
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'VRM Sales Dashboard';
    await addTeamReportSheet(workbook, day.start, rangeEnd);

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="team-report-${istDate(day.start.getTime())}_to_${istDate(rangeEnd.getTime())}.xlsx"`);
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Failed to build daily report:', error);
    return res.status(500).json({ success: false, error: 'Failed to build the daily report.' });
  }
}

module.exports = { getUsers, createUser, getUserHistory, exportdailyReport, deleteUser };