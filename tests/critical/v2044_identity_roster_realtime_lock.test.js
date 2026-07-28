const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const frontend = path.resolve(root, '../frontend');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const readFront = file => fs.readFileSync(path.join(frontend, file), 'utf8');

test('v2044 student dashboard returns and renders canonical identity', () => {
  const controller = read('src/controllers/studentController.js');
  const auth = readFront('js/auth.js');
  const ui = readFront('js/student-dashboard-extended.js');
  assert.match(controller, /elimuid:\s*student\.elimuid/);
  assert.match(controller, /resolveStudentClass\(student,\s*req\.user\.schoolCode\)/);
  assert.match(auth, /studentProfile\.elimuid/);
  assert.doesNotMatch(ui, /\|\|\s*'ELI-2024-001'/);
});

test('v2044 logout removes every role and clears role-scoped state', () => {
  const auth = readFront('js/auth.js');
  const shell = readFront('js/dashboard-controller.js');
  assert.match(auth, /role-finance_officer/);
  assert.match(auth, /window\.__teacherAssignments\s*=\s*null/);
  assert.match(shell, /classList\.remove\('role-admin',\s*'role-finance_officer'/);
});

test('v2044 admin roster uses pagination totals and class IDs', () => {
  const controller = read('src/controllers/adminController.js');
  const ui = readFront('js/admin-dashboard.js');
  assert.match(controller, /activeEnrollment:/);
  assert.match(controller, /counts\s*=\s*\{/);
  assert.match(ui, /pagination\?\.total/);
  assert.match(ui, /studentsByClassId/);
  assert.doesNotMatch(ui, /studentsByGrade/);
});

test('v2044 realtime client is complete and exposes lifecycle methods', () => {
  const realtime = readFront('js/realtime-client.js');
  assert.match(realtime, /window\.ShuleRealtime\s*=\s*Object\.freeze/);
  assert.match(realtime, /connect,/);
  assert.match(realtime, /disconnect,/);
  assert.match(realtime, /recover,/);
  assert.doesNotMatch(realtime, /;cons\s*$/);
});

test('v2044 migration enforces one active enrollment', () => {
  const migration = read('src/migrations/20260728000000-v2044-canonical-identity-roster-lock.js');
  assert.match(migration, /ROW_NUMBER\(\) OVER/);
  assert.match(migration, /student_enrollments_one_active_per_school_student/);
  assert.match(migration, /WHERE status = 'active'/);
});
