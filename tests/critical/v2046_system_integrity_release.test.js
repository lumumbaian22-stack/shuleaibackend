const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const backendRoot = path.resolve(__dirname, '../..');
const frontendRoot = path.resolve(backendRoot, '../frontend');
const readBackend = file => fs.readFileSync(path.join(backendRoot, file), 'utf8');
const readFrontend = file => fs.readFileSync(path.join(frontendRoot, file), 'utf8');
const { classifyPaymentIntegrity } = require('../../src/services/paymentIntegrityService');

function loadHomeTaskController(models, ownership = {}) {
  const module = { exports: {} };
  const source = readBackend('src/controllers/homeTaskController.js');
  const localRequire = request => {
    if (request === '../models') return models;
    if (request === '../services/parentOwnershipService') return ownership;
    return require(request);
  };
  const factory = vm.runInNewContext(`(function(require, module, exports) { ${source}\n})`, {
    console,
    Date,
    Math,
    Number,
    Promise,
    String
  });
  factory(localRequire, module, module.exports);
  return module.exports;
}

test('v2046 finance integrity accepts a valid payment and quarantines corrupt legacy rows', () => {
  const Fee = { id: 10, studentId: 20, schoolCode: 'SCH-1', totalAmount: 15778 };
  const valid = classifyPaymentIntegrity({
    id: 1, studentId: 20, schoolCode: 'SCH-1', amount: 7889, status: 'pending', Fee
  });
  assert.equal(valid.integrityValid, true);
  assert.equal(valid.parentVisible, true);
  assert.equal(valid.verificationActionable, true);

  for (const payment of [
    { id: 2, studentId: 20, schoolCode: 'SCH-1', amount: 56453, status: 'approved', Fee },
    { id: 3, studentId: 21, schoolCode: 'SCH-1', amount: 1000, status: 'pending', Fee },
    { id: 4, studentId: 20, schoolCode: 'SCH-2', amount: 1000, status: 'pending', Fee },
    { id: 5, studentId: 20, schoolCode: 'SCH-1', amount: 1000, status: 'pending', Fee: null },
    { id: 6, studentId: 20, schoolCode: 'SCH-1', amount: 1000, status: 'pending', Fee, metadata: { integrityStatus: 'quarantined' } }
  ]) {
    const result = classifyPaymentIntegrity(payment);
    assert.equal(result.integrityValid, false);
    assert.equal(result.parentVisible, false);
    assert.equal(result.verificationActionable, false);
    assert.ok(result.integrityReason);
  }
});

test('v2046 home-task completion is role-scoped, transactional, locked, and idempotent', () => {
  const routes = readBackend('src/routes/homeTaskRoutes.js');
  const controller = readBackend('src/controllers/homeTaskController.js');
  const api = readFrontend('js/api.js');
  assert.match(routes, /authorize\('parent',\s*'student'\)/);
  assert.match(controller, /sequelize\.transaction/);
  assert.match(controller, /transaction\.LOCK\.UPDATE/);
  assert.match(controller, /\['completed','submitted','graded','reviewed'\]/);
  assert.match(controller, /ownership\.ownsStudentId/);
  assert.match(controller, /assignmentId/);
  assert.match(controller, /Task assignment belongs to another school/);
  assert.match(controller, /required:\s*true,\s*where:\s*\{\s*\[Op\.or\]:\s*\[\{\s*schoolCode:\s*req\.user\.schoolCode\s*\},\s*\{\s*schoolCode:\s*null\s*\}\]/);
  assert.match(api, /encodeURIComponent\(assignmentId\)/);
});

test('v2046 home-task completion awards points once in the exercised controller path', async () => {
  let assignmentSaves = 0;
  let studentSaves = 0;
  const assignment = {
    id: 44,
    studentId: 9,
    taskId: 12,
    schoolCode: 'SCHOOL-1',
    status: 'pending',
    async save() { assignmentSaves += 1; }
  };
  const student = {
    id: 9,
    userId: 5,
    points: 7,
    async save() { studentSaves += 1; }
  };
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const controller = loadHomeTaskController({
    sequelize: { transaction: callback => callback(transaction) },
    HomeTaskAssignment: {
      findByPk: async (id, options) => {
        assert.equal(Number(id), 44);
        assert.equal(options.lock, 'UPDATE');
        return assignment;
      }
    },
    HomeTask: { findByPk: async () => ({ id: 12, schoolCode: 'SCHOOL-1', points: 10 }) },
    Student: {
      findOne: async ({ where, lock }) => {
        if (where.userId) return student;
        assert.equal(lock, 'UPDATE');
        return student;
      }
    },
    Parent: {},
    User: {},
    Competency: {},
    LearningOutcome: {},
    StudentCompetencyProgress: {},
    AcademicRecord: {}
  });

  const invoke = async () => {
    let statusCode = 200;
    let body;
    await controller.completeTask({
      params: { id: '44' },
      body: { studentFeedback: { note: 'Done' } },
      user: { id: 5, role: 'student', schoolCode: 'SCHOOL-1' }
    }, {
      status(code) { statusCode = code; return this; },
      json(payload) { body = payload; return this; }
    });
    return { statusCode, body };
  };

  const first = await invoke();
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.success, true);
  assert.equal(first.body.data.alreadyCompleted, false);
  assert.equal(first.body.data.studentPoints, 17);
  assert.equal(assignmentSaves, 1);
  assert.equal(studentSaves, 1);

  const second = await invoke();
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.data.alreadyCompleted, true);
  assert.equal(second.body.data.studentPoints, 17);
  assert.equal(assignmentSaves, 1);
  assert.equal(studentSaves, 1);
});

test('v2046 dashboards reject stale role renders and stop old-role realtime refreshes', () => {
  const dashboard = readFrontend('js/dashboard-controller.js');
  const handlers = readFrontend('js/realtime-handlers.js');
  const auth = readFrontend('js/auth.js');
  assert.match(dashboard, /__shuleSectionRenderGeneration/);
  assert.match(dashboard, /requestedRole !== normalizeDashboardRole\(currentRole\)/);
  assert.match(handlers, /if\(currentRole==='parent'\)/);
  assert.match(handlers, /if\(\['admin','finance_officer','super_admin','superadmin'\]\.includes\(currentRole\)\)/);
  assert.doesNotMatch(handlers, /Promise\.allSettled\(\[call\('refreshStudentsList'\),call\('refreshMyStudents'\)/);
  assert.match(auth, /__shuleSectionAbortController\?\.abort/);
  assert.match(auth, /ShuleRealtimeStore\?\.reset/);
});

test('v2046 canonical student identity uses Student.id and preserves ELIMUID', () => {
  const auth = readFrontend('js/auth.js');
  const reports = readFrontend('js/helpers.js');
  const backendAuth = readBackend('src/controllers/authController.js');
  assert.match(auth, /userData\.studentId = profile\.id/);
  assert.match(auth, /userData\.elimuid = profile\.elimuid/);
  assert.match(reports, /user\.studentId \|\| user\.student\?\.id/);
  assert.doesNotMatch(reports, /return Number\(user\?\.id/);
  assert.match(backendAuth, /publicProfileForRole/);
});

test('v2046 timetable and classroom chat never fall back to a same-grade stream', () => {
  const timetable = readBackend('src/controllers/timetableController.js');
  const chat = readBackend('src/controllers/chatV9Controller.js');
  const analytics = readBackend('src/controllers/analyticsV152Controller.js');
  assert.doesNotMatch(timetable, /sameText\(c\.grade,\s*cls\.grade\)/);
  assert.doesNotMatch(chat, /sameGrade/);
  assert.match(chat, /thread\.classId !== undefined && thread\.classId !== null/);
  assert.match(chat, /expectedName && legacyName && expectedName === legacyName/);
  assert.match(analytics, /String\(lesson\.classId\) === expectedId/);
  assert.doesNotMatch(analytics.slice(analytics.indexOf('function exactStudentTimetableSlots'), analytics.indexOf('function attendanceHeatmap')), /grade/);
});

test('v2046 homework reads preserve the assigned audience snapshot', () => {
  const source = readBackend('src/controllers/homeworkController.js');
  assert.match(source, /if \(!count\) await ensureHomeworkAssignmentsForTask/);
  assert.match(source, /if \(!existingAssignmentCount\) await ensureHomeworkAssignmentsForTask/);
  assert.doesNotMatch(source, /ensureHomeworkAssignmentsForStudent/);
});

test('v2046 rewards, student dashboard, and analytics share one gamification service', () => {
  const service = readBackend('src/services/studentGamificationService.js');
  const dashboard = readBackend('src/controllers/studentController.js');
  const rewards = readBackend('src/controllers/gamificationController.js');
  const analytics = readBackend('src/controllers/analyticsV152Controller.js');
  assert.match(service, /\['completed',\s*'submitted',\s*'graded',\s*'reviewed'\]/);
  assert.match(service, /attendanceRate === null \? 'Waiting for records' : 'Reach 95%'/);
  for (const source of [dashboard, rewards, analytics]) {
    assert.match(source, /getStudentGamificationSummary/);
  }
});

test('v2046 frontend uses compiled Tailwind and pinned browser dependencies', () => {
  const html = readFrontend('index.html');
  assert.match(html, /css\/tailwind\.css\?v=2046-system-integrity-release/);
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com/);
  assert.doesNotMatch(html, /lucide@latest/);
  assert.match(html, /lucide@1\.27\.0\/dist\/umd\/lucide\.min\.js/);
  assert.match(html, /chart\.js@4\.5\.1/);
  assert.ok(fs.statSync(path.join(frontendRoot, 'css/tailwind.css')).size > 10000);
  assert.doesNotMatch(readFrontend('js/teacher-dashboard.js'), /data-lucide="users-x"/);
});

test('v2046 live teacher surfaces contain no fake attendance or dead task success path', () => {
  const dashboard = readFrontend('js/teacher-dashboard.js');
  const management = readFrontend('js/teacher-student-management.js');
  assert.doesNotMatch(dashboard, /attendancePercentage\s*\|\|\s*100/);
  assert.doesNotMatch(management, /attendancePercentage\s*\|\|\s*(?:95|100)/);
  assert.doesNotMatch(management, /Add task feature coming soon/);
  assert.match(dashboard, /api\.tasks\.createTask/);
});

test('v2046 gamification attendance excludes holidays and school-scopes stored badges', () => {
  const service = readBackend('src/services/studentGamificationService.js');
  assert.match(service, /status:\s*\{\s*\[Op\.ne\]:\s*'holiday'\s*\}/);
  assert.match(service, /where:\s*\{\s*schoolId:\s*schoolCode\s*\}/);
});

test('v2046 child selection, alerts, and realtime cursors are account scoped', () => {
  const parent = readFrontend('js/parent-dashboard.js');
  const notifications = readFrontend('js/notifications.js');
  const realtime = readFrontend('js/realtime-store.js');
  assert.match(parent, /parentSelectedChildStorageKey/);
  assert.match(parent, /schoolCode/);
  assert.match(notifications, /resetAlertsForSession/);
  assert.match(realtime, /cursorKey/);
  assert.match(realtime, /user\.id/);
  assert.match(realtime, /schoolCode/);
});

test('v2046 learner exports omit school-only executive intelligence', () => {
  const analytics = readBackend('src/controllers/analyticsV152Controller.js');
  assert.match(analytics, /showIntelligencePanel = \['platform','school'\]\.includes\(variant\)/);
  assert.match(analytics, /data\.showIntelligencePanel\?/);
  assert.match(analytics, /if\(data\.showIntelligencePanel\)/);
});
