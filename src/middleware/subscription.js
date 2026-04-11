const checkSubscription = (requiredPlan) => {
  return (req, res, next) => {
    const user = req.user;
    const plans = { basic: 0, premium: 1, ultimate: 2 };
    if (plans[user.subscriptionPlan] >= plans[requiredPlan]) {
      next();
    } else {
      res.status(403).json({ success: false, message: `Upgrade to ${requiredPlan} plan to access this feature.` });
    }
  };
};
module.exports = { checkSubscription };
