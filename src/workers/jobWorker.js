require('dotenv').config();
const { processNextJob } = require('../services/jobQueue');

const handlers = {
  async 'csv-import'(job, progress) {
    await progress(30, 'CSV import worker cannot process this job because no import handler is configured.');
    throw new Error('CSV import handler is not implemented; job was not processed.');
  },
  async 'marks-import'(job, progress) {
    await progress(30, 'Marks import worker cannot process this job because no import handler is configured.');
    throw new Error('Marks import handler is not implemented; job was not processed.');
  },
  async 'report-card-generation'(job, progress) {
    await progress(50, 'Report-card worker cannot process this job because no generation handler is configured.');
    throw new Error('Report-card generation handler is not implemented; job was not processed.');
  }
};

async function loop() {
  await processNextJob(handlers);
  setTimeout(loop, Number(process.env.JOB_WORKER_INTERVAL_MS || 5000));
}

console.log('Shule AI job worker started');
loop().catch((error) => { console.error(error); process.exit(1); });
