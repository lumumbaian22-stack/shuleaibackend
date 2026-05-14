const { Op } = require('sequelize');
const { HomeTask, HomeTaskAssignment, Student, Teacher, Class, User, TeacherSubjectAssignment, ClassroomThread } = require('../models');

function cleanString(value, fallback = '') {
  const s = String(value ?? '').trim();
  return s || fallback;
}

function parseTaskMaterials(value) {
  if (!value) return { text: '', discussionThreadId: null };
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') return { text: parsed.text || '', discussionThreadId: parsed.discussionThreadId || null };
  } catch (_) {}
  return { text: String(value), discussionThreadId: null };
}

function serializeTaskMaterials({ text = '', discussionThreadId = null } = {}) {
  return JSON.stringify({ text, discussionThreadId });
}

function decorateHomeworkTask(task) {
  const json = typeof task.toJSON === 'function' ? task.toJSON() : { ...task };
  const meta = parseTaskMaterials(json.materials);
  return { ...json, materials: meta.text, discussionThreadId: meta.discussionThreadId };
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
      difficulty,
      openDiscussion = false,
      materials = ''
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
      materials: serializeTaskMaterials({ text: materials || '', discussionThreadId: null })
    });

    let discussionThread = null;
    if (openDiscussion) {
      discussionThread = await ClassroomThread.create({
        schoolCode: req.user.schoolCode,
        classId: resolvedClassId,
        subject: safeSubject,
        topic: safeTitle,
        content: `Homework discussion: ${safeInstructions}`,
        teacherId: teacher.id,
        createdBy: req.user.id,
        isPinned: false,
        metadata: { source: 'homework', homeworkId: task.id, homeworkTitle: safeTitle, homeworkDueDate: dueDate || null, className: resolvedClassName, approvalStatus: 'approved', createdByRole: 'teacher' }
      });
      task.materials = serializeTaskMaterials({ text: materials || '', discussionThreadId: discussionThread.id });
      await task.save();
    }

    const assignments = targetStudentIds.map(sid => ({
      studentId: sid,
      taskId: task.id,
        discussionThreadId: discussionThread?.id || null,
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
        task: decorateHomeworkTask(task),
        assignedCount: assignments.length,
        taskId: task.id,
        discussionThreadId: discussionThread?.id || null,
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
        ...decorateHomeworkTask(json),
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
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.status(403).json({ success: false, message: 'Not a student' });

    let assignments = await HomeTaskAssignment.findAll({
      where: { studentId: student.id },
      include: [{ model: HomeTask }],
      order: [['assignedAt', 'DESC']]
    });

    if (!assignments.length && student.classId) {
      const classTasks = await HomeTask.findAll({
        where: {
          schoolCode: req.user.schoolCode,
          isActive: true,
          classId: student.classId
        },
        order: [['createdAt', 'DESC']]
      });
      for (const task of classTasks) {
        const [assignment] = await HomeTaskAssignment.findOrCreate({
          where: { studentId: student.id, taskId: task.id },
          defaults: { classId: student.classId, schoolCode: req.user.schoolCode, assignedAt: new Date(), status: 'pending' }
        });
        assignment.HomeTask = task;
      }
      assignments = await HomeTaskAssignment.findAll({
        where: { studentId: student.id },
        include: [{ model: HomeTask }],
        order: [['assignedAt', 'DESC']]
      });
    }

    res.json({ success: true, data: assignments.map(a => {
      const json = a.toJSON();
      if (json.HomeTask) json.HomeTask = decorateHomeworkTask(json.HomeTask);
      return json;
    }) });
  } catch (error) {
    console.error('Get student assignments error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


exports.getTeacherAssignment = async (req, res) => {
  try {
    const teacher = await getTeacherFromUser(req.user.id);
    if (!teacher) return res.status(403).json({ success: false, message: 'Not a teacher' });
    const task = await HomeTask.findOne({
      where: {
        id: req.params.taskId,
        [Op.or]: [{ createdBy: teacher.id }, { createdByUserId: req.user.id }],
        [Op.and]: [{ [Op.or]: [{ schoolCode: req.user.schoolCode }, { schoolCode: null }] }]
      },
      include: [{ model: HomeTaskAssignment, required: false, include: [{ model: Student, include: [{ model: User, attributes: ['id','name','email'] }] }] }]
    });
    if (!task) return res.status(404).json({ success: false, message: 'Homework not found' });
    const json = decorateHomeworkTask(task);
    const assignments = task.HomeTaskAssignments || [];
    res.json({ success: true, data: { ...json, HomeTaskAssignments: assignments, assignedCount: assignments.length, submittedCount: assignments.filter(a => a.status === 'submitted').length, pendingCount: assignments.filter(a => a.status !== 'submitted').length } });
  } catch (error) {
    console.error('Get teacher homework error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateTeacherAssignment = async (req, res) => {
  try {
    const teacher = await getTeacherFromUser(req.user.id);
    if (!teacher) return res.status(403).json({ success: false, message: 'Not a teacher' });
    const task = await HomeTask.findOne({ where: { id: req.params.taskId, [Op.or]: [{ createdBy: teacher.id }, { createdByUserId: req.user.id }] } });
    if (!task) return res.status(404).json({ success: false, message: 'Homework not found' });
    const currentMeta = parseTaskMaterials(task.materials);
    const allowed = ['title','instructions','subject','dueDate','difficulty','estimatedMinutes','points'];
    for (const key of allowed) if (req.body[key] !== undefined) task[key] = req.body[key];
    if (req.body.materials !== undefined) task.materials = serializeTaskMaterials({ text: req.body.materials, discussionThreadId: currentMeta.discussionThreadId });
    await task.save();
    res.json({ success: true, data: decorateHomeworkTask(task) });
  } catch (error) {
    console.error('Update teacher homework error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteTeacherAssignment = async (req, res) => {
  try {
    const teacher = await getTeacherFromUser(req.user.id);
    if (!teacher) return res.status(403).json({ success: false, message: 'Not a teacher' });
    const task = await HomeTask.findOne({ where: { id: req.params.taskId, [Op.or]: [{ createdBy: teacher.id }, { createdByUserId: req.user.id }] } });
    if (!task) return res.status(404).json({ success: false, message: 'Homework not found' });
    await HomeTaskAssignment.destroy({ where: { taskId: task.id } });
    await task.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error('Delete teacher homework error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { fileUrl, comment } = req.body;
    const assignment = await HomeTaskAssignment.findByPk(assignmentId);
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
