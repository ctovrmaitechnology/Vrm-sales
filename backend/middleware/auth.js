const jwt = require('jsonwebtoken');
const prisma = require('../prismaClient');

const ROLES = ['super_admin', 'admin', 'team_lead', 'caller'];
const TOKEN_TTL = process.env.JWT_EXPIRES_IN || '12h';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  return secret && secret.length >= 16 ? secret : null;
}

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, getSecret(), { expiresIn: TOKEN_TTL });
}

// Checks the login token on every request and loads the current user from the database,
// so a deactivated user or a changed role takes effect immediately.
async function requireAuth(req, res, next) {
  const secret = getSecret();
  if (!secret) {
    console.error('JWT_SECRET is missing or shorter than 16 characters. Logins are disabled.');
    return res.status(500).json({ error: 'Server login is not configured.' });
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'Please sign in.' });

  let payload;
  try {
    payload = jwt.verify(token, secret);
  } catch {
    return res.status(401).json({ error: 'Your session expired. Please sign in again.' });
  }

  try {
    const user = await prisma.users.findUnique({
      where: { id: Number(payload.id) },
      select: { id: true, employee_name: true, email: true, role: true, team_id: true, is_active: true, login_approved: true },
    });
    if (!user || !user.is_active || !user.login_approved || !ROLES.includes(user.role)) {
      return res.status(401).json({ error: 'Your account is not active. Please sign in again.' });
    }
    req.user = {
      id: user.id,
      name: user.employee_name,
      email: user.email,
      role: user.role,
      team_id: user.team_id,
    };
    return next();
  } catch (error) {
    console.error('Auth check failed:', error.message);
    return res.status(500).json({ error: 'Could not verify your login.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    // the Super Admin can do everything an Admin can
    const allowed = req.user && (roles.includes(req.user.role) ||
      (req.user.role === 'super_admin' && roles.includes('admin')));
    if (allowed) return next();
    return res.status(403).json({ error: 'You do not have permission to do this.' });
  };
}

// Which employee IDs this user may see: null = everyone (admin),
// team lead = their whole team, caller = only themselves.
async function getScopeUserIds(user) {
  if (user.role === 'admin' || user.role === 'super_admin') return null;
  if (user.role === 'team_lead' && user.team_id) {
    const members = await prisma.users.findMany({
      where: { team_id: user.team_id, is_active: true },
      select: { id: true },
    });
    const ids = members.map((m) => m.id);
    if (!ids.includes(user.id)) ids.push(user.id);
    return ids;
  }
  return [user.id];
}

function inScope(scope, ownerId) {
  if (scope === null) return true;
  return ownerId !== null && ownerId !== undefined && scope.includes(ownerId);
}

// Open addresses: login, health, public forms, tracking links and the WhatsApp / VAPI webhooks.
const PUBLIC_ROUTES = new Set([
  'POST /auth/login',
  'POST /auth/set-password',
  'GET /health',
  'POST /contact',
  'GET /demo',
  'GET /poster',
  'GET /book-demo',
  'GET /whatsapp/webhook',
  'POST /whatsapp/webhook',
  'GET /whatsapp/button-click',
  'POST /calls/webhook',
]);

function authGate(req, res, next) {
  const path = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;
  if (PUBLIC_ROUTES.has(`${req.method} ${path}`)) return next();
  return requireAuth(req, res, next);
}

module.exports = { ROLES, signToken, requireAuth, requireRole, authGate, getScopeUserIds, inScope };