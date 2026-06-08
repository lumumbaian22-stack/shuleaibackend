const { Parent, Student, School, Subscription, FeatureLock } = require('../models');
const schoolFeatures = require('../services/schoolFeatureService');

function isActive(subscription) {
  return subscription && subscription.status === 'active' && subscription.endDate && new Date(subscription.endDate) > new Date();
}

async function getSchoolSubscription(user) {
  if (!user?.schoolCode) return null;
  return Subscription.findOne({ where: { ownerType: 'school', schoolCode: user.schoolCode } });
}

async function getChildSubscriptionForUser(user, studentId = null) {
  if (user.role === 'student') {
    const student = await Student.findOne({ where: { userId: user.id } });
    if (!student) return null;
    return Subscription.findOne({ where: { ownerType: 'child', studentId: student.id } });
  }
  if (user.role === 'parent') {
    const parent = await Parent.findOne({ where: { userId: user.id } });
    if (!parent) return null;
    if (studentId) return Subscription.findOne({ where: { ownerType: 'child', studentId, parentId: parent.id } });
  }
  return null;
}

const checkSubscription = async (req, res, next) => {
  try {
    if (['admin', 'teacher'].includes(req.user.role)) {
      const subscription = await getSchoolSubscription(req.user);
      // Graceful mode: do not block core operations here. Use requireFeature for premium-only sections.
      req.schoolSubscription = subscription;
      return next();
    }
    if (['parent', 'student'].includes(req.user.role)) {
      const subscription = await getChildSubscriptionForUser(req.user, req.params.studentId || req.body.studentId || req.query.studentId);
      req.childSubscription = subscription;
      return next();
    }
    next();
  } catch (error) {
    next(error);
  }
};

function requireFeature(featureKey, opts = {}) {
  return async (req, res, next) => {
    try {
      const ownerType = opts.ownerType || (['admin', 'teacher'].includes(req.user.role) ? 'school' : 'child');
      let subscription = ownerType === 'school'
        ? await getSchoolSubscription(req.user)
        : await getChildSubscriptionForUser(req.user, req.params.studentId || req.body.studentId || req.query.studentId);

      if (ownerType === 'school') {
        const allowed = await schoolFeatures.hasFeature(req.user.schoolCode, featureKey);
        if (allowed) return next();
        return res.status(403).json({ success:false, code:'SCHOOL_ACCESS_UNAVAILABLE', message:'This module is temporarily unavailable because the school account is suspended or the school context is invalid.', feature:featureKey });
      }

      const active = isActive(subscription);
      const features = subscription?.features || [];
      const allowed = active && (features.includes(featureKey) || features.includes('*') || !opts.strictFeatureList);
      if (allowed) return next();
      return res.status(402).json({ success: false, code: 'SUBSCRIPTION_REQUIRED', message: 'Subscription required for this feature.', feature: featureKey });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { checkSubscription, requireFeature, isActive };
