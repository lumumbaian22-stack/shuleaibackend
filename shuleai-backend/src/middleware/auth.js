const jwt = require('jsonwebtoken');
const { User } = require('../models');

// Protect routes - verify JWT token
const protect = async (req, res, next) => {
  console.log('🛡️ Auth middleware checking...');
  let token;

  // Check for token in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
    console.log('🔑 Token found in Authorization header');
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
    console.log('🍪 Token found in cookies');
  }

  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({
      success: false,
      message: 'Not authorized - no token provided'
    });
  }

  try {
    console.log('🔍 Verifying token...');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token verified, user ID:', decoded.id);

    const user = await User.findByPk(decoded.id, { 
      attributes: { exclude: ['password'] } 
    });

    if (!user) {
      console.log('❌ User not found');
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.isActive) {
      console.log('❌ User inactive');
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    console.log('✅ Authentication successful for:', user.email);
    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Not authorized - invalid token'
    });
  }
};

// Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    console.log('🔒 Checking role authorization. Required:', roles, 'User role:', req.user.role);
    if (!roles.includes(req.user.role)) {
      console.log('❌ Role not authorized');
      return res.status(403).json({
        success: false,
        message: `Role ${req.user.role} not authorized`
      });
    }
    console.log('✅ Role authorized');
    next();
  };
};

module.exports = {
  protect,
  authorize
};
