'use strict';

const { sequelize } = require('../models');

async function listStudentSubjectSelections({ schoolCode, studentId, classId = null }) {
  const where = ['"schoolCode" = :schoolCode', '"studentId" = :studentId'];
  const replacements = { schoolCode, studentId };
  if (classId) { where.push('"classId" = :classId'); replacements.classId = classId; }
  const [rows] = await sequelize.query(`SELECT * FROM "StudentSubjectSelections" WHERE ${where.join(' AND ')} ORDER BY "subjectName" ASC`, { replacements });
  return rows || [];
}

async function replaceStudentSubjectSelections({ schoolCode, studentId, classId, pathway = null, track = null, subjects = [], actorUserId = null }) {
  const now = new Date();
  await sequelize.query('DELETE FROM "StudentSubjectSelections" WHERE "schoolCode" = :schoolCode AND "studentId" = :studentId AND (:classId::int IS NULL OR "classId" = :classId)', { replacements: { schoolCode, studentId, classId: classId || null } });
  for (const subject of subjects || []) {
    await sequelize.query(`
      INSERT INTO "StudentSubjectSelections" ("schoolCode","studentId","classId","subjectId","subjectName","status","pathway","track","isCompulsory","isElective","approvedBy","approvedAt","createdAt","updatedAt")
      VALUES (:schoolCode,:studentId,:classId,:subjectId,:subjectName,:status,:pathway,:track,:isCompulsory,:isElective,:approvedBy,:approvedAt,:createdAt,:updatedAt)
    `, { replacements: {
      schoolCode, studentId, classId: classId || null,
      subjectId: subject.subjectId || subject.id || null,
      subjectName: subject.subjectName || subject.name || subject.subject,
      status: subject.status || 'taking', pathway: subject.pathway || pathway || null, track: subject.track || track || null,
      isCompulsory: !!subject.isCompulsory, isElective: !!subject.isElective,
      approvedBy: actorUserId || null, approvedAt: actorUserId ? now : null, createdAt: now, updatedAt: now
    }});
  }
  return listStudentSubjectSelections({ schoolCode, studentId, classId });
}

module.exports = { listStudentSubjectSelections, replaceStudentSubjectSelections };
