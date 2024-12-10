const express = require('express');
const QueryController = require('../controllers/queryController');

const router = express.Router();
const queryController = new QueryController();

router.get('/features', queryController.getFormData.bind(queryController));
router.post('/generate-report', queryController.generateReport.bind(queryController));

module.exports = router;