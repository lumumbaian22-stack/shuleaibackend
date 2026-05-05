const { SchoolCalendar } = require('../models');

function normalizeEvent(body, user) {
  return {
    schoolId: user.schoolCode,
    eventType: body.eventType || body.type || 'other',
    eventName: body.eventName || body.title || 'Untitled Event',
    description: body.description || '',
    startDate: body.startDate || body.date,
    endDate: body.endDate || body.date || body.startDate,
    term: body.term || null,
    year: body.year || (body.startDate || body.date ? new Date(body.startDate || body.date).getFullYear() : new Date().getFullYear()),
    isPublic: body.isPublic !== false
  };
}

function frontendEvent(event) {
  const raw = event.toJSON ? event.toJSON() : event;
  return {
    ...raw,
    title: raw.eventName,
    date: raw.startDate,
    time: raw.time || '',
    location: raw.location || '',
    type: raw.eventType
  };
}

exports.getCalendarEvents = async (req, res) => {
  try {
    const events = await SchoolCalendar.findAll({
      where: { schoolId: req.user.schoolCode, isPublic: true },
      order: [['startDate', 'ASC']]
    });
    res.json({ success: true, data: events.map(frontendEvent) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createEvent = async (req, res) => {
  try {
    const payload = normalizeEvent(req.body, req.user);
    if (!payload.startDate) return res.status(400).json({ success: false, message: 'Event date is required' });
    const event = await SchoolCalendar.create(payload);
    if (global.io && req.user.schoolCode) global.io.to(`school-${req.user.schoolCode}`).emit('school-calendar:event-created', frontendEvent(event));
    res.status(201).json({ success: true, data: frontendEvent(event) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = normalizeEvent(req.body, req.user);
    delete payload.schoolId;
    await SchoolCalendar.update(payload, { where: { id, schoolId: req.user.schoolCode } });
    const event = await SchoolCalendar.findOne({ where: { id, schoolId: req.user.schoolCode } });
    if (global.io && req.user.schoolCode) global.io.to(`school-${req.user.schoolCode}`).emit('school-calendar:event-updated', frontendEvent(event));
    res.json({ success: true, data: frontendEvent(event) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    await SchoolCalendar.destroy({ where: { id, schoolId: req.user.schoolCode } });
    if (global.io && req.user.schoolCode) global.io.to(`school-${req.user.schoolCode}`).emit('school-calendar:event-deleted', { id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
