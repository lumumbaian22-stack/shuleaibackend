const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const routeFile = path.join(root, 'backend/src/routes/tutorRoutes.js');
const controllerFile = path.join(root, 'backend/src/controllers/tutorController.js');
const aiProviderFile = path.join(root, 'backend/src/services/aiProviderService.js');
const knowledgeFile = path.join(root, 'backend/src/services/tutor/tutorKnowledge.js');
const commandFile = path.join(root, 'backend/src/services/tutor/commandDetector.js');
const apiFile = path.join(root, 'frontend/js/api.js');
const studentUiFile = path.join(root, 'frontend/js/student-dashboard-extended.js');

test('v2031 tutor onboarding and suggestions routes exist', () => {
  const routes = fs.readFileSync(routeFile, 'utf8');
  const controller = fs.readFileSync(controllerFile, 'utf8');
  assert.match(routes, /router\.get\('\/onboarding',[\s\S]*tutor\.getOnboarding\)/);
  assert.match(routes, /router\.post\('\/onboarding\/complete',[\s\S]*tutor\.completeOnboarding\)/);
  assert.match(routes, /router\.get\('\/suggestions',[\s\S]*tutor\.getSuggestions\)/);
  assert.match(controller, /aiTutorOnboardingCompleted/);
  assert.match(controller, /buildStudentLearningContext/);
});

test('v2031 AI prompt locks complete answers, study-ahead, projects, and safety', () => {
  const ai = fs.readFileSync(aiProviderFile, 'utf8');
  assert.match(ai, /do not ask the learner what class they are in unless the backend context says it is missing/i);
  assert.match(ai, /complete process/i);
  assert.match(ai, /Students may study ahead/i);
  assert.match(ai, /Help with school projects by guiding/i);
  assert.match(ai, /Do not provide dangerous experiments/i);
});

test('v2031 local tutor fallback supports project, study-ahead, safety, cheating, and complete maths flow', () => {
  const knowledge = fs.readFileSync(knowledgeFile, 'utf8');
  const command = fs.readFileSync(commandFile, 'utf8');
  assert.match(command, /project/);
  assert.match(command, /study_ahead/);
  assert.match(command, /cheating/);
  assert.match(command, /unsafe/);
  assert.match(knowledge, /Project plan/);
  assert.match(knowledge, /Level 1: Simple explanation/);
  assert.match(knowledge, /Step-by-step solution/);
  assert.match(knowledge, /I can guide you, not help you copy/);
});

test('v2031 frontend tutor API and UI expose onboarding, project prompts, and safe study-ahead', () => {
  const api = fs.readFileSync(apiFile, 'utf8');
  const ui = fs.readFileSync(studentUiFile, 'utf8');
  assert.match(api, /getOnboarding:\s*\(\)\s*=>\s*apiRequest\('\/api\/tutor\/onboarding'/);
  assert.match(api, /completeOnboarding/);
  assert.match(api, /getSuggestions/);
  assert.match(ui, /ai-onboarding-v2031/);
  assert.match(ui, /Project help/);
  assert.match(ui, /Study ahead/);
  assert.match(ui, /teach me the advanced version/i);
});
