const { Op } = require('sequelize');
const { SubscriptionPlan, Subscription, SubscriptionPayment, Parent, Student, User, School, Payment } = require('../models');
const subscriptionService = require('../services/subscriptionService');

function currentSchoolCode(req) {
  return req.user?.schoolCode || req.user?.school?.schoolId || req.user?.school?.id || null;
}

function activeFlag(subscription) {
  return Boolean(subscription && subscription.status === 'active' && subscription.endDate && new Date(subscription.endDate) > new Date());
}

function serializeSubscription(subscription) {
  if (!subscription) return null;
  return {
    id: subscription.id,
    ownerType: subscription.ownerType,
    schoolCode: subscription.schoolCode,
    parentId: subscription.parentId,
    studentId: subscription.studentId,
    planCode: subscription.planCode,
    planName: subscription.planName,
    billingCycle: subscription.billingCycle,
    status: activeFlag(subscription) ? 'active' : subscription.status,
    startDate: subscription.startDate,
    endDate: subscription.endDate,
    remainingDays: subscriptionService.remainingDays(subscription),
    features: subscription.featuresSnapshot || [],
    limits: subscription.limitsSnapshot || {},
    isActive: activeFlag(subscription)
  };
}

exports.getPlans = async (req, res) => {
  try {
    const audience = req.query.audience || undefined;
    const where = { isActive: true };
    if (audience && ['school', 'child'].includes(audience)) where.audience = audience;
    const plans = await SubscriptionPlan.findAll({ where, order: [['audience', 'ASC'], ['tier', 'ASC'], ['price_kes', 'ASC']] });
    res.json({ success: true, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyStatus = async (req, res) => {
  try {
    await subscriptionService.expireDueSubscriptions();

    if (req.user.role === 'student') {
      const student = await Student.findOne({ where: { userId: req.user.id }, include: [{ model: User, attributes: ['id','name','email','profileImage','profilePicture'] }] });
      if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });
      const subscription = await Subscription.findOne({ where: { ownerType: 'child', studentId: student.id }, order: [['createdAt', 'DESC']] });
      return res.json({ success: true, data: { role: 'student', studentId: student.id, subscription: serializeSubscription(subscription) } });
    }

    if (req.user.role === 'parent') {
      const { parent, children } = await subscriptionService.getParentChildStatus(req.user.id);
      if (!parent) return res.status(404).json({ success: false, message: 'Parent profile not found' });
      return res.json({ success: true, data: { role: 'parent', parentId: parent.id, children } });
    }

    if (['admin', 'teacher'].includes(req.user.role)) {
      const schoolCode = currentSchoolCode(req);
      const subscription = schoolCode ? await Subscription.findOne({ where: { ownerType: 'school', schoolCode }, order: [['createdAt', 'DESC']] }) : null;
      return res.json({ success: true, data: { role: req.user.role, schoolCode, subscription: serializeSubscription(subscription) } });
    }

    return res.json({ success: true, data: { role: req.user.role } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getChildStatus = async (req, res) => {
  try {
    const parent = await Parent.findOne({ where: { userId: req.user.id }, include: [{ model: Student, as: 'students' }] });
    if (!parent) return res.status(404).json({ success: false, message: 'Parent profile not found' });
    const child = (parent.students || []).find(s => String(s.id) === String(req.params.studentId));
    if (!child) return res.status(403).json({ success: false, message: 'This child is not linked to your parent account' });
    const subscription = await Subscription.findOne({ where: { ownerType: 'child', studentId: child.id }, order: [['createdAt', 'DESC']] });
    res.json({ success: true, data: { studentId: child.id, subscription: serializeSubscription(subscription) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createChildSubscriptionRequest = async (req, res) => {
  try {
    const { studentId, planCode, billingCycle = 'monthly', amount } = req.body || {};
    if (!studentId || !planCode) return res.status(400).json({ success: false, message: 'studentId and planCode are required' });

    const parent = await Parent.findOne({ where: { userId: req.user.id }, include: [{ model: Student, as: 'students' }] });
    if (!parent) return res.status(404).json({ success: false, message: 'Parent profile not found' });
    const child = (parent.students || []).find(s => String(s.id) === String(studentId));
    if (!child) return res.status(403).json({ success: false, message: 'This child is not linked to your parent account' });

    const plan = await subscriptionService.getPlanByCode(planCode, 'child');
    const payAmount = Number(amount || plan.price_kes || 0);
    if (payAmount <= 0) return res.status(400).json({ success: false, message: 'Invalid subscription amount' });

    let subscription = await Subscription.findOne({ where: { ownerType: 'child', studentId: child.id }, order: [['createdAt', 'DESC']] });
    if (!subscription) {
      subscription = await Subscription.create({
        ownerType: 'child',
        schoolCode: req.user.schoolCode || child.schoolCode,
        parentId: parent.id,
        studentId: child.id,
        planId: plan.id,
        planCode: plan.code,
        planName: plan.displayName || plan.name,
        billingCycle,
        status: 'pending',
        featuresSnapshot: plan.features || [],
        limitsSnapshot: plan.limits || {}
      });
    } else {
      await subscription.update({ planId: plan.id, planCode: plan.code, planName: plan.displayName || plan.name, billingCycle, status: subscription.status === 'active' ? subscription.status : 'pending' });
    }

    const request = await SubscriptionPayment.create({
      subscriptionId: subscription.id,
      ownerType: 'child',
      schoolCode: req.user.schoolCode || child.schoolCode,
      parentId: parent.id,
      studentId: child.id,
      planId: plan.id,
      planCode: plan.code,
      amount: payAmount,
      billingCycle,
      paymentMethod: 'mpesa',
      status: 'pending',
      metadata: { source: 'subscription-request', requiresStk: true }
    });

    res.json({ success: true, message: 'Subscription request created. Complete payment to activate.', data: { subscription: serializeSubscription(subscription), paymentRequest: request } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSchoolStatus = async (req, res) => {
  try {
    const schoolCode = currentSchoolCode(req);
    if (!schoolCode) return res.status(400).json({ success: false, message: 'School context not found' });
    const subscription = await Subscription.findOne({ where: { ownerType: 'school', schoolCode }, order: [['createdAt', 'DESC']] });
    res.json({ success: true, data: { schoolCode, subscription: serializeSubscription(subscription) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createSchoolSubscriptionRequest = async (req, res) => {
  try {
    const { planCode, billingCycle = 'monthly', amount } = req.body || {};
    if (!planCode) return res.status(400).json({ success: false, message: 'planCode is required' });
    const schoolCode = currentSchoolCode(req);
    if (!schoolCode) return res.status(400).json({ success: false, message: 'School context not found' });
    const school = await School.findOne({ where: { schoolId: schoolCode } });
    const plan = await subscriptionService.getPlanByCode(planCode, 'school');
    const payAmount = Number(amount || (billingCycle === 'yearly' ? plan.yearlyPriceKes : plan.price_kes) || 0);

    let subscription = await Subscription.findOne({ where: { ownerType: 'school', schoolCode }, order: [['createdAt', 'DESC']] });
    if (!subscription) {
      subscription = await Subscription.create({ ownerType: 'school', schoolId: school?.id || null, schoolCode, planId: plan.id, planCode: plan.code, planName: plan.displayName || plan.name, billingCycle, status: 'pending', featuresSnapshot: plan.features || [], limitsSnapshot: plan.limits || {} });
    } else {
      await subscription.update({ planId: plan.id, planCode: plan.code, planName: plan.displayName || plan.name, billingCycle, status: subscription.status === 'active' ? subscription.status : 'pending' });
    }

    const request = await SubscriptionPayment.create({ subscriptionId: subscription.id, ownerType: 'school', schoolId: school?.id || null, schoolCode, planId: plan.id, planCode: plan.code, amount: payAmount, billingCycle, paymentMethod: 'mpesa', status: 'pending', metadata: { source: 'school-subscription-request', requiresStk: true } });
    res.json({ success: true, message: 'School subscription request created. Complete payment to activate.', data: { subscription: serializeSubscription(subscription), paymentRequest: request } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.upgrade = exports.createChildSubscriptionRequest;
exports.initiatePayment = exports.createChildSubscriptionRequest;

exports.expireNow = async (req, res) => {
  try {
    const count = await subscriptionService.expireDueSubscriptions();
    res.json({ success: true, message: 'Expired subscription check complete', data: { updated: count } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
