const ExcelJS = require('exceljs');
const prisma = require('../prismaClient');
const { getScopeUserIds } = require('../middleware/auth');
const { getFollowUpCounts, getFollowUpNotes, summarizeNotes } = require('../services/followUpReport');

const COUNTS = { select: { leads: true, companies: true, email_history: true, called_leads: true } };
const USER_SELECT = {
  id: true, employee_name: true, is_active: true, created_at: true, updated_at: true,
  team_id: true, email: true, role: true, last_login_at: true,
  password_hash: true, login_approved: true,
  _count: COUNTS,
};
const ASSIGNABLE_ROLES = ['admin', 'team_lead', 'caller']; // super_admin is only created with the createAdmin script
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Lead credit: a lead counts for the user who first held it. Sending it to another team
// does not reduce the sender's lead count and does not raise the receiver's.
// Returns Map(user_id -> count), or null if it cannot be worked out (then the plain owner count is kept).
async function creditedLeadCounts(ids, from, to) {
  if (!ids.length) return null;
  try {
    const range = from && to ? ' AND x.created_at >= $2::timestamptz AND x.created_at <= $3::timestamptz' : '';
    const params = from && to ? [ids, from, to] : [ids];
    const rows = await prisma.$queryRawUnsafe(
      `SELECT x.origin AS user_id, COUNT(*)::int AS n FROM (
         SELECT l.id, l.created_at,
           COALESCE((SELECT t.from_user_id FROM lead_transfers t
                     WHERE t.lead_id = l.id AND t.from_user_id IS NOT NULL
                     ORDER BY t.created_at ASC, t.id ASC LIMIT 1), l.user_id) AS origin
         FROM leads l) x
       WHERE x.origin = ANY($1::int[])${range}
       GROUP BY x.origin`,
      ...params,
    );
    return new Map(rows.map((r) => [Number(r.user_id), Number(r.n)]));
  } catch (error) {
    console.error('creditedLeadCounts failed, using owner counts:', error.message);
    return null;
  }
}
// none = no email yet, no_password = email registered, pending = password set but not approved, approved = can sign in
function loginStatus(user) {
  if (!user.email) return 'none';
  if (!user.password_hash) return 'no_password';
  return user.login_approved ? 'approved' : 'pending';
}

// Never send the password hash to the browser. Only admins see email / login details.
function toPublicUser(user, isAdmin) {
  const { password_hash, login_approved, email, last_login_at, ...rest } = user;
  if (!isAdmin) return rest;
  const login_status = loginStatus(user);
  return { ...rest, email, last_login_at, login_status, has_login: login_status === 'approved' };
}

async function getUsers(req, res) {
  try {
    const scope = await getScopeUserIds(req.user);
    const users = await prisma.users.findMany({
      where: { is_active: true, ...(scope && { id: { in: scope } }) },
      orderBy: { employee_name: 'asc' },
      select: USER_SELECT,
    });
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    return res.json({ success: true, data: users.map((u) => toPublicUser(u, isAdmin)) });
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
      select: USER_SELECT,
    });
    return res.status(201).json({ success: true, data: toPublicUser(user, true) });
  } catch (error) {
    console.error('Failed to create employee:', error);
    return res.status(500).json({ success: false, error: 'Failed to create employee.' });
  }
}

// Super Admin: every active employee with their login state, for the Access Control page.
async function getAccessUsers(req, res) {
  try {
    const users = await prisma.users.findMany({
      where: { is_active: true },
      orderBy: { employee_name: 'asc' },
      select: { ...USER_SELECT, team: { select: { name: true } } },
    });
    return res.json({
      success: true,
      data: users.map((u) => ({ ...toPublicUser(u, true), team_name: u.team?.name || null })),
    });
  } catch (error) {
    console.error('Failed to fetch access list:', error);
    return res.status(500).json({ success: false, error: 'Failed to load access list.' });
  }
}

// Super Admin only: register an email, assign the role, approve / revoke, reset a password or switch login off.
// Employees set their own password themselves (POST /api/auth/set-password).
async function setUserLogin(req, res) {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ success: false, error: 'Invalid employee ID.' });
  }
  try {
    const target = await prisma.users.findFirst({ where: { id: userId, is_active: true } });
    if (!target) return res.status(404).json({ success: false, error: 'Employee not found.' });
    if (target.role === 'super_admin') {
      return res.status(400).json({ success: false, error: 'The Super Admin account cannot be changed here.' });
    }

    const body = req.body || {};
    const data = { updated_at: new Date() };

    if (body.email !== undefined && body.email !== null && body.email !== '') {
      const email = String(body.email).trim().toLowerCase();
      if (!EMAIL_RE.test(email) || email.length > 255) {
        return res.status(400).json({ success: false, error: 'Enter a valid email address.' });
      }
      if (email !== (target.email || '').toLowerCase()) {
        const taken = await prisma.users.findFirst({
          where: { email: { equals: email, mode: 'insensitive' }, id: { not: userId } },
          select: { id: true },
        });
        if (taken) return res.status(400).json({ success: false, error: 'That email is already used by another employee.' });
        data.email = email;
        // a new email means the employee has to set a password again and be re-approved
        data.password_hash = null;
        data.login_approved = false;
      }
    }

    if (body.role !== undefined && body.role !== null && body.role !== '') {
      if (!ASSIGNABLE_ROLES.includes(body.role)) {
        return res.status(400).json({ success: false, error: 'Role must be admin, team_lead or caller.' });
      }
      data.role = body.role;
    }

    if (body.reset_password === true || body.disable_login === true) {
      data.password_hash = null;
      data.login_approved = false;
    }

    if (body.approve === true) {
      const hasPassword = data.password_hash === undefined ? Boolean(target.password_hash) : Boolean(data.password_hash);
      if (!hasPassword || !(data.email ?? target.email)) {
        return res.status(400).json({ success: false, error: 'This employee has not set a password yet.' });
      }
      data.login_approved = true;
    } else if (body.approve === false) {
      data.login_approved = false;
    }

    const user = await prisma.users.update({
      where: { id: userId },
      data,
      select: { ...USER_SELECT, team: { select: { name: true } } },
    });
    return res.json({ success: true, data: { ...toPublicUser(user, true), team_name: user.team?.name || null } });
  } catch (error) {
    console.error('Failed to update login:', error);
    return res.status(500).json({ success: false, error: 'Failed to update login.' });
  }
}

async function deleteUser(req, res) {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ success: false, error: 'Invalid employee ID.' });
  }
  if (userId === req.user.id) {
    return res.status(400).json({ success: false, error: 'You cannot remove your own account.' });
  }
  try {
    const user = await prisma.users.findFirst({ where: { id: userId, is_active: true } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'Employee not found.' });
    }
    if (user.role === 'super_admin') {
      return res.status(400).json({ success: false, error: 'The Super Admin cannot be removed.' });
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
    const scope = await getScopeUserIds(req.user);
    if (scope && !scope.includes(userId)) {
      return res.status(403).json({ success: false, error: 'You can only view your own team.' });
    }
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

// Team Directory data: one row per employee with today's lead and call counts (India time).
// Admin / Super Admin may pick any team (?team_id=3, ?team_id=unassigned, or all).
// Team Leads and Callers always get only their own team, whatever they ask for.
async function getTeamReport(req, res) {
  try {
    const me = req.user;
    const isAdmin = me.role === 'admin' || me.role === 'super_admin';
    const where = { is_active: true };

    if (isAdmin) {
      const raw = req.query.team_id;
      if (raw === 'unassigned') {
        where.team_id = null;
      } else if (raw !== undefined && raw !== '' && raw !== 'all') {
        const teamId = Number(raw);
        if (!Number.isInteger(teamId) || teamId < 1) {
          return res.status(400).json({ success: false, error: 'Invalid team.' });
        }
        where.team_id = teamId;
      }
    } else if (me.team_id) {
      where.team_id = me.team_id;
    } else {
      where.id = me.id; // not in a team yet: only themselves
    }

    const day = getIstDay(undefined, 0);
    const users = await prisma.users.findMany({
      where,
      orderBy: { employee_name: 'asc' },
      select: { ...USER_SELECT, team: { select: { name: true } } },
    });
    const ids = users.map((u) => u.id);

    const [leadGroups, callGroups, teams] = await Promise.all([
      ids.length
        ? prisma.leads.groupBy({
          by: ['user_id'],
          where: { user_id: { in: ids }, created_at: { gte: day.start, lte: day.end } },
          _count: { _all: true },
        })
        : [],
      ids.length
        ? prisma.leads.groupBy({
          by: ['called_by_user_id'],
          where: { is_called: true, called_by_user_id: { in: ids }, called_at: { gte: day.start, lte: day.end } },
          _count: { _all: true },
        })
        : [],
      isAdmin
        ? prisma.teams.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);

    const [fu, fuNotes] = await Promise.all([
      getFollowUpCounts(ids, day.start, day.end),
      getFollowUpNotes(ids, day.start, day.end),
    ]);
    const statusWhere = { is_called: true, called_by_user_id: { in: ids }, lead_status: { in: ['interested', 'not_interested', 'converted'] } };
    const [statusAll, statusToday] = ids.length
      ? await Promise.all([
        prisma.leads.groupBy({ by: ['called_by_user_id', 'lead_status'], where: statusWhere, _count: { _all: true } }),
        prisma.leads.groupBy({ by: ['called_by_user_id', 'lead_status'], where: { ...statusWhere, lead_status_at: { gte: day.start, lte: day.end } }, _count: { _all: true } }),
      ])
      : [[], []];
    const [sentAll, sentToday, recvAll, recvToday] = ids.length
      ? await Promise.all([
        prisma.lead_transfers.groupBy({ by: ['from_user_id'], where: { from_user_id: { in: ids } }, _count: { _all: true } }),
        prisma.lead_transfers.groupBy({ by: ['from_user_id'], where: { from_user_id: { in: ids }, created_at: { gte: day.start, lte: day.end } }, _count: { _all: true } }),
        prisma.lead_transfers.groupBy({ by: ['to_user_id'], where: { to_user_id: { in: ids } }, _count: { _all: true } }),
        prisma.lead_transfers.groupBy({ by: ['to_user_id'], where: { to_user_id: { in: ids }, created_at: { gte: day.start, lte: day.end } }, _count: { _all: true } }),
      ]).catch(() => [[], [], [], []])
      : [[], [], [], []];
    const transferCount = (list, key, id) => list.find((g) => g[key] === id)?._count._all || 0;
    const statusCount = (list, id, status) => list.find((g) => g.called_by_user_id === id && g.lead_status === status)?._count._all || 0;
    const leadsToday = new Map(leadGroups.map((g) => [g.user_id, g._count._all]));
    const callsToday = new Map(callGroups.map((g) => [g.called_by_user_id, g._count._all]));

    const creditAll = await creditedLeadCounts(ids);
    const creditToday = await creditedLeadCounts(ids, day.start, day.end);
    const rows = users.map((u) => ({
      ...toPublicUser(u, isAdmin),
      _count: creditAll ? { ...u._count, leads: creditAll.get(u.id) || 0 } : u._count,
      team_name: u.team?.name || null,
      leads_today: (creditToday ? creditToday.get(u.id) : leadsToday.get(u.id)) || 0,
      calls_today: callsToday.get(u.id) || 0,
      followups_today: fu.today.get(u.id) || 0,
      followups_total: fu.total.get(u.id) || 0,
      followup_status: summarizeNotes(fuNotes.get(u.id) || []),
      interested_today: statusCount(statusToday, u.id, 'interested'),
      interested_total: statusCount(statusAll, u.id, 'interested'),
      not_interested_today: statusCount(statusToday, u.id, 'not_interested'),
      not_interested_total: statusCount(statusAll, u.id, 'not_interested'),
      converted_today: statusCount(statusToday, u.id, 'converted'),
      converted_total: statusCount(statusAll, u.id, 'converted'),
      leads_sent_today: transferCount(sentToday, 'from_user_id', u.id),
      leads_sent_total: transferCount(sentAll, 'from_user_id', u.id),
      leads_received_today: transferCount(recvToday, 'to_user_id', u.id),
      leads_received_total: transferCount(recvAll, 'to_user_id', u.id),
    }));

    let ownTeam = null;
    if (!isAdmin && me.team_id) {
      ownTeam = (await prisma.teams.findUnique({ where: { id: me.team_id }, select: { id: true, name: true } })) || null;
    }

    return res.json({ success: true, data: { rows, teams, own_team: ownTeam, date: istDate(day.start.getTime()) } });
  } catch (error) {
    console.error('Failed to build team report:', error);
    return res.status(500).json({ success: false, error: 'Failed to load the team report.' });
  }
}

const UNASSIGNED = 'Unassigned';
const MAX_RANGE_DAYS = 92;

// Builds the single "Team Report" sheet: one block per team.
// Day columns = From..To dates. Overall columns = everything up to the To date.
// Wrap text, size the header and set row heights so long Follow-up Status text is readable
// without scrolling sideways. statusCol = 1-based column number, statusWidth = its width in characters.
function finishSheet(sheet, statusCol, statusWidth) {
  sheet.eachRow((row) => {
    const first = row.getCell(1).value;
    if (first === 'Person') {
      row.height = 44;
      row.eachCell((cell) => { cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
      return;
    }
    const cell = row.getCell(statusCol);
    if (typeof cell.value === 'string' && cell.value.length > 1 && !cell.isMerged) {
      cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
      const lines = cell.value.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / (statusWidth * 0.95))), 0);
      row.height = Math.max(18, lines * 15 + 4);
      row.eachCell((c, i) => { if (i !== statusCol && !c.isMerged) c.alignment = { ...(c.alignment || {}), vertical: 'top', wrapText: i === 1 }; });
    }
  });
  sheet.views = [{ zoomScale: 90 }];
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

async function addTeamReportSheet(workbook, rangeStart, rangeEnd) {
  const [users, teams, leads, calls, transfers] = await Promise.all([
    prisma.users.findMany({
      where: { is_active: true },
      orderBy: { employee_name: 'asc' },
      select: { id: true, employee_name: true, team_id: true },
    }),
    prisma.teams.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.leads.findMany({
      where: { user_id: { not: null }, created_at: { lte: rangeEnd } },
      select: { id: true, user_id: true, created_at: true, lead_status: true },
    }),
    prisma.leads.findMany({
      where: { is_called: true, called_by_user_id: { not: null }, called_at: { lte: rangeEnd } },
         select: { called_by_user_id: true, called_at: true, lead_status: true, lead_status_at: true },
    }),
    // leads sent to / received from other teams in the selected date range
    prisma.lead_transfers.findMany({
      where: { created_at: { gte: rangeStart, lte: rangeEnd } },
      select: { from_user_id: true, to_user_id: true },
    }).catch(() => []),
  ]);

  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const blank = () => ({
    callsDay: 0, leadsDay: 0, callsAll: 0, leadsAll: 0, exported: 0, imported: 0,
    intDay: 0, intAll: 0, notDay: 0, notAll: 0, convDay: 0, convAll: 0,
    fuDay: 0, fuAll: 0, notes: [],
  });
  const keys = ['callsDay', 'leadsDay', 'callsAll', 'leadsAll', 'exported', 'imported', 'intDay', 'intAll', 'notDay', 'notAll', 'convDay', 'convAll', 'fuDay', 'fuAll'];
  const STATUS_KEYS = { interested: ['intDay', 'intAll'], not_interested: ['notDay', 'notAll'], converted: ['convDay', 'convAll'] };
  const fuIds = users.map((u) => u.id);
  const [fu, fuNotes] = await Promise.all([
    getFollowUpCounts(fuIds, rangeStart, rangeEnd),
    getFollowUpNotes(fuIds, rangeStart, rangeEnd),
  ]);
  const inDay = (d) => new Date(d) >= rangeStart;

  const people = new Map(users.map((u) => [u.id, {
    name: u.employee_name,
    team: (u.team_id && teamName.get(u.team_id)) || UNASSIGNED,
    ...blank(),
  }]));

  for (const u of users) {
    const p = people.get(u.id); if (!p) continue;
    p.fuDay = fu.today.get(u.id) || 0;
    p.fuAll = fu.total.get(u.id) || 0;
    p.notes = fuNotes.get(u.id) || [];
  }
  // a lead counts for the user who first held it (sending it on does not change that)
  const firstHolder = new Map();
  const firstMoves = await prisma.lead_transfers.findMany({
    where: { from_user_id: { not: null } },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    select: { lead_id: true, from_user_id: true },
  }).catch(() => []);
  for (const m of firstMoves) if (!firstHolder.has(m.lead_id)) firstHolder.set(m.lead_id, m.from_user_id);
  for (const l of leads) {
    const p = people.get(firstHolder.get(l.id) ?? l.user_id); if (!p) continue;
    p.leadsAll++;
    if (inDay(l.created_at)) p.leadsDay++;
  }
  for (const t of transfers) {
    const from = people.get(t.from_user_id); if (from) from.exported++;
    const to = people.get(t.to_user_id); if (to) to.imported++;
  }
  for (const c of calls) {
    const p = people.get(c.called_by_user_id); if (!p) continue;
    p.callsAll++;
    if (inDay(c.called_at)) p.callsDay++;
    const sk = STATUS_KEYS[c.lead_status];
    if (sk) {
      p[sk[1]]++;
      if (c.lead_status_at && new Date(c.lead_status_at) >= rangeStart && new Date(c.lead_status_at) <= rangeEnd) p[sk[0]]++;
    }
  }

  const totalOf = (list) => keys.map((k) => list.reduce((n, x) => n + x[k], 0));
  const COLS = 16;

  const sheet = workbook.addWorksheet('Team Report');
  sheet.columns = [{ width: 18 }, ...Array.from({ length: COLS - 2 }, () => ({ width: 10 })), { width: 50 }];

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

  const blockHeaders = ['Person', 'Calls (day)', 'Leads (day)', 'Calls (overall)', 'Leads (overall)', 'Leads Sent', 'Leads Received', 'Interested (day)', 'Interested (overall)', 'Not Interested (day)', 'Not Interested (overall)', 'Converted (day)', 'Converted (overall)', 'Follow-ups Today', 'Overall Follow-ups', 'Follow-up Status'];

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
      styleRowCells(sheet.addRow([p.name, ...keys.map((k) => p[k]), summarizeNotes(p.notes, '\n') || '-']));
    }
    styleRowCells(sheet.addRow(['TEAM TOTAL', ...totalOf(members), '']), { fill: 'FFDBEAFE', bold: true });
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
  styleRowCells(sheet.addRow(['GRAND TOTAL', ...totalOf(listed), '']), { fill: 'FF1E3A8A', bold: true, color: 'FFFFFFFF' });
  finishSheet(sheet, COLS, 50);
}

// "Follow-up Report" sheet: per team and per person.
// Follow-ups Today / Overall come from follow-up emails actually sent (email_history).
// Follow-up Status summarises the cleaned follow-up notes saved in the chosen date range.
async function addFollowUpReportSheet(workbook, rangeStart, rangeEnd) {
  const [users, teams] = await Promise.all([
    prisma.users.findMany({
      where: { is_active: true },
      orderBy: { employee_name: 'asc' },
      select: { id: true, employee_name: true, team_id: true },
    }),
    prisma.teams.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  const ids = users.map((u) => u.id);
  const [fu, notes] = await Promise.all([
    getFollowUpCounts(ids, rangeStart, rangeEnd),
    getFollowUpNotes(ids, rangeStart, rangeEnd),
  ]);

  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const people = users.map((u) => ({
    name: u.employee_name,
    team: (u.team_id && teamName.get(u.team_id)) || UNASSIGNED,
    today: fu.today.get(u.id) || 0,
    total: fu.total.get(u.id) || 0,
    notes: notes.get(u.id) || [],
  }));

  const COLS = 4;
  const sheet = workbook.addWorksheet('Follow-up Report');
  sheet.columns = [{ width: 20 }, { width: 14 }, { width: 14 }, { width: 60 }];

  const fromStr = istDate(rangeStart.getTime());
  const toStr = istDate(rangeEnd.getTime());
  sheet.mergeCells(1, 1, 1, COLS);
  sheet.getCell(1, 1).value = fromStr === toStr ? `Follow-up Report: ${fromStr}` : `Follow-up Report: ${fromStr} to ${toStr}`;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.addRow([]);

  const thin = { style: 'thin', color: { argb: 'FFCBD5E1' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const style = (r, opts = {}) => {
    for (let c = 1; c <= COLS; c++) {
      const cell = r.getCell(c);
      cell.border = border;
      cell.alignment = { horizontal: c === 1 || c === 4 ? 'left' : 'center', vertical: 'top', wrapText: true };
      if (opts.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
      if (opts.bold) cell.font = { bold: true, color: opts.color ? { argb: opts.color } : undefined };
    }
  };

  const addBlock = (name, members) => {
    const titleRow = sheet.addRow([name]);
    sheet.mergeCells(titleRow.number, 1, titleRow.number, COLS);
    const t = sheet.getCell(titleRow.number, 1);
    t.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    t.alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 26;
    style(sheet.addRow(['Person', 'Follow-ups Today', 'Overall Follow-ups', 'Follow-up Status']), { fill: 'FF2563EB', bold: true, color: 'FFFFFFFF' });
    if (!members.length) {
      const empty = sheet.addRow(['(no members)']);
      style(empty);
      empty.getCell(1).font = { italic: true, color: { argb: 'FF94A3B8' } };
    }
    for (const p of members) style(sheet.addRow([p.name, p.today, p.total, summarizeNotes(p.notes, '\n') || '-']));
    style(sheet.addRow([
      'TEAM TOTAL',
      members.reduce((n, m) => n + m.today, 0),
      members.reduce((n, m) => n + m.total, 0),
      '',
    ]), { fill: 'FFDBEAFE', bold: true });
    sheet.addRow([]);
  };

  const listed = [];
  for (const team of teams) {
    const members = people.filter((p) => p.team === team.name);
    listed.push(...members);
    addBlock(team.name, members);
  }
  const unassigned = people.filter((p) => p.team === UNASSIGNED);
  if (unassigned.length) {
    listed.push(...unassigned);
    addBlock(UNASSIGNED, unassigned);
  }
  style(sheet.addRow([
    'GRAND TOTAL',
    listed.reduce((n, m) => n + m.today, 0),
    listed.reduce((n, m) => n + m.total, 0),
    '',
  ]), { fill: 'FF1E3A8A', bold: true, color: 'FFFFFFFF' });
  finishSheet(sheet, COLS, 60);
}


// "Team Transfers" sheet: leads sent between teams in the selected range.
// Part 1 = team to team summary (exported by the sending team / imported by the receiving team),
// Part 2 = every transferred lead.
async function addTransfersSheet(workbook, rangeStart, rangeEnd) {
  const [transfers, users, teams] = await Promise.all([
    prisma.lead_transfers.findMany({
      where: { created_at: { gte: rangeStart, lte: rangeEnd } },
      orderBy: { created_at: 'asc' },
    }).catch(() => []),
    prisma.users.findMany({ select: { id: true, employee_name: true } }),
    prisma.teams.findMany({ select: { id: true, name: true } }),
  ]);
  const leadIds = [...new Set(transfers.map((t) => t.lead_id))];
  const leads = leadIds.length
    ? await prisma.leads.findMany({
        where: { id: { in: leadIds } },
        select: { id: true, full_name: true, company_name: true, phone_number: true, whatsapp_number: true, lead_status: true },
      })
    : [];
  const leadOf = new Map(leads.map((l) => [l.id, l]));
  const userName = new Map(users.map((u) => [u.id, u.employee_name]));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  // full route of each lead across ALL its moves (not only the ones in the date range)
  const allMoves = leadIds.length
    ? await prisma.lead_transfers.findMany({
        where: { lead_id: { in: leadIds } },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        select: { lead_id: true, from_user_id: true, to_user_id: true },
      }).catch(() => [])
    : [];
  const routeIds = new Map();
  for (const m of allMoves) {
    if (!routeIds.has(m.lead_id)) routeIds.set(m.lead_id, m.from_user_id ? [m.from_user_id] : []);
    if (m.to_user_id) routeIds.get(m.lead_id).push(m.to_user_id);
  }
  const tName = (id) => (id && teamName.get(id)) || UNASSIGNED;
  const uName = (id) => (id && userName.get(id)) || '-';

  const COLS = 11;
  const sheet = workbook.addWorksheet('Team Transfers');
  sheet.columns = [{ width: 20 }, { width: 24 }, { width: 24 }, { width: 18 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 18 }, { width: 44 }];
  const fromStr = istDate(rangeStart.getTime());
  const toStr = istDate(rangeEnd.getTime());
  sheet.mergeCells(1, 1, 1, COLS);
  sheet.getCell(1, 1).value = fromStr === toStr ? `Team Transfers: ${fromStr}` : `Team Transfers: ${fromStr} to ${toStr}`;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.addRow([]);

  const thin = { style: 'thin', color: { argb: 'FFCBD5E1' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const head = (values) => {
    const r = sheet.addRow(values);
    for (let c = 1; c <= values.length; c++) {
      const cell = r.getCell(c);
      cell.border = border;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }
    r.height = 30;
  };
  const body = (values) => {
    const r = sheet.addRow(values);
    for (let c = 1; c <= values.length; c++) r.getCell(c).border = border;
    return r;
  };

  // Part 1: team to team
  const pairs = new Map();
  for (const t of transfers) {
    const key = `${t.from_team_id || 0}>${t.to_team_id || 0}`;
    if (!pairs.has(key)) pairs.set(key, { from: tName(t.from_team_id), to: tName(t.to_team_id), n: 0 });
    pairs.get(key).n++;
  }
  sheet.addRow(['Team to team summary']).font = { bold: true, size: 12 };
  head(['Sending Team', 'Receiving Team', 'Leads Sent (by sending team)', 'Leads Received (by receiving team)']);
  if (!pairs.size) {
    const r = body(['No leads were transferred in this period.', '', '', '']);
    r.getCell(1).font = { italic: true, color: { argb: 'FF94A3B8' } };
  }
  let total = 0;
  for (const p of [...pairs.values()].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))) {
    total += p.n;
    body([p.from, p.to, p.n, p.n]);
  }
  if (pairs.size) {
    const r = body(['TOTAL', '', total, total]);
    for (let c = 1; c <= 4; c++) {
      r.getCell(c).font = { bold: true };
      r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    }
  }
  sheet.addRow([]);

  // Part 2: lead details
  sheet.addRow(['Transferred leads']).font = { bold: true, size: 12 };
  head(['Date & Time (IST)', 'Lead', 'Company', 'Phone', 'Sent By (owner)', 'Sending Team', 'Received By', 'Receiving Team', 'Sent Via (clicked by)', 'Current Status', 'Full Route (all moves)']);
  for (const t of transfers) {
    const l = leadOf.get(t.lead_id) || {};
    body([
      new Date(t.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }),
      l.full_name || `Lead #${t.lead_id}`,
      l.company_name || '-',
      l.phone_number || l.whatsapp_number || '-',
      uName(t.from_user_id),
      tName(t.from_team_id),
      uName(t.to_user_id),
      tName(t.to_team_id),
      uName(t.transferred_by_user_id),
      l.lead_status || '-',
      (routeIds.get(t.lead_id) || []).map((id) => uName(id)).join(' → ') || '-',
    ]);
  }
  sheet.views = [{ zoomScale: 90 }];
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
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
    await addFollowUpReportSheet(workbook, day.start, rangeEnd);
    await addTransfersSheet(workbook, day.start, rangeEnd);

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="team-report-${istDate(day.start.getTime())}_to_${istDate(rangeEnd.getTime())}.xlsx"`);
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Failed to build daily report:', error);
    return res.status(500).json({ success: false, error: 'Failed to build the daily report.' });
  }
}

async function renameUser(req, res) {
  const id = Number(req.params.id);
  const employeeName = typeof req.body?.employee_name === 'string' ? req.body.employee_name.trim() : '';
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, error: 'Invalid user ID.' });
  if (!employeeName || employeeName.length > 255) {
    return res.status(400).json({ success: false, error: 'Employee name is required and must be 255 characters or fewer.' });
  }
  try {
    const user = await prisma.users.update({
      where: { id },
      data: { employee_name: employeeName, updated_at: new Date() },
      select: { id: true, employee_name: true },
    });
    return res.json({ success: true, data: user });
  } catch (error) {
    console.error('Failed to rename employee:', error);
    return res.status(500).json({ success: false, error: 'Failed to rename employee.' });
  }
}

module.exports = { getUsers, getTeamReport, createUser, getAccessUsers, setUserLogin, getUserHistory, exportdailyReport, deleteUser, renameUser };