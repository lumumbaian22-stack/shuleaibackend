'use strict';
const { School, Settings, Subscription, SubscriptionPlan, sequelize } = require('../models');

const PLAN_CODES = ['starter', 'growth', 'enterprise'];
const FEATURE_KEYS = {
  dashboard: 'dashboard', teachers: 'teachers', teacher_approvals: 'teacher_approvals', students: 'students', analytics: 'analytics', alerts: 'alerts', finance_fees: 'finance_fees', parent_messages: 'parent_messages', school_settings: 'school_settings', billing: 'billing', classes: 'classes', report_cards: 'report_cards', calendar: 'calendar', school_branding: 'school_branding', timetable: 'timetable', duty: 'duty', fairness_report: 'fairness_report', departments: 'departments', bulk_sms: 'bulk_sms', senior_subject_choice: 'senior_subject_choice'
};
const STARTER = ['dashboard','teachers','teacher_approvals','students','analytics','alerts','finance_fees','parent_messages','school_settings','billing','classes','report_cards'];
const GROWTH = [...STARTER, 'calendar','school_branding','timetable'];
const ENTERPRISE = [...GROWTH, 'duty','fairness_report','departments','bulk_sms','senior_subject_choice'];
const DEFAULT_PLANS = {
  starter: { code:'starter', name:'Starter', minStudents:50, maxStudents:400, features:STARTER, branding:'shule_ai_default' },
  growth: { code:'growth', name:'Growth', minStudents:401, maxStudents:500, features:GROWTH, branding:'school_custom_allowed' },
  enterprise: { code:'enterprise', name:'Enterprise', minStudents:501, maxStudents:null, features:ENTERPRISE, branding:'school_custom_allowed' }
};
function normalizePlanCode(code) {
  const raw = String(code || '').toLowerCase().trim().replace(/^school_/, '');
  if (raw.includes('enterprise')) return 'enterprise';
  if (raw.includes('growth')) return 'growth';
  if (raw.includes('starter')) return 'starter';
  return raw || 'starter';
}
async function platformSettings() {
  const row = await Settings.findOne({ where:{ key:'platform_payment_settings' } }).catch(() => null);
  return row?.value || {};
}
function normalizeFeatures(plan) {
  if (!plan) return [];
  if (Array.isArray(plan.features)) return plan.features.map(f => String(f).trim()).filter(Boolean);
  if (plan.features && typeof plan.features === 'object') return Object.entries(plan.features).filter(([,v]) => !!v).map(([k]) => k);
  return [];
}
function normalizeSchoolPlan(raw) {
  const code = normalizePlanCode(raw?.code || raw?.planCode || raw?.name);
  const base = DEFAULT_PLANS[code] || DEFAULT_PLANS.starter;
  return { ...base, ...(raw || {}), code, features: normalizeFeatures(raw).length ? normalizeFeatures(raw) : base.features };
}
async function getPlanDefinitions() {
  const settings = await platformSettings();
  const rawPlans = Array.isArray(settings.schoolPlans) ? settings.schoolPlans : [];
  const configured = rawPlans.map(normalizeSchoolPlan).filter(p => PLAN_CODES.includes(p.code));
  const map = new Map(Object.values(DEFAULT_PLANS).map(p => [p.code, p]));
  configured.forEach(p => map.set(p.code, p));
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
  const code = await getSchoolPlanCode(schoolCode);
  const plan = defs[code] || defs.starter;
  const set = new Set(normalizeFeatures(plan));
  return { planCode: code, plan, features: set, featureList: [...set] };
}
async function hasFeature(schoolCode, feature) {
  const key = String(feature || '').trim();
  if (!key) return false;
  const { features, planCode } = await getSchoolFeatures(schoolCode);
  if (planCode === 'enterprise' && (features.has('*') || DEFAULT_PLANS.enterprise.features.includes(key))) return true;
  return features.has(key);
}
function schoolHasSeniorEnabled(school) {
  const settings = school?.settings || {};
  const text = [settings.schoolStructure, settings.structureType, settings.schoolLevel, settings.enabledLevels, settings.levels, school?.level, school?.type].filter(Boolean).join(' ').toLowerCase();
  if (/primary_only|primary only|junior_only|junior only|pre.?primary/.test(text)) return false;
  if (/senior|secondary|mixed|full|grade\s*1[0-2]|g1[0-2]/.test(text)) return true;
  return !!(settings.hasSeniorSchool || settings.seniorEnabled || settings.seniorSchoolEnabled);
}
async function getSchoolStructure(schoolCode) {
  const school = await School.findOne({ where:{ schoolId:schoolCode } }).catch(() => null);
  return { school, seniorEnabled: schoolHasSeniorEnabled(school) };
}
module.exports = { DEFAULT_PLANS, FEATURE_KEYS, getPlanDefinitions, getSchoolPlanCode, getSchoolFeatures, hasFeature, getSchoolStructure, schoolHasSeniorEnabled, normalizePlanCode };
