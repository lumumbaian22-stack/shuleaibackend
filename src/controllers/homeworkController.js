const { Op } = require('sequelize');
const { HomeTask, HomeTaskAssignment, Student, Teacher, Class, User, TeacherSubjectAssignment } = require('../models');
const { ensureRuntimeSchema } = require('../utils/schemaSafety');

function cleanString(value, fallback = '') {
  const s = String(value ?? '').trim();
  return s || fallback;
}

async function getTeacherFromUser(userId) {
  return Teacher.findOne({ where: { userId } });
}

function classNamesForStudentLookup(classItem) {
  return [...new Set([
    classItem?.name,
    classItem?.grade,
    `${classItem?.grade || ''} ${classItem?.stream || ''}`.trim(),
    `${classItem?.name || ''} ${classItem?.stream || ''}`.trim()
  ].filter(Boolean))];
}

async function getStudentsForClass(classItem, schoolCode) {
  if (!classItem) return [];
  const names = classNamesForStudentLookup(classItem);
  const userInclude = { model: User, attributes: ['id', 'name', 'schoolCode'], where: { schoolCode }, required: true };

  let students = [];
  if (classItem.id) {
    students = await Student.findAll({
      where: { [Op.or]: [{ classId: classItem.id }, { grade: { [Op.in]: names.length ? names : ['__none__'] } }], status: { [Op.ne]: 'inactive' } },
      include: [userInclude],
      attributes: ['id', 'userId', 'grade', 'classId', 'status'],
      limit: 3000
    });
  }
  if (!students.length && names.length) {
    students = await Student.findAll({
      where: { grade: { [Op.in]: names }, status: { [Op.ne]: 'inactive' } },
      include: [userInclude],
      attributes: ['id', 'userId', 'grade', 'classId', 'status'],
      limit: 3000
    });
  }
  return students;
}

async function resolveClass({ classId, className, grade, schoolCode }) {
  let classItem = null;
  if (classId) {
    classItem = await Class.findOne({ where: { id: classId, schoolCode, isActive: true } });
  }
  if (!classItem && (className || grade)) {
    const name = cleanString(className || grade);
    classItem = await Class.findOne({
      where: {
        schoolCode,
        isActive: true,
        [Op.or]: [
          { name },
          { grade: name },
          { name: { [Op.iLike]: `%${name}%` } },
          { grade: { [Op.iLike]: `%${name}%` } }
        ]
      }
    });
  }
  return classItem;
}

exports.createAssignment = async (req, res) => {
  try {
    await ensureRuntimeSchema().catch(() => null);
    const {
      title,
      instructions,
      description,
      content,
      subject,
      dueDate,
      classId,
      className,
      grade,
      studentIds,
      estimatedMinutes,
      points,
      difficulty
    } = req.body || {};

    const teacher = await getTeacherFromUser(req.user.id);
    if (!teacher) return res.status(403).json({ success: false, message: 'Teacher account not found' });

    const safeTitle = cleanString(title);
    const safeSubject = cleanString(subject, 'General');
    const safeInstructions = cleanString(instructions || description || content);

    if (!safeTitle) return res.status(400).json({ success: false, message: 'Homework title is required' });
    if (!safeInstructions) return res.status(400).json({ success: false, message: 'Homework instructions are required' });

    const classItem = await resolveClass({ classId, className, grade, schoolCode: req.user.schoolCode });
    const resolvedClassId = classItem?.id || classId || null;
    const resolvedClassName = classItem?.name || className || grade || null;

    let targetStudentIds = Array.isArray(studentIds) ? studentIds.filter(Boolean) : [];
    if (classItem && targetStudentIds.length === 0) {
      const students = await getStudentsForClass(classItem, req.user.schoolCode);
      targetStudentIds = students.map(s => s.id);
    }

    const task = await HomeTask.create({
      title: safeTitle,
      instructions: safeInstructions,
      type: 'teacher',
      subject: safeSubject,
      gradeLevel: classItem?.grade || resolvedClassName || 'all',
      difficulty: difficulty || 'medium',
      estimatedMinutes: Number(estimatedMinutes || 30),
      points: Number(points || 10),
      competencyId: null,
      learningOutcomeId: null,
      createdBy: teacher.id,
      createdByUserId: req.user.id,
      schoolCode: req.user.schoolCode,
      classId: resolvedClassId,
      className: resolvedClassName,
      dueDate: dueDate || null,
      materials: ''
    });

    const assignments = targetStudentIds.map(sid => ({
      studentId: sid,
      taskId: task.id,
      classId: resolvedClassId,
      schoolCode: req.user.schoolCode,
      assignedAt: new Date(),
      status: 'pending'
    }));
    if (assignments.length) await HomeTaskAssignment.bulkCreate(assignments, { ignoreDuplicates: true });

    res.status(201).json({
      success: true,
      message: assignments.length ? 'Homework assigned successfully' : 'Homework saved, but no matching students were found for the selected class',
      data: {
        task: task.toJSON(),
        assignedCount: assignments.length,
        taskId: task.id,
        classId: resolvedClassId || null,
        className: resolvedClassName || null
      }
    });
  } catch (error) {
    console.error('Create homework error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTeacherAssignments = async (req, res) => {
  try {
    await ensureRuntimeSchema().catch(() => null);
    const teacher = await getTeacherFromUser(req.user.id);
    if (!teacher) return res.status(403).json({ success: false, message: 'Not a teacher' });

    const tasks = await HomeTask.findAll({
      where: {
        [Op.or]: [
          { createdBy: teacher.id },
          { createdByUserId: req.user.id }
        ],
        [Op.and]: [
          { [Op.or]: [{ schoolCode: req.user.schoolCode }, { schoolCode: null }] }
        ]
      },
      include: [{ model: HomeTaskAssignment, required: false }],
      order: [['createdAt', 'DESC']]
    });

    res.json({ success: true, data: tasks.map(t => {
      const json = t.toJSON();
      const assignments = json.HomeTaskAssignments || json.HomeTaskAssignments || [];
      return {
        ...json,
        assignedCount: assignments.length,
        submittedCount: assignments.filter(a => a.status === 'submitted').length,
        pendingCount: assignments.filter(a => a.status !== 'submitted').length
      };
    }) });
  } catch (error) {
    console.error('Get teacher assignments error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getStudentAssignments = async (req, res) => {
  try {
    await ensureRuntimeSchema().catch(() => null);
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.status(403).json({ success: false, message: 'Not a student' });

    const assignments = await HomeTaskAssignment.findAll({
      where: {
        studentId: student.id,
        [Op.or]: [{ schoolCode: req.user.schoolCode }, { schoolCode: null }]
      },
      include: [{
        model: HomeTask,
        required: true,
        where: { [Op.or]: [{ schoolCode: req.user.schoolCode }, { schoolCode: null }] },
        include: [{ model: Teacher, required: false, include: [{ model: User, attributes: ['id', 'name'], required: false }] }]
      }],
      order: [['assignedAt', 'DESC']]
    });

    const data = assignments.map(a => {
      const row = a.toJSON();
      const task = row.HomeTask || {};
      return {
        id: row.id,
        assignmentId: row.id,
        studentId: row.studentId,
        taskId: row.taskId,
        status: row.status || 'pending',
        assignedAt: row.assignedAt,
        submittedAt: row.completedAt || null,
        studentFeedback: row.studentFeedback || {},
        parentFeedback: row.parentFeedback || {},
        pointsEarned: row.pointsEarned || null,
        schoolCode: row.schoolCode || task.schoolCode || null,
        HomeTask: {
          id: task.id,
          title: task.title || 'Untitled Homework',
          instructions: task.instructions || '',
          description: task.instructions || '',
          subject: task.subject || 'General',
          dueDate: task.dueDate || null,
          classId: task.classId || null,
          className: task.className || null,
          estimatedMinutes: task.estimatedMinutes || null,
          points: task.points || 0,
          difficulty: task.difficulty || null,
          attachments: task.attachments || [],
          teacherNote: task.teacherNote || '',
          teacherName: task.Teacher?.User?.name || 'Not assigned',
          createdAt: task.createdAt
        }
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get student assignments error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitAssignment = async (req, res) => {
  try {
    await ensureRuntimeSchema().catch(() => null);
    const { assignmentId } = req.params;
    const { fileUrl, comment } = req.body;
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.status(403).json({ success: false, message: 'Not a student' });
    const assignment = await HomeTaskAssignment.findOne({ where: { id: assignmentId, studentId: student.id } });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });

    await assignment.update({
      status: 'submitted',
      submittedAt: new Date(),
      studentFeedback: { fileUrl, comment }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Submit assignment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
