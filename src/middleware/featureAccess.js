const { Parent, Student } = require('../models');
const subscriptionService = require('../services/subscriptionService');

function requireFeature(featureCode, options = {}) {
  return async (req, res, next) => {
    try {
      const role = req.user?.role;
      if (!role) return res.status(401).json({ success: false, message: 'Not authenticated' });

      if (['super_admin'].includes(role)) return next();

      if (['admin', 'teacher'].includes(role)) {
        const sub = await subscriptionService.getActiveSchoolSubscription(req.user.schoolCode);
        if (subscriptionService.featureAllowed(sub, featureCode)) return next();
        return res.status(402).json({ success: false, locked: true, featureCode, message: 'This school feature requires an active school subscription plan.' });
      }

      let studentId = req.params.studentId || req.body.studentId || req.query.studentId;
      if (role === 'student') {
        const student = await Student.findOne({ where: { userId: req.user.id } });
        studentId = student?.id;
      }
      if (role === 'parent') {
        const parent = await Parent.findOne({ where: { userId: req.user.id }, include: [{ model: Student, as: 'students' }] });
        const linked = (parent?.students || []).some(s => String(s.id) === String(studentId));
        if (!linked) return res.status(403).json({ success: false, message: 'This child is not linked to your parent account' });
      }

      const sub = studentId ? await subscriptionService.getActiveChildSubscription(studentId) : null;
      if (subscriptionService.featureAllowed(sub, featureCode)) return next();
      return res.status(402).json({ success: false, locked: true, featureCode, message: 'This child feature requires an active child subscription plan.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  };
}

module.exports = { requireFeature };
