// Creates (or updates) an Admin login. Run on the server once:
//   node scripts/createAdmin.js "Full Name" email@company.com "StrongPassword123"
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const prisma = require('../prismaClient');

async function main() {
  const [name, emailRaw, password] = process.argv.slice(2);
  const email = (emailRaw || '').trim().toLowerCase();
  if (!name || !email || !password) {
    console.error('Usage: node scripts/createAdmin.js "Full Name" email@company.com "Password"');
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');

  const password_hash = await bcrypt.hash(password, 10);
  const existing = await prisma.users.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) {
    await prisma.users.update({
      where: { id: existing.id },
      data: { role: 'admin', password_hash, is_active: true, employee_name: name, updated_at: new Date() },
    });
    console.log(`Updated admin login: ${email}`);
  } else {
    await prisma.users.create({ data: { employee_name: name, email, role: 'admin', password_hash } });
    console.log(`Created admin login: ${email}`);
  }
}

main()
  .catch((error) => { console.error('Failed:', error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());