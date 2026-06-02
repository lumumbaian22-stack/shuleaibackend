const jwt = require('jsonwebtoken');
const { User, School } = require('../models');
const { computeSchoolAccess } = require('../services/schoolAccessEngine');
const { setTenantUser } = require('./requestContext');

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id, { attributes: { exclude: ['password'] } });
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }
    req.user = user;
    setTenantUser(user);
    if (user.role !== 'super_admin' && !user.schoolCode) {
      return res.status(403).json({ success: false, message: 'User is not attached to a school tenant' });
    }
    if (user.role !== 'super_admin' && user.schoolCode) {
      const school = await School.findOne({ where: { schoolId: user.schoolCode } }).catch(() => null);
      if (school) {
        const access = computeSchoolAccess(school);
        req.schoolAccess = access;
        const path = String(req.originalUrl || req.url || '').toLowerCase();
        const allowedWhenExpired = path.includes('/api/auth/me') ||
          path.includes('/api/admin/billing/payment-confirmation') ||
          path.includes('/api/payments/school/subscription/stk') ||
          path.includes('/api/super-admin/payment-requests') ||
          path.includes('/api/user/alerts');
        if (access.accessMode === 'expired_subscription' && !allowedWhenExpired) {
          return res.status(402).json({ success: false, code: 'SCHOOL_SUBSCRIPTION_EXPIRED', message: access.reason || 'School subscription has expired', data: access });
        }
      }
    }
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  next();
};

module.exports = { protect, authorize };