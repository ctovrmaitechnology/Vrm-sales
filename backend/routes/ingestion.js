const express = require("express");
const router = express.Router();
const multer = require("multer");
const ExcelJS = require("exceljs");
const { getLeadByEmail, upsertUnifiedLead } = require("../unifiedDb");
const upload = multer();

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

//////////////////////////////////////////////////////
// ✅ EXCEL UPLOAD + RETURN EMAILS (FIXED)
//////////////////////////////////////////////////////

router.post("/upload", upload.single("file"), async (req, res) => {
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

    const parsedLeads = [];

    //////////////////////////////////////////////////////
    // 🔍 PARSE EXCEL
    //////////////////////////////////////////////////////
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const name = row.getCell(1).text.trim();
      const email = row.getCell(2).text.trim();

      if (!name || !email) {
        results.errors.push({ row: rowNumber, error: "Missing name/email" });
        return;
      }

      if (!emailRegex.test(email)) {
        results.errors.push({ row: rowNumber, error: "Invalid email" });
        return;
      }

      parsedLeads.push({ name, email });
    });

    //////////////////////////////////////////////////////
    // 💾 SAVE TO DB + COLLECT EMAILS
    //////////////////////////////////////////////////////
    const finalEmails = [];

    for (const lead of parsedLeads) {
      try {
        const existing = await getLeadByEmail(lead.email);

        if (existing) {
          results.duplicates++;
          finalEmails.push(lead.email); // 🔥 IMPORTANT FIX
        } else {
          await upsertUnifiedLead({
            ...lead,
            source: "File Upload",
            Status: "new"
          }, "ingestion_route_excel_uploaded");
          results.imported++;
          finalEmails.push(lead.email); // 🔥 IMPORTANT FIX
        }

      } catch (err) {
        results.errors.push({ email: lead.email, error: err.message });
      }
    }

    //////////////////////////////////////////////////////
    // 🔥 DEBUG LOG (IMPORTANT)
    //////////////////////////////////////////////////////
    console.log("📩 Emails to send:", finalEmails);

    //////////////////////////////////////////////////////
    // 🚀 RESPONSE
    //////////////////////////////////////////////////////
    res.json({
      message: "Upload complete ✅",
      results,
      emails: finalEmails
    });

  } catch (error) {
    console.error("❌ Upload Error:", error);
    res.status(500).json({
      error: "Server error",
      details: error.message
    });
  }
});

module.exports = router;
