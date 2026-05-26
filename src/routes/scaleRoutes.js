const express = require('express');
const { Op } = require('sequelize');
const { protect, authorize } = require('../middleware/auth');
const { getPagination, makePageResponse } = require('../utils/pagination');
const { User, Student, Teacher, Parent, Class, AcademicRecord, Attendance, Alert, Message, School, UploadLog } = require('../models');

const router = express.Router();
router.use(protect);

function ok(res, data, message = 'OK') { return res.json({ success: true, message, data }); }
function fail(res, status, message) { return res.status(status).json({ success: false, message }); }
function schoolScope(req) {
  if (req.user.role === 'super_admin' && req.query.schoolCode) return req.query.schoolCode;
  return req.user.schoolCode;
}
function likeSearch(value, fields) {
  if (!value || !String(value).trim()) return {};
  const q = `%${String(value).trim()}%`;
  return { [Op.or]: fields.map(field => ({ [field]: { [Op.iLike]: q } })) };
}

router.get('/students', authorize('admin', 'teacher', 'super_admin'), async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const scope = schoolScope(req);
    const userWhere = { role: 'student' };
    if (scope) userWhere.schoolCode = scope;
    if (req.query.search) Object.assign(userWhere, likeSearch(req.query.search, ['name', 'email', 'phone']));

    const studentWhere = {};
    if (req.query.status) studentWhere.status = req.query.status;
    if (req.query.grade) studentWhere.grade = req.query.grade;
    if (req.query.academicStatus) studentWhere.academicStatus = req.query.academicStatus;

    const result = await Student.findAndCountAll({
      where: studentWhere,
      include: [{ model: User, where: userWhere, attributes: ['id', 'name', 'email', 'phone', 'schoolCode', 'isActive'] }],
      attributes: ['id', 'userId', 'elimuid', 'grade', 'status', 'academicStatus', 'points', 'approvalStatus', 'createdAt'],
      order: [[User, 'name', 'ASC']],
      limit,
      offset,
      distinct: true
    });
    return ok(res, makePageResponse({ rows: result.rows, count: result.count, page, limit }), 'Students loaded');
  } catch (e) { return fail(res, 500, e.message); }
});

router.get('/teachers', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const scope = schoolScope(req);
    const userWhere = { role: 'teacher' };
    if (scope) userWhere.schoolCode = scope;
    if (req.query.search) Object.assign(userWhere, likeSearch(req.query.search, ['name', 'email', 'phone']));
    const teacherWhere = {};
    if (req.query.status) teacherWhere.approvalStatus = req.query.status;
    if (req.query.department) teacherWhere.department = req.query.department;
    const result = await Teacher.findAndCountAll({
      where: teacherWhere,
      include: [{ model: User, where: userWhere, attributes: ['id', 'name', 'email', 'phone', 'schoolCode', 'isActive'] }],
      order: [[User, 'name', 'ASC']],
      limit,
      offset,
      distinct: true
    });
    return ok(res, makePageResponse({ rows: result.rows, count: result.count, page, limit }), 'Teachers loaded');
  } catch (e) { return fail(res, 500, e.message); }
});

router.get('/parents', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const scope = schoolScope(req);
    const userWhere = { role: 'parent' };
    if (scope) userWhere.schoolCode = scope;
    if (req.query.search) Object.assign(userWhere, likeSearch(req.query.search, ['name', 'email', 'phone']));
    const result = await Parent.findAndCountAll({
      include: [{ model: User, where: userWhere, attributes: ['id', 'name', 'email', 'phone', 'schoolCode', 'isActive'] }],
      order: [[User, 'name', 'ASC']],
      limit,
      offset,
      distinct: true
    });
    return ok(res, makePageResponse({ rows: result.rows, count: result.count, page, limit }), 'Parents loaded');
  } catch (e) { return fail(res, 500, e.message); }
});

router.get('/academic-records', authorize('admin', 'teacher', 'student', 'parent', 'super_admin'), async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const where = {};
    const scope = schoolScope(req);
    if (scope) where.schoolCode = scope;
    ['studentId', 'term', 'year', 'subject', 'isPublished'].forEach(k => { if (req.query[k] !== undefined && req.query[k] !== '') where[k] = req.query[k]; });
    const result = await AcademicRecord.findAndCountAll({ where, order: [['year', 'DESC'], ['term', 'DESC'], ['createdAt', 'DESC']], limit, offset });
    return ok(res, makePageResponse({ rows: result.rows, count: result.count, page, limit }), 'Academic records loaded');
  } catch (e) { return fail(res, 500, e.message); }
});

router.get('/attendance', authorize('admin', 'teacher', 'super_admin'), async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const where = {};
    const scope = schoolScope(req);
    if (scope) where.schoolCode = scope;
    ['studentId', 'status'].forEach(k => { if (req.query[k]) where[k] = req.query[k]; });
    if (req.query.from || req.query.to) where.date = {};
    if (req.query.from) where.date[Op.gte] = req.query.from;
    if (req.query.to) where.date[Op.lte] = req.query.to;
    const result = await Attendance.findAndCountAll({ where, order: [['date', 'DESC']], limit, offset });
    return ok(res, makePageResponse({ rows: result.rows, count: result.count, page, limit }), 'Attendance loaded');
  } catch (e) { return fail(res, 500, e.message); }
});

router.get('/alerts', async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const where = {};
    const scope = schoolScope(req);
    if (req.query.role) where.role = req.query.role;
    const include = scope ? [{ model: User, where: { schoolCode: scope }, attributes: ['id', 'name', 'role', 'schoolCode'] }] : [{ model: User, attributes: ['id', 'name', 'role', 'schoolCode'] }];
    const result = await Alert.findAndCountAll({ where, include, order: [['createdAt', 'DESC']], limit, offset, distinct: true });
    return ok(res, makePageResponse({ rows: result.rows, count: result.count, page, limit }), 'Alerts loaded');
  } catch (e) { return fail(res, 500, e.message); }
});

router.get('/messages', async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const where = { [Op.or]: [{ senderId: req.user.id }, { receiverId: req.user.id }] };
    const result = await Message.findAndCountAll({ where, order: [['createdAt', 'DESC']], limit, offset });
    return ok(res, makePageResponse({ rows: result.rows, count: result.count, page, limit }), 'Messages loaded');
  } catch (e) { return fail(res, 500, e.message); }
});

router.get('/overview', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const scope = schoolScope(req);
    const userWhere = scope ? { schoolCode: scope } : {};
    const [students, teachers, parents, classes, publishedRecords, uploads] = await Promise.all([
      User.count({ where: { ...userWhere, role: 'student' } }),
      User.count({ where: { ...userWhere, role: 'teacher' } }),
      User.count({ where: { ...userWhere, role: 'parent' } }),
      Class.count({ where: scope ? { schoolCode: scope } : {} }),
      AcademicRecord.count({ where: scope ? { schoolCode: scope, isPublished: true } : { isPublished: true } }),
      UploadLog.count().catch(() => 0)
    ]);
    return ok(res, { students, teachers, parents, classes, publishedRecords, uploads, scaleReady: true, generatedAt: new Date().toISOString() }, 'Scale overview loaded');
  } catch (e) { return fail(res, 500, e.message); }
});

module.exports = router;
