const { Parent, Student } = require('../models');

const checkSubscription = async (req, res, next) => {
  try {
    if (req.user.role === 'parent') {
      const parent = await Parent.findOne({ where: { userId: req.user.id } });
      if (!parent) return res.status(403).json({ success: false, message: 'Parent account required' });
      const now = new Date();
      if (parent.trialEndsAt && parent.trialEndsAt > now) {
        return next(); // trial active
      }
      if (parent.subscriptionStatus !== 'active' || !parent.subscriptionExpiry || parent.subscriptionExpiry < now) {
        return res.status(403).json({ success: false, message: 'Subscription required. Please upgrade.', code: 'SUBSCRIPTION_REQUIRED' });
      }
    } else if (req.user.role === 'student') {
      const student = await Student.findOne({ where: { userId: req.user.id } });
      if (!student) return res.status(403).json({ success: false, message: 'Student account required' });
      const now = new Date();
      if (student.subscriptionExpiry && student.subscriptionExpiry > now) {
        return next();
      }
      if (student.subscriptionStatus !== 'active') {
        return res.status(403).json({ success: false, message: 'Subscription required.', code: 'SUBSCRIPTION_REQUIRED' });
      }
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { checkSubscription };
