

const prisma = require('../prismaClient');

async function getUsers(req, res) {
  try {
    const users = await prisma.users.findMany({
      where: { is_active: true },
      orderBy: { employee_name: 'asc' },
      include: {
        _count: {
          select: { leads: true, companies: true, email_history: true }
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
          select: { leads: true, companies: true, email_history: true }
        }
      }
    });
    return res.status(201).json({ success: true, data: user });
  } catch (error) {
    console.error('Failed to create employee:', error);
    return res.status(500).json({ success: false, error: 'Failed to create employee.' });
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

module.exports = { getUsers, createUser, getUserHistory };
