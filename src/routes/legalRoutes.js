const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const legal = require('../controllers/legalController');
router.get('/', legal.getAllActive);
router.get('/:type', legal.getActive);
router.put('/:type', protect, legal.upsert);
module.exports = router;
