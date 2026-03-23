// routes/helpRoutes.js
const express = require('express');
const router = express.Router();
const helpController = require('../controllers/helpController');

// Public routes - no authentication required for help
router.get('/articles/:role', helpController.getHelpArticles);
router.post('/search', helpController.searchHelpArticles);
router.get('/articles/:role/:articleId', helpController.getHelpArticle);

module.exports = router;
