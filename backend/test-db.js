const { getAllActiveLeads } = require('./unifiedDb');

async function main() {
  const leads = await getAllActiveLeads();
  console.log('Dashboard count:', leads.length);
  console.log('All Data:', leads);
}

main().catch(console.error);
