const { HomeTask, HomeTaskAssignment, Student, Teacher, Class } = require('../models');

exports.createAssignment = async (req, res) => {
    try {
        const { Op } = require('sequelize');
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

        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) return res.status(403).json({ success: false, message: 'Teacher account not found' });

        const safeTitle = String(title || '').trim();
        const safeSubject = String(subject || 'General').trim();
        const safeInstructions = String(instructions || description || content || '').trim();

        if (!safeTitle) return res.status(400).json({ success: false, message: 'Homework title is required' });
        if (!safeInstructions) return res.status(400).json({ success: false, message: 'Homework instructions are required' });

        let resolvedClassId = classId || null;
        let classItem = null;
        if (resolvedClassId) {
            classItem = await Class.findOne({ where: { id: resolvedClassId, schoolCode: req.user.schoolCode, isActive: true } });
        }
        if (!classItem && (className || grade)) {
            const name = String(className || grade).trim();
            classItem = await Class.findOne({
                where: {
                    schoolCode: req.user.schoolCode,
                    isActive: true,
                    [Op.or]: [
                        { name },
                        { grade: name },
                        { name: { [Op.iLike]: `%${name}%` } },
                        { grade: { [Op.iLike]: `%${name}%` } }
                    ]
                }
            });
            if (classItem) resolvedClassId = classItem.id;
        }

        const task = await HomeTask.create({
            title: safeTitle,
            instructions: safeInstructions,
            type: 'teacher',
            subject: safeSubject,
            gradeLevel: classItem?.grade || className || grade || 'all',
            difficulty: difficulty || 'medium',
            estimatedMinutes: Number(estimatedMinutes || 30),
            points: Number(points || 10),
            competencyId: null,
            createdBy: teacher.id,
            dueDate: dueDate || null,
            materials: ''
        });

        let targetStudentIds = Array.isArray(studentIds) ? studentIds.filter(Boolean) : [];
        if (resolvedClassId && targetStudentIds.length === 0) {
            if (!classItem) classItem = await Class.findOne({ where: { id: resolvedClassId, schoolCode: req.user.schoolCode, isActive: true } });
            if (classItem) {
                const names = [...new Set([classItem.name, classItem.grade, `${classItem.grade || ''} ${classItem.stream || ''}`.trim()].filter(Boolean))];
                const students = await Student.findAll({
                    where: { grade: { [Op.in]: names }, status: 'active' },
                    include: [{ model: require('../models').User, attributes: ['id'], where: { schoolCode: req.user.schoolCode }, required: true }],
                    attributes: ['id']
                });
                targetStudentIds = students.map(s => s.id);
            }
        }

        const assignments = targetStudentIds.map(sid => ({
            studentId: sid,
            taskId: task.id,
            assignedAt: new Date(),
            status: 'pending'
        }));
        if (assignments.length) await HomeTaskAssignment.bulkCreate(assignments, { ignoreDuplicates: true });

        res.status(201).json({
            success: true,
            message: assignments.length ? 'Homework assigned' : 'Homework created, but no matching students were found for the selected class',
            data: { assignedCount: assignments.length, taskId: task.id, classId: resolvedClassId || null }
        });
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
