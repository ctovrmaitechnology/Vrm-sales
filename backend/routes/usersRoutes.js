const express = require('express');
const { getUsers, getTeamReport,createUser, renameUser, getAccessUsers, setUserLogin, getUserHistory, exportdailyReport, deleteUser } = require('../controllers/usersController');
const { requireRole } = require('../middleware/auth');
const { sendManualSummaries } = require('../services/followUpReminderService');
const router = express.Router();

router.get('/', getUsers); // any signed-in user; the list is limited to what their role may see
router.get('/team-report', getTeamReport); // scoped inside the controller
router.get('/access', requireRole('super_admin'), getAccessUsers);
router.post('/send-followup-mail', requireRole('admin'), async (req, res) => {
  try {
    const target = req.body?.user_id === 'all' ? 'all' : Number(req.body?.user_id);
    if (target !== 'all' && !Number.isInteger(target)) return res.status(400).json({ error: 'Choose a user.' });
    const result = await sendManualSummaries(target);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('Manual follow-up mail failed:', err.message);
    return res.status(500).json({ error: 'Failed to send follow-up mail.' });
  }
});
router.post('/', requireRole('admin'), createUser);
router.get('/daily-report', requireRole('admin'), exportdailyReport);
router.get('/:id/history', getUserHistory); // scoped inside the controller
router.put('/:id/login', requireRole('super_admin'), setUserLogin);
router.delete('/:id', requireRole('admin'), deleteUser);
router.put('/:id/name', requireRole('admin'), renameUser);
module.exports = router;