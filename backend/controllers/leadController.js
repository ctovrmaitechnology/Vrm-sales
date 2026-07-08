const fs = require('fs');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const { getLeadByEmail, upsertUnifiedLead, updateLeadFields, updateUnifiedLeadStatus, getAllActiveLeads, upsertEmailLead, upsertWhatsAppLead, deleteUnifiedLead, getUnifiedLeadByIdentifier } = require('../unifiedDb');
const { findProductColumn, normalizeLeadProduct } = require('../utils/helpers');

async function getAllLeads(req, res) {
  try {
    res.json(await getAllActiveLeads());
  } catch (err) {
    console.error("Failed to fetch unified leads:", err.message);
    res.status(500).json({
      error: "Failed to fetch customers"
    });
  }
}

async function getWhatsAppLeads(req, res) {
  try {
    const allLeads = await getAllActiveLeads();
    const whatsappLeads = allLeads.filter(lead => lead.isWhatsAppLead);
    res.json(whatsappLeads);
  } catch (err) {
    console.error("Failed to fetch WhatsApp leads:", err.message);
    res.status(500).json({
      error: "Failed to fetch WhatsApp leads"
    });
  }
}

async function getEmailLeads(req, res) {
  try {
    const allLeads = await getAllActiveLeads();
    const emailLeads = allLeads.filter(lead => lead.isEmailLead);
    res.json(emailLeads);
  } catch (err) {
    console.error("Failed to fetch Email leads:", err.message);
    res.status(500).json({
      error: "Failed to fetch Email leads"
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
  const identifier = req.body.identifier;

  try {
    const deleted = await deleteUnifiedLead(identifier);

    if (!deleted) {
      return res.status(404).json({
        error: "Lead not found"
      });
    }

    res.json({
      success: true,
      message: "Lead deleted successfully",
      identifier
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

  for (let user of results) {
    try {
      const existing = await getUnifiedLeadByIdentifier(user.email || user.phone);
      const isDeleted = existing && (existing.status === 'deleted' || existing.Status === 'deleted' || existing.status === 'lead_deleted');
      const isNew = !existing || isDeleted;
      const targetStatus = isDeleted ? "new" : (existing?.Status || existing?.status || "new");

      if (user.email) {
         await upsertEmailLead({
           name: user.name,
           email: user.email,
           phone: user.phone,
           project: user.product_type || 'workflow_ai',
           source: "File Upload",
           status: targetStatus
         }, "email_excel_uploaded");
      }

      if (user.phone) {
         await upsertWhatsAppLead({
           name: user.name,
           email: user.email,
           phone: user.phone,
           project: user.product_type || 'workflow_ai',
           source: "File Upload",
           status: targetStatus
         }, "whatsapp_excel_uploaded");
      }

      await upsertUnifiedLead({
        name: user.name,
        email: user.email,
        phoneNumber: user.phone,
        product_type: user.product_type || 'workflow_ai',
        metadata: {
          product_type: user.product_type || 'workflow_ai'
        },
        source: "File Upload",
        Status: targetStatus
      }, "excel_uploaded");

      if (!isNew) {
        skipped++;
      } else {
        added++;
      }
    } catch (err) {
      console.log("Lead save error:", err.message);
    }
  }

  if (filePath) {
    fs.unlinkSync(filePath);
  }

  return res.json({
    message: `Added ${added} new leads. Updated ${skipped} existing leads. This upload batch contains ${results.length} campaign leads.`,
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

          if (email || phone) {
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

        if (email || phone) {
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

async function uploadSingleLead(req, res) {
  try {
    const data = req.body;
    
    if (!data || (!data.email && !data.phone)) {
      return res.status(400).json({ error: "Email or phone number is required." });
    }

    const results = [{
      name: data.name || data.full_name || "",
      email: data.email || "",
      phone: data.phone || data.phone_number || data.whatsapp_number || "",
      product_type: normalizeLeadProduct(data.project || data.product_type || data.product || "")
    }];

    // Using the same logic as CSV but without a file
    const fakeRes = {
      json: (data) => data
    };
    
    const responseData = await saveLeads(results, null, fakeRes);

    if (data.sendImmediately) {
      const { sendInitialEmail } = require('../services/emailService');
      const { sendWhatsAppTemplate } = require('../services/whatsappService');
      
      const lead = results[0];
      try {
        if (lead.email) {
          await sendInitialEmail(lead, lead.product_type);
        }
        if (lead.phone) {
          await sendWhatsAppTemplate(lead, lead.product_type);
        }
      } catch (sendErr) {
        console.error("Error sending immediate campaign to single lead:", sendErr.message);
      }
    }

    return res.json(responseData);

  } catch (err) {
    console.error("Single lead upload error:", err.message);
    res.status(500).json({ error: "Failed to save and send to lead" });
  }
}

module.exports = {
  getAllLeads,
  getWhatsAppLeads,
  getEmailLeads,
  updateStatus,
  deleteLead,
  uploadLeads,
  uploadSingleLead
};
