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
module.exports = { enqueueJob, updateJob, getJob, listJobs };
