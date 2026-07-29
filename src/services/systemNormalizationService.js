'use strict';

const DEFAULT_TIME_ZONE = 'Africa/Nairobi';
const SCHOOL_PLAN_CAPACITY_DEFAULTS = [
  { minStudents: 1, maxStudents: 400 },
  { minStudents: 401, maxStudents: 800 },
  { minStudents: 801, maxStudents: null }
];

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateStringInTimeZone(value = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function calculateFairness(counts = []) {
  const values = counts.map(finiteNumber).filter(value => value !== null && value >= 0);
  const totalDuties = values.reduce((sum, value) => sum + value, 0);
  if (!values.length || totalDuties === 0) {
    return { score: null, mean: 0, standardDeviation: 0, totalDuties, hasDutyData: false };
  }
  const mean = totalDuties / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  const standardDeviation = Math.sqrt(variance);
  const score = Math.max(0, Math.min(100, 100 - ((standardDeviation / mean) * 100)));
  return {
    score: Math.round(score * 10) / 10,
    mean,
    standardDeviation,
    totalDuties,
    hasDutyData: true
  };
}

function normalizeSchoolPlanCapacity(plan = {}, index = 0) {
  const limits = plan.limits && typeof plan.limits === 'object' ? plan.limits : {};
  const defaults = SCHOOL_PLAN_CAPACITY_DEFAULTS[Math.min(Math.max(Number(index) || 0, 0), SCHOOL_PLAN_CAPACITY_DEFAULTS.length - 1)];
  const explicitMin = finiteNumber(plan.minStudents ?? limits.minStudents);
  const explicitMax = finiteNumber(plan.maxStudents ?? limits.maxStudents);
  const minStudents = explicitMin !== null && explicitMin >= 0 ? explicitMin : defaults.minStudents;
  let maxStudents = explicitMax !== null && explicitMax >= 0 ? explicitMax : defaults.maxStudents;
  if (maxStudents !== null && maxStudents < minStudents) maxStudents = minStudents;
  return { ...limits, minStudents, maxStudents };
}

function uniqueWorksheetName(value, usedNames = new Set(), fallback = 'Analytics') {
  const clean = String(value || fallback).replace(/[\\/*?:[\]]/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
  let suffix = '';
  let attempt = 1;
  let candidate = clean.slice(0, 31).trim() || fallback;
  while (usedNames.has(candidate.toLowerCase())) {
    attempt += 1;
    suffix = ` (${attempt})`;
    candidate = `${clean.slice(0, Math.max(1, 31 - suffix.length)).trim()}${suffix}`;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

module.exports = {
  DEFAULT_TIME_ZONE,
  dateStringInTimeZone,
  calculateFairness,
  normalizeSchoolPlanCapacity,
  uniqueWorksheetName
};
