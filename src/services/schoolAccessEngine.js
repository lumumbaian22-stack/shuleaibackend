'use strict';
const { normalizePlanCode } = require('./schoolFeatureService');

function parseDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function isFuture(value) {
  const d = parseDate(value);
  return !!d && d.getTime() >= Date.now();
}
function bool(v) { return v === true || String(v || '').toLowerCase() === 'true'; }

function computeSchoolAccess(school) {
  const s = school?.toJSON ? school.toJSON() : (school || {});
  const settings = s.settings || {};
  const billing = settings.billing || {};
  const status = String(s.status || '').toLowerCase();
  const suspended = status === 'suspended' || bool(s.isSuspended) || bool(s.accessSuspended);
  const plan = normalizePlanCode(s.subscriptionPlan || billing.subscriptionPlan || settings.currentPlan || settings.plan || 'starter');
  const subscriptionEnd = s.subscriptionEndsAt || billing.subscriptionEndsAt || s.subscriptionExpiry || billing.subscriptionExpiry || null;
  const subscriptionStillValid = isFuture(subscriptionEnd);
  const pilotOn = bool(s.pilotFullAccessEnabled) || bool(billing.pilotFullAccessEnabled) || /pilot.*full|full.*access|demo|free/.test(String(s.accessMode || billing.accessMode || '').toLowerCase());
  const manualFlag = bool(s.manualPaymentConfirmed) || bool(billing.manualPaymentConfirmed);
  const manualOn = manualFlag && subscriptionStillValid;
  const paidFlag = ['paid','active'].includes(String(s.subscriptionStatus || billing.subscriptionStatus || '').toLowerCase());
  const verifiedPaid = paidFlag && subscriptionStillValid;
  const trialOn = (bool(s.trialAccessEnabled) || bool(billing.trialAccessEnabled)) && isFuture(s.trialEndsAt || billing.trialEndsAt);
  const expiredPaid = paidFlag && subscriptionEnd && !subscriptionStillValid;
  const expiredManual = manualFlag && subscriptionEnd && !subscriptionStillValid;

  if (suspended) return { accessMode:'suspended', accessStatus:'locked', plan, fullAccess:false, reason:s.suspensionReason || 'School suspended', featureLevel:'none' };
  if (pilotOn) return { accessMode:'pilot_full_access', accessStatus:'active', plan:'enterprise', fullAccess:true, reason:'Pilot/Demo/Free Full Access is enabled by Super Admin', featureLevel:'full' };
  if (manualOn) return { accessMode:'manual_paid', accessStatus:'active', plan, fullAccess:false, reason:'Manual payment confirmed by Super Admin until subscription expiry', featureLevel:plan, subscriptionEndsAt: subscriptionEnd };
  if (verifiedPaid) return { accessMode:'paid_subscription', accessStatus:'active', plan, fullAccess:false, reason:'Verified paid subscription until subscription expiry', featureLevel:plan, subscriptionEndsAt: subscriptionEnd };
  if (trialOn) return { accessMode:'trial', accessStatus:'active', plan:'enterprise', fullAccess:true, reason:'Trial access is active', featureLevel:'trial' };
  if (expiredManual || expiredPaid) return { accessMode:'expired_subscription', accessStatus:'locked', plan, fullAccess:false, reason:'Subscription period has expired. Super Admin must renew or approve another payment.', featureLevel:'expired', subscriptionEndsAt: subscriptionEnd };
  return { accessMode:'default', accessStatus:'limited', plan:'starter', fullAccess:false, reason:'No pilot, trial, manual confirmation, or active paid subscription', featureLevel:'starter' };
}
function withAccessFields(schoolJson) {
  const access = computeSchoolAccess(schoolJson);
  return { ...schoolJson, access };
}
module.exports = { computeSchoolAccess, withAccessFields };
