'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const appRoot = path.resolve(root, '..');
const readBackend = file => fs.readFileSync(path.join(root, file), 'utf8');
const readApp = file => fs.readFileSync(path.join(appRoot, file), 'utf8');

test('teacher report workflow exposes the gradebook API method it calls', () => {
  assert.match(readApp('frontend/js/api.js'), /getClassGradebook:\s*\(params/);
  assert.match(readApp('frontend/js/teacher-dashboard.js'), /api\.teacher\.getClassGradebook/);
});

test('API wrapper refreshes once on 401 and consent failures remain closed', () => {
  const api = readApp('frontend/js/api.js');
  assert.match(api, /response\.status === 401[\s\S]*refreshAuthToken\(\)[\s\S]*_authRetried: true/);
  const dashboard = readApp('frontend/js/dashboard-controller.js');
  assert.doesNotMatch(dashboard, /Consent check error:[\s\S]{0,180}return true/);
});

test('parental consent requires parent role and verified child ownership', () => {
  assert.match(readBackend('src/routes/consentRoutes.js'), /parental-consent', authorize\('parent'\)/);
  assert.match(readBackend('src/controllers/consentController.js'), /assertParentOwnsStudent\(\{ parentUserId: req\.user\.id, studentId \}\)/);
});

test('messages have first-class tenant and conversation columns with backfill migration', () => {
  const model = readBackend('src/models/Message.js');
  assert.match(model, /schoolCode:/);
  assert.match(model, /conversationId:/);
  const migration = readBackend('src/migrations/20260722020000-v2038-message-tenant-conversation-lock.js');
  assert.match(migration, /metadata"->>'schoolCode'/);
  assert.match(migration, /idx_messages_conversation_unread/);
});

test('conversation reads update only already-authorized scoped message IDs', () => {
  for (const file of ['src/controllers/parentMessageController.js', 'src/controllers/teacherMessageController.js']) {
    const source = readBackend(file);
    assert.match(source, /scopedIds/);
    assert.match(source, /id:\s*\{ \[Op\.in\]: scopedIds \}/);
  }
});

test('unfinished LearnFeed and worker operations cannot report fake success', () => {
  const feed = readBackend('src/controllers/learnFeedController.js');
  assert.match(feed, /FEATURE_NOT_IMPLEMENTED/);
  assert.doesNotMatch(feed, /exports\.withdraw[\s\S]{0,160}status: 'requested'/);
  const worker = readBackend('src/workers/jobWorker.js');
  assert.doesNotMatch(worker, /accepted: true/);
  assert.match(worker, /handler is not implemented/);
});
