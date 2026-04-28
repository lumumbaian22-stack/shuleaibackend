const { Timetable, Class, Teacher, User } = require('../models');
const moment = require('moment');

// Helper to generate slot data (basic algorithm)
async function generateSlots(schoolId, weekStart) {
  const classes = await Class.findAll({ where: { schoolCode: schoolId, isActive: true } });
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  const periods = [
    { start: '08:00', end: '09:00' },
    { start: '09:00', end: '10:00' },
    { start: '10:00', end: '11:00' },
    { start: '11:00', end: '12:00' },
    { start: '12:00', end: '13:00' },
    { start: '14:00', end: '15:00' },
    { start: '15:00', end: '16:00' }
  ];
  const slots = days.map(day => ({ day, periods: [] }));

  for (const cls of classes) {
    const subjects = cls.subjectTeachers || [];
    let periodIndex = 0;
    for (const subj of subjects) {
      const teacher = await Teacher.findByPk(subj.teacherId, { include: [{ model: User }] });
      if (!teacher) continue;
      const teacherName = teacher.User.name;
      const dayIndex = Math.floor(periodIndex / periods.length) % days.length;
      const periodOfDay = periodIndex % periods.length;
      const daySlot = slots[dayIndex].periods;
      daySlot.push({
        classId: cls.id,
        className: cls.name,
        subject: subj.subject,
        teacherId: teacher.id,
        teacherName: teacherName,
        startTime: periods[periodOfDay].start,
        endTime: periods[periodOfDay].end
      });
      periodIndex++;
    }
  }
  return slots;
}

exports.generate = async (req, res) => {
  try {
    const { weekStartDate } = req.body;
    const schoolId = req.user.schoolCode;
    const slots = await generateSlots(schoolId, weekStartDate);
    const [timetable, created] = await Timetable.findOrCreate({
      where: { schoolId, weekStartDate },
      defaults: { slots, isPublished: false }
    });
    if (!created) {
      timetable.slots = slots;
      await timetable.save();
    }
    res.json({ success: true, data: timetable });
  } catch (error) {
    console.error('Generate timetable error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.manualUpdate = async (req, res) => {
  try {
    const { id } = req.params;
    const { slots } = req.body;
    await Timetable.update({ slots }, { where: { id, schoolId: req.user.schoolCode } });
    res.json({ success: true });
  } catch (error) {
    console.error('Manual update timetable error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.publish = async (req, res) => {
  try {
    const { id } = req.params;
    await Timetable.update({ isPublished: true }, { where: { id, schoolId: req.user.schoolCode } });
    res.json({ success: true });
  } catch (error) {
    console.error('Publish timetable error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getForClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { weekStart } = req.query;
    const timetable = await Timetable.findOne({
      where: { schoolId: req.user.schoolCode, weekStartDate: weekStart || moment().startOf('isoWeek').format('YYYY-MM-DD'), isPublished: true }
    });
    if (!timetable) return res.json({ success: true, data: [] });
    const classSlots = timetable.slots.map(day => ({
      day: day.day,
      periods: day.periods.filter(p => p.classId == classId)
    })).filter(d => d.periods.length > 0);
    res.json({ success: true, data: classSlots });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getForTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { weekStart } = req.query;
    const timetable = await Timetable.findOne({
      where: { schoolId: req.user.schoolCode, weekStartDate: weekStart || moment().startOf('isoWeek').format('YYYY-MM-DD'), isPublished: true }
    });
    if (!timetable) return res.json({ success: true, data: [] });
    const teacherSlots = timetable.slots.map(day => ({
      day: day.day,
      periods: day.periods.filter(p => p.teacherId == teacherId)
    })).filter(d => d.periods.length > 0);
    res.json({ success: true, data: teacherSlots });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getByWeek = async (req, res) => {
  try {
    const { weekStartDate } = req.query;
    const timetable = await Timetable.findOne({
      where: { schoolId: req.user.schoolCode, weekStartDate: weekStartDate || moment().startOf('isoWeek').format('YYYY-MM-DD') }
    });
    if (!timetable) {
      return res.json({ success: true, data: null });   // no timetable yet
    }
    res.json({ success: true, data: timetable });
  } catch (error) {
    console.error('Get timetable error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
