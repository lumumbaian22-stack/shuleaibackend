const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '../..');
const frontendRoot = path.resolve(backendRoot, '../frontend');
const readBackend = file => fs.readFileSync(path.join(backendRoot, file), 'utf8');
const readFrontend = file => fs.readFileSync(path.join(frontendRoot, file), 'utf8');
const {
  dateStringInTimeZone,
  calculateFairness,
  normalizeSchoolPlanCapacity,
  uniqueWorksheetName
} = require('../../src/services/systemNormalizationService');
const studentFactory = require('../../src/models/Student');
const { buildAcademicSummary, normalizeAssessmentSettings } = require('../../src/services/academicSummaryService');
const { getGradeFromScore } = require('../../src/utils/curriculumHelper');

test('v2047 Nairobi date keys do not fall back to the UTC calendar day', () => {
  const instant = new Date('2026-07-28T22:30:00.000Z');
  assert.equal(dateStringInTimeZone(instant), '2026-07-29');
});

test('v2047 duty fairness uses real roster counts and never calls no-data 100 percent fair', () => {
  assert.deepEqual(calculateFairness([0, 0, 0]), {
    score: null,
    mean: 0,
    standardDeviation: 0,
    totalDuties: 0,
    hasDutyData: false
  });
  assert.equal(calculateFairness([10, 10, 10]).score, 100);
  assert.equal(calculateFairness([0, 0, 81, 81]).score, 0);
  assert.equal(calculateFairness([8, 9, 10]).hasDutyData, true);
});

test('v2047 configured subscription capacity wins and unnamed tiers get ordered safe defaults', () => {
  assert.deepEqual(normalizeSchoolPlanCapacity({ limits: { minStudents: 25, maxStudents: 600 } }, 0), {
    minStudents: 25,
    maxStudents: 600
  });
  assert.deepEqual(normalizeSchoolPlanCapacity({}, 0), { minStudents: 1, maxStudents: 400 });
  assert.deepEqual(normalizeSchoolPlanCapacity({}, 1), { minStudents: 401, maxStudents: 800 });
  assert.deepEqual(normalizeSchoolPlanCapacity({}, 2), { minStudents: 801, maxStudents: null });
});

test('v2047 Excel worksheet names are valid and unique even when report section titles repeat', () => {
  const used = new Set(['summary']);
  const first = uniqueWorksheetName('Subject Performance', used);
  const second = uniqueWorksheetName('Subject Performance', used);
  const third = uniqueWorksheetName('Subject Performance: chart/list*?', used);
  assert.equal(first, 'Subject Performance');
  assert.equal(second, 'Subject Performance (2)');
  assert.ok(third.length <= 31);
  assert.doesNotMatch(third, /[\\/*?:[\]]/);
  assert.equal(new Set([first.toLowerCase(), second.toLowerCase(), third.toLowerCase()]).size, 3);
});

test('v2047 compact learner age shows days since the last birthday, not total lifetime days', () => {
  const age = studentFactory.calculateStudentAge('2017-06-01T00:00:00.000Z', new Date(2026, 6, 29, 12, 0, 0));
  assert.equal(age.years, 9);
  assert.equal(age.compactDays, 58);
  assert.equal(age.compact, '9 years, 58 days old');
  assert.ok(age.compactDays < 366);
});

test('v2047 frontend prevents stale child data and exposes complete report-review identities', () => {
  const parent = readFrontend('js/parent-dashboard.js');
  const admin = readFrontend('js/admin-dashboard.js');
  const dashboard = readFrontend('js/dashboard-controller.js');
  assert.match(parent, /parentChildSwitchGeneration/);
  assert.match(parent, /dashboardData\.selectedChild = null/);
  assert.match(parent, /switchGeneration !== parentChildSwitchGeneration/);
  assert.match(parent, /hasPublishedReport/);
  assert.match(admin, /getStudents\(\{\s*page:\s*1,\s*limit:\s*200\s*\}\)/);
  assert.match(admin, /s\.elimuid/);
  assert.match(dashboard, /'report-comments-admin': 'Review Report Comments'/);
});

test('v2047 analytics export skips duplicate KPI worksheet and allocates unique worksheet names', () => {
  const analytics = readBackend('src/controllers/analyticsV152Controller.js');
  assert.match(analytics, /usedSheetNames=new Set\(\['summary'\]\)/);
  assert.match(analytics, /sections\.filter\(section=>section!=='kpis'\)/);
  assert.match(analytics, /uniqueWorksheetName\(humanSection\(key\),usedSheetNames\)/);
});

test('v2047 one academic engine normalizes mislabeled assessment types and weights subjects once', () => {
  const settings = normalizeAssessmentSettings([
    { key:'cat', label:'CAT', assessmentType:'CAT', countInFinal:true, weight:30 },
    { key:'endterm', label:'End Term', assessmentType:'Opener', countInFinal:true, weight:50 }
  ]);
  assert.equal(settings.find(row => row.label === 'End Term').assessmentType, 'endterm');
  assert.equal(Math.round(settings.reduce((sum, row) => sum + row.weight, 0)), 100);
  const summary = buildAcademicSummary([
    { studentId:1, subject:'Mathematics', assessmentType:'CAT', score:60 },
    { studentId:1, subject:'Mathematics', assessmentName:'End Term', score:80 },
    { studentId:1, subject:'English', assessmentType:'CAT', score:90 },
    { studentId:1, subject:'English', assessmentName:'End Term', score:90 }
  ], { assessmentSettings:settings, gradeFromScore:score => score >= 80 ? 'A' : 'B' });
  assert.equal(summary.subjects.find(row => row.subject === 'Mathematics').average, 72.5);
  assert.equal(summary.subjects.find(row => row.subject === 'English').average, 90);
  assert.equal(summary.overallAverage, 81.25);
  assert.equal(summary.overallGrade, 'A');
});

test('v2047 finance keeps ledger, balances, and quarantine as separate explicit views', () => {
  const finance = readFrontend('js/finance-fees.js');
  assert.match(finance, /manualQuarantine/);
  assert.match(finance, /function renderRecords\(\)/);
  assert.match(finance, /function renderBalances\(\)/);
  assert.match(finance, /Quarantined legacy records/);
  assert.match(finance, /Quarantined — action disabled/);
  assert.match(finance, /state\.tab==='records'\)return renderRecords\(\)/);
  assert.match(finance, /state\.tab==='balances'\)return renderBalances\(\)/);
  assert.match(finance, /Active & parent ready/);
  assert.match(finance, /Setup incomplete/);
  assert.match(finance, /structureStudentCount/);
});

test('v2047 parent-teacher conversations are canonical and scoped to the selected child', () => {
  const api = readFrontend('js/api.js');
  const chat = readFrontend('js/chat-v9-ui.js');
  const teacherMessages = readBackend('src/controllers/teacherMessageController.js');
  const parentDirectory = readBackend('src/controllers/chatController.js');
  assert.match(api, /getParentMessages:\s*\(parentId,\s*params\s*=\s*\{\}\)/);
  assert.match(chat, /getParentMessages\(v9ChatState\.selectedParent\.userId,\s*\{\s*studentId:/);
  assert.match(chat, /studentId:v9ChatState\.selectedParent\.studentId\|\|null/);
  assert.match(teacherMessages, /req\.query\.studentId\s*\|\|\s*req\.query\.childId/);
  assert.match(teacherMessages, /\['parent_class_teacher',\s*schoolCode\s*\|\|\s*'school',\s*studentId\s*\|\|\s*'student',\s*parentUserId/);
  assert.match(parentDirectory, /Always fold legacy keys into the canonical child-specific key/);
});

test('v2047 duty and department displays use current relationship records', () => {
  const duty = readBackend('src/controllers/dutyController.js');
  const fairness = readBackend('src/utils/dutyFairness.js');
  const departments = readBackend('src/controllers/chatV9Controller.js');
  const teacher = readBackend('src/controllers/teacherController.js');
  assert.match(duty, /DutyRoster\.findAll/);
  assert.match(duty, /monthlyDutyCount:\s*counts\.monthly/);
  assert.match(duty, /weeklyDutyCount:\s*counts\.weekly/);
  assert.match(duty, /status\s*=\s*totalMonthly\s*===\s*0\s*\?\s*'not_scheduled'/);
  assert.match(fairness, /monthlyDutyCount:\s*teacherDutyCounts\[teacher\.id\]\s*\|\|\s*0/);
  assert.match(departments, /syncTeacherLabels/);
  assert.match(departments, /resolvedHeadTeacherId/);
  assert.match(teacher, /departmentMembershipService\.displayLabel/);
});

test('v2047 homework creation is limited to the teacher assignment graph', () => {
  const homework = readBackend('src/controllers/homeworkController.js');
  assert.match(homework, /resolveTeacherAssignedClasses/);
  assert.match(homework, /You can assign homework only to a class assigned to you/);
  assert.match(homework, /You can assign homework only for a subject assigned to you in this class/);
  assert.match(homework, /resolvedClassId\s*=\s*classItem\.id/);
});

test('v2047 report grading, timetable, profile export, birthdays, and alerts share canonical behavior', () => {
  const parent = readBackend('src/controllers/parentController.js');
  const timetable = readFrontend('js/timetable.js');
  const user = readBackend('src/controllers/userController.js');
  const birthday = readBackend('src/controllers/birthdayController.js');
  const notifications = readFrontend('js/notifications.js');
  assert.equal(getGradeFromScore(74, 'cbc', 'secondary'), 'B+');
  assert.match(parent, /curriculumHelper\.getGradeFromScore/);
  assert.match(parent, /school\?\.settings\?\.curriculumEngine\?\.assessmentSettings/);
  assert.match(timetable, /\/api\/timetable\/teacher\/me/);
  assert.match(user, /const exportData\s*=\s*\{\s*account:\s*user\.getPublicProfile\(\)\s*\}/);
  assert.match(user, /new Map\(children\.map/);
  assert.match(birthday, /settings\.requireVerifiedDateOfBirth\s*!==\s*false/);
  assert.match(notifications, /return 'Messages'/);
});

test('v2047 build identity is aligned and expected navigation aborts stay silent', () => {
  const app = readBackend('src/app.js');
  const contractAudit = readBackend('scripts/checkSystemContracts.js');
  const routeManifest = JSON.parse(readBackend('ROUTE_MANIFEST.json'));
  const index = readFrontend('index.html');
  const version = readFrontend('SHULE_AI_VERSION.txt').trim();
  const apiManifest = JSON.parse(readFrontend('API_CALL_MANIFEST.json'));
  const appHealth = readFrontend('js/app-health.js');
  const errorMonitoring = readFrontend('js/error-monitoring.js');
  const serviceWorker = readFrontend('service-worker.js');
  const teacher = readFrontend('js/teacher-dashboard.js');
  const admin = readFrontend('js/admin-dashboard.js');
  const analytics = readFrontend('js/analytics-dashboard.js');
  assert.match(app, /build:\s*'v2047-grounded-system-repair'/);
  assert.match(index, /SHULE_BUILD_VERSION="2047-grounded-system-repair"/);
  assert.match(appHealth, /BUILD\s*=\s*'2047-grounded-system-repair'/);
  assert.match(errorMonitoring, /'2047-grounded-system-repair'/);
  assert.match(serviceWorker, /shule-ai-2047-grounded-system-repair/);
  assert.equal(version, '2047-grounded-system-repair');
  assert.equal(routeManifest.build, '2047-grounded-system-repair');
  assert.equal(apiManifest.build, '2047-grounded-system-repair');
  assert.match(contractAudit, /const build = '2047-grounded-system-repair'/);
  assert.doesNotMatch(index, /2046-system-integrity-release/);
  assert.match(teacher, /if\s*\(error\?\.name\s*===\s*'AbortError'\)\s*throw error/);
  assert.match(admin, /if\s*\(error\?\.name\s*===\s*'AbortError'\)\s*throw error/);
  assert.match(analytics, /if\(error\?\.name==='AbortError'\)throw error/);
});

test('v2047 fresh PostgreSQL bootstrap avoids incompatible fee keys and index-name collisions', () => {
  const models = readBackend('src/models/index.js');
  const snapshots = readBackend('src/models/ReportSnapshot.js');
  assert.match(models, /FeeStructure\.hasMany\(Fee,\s*\{\s*foreignKey:\s*'feeStructureId',\s*sourceKey:\s*'id',\s*constraints:\s*false\s*\}\)/);
  const names = [...snapshots.matchAll(/\bname:\s*'([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(names, [
    'report_snapshots_scope_version_uq',
    'report_snapshots_term_year_idx',
    'report_snapshots_student_idx'
  ]);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.every(name => name.length <= 63));
});

test('v2047 retired async job routes never acknowledge unprocessable work', () => {
  const routes = readBackend('src/routes/jobRoutes.js');
  const worker = readBackend('src/workers/jobWorker.js');
  assert.match(routes, /ASYNC_JOB_ROUTE_RETIRED/);
  assert.doesNotMatch(routes, /enqueueJob/);
  assert.doesNotMatch(routes, /res\.status\(202\)/);
  assert.match(worker, /const handlers = Object\.freeze\(\{\}\)/);
  assert.doesNotMatch(worker, /handler is not implemented/);
});
