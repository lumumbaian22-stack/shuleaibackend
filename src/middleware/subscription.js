const { Parent, Student, School, Subscription, FeatureLock } = require('../models');

const CHILD_FEATURE_ALIASES = {
  ai_tutor: ['ai_tutor', 'unlimited_ai_tutor', 'full_ai_tutor'],
  study_recommendations: ['study_recommendations', 'weak_subject_detection', 'personalized_study_plan', 'personalized_study_plans', 'advanced_insights'],
  study_analytics: ['study_analytics', 'deep_analytics', 'advanced_insights', 'advanced_exam_preparation', 'exam_prep'],
  advanced_report_insights: ['advanced_report_insights', 'advanced_insights', 'deep_analytics']
};

const SCHOOL_FEATURE_ALIASES = {
  ai_analytics: ['ai_analytics', 'advanced_analytics', 'advanced_reports', 'premium_dashboards'],
  advanced_reports: ['advanced_reports', 'premium_dashboards'],
  advanced_timetable: ['advanced_timetable'],
  smart_alerts: ['smart_alerts'],
  school_branding: ['school_branding']
};

function isActive(subscription) {
  return subscription && subscription.status === 'active' && subscription.endDate && new Date(subscription.endDate) > new Date();
}

function normalizeFeatures(subscription) {
  const features = Array.isArray(subscription?.features) ? subscription.features : [];
  return features.map(f => String(f || '').trim()).filter(Boolean);
}

function featureAllowed(subscription, featureKey, ownerType) {
  if (!isActive(subscription)) return false;
  const features = normalizeFeatures(subscription);
  if (features.includes('*') || features.includes(featureKey)) return true;
  const aliases = ownerType === 'school' ? SCHOOL_FEATURE_ALIASES : CHILD_FEATURE_ALIASES;
  return (aliases[featureKey] || []).some(alias => features.includes(alias));
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
    return null;
  }
  return null;
}

const checkSubscription = async (req, res, next) => {
  try {
    if (['admin', 'teacher'].includes(req.user.role)) {
      const subscription = await getSchoolSubscription(req.user);
      req.schoolSubscription = subscription;
      req.subscriptionAccess = { ownerType: 'school', active: isActive(subscription), subscription };
      return next();
    }
    if (['parent', 'student'].includes(req.user.role)) {
      const subscription = await getChildSubscriptionForUser(req.user, req.params.studentId || req.body.studentId || req.query.studentId);
      req.childSubscription = subscription;
      req.subscriptionAccess = { ownerType: 'child', active: isActive(subscription), subscription };
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
      const subscription = ownerType === 'school'
        ? await getSchoolSubscription(req.user)
        : await getChildSubscriptionForUser(req.user, req.params.studentId || req.body.studentId || req.query.studentId);

      if (featureAllowed(subscription, featureKey, ownerType)) return next();

      const status = subscription?.status || 'inactive';
      const response = {
        success: false,
        code: ownerType === 'school' ? 'SCHOOL_PREMIUM_LOCKED' : 'SUBSCRIPTION_REQUIRED',
        message: ownerType === 'school'
          ? 'This school premium feature is locked until the school subscription is active or upgraded.'
          : 'This premium learner feature needs an active subscription.',
        feature: featureKey,
        ownerType,
        status,
        currentPlan: subscription?.planName || subscription?.planCode || null,
        gracefulMode: ownerType === 'school'
      };
      return res.status(402).json(response);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { checkSubscription, requireFeature, isActive, featureAllowed };
