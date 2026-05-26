require('dotenv').config();
const { processNextJob } = require('../services/jobQueue');

const handlers = {
  async 'csv-import'(job, progress) {
    await progress(30, 'CSV import worker acknowledged job. Wire file storage path in payload.filename for full processing.');
    return { accepted: true, payload: job.payload };
  },
  async 'marks-import'(job, progress) {
    await progress(30, 'Marks import worker acknowledged job.');
    return { accepted: true, payload: job.payload };
  },
  async 'report-card-generation'(job, progress) {
    await progress(50, 'Report-card generation job acknowledged.');
    return { accepted: true, payload: job.payload };
  }
};

async function loop() {
  await processNextJob(handlers);
  setTimeout(loop, Number(process.env.JOB_WORKER_INTERVAL_MS || 5000));
}

console.log('Shule AI job worker started');
loop().catch((error) => { console.error(error); process.exit(1); });
