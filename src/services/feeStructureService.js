const { Op } = require('sequelize');
const { sequelize, FeeStructure, Fee, Student, Class, User, Payment, AuditLog } = require('../models');

function amount(value) {
  const n = Math.round(Number(value || 0));
  if (!Number.isFinite(n) || n < 0) throw new Error('Amounts must be valid non-negative numbers');
  return n;
}

function normalizeItems(items = []) {
  if (!Array.isArray(items) || !items.length) throw new Error('At least one fee item is required');
  return items.map((item, index) => {
    const name = String(item.name || item.label || '').trim();
    if (!name) throw new Error(`Fee item ${index + 1} requires a name`);
    return {
      id: item.id || `item_${index + 1}`,
      name,
      amount: amount(item.amount),
      category: item.category || 'general',
      required: item.required !== false
    };
  });
}

function totalFromItems(items = []) {
  return normalizeItems(items).filter(i => i.required !== false).reduce((sum, i) => sum + i.amount, 0);
}

function audit(action, user, extra = {}) {
  return { action, actorUserId: user?.id || null, actorRole: user?.role || null, at: new Date().toISOString(), ...extra };
}

function feeStatus(total, paid) {
  const t = Number(total || 0);
  const p = Number(paid || 0);
  if (t > 0 && p >= t) return 'paid';
  if (p > 0) return 'partial';
  return 'unpaid';
}

function feeBalance(fee) {
  return Math.max(0, Number(fee?.totalAmount || 0) - Number(fee?.paidAmount || 0));
}

function safeClassName(v) { return String(v || '').trim(); }
function sameName(a,b) { return safeClassName(a).toLowerCase() === safeClassName(b).toLowerCase(); }

async function writeAudit({ schoolCode, user, module = 'fees', action, entityType, entityId, before, after, metadata }) {
  try {
    if (!AuditLog) return;
    await AuditLog.create({ schoolCode, actorUserId: user?.id || null, actorRole: user?.role || null, module, action, entityType, entityId: String(entityId || ''), before, after, metadata });
  } catch (e) {
    console.error('Fee audit failed:', e.message);
  }
}

function studentPublicShape(student) {
  if (!student) return null;
  const raw = typeof student.toJSON === 'function' ? student.toJSON() : student;
  return {
    ...raw,
    schoolCode: raw.schoolCode || raw.User?.schoolCode || null,
    className: raw.Class?.name || raw.grade || raw.className || null
  };
}

async function findStudentsForStructure({ schoolCode, structure, studentIds = [], classId = null, transaction = null }) {
  const StudentModel = Student.unscoped ? Student.unscoped() : Student;
  const requestedClassId = classId || structure.classId || null;
  const requestedClassName = safeClassName(structure.className || structure.gradeLevel);

  const include = [
    { model: User, attributes: ['id', 'name', 'email', 'schoolCode'], where: { schoolCode }, required: true },
    { model: Class, attributes: ['id', 'name', 'grade', 'stream', 'schoolCode'], required: false }
  ];

  const where = { status: { [Op.ne]: 'inactive' } };
  if (Array.isArray(studentIds) && studentIds.length) where.id = studentIds;
  else if (requestedClassId) where.classId = requestedClassId;

  let students = await StudentModel.findAll({ where, include, transaction });

  // If old students do not have classId but have grade/class text, match by grade/name.
  if (!studentIds.length && !requestedClassId && requestedClassName) {
    students = students.filter(s => {
      const js = studentPublicShape(s);
      return sameName(js.grade, requestedClassName) || sameName(js.className, requestedClassName) || sameName(js.Class?.name, requestedClassName) || sameName(js.Class?.grade, requestedClassName);
    });
  }

  // Fallback: if classId exists but no rows matched, use class name/grade as backup.
  if (!studentIds.length && requestedClassId && !students.length && requestedClassName) {
    const backup = await StudentModel.findAll({
      where: { status: { [Op.ne]: 'inactive' } },
      include,
      transaction
    });
    students = backup.filter(s => {
      const js = studentPublicShape(s);
      return sameName(js.grade, requestedClassName) || sameName(js.className, requestedClassName) || sameName(js.Class?.name, requestedClassName) || sameName(js.Class?.grade, requestedClassName);
    });
  }

  return students;
}

async function createOrUpdateStructure({ user, id, payload }) {
  const schoolCode = user.schoolCode || payload.schoolCode;
  if (!schoolCode) throw new Error('schoolCode is required');
  const items = normalizeItems(payload.items || payload.feeItems);
  const totalAmount = totalFromItems(items);
  const data = {
    schoolCode,
    classId: payload.classId || null,
    className: payload.className || payload.gradeLevel,
    gradeLevel: payload.gradeLevel || payload.className,
    curriculum: payload.curriculum || 'CBC',
    term: payload.term,
    year: Number(payload.year || new Date().getFullYear()),
    name: payload.name || `${payload.className || payload.gradeLevel} ${payload.term} ${payload.year}`,
    description: payload.description || null,
    currency: payload.currency || 'KES',
    items,
    optionalItems: Array.isArray(payload.optionalItems) ? payload.optionalItems.map((i, idx) => ({ id: i.id || `optional_${idx + 1}`, name: String(i.name || '').trim(), amount: amount(i.amount), category: i.category || 'optional' })).filter(i => i.name) : [],
    discounts: Array.isArray(payload.discounts) ? payload.discounts : [],
    totalAmount,
    dueDate: payload.dueDate || null,
    effectiveFrom: payload.effectiveFrom || null,
    updatedBy: user.id || null
  };
  if (!data.className) throw new Error('className or gradeLevel is required');
  if (!data.term) throw new Error('term is required');

  if (id) {
    const structure = await FeeStructure.unscoped().findOne({ where: { id, schoolCode } });
    if (!structure) throw new Error('Fee structure not found');
    if (structure.status === 'locked') throw new Error('Locked fee structures cannot be edited. Create an adjustment instead.');
    const before = structure.toJSON();
    const trail = Array.isArray(structure.auditTrail) ? structure.auditTrail : [];
    trail.push(audit('updated', user, { totalAmount }));
    await structure.update({ ...data, auditTrail: trail });
    await writeAudit({ schoolCode, user, action: 'fee_structure_updated', entityType: 'FeeStructure', entityId: structure.id, before, after: structure.toJSON() });
    return structure;
  }

  const structure = await FeeStructure.create({ ...data, createdBy: user.id || null, auditTrail: [audit('created', user, { totalAmount })] });
  await writeAudit({ schoolCode, user, action: 'fee_structure_created', entityType: 'FeeStructure', entityId: structure.id, after: structure.toJSON() });
  return structure;
}

async function activateStructure({ user, id }) {
  const schoolCode = user.schoolCode;
  const structure = await FeeStructure.unscoped().findOne({ where: { id, schoolCode } });
  if (!structure) throw new Error('Fee structure not found');
  const before = structure.toJSON();
  const trail = Array.isArray(structure.auditTrail) ? structure.auditTrail : [];
  trail.push(audit('activated', user));
  await structure.update({ status: 'active', auditTrail: trail, updatedBy: user.id });

  // In Shule AI, “Activate” must immediately create fee accounts; otherwise parents see “No fee balance found”.
  const assignment = await assignStructureToStudents({ user, structureId: id, overwrite: false });
  await writeAudit({ schoolCode, user, action: 'fee_structure_activated', entityType: 'FeeStructure', entityId: id, before, after: structure.toJSON(), metadata: { assigned: assignment?.results?.length || 0 } });
  return { structure, assignment };
}

async function lockStructure({ user, id }) {
  const schoolCode = user.schoolCode;
  const structure = await FeeStructure.unscoped().findOne({ where: { id, schoolCode } });
  if (!structure) throw new Error('Fee structure not found');
  const before = structure.toJSON();
  const trail = Array.isArray(structure.auditTrail) ? structure.auditTrail : [];
  trail.push(audit('locked', user));
  await structure.update({ status: 'locked', lockedAt: new Date(), lockedBy: user.id, auditTrail: trail });
  await writeAudit({ schoolCode, user, action: 'fee_structure_locked', entityType: 'FeeStructure', entityId: id, before, after: structure.toJSON() });
  return structure;
}

async function upsertStudentFee({ user, structure, student, overwrite = false, transaction = null }) {
  const schoolCode = user.schoolCode || student.User?.schoolCode;
  const studentJson = studentPublicShape(student);
  const existing = await Fee.unscoped().findOne({
    where: { studentId: student.id, schoolCode, term: structure.term, year: structure.year, feeStructureId: String(structure.id) },
    transaction
  }) || await Fee.unscoped().findOne({
    where: { studentId: student.id, schoolCode, term: structure.term, year: structure.year },
    transaction
  });

  if (existing && !overwrite) {
    // Make sure old/orphan rows are still attached to this structure/class.
    const paid = Number(existing.paidAmount || 0);
    await existing.update({
      feeStructureId: String(structure.id),
      classId: structure.classId || student.classId || existing.classId || null,
      totalAmount: Number(existing.totalAmount || 0) > 0 ? existing.totalAmount : structure.totalAmount,
      status: feeStatus(Number(existing.totalAmount || structure.totalAmount || 0), paid),
      currency: structure.currency || existing.currency || 'KES'
    }, { transaction });
    return { studentId: student.id, status: 'skipped_existing', feeId: existing.id };
  }

  const paidAmount = existing ? Number(existing.paidAmount || 0) : 0;
  const totalAmount = Number(structure.totalAmount || 0);
  const payload = {
    studentId: student.id,
    schoolCode,
    term: structure.term,
    year: structure.year,
    totalAmount,
    paidAmount,
    status: feeStatus(totalAmount, paidAmount),
    dueDate: structure.dueDate,
    feeStructureId: String(structure.id),
    classId: structure.classId || student.classId || null,
    currency: structure.currency || 'KES',
    locked: structure.status === 'locked',
    auditTrail: [audit(existing ? 'fee_reassigned_from_structure' : 'fee_assigned_from_structure', user, { structureId: structure.id, totalAmount, className: studentJson.className })]
  };
  const fee = existing ? await existing.update(payload, { transaction }) : await Fee.create(payload, { transaction });
  return { studentId: student.id, status: existing ? 'updated' : 'created', feeId: fee.id };
}

async function assignStructureToStudents({ user, structureId, studentIds = [], classId = null, overwrite = false }) {
  const schoolCode = user.schoolCode;
  const structure = await FeeStructure.unscoped().findOne({ where: { id: structureId, schoolCode } });
  if (!structure) throw new Error('Fee structure not found');

  return sequelize.transaction(async (transaction) => {
    if (!['active', 'locked'].includes(String(structure.status || '').toLowerCase())) {
      const trail = Array.isArray(structure.auditTrail) ? structure.auditTrail : [];
      trail.push(audit('auto_activated_before_assignment', user));
      await structure.update({ status: 'active', auditTrail: trail, updatedBy: user.id || null }, { transaction });
    }

    const students = await findStudentsForStructure({ schoolCode, structure, studentIds, classId, transaction });
    const results = [];
    for (const student of students) {
      const r = await upsertStudentFee({ user, structure, student, overwrite, transaction });
      results.push(r);
    }

    await writeAudit({ schoolCode, user, action: 'fee_structure_assigned', entityType: 'FeeStructure', entityId: structure.id, after: { count: results.length, results }, metadata: { overwrite, classId: classId || structure.classId || null } });
    return { structure, studentsMatched: students.length, results };
  });
}

async function ensureFeeAccountsForStudent({ user, studentId, schoolCode }) {
  const StudentModel = Student.unscoped ? Student.unscoped() : Student;
  const student = await StudentModel.findByPk(studentId, {
    include: [
      { model: User, attributes: ['id', 'name', 'email', 'schoolCode'] },
      { model: Class, attributes: ['id', 'name', 'grade', 'stream', 'schoolCode'], required: false }
    ]
  });
  if (!student) return [];
  const actualSchoolCode = schoolCode || user?.schoolCode || student.User?.schoolCode;
  if (!actualSchoolCode) return [];

  const structures = await FeeStructure.unscoped().findAll({
    where: { schoolCode: actualSchoolCode, status: { [Op.in]: ['active', 'locked'] } },
    order: [['year', 'DESC'], ['term', 'DESC']]
  });
  const js = studentPublicShape(student);
  const matched = structures.filter(s => {
    if (s.classId && student.classId && Number(s.classId) === Number(student.classId)) return true;
    return sameName(s.className, js.className) || sameName(s.className, js.grade) || sameName(s.gradeLevel, js.className) || sameName(s.gradeLevel, js.grade);
  });
  const fakeUser = user || { id: null, role: 'system', schoolCode: actualSchoolCode };
  const out = [];
  for (const structure of matched) {
    out.push(await upsertStudentFee({ user: fakeUser, structure, student, overwrite: false }));
  }
  return out;
}

async function repairSchoolFeeAccounts({ user, schoolCode }) {
  const sc = schoolCode || user?.schoolCode;
  const structures = await FeeStructure.unscoped().findAll({ where: { schoolCode: sc, status: { [Op.in]: ['active', 'locked'] } } });
  const results = [];
  for (const structure of structures) {
    const r = await assignStructureToStudents({ user: user || { schoolCode: sc, role: 'system' }, structureId: structure.id, overwrite: false });
    results.push({ structureId: structure.id, studentsMatched: r.studentsMatched, results: r.results });
  }
  await reconcileOrphanPayments({ schoolCode: sc });
  return results;
}

async function reconcileOrphanPayments({ schoolCode }) {
  const payments = await Payment.findAll({ where: { schoolCode, paymentType: 'fee', paidTo: 'school' }, order: [['createdAt', 'ASC']] });
  let linked = 0;
  let applied = 0;
  for (const payment of payments) {
    let fee = payment.feeId ? await Fee.unscoped().findByPk(payment.feeId) : null;
    const meta = payment.metadata || {};
    if (!fee && payment.studentId) {
      const where = { studentId: payment.studentId, schoolCode };
      if (meta.term) where.term = meta.term;
      if (meta.year) where.year = Number(meta.year);
      fee = await Fee.unscoped().findOne({ where, order: [['year', 'DESC'], ['updatedAt', 'DESC']] });
      if (fee) { await payment.update({ feeId: fee.id }); linked++; }
    }
    if (fee && payment.status === 'completed') {
      const feePayments = Array.isArray(fee.payments) ? fee.payments : [];
      const exists = feePayments.some(p => String(p.paymentId) === String(payment.id) || String(p.reference || '') === String(payment.reference || ''));
      if (!exists) {
        feePayments.push({ paymentId: payment.id, amount: payment.amount, reference: payment.reference, receipt: payment.mpesaReceiptNumber || payment.reference, paidAt: payment.completedAt || payment.updatedAt || new Date().toISOString(), gateway: payment.paymentGateway || payment.method || 'mpesa' });
        const newPaid = Math.min(Number(fee.totalAmount || 0), Number(fee.paidAmount || 0) + Number(payment.amount || 0));
        await fee.update({ paidAmount: newPaid, status: feeStatus(fee.totalAmount, newPaid), payments: feePayments, lastReconciledAt: new Date() });
        applied++;
      }
    }
  }
  return { linked, applied };
}

async function adjustStudentFee({ user, feeId, amount: deltaAmount, reason, type = 'manual_adjustment' }) {
  const schoolCode = user.schoolCode;
  if (!reason || String(reason).trim().length < 3) throw new Error('Adjustment reason is required');
  const fee = await Fee.unscoped().findOne({ where: { id: feeId, schoolCode } });
  if (!fee) throw new Error('Student fee account not found');
  const before = fee.toJSON();
  const delta = Math.round(Number(deltaAmount));
  if (!Number.isFinite(delta)) throw new Error('Adjustment amount must be a valid number');
  const newTotal = Math.max(0, Number(fee.totalAmount || 0) + delta);
  const paid = Number(fee.paidAmount || 0);
  const status = feeStatus(newTotal, paid);
  const adjustments = Array.isArray(fee.adjustments) ? fee.adjustments : [];
  adjustments.push({ type, amount: delta, reason, actorUserId: user.id, actorRole: user.role, at: new Date().toISOString(), beforeTotal: fee.totalAmount, afterTotal: newTotal });
  const trail = Array.isArray(fee.auditTrail) ? fee.auditTrail : [];
  trail.push(audit('fee_adjusted', user, { amount: delta, reason, beforeTotal: fee.totalAmount, afterTotal: newTotal }));
  await fee.update({ totalAmount: newTotal, status, adjustments, auditTrail: trail });
  await writeAudit({ schoolCode, user, action: 'student_fee_adjusted', entityType: 'Fee', entityId: fee.id, before, after: fee.toJSON(), metadata: { reason, delta } });
  return fee;
}

module.exports = { createOrUpdateStructure, activateStructure, lockStructure, assignStructureToStudents, ensureFeeAccountsForStudent, repairSchoolFeeAccounts, reconcileOrphanPayments, adjustStudentFee, feeStatus, feeBalance };
