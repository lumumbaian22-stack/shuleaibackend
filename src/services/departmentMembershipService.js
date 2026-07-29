const { Op } = require('sequelize');
const { Department, DepartmentMember, Teacher } = require('../models');

function uniqueTeacherIds(values = []) {
  return [...new Set(values.map(Number).filter(Boolean))];
}

async function labelsForTeachers(teacherIds = [], schoolCode) {
  const ids = uniqueTeacherIds(teacherIds);
  const labels = new Map(ids.map(id => [id, []]));
  if (!ids.length || !schoolCode) return labels;
  const rows = await DepartmentMember.findAll({
    where: { teacherId: { [Op.in]: ids } },
    include: [{
      model: Department,
      required: true,
      where: { schoolCode, isActive: true },
      attributes: ['id', 'name']
    }],
    order: [[Department, 'name', 'ASC']]
  }).catch(() => []);
  rows.forEach(row => {
    const teacherId = Number(row.teacherId);
    const name = String(row.Department?.name || '').trim();
    if (!teacherId || !name) return;
    const current = labels.get(teacherId) || [];
    if (!current.some(value => value.toLowerCase() === name.toLowerCase())) current.push(name);
    labels.set(teacherId, current);
  });
  return labels;
}

async function syncTeacherLabels(teacherIds = [], schoolCode) {
  const ids = uniqueTeacherIds(teacherIds);
  const labels = await labelsForTeachers(ids, schoolCode);
  await Promise.all(ids.map(teacherId => Teacher.update(
    { department: (labels.get(teacherId) || []).join(', ') || null },
    { where: { id: teacherId } }
  )));
  return labels;
}

function displayLabel(labels, teacher) {
  const membershipNames = labels?.get(Number(teacher?.id)) || [];
  return membershipNames.length ? membershipNames.join(', ') : (teacher?.department || 'general');
}

module.exports = {
  labelsForTeachers,
  syncTeacherLabels,
  displayLabel
};
