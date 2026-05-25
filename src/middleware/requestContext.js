const { randomUUID } = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const requestStore = new AsyncLocalStorage();

function requestContext(req, res, next) {
  const context = { requestId: req.headers['x-request-id'] || randomUUID(), user: null };
  req.requestId = context.requestId;
  res.setHeader('X-Request-Id', context.requestId);
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
  const status = err.status || err.statusCode || 500;
  const safeMessage = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : (err.message || 'Internal server error');
  console.error(`[${req.requestId || 'no-request-id'}]`, err.stack || err);
  res.status(status).json({ success: false, message: safeMessage, requestId: req.requestId });
}

module.exports = { requestContext, productionErrorHandler, setTenantUser, getTenantContext };
