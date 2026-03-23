// controllers/helpController.js

// Help articles database (static content)
const HELP_ARTICLES = {
  superadmin: [
    {
      id: 'sa-1',
      title: 'How to approve a new school',
      content: 'Go to School Approvals, review school details, click Approve. The school will be activated immediately.',
      keywords: ['approve', 'school', 'activate', 'registration'],
      category: 'schools',
      steps: [
        'Navigate to School Approvals section',
        'Review the school details and admin information',
        'Click the Approve button',
        'Confirm the approval'
      ]
    },
    {
      id: 'sa-2',
      title: 'How to suspend a school',
      content: 'Find the school in Schools list, click the suspend button, enter reason. All users will be locked out.',
      keywords: ['suspend', 'block', 'deactivate', 'school'],
      category: 'schools',
      steps: [
        'Go to Schools section',
        'Find the school you want to suspend',
        'Click the suspend button (pause icon)',
        'Enter a reason for suspension',
        'Confirm the suspension'
      ]
    },
    {
      id: 'sa-3',
      title: 'How to change platform name',
      content: 'Go to Platform Settings, enter new name, click Save. Changes appear in emails and headers.',
      keywords: ['name', 'platform', 'rename', 'settings'],
      category: 'settings',
      steps: [
        'Navigate to Platform Settings',
        'Enter the new platform name',
        'Click Save Settings',
        'Refresh to see changes'
      ]
    },
    {
      id: 'sa-4',
      title: 'How to view platform health',
      content: 'Go to Platform Health to see system status, CPU usage, memory usage, and recent events.',
      keywords: ['health', 'status', 'monitor', 'performance', 'cpu', 'memory'],
      category: 'system',
      steps: [
        'Go to Platform Health section',
        'View system status indicators',
        'Check CPU and memory usage charts',
        'Review recent events log'
      ]
    }
  ],
  admin: [
    {
      id: 'admin-1',
      title: 'How to add a student',
      content: 'Go to Students, click Add Student, fill in details. The student receives an ELIMUID automatically.',
      keywords: ['add', 'student', 'create', 'enroll'],
      category: 'students',
      steps: [
        'Navigate to Students section',
        'Click Add Student button',
        'Fill in student details (name, grade, parent email)',
        'Click Save',
        'Student receives ELIMUID automatically'
      ]
    },
    {
      id: 'admin-2',
      title: 'How to approve a teacher',
      content: 'Go to Teacher Approvals, review teacher details, click Approve or Reject.',
      keywords: ['teacher', 'approve', 'hire', 'staff'],
      category: 'teachers',
      steps: [
        'Go to Teacher Approvals',
        'Review teacher information',
        'Check qualifications and subjects',
        'Click Approve to accept, or Reject with reason'
      ]
    },
    {
      id: 'admin-3',
      title: 'How to generate duty roster',
      content: 'Go to Duty Management, select dates, click Generate Roster. The system assigns duties based on points.',
      keywords: ['duty', 'roster', 'schedule', 'generate', 'assign'],
      category: 'duty',
      steps: [
        'Go to Duty Management',
        'Select start and end dates',
        'Click Generate New Roster',
        'Review the generated schedule',
        'Adjust manually if needed'
      ]
    },
    {
      id: 'admin-4',
      title: 'How to change curriculum',
      content: 'Go to Settings, select new curriculum, click Save. All users will see updated grading.',
      keywords: ['curriculum', 'cbc', '844', 'british', 'american', 'change'],
      category: 'settings',
      steps: [
        'Navigate to School Settings',
        'Find Curriculum Settings section',
        'Select the new curriculum',
        'Click Save Changes',
        'All users will see updated grading'
      ]
    }
  ],
  teacher: [
    {
      id: 'teacher-1',
      title: 'How to take attendance',
      content: 'Go to Attendance, mark each student as Present/Absent/Late, add notes, click Save Attendance.',
      keywords: ['attendance', 'present', 'absent', 'mark', 'register'],
      category: 'attendance',
      steps: [
        'Go to Attendance section',
        'Select date if not today',
        'Mark status for each student',
        'Add notes if needed',
        'Click Save Attendance'
      ]
    },
    {
      id: 'teacher-2',
      title: 'How to enter grades',
      content: 'Go to Grades, select subject and assessment type, enter scores, click Save.',
      keywords: ['grade', 'mark', 'score', 'exam', 'test', 'enter'],
      category: 'grades',
      steps: [
        'Go to Grades section',
        'Select subject from dropdown',
        'Select assessment type',
        'Enter scores for each student',
        'Click Save for each student'
      ]
    },
    {
      id: 'teacher-3',
      title: 'How to check in for duty',
      content: 'Go to Dashboard, find Duty Card, click Check In when on duty.',
      keywords: ['duty', 'checkin', 'check in', 'responsibility'],
      category: 'duty',
      steps: [
        'Go to Dashboard',
        'Find Today\'s Duty card',
        'Click Check In button when you arrive',
        'Click Check Out when duty ends'
      ]
    }
  ],
  parent: [
    {
      id: 'parent-1',
      title: 'How to view child progress',
      content: 'Select your child from the top, view grades, attendance, and teacher comments.',
      keywords: ['progress', 'grades', 'attendance', 'child', 'performance'],
      category: 'progress',
      steps: [
        'Select your child from the tabs',
        'View grades in the Recent Grades table',
        'Check attendance rate',
        'Review teacher comments if any'
      ]
    },
    {
      id: 'parent-2',
      title: 'How to report absence',
      content: 'Click Report Absence, select date, enter reason, submit. Teacher will be notified.',
      keywords: ['absence', 'absent', 'report', 'sick', 'leave'],
      category: 'attendance',
      steps: [
        'Find Report Absence section',
        'Select the date of absence',
        'Enter the reason',
        'Click Report Absence',
        'Teacher receives notification'
      ]
    },
    {
      id: 'parent-3',
      title: 'How to make payment',
      content: 'Go to Payments, select child, choose plan, enter amount, complete payment.',
      keywords: ['payment', 'pay', 'fee', 'school fees', 'money'],
      category: 'payments',
      steps: [
        'Go to Payments section',
        'Select your child',
        'Choose subscription plan',
        'Enter amount',
        'Select payment method',
        'Click Pay Now'
      ]
    }
  ],
  student: [
    {
      id: 'student-1',
      title: 'How to view my grades',
      content: 'Go to My Grades to see all your scores and performance.',
      keywords: ['grade', 'score', 'result', 'performance'],
      category: 'grades',
      steps: [
        'Click on My Grades in sidebar',
        'View all your subjects and scores',
        'See grade letters and percentages'
      ]
    },
    {
      id: 'student-2',
      title: 'How to use AI Tutor',
      content: 'Type your question in AI Tutor chat, get instant help with any subject.',
      keywords: ['ai', 'tutor', 'help', 'question', 'assistant'],
      category: 'learning',
      steps: [
        'Go to AI Tutor section',
        'Type your question in the chat box',
        'Press Enter or click Ask',
        'Get instant AI-generated answers'
      ]
    }
  ]
};

// Get help articles by role
exports.getHelpArticles = async (req, res) => {
  try {
    const { role } = req.params;
    const articles = HELP_ARTICLES[role] || HELP_ARTICLES.admin;
    
    res.json({
      success: true,
      data: articles
    });
  } catch (error) {
    console.error('Get help articles error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Search help articles
exports.searchHelpArticles = async (req, res) => {
  try {
    const { query, role } = req.body;
    
    if (!query) {
      return res.json({ success: true, data: [] });
    }
    
    const articles = HELP_ARTICLES[role] || HELP_ARTICLES.admin;
    const searchTerm = query.toLowerCase();
    
    const results = articles.filter(article => {
      return article.title.toLowerCase().includes(searchTerm) ||
             article.content.toLowerCase().includes(searchTerm) ||
             article.keywords.some(k => k.toLowerCase().includes(searchTerm));
    });
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Search help articles error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single help article
exports.getHelpArticle = async (req, res) => {
  try {
    const { role, articleId } = req.params;
    const articles = HELP_ARTICLES[role] || HELP_ARTICLES.admin;
    const article = articles.find(a => a.id === articleId);
    
    if (!article) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }
    
    res.json({
      success: true,
      data: article
    });
  } catch (error) {
    console.error('Get help article error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
