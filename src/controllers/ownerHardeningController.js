const { sequelize, School, User, Student, Teacher, Parent, Class, Alert } = require('../models');
const { getRoleAnalytics } = require('../services/ownerAnalyticsEngine');
const { generateTemporaryPassword } = require('../utils/passwords');

exports.getOwnerAnalytics = async (req, res) => {
  try {
    const payload = await getRoleAnalytics(req.user, req.query || {});
    return res.json(payload);
  } catch (error) {
    console.error('Owner analytics error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Analytics failed' });
  }
};

exports.getSchoolBranding = async (req, res) => {
  try {
    if (!req.user.schoolCode && req.user.role !== 'super_admin') return res.status(403).json({ success: false, message: 'Missing school tenant' });
    const schoolCode = req.query.schoolCode || req.user.schoolCode;
    if (req.user.role !== 'super_admin' && schoolCode !== req.user.schoolCode) return res.status(403).json({ success: false, message: 'Cross-school branding access blocked' });
    const school = await School.findOne({ where: { schoolId: schoolCode } });
    if (!school) return res.status(404).json({ success: false, message: 'School not found' });
    const branding = school.settings?.branding || {};
    return res.json({ success: true, data: { schoolId: school.schoolId, name: school.name, logo: branding.logo || null, primaryColor: branding.primaryColor || '#083A85', accentColor: branding.accentColor || '#11B5B1', reportFooter: branding.reportFooter || '', paymentInstructions: branding.paymentInstructions || '' } });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

exports.updateSchoolBranding = async (req, res) => {
  try {
    if (!['admin','super_admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Only school admins can update branding' });
    const schoolCode = req.body.schoolCode || req.user.schoolCode;
    if (req.user.role !== 'super_admin' && schoolCode !== req.user.schoolCode) return res.status(403).json({ success: false, message: 'Cross-school branding update blocked' });
    const school = await School.findOne({ where: { schoolId: schoolCode } });
    if (!school) return res.status(404).json({ success: false, message: 'School not found' });
    const current = school.settings || {};
    const branding = { ...(current.branding || {}) };
    ['logo','primaryColor','accentColor','reportFooter','paymentInstructions'].forEach(k => {
      if (req.body[k] !== undefined) branding[k] = String(req.body[k] || '').trim();
    });
    await school.update({ settings: { ...current, branding } });
    return res.json({ success: true, data: branding, message: 'School branding updated' });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

exports.getAgentToolkit = async (req, res) => {
  const toolkit = {
    pricing: [
      { name: 'School Starter', target: 'Small schools', includes: ['Core school OS', 'Parents portal', 'Finance & Fees', 'Alerts'], note: 'Use as entry package.' },
      { name: 'School Growth', target: 'Growing schools', includes: ['Everything in Starter', 'Analytics', 'AI announcement suggestions', 'Advanced reports'], note: 'Best pilot-to-rollout option.' },
      { name: 'Child AI Plans', target: 'Parents/students', includes: ['Essential', 'Smart', 'Genius'], note: 'Student AI tutor is paid per child.' }
    ],
    pitchScript: 'Shule AI gives schools one intelligent platform for fees, attendance, academics, communication, alerts, AI tutoring, and student success — built for Kenyan schools and mobile-first usage.',
    faq: [
      { q: 'Does Shule AI support M-Pesa?', a: 'Yes. It supports STK Push, manual M-Pesa verification, bank, cash/card instructions, and payment history.' },
      { q: 'Can teachers use phones?', a: 'Yes. The web app is responsive/PWA so teachers can use it from mobile browsers.' },
      { q: 'Does it replace report cards?', a: 'It supports digital report cards and academic analytics while still allowing schools to print/export where needed.' }
    ],
    leadStages: ['New Lead', 'Contacted', 'Demo Booked', 'Demo Done', 'Negotiation', 'Closed', 'Lost'],
    demoLogins: { note: 'Use the demo seed script to create safe demo accounts. Do not use real school data in demos.' }
  };
  return res.json({ success: true, data: toolkit });
};

exports.getAdminHealthDashboard = async (req, res) => {
  try {
    if (!['admin','super_admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const schoolCode = req.user.role === 'super_admin' ? req.query.schoolCode : req.user.schoolCode;
    const checks = {};
    checks.database = { ok: true };
    checks.deepseek = { ok: !!process.env.DEEPSEEK_API_KEY, provider: process.env.AI_PROVIDER || 'deepseek', model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash' };
    checks.daraja = { ok: !!(process.env.DARAJA_CONSUMER_KEY && process.env.DARAJA_CONSUMER_SECRET), env: process.env.DARAJA_ENV || process.env.DARAJA_ENVIRONMENT || 'sandbox' };
    checks.schoolCode = schoolCode || null;
    checks.timestamp = new Date().toISOString();
    return res.json({ success: true, status: 'ready', checks });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

exports.seedDemoSchool = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ success: false, message: 'Only super admin can seed demo schools' });
    const schoolId = req.body.schoolCode || 'DEMO-SHULEAI';
    const [school] = await School.findOrCreate({ where: { schoolId }, defaults: { name: req.body.schoolName || 'Shule AI Demo School', shortCode: 'DEMOAI', status: 'active', isActive: true, settings: { demoMode: true, branding: { primaryColor: '#083A85', accentColor: '#11B5B1' } } } });
    const makeUser = async (role, name, email) => User.findOrCreate({ where: { email }, defaults: { name, email, password: generateTemporaryPassword(), role, schoolCode: school.schoolId, isActive: true, firstLogin: true } });
    const [adminUser] = await makeUser('admin', 'Demo Admin', 'demo.admin@shuleai.local');
    const [teacherUser] = await makeUser('teacher', 'Demo Teacher', 'demo.teacher@shuleai.local');
    const [parentUser] = await makeUser('parent', 'Demo Parent', 'demo.parent@shuleai.local');
    const [studentUser] = await makeUser('student', 'Brian Demo Student', 'demo.student@shuleai.local');
    const [klass] = await Class.findOrCreate({ where: { schoolCode: school.schoolId, name: 'Grade 6 Blue' }, defaults: { schoolCode: school.schoolId, name: 'Grade 6 Blue', grade: 'Grade 6', isActive: true } });
    const [teacher] = await Teacher.findOrCreate({ where: { userId: teacherUser.id }, defaults: { userId: teacherUser.id, classId: klass.id, subjects: ['Mathematics','Science'], approvalStatus: 'approved', classTeacher: 'yes' } });
    const [parent] = await Parent.findOrCreate({ where: { userId: parentUser.id }, defaults: { userId: parentUser.id, relationship: 'guardian' } });
    const [student] = await Student.findOrCreate({ where: { userId: studentUser.id }, defaults: { userId: studentUser.id, grade: 'Grade 6', classId: klass.id, curriculum: 'cbc', parentName: parentUser.name, parentEmail: parentUser.email, status: 'active' } });
    await sequelize.query('INSERT INTO "StudentParents" ("studentId","parentId","createdAt","updatedAt") VALUES (:studentId,:parentId,NOW(),NOW()) ON CONFLICT DO NOTHING', { replacements: { studentId: student.id, parentId: parent.id } }).catch(() => {});
    await Alert.findOrCreate({ where: { userId: parentUser.id, dedupeKey: `demo-parent-${student.id}` }, defaults: { userId: parentUser.id, role: 'parent', type: 'system', title: 'Demo: Brian is present today', message: 'Your child is present today. Shule AI keeps you updated in real time.', categoryLabel: 'Parent Peace of Mind', sourceType: 'demo', sourceLabel: 'Shule AI Demo', studentId: student.id, dedupeKey: `demo-parent-${student.id}` } });
    return res.json({ success: true, message: 'Demo school seed completed', data: { schoolCode: school.schoolId, accounts: { admin: adminUser.email, teacher: teacherUser.email, parent: parentUser.email, student: studentUser.email }, temporaryPasswordNote: 'Passwords are generated and must be reset; check database/admin console for demo credentials in non-production.' } });
  } catch (error) { console.error('Demo seed error:', error); return res.status(500).json({ success: false, message: error.message }); }
};
