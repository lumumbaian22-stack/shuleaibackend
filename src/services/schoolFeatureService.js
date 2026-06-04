'use strict';
const { School, Settings, Subscription, SubscriptionPlan } = require('../models');

const FEATURE_KEYS = {
  dashboard: 'dashboard', teachers: 'teachers', teacher_approvals: 'teacher_approvals', students: 'students', analytics: 'analytics', alerts: 'alerts', finance_fees: 'finance_fees', parent_messages: 'parent_messages', school_settings: 'school_settings', billing: 'billing', classes: 'classes', report_cards: 'report_cards', calendar: 'calendar', school_branding: 'school_branding', timetable: 'timetable', homework: 'homework', duty: 'duty', fairness_report: 'fairness_report', departments: 'departments', bulk_sms: 'bulk_sms', senior_subject_choice: 'senior_subject_choice'
};

const STARTER = ['dashboard','teachers','teacher_approvals','students','analytics','alerts','finance_fees','parent_messages','school_settings','billing','classes','report_cards'];
const GROWTH = [...STARTER, 'calendar','school_branding','timetable','homework'];
const ENTERPRISE = [...GROWTH, 'duty','fairness_report','departments','bulk_sms','senior_subject_choice'];
const ALL_FEATURES = [...new Set([...ENTERPRISE, '*', 'ai_tutor', 'ai_tutor_limited', 'ai_tutor_extended', 'live_child_analytics', 'advanced_alerts', 'child_recommendations', 'advanced_report_cards'])];
const PLAN_CODES = ['starter', 'growth', 'enterprise'];
const DEFAULT_PLANS = {
  starter: { code:'starter', name:'Starter', minStudents:50, maxStudents:400, features:STARTER, branding:'shule_ai_default' },
  growth: { code:'growth', name:'Growth', minStudents:401, maxStudents:500, features:GROWTH, branding:'school_custom_allowed' },
  enterprise: { code:'enterprise', name:'Enterprise', minStudents:501, maxStudents:null, features:ENTERPRISE, branding:'school_custom_allowed' }
};

function truthy(value) {
  if (value === true || value === 1) return true;
  const text = String(value || '').trim().toLowerCase();
  return ['true','1','yes','on','enabled','active','full','full_access','pilot','demo','free'].includes(text);
}
function normalizePlanCode(code) {
  const raw = String(code || '').toLowerCase().trim().replace(/^school_/, '');
  if (raw.includes('enterprise')) return 'enterprise';
  if (raw.includes('growth')) return 'growth';
  if (raw.includes('starter')) return 'starter';
  return PLAN_CODES.includes(raw) ? raw : 'starter';
}
function normalizeFeatures(plan) {
  if (!plan) return [];
  if (Array.isArray(plan.features)) return plan.features.map(f => String(f).trim()).filter(Boolean);
  if (plan.features && typeof plan.features === 'object') return Object.entries(plan.features).filter(([,v]) => !!v).map(([k]) => k);
  return [];
}
function schoolHasFullAccessOverride(school) {
  const s = school?.toJSON ? school.toJSON() : (school || {});
  const settings = s.settings || {};
  const billing = settings.billing || {};
  const access = settings.access || settings.schoolAccess || {};
  const text = [
    s.accessMode, s.accessStatus, s.subscriptionStatus, s.subscriptionPlan, s.plan, s.tier, s.status,
    settings.accessMode, settings.accessStatus, settings.subscriptionPlan, settings.currentPlan, settings.plan,
    billing.accessMode, billing.subscriptionPlan, billing.subscriptionStatus, access.mode, access.accessMode, access.type
  ].filter(Boolean).join(' ').toLowerCase();
  return truthy(s.pilotFullAccessEnabled) || truthy(settings.pilotFullAccessEnabled) || truthy(billing.pilotFullAccessEnabled) || truthy(access.pilotFullAccessEnabled)
    || truthy(s.demoMode) || truthy(settings.demoMode) || truthy(billing.demoMode) || truthy(access.demoMode)
    || truthy(s.freeFullAccess) || truthy(settings.freeFullAccess) || truthy(billing.freeFullAccess) || truthy(access.freeFullAccess)
    || truthy(s.fullAccess) || truthy(settings.fullAccess) || truthy(billing.fullAccess) || truthy(access.fullAccess)
    || /pilot[_\s-]*full|full[_\s-]*pilot|demo[_\s-]*full|free[_\s-]*full|full[_\s-]*access|manual[_\s-]*full/.test(text);
}
function isSuspendedSchool(school) {
  const s = school?.toJSON ? school.toJSON() : (school || {});
  return String(s.status || '').toLowerCase() === 'suspended' || s.isSuspended === true || s.accessSuspended === true;
}
function schoolHasSeniorEnabled(school) {
  const s = school?.toJSON ? school.toJSON() : (school || {});
  const settings = s.settings || {};
  const engine = settings.curriculumEngine || {};
  const levels = Array.isArray(s.enabledLevels) && s.enabledLevels.length ? s.enabledLevels : (Array.isArray(engine.enabledLevels) ? engine.enabledLevels : []);
  const text = [settings.schoolStructure, settings.structureType, settings.schoolLevel, engine.structureType, levels.join(' '), s.level, s.type, s.schoolStructure].filter(Boolean).join(' ').toLowerCase();
  if (/primary[_\s-]*only|primary only|junior[_\s-]*only|junior only|pre.?primary|early[_\s-]*only/.test(text) && !/senior|secondary|mixed|grade_1[0-2]|g1[0-2]/.test(text)) return false;
  if (/senior|secondary|mixed|full|grade_1[0-2]|g1[0-2]|form_[1-4]/.test(text)) return true;
  return !!(settings.hasSeniorSchool || settings.seniorEnabled || settings.seniorSchoolEnabled || engine.seniorEnabled);
}
async function platformSettings() {
  const row = await Settings.findOne({ where:{ key:'platform_payment_settings' } }).catch(() => null);
  return row?.value || {};
}
function normalizeSchoolPlan(raw) {
  const code = normalizePlanCode(raw?.code || raw?.planCode || raw?.name);
  const base = DEFAULT_PLANS[code] || DEFAULT_PLANS.starter;
  const features = normalizeFeatures(raw).length ? normalizeFeatures(raw) : base.features;
  return { ...base, ...(raw || {}), code, features };
}
async function getPlanDefinitions() {
  const settings = await platformSettings();
  const rawPlans = Array.isArray(settings.schoolPlans) ? settings.schoolPlans : [];
  const map = new Map(Object.values(DEFAULT_PLANS).map(p => [p.code, p]));
  rawPlans.map(normalizeSchoolPlan).filter(p => PLAN_CODES.includes(p.code)).forEach(p => map.set(p.code, p));
  return Object.fromEntries([...map.entries()].map(([k,v]) => [k, { ...v, features: normalizeFeatures(v).length ? normalizeFeatures(v) : (DEFAULT_PLANS[k]?.features || []) }]));
}
async function getSchoolPlanCode(schoolCode) {
  if (!schoolCode) return 'starter';
  const school = await School.findOne({ where:{ schoolId:schoolCode } }).catch(() => null);
  const settings = school?.settings || {};
  const direct = settings.currentPlan || settings.plan || school?.subscriptionPlan || school?.plan || school?.tier || school?.subscriptionTier;
  if (direct) return normalizePlanCode(direct);
  const sub = await Subscription.findOne({ where:{ schoolCode, ownerType:'school' }, include:[{ model:SubscriptionPlan, required:false }], order:[['updatedAt','DESC']] }).catch(() => null);
  return normalizePlanCode(sub?.planCode || sub?.SubscriptionPlan?.code || sub?.SubscriptionPlan?.name || 'starter');
}
async function getSchoolFeatures(schoolCode) {
  const defs = await getPlanDefinitions();
  const school = schoolCode ? await School.findOne({ where:{ schoolId:schoolCode } }).catch(() => null) : null;
  if (isSuspendedSchool(school)) {
    const set = new Set(['dashboard','billing','school_settings']);
    return { planCode:'suspended', plan:{ code:'suspended', name:'Suspended', features:[...set] }, features:set, featureList:[...set], suspended:true, fullAccess:false, override:false, accessMode:'suspended' };
  }
  if (schoolHasFullAccessOverride(school)) {
    const set = new Set(ALL_FEATURES);
    return { planCode:'enterprise', plan:{ ...defs.enterprise, code:'enterprise', name:'Enterprise / Full Access', override:true, fullAccess:true, features:[...set] }, features:set, featureList:[...set], override:true, fullAccess:true, accessMode:'pilot_full_access' };
  }
  const code = await getSchoolPlanCode(schoolCode);
  const plan = defs[code] || defs.starter;
  const set = new Set(normalizeFeatures(plan));
  return { planCode:code, plan, features:set, featureList:[...set], override:false, fullAccess:false, accessMode:code };
}
async function hasFeature(schoolCode, feature) {
  const key = String(feature || '').trim();
  if (!key) return false;
  const school = schoolCode ? await School.findOne({ where:{ schoolId:schoolCode } }).catch(() => null) : null;
  const info = await getSchoolFeatures(schoolCode);
  if (info.features.has('*')) return true;
  if (key === 'senior_subject_choice' && !schoolHasSeniorEnabled(school)) return false;
  return info.features.has(key);
}
async function getSchoolStructure(schoolCode) {
  const school = await School.findOne({ where:{ schoolId:schoolCode } }).catch(() => null);
  return { school, seniorEnabled: schoolHasSeniorEnabled(school) };
}

module.exports = { DEFAULT_PLANS, FEATURE_KEYS, ALL_FEATURES, getPlanDefinitions, getSchoolPlanCode, getSchoolFeatures, hasFeature, getSchoolStructure, schoolHasSeniorEnabled, schoolHasFullAccessOverride, normalizePlanCode, isSuspendedSchool };
