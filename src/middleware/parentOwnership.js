'use strict';
const ownership = require('../services/parentOwnershipService');

function requireOwnedStudent(paramName = 'studentId') {
  return async function parentOwnershipMiddleware(req, res, next) {
    try {
      const studentId = req.params[paramName] || req.body[paramName] || req.query[paramName];
      const result = await ownership.assertParentOwnsStudent({
        parentUserId: req.user?.id,
        studentId,
        schoolCode: req.user?.schoolCode
      });
      req.parentProfile = result.parent;
      req.ownedStudent = result.student;
      return next();
    } catch (error) {
      return res.status(error.status || 403).json({ success:false, message:error.message || 'Not your child' });
    }
  };
}

module.exports = { requireOwnedStudent };
