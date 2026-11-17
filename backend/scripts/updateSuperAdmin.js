// Changes the Super Admin email + password (keeps the same account).
//   SA_PASSWORD='NewPassword' node scripts/updateSuperAdmin.js contactus@vrmaitechnology.com [old-email]
// If no super admin exists yet, one is created.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const prisma = require('../prismaClient');

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const oldEmail = (process.argv[3] || '').trim().toLowerCase();
  const password = process.env.SA_PASSWORD || process.argv[4] || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Pass a valid new email as the first argument.');
  if (password.length < 8) throw new Error('Set SA_PASSWORD (min 8 characters).');

  const supers = await prisma.users.findMany({ where: { role: 'super_admin' }, select: { id: true, email: true } });
  let target = oldEmail ? supers.find((u) => (u.email || '').toLowerCase() === oldEmail) : supers.length === 1 ? supers[0] : null;
  if (!target && supers.length > 1) throw new Error(`Several super admins found (${supers.map((u) => u.email).join(', ')}). Pass the old email as 2nd argument.`);

  const clash = await prisma.users.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, ...(target && { id: { not: target.id } }) }, select: { id: true } });
  if (clash) throw new Error('Another user already uses that email.');

  const password_hash = await bcrypt.hash(password, 10);
  if (target) {
    await prisma.users.update({ where: { id: target.id }, data: { email, password_hash, login_approved: true, is_active: true, updated_at: new Date() } });
    console.log(`Super Admin updated: ${target.email} -> ${email}`);
  } else {
    await prisma.users.create({ data: { employee_name: 'Super Admin', email, role: 'super_admin', password_hash, login_approved: true } });
    console.log(`Super Admin created: ${email}`);
  }
}
main().catch((e) => { console.error('Failed:', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
