const { SchoolCalendar } = require('../models');

exports.getCalendarEvents = async (req, res) => {
  try {
    const events = await SchoolCalendar.findAll({
      where: { schoolId: req.user.schoolCode, isPublic: true },
      order: [['startDate', 'ASC']]
    });
    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createEvent = async (req, res) => {
  try {
    const event = await SchoolCalendar.create({
      ...req.body,
      schoolId: req.user.schoolCode
    });
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    await SchoolCalendar.update(req.body, { where: { id, schoolId: req.user.schoolCode } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    await SchoolCalendar.destroy({ where: { id, schoolId: req.user.schoolCode } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
