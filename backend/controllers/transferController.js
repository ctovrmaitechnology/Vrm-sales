const crypto = require('crypto');
const prisma = require('../prismaClient');
const { getScopeUserIds, inScope } = require('../middleware/auth');

const MAX_TRANSFER = 1000;

// Users a lead can be sent to: active users who belong to a team other than the sender's own team.
async function getTransferTargets(req, res) {
  try {
    const myTeam = req.user.team_id || null;
    const users = await prisma.users.findMany({
      where: { is_active: true, team_id: { not: null } },
      orderBy: { employee_name: 'asc' },
      select: { id: true, employee_name: true, team_id: true, team: { select: { name: true } } },
    });
    const data = users
      .filter((u) => u.team_id !== myTeam)
      .map((u) => ({ id: u.id, employee_name: u.employee_name, team_id: u.team_id, team_name: u.team?.name || '' }));
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Failed to load transfer targets:', error);
    return res.status(500).json({ success: false, error: 'Failed to load users.' });
  }
}

// Move leads to a user in another team. The receiving team owns and edits them; the sending team keeps read-only access.
async function transferLeads(req, res) {
  const ids = [...new Set((req.body?.ids || []).map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  const toUserId = Number(req.body?.to_user_id);
  if (!ids.length) return res.status(400).json({ success: false, error: 'Select at least one lead to send.' });
  if (ids.length > MAX_TRANSFER) {
    return res.status(400).json({ success: false, error: `You can send at most ${MAX_TRANSFER} leads at a time.` });
  }
  if (!Number.isInteger(toUserId) || toUserId < 1) {
    return res.status(400).json({ success: false, error: 'Select the user who will receive these leads.' });
  }

  try {
    const receiver = await prisma.users.findFirst({
      where: { id: toUserId, is_active: true },
      select: { id: true, employee_name: true, team_id: true, team: { select: { name: true } } },
    });
    if (!receiver) return res.status(400).json({ success: false, error: 'The selected user was not found or is inactive.' });
    if (!receiver.team_id) return res.status(400).json({ success: false, error: 'The selected user is not in a team.' });
    if (req.user.team_id && req.user.team_id === receiver.team_id) {
      return res.status(400).json({ success: false, error: 'Choose a user from a different team.' });
    }

    const scope = await getScopeUserIds(req.user);
    const leads = await prisma.leads.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, user_id: true, called_by_user_id: true,
        owner: { select: { team_id: true } },
        called_by: { select: { team_id: true } },
      },
    });

    const moves = [];
    let notAllowed = ids.length - leads.length;
    let sameTeam = 0;
    for (const lead of leads) {
      if (!inScope(scope, lead.user_id)) { notAllowed++; continue; }
      const fromTeam = lead.owner?.team_id ?? null;
      if (lead.user_id === receiver.id || (fromTeam !== null && fromTeam === receiver.team_id)) { sameTeam++; continue; }
      moves.push({ lead, fromTeam });
    }
    if (!moves.length) {
      return res.status(400).json({
        success: false,
        error: sameTeam
          ? 'These leads are already with that team. Choose a user from a different team.'
          : 'None of the selected leads can be sent by you.',
      });
    }

    const batchId = crypto.randomUUID();
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      for (const { lead, fromTeam } of moves) {
        // the caller who last worked the lead stays on it only if they are in the receiving team
        const dropCaller = lead.called_by_user_id && lead.called_by?.team_id !== receiver.team_id;
        await tx.leads.update({
          where: { id: lead.id },
          data: {
            user_id: receiver.id,
            transferred_at: now,
            transferred_from_user_id: lead.user_id,
            transferred_from_team_id: fromTeam,
            ...(dropCaller ? { called_by_user_id: null } : {}),
            updated_at: now,
          },
        });
      }
      await tx.lead_transfers.createMany({
        data: moves.map(({ lead, fromTeam }) => ({
          batch_id: batchId,
          lead_id: lead.id,
          from_user_id: lead.user_id,
          to_user_id: receiver.id,
          from_team_id: fromTeam,
          to_team_id: receiver.team_id,
          transferred_by_user_id: req.user.id,
          created_at: now,
        })),
      });
    }, { timeout: 60000, maxWait: 10000 });

    return res.json({
      success: true,
      transferred: moves.length,
      skipped: notAllowed + sameTeam,
      to_user: receiver.employee_name,
      to_team: receiver.team?.name || '',
    });
  } catch (error) {
    console.error('Failed to transfer leads:', error);
    return res.status(500).json({ success: false, error: 'Failed to send the leads.' });
  }
}

// Super admin: full history of one lead (who uploaded it, every move, who holds it now).
async function getLeadHistory(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, error: 'Invalid lead.' });
  try {
    const lead = await prisma.leads.findUnique({
      where: { id },
      select: { id: true, full_name: true, phone_number: true, source: true, lead_status: true, user_id: true, created_at: true },
    });
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found.' });

    const moves = await prisma.lead_transfers.findMany({
      where: { lead_id: id },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
    const userIds = new Set([lead.user_id]);
    const teamIds = new Set();
    for (const m of moves) {
      [m.from_user_id, m.to_user_id, m.transferred_by_user_id].forEach((u) => u && userIds.add(u));
      [m.from_team_id, m.to_team_id].forEach((t) => t && teamIds.add(t));
    }
    const users = await prisma.users.findMany({
      where: { id: { in: [...userIds].filter(Boolean) } },
      select: { id: true, employee_name: true, team_id: true, team: { select: { name: true } } },
    });
    const uMap = new Map(users.map((u) => [u.id, u]));
    users.forEach((u) => u.team_id && teamIds.add(u.team_id));
    const teams = teamIds.size
      ? await prisma.teams.findMany({ where: { id: { in: [...teamIds] } }, select: { id: true, name: true } })
      : [];
    const tMap = new Map(teams.map((t) => [t.id, t.name]));
    const uName = (uid) => (uid && uMap.get(uid)?.employee_name) || null;
    const uTeam = (uid) => (uid && uMap.get(uid)?.team?.name) || null;

    // "Uploaded by" is inferred: first sender if the lead was ever moved, otherwise the current owner.
    const firstSender = moves.find((m) => m.from_user_id)?.from_user_id || null;
    const uploaderId = firstSender || lead.user_id;
    const firstFromTeam = moves.find((m) => m.from_team_id)?.from_team_id || null;

    return res.json({
      success: true,
      data: {
        lead: { id: lead.id, full_name: lead.full_name, phone_number: lead.phone_number, status: lead.lead_status, source: lead.source },
        uploaded_by: {
          user: uName(uploaderId),
          team: (firstFromTeam && tMap.get(firstFromTeam)) || uTeam(uploaderId),
          at: lead.created_at,
        },
        current_holder: { user: uName(lead.user_id), team: uTeam(lead.user_id) },
        moves: moves.map((m) => ({
          at: m.created_at,
          from_user: uName(m.from_user_id),
          from_team: (m.from_team_id && tMap.get(m.from_team_id)) || null,
          to_user: uName(m.to_user_id),
          to_team: (m.to_team_id && tMap.get(m.to_team_id)) || null,
          sent_by: uName(m.transferred_by_user_id),
        })),
        route: [uName(uploaderId), ...moves.map((m) => uName(m.to_user_id))].filter(Boolean),
      },
    });
  } catch (error) {
    console.error('Failed to load lead history:', error);
    return res.status(500).json({ success: false, error: 'Failed to load lead history.' });
  }
}

module.exports = { getTransferTargets, transferLeads, getLeadHistory };
