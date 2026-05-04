const { Op } = require('sequelize');
const { LearningMaterial, Student, ResourceViews, School } = require('../models');
const { CORE_LIBRARY } = require('../services/tutorEngine');
const { hasFeatureForUser } = require('../services/subscriptionService');

function systemMaterialsFor(gradeLevel='General') {
  return Object.entries(CORE_LIBRARY).map(([subject, lib], index) => ({
    id: `system-${index+1}`,
    title: `${subject} Core Revision Guide`,
    subject,
    gradeLevel,
    type: 'interactive-note',
    accessLevel: index < 5 ? 'basic' : 'premium',
    summary: `Core ${subject} revision covering ${lib.foundations.slice(0,4).join(', ')}.`,
    content: lib.explain,
    examples: lib.foundations.slice(0,3).map(f => `Example focus: ${f}`),
    activities: lib.activities,
    assessment: ['Explain the idea in your own words', 'Complete one practice activity', 'Ask the AI tutor to check your reasoning'],
    sourceType: 'system',
    tags: lib.foundations
  }));
}

exports.getMaterials = async (req, res) => {
  try {
    const user = req.user;
    let gradeLevel = req.query.grade || 'General';
    let student = null;
    if (user.role === 'student') { student = await Student.findOne({ where: { userId: user.id } }); gradeLevel = student?.grade || gradeLevel; }
    const subject = req.query.subject;
    const access = await hasFeatureForUser(user, 'premium_materials', req.query.studentId);
    const allowedLevels = access.allowed ? ['basic','premium','ultimate'] : ['basic'];
    const where = { isActive: true, accessLevel: { [Op.in]: allowedLevels }, [Op.or]: [{ schoolCode: user.schoolCode }, { schoolCode: null }] };
    if (gradeLevel) where.gradeLevel = { [Op.or]: [gradeLevel, 'All', 'General'] };
    if (subject) where.subject = subject;
    let rows = [];
    try { rows = await LearningMaterial.findAll({ where, order: [['subject','ASC'], ['difficulty','ASC'], ['title','ASC']], limit: 80 }); } catch (_) { rows = []; }
    let data = rows.map(r => r.toJSON());
    const existingKeys = new Set(data.map(m => `${m.subject}-${m.title}`));
    const fallback = systemMaterialsFor(gradeLevel).filter(m => allowedLevels.includes(m.accessLevel) && (!subject || m.subject === subject) && !existingKeys.has(`${m.subject}-${m.title}`));
    data = [...data, ...fallback];
    res.json({ success: true, data, subscription: access.status || null });
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
};

exports.createMaterial = async (req, res) => {
  try {
    if (!['admin','teacher','super_admin'].includes(req.user.role)) return res.status(403).json({ success:false, message:'Forbidden' });
    const body = req.body || {};
    const material = await LearningMaterial.create({ ...body, schoolCode: req.user.role === 'super_admin' ? (body.schoolCode || null) : req.user.schoolCode, sourceType: req.user.role === 'teacher' ? 'teacher' : 'school' });
    res.status(201).json({ success:true, data: material });
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
};

exports.viewMaterial = async (req, res) => {
  try {
    const material = await LearningMaterial.findByPk(req.params.id);
    if (!material) return res.status(404).json({ success:false, message:'Material not found' });
    await ResourceViews.create({ resourceId: material.id, resourceType: 'learning_material', userId: req.user.id });
    res.json({ success:true, data: material });
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
};
