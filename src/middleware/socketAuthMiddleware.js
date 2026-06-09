const jwt = require('jsonwebtoken');
const { User } = require('../models');

module.exports = async function socketAuthMiddleware(socket, next) {
  try {
    const authHeader = socket.handshake.headers?.authorization || '';
    const token = socket.handshake.auth?.token || authHeader.replace(/^Bearer\s+/i, '') || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication error: No token provided'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id, { attributes: ['id','name','role','schoolCode','isActive','preferences'] });
    if (!user || !user.isActive) return next(new Error('Authentication error: Invalid user'));
    const additionalRoles=Array.isArray(user.preferences?.additionalRoles)?user.preferences.additionalRoles:[];const effectiveRole=(decoded.effectiveRole===user.role||additionalRoles.includes(decoded.effectiveRole))?decoded.effectiveRole:user.role;socket.user={...user.toJSON(),role:effectiveRole,primaryRole:user.role};socket.userId=user.id;socket.userRole=effectiveRole;
    socket.schoolCode = user.schoolCode;
    next();
  } catch (_) {
    next(new Error('Authentication error: Invalid token'));
  }
};
