const express = require('express');
const { getUsers, getTeamReport, createUser, getAccessUsers, setUserLogin, getUserHistory, exportdailyReport, deleteUser } = require('../controllers/usersController');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', getUsers); // any signed-in user; the list is limited to what their role may see
router.get('/team-report', getTeamReport); // scoped inside the controller
router.get('/access', requireRole('super_admin'), getAccessUsers);
router.post('/', requireRole('admin'), createUser);
router.get('/daily-report', requireRole('admin'), exportdailyReport);
router.get('/:id/history', getUserHistory); // scoped inside the controller
router.put('/:id/login', requireRole('super_admin'), setUserLogin);
router.delete('/:id', requireRole('admin'), deleteUser);
module.exports = router;