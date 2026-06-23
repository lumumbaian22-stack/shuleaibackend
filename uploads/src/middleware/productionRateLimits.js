const rateLimit = require('express-rate-limit');

function makeLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    keyGenerator: (req) => {
      const userKey = req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;
      return `${userKey}:${req.baseUrl || ''}:${req.path || ''}`;
    },
    message: { success: false, message }
  });
}

const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 40),
  message: 'Too many login/auth attempts. Please wait and try again.'
});

const writeLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.WRITE_RATE_LIMIT_MAX || 300),
  message: 'Too many save/update requests. Please slow down and try again.'
});

const readLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.READ_RATE_LIMIT_MAX || 1500),
  message: 'Too many dashboard requests. Please wait briefly and try again.'
});

const uploadLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.UPLOAD_RATE_LIMIT_MAX || 60),
  message: 'Too many upload/import requests. Please wait and try again.'
});

function routeAwareApiLimiter(req, res, next) {
  if (req.path.startsWith('/auth')) return authLimiter(req, res, next);
  if (req.path.startsWith('/upload')) return uploadLimiter(req, res, next);
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return writeLimiter(req, res, next);
  return readLimiter(req, res, next);
}

module.exports = { routeAwareApiLimiter, authLimiter, writeLimiter, readLimiter, uploadLimiter };
