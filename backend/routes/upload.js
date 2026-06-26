const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const axios = require('axios');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const filePath = req.file.path;

    // 📄 Read Excel
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    console.log("📊 Excel Data:", data);

    // 📧 Send emails one by one
    for (let row of data) {
      if (!row.email) continue;

      await axios.post(
        'https://api.brevo.com/v3/smtp/email',
        {
          sender: {
            email: "contactus@vrmaitechnology.com",
            name: "VRM AI"
          },
          to: [{ email: row.email }],
          subject: "From Excel 🚀",
          htmlContent: `<p>Hello ${row.name || "User"} 😎</p>`
        },
        {
          headers: {
            'api-key': process.env.BREVO_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log("✅ Sent to:", row.email);
    }

    res.json({ message: "All emails sent successfully 🚀" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed ❌" });
  }
});

module.exports = router;