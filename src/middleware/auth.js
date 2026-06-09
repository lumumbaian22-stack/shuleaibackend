const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, School, Teacher, Student, Parent, Admin } = require('../models');
const { computeSchoolAccess } = require('../services/schoolAccessEngine');
const { setTenantUser } = require('./requestContext');


async function findSchoolByAnyCode(code) {
  const value = String(code || '').trim();
  if (!value) return null;
  return School.findOne({
    where: {
      [Op.or]: [
        { schoolId: value },
        { shortCode: value },
        { lookupCodes: { [Op.contains]: [value] } }
      ]
    }
  }).catch(() => null);
}

async function resolveSchoolScopeForUser(user) {
  if (!user || user.role === 'super_admin') return null;
  if (user.schoolCode) return user.schoolCode;
  const lookups = {
    teacher: () => Teacher.findOne({ where: { userId: user.id } }),
    student: () => Student.findOne({ where: { userId: user.id } }),
    parent: () => Parent.findOne({ where: { userId: user.id } }),
    admin: () => Admin.findOne({ where: { userId: user.id } })
  };
  const fn = lookups[String(user.role || '').toLowerCase()];
  if (!fn) return null;
  const profile = await fn().catch(() => null);
  const direct = profile?.schoolCode || profile?.schoolId || null;
  if (direct) return direct;
  // Admin profiles may store numeric School.id values in managedSchools.
  if (String(user.role).toLowerCase() === 'admin' && Array.isArray(profile?.managedSchools) && profile.managedSchools.length) {
    const school = await School.findOne({ where: { id: profile.managedSchools[0] } }).catch(() => null);
    return school?.schoolId || null;
  }
  return null;
}

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
    if (user.role !== 'super_admin' && !user.schoolCode) {
      const resolvedSchoolCode = await resolveSchoolScopeForUser(user);
      if (resolvedSchoolCode) {
        user.schoolCode = resolvedSchoolCode;
        await User.update({ schoolCode: resolvedSchoolCode }, { where: { id: user.id } }).catch(() => null);
      }
    }
    const primaryRole=user.role;const additionalRoles=Array.isArray(user.preferences?.additionalRoles)?user.preferences.additionalRoles:[];const requestedEffectiveRole=decoded.effectiveRole||decoded.role||primaryRole;const effectiveRole=requestedEffectiveRole===primaryRole||additionalRoles.includes(requestedEffectiveRole)?requestedEffectiveRole:primaryRole;user.setDataValue('primaryRole',primaryRole);user.setDataValue('role',effectiveRole);req.user=user;req.primaryRole=primaryRole;req.effectiveRole=effectiveRole;setTenantUser(user);
    if (user.role !== 'super_admin' && !user.schoolCode) {
      return res.status(403).json({ success: false, code: 'SCHOOL_SCOPE_REQUIRED', message: 'User is not attached to a school tenant' });
    }
    if (user.role !== 'super_admin' && user.schoolCode) {
      let school = await findSchoolByAnyCode(user.schoolCode);
      // If the token/user row has a stale or wrong schoolCode, recover from the role profile.
      // This prevents /api/admin/settings from returning "School not found" for approved admins/teachers.
      if (!school) {
        const resolved = await resolveSchoolScopeForUser({ ...user.toJSON(), schoolCode: null });
        if (resolved) {
          school = await findSchoolByAnyCode(resolved);
          if (school) {
            user.schoolCode = school.schoolId;
            await User.update({ schoolCode: school.schoolId }, { where: { id: user.id } }).catch(() => null);
          }
        }
      }
      req.school = school || null;
      if (school) {
        if (user.schoolCode !== school.schoolId) {
          user.schoolCode = school.schoolId;
          await User.update({ schoolCode: school.schoolId }, { where: { id: user.id } }).catch(() => null);
        }
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