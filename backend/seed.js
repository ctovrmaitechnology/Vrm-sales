const xlsx = require("xlsx");
const { upsertUnifiedLead } = require("./unifiedDb");

async function main() {
  const workbook = xlsx.readFile("contacts.xlsx"); // your file
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);

  for (const row of data) {
    const email = row.email;
    const name = row.name;

    if (!email) continue;

    await upsertUnifiedLead({
      name,
      email,
      source: "Seed Import",
      Status: "new"
    }, "seed_import");

    console.log("Inserted:", email);
  }

  console.log("✅ All data inserted");
}

main()
  .catch(console.error);
