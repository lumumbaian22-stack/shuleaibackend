const { sequelize, FeeStructure, Fee, Student, Class, AuditLog } = require('../models');

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

async function writeAudit({ schoolCode, user, module = 'fees', action, entityType, entityId, before, after, metadata }) {
  try {
    if (!AuditLog) return;
    await AuditLog.create({ schoolCode, actorUserId: user?.id || null, actorRole: user?.role || null, module, action, entityType, entityId: String(entityId || ''), before, after, metadata });
  } catch (e) {
    console.error('Fee audit failed:', e.message);
  }
}

async function createOrUpdateStructure({ user, id, payload }) {
  const schoolCode = user.schoolCode || payload.schoolCode;
  if (!schoolCode) throw new Error('schoolCode is required');
  const items = normalizeItems(payload.items);
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
    const structure = await FeeStructure.findOne({ where: { id, schoolCode } });
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
  const structure = await FeeStructure.findOne({ where: { id, schoolCode } });
  if (!structure) throw new Error('Fee structure not found');
  const before = structure.toJSON();
  const trail = Array.isArray(structure.auditTrail) ? structure.auditTrail : [];
  trail.push(audit('activated', user));
  await structure.update({ status: 'active', auditTrail: trail, updatedBy: user.id });
  await writeAudit({ schoolCode, user, action: 'fee_structure_activated', entityType: 'FeeStructure', entityId: id, before, after: structure.toJSON() });
  return structure;
}

async function lockStructure({ user, id }) {
  const schoolCode = user.schoolCode;
  const structure = await FeeStructure.findOne({ where: { id, schoolCode } });
  if (!structure) throw new Error('Fee structure not found');
  const before = structure.toJSON();
  const trail = Array.isArray(structure.auditTrail) ? structure.auditTrail : [];
  trail.push(audit('locked', user));
  await structure.update({ status: 'locked', lockedAt: new Date(), lockedBy: user.id, auditTrail: trail });
  await writeAudit({ schoolCode, user, action: 'fee_structure_locked', entityType: 'FeeStructure', entityId: id, before, after: structure.toJSON() });
  return structure;
}

async function assignStructureToStudents({ user, structureId, studentIds = [], classId = null, overwrite = false }) {
  const schoolCode = user.schoolCode;
  const structure = await FeeStructure.findOne({ where: { id: structureId, schoolCode } });
  if (!structure) throw new Error('Fee structure not found');
  if (!['active', 'locked'].includes(structure.status)) throw new Error('Only active or locked fee structures can be assigned');

  return sequelize.transaction(async (transaction) => {
    let where = { schoolCode };
    if (studentIds.length) where.id = studentIds;
    else if (classId) where.classId = classId;
    else if (structure.classId) where.classId = structure.classId;
    else where.class = structure.className;

    const students = await Student.findAll({ where, transaction });
    const results = [];
    for (const student of students) {
      const existing = await Fee.findOne({ where: { studentId: student.id, schoolCode, term: structure.term, year: structure.year }, transaction });
      if (existing && !overwrite) {
        results.push({ studentId: student.id, status: 'skipped_existing', feeId: existing.id });
        continue;
      }
      const payload = {
        studentId: student.id,
        schoolCode,
        term: structure.term,
        year: structure.year,
        totalAmount: structure.totalAmount,
        paidAmount: existing ? existing.paidAmount : 0,
        status: existing && Number(existing.paidAmount || 0) > 0 ? 'partial' : 'unpaid',
        dueDate: structure.dueDate,
        feeStructureId: String(structure.id),
        classId: structure.classId || student.classId || null,
        currency: structure.currency,
        locked: structure.status === 'locked',
        auditTrail: [audit(existing ? 'fee_reassigned_from_structure' : 'fee_assigned_from_structure', user, { structureId: structure.id, totalAmount: structure.totalAmount })]
      };
      const fee = existing ? await existing.update(payload, { transaction }) : await Fee.create(payload, { transaction });
      results.push({ studentId: student.id, status: existing ? 'updated' : 'created', feeId: fee.id });
    }
    await writeAudit({ schoolCode, user, action: 'fee_structure_assigned', entityType: 'FeeStructure', entityId: structure.id, after: { count: results.length, results }, metadata: { overwrite } });
    return { structure, results };
  });
}

async function adjustStudentFee({ user, feeId, amount: deltaAmount, reason, type = 'manual_adjustment' }) {
  const schoolCode = user.schoolCode;
  if (!reason || String(reason).trim().length < 3) throw new Error('Adjustment reason is required');
  const fee = await Fee.findOne({ where: { id: feeId, schoolCode } });
  if (!fee) throw new Error('Student fee account not found');
  const before = fee.toJSON();
  const delta = Math.round(Number(deltaAmount));
  if (!Number.isFinite(delta)) throw new Error('Adjustment amount must be a valid number');
  const newTotal = Math.max(0, Number(fee.totalAmount || 0) + delta);
  const paid = Number(fee.paidAmount || 0);
  const status = paid >= newTotal ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  const adjustments = Array.isArray(fee.adjustments) ? fee.adjustments : [];
  adjustments.push({ type, amount: delta, reason, actorUserId: user.id, actorRole: user.role, at: new Date().toISOString(), beforeTotal: fee.totalAmount, afterTotal: newTotal });
  const trail = Array.isArray(fee.auditTrail) ? fee.auditTrail : [];
  trail.push(audit('fee_adjusted', user, { amount: delta, reason, beforeTotal: fee.totalAmount, afterTotal: newTotal }));
  await fee.update({ totalAmount: newTotal, status, adjustments, auditTrail: trail });
  await writeAudit({ schoolCode, user, action: 'student_fee_adjusted', entityType: 'Fee', entityId: fee.id, before, after: fee.toJSON(), metadata: { reason, delta } });
  return fee;
}

module.exports = { createOrUpdateStructure, activateStructure, lockStructure, assignStructureToStudents, adjustStudentFee };
