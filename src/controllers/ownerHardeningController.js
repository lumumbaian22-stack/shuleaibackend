const { sequelize, School, User, Student, Teacher, Parent, Class, Alert } = require('../models');
const path = require('path');
const { getRoleAnalytics } = require('../services/ownerAnalyticsEngine');
const { generateTemporaryPassword } = require('../utils/passwords');


const BRAND_COLOR_PRESETS = {
  'Shule Blue': { primaryColor: '#083A85', accentColor: '#11B5B1' },
  'Royal Blue': { primaryColor: '#0B2F6B', accentColor: '#3B82F6' },
  'Emerald Green': { primaryColor: '#047857', accentColor: '#10B981' },
  'Purple': { primaryColor: '#6D28D9', accentColor: '#A78BFA' },
  'Orange': { primaryColor: '#C2410C', accentColor: '#FB923C' },
  'Red': { primaryColor: '#B91C1C', accentColor: '#F87171' },
  'Gold': { primaryColor: '#92400E', accentColor: '#FBBF24' },
  'Slate': { primaryColor: '#334155', accentColor: '#64748B' }
};

function normalizeColorName(name) {
  const value = String(name || '').trim();
  return BRAND_COLOR_PRESETS[value] ? value : 'Shule Blue';
}

function resolveColors(colorName, primaryColor, accentColor) {
  const safeName = normalizeColorName(colorName);
  const preset = BRAND_COLOR_PRESETS[safeName] || BRAND_COLOR_PRESETS['Shule Blue'];
  return {
    colorName: safeName,
    primaryColor: /^#[0-9a-f]{6}$/i.test(String(primaryColor || '')) ? primaryColor : preset.primaryColor,
    accentColor: /^#[0-9a-f]{6}$/i.test(String(accentColor || '')) ? accentColor : preset.accentColor
  };
}

function publicBrandingPayload(school) {
  const branding = school?.settings?.branding || {};
  const colors = resolveColors(branding.colorName, branding.primaryColor, branding.accentColor);
  const logo = branding.logoDataUrl || branding.logoUrl || branding.logo || null;
  return {
    schoolId: school.schoolId,
    name: school.name,
    schoolName: branding.schoolName || school.name,
    displayName: branding.schoolName || school.name,
    logo,
    logoUrl: branding.logoUrl || null,
    logoDataUrl: branding.logoDataUrl || null,
    logoSource: branding.logoDataUrl ? 'upload' : (branding.logoUrl ? 'url' : 'fallback'),
    colorName: colors.colorName,
    primaryColor: colors.primaryColor,
    accentColor: colors.accentColor,
    reportFooter: branding.reportFooter || '',
    paymentInstructions: branding.paymentInstructions || '',
    updatedAt: branding.updatedAt || school.updatedAt
  };
}

function extractUploadedFile(req) {
  return req.files?.logo || req.files?.file || req.files?.image || null;
}

async function fileToDataUrl(file) {
  const mime = file.mimetype || file.type || 'image/png';
  const originalName = file.name || file.originalname || 'logo.png';
  const ext = path.extname(originalName).toLowerCase();
  if (!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(mime) && !['.png','.jpg','.jpeg','.webp','.gif','.svg'].includes(ext)) {
    const err = new Error('Only image files are allowed for school logos');
    err.statusCode = 400;
    throw err;
  }
  const size = Number(file.size || 0);
  if (size > 2 * 1024 * 1024) {
    const err = new Error('Logo is too large. Please upload an image under 2MB.');
    err.statusCode = 400;
    throw err;
  }
  let buffer;
  if (file.data) buffer = Buffer.from(file.data);
  else if (file.tempFilePath) buffer = await require('fs').promises.readFile(file.tempFilePath);
  else if (file.path) buffer = await require('fs').promises.readFile(file.path);
  else if (file.buffer) buffer = Buffer.from(file.buffer);
  else {
    const err = new Error('Unsupported logo upload object');
    err.statusCode = 400;
    throw err;
  }
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

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
    return res.json({ success: true, data: publicBrandingPayload(school) });
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
    const requestedName = String(req.body.schoolName || req.body.name || req.body.displayName || '').trim();
    if (requestedName) {
      branding.schoolName = requestedName;
      await school.update({ name: requestedName });
    }
    const colors = resolveColors(req.body.colorName || branding.colorName, req.body.primaryColor || branding.primaryColor, req.body.accentColor || branding.accentColor);
    branding.colorName = colors.colorName;
    branding.primaryColor = colors.primaryColor;
    branding.accentColor = colors.accentColor;
    if (req.body.logoDataUrl !== undefined) {
      const logoDataUrl = String(req.body.logoDataUrl || '').trim();
      if (logoDataUrl && /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(logoDataUrl) && Buffer.byteLength(logoDataUrl, 'utf8') <= 2.8 * 1024 * 1024) {
        branding.logoDataUrl = logoDataUrl;
        branding.logoUrl = '';
        branding.logoSource = 'upload';
      }
    }
    if (req.body.logoUrl !== undefined || req.body.logo !== undefined) {
      const logoUrl = String(req.body.logoUrl || req.body.logo || '').trim();
      branding.logoUrl = logoUrl;
      if (logoUrl) delete branding.logoDataUrl;
    }
    ['reportFooter','paymentInstructions'].forEach(k => {
      if (req.body[k] !== undefined) branding[k] = String(req.body[k] || '').trim();
    });
    branding.updatedBy = req.user.id;
    branding.updatedAt = new Date().toISOString();
    await school.update({ settings: { ...current, branding } });
    return res.json({ success: true, data: publicBrandingPayload(school), message: 'School branding updated' });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

exports.uploadSchoolLogo = async (req, res) => {
  try {
    if (!['admin','super_admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Only school admins can upload branding logos' });
    const schoolCode = req.body.schoolCode || req.query.schoolCode || req.user.schoolCode;
    if (req.user.role !== 'super_admin' && schoolCode !== req.user.schoolCode) return res.status(403).json({ success: false, message: 'Cross-school logo upload blocked' });
    const school = await School.findOne({ where: { schoolId: schoolCode } });
    if (!school) return res.status(404).json({ success: false, message: 'School not found' });
    const file = extractUploadedFile(req);
    if (!file) return res.status(400).json({ success: false, message: 'No logo file uploaded. Use form field: logo' });
    const dataUrl = await fileToDataUrl(file);
    const current = school.settings || {};
    const branding = { ...(current.branding || {}) };
    branding.logoDataUrl = dataUrl;
    branding.logoUrl = '';
    branding.logoSource = 'upload';
    branding.updatedBy = req.user.id;
    branding.updatedAt = new Date().toISOString();
    await school.update({ settings: { ...current, branding } });
    return res.json({ success: true, data: publicBrandingPayload(school), message: 'School logo uploaded and saved' });
  } catch (error) { return res.status(error.statusCode || 500).json({ success: false, message: error.message }); }
};

exports.getAgentToolkit = async (req, res) => {
  const toolkit = {
    pricing: [
      { name: 'School Starter', target: '1–400 active students', includes: ['Complete Shule AI school platform'], note: 'Pricing is based on active student count, not feature access.' },
      { name: 'School Growth', target: '401–800 active students', includes: ['Complete Shule AI school platform'], note: 'Adds capacity, allowances and priority support—not locked features.' },
      { name: 'School Enterprise', target: '801+ active students', includes: ['Complete Shule AI school platform'], note: 'Adds scale, support and custom service options—not locked features.' },
      { name: 'Parent Child Plans', target: 'Parents/students', includes: ['Basic: reports/attendance/progress', 'Premium: AI Tutor 6/day', 'Ultimate: extended AI + recommendations'], note: 'Parent subscriptions are paid per child. Basic does not include AI Tutor.' }
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
