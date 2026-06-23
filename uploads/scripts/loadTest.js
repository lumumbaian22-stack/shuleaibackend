#!/usr/bin/env node
/* Lightweight Shule AI smoke/load test without external packages. */
const https = require('https');
const http = require('http');

const BASE_URL = (process.env.LOAD_TEST_BASE_URL || process.argv[2] || 'https://shuleaibackend-32h1.onrender.com').replace(/\/$/, '');
const CONCURRENCY = Number(process.env.LOAD_TEST_CONCURRENCY || process.argv[3] || 25);
const REQUESTS = Number(process.env.LOAD_TEST_REQUESTS || process.argv[4] || 200);
const PATHS = (process.env.LOAD_TEST_PATHS || '/api/health/detailed,/api/public/health,/api/owner/health-dashboard').split(',').map(s => s.trim()).filter(Boolean);
const TOKEN = process.env.LOAD_TEST_TOKEN || '';

function request(pathname) {
  const url = new URL(pathname, BASE_URL);
  const lib = url.protocol === 'http:' ? http : https;
  const started = Date.now();
  return new Promise((resolve) => {
    const req = lib.request(url, { method: 'GET', headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {} }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, ms: Date.now() - started, path: pathname }));
    });
    req.on('error', (err) => resolve({ status: 0, ms: Date.now() - started, path: pathname, error: err.message }));
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

(async function run(){
  console.log(`Shule AI load smoke test: ${REQUESTS} requests, concurrency ${CONCURRENCY}, base ${BASE_URL}`);
  const results = [];
  let sent = 0;
  async function worker(){
    while (sent < REQUESTS) {
      const i = sent++;
      results.push(await request(PATHS[i % PATHS.length]));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, REQUESTS) }, worker));
  const ok = results.filter(r => r.status >= 200 && r.status < 400).length;
  const sorted = results.map(r => r.ms).sort((a,b)=>a-b);
  const pct = p => sorted[Math.min(sorted.length-1, Math.floor(sorted.length*p))] || 0;
  const byStatus = results.reduce((m,r)=>{m[r.status]=(m[r.status]||0)+1;return m;},{});
  console.log(JSON.stringify({ total: results.length, ok, fail: results.length-ok, byStatus, p50: pct(.50), p90: pct(.90), p95: pct(.95), p99: pct(.99) }, null, 2));
  if (ok !== results.length) process.exitCode = 1;
})();
