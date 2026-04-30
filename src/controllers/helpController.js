const systemHelp = {
  super_admin: [
    ['Platform dashboard', 'View live platform stats, active schools, pending approvals, users, and school health.'],
    ['School approvals', 'Approve, reject, suspend, reactivate, and audit schools.'],
    ['Name change requests', 'Approve school display names. Rejection keeps the platform/default name until a new request is approved.'],
    ['Platform analytics', 'Monitor total schools, users, students, teachers, parents, classes, growth, and revenue where available.'],
    ['Data security', 'Super admin sees platform-level summaries and school-scoped details only through approved endpoints.']
  ],
  admin: [
    ['School setup', 'Manage classes, streams, students, teachers, parents, settings, curriculum, calendar, timetable, and subject assignments.'],
    ['School name', 'The sidebar shows platform name until a super admin approves a name change request.'],
    ['Timetable', 'Configure breaks, lunch, games, lesson duration, day/boarding school mode, generate all-class timetables, edit slots, publish.'],
    ['Calendar', 'Create opening, closing, midterm, exam, sports, parent meeting, and fee deadline events.'],
    ['Search', 'Search students, teachers, classes, marks, calendar events, and school data within your school.'],
    ['Curriculum tracking', 'Monitor subject coverage and teacher progress by class/subject.']
  ],
  teacher: [
    ['Class teacher role', 'Class teachers manage their own class students, can upload student CSVs, review all class marks, and publish final marks.'],
    ['Subject teacher role', 'Subject teachers only enter draft marks for assigned subject/class combinations.'],
    ['Marks entry', 'Use simple marks modal for current marks or backtesting previous academic years. Save drafts; class teacher publishes.'],
    ['Report cards', 'Published marks feed the selected Modern Blue report card.'],
    ['Curriculum progress', 'Track topic/subject coverage start, progress, completion, and notes for assigned subjects.'],
    ['Parent messages', 'Class teachers see parent conversations for their class; staff chat remains separate.']
  ],
  parent: [
    ['Children dashboard', 'View child grades, attendance, analytics, homework, messages, fees, and report cards when published.'],
    ['Payments', 'View fee/subscription options and payment history/intent.'],
    ['Homework', 'See teacher-assigned home tasks first, then recommended tasks where available.'],
    ['Messages', 'Parent messages are only your conversations with school staff/teachers.']
  ],
  student: [
    ['Dashboard', 'View lessons, assignments, grades, attendance, rewards, badges, and messages.'],
    ['Analytics', 'See live academic progress, subject strengths, improvement areas, attendance, and homework streaks.'],
    ['Homework', 'Complete assigned tasks and track progress.'],
    ['Rewards', 'Earn badges and rewards from attendance, homework, and performance.']
  ]
};

function normalizeRole(role) {
  return role === 'superadmin' ? 'super_admin' : role;
}

exports.getArticles = async (req, res) => {
  const role = normalizeRole(req.user.role);
  const articles = (systemHelp[role] || []).map((a, i) => ({
    id: `${role}-${i+1}`,
    title: a[0],
    content: a[1],
    role,
    keywords: a.join(' ').toLowerCase().split(/\W+/).filter(Boolean)
  }));
  res.json({ success:true, data:{ role, articles, systemAreas:Object.keys(systemHelp) } });
};

exports.searchArticles = async (req, res) => {
  const role = normalizeRole(req.user.role);
  const q = String(req.query.q || '').toLowerCase();
  const roles = role === 'super_admin' ? Object.keys(systemHelp) : [role];
  const articles = [];
  roles.forEach(r => (systemHelp[r] || []).forEach((a, i) => {
    const text = `${a[0]} ${a[1]}`.toLowerCase();
    if (!q || text.includes(q)) articles.push({ id:`${r}-${i+1}`, role:r, title:a[0], content:a[1] });
  }));
  res.json({ success:true, data:articles });
};

exports.getArticle = async (req, res) => {
  const [role, num] = String(req.params.id).split('-');
  const item = systemHelp[role]?.[Number(num)-1];
  if (!item) return res.status(404).json({ success:false, message:'Help article not found' });
  res.json({ success:true, data:{ id:req.params.id, role, title:item[0], content:item[1] } });
};