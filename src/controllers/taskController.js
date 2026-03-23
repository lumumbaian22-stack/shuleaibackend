const { Task, User, Teacher } = require('../models');

// @desc    Get teacher's tasks
// @route   GET /api/teacher/tasks
// @access  Private/Teacher
exports.getTasks = async (req, res) => {
    try {
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) {
            return res.status(404).json({ success: false, message: 'Teacher not found' });
        }
        
        const tasks = await Task.findAll({
            where: { teacherId: teacher.id },
            order: [['dueDate', 'ASC'], ['createdAt', 'DESC']]
        });
        
        res.json({ success: true, data: tasks });
    } catch (error) {
        console.error('Get tasks error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create a task
// @route   POST /api/teacher/tasks
// @access  Private/Teacher
exports.createTask = async (req, res) => {
    try {
        const { title, description, dueDate, priority } = req.body;
        
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        if (!teacher) {
            return res.status(404).json({ success: false, message: 'Teacher not found' });
        }
        
        const task = await Task.create({
            teacherId: teacher.id,
            title,
            description,
            dueDate: dueDate || null,
            priority: priority || 'medium',
            completed: false
        });
        
        res.status(201).json({ success: true, data: task });
    } catch (error) {
        console.error('Create task error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update task
// @route   PUT /api/teacher/tasks/:taskId
// @access  Private/Teacher
exports.updateTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { completed, title, description, dueDate, priority } = req.body;
        
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        const task = await Task.findOne({ where: { id: taskId, teacherId: teacher.id } });
        
        if (!task) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }
        
        await task.update({
            completed: completed !== undefined ? completed : task.completed,
            title: title || task.title,
            description: description !== undefined ? description : task.description,
            dueDate: dueDate !== undefined ? dueDate : task.dueDate,
            priority: priority || task.priority,
            completedAt: completed ? new Date() : null
        });
        
        res.json({ success: true, data: task });
    } catch (error) {
        console.error('Update task error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete task
// @route   DELETE /api/teacher/tasks/:taskId
// @access  Private/Teacher
exports.deleteTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        
        const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
        const task = await Task.findOne({ where: { id: taskId, teacherId: teacher.id } });
        
        if (!task) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }
        
        await task.destroy();
        
        res.json({ success: true, message: 'Task deleted' });
    } catch (error) {
        console.error('Delete task error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
