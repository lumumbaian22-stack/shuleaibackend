const { Parent } = require('../models');

const checkParentSubscription = (requiredPlan) => {
  return async (req, res, next) => {
    try {
      const parent = await Parent.findOne({ where: { userId: req.user.id } });
      if (!parent) return res.status(403).json({ success: false, message: 'Parent account required' });
      const plans = { basic: 0, premium: 1, ultimate: 2 };
      if (parent.subscriptionStatus === 'active' && parent.subscriptionExpiry > new Date() && plans[parent.subscriptionPlan] >= plans[requiredPlan]) {
        next();
      } else {
        res.status(403).json({ success: false, message: `Upgrade to ${requiredPlan} plan to access this feature.` });
      }
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
};

module.exports = { checkParentSubscription };
