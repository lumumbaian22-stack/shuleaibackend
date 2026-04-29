const { SubscriptionPlan, Parent, User } = require('../models');

exports.getPlans = async (req, res) => {
  try {
    const schoolId = req.user.school?.id || null;
    const plans = await SubscriptionPlan.findAll({
      where: {
        [Op.or]: [{ schoolId }, { schoolId: null }],
        isActive: true
      }
    });
    res.json({ success: true, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyStatus = async (req, res) => {
  try {
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    if (!parent) return res.status(404).json({ success: false, message: 'Parent not found' });
    res.json({
      success: true,
      data: {
        plan: parent.subscriptionPlan,
        status: parent.subscriptionStatus,
        expiry: parent.subscriptionExpiry,
        trialEnds: parent.trialEndsAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.initiatePayment = async (req, res) => {
  try {
    const { planName } = req.body; // 'premium' or 'ultimate'
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    if (!parent) return res.status(404).json({ success: false, message: 'Parent not found' });
    const plan = await SubscriptionPlan.findOne({ where: { name: planName, isActive: true } });
    if (!plan) return res.status(400).json({ success: false, message: 'Invalid plan' });
    // Mock payment – just activate subscription
    parent.subscriptionPlan = planName;
    parent.subscriptionStatus = 'active';
    parent.subscriptionStartDate = new Date();
    parent.subscriptionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await parent.save();
    res.json({ success: true, message: `Subscribed to ${planName} plan for 30 days` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
