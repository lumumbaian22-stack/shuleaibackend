const { Timetable, Class, Teacher, Subject } = require('../models'); // Note: Subject not defined; use Class.subjectTeachers
const moment = require('moment');

// Helper: generate timetable based on classes and teachers
async function generateSlots(schoolId, weekStart) {
    const classes = await Class.findAll({ where: { schoolId, isActive: true } });
    // Simple algorithm: For each class, assign subjects to slots based on teacher availability
    // This is a skeleton; actual constraints can be added later
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

    // For each class, get its subjects and teachers
    for (const cls of classes) {
        const subjects = cls.subjectTeachers || []; // array of { teacherId, subject }
        let periodIndex = 0;
        for (const subj of subjects) {
            const teacher = await Teacher.findByPk(subj.teacherId, { include: [{ model: User }] });
            if (!teacher) continue;
            const teacherName = teacher.User.name;
            // Simple assignment: assign sequentially across the week; you could add a rotation
            const dayIndex = Math.floor(periodIndex / periods.length) % days.length; // reset per week
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
        // Check if already exists for that week, overwrite
        const slots = await generateSlots(schoolId, weekStartDate);
        const [timetable, created] = await Timetable.findOrBuild({
            where: { schoolId, weekStartDate },
            defaults: { slots, isPublished: false }
        });
        if (!created) {
            timetable.slots = slots;
            await timetable.save();
        }
        res.json({ success: true, data: timetable });
    } catch (error) {
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
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.publish = async (req, res) => {
    try {
        const { id } = req.params;
        await Timetable.update({ isPublished: true }, { where: { id, schoolId: req.user.schoolCode } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getForClass = async (req, res) => {
    try {
        const { classId } = req.params;
        const schoolId = req.user.schoolCode;
        const currentWeekStart = moment().startOf('isoWeek').format('YYYY-MM-DD');
        const timetable = await Timetable.findOne({ where: { schoolId, weekStartDate: currentWeekStart, isPublished: true } });
        if (!timetable) return res.json({ success: true, data: [] });
        // Filter slots for the given classId
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
        const schoolId = req.user.schoolCode;
        const currentWeekStart = moment().startOf('isoWeek').format('YYYY-MM-DD');
        const timetable = await Timetable.findOne({ where: { schoolId, weekStartDate: currentWeekStart, isPublished: true } });
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
