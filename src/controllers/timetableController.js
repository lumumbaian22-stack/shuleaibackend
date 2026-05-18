const { Timetable, Class, Teacher, User, Student, Parent } = require('../models');
const moment = require('moment');
const { Op } = require('sequelize');

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DEFAULT_PERIODS = [
  { label: 'Period 1', startTime: '08:00', endTime: '08:40', type: 'lesson' },
  { label: 'Period 2', startTime: '08:40', endTime: '09:20', type: 'lesson' },
  { label: 'Period 3', startTime: '09:20', endTime: '10:00', type: 'lesson' },
  { label: 'Break', startTime: '10:00', endTime: '10:30', type: 'break', break: true },
  { label: 'Period 4', startTime: '10:30', endTime: '11:10', type: 'lesson' },
  { label: 'Period 5', startTime: '11:10', endTime: '11:50', type: 'lesson' },
  { label: 'Period 6', startTime: '11:50', endTime: '12:30', type: 'lesson' },
  { label: 'Lunch', startTime: '12:30', endTime: '14:00', type: 'break', break: true },
  { label: 'Period 7', startTime: '14:00', endTime: '14:40', type: 'lesson' },
  { label: 'Period 8', startTime: '14:40', endTime: '15:20', type: 'lesson' },
  { label: 'Period 9', startTime: '15:20', endTime: '16:00', type: 'lesson' }
];

const cleanPeriod = (p = {}, idx = 0) => {
  const type = String(p.type || (p.break ? 'break' : 'lesson')).toLowerCase();
  const isBreak = type === 'break' || type === 'lunch' || /break|lunch|assembly|games|club/i.test(String(p.label || ''));
  return {
    id: p.id || `period-${idx + 1}`,
    label: String(p.label || `Period ${idx + 1}`).trim(),
    startTime: String(p.startTime || p.start || '08:00').slice(0, 5),
    endTime: String(p.endTime || p.end || '08:40').slice(0, 5),
    type: isBreak ? 'break' : 'lesson',
    break: !!isBreak,
    classes: Array.isArray(p.classes) ? p.classes : []
  };
};
const getPeriods = (periods) => (Array.isArray(periods) && periods.length ? periods : DEFAULT_PERIODS).map(cleanPeriod);
const normalizeDay = (d) => String(d || '').toLowerCase();
const startOfWeek = () => moment().startOf('isoWeek').format('YYYY-MM-DD');

function weight(subject) {
  const s = String(subject || '').toLowerCase();
  if (/math|english|kiswahili|science|biology|chemistry|physics/.test(s)) return 5;
  if (/social|history|geography|cre|ire|agriculture|business|computer/.test(s)) return 3;
  return 2;
}
function shell(periods = DEFAULT_PERIODS) {
  const clean = getPeriods(periods);
  return DAYS.map(day => ({
    day,
    periods: clean.map((p, idx) => ({ ...p, id: p.id || `${day}-${idx}`, classes: [] }))
  }));
}
function defaultSubjectsForClass(cls) {
  const settingsSubjects = cls.settings?.subjects || cls.settings?.curriculumSubjects || cls.settings?.learningAreas;
  if (Array.isArray(settingsSubjects) && settingsSubjects.length) return settingsSubjects.map(s => typeof s === 'string' ? s : (s.name || s.subject)).filter(Boolean);
  const grade = String(cls.grade || cls.name || '').toLowerCase();
  if (/grade|pp|primary|class|std|standard/.test(grade)) return ['Mathematics', 'English', 'Kiswahili', 'Science', 'Social Studies', 'Creative Arts', 'CRE', 'Agriculture'];
  return ['Mathematics', 'English', 'Kiswahili', 'Biology', 'Chemistry', 'Physics', 'Geography', 'History', 'CRE', 'Business Studies'];
}
function buildFallbackAssignments(cls, teachers) {
  const subjects = defaultSubjectsForClass(cls);
  return subjects.map((subject, idx) => {
    const matched = teachers.find(t => (t.subjects || []).some(s => String(s).toLowerCase() === String(subject).toLowerCase())) || teachers[idx % Math.max(teachers.length, 1)];
    return { subject, teacherId: matched?.id || null, teacherName: matched?.User?.name || 'Unassigned Teacher', fallback: true };
  });
}
function buildClassBlocksFromSlots(slots, existingClasses = []) {
  const blocks = new Map();
  (existingClasses || []).forEach(c => {
    if (c.classId) blocks.set(String(c.classId), { ...c, timetable: shell(c.periods || DEFAULT_PERIODS) });
  });
  (slots || []).forEach(dayBlock => {
    const day = normalizeDay(dayBlock.day);
    (dayBlock.periods || []).forEach((period, pi) => {
      (period.classes || []).forEach(lesson => {
        const key = String(lesson.classId || lesson.className || 'unknown');
        if (!blocks.has(key)) {
          blocks.set(key, {
            classId: lesson.classId || null,
            className: lesson.className || 'Class',
            grade: lesson.grade || '',
            stream: lesson.stream || '',
            timetable: shell((slots[0] && slots[0].periods) || DEFAULT_PERIODS)
          });
        }
        const block = blocks.get(key);
        const d = block.timetable.find(x => x.day === day);
        if (!d) return;
        const p = d.periods[pi];
        if (!p) return;
        Object.assign(p, { ...period, classes: [] });
        p.classes.push({ ...lesson, startTime: period.startTime, endTime: period.endTime, day });
      });
    });
  });
  return Array.from(blocks.values());
}
function filterClassTimetable(block, periodsOverride) {
  if (!block) return [];
  const base = shell(periodsOverride || block.periods || DEFAULT_PERIODS);
  const source = Array.isArray(block.timetable) ? block.timetable : [];
  return base.map(dayBlock => {
    const srcDay = source.find(d => normalizeDay(d.day) === dayBlock.day);
    if (!srcDay) return dayBlock;
    return {
      ...dayBlock,
      periods: dayBlock.periods.map((basePeriod, idx) => {
        const src = (srcDay.periods || [])[idx] || {};
        return { ...basePeriod, ...src, classes: Array.isArray(src.classes) ? src.classes : [] };
      })
    };
  });
}
async function generateBalanced(schoolId, opts = {}) {
  const periods = getPeriods(opts.periods || DEFAULT_PERIODS);
  const classes = await Class.findAll({ where: { schoolCode: schoolId, isActive: true }, order: [['grade', 'ASC'], ['name', 'ASC']] });
  const teacherIds = new Set(); classes.forEach(c => (c.subjectTeachers || []).forEach(a => a.teacherId && teacherIds.add(Number(a.teacherId))));
  const teachers = teacherIds.size
    ? await Teacher.findAll({ where: { id: Array.from(teacherIds) }, include: [{ model: User, attributes: ['id', 'name', 'email', 'schoolCode'] }] })
    : await Teacher.findAll({ where: {}, include: [{ model: User, where: { schoolCode: schoolId, role: 'teacher' }, attributes: ['id', 'name', 'email', 'schoolCode'] }] });
  const teacherMap = new Map(teachers.map(t => [Number(t.id), t]));
  const slots = shell(periods), classResults = [], teacherBusy = {}, classBusy = {}, daily = {}, warnings = [];
  for (const cls of classes) {
    const classPeriods = getPeriods(opts.classPeriodOverrides?.[String(cls.id)] || periods);
    const classSlots = shell(classPeriods);
    let assignments = (cls.subjectTeachers || []).filter(a => a.subject && a.teacherId);
    if (!assignments.length) {
      assignments = buildFallbackAssignments(cls, teachers);
      warnings.push({ classId: cls.id, className: cls.name, message: 'Generated using class/curriculum subjects because no subject-teacher assignments were found' });
    }
    const lessons = [];
    assignments.forEach(a => { for (let i = 0; i < weight(a.subject); i++) lessons.push(a); });
    lessons.sort((a, b) => weight(b.subject) - weight(a.subject));
    for (const a of lessons) {
      let placed = false; const teacher = teacherMap.get(Number(a.teacherId));
      for (const day of DAYS) {
        if ((daily[`${cls.id}:${day}:${a.subject}`] || 0) >= 2) continue;
        for (let pi = 0; pi < classPeriods.length; pi++) {
          const period = classPeriods[pi]; if (period.break) continue;
          const key = `${day}:${period.startTime}`;
          teacherBusy[key] = teacherBusy[key] || new Set(); classBusy[key] = classBusy[key] || new Set();
          if ((a.teacherId && teacherBusy[key].has(Number(a.teacherId))) || classBusy[key].has(Number(cls.id))) continue;
          const lesson = { classId: cls.id, className: cls.name, grade: cls.grade, stream: cls.stream, subject: a.subject, teacherId: a.teacherId ? Number(a.teacherId) : null, teacherName: teacher?.User?.name || a.teacherName || 'Unassigned Teacher', startTime: period.startTime, endTime: period.endTime, term: opts.term, year: opts.year, scope: opts.scope || 'term', room: a.room || '' };
          const globalDay = slots.find(d => d.day === day); const globalPeriod = globalDay?.periods?.[pi];
          if (globalPeriod) globalPeriod.classes.push(lesson);
          classSlots.find(d => d.day === day).periods[pi].classes.push(lesson);
          if (a.teacherId) teacherBusy[key].add(Number(a.teacherId)); classBusy[key].add(Number(cls.id));
          daily[`${cls.id}:${day}:${a.subject}`] = (daily[`${cls.id}:${day}:${a.subject}`] || 0) + 1;
          placed = true; break;
        }
        if (placed) break;
      }
      if (!placed) warnings.push({ classId: cls.id, className: cls.name, subject: a.subject, teacherId: a.teacherId, message: 'Could not place lesson without conflict' });
    }
    classResults.push({ classId: cls.id, className: cls.name, grade: cls.grade, stream: cls.stream, periods: classPeriods, timetable: classSlots });
  }
  return { slots, classes: classResults, warnings, periods };
}
async function findActiveTimetable(schoolId, query = {}) {
  const where = { schoolId };
  if (query.weekStart || query.weekStartDate) where.weekStartDate = query.weekStart || query.weekStartDate;
  if (query.term) where.term = query.term;
  if (query.year) where.year = Number(query.year);
  if (!where.weekStartDate && !query.includeDrafts) where.isPublished = true;
  let tt = await Timetable.findOne({ where, order: [['updatedAt', 'DESC']] });
  if (!tt && !where.isPublished) return null;
  if (!tt) tt = await Timetable.findOne({ where: { schoolId, isPublished: true }, order: [['updatedAt', 'DESC']] });
  if (!tt && query.includeDrafts) tt = await Timetable.findOne({ where: { schoolId }, order: [['updatedAt', 'DESC']] });
  return tt;
}
function resolveClassForStudent(student, classes) {
  if (!student || !classes) return null;
  const g = String(student.grade || '').toLowerCase().trim();
  return classes.find(c => String(c.id) === String(student.classId)) ||
    classes.find(c => String(c.name || '').toLowerCase() === g) ||
    classes.find(c => String(c.grade || '').toLowerCase() === g) ||
    classes.find(c => g && String(c.name || '').toLowerCase().includes(g));
}
function findClassBlock(tt, cls) {
  if (!tt || !cls) return null;
  return (tt.classes || []).find(c => String(c.classId) === String(cls.id) || String(c.className || '').toLowerCase() === String(cls.name || '').toLowerCase());
}
function studyUpdates(slots) {
  const now = new Date(); const day = now.toLocaleDateString('en-US', { weekday: 'long' }); const time = now.toTimeString().slice(0, 5);
  return (slots || []).filter(s => String(s.day || '').toLowerCase() === day.toLowerCase() && s.subject && !/break|lunch|free/i.test(s.subject) && String(s.endTime || '00:00') <= time).slice(-8).map(s => ({ subject: s.subject, teacherName: s.teacherName || s.teacher || 'Teacher', room: s.room || '', startTime: s.startTime, endTime: s.endTime }));
}

exports.generate = async (req, res) => { try {
  const schoolId = req.user.schoolCode;
  const { weekStartDate, term = 'Term 1', year = new Date().getFullYear(), scope = 'term', publish = false, periods, classPeriodOverrides = {} } = req.body;
  const weekStart = weekStartDate || startOfWeek();
  const generated = await generateBalanced(schoolId, { term, year: Number(year), scope, periods, classPeriodOverrides });
  const payload = { weekStartDate: weekStart, term, year: Number(year), scope: ['term', 'year', 'week'].includes(scope) ? scope : 'term', slots: generated.slots, classes: generated.classes, warnings: generated.warnings, isPublished: !!publish };
  const [tt, created] = await Timetable.findOrCreate({ where: { schoolId, weekStartDate: weekStart }, defaults: { schoolId, ...payload } });
  if (!created) await tt.update(payload);
  res.json({ success: true, message: `Generated timetable for ${generated.classes.length} class(es)`, data: tt });
} catch (error) { console.error('Generate timetable error:', error); res.status(500).json({ success: false, message: error.message }); } };
exports.getClasses = async (req, res) => { try { const classes = await Class.findAll({ where: { schoolCode: req.user.schoolCode, isActive: true }, order: [['grade', 'ASC'], ['name', 'ASC']] }); res.json({ success: true, data: classes }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } };
exports.manualUpdate = async (req, res) => { try {
  const tt = await Timetable.findOne({ where: { id: req.params.id, schoolId: req.user.schoolCode } });
  if (!tt) return res.status(404).json({ success: false, message: 'Timetable not found' });
  const slots = Array.isArray(req.body.slots) ? req.body.slots : tt.slots;
  const classes = Array.isArray(req.body.classes) && req.body.classes.length ? req.body.classes : buildClassBlocksFromSlots(slots, tt.classes || []);
  await tt.update({ slots, classes, warnings: req.body.warnings || tt.warnings || [], term: req.body.term || tt.term, year: req.body.year ? Number(req.body.year) : tt.year, scope: req.body.scope || tt.scope });
  res.json({ success: true, data: tt });
} catch (error) { res.status(500).json({ success: false, message: error.message }); } };
exports.publish = async (req, res) => { try {
  const tt = await Timetable.findOne({ where: { id: req.params.id, schoolId: req.user.schoolCode } });
  if (!tt) return res.status(404).json({ success: false, message: 'Timetable not found' });
  const scope = req.body.scope || tt.scope || 'term'; const term = req.body.term || tt.term || 'Term 1'; const year = req.body.year ? Number(req.body.year) : (tt.year || new Date().getFullYear());
  await tt.update({ isPublished: true, scope, term, year });
  res.json({ success: true, data: tt });
} catch (error) { res.status(500).json({ success: false, message: error.message }); } };
exports.getForClass = async (req, res) => { try {
  const tt = await findActiveTimetable(req.user.schoolCode, req.query);
  if (!tt) return res.json({ success: true, data: [], meta: { published: false } });
  const found = (tt.classes || []).find(c => Number(c.classId) === Number(req.params.classId));
  res.json({ success: true, data: found ? filterClassTimetable(found) : [], meta: { term: tt.term, year: tt.year, scope: tt.scope, published: !!tt.isPublished, classInfo: found || null } });
} catch (error) { res.status(500).json({ success: false, message: error.message }); } };
exports.getForTeacher = async (req, res) => { try {
  let teacherId = Number(req.params.teacherId);
  const teacher = await Teacher.findOne({ where: { [Op.or]: [{ id: teacherId || 0 }, { userId: teacherId || req.user.id }] }, include: [{ model: User, attributes: ['id', 'name', 'schoolCode'] }] });
  if (teacher) teacherId = Number(teacher.id);
  const schoolId = teacher?.User?.schoolCode || req.user.schoolCode;
  const tt = await findActiveTimetable(schoolId, req.query);
  if (!tt) return res.json({ success: true, data: [], meta: { published: false } });
  const data = (tt.slots || []).map(d => ({ day: d.day, periods: (d.periods || []).map(p => ({ ...p, classes: (p.classes || []).filter(c => Number(c.teacherId) === Number(teacherId)) })).filter(p => p.break || p.classes.length) })).filter(d => d.periods.length);
  res.json({ success: true, data, meta: { term: tt.term, year: tt.year, scope: tt.scope, published: !!tt.isPublished, teacherId } });
} catch (error) { res.status(500).json({ success: false, message: error.message }); } };
exports.getByWeek = async (req, res) => { try {
  const tt = await findActiveTimetable(req.user.schoolCode, { ...req.query, includeDrafts: true, weekStartDate: req.query.weekStartDate || req.query.weekStart || startOfWeek() });
  res.json({ success: true, data: tt || null });
} catch (error) { res.status(500).json({ success: false, message: error.message }); } };
exports.getForStudentMe = async (req, res) => { try {
  const student = await Student.unscoped().findOne({ where: { userId: req.user.id }, include: [{ model: User, attributes: ['id', 'name', 'email', 'phone', 'schoolCode'] }] });
  if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });
  const schoolId = student.User?.schoolCode || req.user.schoolCode;
  const classes = await Class.findAll({ where: { schoolCode: schoolId, isActive: true } }); const cls = resolveClassForStudent(student, classes);
  const tt = await findActiveTimetable(schoolId, req.query);
  const block = findClassBlock(tt, cls); const slots = block ? filterClassTimetable(block) : [];
  res.json({ success: true, data: { student, classInfo: cls, timetable: slots, updates: studyUpdates(slots), term: tt?.term, year: tt?.year, scope: tt?.scope, published: !!tt?.isPublished } });
} catch (error) { res.status(500).json({ success: false, message: error.message }); } };
exports.getForParentChild = async (req, res) => { try {
  const parent = await Parent.findOne({ where: { userId: req.user.id } }); if (!parent) return res.status(404).json({ success: false, message: 'Parent profile not found' });
  const student = await Student.unscoped().findOne({ where: { id: req.params.studentId }, include: [{ model: User, attributes: ['id', 'name', 'email', 'phone', 'schoolCode'] }] }); if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
  if (parent.hasStudent) { const ok = await parent.hasStudent(student); if (!ok) return res.status(403).json({ success: false, message: 'Child not linked to this parent' }); }
  const schoolId = student.User?.schoolCode || req.user.schoolCode;
  const classes = await Class.findAll({ where: { schoolCode: schoolId, isActive: true } }); const cls = resolveClassForStudent(student, classes);
  const tt = await findActiveTimetable(schoolId, req.query);
  const block = findClassBlock(tt, cls); const slots = block ? filterClassTimetable(block) : [];
  res.json({ success: true, data: { child: student, classInfo: cls, timetable: slots, updates: studyUpdates(slots), term: tt?.term, year: tt?.year, scope: tt?.scope, published: !!tt?.isPublished, premiumStatusPreview: true } });
} catch (error) { res.status(500).json({ success: false, message: error.message }); } };
