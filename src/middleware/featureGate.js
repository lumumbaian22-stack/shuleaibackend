'use strict';
const features = require('../services/schoolFeatureService');
function requireFeature(featureKey) {
  return async function featureGate(req, res, next) {
    try {
      const role = String(req.user?.role || '').toLowerCase();
      if (role === 'super_admin' || role === 'superadmin') return next();
      const schoolCode = req.user?.schoolCode;
      if (!schoolCode) return res.status(403).json({ success:false, code:'SCHOOL_SCOPE_REQUIRED', message:'School scope is required for this feature.' });
      const allowed = await features.hasFeature(schoolCode, featureKey);
      if (!allowed) return res.status(403).json({ success:false, code:'FEATURE_NOT_AVAILABLE_FOR_PLAN', feature:featureKey, message:'Feature is not available for this school plan.' });
      return next();
    } catch (error) {
      return res.status(500).json({ success:false, message:error.message });
    }
  };
}
module.exports = { requireFeature };
