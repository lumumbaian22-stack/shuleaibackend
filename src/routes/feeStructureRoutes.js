const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/feeStructureController');

router.use(protect);
router.get('/', authorize('admin', 'super_admin'), ctrl.list);
router.post('/', authorize('admin', 'super_admin'), ctrl.create);
router.get('/student-accounts', authorize('admin', 'super_admin', 'teacher'), ctrl.studentFeeAccounts);
router.get('/:id', authorize('admin', 'super_admin'), ctrl.get);
router.put('/:id', authorize('admin', 'super_admin'), ctrl.update);
router.post('/:id/activate', authorize('admin', 'super_admin'), ctrl.activate);
router.post('/:id/lock', authorize('admin', 'super_admin'), ctrl.lock);
router.post('/:id/assign', authorize('admin', 'super_admin'), ctrl.assign);
router.post('/student-accounts/:feeId/adjust', authorize('admin', 'super_admin'), ctrl.adjustFee);

module.exports = router;
