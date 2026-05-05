const { SchoolCalendar } = require('../models');

function getSchoolId(req) {
  return req.user?.schoolCode || req.body?.schoolId || req.query?.schoolId || 'default';
}

function normalizeEvent(body, user) {
  const startDate = body.startDate || body.date;
  const endDate = body.endDate || body.date || startDate;
  return {
    schoolId: user.schoolCode || body.schoolId || 'default',
    eventType: body.eventType || body.type || 'other',
    eventName: body.eventName || body.title || 'Untitled Event',
    description: body.description || '',
    startDate,
    endDate,
    time: body.time || null,
    location: body.location || null,
    audience: body.audience || 'whole_school',
    term: body.term || null,
    year: body.year || (startDate ? new Date(startDate).getFullYear() : new Date().getFullYear()),
    isPublic: body.isPublic !== false
  };
}

function frontendEvent(event) {
  const raw = event?.toJSON ? event.toJSON() : (event || {});
  return {
    ...raw,
    title: raw.eventName,
    date: raw.startDate,
    type: raw.eventType,
    broadcastTo: raw.audience || 'whole_school'
  };
}

exports.getCalendarEvents = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const where = { schoolId, isPublic: true };
    if (req.query.year) where.year = Number(req.query.year);
    if (req.query.term) where.term = req.query.term;

    const events = await SchoolCalendar.findAll({
      where,
      order: [['startDate', 'ASC'], ['createdAt', 'ASC']]
    });
    res.json({ success: true, data: events.map(frontendEvent) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createEvent = async (req, res) => {
  try {
    const payload = normalizeEvent(req.body, req.user || {});
    if (!payload.startDate) return res.status(400).json({ success: false, message: 'Event start date is required' });
    if (!payload.schoolId) return res.status(400).json({ success: false, message: 'School ID is required' });

    const event = await SchoolCalendar.create(payload);
    const out = frontendEvent(event);
    if (global.io && payload.schoolId) {
      global.io.to(`school-${payload.schoolId}`).emit('school-calendar:event-created', out);
      global.io.to(`school-${payload.schoolId}`).emit('school-calendar:changed', { action: 'created', event: out });
    }
    res.status(201).json({ success: true, data: out, message: 'Academic calendar event saved and broadcasted to the whole school' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = getSchoolId(req);
    const payload = normalizeEvent(req.body, req.user || {});
    delete payload.schoolId;
    await SchoolCalendar.update(payload, { where: { id, schoolId } });
    const event = await SchoolCalendar.findOne({ where: { id, schoolId } });
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    const out = frontendEvent(event);
    if (global.io && schoolId) {
      global.io.to(`school-${schoolId}`).emit('school-calendar:event-updated', out);
      global.io.to(`school-${schoolId}`).emit('school-calendar:changed', { action: 'updated', event: out });
    }
    res.json({ success: true, data: out });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = getSchoolId(req);
    await SchoolCalendar.destroy({ where: { id, schoolId } });
    if (global.io && schoolId) {
      global.io.to(`school-${schoolId}`).emit('school-calendar:event-deleted', { id: String(id) });
      global.io.to(`school-${schoolId}`).emit('school-calendar:changed', { action: 'deleted', id: String(id) });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
