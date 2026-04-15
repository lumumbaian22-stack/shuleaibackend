const { Parent } = require('../models');

const checkParentSubscription = (requiredPlan) => {
  const planLevels = { basic: 0, premium: 1, ultimate: 2 };
  return async (req, res, next) => {
    try {
      const parent = await Parent.findOne({ where: { userId: req.user.id } });
      if (!parent) return res.status(403).json({ success: false, message: 'Parent account required' });
      
      const currentPlan = parent.subscriptionPlan || 'basic';
      const isActive = parent.subscriptionStatus === 'active' && parent.subscriptionExpiry > new Date();
      
      if (isActive && planLevels[currentPlan] >= planLevels[requiredPlan]) {
        return next();
      }
      
      // Check if within trial period
      if (parent.trialEndsAt && parent.trialEndsAt > new Date() && planLevels[requiredPlan] === 0) {
        return next();
      }
      
      res.status(403).json({ 
        success: false, 
        message: `This feature requires ${requiredPlan} subscription. Please upgrade.` 
      });
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { checkParentSubscription };
