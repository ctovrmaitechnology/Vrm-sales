const prisma = require('../prismaClient');

const MEMBER_SELECT = { id: true, employee_name: true };

function cleanName(value, max) {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return text && text.length <= max ? text : '';
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function loadTeam(id) {
  return prisma.teams.findUnique({
    where: { id },
    include: {
      members: { where: { is_active: true }, orderBy: { employee_name: 'asc' }, select: MEMBER_SELECT },
    },
  });
}

async function nameTaken(name, exceptId) {
  const rows = await prisma.teams.findMany({
    where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
    take: 1,
  });
  return rows.length > 0;
}

async function getTeams(req, res) {
  try {
    const teams = await prisma.teams.findMany({
      orderBy: { name: 'asc' },
      include: {
        members: { where: { is_active: true }, orderBy: { employee_name: 'asc' }, select: MEMBER_SELECT },
      },
    });
    const unassigned = await prisma.users.findMany({
      where: { is_active: true, team_id: null },
      orderBy: { employee_name: 'asc' },
      select: MEMBER_SELECT,
    });
    return res.json({ success: true, data: teams, unassigned });
  } catch (error) {
    console.error('Failed to fetch teams:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch teams.' });
  }
}

async function createTeam(req, res) {
  const name = cleanName(req.body?.name, 100);
  if (!name) return res.status(400).json({ success: false, error: 'Team name is required (max 100 characters).' });
  try {
    if (await nameTaken(name)) return res.status(409).json({ success: false, error: 'A team with this name already exists.' });
    const team = await prisma.teams.create({ data: { name } });
    return res.status(201).json({ success: true, data: await loadTeam(team.id) });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'A team with this name already exists.' });
    }
    console.error('Failed to create team:', error);
    return res.status(500).json({ success: false, error: 'Failed to create team.' });
  }
}

async function renameTeam(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'Invalid team ID.' });
  const name = cleanName(req.body?.name, 100);
  if (!name) return res.status(400).json({ success: false, error: 'Team name is required (max 100 characters).' });
  try {
    const existing = await prisma.teams.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return res.status(404).json({ success: false, error: 'Team not found.' });
    if (await nameTaken(name, id)) return res.status(409).json({ success: false, error: 'A team with this name already exists.' });
    await prisma.teams.update({ where: { id }, data: { name, updated_at: new Date() } });
    return res.json({ success: true, data: await loadTeam(id) });
  } catch (error) {
    console.error('Failed to rename team:', error);
    return res.status(500).json({ success: false, error: 'Failed to rename team.' });
  }
}

async function deleteTeam(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'Invalid team ID.' });
  try {
    const existing = await prisma.teams.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!existing) return res.status(404).json({ success: false, error: 'Team not found.' });
    await prisma.$transaction([
      prisma.users.updateMany({ where: { team_id: id }, data: { team_id: null } }),
      prisma.teams.delete({ where: { id } }),
    ]);
    return res.json({ success: true, message: `Team "${existing.name}" was deleted.` });
  } catch (error) {
    console.error('Failed to delete team:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete team.' });
  }
}

// Add a member to a team: either an existing employee (user_id) or a brand-new one (employee_name).
async function addTeamMember(req, res) {
  const teamId = parseId(req.params.id);
  if (!teamId) return res.status(400).json({ success: false, error: 'Invalid team ID.' });
  try {
    const team = await prisma.teams.findUnique({ where: { id: teamId }, select: { id: true } });
    if (!team) return res.status(404).json({ success: false, error: 'Team not found.' });

    const userId = parseId(req.body?.user_id);
    if (userId) {
      const user = await prisma.users.findFirst({ where: { id: userId, is_active: true }, select: { id: true } });
      if (!user) return res.status(404).json({ success: false, error: 'Employee not found.' });
      await prisma.users.update({ where: { id: userId }, data: { team_id: teamId, updated_at: new Date() } });
    } else {
      const name = cleanName(req.body?.employee_name, 255);
      if (!name) return res.status(400).json({ success: false, error: 'Choose an employee or enter a name.' });
      await prisma.users.create({ data: { employee_name: name, team_id: teamId } });
    }
    return res.status(201).json({ success: true, data: await loadTeam(teamId) });
  } catch (error) {
    console.error('Failed to add team member:', error);
    return res.status(500).json({ success: false, error: 'Failed to add member.' });
  }
}

async function removeTeamMember(req, res) {
  const teamId = parseId(req.params.id);
  const userId = parseId(req.params.userId);
  if (!teamId || !userId) return res.status(400).json({ success: false, error: 'Invalid ID.' });
  try {
    const result = await prisma.users.updateMany({
      where: { id: userId, team_id: teamId },
      data: { team_id: null, updated_at: new Date() },
    });
    if (result.count === 0) return res.status(404).json({ success: false, error: 'Member not found in this team.' });
    return res.json({ success: true, data: await loadTeam(teamId) });
  } catch (error) {
    console.error('Failed to remove team member:', error);
    return res.status(500).json({ success: false, error: 'Failed to remove member.' });
  }
}

module.exports = { getTeams, createTeam, renameTeam, deleteTeam, addTeamMember, removeTeamMember };
