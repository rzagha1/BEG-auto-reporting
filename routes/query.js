const express = require('express');
const QueryController = require('../controllers/queryController');

const router = express.Router();
const queryController = new QueryController();

// Remove the features route since it's now at root
router.post('/generate-report', queryController.inputToGenerateReport.bind(queryController));

module.exports = router;