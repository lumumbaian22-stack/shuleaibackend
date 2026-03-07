const jwt = require('jsonwebtoken');
const { User } = require('../models');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
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
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// THIS IS THE IMPORTANT PART - FIXED VERSION
const authorize = (...roles) => {
  return (req, res, next) => {
    // DEBUG - remove this after testing
    console.log('User role:', req.user.role);
    console.log('Allowed roles:', roles);
    
    // Check if user's role is in allowed roles
    if (roles.includes(req.user.role)) {
      return next();
    }
    
    // Special case: super_admin can access everything
    if (req.user.role === 'super_admin') {
      return next();
    }
    
    return res.status(403).json({ 
      success: false, 
      message: 'Forbidden - insufficient permissions' 
    });
  };
};

module.exports = { protect, authorize };
