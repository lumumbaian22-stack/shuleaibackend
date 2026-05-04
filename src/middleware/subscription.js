const { Parent, Student, School } = require('../models');
const { getParentStatus, getSchoolStatus, hasFeatureForUser } = require('../services/subscriptionService');

function isAllowedPath(req) {
  const p = req.path || '';
  return p.includes('/settings') || p.includes('/payments') || p.includes('/subscription') || p.includes('/health') || p.includes('/auth') || p.includes('/consent');
}

const requireFeature = (feature) => async (req, res, next) => {
  try {
    const check = await hasFeatureForUser(req.user, feature, req.body?.studentId || req.query?.studentId || req.params?.studentId);
    if (!check.allowed) {
      return res.status(402).json({ success: false, code: 'SUBSCRIPTION_REQUIRED', feature, message: `Your current plan does not include ${feature}. Please upgrade to continue.`, subscription: check.status || null });
    }
    req.subscription = check.status;
    next();
  } catch (error) { next(error); }
};

const requireActiveSchoolSubscription = (options = {}) => async (req, res, next) => {
  try {
    if (!req.user || req.user.role === 'super_admin' || isAllowedPath(req)) return next();
    if (!['admin', 'teacher'].includes(req.user.role)) return next();
    const school = await School.findOne({ where: { schoolId: req.user.schoolCode } });
    if (!school) return res.status(403).json({ success: false, code: 'SCHOOL_NOT_FOUND', message: 'School account was not found.' });
    if (school.status === 'suspended') return res.status(403).json({ success: false, code: 'SCHOOL_SUSPENDED', message: school.suspensionReason || 'School account is suspended.' });
    const status = await getSchoolStatus(school);
    const allowed = ['active', 'trial', 'grace'].includes(status.status);
    if (!allowed) return res.status(402).json({ success: false, code: 'SCHOOL_SUBSCRIPTION_REQUIRED', message: 'School subscription has expired. Renew to continue.', subscription: status });
    req.schoolSubscription = status;
    next();
  } catch (error) { next(error); }
};

const checkSubscription = requireFeature('dashboard');
module.exports = { checkSubscription, requireFeature, requireActiveSchoolSubscription };
