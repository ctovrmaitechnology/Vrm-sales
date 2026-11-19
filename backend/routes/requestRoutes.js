const express = require('express');
const { requireRole } = require('../middleware/auth');
const {
  getRequestUsers, createRequest, getMyRequests, markRequestDone, getAllRequests, exportRequests,
} = require('../controllers/requestController');

const router = express.Router();

router.get('/users', getRequestUsers);
router.get('/mine', getMyRequests);
router.post('/', createRequest);
router.get('/all', requireRole('super_admin'), getAllRequests);
router.get('/export', requireRole('super_admin'), exportRequests);
router.patch('/:id/done', markRequestDone);

module.exports = router;
