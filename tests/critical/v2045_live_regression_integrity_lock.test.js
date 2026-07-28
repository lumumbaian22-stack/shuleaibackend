const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const frontend = path.resolve(root, '../frontend');
const readBackend = file => fs.readFileSync(path.join(root, file), 'utf8');
const readFrontend = file => fs.readFileSync(path.join(frontend, file), 'utf8');

test('v2045 parent dashboard currency rendering cannot reference undefined data', () => {
  const source = readFrontend('js/parent-dashboard.js');
  assert.doesNotMatch(source, /formatParentMoney\(feeBalance,\s*data\./);
  assert.match(source, /selectedChildSummary\.currency/);
});

test('v2045 role transitions abort old requests and reject stale section renders', () => {
  const api = readFrontend('js/api.js');
  const dashboard = readFrontend('js/dashboard-controller.js');
  assert.match(api, /__shuleRoleAbortController\?\.signal/);
  assert.match(api, /error\?\.name === 'AbortError'/);
  assert.match(dashboard, /__shuleSectionRenderGeneration/);
  assert.match(dashboard, /requestedRole !== normalizeDashboardRole\(currentRole\)/);
});

test('v2045 timetable scoping never falls back to another stream by grade', () => {
  const source = readBackend('src/controllers/timetableController.js');
  const matcher = source.slice(source.indexOf('function findClassBlock'), source.indexOf('function findUsableClassBlock'));
  assert.doesNotMatch(matcher, /sameText\(c\.grade,\s*cls\.grade\)/);
  assert.match(matcher, /className \|\| c\.name/);
});

test('v2045 chat is bounded and participant identities are deduplicated', () => {
  const ui = readFrontend('js/chat-v9-ui.js');
  const controller = readBackend('src/controllers/chatV9Controller.js');
  assert.match(ui, /Promise\.race/);
  assert.match(ui, /8000/);
  assert.match(controller, /new Map\(participants\.map/);
  assert.match(controller, /new Map\(\s*classmates/);
});

test('v2045 finance history requires a valid matching fee and blocks overpayment', () => {
  const source = readBackend('src/services/financeLedgerService.js');
  assert.match(source, /Amount exceeds this student's remaining fee balance/);
  assert.match(source, /\{ model: Fee, required: true, where: \{ studentId, schoolCode \} \}/);
});

test('v2045 student progress and rewards use canonical dashboard values', () => {
  const controller = readBackend('src/controllers/studentController.js');
  const ui = readFrontend('js/student-dashboard-extended.js');
  assert.match(controller, /getStudentGamificationSummary\(student,\s*req\.user\.schoolCode\)/);
  assert.match(controller, /points: Number\(gamification\.summary\.totalPoints\) \|\| 0/);
  assert.match(controller, /gamification\.summary\.attendanceRate/);
  assert.match(ui, /\/api\/gamification\/my-summary/);
  assert.match(ui, /data\.stats\?\.attendanceRate/);
});

test('v2045 analytics follows parent child choice and populated teacher class', () => {
  const ui = readFrontend('js/analytics-dashboard.js');
  const controller = readBackend('src/controllers/analyticsV152Controller.js');
  assert.match(ui, /params\.set\('childId', selectedChildId\)/);
  assert.match(controller, /studentCounts\.get\(b\)/);
});
