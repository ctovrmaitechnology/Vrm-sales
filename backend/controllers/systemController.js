const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function healthCheck(req, res) {
  res.json({
    ok: true,
    service: 'email-whatsapp-backend'
  });
}

async function resetSystem(req, res) {
  await prisma.customer.updateMany({
    data: {
      Status: null,
      clickCount: 0,
      reminderCount: 0,
      lastEmailSentAt: null
    }
  });

  res.json({
    success: true
  });
}

async function submitContact(req, res) {
  try {
    console.log("Contact form received:", req.body);

    return res.status(200).json({
      success: true,
      message: "Message received successfully"
    });

  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
}

module.exports = {
  healthCheck,
  resetSystem,
  submitContact
};
