const express = require('express');

const router = express.Router();

const {
  sendWhatsAppMessage,
} = require('../services/whatsappService');

router.post('/send', async (req, res) => {

  try {

    const { to, message } = req.body;

    const result = await sendWhatsAppMessage(
      to,
      message
    );

    res.status(200).json({
      success: true,
      data: result,
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      error: error.message,
    });

  }

});

module.exports = router;