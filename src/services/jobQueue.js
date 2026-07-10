const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

const queueFile = path.join(__dirname, '../../uploads/job-queue.json');
function ensureFile() {
  const dir = path.dirname(queueFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(queueFile)) fs.writeFileSync(queueFile, JSON.stringify([]));
}
function readJobs() { ensureFile(); return JSON.parse(fs.readFileSync(queueFile, 'utf8') || '[]'); }
function writeJobs(jobs) { ensureFile(); fs.writeFileSync(queueFile, JSON.stringify(jobs, null, 2)); }
function enqueueJob(type, payload = {}, user = null) {
  const jobs = readJobs();
  const job = { id: randomUUID(), type, status: 'queued', payload, createdBy: user?.id || null, schoolCode: user?.schoolCode || null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), progress: 0, logs: [] };
  jobs.unshift(job);
  writeJobs(jobs.slice(0, 5000));
  return job;
}
function updateJob(id, patch) {
  const jobs = readJobs();
  const i = jobs.findIndex(j => j.id === id);
  if (i === -1) return null;
  jobs[i] = { ...jobs[i], ...patch, updatedAt: new Date().toISOString() };
  writeJobs(jobs);
  return jobs[i];
}
function getJob(id) { return readJobs().find(j => j.id === id) || null; }
function listJobs({ schoolCode, limit = 50 } = {}) {
  return readJobs().filter(j => !schoolCode || j.schoolCode === schoolCode).slice(0, limit);
}
module.exports = { enqueueJob, updateJob, getJob, listJobs, processNextJob, startInlineWorker };


let processing = false;
async function processNextJob(handlerMap = {}) {
  if (processing) return null;
  processing = true;
  try {
    const jobs = readJobs();
    const job = jobs.find(j => j.status === 'queued' || j.status === 'retry');
    if (!job) return null;
    updateJob(job.id, { status: 'processing', progress: 5, startedAt: new Date().toISOString(), logs: [...(job.logs || []), 'Job started'] });
    const handler = handlerMap[job.type];
    if (!handler) {
      updateJob(job.id, { status: 'failed', progress: 100, error: `No worker registered for ${job.type}`, logs: [...(job.logs || []), 'No worker registered'] });
      return job;
    }
    try {
      const result = await handler(job, (progress, log) => updateJob(job.id, { progress, logs: [...((getJob(job.id) || job).logs || []), log].slice(-100) }));
      updateJob(job.id, { status: 'completed', progress: 100, completedAt: new Date().toISOString(), result, logs: [...((getJob(job.id) || job).logs || []), 'Job completed'].slice(-100) });
      return getJob(job.id);
    } catch (e) {
      updateJob(job.id, { status: 'failed', progress: 100, error: e.message, failedAt: new Date().toISOString(), logs: [...((getJob(job.id) || job).logs || []), `Failed: ${e.message}`].slice(-100) });
      return getJob(job.id);
    }
  } finally {
    processing = false;
  }
}
function startInlineWorker(handlerMap = {}, intervalMs = 5000) {
  if (global.__shuleJobWorkerTimer) return global.__shuleJobWorkerTimer;
  global.__shuleJobWorkerTimer = setInterval(() => processNextJob(handlerMap).catch(err => console.error('[job-worker]', err.message)), intervalMs);
  return global.__shuleJobWorkerTimer;
}
module.exports = { enqueueJob, updateJob, getJob, listJobs, processNextJob, startInlineWorker };
