'use strict';

function parseDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isFuture(value) {
  const d = parseDate(value);
  return !!d && d.getTime() >= Date.now();
}

function computeSchoolAccess(school) {
  const s = school?.toJSON ? school.toJSON() : (school || {});
  const settings = s.settings || {};
  const billing = settings.billing || {};
  const status = String(s.status || '').toLowerCase();
  const suspended = status === 'suspended' || s.isSuspended === true || s.accessSuspended === true;
  const pilotOn = s.pilotFullAccessEnabled === true || billing.pilotFullAccessEnabled === true;
  const manualOn = s.manualPaymentConfirmed === true || billing.manualPaymentConfirmed === true;
  const verifiedPaid = ['paid','active'].includes(String(s.subscriptionStatus || billing.subscriptionStatus || '').toLowerCase());
  const trialOn = (s.trialAccessEnabled === true || billing.trialAccessEnabled === true) && isFuture(s.trialEndsAt || billing.trialEndsAt);
  const plan = s.subscriptionPlan || billing.subscriptionPlan || 'free';

  if (suspended) return { accessMode:'suspended', accessStatus:'locked', plan, fullAccess:false, reason:s.suspensionReason || 'School suspended', featureLevel:'none' };
  if (pilotOn) return { accessMode:'pilot_full_access', accessStatus:'active', plan:'pilot_full', fullAccess:true, reason:'Pilot Full Access is enabled by super admin', featureLevel:'full' };
  if (manualOn) return { accessMode:'manual_paid', accessStatus:'active', plan, fullAccess: plan === 'premium' || plan === 'enterprise' || plan === 'full', reason:'Manual payment confirmed by super admin', featureLevel: plan || 'paid' };
  if (verifiedPaid) return { accessMode:'paid_subscription', accessStatus:'active', plan, fullAccess: plan === 'premium' || plan === 'enterprise' || plan === 'full', reason:'Verified paid subscription', featureLevel: plan || 'paid' };
  if (trialOn) return { accessMode:'trial', accessStatus:'active', plan:'trial', fullAccess:true, reason:'Trial access is active', featureLevel:'trial' };
  return { accessMode:'default', accessStatus:'limited', plan:'free', fullAccess:false, reason:'No pilot, trial, manual confirmation, or active paid subscription', featureLevel:'default' };
}

function withAccessFields(schoolJson) {
  const access = computeSchoolAccess(schoolJson);
  return { ...schoolJson, access };
}

module.exports = { computeSchoolAccess, withAccessFields };
