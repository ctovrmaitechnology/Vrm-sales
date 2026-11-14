const express = require('express');
const { login, setPassword, me, changePassword } = require('../controllers/authController');

const router = express.Router();

router.post('/login', login);                // public (see PUBLIC_ROUTES)
router.post('/set-password', setPassword);   // public: first-time password for a pre-registered email
router.get('/me', me);
router.post('/change-password', changePassword);

module.exports = router;