const express = require('express');
const router = express.Router();
const { getCategories, addCategory } = require('../controllers/categoryController');

router.get('/categories', getCategories);
router.post('/categories', addCategory);

module.exports = router;

