const { Timetable, Class, Teacher, User, Settings } = require('../models');
const moment = require('moment');

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

function toMinutes(time) {
  const [h, m] = String(time || '08:00').split(':').map(Number);
  return h * 60 + m;
}
function toTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function normalizeBreaks(settings = {}) {
  const breakCount = Number(settings.breakCount || settings.numberOfBreaks || 2);
  const schoolType = settings.schoolType || 'day';
  const breaks = Array.isArray(settings.breaks) && settings.breaks.length ? settings.breaks : [
    { type: 'short', name: 'Break 1', startTime: '10:20', duration: 20, label: 'Short Break' },
    { type: 'lunch', name: 'Lunch', startTime: '12:40', duration: 60, label: 'Lunch Break' },
    { type: 'games', name: 'Games', startTime: '15:30', duration: 30, label: 'Games Break' }
  ];

  let filtered = breaks.filter(b => b.type === 'lunch' || b.type === 'games' || b.type === 'short');
  const shortBreaks = filtered.filter(b => b.type === 'short').slice(0, Math.max(0, breakCount));
  const lunch = filtered.find(b => b.type === 'lunch') || { type: 'lunch', name: 'Lunch', startTime: '12:40', duration: 60, label: 'Lunch Break' };
  const games = filtered.find(b => b.type === 'games') || { type: 'games', name: 'Games', startTime: '15:30', duration: 30, label: 'Games Break' };

  const finalBreaks = [...shortBreaks, lunch];
  if (schoolType === 'boarding' || settings.includeGamesBreak !== false) finalBreaks.push(games);
  return finalBreaks.sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
}
function buildPeriods(settings = {}) {
  const dayStart = settings.dayStart || '08:00';
  const dayEnd = settings.dayEnd || (settings.schoolType === 'boarding' ? '17:00' : '16:00');
  const lessonDuration = Number(settings.lessonDuration || 40);
  const shortLessonDuration = Number(settings.shortLessonDuration || lessonDuration);
  const breaks = normalizeBreaks(settings);

  const periods = [];
  let cursor = toMinutes(dayStart);
  const end = toMinutes(dayEnd);

  for (const br of breaks) {
    const breakStart = toMinutes(br.startTime);
    while (cursor + shortLessonDuration <= breakStart) {
      const duration = cursor + lessonDuration <= breakStart ? lessonDuration : shortLessonDuration;
      periods.push({
        label: `Lesson ${periods.filter(p => !p.break).length + 1}`,
        start: toTime(cursor),
        end: toTime(cursor + duration),
        duration,
        break: false
      });
      cursor += duration;
    }
    if (cursor < breakStart) cursor = breakStart;
    const bEnd = breakStart + Number(br.duration || 20);
    periods.push({
      label: br.label || br.name || 'Break',
      start: toTime(breakStart),
      end: toTime(bEnd),
      duration: Number(br.duration || 20),
      break: true,
      breakType: br.type || 'short',
      purpose: br.type === 'lunch' ? 'Meal break' : br.type === 'games' ? 'Physical activity / dismissal / prep transition' : 'Rest and refreshment'
    });
    cursor = bEnd;
  }

  while (cursor + shortLessonDuration <= end) {
    const duration = cursor + lessonDuration <= end ? lessonDuration : shortLessonDuration;
    periods.push({
      label: `Lesson ${periods.filter(p => !p.break).length + 1}`,
      start: toTime(cursor),
      end: toTime(cursor + duration),
      duration,
      break: false
    });
    cursor += duration;
  }

  if (settings.schoolType === 'boarding') {
    periods.push({
      label: 'Remedial / Prep',
      start: toTime(end),
      end: toTime(end + Number(settings.remedialDuration || 60)),
      duration: Number(settings.remedialDuration || 60),
      break: true,
      breakType: 'remedial',
      purpose: 'Boarding school remedial / prep studies'
    });
  }

  return periods;
}
function subjectWeight(subject) {
  const s = String(subject || '').toLowerCase();
  if (/math|english|kiswahili|science|biology|chemistry|physics/.test(s)) return 5;
  if (/social|history|geography|cre|ire|agriculture|business|computer/.test(s)) return 3;
  if (/art|music|pe|physical|games|club/.test(s)) return 2;
  return 3;
}
function emptyShell(settings) {
  const periods = buildPeriods(settings);
  return DAYS.map(day => ({ day, periods: periods.map(p => ({ ...p, classes: [] })) }));
}
function getAssignments(cls) {
  return (cls.subjectTeachers || []).filter(a => a.subject && a.teacherId);
}
async function getTeacherMap(classes) {
  const ids = new Set();
  classes.forEach(c => getAssignments(c).forEach(a => ids.add(Number(a.teacherId))));
  const teachers = ids.size ? await Teacher.findAll({ where: { id: [...ids] }, include: [{ model: User, attributes: ['id', 'name', 'email'] }] }) : [];
  return new Map(teachers.map(t => [Number(t.id), t]));
}
async function generateBalanced(schoolId, opts = {}) {
  const settings = opts.settings || {};
  const classes = await Class.findAll({ where: { schoolCode: schoolId, isActive: true }, order: [['grade', 'ASC'], ['name', 'ASC']] });
  const teacherMap = await getTeacherMap(classes);
  const slots = emptyShell(settings);
  const classResults = [];
  const teacherBusy = {};
  const classBusy = {};
  const dailySubjectCount = {};
  const teacherLoad = {};
  const warnings = [];

  for (const cls of classes) {
    const classSlots = emptyShell(settings);
    const assignments = getAssignments(cls);
    if (!assignments.length) {
      warnings.push({ classId: cls.id, className: cls.name, message: 'No subject teacher assignments found for this class.' });
      classResults.push({ classId: cls.id, className: cls.name, grade: cls.grade, stream: cls.stream, timetable: classSlots, warnings: [`${cls.name} has no subject teacher assignments`] });
      continue;
    }

    const lessons = [];
    assignments.forEach(a => {
      const count = Number(a.lessonsPerWeek || a.frequency || subjectWeight(a.subject));
      for (let i = 0; i < count; i++) lessons.push(a);
    });

    lessons.sort((a, b) => subjectWeight(b.subject) - subjectWeight(a.subject));

    for (const a of lessons) {
      const teacher = teacherMap.get(Number(a.teacherId));
      if (!teacher) {
        warnings.push({ classId: cls.id, className: cls.name, subject: a.subject, teacherId: a.teacherId, message: 'Teacher record not found' });
        continue;
      }

      let placed = false;
      for (const day of DAYS) {
        const dailyKey = `${cls.id}:${day}:${String(a.subject).toLowerCase()}`;
        if ((dailySubjectCount[dailyKey] || 0) >= 2) continue;

        const globalDay = slots.find(d => d.day === day);
        const classDay = classSlots.find(d => d.day === day);

        for (let pi = 0; pi < globalDay.periods.length; pi++) {
          const period = globalDay.periods[pi];
          if (period.break) continue;

          const key = `${day}:${period.start}`;
          teacherBusy[key] = teacherBusy[key] || new Set();
          classBusy[key] = classBusy[key] || new Set();
          const tId = Number(a.teacherId);

          if (teacherBusy[key].has(tId) || classBusy[key].has(Number(cls.id))) continue;

          const lesson = {
            classId: cls.id,
            className: cls.name,
            grade: cls.grade,
            stream: cls.stream,
            subject: a.subject,
            teacherId: tId,
            teacherName: teacher.User?.name || a.teacherName || 'Teacher',
            room: a.room || a.roomName || '',
            startTime: period.start,
            endTime: period.end,
            duration: period.duration,
            term: opts.term,
            year: Number(opts.year),
            scope: opts.scope || 'term'
          };

          globalDay.periods[pi].classes.push(lesson);
          classDay.periods[pi].classes.push(lesson);
          teacherBusy[key].add(tId);
          classBusy[key].add(Number(cls.id));
          dailySubjectCount[dailyKey] = (dailySubjectCount[dailyKey] || 0) + 1;
          teacherLoad[tId] = (teacherLoad[tId] || 0) + 1;
          placed = true;
          break;
        }
        if (placed) break;
      }

      if (!placed) {
        warnings.push({ classId: cls.id, className: cls.name, subject: a.subject, teacherId: a.teacherId, message: 'Could not place lesson without conflict' });
      }
    }

    classResults.push({ classId: cls.id, className: cls.name, grade: cls.grade, stream: cls.stream, timetable: classSlots });
  }

  return { slots, classes: classResults, warnings, settings, teacherLoad };
}

exports.generate = async (req, res) => {
  try {
    const schoolId = req.user.schoolCode;
    const {
      weekStartDate,
      term = 'Term 1',
      year = new Date().getFullYear(),
      scope = 'term',
      publish = false,
      settings = {}
    } = req.body;

    const weekStart = weekStartDate || moment().startOf('isoWeek').format('YYYY-MM-DD');
    const generated = await generateBalanced(schoolId, { term, year: Number(year), scope, settings });

    const [tt, created] = await Timetable.findOrCreate({
      where: { schoolId, weekStartDate: weekStart },
      defaults: {
        weekStartDate: weekStart,
        term,
        year: Number(year),
        scope,
        slots: generated.slots,
        classes: generated.classes,
        warnings: generated.warnings,
        isPublished: !!publish
      }
    });

    if (!created) {
      await tt.update({
        term,
        year: Number(year),
        scope,
        slots: generated.slots,
        classes: generated.classes,
        warnings: generated.warnings,
        isPublished: !!publish
      });
    }

    res.json({
      success: true,
      message: `Generated timetable for ${generated.classes.length} class(es)`,
      data: {
        ...tt.toJSON(),
        settings,
        teacherLoad: generated.teacherLoad,
        classCount: generated.classes.length
      }
    });
  } catch (error) {
    console.error('Generate timetable error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getClasses = async (req, res) => {
  try {
    const classes = await Class.findAll({ where: { schoolCode: req.user.schoolCode, isActive: true }, order: [['grade', 'ASC'], ['name', 'ASC']] });
    res.json({ success: true, data: classes });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.manualUpdate = async (req, res) => {
  try {
    const tt = await Timetable.findOne({ where: { id: req.params.id, schoolId: req.user.schoolCode } });
    if (!tt) return res.status(404).json({ success: false, message: 'Timetable not found' });
    if (tt.isPublished && !req.body.force) return res.status(403).json({ success: false, message: 'Published timetable is locked. Unpublish or use admin override.' });

    await tt.update({
      slots: req.body.slots || tt.slots,
      classes: req.body.classes || tt.classes,
      warnings: req.body.warnings || tt.warnings,
      term: req.body.term || tt.term,
      year: req.body.year ? Number(req.body.year) : tt.year,
      scope: req.body.scope || tt.scope
    });
    res.json({ success: true, message: 'Timetable updated', data: tt });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.updateSlot = async (req, res) => {
  try {
    const { classId, day, periodIndex, subject, teacherId, teacherName, room } = req.body;
    const tt = await Timetable.findOne({ where: { id: req.params.id, schoolId: req.user.schoolCode } });
    if (!tt) return res.status(404).json({ success: false, message: 'Timetable not found' });
    if (tt.isPublished && !req.body.force) return res.status(403).json({ success: false, message: 'Published timetable is locked.' });

    const classes = tt.classes || [];
    const classBlock = classes.find(c => Number(c.classId) === Number(classId));
    if (!classBlock) return res.status(404).json({ success: false, message: 'Class timetable not found' });

    const d = (classBlock.timetable || []).find(x => x.day === day);
    if (!d || !d.periods[periodIndex]) return res.status(400).json({ success: false, message: 'Invalid slot' });
    const period = d.periods[periodIndex];
    if (period.break) return res.status(400).json({ success: false, message: 'Cannot place a subject into a break slot' });

    period.classes = [{
      classId: Number(classId),
      className: classBlock.className,
      subject,
      teacherId: teacherId ? Number(teacherId) : null,
      teacherName: teacherName || '',
      room: room || '',
      startTime: period.start,
      endTime: period.end,
      duration: period.duration,
      term: tt.term,
      year: tt.year,
      scope: tt.scope
    }];

    // rebuild global slots from class blocks
    const global = (tt.slots || []).map(dayBlock => ({
      ...dayBlock,
      periods: (dayBlock.periods || []).map(p => ({ ...p, classes: [] }))
    }));
    for (const c of classes) {
      for (const dayBlock of c.timetable || []) {
        const gDay = global.find(g => g.day === dayBlock.day);
        if (!gDay) continue;
        (dayBlock.periods || []).forEach((p, idx) => {
          if (p.classes && p.classes.length && gDay.periods[idx]) {
            gDay.periods[idx].classes.push(...p.classes);
          }
        });
      }
    }

    await tt.update({ classes, slots: global });
    res.json({ success: true, message: 'Slot updated', data: tt });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.publish = async (req, res) => {
  try {
    const [count] = await Timetable.update({ isPublished: true }, { where: { id: req.params.id, schoolId: req.user.schoolCode } });
    res.json({ success: true, message: count ? 'Timetable published' : 'Timetable not found' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.getForClass = async (req, res) => {
  try {
    const where = { schoolId: req.user.schoolCode };
    if (req.query.weekStart) where.weekStartDate = req.query.weekStart;
    if (req.query.term) where.term = req.query.term;
    if (req.query.year) where.year = Number(req.query.year);
    const tt = await Timetable.findOne({ where, order: [['updatedAt', 'DESC']] });
    if (!tt) return res.json({ success: true, data: [] });
    const found = (tt.classes || []).find(c => Number(c.classId) === Number(req.params.classId));
    res.json({ success: true, data: found ? found.timetable : [] });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.getForTeacher = async (req, res) => {
  try {
    const where = { schoolId: req.user.schoolCode };
    if (req.query.weekStart) where.weekStartDate = req.query.weekStart;
    if (req.query.term) where.term = req.query.term;
    if (req.query.year) where.year = Number(req.query.year);
    const tt = await Timetable.findOne({ where, order: [['updatedAt', 'DESC']] });
    if (!tt) return res.json({ success: true, data: [] });
    const data = (tt.slots || []).map(d => ({
      day: d.day,
      periods: (d.periods || []).map(p => ({ ...p, classes: (p.classes || []).filter(c => Number(c.teacherId) === Number(req.params.teacherId)) })).filter(p => p.break || p.classes.length)
    })).filter(d => d.periods.length);
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.getByWeek = async (req, res) => {
  try {
    const where = { schoolId: req.user.schoolCode };
    if (req.query.weekStartDate) where.weekStartDate = req.query.weekStartDate;
    if (req.query.term) where.term = req.query.term;
    if (req.query.year) where.year = Number(req.query.year);
    const tt = await Timetable.findOne({ where, order: [['updatedAt', 'DESC']] });
    res.json({ success: true, data: tt || null });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};