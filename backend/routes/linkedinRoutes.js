const express = require('express');
const router = express.Router();
const axios = require('axios');
const { LINKEDIN_BACKEND_URL } = require('../utils/config');

router.use('/', async (req, res) => {
  try {
    const targetUrl = `${LINKEDIN_BACKEND_URL}${req.originalUrl.replace(/^\/linkedin-api/, '')}`;
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: ['GET', 'HEAD'].includes(req.method)
        ? undefined
        : (/multipart\/form-data/i.test(req.headers['content-type'] || '') ? req : req.body),
      responseType: 'stream',
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
      headers: {
        'content-type': req.headers['content-type'] || 'application/json',
      },
    });

    res.status(response.status);
    Object.entries(response.headers || {}).forEach(([key, value]) => {
      if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    response.data.pipe(res);
  } catch (error) {
    res.status(502).json({
      error: 'LinkedIn backend unavailable',
      detail: error.message,
    });
  }
});

module.exports = router;
