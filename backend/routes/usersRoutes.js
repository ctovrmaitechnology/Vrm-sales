const express = require('express');
const { getUsers, createUser, getUserHistory, exportdailyReport, deleteUser} = require('../controllers/usersController');

const router = express.Router();

router.get('/', getUsers);
router.post('/', createUser);
router.get('/daily-report', exportdailyReport);
router.get('/:id/history', getUserHistory);
router.delete('/:id', deleteUser);
module.exports = router;