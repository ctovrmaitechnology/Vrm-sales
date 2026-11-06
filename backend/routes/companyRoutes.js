
const express = require('express');
const router = express.Router();
const multer = require('multer');
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});
const handleImportUpload = (req, res, next) => {
  importUpload.single('file')(req, res, (error) => {
    if (!error) return next();
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({
      error: tooLarge
        ? 'The spreadsheet is larger than the 25 MB upload limit.'
        : error.message || 'The spreadsheet could not be uploaded.',
    });
  });
};

const {
  getCompanies,
  getCompanyById,
  sendCompanyTemplate,
  importCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
} = require('../controllers/companyController');

router.get('/template', sendCompanyTemplate);
router.post('/import', handleImportUpload, importCompanies);
router.get('/', getCompanies);
router.get('/:id', getCompanyById);
router.post('/', createCompany);
router.put('/:id', updateCompany);
router.delete('/:id', deleteCompany);

module.exports = router;
