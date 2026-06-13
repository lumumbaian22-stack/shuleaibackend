const { randomUUID } = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const requestStore = new AsyncLocalStorage();

function originAllowed(origin) {
  if (!origin) return false;
  const allowed = new Set([
    'https://shuleai.live',
    'https://www.shuleai.live',
    'https://lumumbaian22-stack.github.io',
    'https://shuleaiinfo-cmd.github.io',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5500',
    ...(process.env.CORS_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean),
    ...(process.env.FRONTEND_URL || '').split(',').map(x => x.trim()).filter(Boolean)
  ]);
  return allowed.has(origin) || /^https:\/\/[a-z0-9-]+\.github\.io$/i.test(origin);
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (!originAllowed(origin)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function requestContext(req, res, next) {
  setCorsHeaders(req, res);
  const context = { requestId: req.headers['x-request-id'] || randomUUID(), user: null };
  req.requestId = context.requestId;
  res.setHeader('X-Request-Id', context.requestId);
  if (req.method === 'OPTIONS') return res.status(204).end();
  requestStore.run(context, () => next());
}

function setTenantUser(user) {
  const store = requestStore.getStore();
  if (store) store.user = user;
}

function getTenantContext() {
  return requestStore.getStore() || {};
}

function productionErrorHandler(err, req, res, next) {
  setCorsHeaders(req, res);
  const status = err.status || err.statusCode || 500;
  const safeMessage = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : (err.message || 'Internal server error');
  console.error(`[${req.requestId || 'no-request-id'}]`, err.stack || err);
  if (res.headersSent) return next(err);
  res.status(status).json({ success: false, message: safeMessage, requestId: req.requestId });
}

module.exports = { requestContext, productionErrorHandler, setTenantUser, getTenantContext, setCorsHeaders };
