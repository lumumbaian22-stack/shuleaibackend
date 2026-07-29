require('dotenv').config();
const { processNextJob } = require('../services/jobQueue');

// The former CSV, marks, and report-card queue endpoints accepted jobs that
// could never be processed. Those routes now reject explicitly and the active
// dashboard workflows continue to use their implemented synchronous endpoints.
// Keeping an empty worker lets an old deployment drain any legacy queued record
// into the queue service's explicit "No worker registered" failed state.
const handlers = Object.freeze({});

async function loop() {
  await processNextJob(handlers);
  setTimeout(loop, Number(process.env.JOB_WORKER_INTERVAL_MS || 5000));
}

console.log('Shule AI job worker started');
loop().catch((error) => { console.error(error); process.exit(1); });
