const { UserConsent, SchoolDPA, ParentChildConsent } = require('../models');

// Require basic consent (Terms & Privacy)
const requireConsent = async (req, res, next) => {
  try {
    const consent = await UserConsent.findOne({ where: { userId: req.user.id } });
    if (!consent || !consent.termsAccepted || !consent.privacyAccepted) {
      return res.status(403).json({ 
        success: false, 
        message: 'You must accept the Terms of Service and Privacy Policy to continue.' 
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Require DPA for admins
const requireDPA = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return next();
    
    const dpa = await SchoolDPA.findOne({ 
      where: { schoolId: req.user.schoolCode, adminId: req.user.id } 
    });
    
    if (!dpa || !dpa.accepted) {
      return res.status(403).json({ 
        success: false, 
        message: 'You must accept the Data Processing Agreement (DPA) before managing student data.' 
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Require parental consent for accessing a child
const requireParentalConsent = async (req, res, next) => {
  try {
    if (req.user.role !== 'parent') return next();
    
    const studentId = req.params.studentId || req.body.studentId;
    if (!studentId) return next(); // Not accessing a specific child
    
    const consent = await ParentChildConsent.findOne({ 
      where: { parentId: req.user.id, studentId } 
    });
    
    if (!consent || !consent.consentGiven) {
      return res.status(403).json({ 
        success: false, 
        message: 'Parental consent is required to access this child\'s data.' 
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { requireConsent, requireDPA, requireParentalConsent };
