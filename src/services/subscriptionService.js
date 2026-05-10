const { Op } = require('sequelize');
const { SubscriptionPlan, Subscription, SubscriptionPayment, Student, Parent, School, Payment } = require('../models');

const CYCLE_DAYS = { monthly: 30, termly: 90, yearly: 365, custom: 30 };

function normalizeCycle(cycle) {
  return ['monthly', 'termly', 'yearly', 'custom'].includes(String(cycle || '').toLowerCase()) ? String(cycle).toLowerCase() : 'monthly';
}

function addDays(date, days) {
  const base = date ? new Date(date) : new Date();
  return new Date(base.getTime() + days * 86400000);
}

function remainingDays(subscription) {
  if (!subscription || subscription.status !== 'active' || !subscription.endDate) return 0;
  return Math.max(0, Math.ceil((new Date(subscription.endDate) - new Date()) / 86400000));
}

async function getPlanByCode(code, audience) {
  const where = { code, isActive: true };
  if (audience) where.audience = audience;
  const plan = await SubscriptionPlan.findOne({ where });
  if (!plan) throw new Error(`Subscription plan not found: ${code}`);
  return plan;
}

async function getActiveChildSubscription(studentId) {
  const sub = await Subscription.findOne({
    where: { ownerType: 'child', studentId, status: 'active', endDate: { [Op.gt]: new Date() } },
    order: [['endDate', 'DESC']]
  });
  return sub;
}

async function getActiveSchoolSubscription(schoolCode) {
  return Subscription.findOne({
    where: { ownerType: 'school', schoolCode, status: 'active', endDate: { [Op.gt]: new Date() } },
    order: [['endDate', 'DESC']]
  });
}

async function getParentChildStatus(parentUserId) {
  const parent = await Parent.findOne({ where: { userId: parentUserId }, include: [{ model: Student, as: 'students' }] });
  if (!parent) return { parent: null, children: [] };
  const children = [];
  for (const student of parent.students || []) {
    const subscription = await Subscription.findOne({ where: { ownerType: 'child', studentId: student.id }, order: [['createdAt', 'DESC']] });
    children.push({
      studentId: student.id,
      name: student.name || student.elimuid,
      admissionNumber: student.admissionNumber,
      planCode: subscription?.planCode || student.subscriptionPlan || 'none',
      planName: subscription?.planName || student.subscriptionPlan || 'No active plan',
      status: subscription?.status || student.subscriptionStatus || 'inactive',
      startDate: subscription?.startDate || student.subscriptionStartDate || null,
      endDate: subscription?.endDate || student.subscriptionExpiry || null,
      remainingDays: subscription ? remainingDays(subscription) : (student.getRemainingSubscriptionDays?.() || 0),
      features: subscription?.featuresSnapshot || []
    });
  }
  return { parent, children };
}

async function renewSubscriptionFromPayment({ subscriptionPayment, legacyPayment }) {
  const source = subscriptionPayment || legacyPayment;
  if (!source) throw new Error('Payment record is required to renew subscription');

  const ownerType = source.ownerType || (source.studentId ? 'child' : 'school');
  const planCode = source.planCode || (source.plan ? `child_${source.plan}` : null);
  if (!planCode) throw new Error('Payment is missing planCode');
  const plan = await getPlanByCode(planCode, ownerType === 'child' ? 'child' : 'school');
  const billingCycle = normalizeCycle(source.billingCycle || 'monthly');
  const cycleDays = CYCLE_DAYS[billingCycle] || 30;

  const where = ownerType === 'child'
    ? { ownerType: 'child', studentId: source.studentId }
    : { ownerType: 'school', schoolCode: source.schoolCode };

  let subscription = await Subscription.findOne({ where, order: [['createdAt', 'DESC']] });
  const now = new Date();
  const baseDate = subscription?.status === 'active' && subscription.endDate && new Date(subscription.endDate) > now
    ? new Date(subscription.endDate)
    : now;
  const endDate = addDays(baseDate, cycleDays);

  const payload = {
    ownerType,
    schoolId: source.schoolId || null,
    schoolCode: source.schoolCode || null,
    parentId: source.parentId || null,
    studentId: source.studentId || null,
    planId: plan.id,
    planCode: plan.code,
    planName: plan.displayName || plan.name,
    billingCycle,
    status: 'active',
    startDate: subscription?.startDate && subscription.status === 'active' ? subscription.startDate : now,
    endDate,
    lastPaymentId: source.id,
    featuresSnapshot: plan.features || [],
    limitsSnapshot: plan.limits || {},
    metadata: { ...(subscription?.metadata || {}), lastRenewedAt: now.toISOString(), paymentTable: subscriptionPayment ? 'SubscriptionPayments' : 'Payments' }
  };

  if (subscription) await subscription.update(payload);
  else subscription = await Subscription.create(payload);

  if (ownerType === 'child' && source.studentId) {
    const student = await Student.findByPk(source.studentId);
    if (student) {
      await student.update({
        subscriptionPlan: String(plan.name || '').replace(/^child_/, '') || plan.code,
        subscriptionStatus: 'active',
        subscriptionStartDate: payload.startDate,
        subscriptionExpiry: payload.endDate,
        paymentStatus: {
          ...(student.paymentStatus || {}),
          plan: plan.code,
          status: 'active',
          startDate: payload.startDate,
          expiryDate: payload.endDate,
          lastPayment: source.amount,
          lastPaymentDate: now
        }
      });
    }
  }

  return subscription;
}

async function expireDueSubscriptions() {
  const [count] = await Subscription.update({ status: 'expired' }, {
    where: { status: 'active', endDate: { [Op.lt]: new Date() } }
  });
  await Student.update({ subscriptionStatus: 'expired' }, {
    where: { subscriptionStatus: 'active', subscriptionExpiry: { [Op.lt]: new Date() } }
  });
  return count;
}

function featureAllowed(subscription, featureCode) {
  if (!subscription || subscription.status !== 'active') return false;
  if (!subscription.endDate || new Date(subscription.endDate) <= new Date()) return false;
  const features = Array.isArray(subscription.featuresSnapshot) ? subscription.featuresSnapshot : [];
  return features.includes(featureCode);
}

module.exports = {
  getPlanByCode,
  getActiveChildSubscription,
  getActiveSchoolSubscription,
  getParentChildStatus,
  renewSubscriptionFromPayment,
  expireDueSubscriptions,
  featureAllowed,
  remainingDays
};
