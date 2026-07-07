const fs = require('fs');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const { getLeadByEmail, upsertUnifiedLead, updateLeadFields, updateUnifiedLeadStatus, getAllActiveLeads } = require('../unifiedDb');
const { findProductColumn, normalizeLeadProduct } = require('../utils/helpers');

async function getAllLeads(req, res) {
  try {
    res.json(await getAllActiveLeads());
  } catch (err) {
    console.error("Failed to fetch unified email leads:", err.message);
    res.status(500).json({
      error: "Failed to fetch customers"
    });
  }
}

async function updateStatus(req, res) {
  const email = req.params.email;
  const { status } = req.body || {};

  if (status !== 'converted_to_lead') {
    return res.status(400).json({
      error: "Only Converted to Lead can be set manually"
    });
  }

  try {
    const updatedLead = await updateLeadFields(email, { status });
    if (!updatedLead) {
      return res.status(404).json({
        error: "Lead not found"
      });
    }

    await updateUnifiedLeadStatus(updatedLead, "manual", status, "converted_to_lead", {
      manual: true
    });

    res.json({
      success: true,
      lead: await getLeadByEmail(email)
    });
  } catch (error) {
    console.error("Manual lead status update failed:", error.message);
    res.status(500).json({
      error: "Failed to update lead status"
    });
  }
}

async function deleteLead(req, res) {
  const email = req.params.email;

  try {
    const deletedLead = await getLeadByEmail(email);

    if (!deletedLead) {
      return res.status(404).json({
        error: "Lead not found"
      });
    }

    await updateUnifiedLeadStatus(deletedLead, "email", "deleted", "lead_deleted", {
      source: "deleted"
    });

    res.json({
      success: true,
      message: "Lead deleted successfully",
      lead: deletedLead
    });

  } catch (error) {
    if (error.code === 'P2025') {
      res.status(404).json({
        error: "Lead not found"
      });
    } else {
      res.status(500).json({
        error: "Failed to delete lead"
      });
    }
  }
}

async function saveLeads(results, filePath, res) {
  let added = 0;
  let skipped = 0;
  const uploadBatchId = `email-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const uploadedAt = new Date().toISOString();

  for (let user of results) {
    try {
      const existing = await getLeadByEmail(user.email);

      await upsertUnifiedLead({
        name: user.name,
        email: user.email,
        phoneNumber: user.phone,
        product_type: user.product_type || 'workflow_ai',
        metadata: {
          product_type: user.product_type || 'workflow_ai',
          email_campaign_uploaded: true,
          email_campaign_uploaded_at: uploadedAt,
          email_upload_batch_id: uploadBatchId
        },
        source: "File Upload",
        Status: existing?.Status || existing?.status || "new"
      }, "email_excel_uploaded");

      if (existing) {
        skipped++;
      } else {
        added++;
      }
    } catch (err) {
      console.log("Lead save error:", err.message);
    }
  }

  fs.unlinkSync(filePath);

  return res.json({
    message: `Added ${added} new leads. Updated ${skipped} existing leads. This upload batch contains ${results.length} campaign leads.`,
    uploadBatchId,
    campaignLeadCount: results.length
  });
}

async function uploadLeads(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded"
      });
    }

    const fileName = req.file.originalname.toLowerCase();
    const results = [];
    console.log("------ UPLOAD DEBUG LOGS ------");
    console.log("Uploaded filename:", req.file.originalname);

    if (fileName.endsWith('.csv')) {
      fs.createReadStream(req.file.path)
        .pipe(
          csv({
            mapHeaders: ({ header }) =>
              header.toLowerCase().trim()
          })
        )
        .on('data', (data) => {
          const keys = Object.keys(data);
          if (results.length === 0) {
            console.log("CSV Columns detected:", keys);
          }

          const nameKey =
            keys.find(k => k.includes('name'));

          const emailKey =
            keys.find(k => k.includes('email'));

          const phoneKey = keys.find(k => k.includes('phone'));
          const productKey = findProductColumn(keys);

          if (results.length === 0) {
            console.log("CSV First row detected keys -> emailKey:", emailKey, "nameKey:", nameKey);
          }

          const name =
            nameKey ? String(data[nameKey]).trim() : "";

          const email =
            emailKey ? String(data[emailKey]).trim() : "";

          const phone =
            phoneKey ? String(data[phoneKey]).trim() : "";

          if (email) {
            results.push({
              name,
              email,
              phone,
              product_type: normalizeLeadProduct(productKey ? data[productKey] : '')
            });
          }
        })
        .on('end', async () => {
          console.log(`CSV Extract Complete. Final results.length: ${results.length}`);
          console.log("Sample extracted rows:", results.slice(0, 2));
          await saveLeads(results, req.file.path, res);
        });

    } else if (
      fileName.endsWith('.xlsx') ||
      fileName.endsWith('.xls')
    ) {
      const workbook = xlsx.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      const rows =
        xlsx.utils.sheet_to_json(sheet, {
          defval: ""
        });

      console.log("XLSX Total raw rows read:", rows.length);
      if (rows.length > 0) {
        console.log("XLSX Columns detected (from first row):", Object.keys(rows[0]));
      }

      rows.forEach((data, index) => {
        const keys = Object.keys(data);

        const nameKey =
          keys.find(k =>
            k.toLowerCase().includes('name')
          );

        const emailKey =
          keys.find(k =>
            k.toLowerCase().includes('email')
          );

        const phoneKey =
          keys.find(k =>
            k.toLowerCase().includes('phone')
          );
        const productKey = findProductColumn(keys);

        if (index === 0) {
          console.log("XLSX First row detected keys -> emailKey:", emailKey, "nameKey:", nameKey);
        }

        const name =
          nameKey ? String(data[nameKey]).trim() : "";

        const email =
          emailKey ? String(data[emailKey]).trim() : "";

        const phone =
          phoneKey ? String(data[phoneKey]).trim() : "";

        if (email) {
          results.push({
            name,
            email,
            phone,
            product_type: normalizeLeadProduct(productKey ? data[productKey] : '')
          });
        }
      });

      console.log(`XLSX Extract Complete. Final results.length: ${results.length}`);
      console.log("Sample extracted rows:", results.slice(0, 2));

      await saveLeads(results, req.file.path, res);

    } else {
      fs.unlinkSync(req.file.path);

      return res.status(400).json({
        error: "Invalid file type. Please upload CSV, XLSX, or XLS file."
      });
    }

  } catch (err) {
    console.error("Upload error:", err.message);
    res.status(500).json({
      error: "Upload failed"
    });
  }
}

module.exports = {
  getAllLeads,
  updateStatus,
  deleteLead,
  uploadLeads
};
