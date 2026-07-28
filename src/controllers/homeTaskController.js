const { sequelize, HomeTask, HomeTaskAssignment, Student, Competency, LearningOutcome, StudentCompetencyProgress, AcademicRecord, Parent, User } = require('../models');
const { Op } = require('sequelize');
const ownership = require('../services/parentOwnershipService');

// Get today's recommendations for a student (parent view)
exports.getTodayTasks = async (req, res) => {
  try {
    const { studentId } = req.query;
    if (!studentId) return res.status(400).json({ success: false, message: 'Student ID required' });

    const student = await (Student.unscoped ? Student.unscoped() : Student).findOne({
      where: { id: Number(studentId) },
      include: [{ model: User, required: true, where: { schoolCode: req.user.schoolCode }, attributes: ['id','name','schoolCode'] }]
    });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found in this school' });

    if (req.user.role === 'parent') {
      await ownership.assertParentOwnsStudent({ parentUserId: req.user.id, studentId: student.id, schoolCode: req.user.schoolCode });
    } else if (req.user.role === 'student' && Number(student.userId) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'You can only view your own learning tasks.' });
    }

    // First return teacher-assigned pending homework if available.
    try {
      const assignments = await HomeTaskAssignment.findAll({
        where: { studentId, status: { [Op.in]: ['pending', 'assigned'] } },
        include: [{
          model: HomeTask,
          required: true,
          where: { [Op.or]: [{ schoolCode: req.user.schoolCode }, { schoolCode: null }] }
        }],
        order: [['assignedAt', 'DESC']],
        limit: 10
      });

      const assignedTasks = assignments
        .filter(a => a.HomeTask)
        .map(a => ({
          ...a.HomeTask.toJSON(),
          assignmentId: a.id,
          status: a.status,
          assignedAt: a.assignedAt,
          source: 'teacher-assigned'
        }));

      if (assignedTasks.length > 0) {
        return res.json({ success: true, data: assignedTasks });
      }
    } catch (assignmentError) {
      console.warn('Could not load assigned home tasks; falling back to recommendations:', assignmentError.message);
    }

    // 1. Get weak competencies (AE/BE)
    const progress = await StudentCompetencyProgress.findAll({
      where: { studentId, level: { [Op.in]: ['AE', 'BE'] } },
      include: [{ model: LearningOutcome, include: [{ model: Competency }] }]
    });
    const weakCompetencyIds = [...new Set(progress.map(p => p.LearningOutcome?.competencyId).filter(Boolean))];

    // 2. Get weak subjects (average < 50)
    const records = await AcademicRecord.findAll({ where: { studentId, schoolCode: req.user.schoolCode, isPublished: true } });
    const subjectScores = {};
    records.forEach(r => {
      if (!subjectScores[r.subject]) subjectScores[r.subject] = { total: 0, count: 0 };
      subjectScores[r.subject].total += r.score;
      subjectScores[r.subject].count++;
    });
    const weakSubjects = Object.entries(subjectScores)
      .filter(([_, data]) => (data.total / data.count) < 50)
      .map(([subject]) => subject);

    // 3. Get recently assigned tasks to exclude
    const assignedTasks = await HomeTaskAssignment.findAll({
      where: { studentId, assignedAt: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      attributes: ['taskId']
    });
    const excludedTaskIds = assignedTasks.map(a => a.taskId);

    // Helper: get random tasks
    const getRandomTasks = async (whereClause, limit) => {
      const tasks = await HomeTask.findAll({
        where: {
          ...whereClause,
          [Op.or]: [{ schoolCode: req.user.schoolCode }, { schoolCode: null }]
        }
      });
      return tasks.sort(() => 0.5 - Math.random()).slice(0, limit);
    };

    const selectedTasks = [];

    // From weak competencies
    for (const compId of weakCompetencyIds.slice(0, 2)) {
      const tasks = await getRandomTasks({
        gradeLevel: student.grade,
        competencyId: compId,
        difficulty: { [Op.in]: ['Easy', 'Medium'] },
        id: { [Op.notIn]: excludedTaskIds },
        isActive: true
      }, 1);
      if (tasks.length) selectedTasks.push(tasks[0]);
    }

    // Fill up to 5 tasks with variety
    if (selectedTasks.length < 5) {
      const types = ['Practice', 'Application', 'Reflection'];
      for (const type of types) {
        if (selectedTasks.length >= 5) break;
        const tasks = await getRandomTasks({
          gradeLevel: student.grade,
          type,
          id: { [Op.notIn]: excludedTaskIds },
          isActive: true
        }, 1);
        if (tasks.length && !selectedTasks.some(t => t.id === tasks[0].id)) {
          selectedTasks.push(tasks[0]);
        }
      }
    }

    // If still less than 5, grab any active tasks
    if (selectedTasks.length < 5) {
      const remaining = await getRandomTasks({
        gradeLevel: student.grade,
        id: { [Op.notIn]: excludedTaskIds },
        isActive: true
      }, 5 - selectedTasks.length);
      for (const task of remaining) {
        if (!selectedTasks.some(t => t.id === task.id)) {
          selectedTasks.push(task);
        }
      }
    }

    const recommendationRows = [];
    for (const task of selectedTasks.slice(0, 5)) {
      let assignment = await HomeTaskAssignment.findOne({
        where: { studentId: student.id, taskId: task.id, status: { [Op.in]: ['pending', 'assigned'] } },
        order: [['assignedAt', 'DESC']]
      });
      if (!assignment) {
        assignment = await HomeTaskAssignment.create({
          studentId: student.id,
          taskId: task.id,
          status: 'pending',
          assignedAt: new Date(),
          schoolCode: req.user.schoolCode,
          classId: student.classId || null
        });
      }
      recommendationRows.push({
        ...task.toJSON(),
        assignmentId: assignment.id,
        status: assignment.status,
        assignedAt: assignment.assignedAt,
        source: task.schoolCode ? 'school-recommendation' : 'learning-library'
      });
    }

    res.json({ success: true, data: recommendationRows });
  } catch (error) {
    console.error('Get today tasks error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

exports.completeTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { parentFeedback, studentFeedback } = req.body;
    const data = await sequelize.transaction(async transaction => {
      const parent = req.user.role === 'parent'
        ? await Parent.findOne({ where: { userId: req.user.id }, transaction })
        : null;
      if (req.user.role === 'parent' && !parent) {
        throw Object.assign(new Error('Parent not found'), { status: 404 });
      }
      const ownStudent = req.user.role === 'student'
        ? await Student.findOne({
          where: { userId: req.user.id },
          include: [{ model: User, required: true, where: { schoolCode: req.user.schoolCode }, attributes: ['id','schoolCode','name'] }],
          transaction
        })
        : null;
      if (req.user.role === 'student' && !ownStudent) {
        throw Object.assign(new Error('Student profile not found'), { status: 404 });
      }

      let assignment = await HomeTaskAssignment.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      // Older cards passed HomeTask.id instead of HomeTaskAssignment.id. Resolve
      // that ID only inside the signed-in user's own student scope.
      if (!assignment) {
        const linkedIds = req.user.role === 'parent'
          ? await ownership.listOwnedStudentIds({ parentUserId: req.user.id, schoolCode: req.user.schoolCode, transaction })
          : [ownStudent.id];
        assignment = await HomeTaskAssignment.findOne({
          where: { taskId: id, studentId: { [Op.in]: linkedIds.length ? linkedIds : [-1] } },
          order: [['assignedAt', 'DESC']],
          transaction,
          lock: transaction.LOCK.UPDATE
        });
      }
      if (!assignment) {
        throw Object.assign(new Error('Task assignment not found for this child.'), { status: 404 });
      }

      const [task, student] = await Promise.all([
        HomeTask.findByPk(assignment.taskId, { transaction }),
        Student.findOne({
          where: { id: assignment.studentId },
          include: [{ model: User, required: true, where: { schoolCode: req.user.schoolCode }, attributes: ['id','schoolCode','name'] }],
          transaction,
          lock: transaction.LOCK.UPDATE
        })
      ]);
      if (!task || !student) {
        throw Object.assign(new Error('Task assignment is no longer linked to an active student and task.'), { status: 404 });
      }
      if (
        (assignment.schoolCode && String(assignment.schoolCode) !== String(req.user.schoolCode))
        || (task.schoolCode && String(task.schoolCode) !== String(req.user.schoolCode))
      ) {
        throw Object.assign(new Error('Task assignment belongs to another school.'), { status: 403 });
      }

      const allowed = req.user.role === 'parent'
        ? await ownership.ownsStudentId({
          parentUserId: req.user.id,
          parentId: parent.id,
          studentId: student.id,
          schoolCode: req.user.schoolCode,
          transaction
        })
        : Number(student.id) === Number(ownStudent.id);
      if (!allowed) {
        throw Object.assign(new Error('You cannot update a task assigned to another student.'), { status: 403 });
      }
      if (['completed','submitted','graded','reviewed'].includes(String(assignment.status || '').toLowerCase())) {
        return { assignment, studentPoints: student.points || 0, alreadyCompleted: true };
      }

      const awardedPoints = Math.max(0, Number(task.points) || 0);
      assignment.status = 'completed';
      assignment.completedAt = new Date();
      if (req.user.role === 'parent') assignment.parentFeedback = parentFeedback || {};
      if (req.user.role === 'student') assignment.studentFeedback = studentFeedback || {};
      assignment.pointsEarned = awardedPoints;
      await assignment.save({ transaction });

      student.points = Math.max(0, Number(student.points) || 0) + awardedPoints;
      await student.save({ transaction });
      return { assignment, studentPoints: student.points, alreadyCompleted: false };
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};
