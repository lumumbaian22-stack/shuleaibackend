const { randomUUID } = require('crypto');

function requestContext(req, res, next) {
  req.requestId = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

function productionErrorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const safeMessage = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : (err.message || 'Internal server error');
  console.error(`[${req.requestId || 'no-request-id'}]`, err.stack || err);
  res.status(status).json({ success: false, message: safeMessage, requestId: req.requestId });
}

module.exports = { requestContext, productionErrorHandler };
