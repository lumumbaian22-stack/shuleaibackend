#!/usr/bin/env node
/* Lightweight Shule AI smoke/load test without external packages. */
const https = require('https');
const http = require('http');

const BASE_URL = (process.env.LOAD_TEST_BASE_URL || process.argv[2] || 'https://shuleaibackend-32h1.onrender.com').replace(/\/$/, '');
const CONCURRENCY = Number(process.env.LOAD_TEST_CONCURRENCY || process.argv[3] || 25);
const REQUESTS = Number(process.env.LOAD_TEST_REQUESTS || process.argv[4] || 200);
const PATHS = (process.env.LOAD_TEST_PATHS || '/api/health,/api/health/ready,/api/health/live').split(',').map(s => s.trim()).filter(Boolean);
const TOKEN = process.env.LOAD_TEST_TOKEN || '';
const EXPECTED_INSTANCES = Number(process.env.LOAD_TEST_EXPECT_INSTANCES || 0);
const TIMEOUT_MS = Number(process.env.LOAD_TEST_TIMEOUT_MS || 15000);
const MAX_BODY_BYTES = 64 * 1024;

function safeJson(body) {
  try { return JSON.parse(body); } catch (_) { return null; }
}

function request(pathname) {
  const url = new URL(pathname, BASE_URL);
  const lib = url.protocol === 'http:' ? http : https;
  const started = Date.now();
  return new Promise((resolve) => {
    const req = lib.request(url, { method: 'GET', headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {} }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        if (body.length < MAX_BODY_BYTES) body += chunk.slice(0, MAX_BODY_BYTES - body.length);
      });
      res.on('end', () => {
        const parsed = safeJson(body) || {};
        const headerInstance = res.headers['x-shuleai-instance'];
        const instanceId = headerInstance || parsed.instanceId || parsed.instance || null;
        resolve({
          status: res.statusCode,
          ms: Date.now() - started,
          path: pathname,
          instanceId,
          healthStatus: parsed.status || null
        });
      });
    });
    req.on('error', (err) => resolve({ status: 0, ms: Date.now() - started, path: pathname, error: err.message }));
    req.setTimeout(TIMEOUT_MS, () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

function countBy(results, key) {
  return results.reduce((m, row) => {
    const value = row[key] || 'unknown';
    m[value] = (m[value] || 0) + 1;
    return m;
  }, {});
}

(async function run(){
  console.log(`Shule AI load smoke test: ${REQUESTS} requests, concurrency ${CONCURRENCY}, base ${BASE_URL}`);
  console.log(`Paths: ${PATHS.join(', ')}`);
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
  const byStatus = countBy(results, 'status');
  const byPath = countBy(results, 'path');
  const byInstance = countBy(results.filter(r => r.instanceId), 'instanceId');
  const distinctInstances = Object.keys(byInstance).length;
  const summary = {
    total: results.length,
    ok,
    fail: results.length - ok,
    byStatus,
    byPath,
    p50: pct(.50),
    p90: pct(.90),
    p95: pct(.95),
    p99: pct(.99),
    distinctInstances,
    byInstance,
    expectedInstances: EXPECTED_INSTANCES || null,
    loadBalanced: EXPECTED_INSTANCES ? distinctInstances >= EXPECTED_INSTANCES : distinctInstances > 1
  };
  console.log(JSON.stringify(summary, null, 2));
  if (ok !== results.length || (EXPECTED_INSTANCES && distinctInstances < EXPECTED_INSTANCES)) process.exitCode = 1;
})();
