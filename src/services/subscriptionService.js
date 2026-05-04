const { Op } = require('sequelize');
const { Parent, Student, School, Payment, Settings } = require('../models');

const PLAN_FEATURES = {
  basic: ['dashboard', 'basic_materials', 'home_tasks'],
  premium: ['dashboard', 'basic_materials', 'premium_materials', 'home_tasks', 'analytics', 'ai_tutor'],
  ultimate: ['dashboard', 'basic_materials', 'premium_materials', 'ultimate_materials', 'home_tasks', 'analytics', 'ai_tutor', 'advanced_recommendations', 'priority_support']
};

const DEFAULT_PARENT_PLANS = [
  { id: 'basic', name: 'basic', displayName: 'Basic', amount: 150, intervalDays: 30, features: PLAN_FEATURES.basic },
  { id: 'premium', name: 'premium', displayName: 'Premium', amount: 300, intervalDays: 30, features: PLAN_FEATURES.premium },
  { id: 'ultimate', name: 'ultimate', displayName: 'Ultimate', amount: 800, intervalDays: 30, features: PLAN_FEATURES.ultimate }
];

const DEFAULT_SCHOOL_PLANS = [
  { id: 'monthly', name: 'monthly', displayName: 'Monthly', amount: 3000, intervalDays: 30, features: ['admin_dashboard', 'teacher_portal', 'student_records', 'reports'] },
  { id: 'termly', name: 'termly', displayName: 'Termly', amount: 8000, intervalDays: 120, features: ['admin_dashboard', 'teacher_portal', 'student_records', 'reports', 'school_analytics'] },
  { id: 'yearly', name: 'yearly', displayName: 'Yearly', amount: 30000, intervalDays: 365, features: ['admin_dashboard', 'teacher_portal', 'student_records', 'reports', 'school_analytics', 'priority_support'] }
];

function addDays(days) { return new Date(Date.now() + Number(days || 30) * 86400000); }
function isFuture(d) { return d && new Date(d).getTime() > Date.now(); }
function normalizePlan(plan='basic') { const p = String(plan || 'basic').toLowerCase(); return ['basic','premium','ultimate'].includes(p) ? p : 'basic'; }
function parentPrefs(parent) { return parent?.preferences || {}; }
function parentSub(parent) { return parentPrefs(parent).subscription || {}; }

async function getPlatformPaymentSettings() {
  const [row] = await Settings.findOrCreate({
    where: { key: 'platform_payment_settings' },
    defaults: { category: 'payments', description: 'Shule AI platform payment settings', value: { parentPlans: DEFAULT_PARENT_PLANS, schoolPlans: DEFAULT_SCHOOL_PLANS } }
  });
  return row.value || {};
}

async function getParentPlans() {
  const settings = await getPlatformPaymentSettings();
  return Array.isArray(settings.parentPlans) && settings.parentPlans.length ? settings.parentPlans.map(p => ({ ...p, name: p.name || p.id, features: p.features || PLAN_FEATURES[p.id] || [] })) : DEFAULT_PARENT_PLANS;
}

async function getSchoolPlans() {
  const settings = await getPlatformPaymentSettings();
  return Array.isArray(settings.schoolPlans) && settings.schoolPlans.length ? settings.schoolPlans.map(p => ({ ...p, name: p.name || p.id })) : DEFAULT_SCHOOL_PLANS;
}

async function getParentStatus(parent, student=null) {
  const sub = parentSub(parent);
  const now = new Date();
  const trialEnds = sub.trialEnds || parent?.createdAt && addDaysFrom(parent.createdAt, 14);
  const expiry = sub.expiry || student?.subscriptionExpiry || null;
  const plan = normalizePlan(sub.plan || student?.subscriptionPlan || 'basic');
  const manualOverride = sub.manualOverride || null;
  let status = sub.status || student?.subscriptionStatus || 'trial';
  if (manualOverride?.active && (!manualOverride.expiresAt || isFuture(manualOverride.expiresAt))) status = 'active';
  else if (expiry && isFuture(expiry)) status = 'active';
  else if (trialEnds && isFuture(trialEnds)) status = 'trial';
  else status = 'expired';
  return { plan, status, expiry, trialEnds, features: PLAN_FEATURES[plan] || PLAN_FEATURES.basic, manualOverride };
}

function addDaysFrom(date, days) { return new Date(new Date(date).getTime() + days * 86400000); }

async function activateParentSubscription({ parent, student=null, plan='basic', amount=0, days=30, payment=null, source='manual' }) {
  const selected = normalizePlan(plan);
  const expiry = addDays(days);
  const prefs = parent.preferences || {};
  prefs.subscription = {
    ...(prefs.subscription || {}), plan: selected, status: 'active', start: new Date().toISOString(), expiry: expiry.toISOString(), lastPaymentAmount: amount, lastPaymentId: payment?.id || null, source, updatedAt: new Date().toISOString()
  };
  await parent.update({ preferences: prefs });
  if (student) {
    await student.update({
      subscriptionPlan: selected,
      subscriptionStatus: 'active',
      subscriptionStartDate: new Date(),
      subscriptionExpiry: expiry,
      paymentStatus: { ...(student.paymentStatus || {}), plan: selected, status: 'active', expiryDate: expiry, lastPayment: amount, lastPaymentId: payment?.id || null }
    });
  }
  return { plan: selected, status: 'active', expiry };
}

async function getSchoolStatus(school) {
  const settings = school?.settings || {};
  const sub = settings.subscription || {};
  const trialDays = Number(sub.trialDays ?? 14);
  const graceDays = Number(sub.graceDays ?? 7);
  const trialEnds = sub.trialEnds || addDaysFrom(school.createdAt || new Date(), trialDays);
  const expiry = sub.expiry || null;
  const graceEnds = expiry ? addDaysFrom(expiry, graceDays) : null;
  const override = sub.manualOverride || null;
  let status = sub.status || (school.status === 'active' ? 'trial' : school.status);
  if (override?.active && (!override.expiresAt || isFuture(override.expiresAt))) status = 'active';
  else if (expiry && isFuture(expiry)) status = 'active';
  else if (trialEnds && isFuture(trialEnds)) status = 'trial';
  else if (graceEnds && isFuture(graceEnds)) status = 'grace';
  else status = 'expired';
  return { plan: sub.plan || 'trial', status, expiry, trialEnds, graceEnds, manualOverride: override, features: sub.features || [] };
}

async function activateSchoolSubscription({ school, plan='monthly', amount=0, days=null, payment=null, source='manual' }) {
  const plans = await getSchoolPlans();
  const planDef = plans.find(p => String(p.id || p.name).toLowerCase() === String(plan).toLowerCase()) || plans[0];
  const expiry = addDays(days || planDef.intervalDays || 30);
  const settings = school.settings || {};
  settings.subscription = {
    ...(settings.subscription || {}), plan: planDef.id || planDef.name, status: 'active', start: new Date().toISOString(), expiry: expiry.toISOString(), graceDays: settings.subscription?.graceDays ?? 7, lastPaymentAmount: amount, lastPaymentId: payment?.id || null, source, updatedAt: new Date().toISOString(), features: planDef.features || []
  };
  await school.update({ settings, isActive: true, status: school.status === 'suspended' ? school.status : 'active' });
  return { plan: planDef.id || planDef.name, status: 'active', expiry };
}

async function applyPaymentConfirmation(payment) {
  if (!payment || payment.status !== 'completed') return null;
  if (payment.paymentType === 'subscription') {
    const parent = await Parent.findByPk(payment.parentId);
    const student = payment.studentId ? await Student.findByPk(payment.studentId) : null;
    if (parent) return activateParentSubscription({ parent, student, plan: payment.plan, amount: payment.amount, payment, source: 'daraja' });
  }
  if (['school_subscription','maintenance','platform'].includes(payment.paymentType) || payment.metadata?.schoolSubscription) {
    const school = await School.findOne({ where: { schoolId: payment.schoolCode } });
    if (school) return activateSchoolSubscription({ school, plan: payment.metadata?.plan || 'monthly', amount: payment.amount, payment, source: 'daraja' });
  }
  return null;
}

async function hasFeatureForUser(user, feature, studentId=null) {
  if (!user) return { allowed: false, reason: 'Not authenticated' };
  if (user.role === 'super_admin' || user.role === 'admin' || user.role === 'teacher') return { allowed: true, status: { plan: 'school', status: 'active' } };
  if (user.role === 'parent') {
    const parent = await Parent.findOne({ where: { userId: user.id } });
    if (!parent) return { allowed: false, reason: 'Parent account required' };
    let student = null;
    if (studentId) student = await Student.findByPk(studentId);
    const status = await getParentStatus(parent, student);
    return { allowed: status.status === 'active' || status.status === 'trial' ? status.features.includes(feature) || feature === 'dashboard' : false, status };
  }
  if (user.role === 'student') {
    const student = await Student.findOne({ where: { userId: user.id } });
    if (!student) return { allowed: false, reason: 'Student account required' };
    const fakeParent = { preferences: { subscription: { plan: student.subscriptionPlan, status: student.subscriptionStatus, expiry: student.subscriptionExpiry } } };
    const status = await getParentStatus(fakeParent, student);
    return { allowed: (status.status === 'active' || status.status === 'trial') && (status.features.includes(feature) || feature === 'dashboard'), status };
  }
  return { allowed: false, reason: 'Unsupported role' };
}

module.exports = { PLAN_FEATURES, DEFAULT_PARENT_PLANS, DEFAULT_SCHOOL_PLANS, getParentPlans, getSchoolPlans, getParentStatus, activateParentSubscription, getSchoolStatus, activateSchoolSubscription, applyPaymentConfirmation, hasFeatureForUser };
