const { UserConsent } = require('../models');

const requireConsent = async (req, res, next) => {
  try {
    // If user is not authenticated, let the protect middleware handle it
    if (!req.user) {
      return next();
    }

    // Super admins bypass consent checks
    if (req.user.role === 'super_admin') {
      return next();
    }

    const consent = await UserConsent.findOne({ where: { userId: req.user.id } });
    if (!consent || !consent.termsAccepted || !consent.privacyAccepted) {
      return res.status(403).json({ 
        success: false, 
        message: 'You must accept the Terms of Service and Privacy Policy to continue.' 
      });
    }
    next();
  } catch (error) {
    console.error('Consent middleware error:', error);
    next(error);
  }
};

module.exports = { requireConsent };
