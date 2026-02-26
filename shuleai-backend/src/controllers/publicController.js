const { School, DutyRoster } = require('../models');
const moment = require('moment');

// @desc    Get public duty view for today
// @route   GET /api/public/duty/today
// @access  Public
exports.getPublicDutyView = async (req, res) => {
  try {
    const { schoolId } = req.query;
    if (!schoolId) return res.status(400).json({ success: false, message: 'schoolId required' });

    const school = await School.findOne({ where: { schoolId } });
    if (!school) return res.status(404).json({ success: false, message: 'School not found' });

    const today = moment().format('YYYY-MM-DD');
    const roster = await DutyRoster.findOne({
      where: { schoolId: school.schoolId, date: today }
    });

    if (!roster || !roster.duties.length) {
      return res.json({ success: true, data: { date: today, duties: [], message: 'No duty today' } });
    }

    const duties = roster.duties.map(d => ({
      teacherName: d.teacherName,
      type: d.type,
      area: d.area,
      time: `${d.timeSlot.start} - ${d.timeSlot.end}`
    }));

    res.json({
      success: true,
      data: {
        schoolName: school.name,
        date: today,
        duties
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get public weekly duty schedule
// @route   GET /api/public/duty/week
// @access  Public
exports.getPublicWeeklyDuty = async (req, res) => {
  try {
    const { schoolId } = req.query;
    if (!schoolId) return res.status(400).json({ success: false, message: 'schoolId required' });

    const school = await School.findOne({ where: { schoolId } });
    if (!school) return res.status(404).json({ success: false, message: 'School not found' });

    const startOfWeek = moment().startOf('week');
    const endOfWeek = moment().endOf('week');

    const rosters = await DutyRoster.findAll({
      where: {
        schoolId: school.schoolId,
        date: { [Op.between]: [startOfWeek.format('YYYY-MM-DD'), endOfWeek.format('YYYY-MM-DD')] }
      },
      order: [['date', 'ASC']]
    });

    const weekly = [];
    for (let i = 0; i < 7; i++) {
      const day = moment().startOf('week').add(i, 'days');
      const dayRoster = rosters.find(r => r.date === day.format('YYYY-MM-DD'));
      weekly.push({
        date: day.format('YYYY-MM-DD'),
        dayName: day.format('dddd'),
        duties: dayRoster ? dayRoster.duties.map(d => ({
          teacherName: d.teacherName,
          type: d.type,
          time: `${d.timeSlot.start} - ${d.timeSlot.end}`
        })) : []
      });
    }

    res.json({ success: true, data: { schoolName: school.name, weekly } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get public school info
// @route   GET /api/public/school/:schoolId
// @access  Public
exports.getSchoolInfo = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const school = await School.findOne({
      where: { schoolId },
      attributes: ['name', 'schoolId', 'system', 'address', 'contact']
    });
    if (!school) return res.status(404).json({ success: false, message: 'School not found' });
    res.json({ success: true, data: school });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};