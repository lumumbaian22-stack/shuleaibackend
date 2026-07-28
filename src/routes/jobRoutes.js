const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { enqueueJob, getJob, listJobs } = require('../services/jobQueue');

const router = express.Router();
router.use(protect);

router.post('/csv-import', authorize('admin', 'super_admin'), (req, res) => {
  const job = enqueueJob('csv-import', { filename: req.body?.filename || null, mode: req.body?.mode || 'students' }, req.user);
  res.status(202).json({ success: true, message: 'Import queued. Large imports should be processed by a worker before final rollout.', data: job });
});

router.post('/marks-import', authorize('admin', 'teacher', 'super_admin'), (req, res) => {
  const job = enqueueJob('marks-import', { filename: req.body?.filename || null, term: req.body?.term, year: req.body?.year }, req.user);
  res.status(202).json({ success: true, message: 'Marks import queued. Large marks uploads will not block dashboard requests.', data: job });
});

router.post('/report-cards', authorize('admin', 'teacher', 'super_admin'), (req, res) => {
  const job = enqueueJob('report-card-generation', { classId: req.body?.classId, term: req.body?.term, year: req.body?.year }, req.user);
  res.status(202).json({ success: true, message: 'Report card generation queued.', data: job });
});

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
