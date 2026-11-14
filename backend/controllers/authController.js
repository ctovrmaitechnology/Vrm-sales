const bcrypt = require('bcryptjs');
const prisma = require('../prismaClient');
const { signToken } = require('../middleware/auth');

const MAX_FAILED = 8;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map(); // "ip|email" -> { count, resetAt }
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

function failureKey(req, email) {
  return `${req.ip}|${email}`;
}
function isLocked(key) {
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) { failures.delete(key); return false; }
  return entry.count >= MAX_FAILED;
}
function recordFailure(key) {
  const entry = failures.get(key);
  if (!entry || Date.now() > entry.resetAt) failures.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
  else entry.count += 1;
}

async function publicUser(userId) {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      id: true, employee_name: true, email: true, role: true, team_id: true,
      team: { select: { name: true } },
    },
  });
  if (!user) return null;
  return {
    id: user.id,
    name: user.employee_name,
    email: user.email,
    role: user.role,
    team_id: user.team_id,
    team_name: user.team?.name || null,
  };
}

async function login(req, res) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) return res.status(400).json({ error: 'Enter your email and password.' });

  const key = failureKey(req, email);
  if (isLocked(key)) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
  }

  try {
    const matches = await prisma.users.findMany({
      where: { email: { equals: email, mode: 'insensitive' }, is_active: true },
      select: { id: true, password_hash: true, role: true, login_approved: true },
      take: 1,
    });
    const user = matches[0];
    const ok = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
    if (!user || !user.password_hash || !ok) {
      recordFailure(key);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (!user.login_approved) {
      return res.status(403).json({ error: 'Your account is waiting for approval from the Super Admin.', code: 'pending' });
    }
    failures.delete(key);
    await prisma.users.update({ where: { id: user.id }, data: { last_login_at: new Date() } });
    const profile = await publicUser(user.id);
    return res.json({ success: true, token: signToken(user), user: profile });
  } catch (error) {
    console.error('Login failed:', error.message);
    return res.status(500).json({ error: 'Could not sign in right now.' });
  }
}

// An employee whose email the Super Admin registered sets their own password here.
// The account stays "pending" until the Super Admin approves it.
async function setPassword(req, res) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || password.length < 8 || password.length > 100) {
    return res.status(400).json({ error: 'Enter your email and a password of 8 to 100 characters.' });
  }
  const key = failureKey(req, email);
  if (isLocked(key)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });

  const refuse = () => {
    recordFailure(key);
    return res.status(400).json({ error: 'This email is not registered, or a password is already set. Ask the Super Admin.' });
  };

  try {
    const matches = await prisma.users.findMany({
      where: { email: { equals: email, mode: 'insensitive' }, is_active: true },
      select: { id: true, password_hash: true, role: true },
      take: 1,
    });
    const user = matches[0];
    if (!user || user.password_hash || user.role === 'super_admin') return refuse();
    await prisma.users.update({
      where: { id: user.id },
      data: { password_hash: await bcrypt.hash(password, 10), login_approved: false, updated_at: new Date() },
    });
    return res.json({ success: true, message: 'Password saved. You can sign in once the Super Admin approves your account.' });
  } catch (error) {
    console.error('Set password failed:', error.message);
    return res.status(500).json({ error: 'Could not save the password right now.' });
  }
}

async function me(req, res) {
  try {
    const profile = await publicUser(req.user.id);
    if (!profile) return res.status(401).json({ error: 'Please sign in again.' });
    return res.json({ success: true, user: profile });
  } catch (error) {
    console.error('Failed to load profile:', error.message);
    return res.status(500).json({ error: 'Could not load your profile.' });
  }
}

async function changePassword(req, res) {
  const current = typeof req.body?.current_password === 'string' ? req.body.current_password : '';
  const next = typeof req.body?.new_password === 'string' ? req.body.new_password : '';
  if (next.length < 8 || next.length > 100) {
    return res.status(400).json({ error: 'New password must be 8 to 100 characters.' });
  }
  try {
    const user = await prisma.users.findUnique({ where: { id: req.user.id }, select: { password_hash: true } });
    if (!user?.password_hash || !(await bcrypt.compare(current, user.password_hash))) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    await prisma.users.update({
      where: { id: req.user.id },
      data: { password_hash: await bcrypt.hash(next, 10), updated_at: new Date() },
    });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to change password:', error.message);
    return res.status(500).json({ error: 'Could not change the password.' });
  }
}

module.exports = { login, setPassword, me, changePassword };