// src/controllers/helpController.js
const { Op } = require('sequelize');
const { User } = require('../models');

// Help articles database
const helpArticles = {
  admin: [
    { id: 1, title: 'How to add a student', content: 'Go to Students section, click "Add Student", fill in the student details including name, grade, and parent email. The student will receive an ELIMUID automatically.', keywords: ['add', 'student', 'create', 'enroll'], steps: ['Navigate to Students', 'Click Add Student', 'Fill in details', 'Click Save'] },
    { id: 2, title: 'How to approve a teacher', content: 'Go to Teacher Approvals, review the teacher\'s details and qualifications, then click Approve or Reject. Approved teachers will receive their employee ID.', keywords: ['teacher', 'approve', 'hire', 'staff'], steps: ['Go to Teacher Approvals', 'Review teacher details', 'Click Approve or Reject'] },
    { id: 3, title: 'How to generate duty roster', content: 'Go to Duty Management, select the date range, click Generate Roster. The system will automatically assign duties based on fairness and teacher preferences.', keywords: ['duty', 'roster', 'schedule', 'generate', 'assign'], steps: ['Go to Duty Management', 'Select start and end dates', 'Click Generate Roster'] },
    { id: 4, title: 'How to change curriculum', content: 'Go to Settings, select the new curriculum from the dropdown, click Save. All users will see updated grading scales.', keywords: ['curriculum', 'cbc', '844', 'british', 'american', 'change'], steps: ['Go to School Settings', 'Select new curriculum', 'Click Save Settings'] },
    { id: 5, title: 'How to view student performance', content: 'Go to Students, click on any student to view their details, grades, attendance, and teacher comments.', keywords: ['student', 'performance', 'grades', 'attendance'], steps: ['Go to Students', 'Click on a student name', 'View their details'] },
    { id: 6, title: 'How to manage custom subjects', content: 'Go to Custom Subjects, enter the subject name, click Add. Custom subjects will appear in grade entry and student reports.', keywords: ['subject', 'custom', 'add', 'manage'], steps: ['Go to Custom Subjects', 'Enter subject name', 'Click Add Subject'] }
  ],
  teacher: [
    { id: 1, title: 'How to take attendance', content: 'Go to Attendance, mark each student as Present/Absent/Late, add notes if needed, click Save Attendance.', keywords: ['attendance', 'present', 'absent', 'mark', 'register'], steps: ['Go to Attendance', 'Mark status for each student', 'Add notes', 'Click Save Attendance'] },
    { id: 2, title: 'How to enter grades', content: 'Go to Grades, select subject and assessment type, enter scores for each student, click Save. Grades are automatically calculated.', keywords: ['grade', 'mark', 'score', 'exam', 'test', 'enter'], steps: ['Select subject', 'Select assessment type', 'Enter scores', 'Click Save'] },
    { id: 3, title: 'How to upload students via CSV', content: 'Go to My Students, click "Upload Students", download the template, fill it, then upload. Students receive ELIMUIDs automatically.', keywords: ['csv', 'upload', 'students', 'bulk', 'import'], steps: ['Download template', 'Fill student data', 'Upload CSV file', 'Review and confirm'] },
    { id: 4, title: 'How to check in for duty', content: 'Go to Dashboard, find the Duty Card, click Check In when you arrive for your duty.', keywords: ['duty', 'checkin', 'check in', 'responsibility'], steps: ['Go to Dashboard', 'Find Duty Card', 'Click Check In'] },
    { id: 5, title: 'How to view my class', content: 'Go to My Class to see all students in your class, their attendance, and overall performance.', keywords: ['class', 'students', 'dashboard'], steps: ['Go to My Class', 'View student list', 'Click on student for details'] }
  ],
  parent: [
    { id: 1, title: 'How to view child progress', content: 'Select your child from the dropdown, view grades, attendance, and teacher comments on the dashboard.', keywords: ['progress', 'grades', 'attendance', 'child', 'performance'], steps: ['Select your child', 'View dashboard', 'Check grades and attendance'] },
    { id: 2, title: 'How to report absence', content: 'Click Report Absence, select the date, enter reason, submit. The class teacher will be notified.', keywords: ['absence', 'absent', 'report', 'sick', 'leave'], steps: ['Click Report Absence', 'Select date', 'Enter reason', 'Submit'] },
    { id: 3, title: 'How to make payment', content: 'Go to Payments, select your child, choose a plan, enter amount, complete payment.', keywords: ['payment', 'pay', 'fee', 'school fees', 'money'], steps: ['Go to Payments', 'Select child', 'Choose plan', 'Enter amount', 'Complete payment'] },
    { id: 4, title: 'How to message teacher', content: 'Go to Messages, select a teacher, type your message, click Send. Teachers will respond within 24 hours.', keywords: ['message', 'chat', 'teacher', 'contact'], steps: ['Go to Messages', 'Select recipient', 'Type message', 'Click Send'] }
  ],
  student: [
    { id: 1, title: 'How to view my grades', content: 'Go to My Grades to see all your scores, subject averages, and overall performance.', keywords: ['grade', 'score', 'result', 'performance'], steps: ['Go to My Grades', 'View subject scores', 'Check overall average'] },
    { id: 2, title: 'How to use AI Tutor', content: 'Type your question in AI Tutor chat, get instant help with any subject from the AI assistant.', keywords: ['ai', 'tutor', 'help', 'question', 'assistant'], steps: ['Go to AI Tutor', 'Type your question', 'Get AI response'] },
    { id: 3, title: 'How to join study groups', content: 'Go to Study Chat to connect with other students, share notes, and study together.', keywords: ['study', 'chat', 'group', 'discussion'], steps: ['Go to Study Chat', 'Join a group', 'Start discussing'] }
  ]
};

// @desc    Get help articles for user role
// @route   GET /api/help/articles
// @access  Private
exports.getArticles = async (req, res) => {
  try {
    const role = req.user.role;
    const articles = helpArticles[role] || helpArticles.admin;
    res.json({ success: true, data: articles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Search help articles
// @route   GET /api/help/search
// @access  Private
exports.searchArticles = async (req, res) => {
  try {
    const { q } = req.query;
    const role = req.user.role;
    const articles = helpArticles[role] || helpArticles.admin;
    
    if (!q) {
      return res.json({ success: true, data: articles });
    }
    
    const searchTerm = q.toLowerCase();
    const filtered = articles.filter(article => 
      article.title.toLowerCase().includes(searchTerm) ||
      article.content.toLowerCase().includes(searchTerm) ||
      article.keywords.some(k => k.toLowerCase().includes(searchTerm))
    );
    
    res.json({ success: true, data: filtered });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single article by ID
// @route   GET /api/help/articles/:id
// @access  Private
exports.getArticle = async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user.role;
    const articles = helpArticles[role] || helpArticles.admin;
    const article = articles.find(a => a.id === parseInt(id));
    
    if (!article) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }
    
    res.json({ success: true, data: article });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
