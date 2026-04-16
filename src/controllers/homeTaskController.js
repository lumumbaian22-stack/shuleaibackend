const { HomeTask, HomeTaskAssignment, Student, Competency, LearningOutcome, StudentCompetencyProgress, AcademicRecord } = require('../models');
const { Op } = require('sequelize');

// Get today's recommendations for a student (parent view)
exports.getTodayTasks = async (req, res) => {
  try {
    const { studentId } = req.query;
    const student = await Student.findByPk(studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    // 1. Get weak competencies (AE/BE)
    const progress = await StudentCompetencyProgress.findAll({
      where: { studentId, level: { [Op.in]: ['AE', 'BE'] } },
      include: [{ model: LearningOutcome, include: [{ model: Competency }] }]
    });
    const weakCompetencyIds = [...new Set(progress.map(p => p.LearningOutcome.competencyId))];

    // 2. Get weak subjects (average < 50)
    const records = await AcademicRecord.findAll({ where: { studentId } });
    const subjectScores = {};
    records.forEach(r => {
      if (!subjectScores[r.subject]) subjectScores[r.subject] = { total: 0, count: 0 };
      subjectScores[r.subject].total += r.score;
      subjectScores[r.subject].count++;
    });
    const weakSubjects = Object.entries(subjectScores)
      .filter(([_, data]) => (data.total / data.count) < 50)
      .map(([subject]) => subject);

    // 3. Select tasks
    const selectedTasks = [];
    const assignedTasks = await HomeTaskAssignment.findAll({
      where: { studentId, assignedAt: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      attributes: ['taskId']
    });
    const excludedTaskIds = assignedTasks.map(a => a.taskId);

    // From weak competencies
    for (const compId of weakCompetencyIds.slice(0, 2)) {
      const task = await HomeTask.findOne({
        where: {
          gradeLevel: student.grade,
          competencyId: compId,
          difficulty: { [Op.in]: ['Easy', 'Medium'] },
          id: { [Op.notIn]: excludedTaskIds },
          isActive: true
        },
        order: sequelize.random(),
        limit: 1
      });
      if (task) selectedTasks.push(task);
    }

    // Fill up to 5 tasks with variety
    if (selectedTasks.length < 5) {
      const types = ['Practice', 'Application', 'Reflection'];
      for (const type of types) {
        if (selectedTasks.length >= 5) break;
        const task = await HomeTask.findOne({
          where: {
            gradeLevel: student.grade,
            type,
            id: { [Op.notIn]: excludedTaskIds },
            isActive: true
          },
          order: sequelize.random(),
          limit: 1
        });
        if (task && !selectedTasks.some(t => t.id === task.id)) selectedTasks.push(task);
      }
    }

    res.json({ success: true, data: selectedTasks.slice(0, 5) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.completeTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { parentFeedback, studentFeedback } = req.body;

    const assignment = await HomeTaskAssignment.findByPk(id, {
      include: [{ model: HomeTask }, { model: Student }]
    });

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const task = assignment.HomeTask;
    const student = assignment.Student;

    assignment.status = 'completed';
    assignment.completedAt = new Date();
    assignment.parentFeedback = parentFeedback || {};
    assignment.studentFeedback = studentFeedback || {};
    assignment.pointsEarned = task.points;
    await assignment.save();

    // Award points to student
    student.points = (student.points || 0) + task.points;
    await student.save();

    res.json({
      success: true,
      data: {
        assignment,
        studentPoints: student.points
      }
    });
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
