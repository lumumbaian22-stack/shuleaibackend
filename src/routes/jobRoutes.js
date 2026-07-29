const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { getJob, listJobs } = require('../services/jobQueue');

const router = express.Router();
router.use(protect);

function retiredAsyncRoute(feature) {
  return (_req, res) => res.status(410).json({
    success: false,
    code: 'ASYNC_JOB_ROUTE_RETIRED',
    message: `${feature} is handled by its active dashboard workflow. This retired background-job route does not queue work.`
  });
}

router.post('/csv-import', authorize('admin', 'super_admin'), retiredAsyncRoute('CSV import'));
router.post('/marks-import', authorize('admin', 'teacher', 'super_admin'), retiredAsyncRoute('Marks import'));
router.post('/report-cards', authorize('admin', 'teacher', 'super_admin'), retiredAsyncRoute('Report-card generation'));

router.get('/', authorize('admin', 'teacher', 'super_admin'), (req, res) => {
  const schoolCode = req.user.role === 'super_admin' ? req.query.schoolCode : req.user.schoolCode;
  res.json({ success: true, data: listJobs({ schoolCode, limit: Number(req.query.limit || 50) }) });
});

router.get('/:jobId', authorize('admin', 'teacher', 'super_admin'), (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
  if (req.user.role !== 'super_admin' && job.schoolCode !== req.user.schoolCode) return res.status(403).json({ success: false, message: 'Forbidden' });
  res.json({ success: true, data: job });
});

module.exports = router;
