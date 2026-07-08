const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  console.time("Prisma Connection Init (Cold Start)");
  await prisma.$connect();
  console.timeEnd("Prisma Connection Init (Cold Start)");

  console.time("DB Query Time (Parallel)");
  const [oldLeads, emailLeads, whatsappLeads, allOldStatuses] = await Promise.all([
    prisma.leads.findMany({ orderBy: { created_at: 'desc' } }),
    prisma.emailLeads.findMany({ orderBy: { created_at: 'desc' } }),
    prisma.whatsAppLeads.findMany({ orderBy: { created_at: 'desc' } }),
    prisma.lead_status.findMany({ orderBy: { created_at: 'asc' } })
  ]);
  console.timeEnd("DB Query Time (Parallel)");
  
  console.log(`Old Leads: ${oldLeads.length}, Email: ${emailLeads.length}, WA: ${whatsappLeads.length}, Statuses: ${allOldStatuses.length}`);
  process.exit(0);
}
test();
