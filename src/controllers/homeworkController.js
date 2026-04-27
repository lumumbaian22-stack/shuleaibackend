const { HomeTask, HomeTaskAssignment, Student, Teacher } = require('../models');

exports.createAssignment = async (req, res) => {
    try {
        const { title, instructions, subject, dueDate, classId, studentIds } = req.body;
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) return res.status(403).json({ success: false });

        // Create HomeTask
        const task = await HomeTask.create({
            title, instructions, type: 'teacher', subject, gradeLevel: 'all', difficulty: 'medium', estimatedMinutes: 30, points: 10,
            competencyId: null, createdBy: teacher.id, dueDate, materials: ''
        });

        // If classId provided, assign to all students in that class
        let targetStudentIds = studentIds || [];
        if (classId && !studentIds) {
            const students = await Student.findAll({ where: { grade: (await Class.findByPk(classId)).name } });
            targetStudentIds = students.map(s => s.id);
        }

        // Create assignments
        const assignments = targetStudentIds.map(studentId => ({
            studentId, taskId: task.id, assignedAt: new Date(), status: 'pending'
        }));
        await HomeTaskAssignment.bulkCreate(assignments);

        res.json({ success: true, message: 'Homework assigned' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getStudentAssignments = async (req, res) => {
    try {
        const student = await Student.findOne({ where: { userId: req.user.id } });
        const assignments = await HomeTaskAssignment.findAll({
            where: { studentId: student.id },
            include: [{ model: HomeTask }],
            order: [['assignedAt', 'DESC']]
        });
        res.json({ success: true, data: assignments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.submitAssignment = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const { fileUrl, comment } = req.body;
        await HomeTaskAssignment.update(
            { status: 'submitted', submittedAt: new Date(), studentFeedback: { fileUrl, comment } },
            { where: { id: assignmentId } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getTeacherAssignments = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    if (!teacher) return res.status(403).json({ success: false, message: 'Not a teacher' });

    // Find HomeTasks created by this teacher
    const tasks = await HomeTask.findAll({
      where: { createdBy: teacher.id },
      include: [{ model: HomeTaskAssignment, as: 'assignments' }], // if you have associations
      order: [['createdAt', 'DESC']]
    });

    // Format response to include class name etc.
    const result = [];
    for (const task of tasks) {
      const classIds = task.assignments?.map(a => a.student?.grade) || [];
      const uniqueClasses = [...new Set(classIds)];
      result.push({
        id: task.id,
        title: task.title,
        instructions: task.instructions,
        subject: task.subject,
        dueDate: task.dueDate,
        className: uniqueClasses.join(', '),
        assignedCount: task.assignments?.length || 0
      });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
