const express = require('express');
const { getUsers, createUser, getUserHistory } = require('../controllers/usersController');

const router = express.Router();

router.get('/', getUsers);
router.post('/', createUser);
router.get('/:id/history', getUserHistory);

module.exports = router;
