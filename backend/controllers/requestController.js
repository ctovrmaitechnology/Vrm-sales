const ExcelJS = require('exceljs');
const prisma = require('../prismaClient');

const MAX_LEADS = 1000;
const MAX_NOTE = 300;

async function nameMap(ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return new Map();
  const users = await prisma.users.findMany({
    where: { id: { in: list } },
    select: { id: true, employee_name: true, team: { select: { name: true } } },
  });
  return new Map(users.map((u) => [u.id, u]));
}

const shape = (r, uMap) => ({
  id: r.id,
  from_user_id: r.from_user_id,
  to_user_id: r.to_user_id,
  from_user: uMap.get(r.from_user_id)?.employee_name || 'Unknown',
  from_team: uMap.get(r.from_user_id)?.team?.name || '',
  to_user: uMap.get(r.to_user_id)?.employee_name || 'Unknown',
  to_team: uMap.get(r.to_user_id)?.team?.name || '',
  leads_requested: r.leads_requested,
  note: r.note || '',
  status: r.status,
  created_at: r.created_at,
  done_at: r.done_at,
});

// Active users a request can be sent to (everyone except the requester)
async function getRequestUsers(req, res) {
  try {
    const users = await prisma.users.findMany({
      where: { is_active: true, id: { not: req.user.id } },
      orderBy: { employee_name: 'asc' },
      select: { id: true, employee_name: true, team: { select: { name: true } } },
    });
    return res.json({ success: true, data: users.map((u) => ({ id: u.id, employee_name: u.employee_name, team_name: u.team?.name || '' })) });
  } catch (e) {
    console.error('getRequestUsers failed:', e);
    return res.status(500).json({ success: false, error: 'Failed to load users.' });
  }
}

async function createRequest(req, res) {
  const toUserId = Number(req.body?.to_user_id);
  const count = Number(req.body?.leads_requested);
  const note = String(req.body?.note || '').trim().slice(0, MAX_NOTE);
  if (!Number.isInteger(toUserId) || toUserId < 1) return res.status(400).json({ success: false, error: 'Choose who to ask.' });
  if (toUserId === req.user.id) return res.status(400).json({ success: false, error: 'You cannot send a request to yourself.' });
  if (!Number.isInteger(count) || count < 1 || count > MAX_LEADS) {
    return res.status(400).json({ success: false, error: `Number of leads must be between 1 and ${MAX_LEADS}.` });
  }
  try {
    const target = await prisma.users.findFirst({ where: { id: toUserId, is_active: true }, select: { id: true } });
    if (!target) return res.status(400).json({ success: false, error: 'That user is not available.' });
    const row = await prisma.lead_requests.create({
      data: { from_user_id: req.user.id, to_user_id: toUserId, leads_requested: count, note: note || null },
    });
    return res.json({ success: true, data: { id: row.id } });
  } catch (e) {
    console.error('createRequest failed:', e);
    return res.status(500).json({ success: false, error: 'Failed to send the request.' });
  }
}

async function getMyRequests(req, res) {
  try {
    const me = req.user.id;
    const rows = await prisma.lead_requests.findMany({
      where: { OR: [{ from_user_id: me }, { to_user_id: me }] },
      orderBy: { created_at: 'desc' },
      take: 1000,
    });
    const uMap = await nameMap(rows.flatMap((r) => [r.from_user_id, r.to_user_id]));
    const all = rows.map((r) => shape(r, uMap));
    const received = all.filter((r) => r.to_user_id === me);
    return res.json({
      success: true,
      data: {
        received,
        sent: all.filter((r) => r.from_user_id === me),
        pending_received: received.filter((r) => r.status === 'pending').length,
      },
    });
  } catch (e) {
    console.error('getMyRequests failed:', e);
    return res.status(500).json({ success: false, error: 'Failed to load requests.' });
  }
}

// Only the person who was asked (or super admin) can mark a request done
async function markRequestDone(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, error: 'Invalid request.' });
  try {
    const row = await prisma.lead_requests.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ success: false, error: 'Request not found.' });
    if (row.to_user_id !== req.user.id && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Only the person asked can mark this done.' });
    }
    if (row.status === 'done') return res.json({ success: true });
    await prisma.lead_requests.update({ where: { id }, data: { status: 'done', done_at: new Date(), done_by_user_id: req.user.id } });
    return res.json({ success: true });
  } catch (e) {
    console.error('markRequestDone failed:', e);
    return res.status(500).json({ success: false, error: 'Failed to update the request.' });
  }
}

// Shared by the super admin table and Excel export: filters = status, user, from, to (YYYY-MM-DD, IST)
async function loadFiltered(query) {
  const where = {};
  if (query.status === 'pending' || query.status === 'done') where.status = query.status;
  const uid = Number(query.user);
  if (Number.isInteger(uid) && uid > 0) where.OR = [{ from_user_id: uid }, { to_user_id: uid }];
  const range = {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.from || '')) range.gte = new Date(`${query.from}T00:00:00+05:30`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.to || '')) range.lte = new Date(`${query.to}T23:59:59.999+05:30`);
  if (range.gte || range.lte) where.created_at = range;

  const rows = await prisma.lead_requests.findMany({ where, orderBy: { created_at: 'desc' }, take: 5000 });
  const uMap = await nameMap(rows.flatMap((r) => [r.from_user_id, r.to_user_id]));
  const data = rows.map((r) => shape(r, uMap));

  const summary = {
    total: data.length,
    pending: data.filter((r) => r.status === 'pending').length,
    done: data.filter((r) => r.status === 'done').length,
    leads_asked: data.reduce((s, r) => s + r.leads_requested, 0),
  };
  const per = new Map();
  const slot = (id, name, team) => {
    if (!per.has(id)) per.set(id, { user_id: id, user: name, team, sent: 0, received: 0, leads_asked: 0, leads_received: 0, pending: 0, done: 0 });
    return per.get(id);
  };
  for (const r of data) {
    const a = slot(r.from_user_id, r.from_user, r.from_team);
    a.sent += 1; a.leads_asked += r.leads_requested;
    const b = slot(r.to_user_id, r.to_user, r.to_team);
    b.received += 1; b.leads_received += r.leads_requested;
    if (r.status === 'pending') b.pending += 1; else b.done += 1;
  }
  const per_user = [...per.values()].sort((x, y) => y.sent + y.received - (x.sent + x.received));
  return { data, summary, per_user };
}

async function getAllRequests(req, res) {
  try {
    return res.json({ success: true, ...(await loadFiltered(req.query)) });
  } catch (e) {
    console.error('getAllRequests failed:', e);
    return res.status(500).json({ success: false, error: 'Failed to load requests.' });
  }
}

async function exportRequests(req, res) {
  try {
    const { data, summary, per_user } = await loadFiltered(req.query);
    const wb = new ExcelJS.Workbook();
    const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-');

    const s1 = wb.addWorksheet('Requests');
    s1.columns = [{ width: 22 }, { width: 22 }, { width: 22 }, { width: 14 }, { width: 40 }, { width: 10 }, { width: 22 }];
    s1.addRow(['Date', 'From', 'To', 'Leads Asked', 'Note', 'Status', 'Done On']).font = { bold: true };
    data.forEach((r) => s1.addRow([fmt(r.created_at), `${r.from_user}${r.from_team ? ` (${r.from_team})` : ''}`, `${r.to_user}${r.to_team ? ` (${r.to_team})` : ''}`, r.leads_requested, r.note || '-', r.status, fmt(r.done_at)]));
    s1.addRow([]);
    s1.addRow(['Total requests', summary.total, 'Pending', summary.pending, 'Done', summary.done, `Leads asked: ${summary.leads_asked}`]);

    const s2 = wb.addWorksheet('Per User');
    s2.columns = [{ width: 24 }, { width: 20 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 10 }, { width: 10 }];
    s2.addRow(['User', 'Team', 'Requests Sent', 'Requests Received', 'Leads Asked', 'Leads Requested From Them', 'Pending', 'Done']).font = { bold: true };
    per_user.forEach((u) => s2.addRow([u.user, u.team || '-', u.sent, u.received, u.leads_asked, u.leads_received, u.pending, u.done]));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="lead-requests.xlsx"');
    await wb.xlsx.write(res);
    return res.end();
  } catch (e) {
    console.error('exportRequests failed:', e);
    return res.status(500).json({ success: false, error: 'Failed to export.' });
  }
}

module.exports = { getRequestUsers, createRequest, getMyRequests, markRequestDone, getAllRequests, exportRequests };
