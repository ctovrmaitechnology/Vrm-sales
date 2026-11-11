const express = require('express');
const {
  getTeams, createTeam, renameTeam, deleteTeam, addTeamMember, removeTeamMember,
} = require('../controllers/teamController');

const router = express.Router();

router.get('/', getTeams);
router.post('/', createTeam);
router.patch('/:id', renameTeam);
router.delete('/:id', deleteTeam);
router.post('/:id/members', addTeamMember);
router.delete('/:id/members/:userId', removeTeamMember);

module.exports = router;
