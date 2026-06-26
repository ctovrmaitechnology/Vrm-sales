const ExcelJS = require("exceljs");
const { parsePhoneNumberFromString } = require("libphonenumber-js");
const { sendWhatsAppTemplate } = require('../services/whatsappService');
const { getLeadByEmail, upsertUnifiedLead } = require("../unifiedDb");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.uploadLeads = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.worksheets[0];

    const results = {
      imported: 0,
      duplicates: 0,
      errors: []
    };

    const customersToInsert = [];
    const insertedEmails = [];

    //////////////////////////////////////////////////////
    // 🔍 PARSE EXCEL
    //////////////////////////////////////////////////////
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const name = row.getCell(1).text.trim();
      const email = row.getCell(2).text.trim();
      const rawPhone = row.getCell(3).text.trim();
      const company = row.getCell(4).text.trim();
      const jobTitle = row.getCell(5).text.trim();

      if (!name || !email) {
        results.errors.push({ row: rowNumber, error: "Missing name or email" });
        return;
      }

      if (!emailRegex.test(email)) {
        results.errors.push({ row: rowNumber, error: "Invalid email format" });
        return;
      }

      let formattedPhone = null;

      if (rawPhone) {
        const phoneNumber = parsePhoneNumberFromString(rawPhone);

        if (phoneNumber && phoneNumber.isValid()) {
          formattedPhone = phoneNumber.formatInternational();
        } else {
          results.errors.push({ row: rowNumber, error: "Invalid phone number" });
          return;
        }
      }

      customersToInsert.push({
        name,
        email,
        phoneNumber: formattedPhone,
        whatsappNumber: formattedPhone,
        company,
        jobTitle
      });
    });

    //////////////////////////////////////////////////////
    // 💾 SAVE TO DB
    //////////////////////////////////////////////////////
    for (const lead of customersToInsert) {
      try {
        const existing = await getLeadByEmail(lead.email);

        if (existing) {
          results.duplicates++;
        } else {
          await upsertUnifiedLead({
            name: lead.name,
            email: lead.email,
            phoneNumber: lead.phoneNumber,
            whatsappNumber: lead.whatsappNumber,
            company: lead.company,
            jobTitle: lead.jobTitle,
            source: "File Upload",
            Status: "new"
          }, "ingestion_excel_uploaded");

          results.imported++;
          insertedEmails.push(lead.email); // ✅ collect emails
        }

      } catch (err) {
        results.errors.push({ email: lead.email, error: err.message });
      }
    }

    //////////////////////////////////////////////////////
    // 🚀 RESPONSE ONLY (NO EMAIL HERE)
    //////////////////////////////////////////////////////
    res.json({
      message: "Upload complete",
      results,
      emails: insertedEmails // 🔥 frontend ku send
    });

  } catch (error) {
    res.status(500).json({
      error: "Server error",
      details: error.message
    });
  }
};
