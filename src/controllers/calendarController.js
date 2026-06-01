const { SchoolCalendar, User, Alert, Student } = require('../models');

function getSchoolId(req) {
  return req.user?.schoolCode || req.body?.schoolId || req.query?.schoolId || 'default';
}

function normalizeVisibility(value) {
  const raw = String(value || 'personal').toLowerCase().replace(/[\s-]+/g, '_');
  const allowed = ['personal','admin_only','teachers','parents','students','whole_school','specific_class','specific_role','specific_user'];
  return allowed.includes(raw) ? raw : 'personal';
}

function normalizeEvent(body, user) {
  const startDate = body.startDate || body.date;
  const endDate = body.endDate || body.date || startDate;
  const visibility = normalizeVisibility(body.visibility || body.audience || body.broadcastTo || 'personal');
  return {
    schoolId: user.schoolCode || body.schoolId || 'default',
    eventType: body.eventType || body.type || 'other',
    eventName: body.eventName || body.title || 'Untitled Event',
    description: body.description || '',
    startDate,
    endDate,
    time: body.time || null,
    location: body.location || null,
    audience: visibility,
    visibility,
    createdByUserId: user.id || body.createdByUserId || null,
    targetRole: body.targetRole || null,
    targetUserId: body.targetUserId || null,
    classId: body.classId || null,
    term: body.term || null,
    year: body.year || (startDate ? new Date(startDate).getFullYear() : new Date().getFullYear()),
    metadata: body.metadata || {},
    isPublic: visibility === 'whole_school'
  };
}


async function createCalendarBroadcastAlerts({ event, schoolId, actor }) {
  try {
    const audience = String(event.visibility || event.audience || 'personal').toLowerCase();
    if (audience === 'personal') return 0;
    const where = { schoolCode: schoolId, isActive: true };
    if (audience === 'teachers') where.role = 'teacher';
    else if (audience === 'parents') where.role = 'parent';
    else if (audience === 'students') where.role = 'student';
    else if (audience === 'admin_only') where.role = 'admin';
    else if (audience === 'specific_role' && event.targetRole) where.role = event.targetRole;
    else if (audience === 'specific_user' && event.targetUserId) where.id = event.targetUserId;
    else if (audience === 'whole_school') where.role = ['admin', 'teacher', 'parent', 'student'];
    else if (audience === 'specific_class') where.role = ['student','parent','teacher'];
    else where.role = ['admin', 'teacher', 'parent', 'student'];

    let recipients = await User.findAll({ where, limit: 3000 }).catch(() => []);
    if (event.classId && ['students','parents','specific_class'].includes(audience)) {
      const students = await Student.findAll({ where: { classId: event.classId }, include: [{ model: User, attributes: ['id','role','schoolCode'] }] }).catch(() => []);
      const ids = new Set(students.map(s => s.User?.id).filter(Boolean));
      recipients = recipients.filter(u => ids.has(u.id) || u.role === 'teacher');
    }
    const title = `Calendar: ${event.title || event.eventName || 'Event'}`;
    const message = [event.description, event.date || event.startDate, event.time, event.location].filter(Boolean).join(' • ') || 'A new calendar event has been added.';
    const created = [];
    for (const user of recipients) {
      const dedupeKey = [schoolId, user.id, 'calendar-event', event.id].join(':');
      const payload = {
        userId: user.id,
        role: user.role === 'superadmin' ? 'super_admin' : user.role,
        type: 'academic',
        severity: 'info',
        title,
        message,
        categoryLabel: 'Academic Calendar',
        sourceType: 'calendar_broadcast',
        sourceLabel: 'Academic Calendar',
        targetRole: user.role,
        targetUserId: user.id,
        dedupeKey,
        actionUrl: '#calendar',
        actionLabel: 'View Calendar',
        data: { eventId: event.id, eventDate: event.date || event.startDate, audience, createdBy: actor?.id || null }
      };
      const existing = await Alert.findOne({ where: { userId: user.id, dedupeKey } }).catch(() => null);
      const alert = existing ? await existing.update({ ...payload, isRead: false, readAt: null }) : await Alert.create(payload);
      created.push(alert);
      if (global.io) global.io.to(`user-${user.id}`).emit('alert', alert);
    }
    return created.length;
  } catch (e) {
    console.warn('Calendar broadcast alert creation failed:', e.message);
    return 0;
  }
}


function emitCalendarEventToScope(action, event, payload = {}) {
  if (!global.io || !payload.schoolId) return;
  const visibility = normalizeVisibility(payload.visibility || event?.visibility || event?.audience || 'personal');
  const emitToUser = (userId) => {
    if (!userId) return;
    global.io.to(`user-${userId}`).emit(`school-calendar:event-${action}`, event);
    global.io.to(`user-${userId}`).emit('school-calendar:changed', { action, event });
  };

  if (visibility === 'whole_school') {
    global.io.to(`school-${payload.schoolId}`).emit(`school-calendar:event-${action}`, event);
    global.io.to(`school-${payload.schoolId}`).emit('school-calendar:changed', { action, event });
    global.io.to(`school-${payload.schoolId}`).emit('alerts:updated', { type: `calendar:event-${action}`, schoolCode: payload.schoolId, event });
    return;
  }

  if (visibility === 'specific_user') {
    emitToUser(payload.targetUserId || event?.targetUserId);
    emitToUser(payload.createdByUserId || event?.createdByUserId);
    return;
  }

  // Personal/admin/private events must never be broadcast to the whole school.
  emitToUser(payload.createdByUserId || event?.createdByUserId);
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
    const role = String(req.user?.role || '').toLowerCase();
    const userId = req.user?.id;
    const base = { schoolId };
    if (req.query.year) base.year = Number(req.query.year);
    if (req.query.term) base.term = req.query.term;
    const all = await SchoolCalendar.findAll({ where: base, order: [['startDate', 'ASC'], ['createdAt', 'ASC']] });
    const visible = all.filter(e => {
      const raw = e.toJSON ? e.toJSON() : e;
      const vis = normalizeVisibility(raw.visibility || raw.audience || (raw.isPublic ? 'whole_school' : 'personal'));
      if (vis === 'personal') return Number(raw.createdByUserId) === Number(userId);
      if (vis === 'admin_only') return role === 'admin' && raw.schoolId === schoolId;
      if (vis === 'teachers') return role === 'teacher' || role === 'admin';
      if (vis === 'parents') return role === 'parent' || role === 'admin';
      if (vis === 'students') return role === 'student' || role === 'admin';
      if (vis === 'specific_user') return Number(raw.targetUserId) === Number(userId) || role === 'admin';
      if (vis === 'specific_role') return role === String(raw.targetRole || '').toLowerCase() || role === 'admin';
      if (vis === 'specific_class') return role === 'admin' || !raw.classId || String(req.query.classId || '') === String(raw.classId);
      if (vis === 'whole_school') return ['admin','teacher','parent','student'].includes(role);
      return Number(raw.createdByUserId) === Number(userId);
    });
    const out = visible.map(frontendEvent);
    res.json({ success: true, data: out, events: out });
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
    const alertCount = await createCalendarBroadcastAlerts({ event: out, schoolId: payload.schoolId, actor: req.user || {} });
    emitCalendarEventToScope('created', out, payload);
    res.status(201).json({ success: true, data: out, events: [out], alertCount, message: `Academic calendar event saved and broadcasted to ${alertCount || 'the selected audience'} user(s)` });
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
    emitCalendarEventToScope('updated', out, { schoolId, visibility: out.visibility || out.audience, createdByUserId: out.createdByUserId, targetUserId: out.targetUserId });
    res.json({ success: true, data: out });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = getSchoolId(req);
    const event = await SchoolCalendar.findOne({ where: { id, schoolId } });
    await SchoolCalendar.destroy({ where: { id, schoolId } });
    const raw = event?.toJSON ? event.toJSON() : (event || {});
    emitCalendarEventToScope('deleted', { id: String(id), schoolId }, { schoolId, visibility: raw.visibility || raw.audience, createdByUserId: raw.createdByUserId, targetUserId: raw.targetUserId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
