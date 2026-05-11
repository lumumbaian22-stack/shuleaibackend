const { Op } = require('sequelize');
const {
  SubscriptionPlan,
  Subscription,
  SubscriptionPayment,
  Parent,
  Student,
  User,
  School,
  AuditLog
} = require('../models');

const SCHOOL_CORE_FEATURES = ['attendance', 'marks', 'students', 'teachers', 'basic_reports', 'fees'];
const SCHOOL_PREMIUM_FEATURES = ['school_branding', 'ai_analytics', 'advanced_reports', 'advanced_timetable', 'smart_alerts', 'premium_dashboards', 'full_ai_tutor'];

function normalizeCycle(cycle) {
  const value = String(cycle || 'monthly').toLowerCase();
  return ['monthly', 'termly', 'yearly', 'custom'].includes(value) ? value : 'monthly';
}

function addPeriod(fromDate, cycle) {
  const base = fromDate ? new Date(fromDate) : new Date();
  const start = base > new Date() ? base : new Date();
  const end = new Date(start);
  const normalized = normalizeCycle(cycle);
  if (normalized === 'yearly') end.setFullYear(end.getFullYear() + 1);
  else if (normalized === 'termly') end.setMonth(end.getMonth() + 3);
  else end.setMonth(end.getMonth() + 1);
  return { startDate: new Date(), endDate: end };
}

function daysRemaining(endDate, status = 'active') {
  if (!endDate || status !== 'active') return 0;
  return Math.max(0, Math.ceil((new Date(endDate) - new Date()) / 86400000));
}

function planAmount(plan, cycle) {
  const normalized = normalizeCycle(cycle);
  if (normalized === 'yearly' && plan.yearlyPriceKes) return Number(plan.yearlyPriceKes);
  if (normalized === 'termly' && plan.termlyPriceKes) return Number(plan.termlyPriceKes);
  return Number(plan.monthlyPriceKes || plan.price_kes || 0);
}

function planPayload(plan) {
  return {
    id: plan.id,
    code: plan.code || plan.name,
    name: plan.displayName || plan.name,
    displayName: plan.displayName || plan.name,
    ownerType: plan.ownerType,
    price: plan.price_kes,
    monthlyPriceKes: plan.monthlyPriceKes || plan.price_kes,
    termlyPriceKes: plan.termlyPriceKes,
    yearlyPriceKes: plan.yearlyPriceKes,
    setupFeeMinKes: plan.setupFeeMinKes,
    setupFeeMaxKes: plan.setupFeeMaxKes,
    features: plan.features || [],
    lockedFeatures: plan.lockedFeatures || [],
    limits: plan.limits || {},
    sortOrder: plan.sortOrder || 0
  };
}

async function getParentWithStudents(userId) {
  return Parent.findOne({
    where: { userId },
    include: [{ model: Student, as: 'students', include: [{ model: User, attributes: ['id', 'name', 'email', 'profileImage', 'profilePicture'] }] }]
  });
}

async function getSchoolForUser(user) {
  return School.findOne({ where: { schoolId: user.schoolCode } });
}

async function getPlanByCode(code, ownerType) {
  const planCode = String(code || '').toLowerCase();
  return SubscriptionPlan.findOne({
    where: {
      isActive: true,
      ownerType,
      [Op.or]: [{ code: planCode }, { name: planCode }, { displayName: { [Op.iLike]: planCode } }]
    }
  });
}

async function findOrCreateSchoolSubscription(school, plan, cycle) {
  const [subscription] = await Subscription.findOrCreate({
    where: { ownerType: 'school', schoolCode: school.schoolId },
    defaults: {
      ownerType: 'school',
      schoolId: school.id,
      schoolCode: school.schoolId,
      planId: plan?.id || null,
      planCode: plan?.code || 'school_starter',
      planName: plan?.displayName || plan?.name || 'Starter',
      billingCycle: normalizeCycle(cycle),
      status: 'pending',
      features: plan?.features || [],
      limits: plan?.limits || {}
    }
  });
  return subscription;
}

async function findOrCreateChildSubscription(parent, student, plan, cycle) {
  const [subscription] = await Subscription.findOrCreate({
    where: { ownerType: 'child', studentId: student.id },
    defaults: {
      ownerType: 'child',
      schoolCode: student.User?.schoolCode || student.schoolCode || null,
      parentId: parent.id,
      studentId: student.id,
      planId: plan?.id || null,
      planCode: plan?.code || 'child_essential',
      planName: plan?.displayName || plan?.name || 'Essential',
      billingCycle: normalizeCycle(cycle),
      status: 'pending',
      features: plan?.features || [],
      limits: plan?.limits || {}
    }
  });
  return subscription;
}

async function renewSubscription(subscription, plan, cycle, paymentId) {
  const period = addPeriod(subscription.endDate, cycle || subscription.billingCycle);
  const trail = Array.isArray(subscription.auditTrail) ? subscription.auditTrail : [];
  trail.push({ action: 'renewed', paymentId, planCode: plan.code || plan.name, cycle: normalizeCycle(cycle), at: new Date().toISOString() });
  await subscription.update({
    planId: plan.id,
    planCode: plan.code || plan.name,
    planName: plan.displayName || plan.name,
    billingCycle: normalizeCycle(cycle),
    status: 'active',
    startDate: period.startDate,
    endDate: period.endDate,
    lastPaymentId: paymentId,
    features: plan.features || [],
    limits: plan.limits || {},
    auditTrail: trail
  });
  if (subscription.ownerType === 'child' && subscription.studentId) {
    const student = await Student.findByPk(subscription.studentId);
    if (student) {
      const childPlanName = String(plan.name || '').replace(/^child_/, '').replace(/^school_/, '') || 'essential';
      await student.update({
        subscriptionPlan: ['basic','premium','ultimate'].includes(childPlanName) ? childPlanName : (childPlanName === 'genius' ? 'ultimate' : childPlanName === 'smart' ? 'premium' : 'basic'),
        subscriptionStatus: 'active',
        subscriptionStartDate: period.startDate,
        subscriptionExpiry: period.endDate,
        paymentStatus: { ...(student.paymentStatus || {}), plan: plan.code || plan.name, status: 'active', expiryDate: period.endDate, lastPaymentId: paymentId }
      }).catch(() => null);
    }
  }
  return subscription;
}

exports.renewSubscription = renewSubscription;
exports.findOrCreateSchoolSubscription = findOrCreateSchoolSubscription;
exports.findOrCreateChildSubscription = findOrCreateChildSubscription;
exports.getPlanByCode = getPlanByCode;
exports.planAmount = planAmount;
exports.daysRemaining = daysRemaining;

exports.getPlans = async (req, res) => {
  try {
    const ownerType = req.query.ownerType;
    const where = { isActive: true };
    if (ownerType) where.ownerType = ownerType;
    const plans = await SubscriptionPlan.findAll({ where, order: [['sortOrder', 'ASC'], ['price_kes', 'ASC']] });
    res.json({ success: true, data: plans.map(planPayload) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSchoolStatus = async (req, res) => {
  try {
    const school = await getSchoolForUser(req.user);
    if (!school) return res.status(404).json({ success: false, message: 'School not found' });
    const subscription = await Subscription.findOne({ where: { ownerType: 'school', schoolCode: school.schoolId }, include: [{ model: SubscriptionPlan }] });
    const studentCount = await User.count({ where: { schoolCode: school.schoolId, role: 'student' } }).catch(() => 0);
    const active = subscription?.status === 'active' && subscription.endDate && new Date(subscription.endDate) > new Date();
    const tier = subscription?.planName || 'Starter';
    res.json({
      success: true,
      data: {
        schoolId: school.id,
        schoolCode: school.schoolId,
        schoolName: school.name,
        currentPlan: tier,
        planCode: subscription?.planCode || 'school_starter',
        status: active ? 'active' : (subscription?.status || 'pending'),
        billingCycle: subscription?.billingCycle || 'monthly',
        expiresAt: subscription?.endDate || null,
        daysRemaining: daysRemaining(subscription?.endDate, active ? 'active' : subscription?.status),
        studentCount,
        schoolTier: tier,
        coreFeatures: SCHOOL_CORE_FEATURES,
        premiumLocked: !active,
        lockedFeatures: active ? [] : SCHOOL_PREMIUM_FEATURES,
        gracefulMode: !active,
        subscription
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyStatus = async (req, res) => {
  try {
    if (['admin', 'teacher', 'super_admin'].includes(req.user.role)) return exports.getSchoolStatus(req, res);
    if (req.user.role === 'student') {
      const student = await Student.findOne({ where: { userId: req.user.id }, include: [{ model: User, attributes: ['id','name','email','schoolCode'] }] });
      if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });
      const sub = await Subscription.findOne({ where: { ownerType:'child', studentId:student.id }, include:[{ model:SubscriptionPlan }] });
      return res.json({ success:true, data:{ studentId:student.id, subscription: sub, status: sub?.status || student.subscriptionStatus, plan: sub?.planName || student.subscriptionPlan, daysRemaining: daysRemaining(sub?.endDate, sub?.status) } });
    }
    if (req.user.role !== 'parent') return res.json({ success:true, data:{ role:req.user.role } });
    const parent = await getParentWithStudents(req.user.id);
    if (!parent) return res.status(404).json({ success:false, message:'Parent profile not found' });
    const students = [];
    for (const child of parent.students || []) {
      const sub = await Subscription.findOne({ where:{ ownerType:'child', studentId:child.id }, include:[{ model:SubscriptionPlan }] });
      students.push({ id:child.id, name:child.User?.name || child.elimuid, subscription:sub, plan:sub?.planName || child.subscriptionPlan, status:sub?.status || child.subscriptionStatus, expiry:sub?.endDate || child.subscriptionExpiry, remainingDays: daysRemaining(sub?.endDate || child.subscriptionExpiry, sub?.status || child.subscriptionStatus) });
    }
    res.json({ success:true, data:{ parentId:parent.id, students, primary:students[0] || null } });
  } catch(error) { res.status(500).json({ success:false, message:error.message }); }
};

exports.getChildStatus = async (req, res) => {
  try {
    const parent = await getParentWithStudents(req.user.id);
    const child = (parent?.students || []).find(s => String(s.id) === String(req.params.studentId));
    if (!child) return res.status(404).json({ success:false, message:'Child not found or not linked to this parent' });
    const sub = await Subscription.findOne({ where:{ ownerType:'child', studentId:child.id }, include:[{ model:SubscriptionPlan }] });
    res.json({ success:true, data:{ studentId:child.id, childName:child.User?.name || child.elimuid, subscription:sub, status:sub?.status || child.subscriptionStatus, plan:sub?.planName || child.subscriptionPlan, daysRemaining:daysRemaining(sub?.endDate || child.subscriptionExpiry, sub?.status || child.subscriptionStatus) } });
  } catch(error) { res.status(500).json({ success:false, message:error.message }); }
};

exports.createChildSubscriptionRequest = async (req, res) => {
  try {
    const { studentId, planCode='child_essential', billingCycle='monthly' } = req.body || {};
    const parent = await getParentWithStudents(req.user.id);
    if (!parent) return res.status(404).json({ success:false, message:'Parent profile not found' });
    const child = (parent.students || []).find(s => String(s.id) === String(studentId)) || parent.students?.[0];
    if (!child) return res.status(404).json({ success:false, message:'Child not found' });
    const plan = await getPlanByCode(planCode, 'child');
    if (!plan) return res.status(404).json({ success:false, message:'Child subscription plan not found' });
    const subscription = await findOrCreateChildSubscription(parent, child, plan, billingCycle);
    await subscription.update({ planId:plan.id, planCode:plan.code || plan.name, planName:plan.displayName || plan.name, billingCycle:normalizeCycle(billingCycle), status:'pending', features:plan.features || [], limits:plan.limits || {} });
    res.json({ success:true, message:'Child subscription request prepared. Complete STK payment to activate.', data:{ subscription, amount:planAmount(plan, billingCycle), plan:planPayload(plan) } });
  } catch(error) { res.status(500).json({ success:false, message:error.message }); }
};

exports.createSchoolSubscriptionRequest = async (req, res) => {
  try {
    const { planCode='school_growth', billingCycle='monthly' } = req.body || {};
    const school = await getSchoolForUser(req.user);
    if (!school) return res.status(404).json({ success:false, message:'School not found' });
    const plan = await getPlanByCode(planCode, 'school');
    if (!plan) return res.status(404).json({ success:false, message:'School subscription plan not found' });
    const subscription = await findOrCreateSchoolSubscription(school, plan, billingCycle);
    await subscription.update({ planId:plan.id, planCode:plan.code || plan.name, planName:plan.displayName || plan.name, billingCycle:normalizeCycle(billingCycle), status:'pending', features:plan.features || [], limits:plan.limits || {} });
    res.json({ success:true, message:'School subscription request prepared. Complete STK payment to activate.', data:{ subscription, amount:planAmount(plan, billingCycle), plan:planPayload(plan) } });
  } catch(error) { res.status(500).json({ success:false, message:error.message }); }
};

exports.expireNow = async (req, res) => {
  try {
    const updated = await Subscription.update({ status:'expired' }, { where:{ endDate:{ [Op.lt]: new Date() }, status:'active' } });
    res.json({ success:true, message:'Expired subscriptions updated', data:{ updated } });
  } catch(error) { res.status(500).json({ success:false, message:error.message }); }
};

exports.getBillingHistory = async (req, res) => {
  try {
    const school = await getSchoolForUser(req.user);
    if (!school) return res.status(404).json({ success:false, message:'School not found' });
    const payments = await SubscriptionPayment.findAll({ where:{ ownerType:'school', schoolCode:school.schoolId }, order:[['createdAt','DESC']], limit:50 });
    res.json({ success:true, data:payments });
  } catch(error) { res.status(500).json({ success:false, message:error.message }); }
};
