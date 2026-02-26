const { User, Student, Parent } = require('../models');

const checkOwnership = (modelName) => async (req, res, next) => {
  try {
    const Model = require('../models')[modelName];
    const resource = await Model.findByPk(req.params.id);
    if (!resource) {
      return res.status(404).json({ success: false, message: 'Resource not found' });
    }

    if (req.user.role === 'super_admin') {
      req.resource = resource;
      return next();
    }

    let isOwner = false;
    if (resource.userId && resource.userId === req.user.id) {
      isOwner = true;
    } else if (resource.studentId) {
      if (req.user.role === 'student') {
        isOwner = resource.studentId === req.user.id;
      } else if (req.user.role === 'parent') {
        const parent = await Parent.findOne({ where: { userId: req.user.id } });
        if (parent) {
          const student = await Student.findByPk(resource.studentId);
          isOwner = student && await student.hasParent(parent);
        }
      }
    }

    if (!isOwner) {
      return res.status(403).json({ success: false, message: 'You do not own this resource' });
    }
    req.resource = resource;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { checkOwnership };