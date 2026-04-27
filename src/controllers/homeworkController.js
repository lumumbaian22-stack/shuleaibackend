const { HomeTask, HomeTaskAssignment, Student, Teacher, Class } = require('../models');

exports.createAssignment = async (req, res) => {
    try {
        const { title, instructions, subject, dueDate, classId, studentIds } = req.body;
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) return res.status(403).json({ success: false, message: 'Not a teacher' });

        // Create HomeTask – competencyId can be null now
        const task = await HomeTask.create({
            title,
            instructions,
            type: 'teacher',
            subject,
            gradeLevel: 'all',
            difficulty: 'medium',
            estimatedMinutes: 30,
            points: 10,
            competencyId: null,          // now allowed after ALTER COLUMN
            dueDate: dueDate || null,    // now column exists
            materials: '',
            isActive: true
        });

        // Determine target students
        let targetStudentIds = studentIds || [];
        if (classId && !targetStudentIds.length) {
            const classItem = await Class.findByPk(classId);
            if (!classItem) {
                return res.status(404).json({ success: false, message: 'Class not found' });
            }
            const students = await Student.findAll({ where: { grade: classItem.name } });
            targetStudentIds = students.map(s => s.id);
        }

        if (!targetStudentIds.length) {
            return res.status(400).json({ success: false, message: 'No students to assign' });
        }

        // Create assignments
        const assignments = targetStudentIds.map(studentId => ({
            studentId,
            taskId: task.id,
            assignedAt: new Date(),
            status: 'pending'
        }));
        await HomeTaskAssignment.bulkCreate(assignments);

        res.json({ success: true, message: 'Homework assigned', taskId: task.id });
    } catch (error) {
        console.error('Create homework error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getTeacherAssignments = async (req, res) => {
    try {
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) return res.status(403).json({ success: false, message: 'Not a teacher' });

        const tasks = await HomeTask.findAll({
            where: { createdBy: teacher.id },
            include: [{ model: HomeTaskAssignment }],   // correct association alias
            order: [['createdAt', 'DESC']]
        });
        res.json({ success: true, data: tasks });
    } catch (error) {
        console.error('Get teacher assignments error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getStudentAssignments = async (req, res) => {
    try {
        const student = await Student.findOne({ where: { userId: req.user.id } });
        if (!student) return res.status(403).json({ success: false, message: 'Not a student' });

        const assignments = await HomeTaskAssignment.findAll({
            where: { studentId: student.id },
            include: [{ model: HomeTask }],
            order: [['assignedAt', 'DESC']]
        });
        res.json({ success: true, data: assignments });
    } catch (error) {
        console.error('Get student assignments error:', error);
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
