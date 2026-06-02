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
  const plan = s.subscriptionPlan || billing.subscriptionPlan || 'free';
  const subscriptionEnd = s.subscriptionEndsAt || billing.subscriptionEndsAt || s.subscriptionExpiry || billing.subscriptionExpiry || null;
  const subscriptionStillValid = isFuture(subscriptionEnd);
  const manualFlag = s.manualPaymentConfirmed === true || billing.manualPaymentConfirmed === true;
  const manualOn = manualFlag && subscriptionStillValid;
  const paidFlag = ['paid','active'].includes(String(s.subscriptionStatus || billing.subscriptionStatus || '').toLowerCase());
  const verifiedPaid = paidFlag && subscriptionStillValid;
  const trialOn = (s.trialAccessEnabled === true || billing.trialAccessEnabled === true) && isFuture(s.trialEndsAt || billing.trialEndsAt);
  const expiredPaid = paidFlag && subscriptionEnd && !subscriptionStillValid;
  const expiredManual = manualFlag && subscriptionEnd && !subscriptionStillValid;

  if (suspended) return { accessMode:'suspended', accessStatus:'locked', plan, fullAccess:false, reason:s.suspensionReason || 'School suspended', featureLevel:'none' };
  if (pilotOn) return { accessMode:'pilot_full_access', accessStatus:'active', plan:'pilot_full', fullAccess:true, reason:'Pilot Full Access is enabled by super admin', featureLevel:'full' };
  if (manualOn) return { accessMode:'manual_paid', accessStatus:'active', plan, fullAccess: plan === 'premium' || plan === 'enterprise' || plan === 'full', reason:'Manual payment confirmed by super admin until subscription expiry', featureLevel: plan || 'paid', subscriptionEndsAt: subscriptionEnd };
  if (verifiedPaid) return { accessMode:'paid_subscription', accessStatus:'active', plan, fullAccess: plan === 'premium' || plan === 'enterprise' || plan === 'full', reason:'Verified paid subscription until subscription expiry', featureLevel: plan || 'paid', subscriptionEndsAt: subscriptionEnd };
  if (trialOn) return { accessMode:'trial', accessStatus:'active', plan:'trial', fullAccess:true, reason:'Trial access is active', featureLevel:'trial' };
  if (expiredManual || expiredPaid) return { accessMode:'expired_subscription', accessStatus:'locked', plan, fullAccess:false, reason:'Subscription period has expired. Super admin must renew or approve another payment.', featureLevel:'expired', subscriptionEndsAt: subscriptionEnd };
  return { accessMode:'default', accessStatus:'limited', plan:'free', fullAccess:false, reason:'No pilot, trial, manual confirmation, or active paid subscription', featureLevel:'default' };
}

function withAccessFields(schoolJson) {
  const access = computeSchoolAccess(schoolJson);
  return { ...schoolJson, access };
}

module.exports = { computeSchoolAccess, withAccessFields };
