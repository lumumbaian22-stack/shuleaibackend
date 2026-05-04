const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const learning = require('../controllers/learningController');
router.use(protect);
router.get('/materials', learning.getMaterials);
router.get('/materials/:id', learning.viewMaterial);
router.post('/materials', learning.createMaterial);
module.exports = router;
