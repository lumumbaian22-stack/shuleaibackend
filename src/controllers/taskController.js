// src/controllers/taskController.js - Using teacherId
const { Task } = require('../models');
const { createAlert } = require('../services/notificationService');

// @desc    Get user's tasks
// @route   GET /api/tasks
// @access  Private
exports.getTasks = async (req, res) => {
  try {
    const tasks = await Task.findAll({
      where: { teacherId: req.user.id },
      order: [['dueDate', 'ASC'], ['createdAt', 'DESC']]
    });
    res.json({ success: true, data: tasks });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a new task
// @route   POST /api/tasks
// @access  Private
exports.createTask = async (req, res) => {
  try {
    const { title, description, dueDate, priority, category } = req.body;
    
    if (!title) {
      return res.status(400).json({ success: false, message: 'Task title is required' });
    }
    
    const task = await Task.create({
      teacherId: req.user.id,
      title,
      description: description || null,
      dueDate: dueDate || null,
      priority: priority || 'medium',
      status: 'pending',
      category: category || 'general'
    });
    
    // Create reminder alert if due date is soon (within 3 days)
    if (dueDate) {
      const due = new Date(dueDate);
      const now = new Date();
      const daysUntilDue = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
      
      if (daysUntilDue <= 3 && daysUntilDue >= 0) {
        await createAlert({
          userId: req.user.id,
          role: req.user.role,
          type: 'system',
          severity: daysUntilDue <= 1 ? 'warning' : 'info',
          title: 'Task Due Soon',
          message: `"${title}" is due in ${daysUntilDue} day(s)`,
          data: { taskId: task.id }
        });
      }
    }
    
    res.status(201).json({ success: true, data: task });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update a task
// @route   PUT /api/tasks/:id
// @access  Private
exports.updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findOne({ 
      where: { 
        id: id,
        teacherId: req.user.id 
      } 
    });
    
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    
    await task.update(req.body);
    res.json({ success: true, data: task });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete a task
// @route   DELETE /api/tasks/:id
// @access  Private
exports.deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findOne({ 
      where: { 
        id: id,
        teacherId: req.user.id 
      } 
    });
    
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    
    await task.destroy();
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Complete a task
// @route   POST /api/tasks/:id/complete
// @access  Private
exports.completeTask = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findOne({ 
      where: { 
        id: id,
        teacherId: req.user.id 
      } 
    });
    
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    
    task.status = 'completed';
    task.completedAt = new Date();
    await task.save();
    
    // Create completion alert
    await createAlert({
      userId: req.user.id,
      role: req.user.role,
      type: 'system',
      severity: 'success',
      title: 'Task Completed',
      message: `Task "${task.title}" has been marked as completed.`,
      data: { taskId: task.id }
    });
    
    res.json({ success: true, data: task });
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
