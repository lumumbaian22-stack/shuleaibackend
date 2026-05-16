const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const { HomeTask, HomeTaskAssignment, Student, Teacher, Class, User, TeacherSubjectAssignment } = require('../models');
const { ensureRuntimeSchema } = require('../utils/schemaSafety');

function cleanString(value, fallback = '') {
  const s = String(value ?? '').trim();
  return s || fallback;
}


function normalizeClassText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classTextsMatch(a, b) {
  const left = normalizeClassText(a);
  const right = normalizeClassText(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function normalizeAttachments(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => {
    if (typeof item === 'string') return { url: item, name: item.split('/').pop() || 'Attachment' };
    return {
      url: item.url || item.secureUrl || item.path || '',
      secureUrl: item.secureUrl || item.url || '',
      name: item.name || item.originalName || item.filename || 'Attachment',
      mimeType: item.mimeType || item.type || 'application/octet-stream',
      size: item.size || 0
    };
  }).filter(item => item.url || item.secureUrl);
  if (typeof value === 'string') {
    try { return normalizeAttachments(JSON.parse(value)); } catch (_) { return value ? [{ url: value, name: value.split('/').pop() || 'Attachment' }] : []; }
  }
  return [];
}

function homeTaskAttachmentUrl(req, relativeUrl) {
  if (!relativeUrl) return '';
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const safeProto = req.get('host')?.includes('onrender.com') ? 'https' : proto;
  return `${safeProto}://${req.get('host')}${relativeUrl}`;
}

function homeworkFileApiUrl(req, rawUrl) {
  if (!rawUrl) return '';
  let filename = '';
  const raw = String(rawUrl || '').trim();
  try {
    if (/^https?:\/\//i.test(raw)) filename = path.basename(new URL(raw).pathname || '');
    else filename = path.basename(raw);
  } catch (_) {
    filename = path.basename(raw);
  }
  if (!filename || filename === '.' || filename === '..') return '';
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const safeProto = req.get('host')?.includes('onrender.com') ? 'https' : proto;
  return `${safeProto}://${req.get('host')}/homework-files/${encodeURIComponent(filename)}`;
}

function safeHomeworkDownloadUrl(req, relativeUrl) {
  if (!relativeUrl) return '';
  // Use the dedicated homework file route instead of raw /uploads links.
  // This avoids CSP/inline-script browser previews and keeps view/download stable across dashboards.
  return homeworkFileApiUrl(req, relativeUrl);
}

function normalizeAttachmentUrlsForResponse(req, attachments = []) {
  return normalizeAttachments(attachments).map(file => {
    const raw = file.secureUrl || file.url || '';
    const secureUrl = safeHomeworkDownloadUrl(req, raw);
    return { ...file, url: secureUrl, secureUrl, downloadUrl: secureUrl, viewUrl: secureUrl };
  });
}

function homeworkUploadRoot() {
  return path.join(__dirname, '../../uploads/homework');
}

exports.serveHomeworkAttachment = async (req, res) => {
  try {
    const filename = path.basename(String(req.params.filename || ''));
    if (!filename) return res.status(400).send('Invalid homework file');
    const fullPath = path.join(homeworkUploadRoot(), filename);
    if (!fullPath.startsWith(homeworkUploadRoot())) return res.status(400).send('Invalid homework file');
    if (!fs.existsSync(fullPath)) return res.status(404).send('Homework file not found. Please re-upload the assignment file.');

    const originalName = filename.replace(/^homework-\d+-\d+-\d+-/, '') || filename;
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Security-Policy', "default-src 'self' blob: data:; img-src 'self' blob: data:; media-src 'self' blob: data:; object-src 'self' blob: data:; script-src 'none'; style-src 'self' 'unsafe-inline'");
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Disposition', `${disposition}; filename="${originalName.replace(/"/g, '')}"`);
    return res.sendFile(fullPath);
  } catch (error) {
    console.error('Serve homework attachment error:', error);
    return res.status(500).send('Could not open homework file');
  }
};

function deriveAssignmentTiming(assignment, task) {
  const due = task?.dueDate ? new Date(task.dueDate) : null;
  const submittedAt = assignment?.completedAt ? new Date(assignment.completedAt) : null;
  const now = new Date();
  const status = String(assignment?.status || 'pending').toLowerCase();
  const isSubmitted = ['submitted', 'graded', 'completed'].includes(status) || Boolean(submittedAt);
  const isGraded = status === 'graded';
  const isLate = Boolean(due && !isSubmitted && now > due);
  const submittedLate = Boolean(due && submittedAt && submittedAt > due);
  let displayStatus = 'Pending';
  if (isGraded) displayStatus = submittedLate ? 'Graded late' : 'Graded';
  else if (isSubmitted) displayStatus = submittedLate ? 'Submitted late' : 'Submitted';
  else if (isLate) displayStatus = 'Late';
  return { isSubmitted, isGraded, isLate, submittedLate, displayStatus };
}

async function getTeacherFromUser(userId) {
  return Teacher.findOne({ where: { userId } });
}

function classNamesForStudentLookup(classItem) {
  return [...new Set([
    classItem?.name,
    classItem?.grade,
    `${classItem?.grade || ''} ${classItem?.stream || ''}`.trim(),
    `${classItem?.name || ''} ${classItem?.stream || ''}`.trim()
  ].filter(Boolean))];
}

async function getStudentsForClass(classItem, schoolCode) {
  if (!classItem) return [];
  const names = classNamesForStudentLookup(classItem);
  const normalizedNames = names.map(normalizeClassText).filter(Boolean);
  const seen = new Set();
  const results = [];
  const userIncludeSoft = { model: User, attributes: ['id', 'name', 'email', 'schoolCode'], required: false };
  const belongsToSchool = (student) => {
    const userSchool = student?.User?.schoolCode || student?.User?.dataValues?.schoolCode;
    return !schoolCode || !userSchool || userSchool === schoolCode;
  };
  const addMany = (rows = []) => rows.forEach((student) => {
    if (!student || seen.has(student.id) || !belongsToSchool(student)) return;
    seen.add(student.id);
    results.push(student);
  });

  const activeWhere = { status: { [Op.ne]: 'inactive' } };

  if (classItem.id) {
    addMany(await Student.unscoped().findAll({
      where: { ...activeWhere, classId: classItem.id },
      include: [userIncludeSoft],
      attributes: ['id', 'userId', 'grade', 'classId', 'status'],
      limit: 5000
    }));
  }

  if (names.length) {
    addMany(await Student.unscoped().findAll({
      where: { ...activeWhere, grade: { [Op.in]: names } },
      include: [userIncludeSoft],
      attributes: ['id', 'userId', 'grade', 'classId', 'status'],
      limit: 5000
    }));
  }

  // Broad fallback for old records where grade/class text differs by case, stream spacing, or punctuation.
  if (normalizedNames.length) {
    const schoolStudents = await Student.unscoped().findAll({
      where: activeWhere,
      include: [userIncludeSoft],
      attributes: ['id', 'userId', 'grade', 'classId', 'status'],
      limit: 10000
    });
    addMany(schoolStudents.filter(student => {
      if (!belongsToSchool(student)) return false;
      if (classItem.id && Number(student.classId) === Number(classItem.id)) return true;
      const studentGrade = normalizeClassText(student.grade);
      return normalizedNames.some(name => studentGrade === name || studentGrade.includes(name) || name.includes(studentGrade));
    }));
  }

  return results;
}

async function resolveClass({ classId, className, grade, schoolCode }) {
  let classItem = null;
  if (classId) {
    classItem = await Class.findOne({ where: { id: classId, schoolCode, isActive: true } });
  }
  if (!classItem && (className || grade)) {
    const name = cleanString(className || grade);
    classItem = await Class.findOne({
      where: {
        schoolCode,
        isActive: true,
        [Op.or]: [
          { name },
          { grade: name },
          { name: { [Op.iLike]: `%${name}%` } },
          { grade: { [Op.iLike]: `%${name}%` } }
        ]
      }
    });
  }
  return classItem;
}

exports.uploadHomeworkAttachment = async (req, res) => {
  try {
    await ensureRuntimeSchema().catch(() => null);
    const teacher = await getTeacherFromUser(req.user.id);
    if (!teacher) return res.status(403).json({ success: false, message: 'Teacher account not found' });

    const uploadRoot = homeworkUploadRoot();
    if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });

    let file = req.file || null;
    if (!file && req.files) {
      file = req.files.file || req.files.attachment || req.files.upload || null;
      if (Array.isArray(file)) file = file[0];
    }
    if (Array.isArray(req.files) && req.files.length) file = req.files[0];
    if (!file) return res.status(400).json({ success: false, message: 'No homework file uploaded' });

    const originalName = file.originalname || file.name || file.filename || 'homework-file';
    const safeExt = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '') || '';
    const safeBase = path.basename(originalName, safeExt).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60) || 'homework-file';
    const filename = `homework-${req.user.id}-${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeBase}${safeExt}`;
    const dest = path.join(uploadRoot, filename);

    if (file.mv) await file.mv(dest);
    else if (file.path && fs.existsSync(file.path)) fs.copyFileSync(file.path, dest);
    else if (file.tempFilePath && fs.existsSync(file.tempFilePath)) fs.copyFileSync(file.tempFilePath, dest);
    else if (file.buffer) fs.writeFileSync(dest, file.buffer);
    else return res.status(400).json({ success: false, message: 'Homework file could not be read' });

    const relativeUrl = `/uploads/homework/${filename}`;
    const payload = {
      url: relativeUrl,
      secureUrl: homeTaskAttachmentUrl(req, relativeUrl),
      name: originalName,
      mimeType: file.mimetype || file.type || 'application/octet-stream',
      size: file.size || (fs.statSync(dest).size || 0)
    };
    res.status(201).json({ success: true, data: payload });
  } catch (error) {
    console.error('Upload homework attachment error:', error);
    res.status(500).json({ success: false, message: error.message || 'Homework upload failed' });
  }
};

exports.createAssignment = async (req, res) => {
  try {
    await ensureRuntimeSchema().catch(() => null);
    const {
      title,
      instructions,
      description,
      content,
      subject,
      dueDate,
      classId,
      className,
      grade,
      studentIds,
      estimatedMinutes,
      points,
      difficulty,
      attachments,
      teacherNote
    } = req.body || {};

    const teacher = await getTeacherFromUser(req.user.id);
    if (!teacher) return res.status(403).json({ success: false, message: 'Teacher account not found' });

    const safeTitle = cleanString(title);
    const safeSubject = cleanString(subject, 'General');
    const safeInstructions = cleanString(instructions || description || content);

    if (!safeTitle) return res.status(400).json({ success: false, message: 'Homework title is required' });
    if (!safeInstructions) return res.status(400).json({ success: false, message: 'Homework instructions are required' });

    const classItem = await resolveClass({ classId, className, grade, schoolCode: req.user.schoolCode });
    const resolvedClassId = classItem?.id || classId || null;
    const resolvedClassName = classItem?.name || className || grade || null;

    let targetStudentIds = Array.isArray(studentIds) ? studentIds.filter(Boolean) : [];
    if (classItem && targetStudentIds.length === 0) {
      const students = await getStudentsForClass(classItem, req.user.schoolCode);
      targetStudentIds = students.map(s => s.id);
    }

    const task = await HomeTask.create({
      title: safeTitle,
      instructions: safeInstructions,
      type: 'teacher',
      subject: safeSubject,
      gradeLevel: classItem?.grade || resolvedClassName || 'all',
      difficulty: difficulty || 'medium',
      estimatedMinutes: Number(estimatedMinutes || 30),
      points: Number(points || 10),
      competencyId: null,
      learningOutcomeId: null,
      createdBy: teacher.id,
      createdByUserId: req.user.id,
      schoolCode: req.user.schoolCode,
      classId: resolvedClassId,
      className: resolvedClassName,
      dueDate: dueDate || null,
      materials: '',
      attachments: normalizeAttachments(attachments),
      teacherNote: cleanString(teacherNote || '')
    });

    const assignments = targetStudentIds.map(sid => ({
      studentId: sid,
      taskId: task.id,
      classId: resolvedClassId,
      schoolCode: req.user.schoolCode,
      assignedAt: new Date(),
      status: 'pending'
    }));
    if (assignments.length) await HomeTaskAssignment.bulkCreate(assignments, { ignoreDuplicates: true });

    const repairedStudents = await ensureHomeworkAssignmentsForTask(task, req.user.schoolCode);
    const assignedCount = await HomeTaskAssignment.count({ where: { taskId: task.id } });

    res.status(201).json({
      success: true,
      message: assignedCount ? 'Homework assigned successfully' : 'Homework saved, but no matching students were found for the selected class',
      data: {
        task: { ...task.toJSON(), attachments: normalizeAttachmentUrlsForResponse(req, task.attachments) },
        assignedCount,
        repairedCount: repairedStudents.length,
        taskId: task.id,
        classId: resolvedClassId || null,
        className: resolvedClassName || null
      }
    });
  } catch (error) {
    console.error('Create homework error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTeacherAssignments = async (req, res) => {
  try {
    await ensureRuntimeSchema().catch(() => null);
    const teacher = await getTeacherFromUser(req.user.id);
    if (!teacher) return res.status(403).json({ success: false, message: 'Not a teacher' });

    const tasks = await HomeTask.findAll({
      where: {
        [Op.or]: [
          { createdBy: teacher.id },
          { createdByUserId: req.user.id }
        ],
        [Op.and]: [
          { [Op.or]: [{ schoolCode: req.user.schoolCode }, { schoolCode: null }] }
        ]
      },
      include: [{ model: HomeTaskAssignment, required: false }],
      order: [['createdAt', 'DESC']]
    });

    for (const task of tasks) {
      const count = Array.isArray(task.HomeTaskAssignments) ? task.HomeTaskAssignments.length : 0;
      if (!count) await ensureHomeworkAssignmentsForTask(task, req.user.schoolCode);
    }

    const refreshed = await HomeTask.findAll({
      where: {
        [Op.or]: [
          { createdBy: teacher.id },
          { createdByUserId: req.user.id }
        ],
        [Op.and]: [
          { [Op.or]: [{ schoolCode: req.user.schoolCode }, { schoolCode: null }] }
        ]
      },
      include: [{ model: HomeTaskAssignment, required: false }],
      order: [['createdAt', 'DESC']]
    });

    res.json({ success: true, data: refreshed.map(t => {
      const json = t.toJSON();
      const assignments = json.HomeTaskAssignments || [];
      return {
        ...json,
        attachments: normalizeAttachmentUrlsForResponse(req, json.attachments),
        assignedCount: assignments.length,
        submittedCount: assignments.filter(a => ['submitted','graded'].includes(String(a.status || '').toLowerCase())).length,
        pendingCount: assignments.filter(a => !['submitted','graded'].includes(String(a.status || '').toLowerCase())).length
      };
    }) });
  } catch (error) {
    console.error('Get teacher assignments error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};



async function teacherOwnsTask(req, taskId) {
  const teacher = await getTeacherFromUser(req.user.id);
  if (!teacher) return { teacher: null, task: null };
  const task = await HomeTask.findOne({
    where: {
      id: Number(taskId),
      [Op.or]: [{ createdBy: teacher.id }, { createdByUserId: req.user.id }],
      [Op.and]: [{ [Op.or]: [{ schoolCode: req.user.schoolCode }, { schoolCode: null }] }]
    }
  });
  return { teacher, task };
}

async function ensureHomeworkAssignmentsForTask(task, schoolCode) {
  if (!task) return [];
  let classItem = null;
  if (task.classId) {
    classItem = await Class.findOne({ where: { id: task.classId, schoolCode, isActive: true } }).catch(() => null);
  }
  if (!classItem && (task.className || task.gradeLevel)) {
    classItem = await resolveClass({ className: task.className, grade: task.gradeLevel, schoolCode }).catch(() => null);
  }

  let students = [];
  if (classItem) students = await getStudentsForClass(classItem, schoolCode);

  // Final fallback: use task text directly when the Class row cannot be resolved.
  if (!students.length) {
    const names = [...new Set([task.className, task.gradeLevel].filter(Boolean))];
    const normalizedNames = names.map(normalizeClassText).filter(Boolean);
    if (normalizedNames.length) {
      const candidates = await Student.unscoped().findAll({
        where: { status: { [Op.ne]: 'inactive' } },
        include: [{ model: User, attributes: ['id','name','email','schoolCode'], required: false }],
        attributes: ['id','userId','grade','classId','status'],
        limit: 10000
      });
      students = candidates.filter(student => {
        const userSchool = student?.User?.schoolCode || student?.User?.dataValues?.schoolCode;
        if (schoolCode && userSchool && userSchool !== schoolCode) return false;
        const grade = normalizeClassText(student.grade);
        return normalizedNames.some(n => grade === n || grade.includes(n) || n.includes(grade));
      });
    }
  }

  for (const student of students) {
    await HomeTaskAssignment.findOrCreate({
      where: { taskId: task.id, studentId: student.id },
      defaults: {
        studentId: student.id,
        taskId: task.id,
        classId: task.classId || student.classId || null,
        schoolCode: schoolCode || task.schoolCode || null,
        assignedAt: new Date(),
        status: 'pending'
      }
    }).catch(() => null);
  }
  return students;
}

exports.getTeacherAssignmentDetails = async (req, res) => {
  try {
    await ensureRuntimeSchema().catch(() => null);
    const { task } = await teacherOwnsTask(req, req.params.taskId);
    if (!task) return res.status(404).json({ success: false, message: 'Homework not found' });
    await ensureHomeworkAssignmentsForTask(task, req.user.schoolCode);
    const assignments = await HomeTaskAssignment.findAll({
      where: { taskId: task.id },
      include: [{ model: Student, required: false, include: [{ model: User, attributes: ['id','name','email','profileImage','schoolCode'], required: false }] }],
      order: [['updatedAt', 'DESC']]
    });
    const maxPoints = Number(task.points || 0);
    const enrichedAssignments = assignments.map(row => {
      const json = row.toJSON();
      const timing = deriveAssignmentTiming(json, task);
      return {
        ...json,
        ...timing,
        displayStatus: timing.displayStatus,
        maxPoints,
        scoreText: json.pointsEarned !== null && json.pointsEarned !== undefined ? `${json.pointsEarned}/${maxPoints || ''}`.replace(/\/$/, '') : 'Not graded'
      };
    });
    res.json({ success: true, data: { task: { ...task.toJSON(), attachments: normalizeAttachmentUrlsForResponse(req, task.attachments) }, assignments: enrichedAssignments } });
  } catch (error) {
    console.error('Get homework details error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateTeacherAssignment = async (req, res) => {
  try {
    await ensureRuntimeSchema().catch(() => null);
    const { task } = await teacherOwnsTask(req, req.params.taskId);
    if (!task) return res.status(404).json({ success: false, message: 'Homework not found' });
    const allowed = ['title','instructions','subject','dueDate','difficulty','estimatedMinutes','points','teacherNote','attachments'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.title !== undefined) updates.title = cleanString(updates.title, task.title);
    if (updates.instructions !== undefined) updates.instructions = cleanString(updates.instructions, task.instructions);
    if (updates.subject !== undefined) updates.subject = cleanString(updates.subject, task.subject || 'General');
    if (updates.attachments !== undefined) updates.attachments = normalizeAttachments(updates.attachments);
    await task.update(updates);
    res.json({ success: true, message: 'Homework updated successfully', data: task });
  } catch (error) {
    console.error('Update homework error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.reviewSubmission = async (req, res) => {
  try {
    await ensureRuntimeSchema().catch(() => null);
    const assignment = await HomeTaskAssignment.findByPk(req.params.assignmentId, { include: [{ model: HomeTask }] });
    if (!assignment?.HomeTask) return res.status(404).json({ success: false, message: 'Submission not found' });
    const { task } = await teacherOwnsTask(req, assignment.HomeTask.id);
    if (!task) return res.status(403).json({ success: false, message: 'Not allowed to review this homework' });
    const { status = 'graded', pointsEarned = null, teacherComment = '' } = req.body || {};
    const parentFeedback = { ...(assignment.parentFeedback || {}), teacherComment, reviewedAt: new Date().toISOString(), reviewedBy: req.user.id };
    await assignment.update({ status, pointsEarned, parentFeedback });
    res.json({ success: true, message: 'Submission reviewed', data: assignment });
  } catch (error) {
    console.error('Review homework submission error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

async function ensureHomeworkAssignmentsForStudent(student, schoolCode) {
  const studentClass = student.classId ? await Class.findOne({ where: { id: student.classId, schoolCode, isActive: true } }).catch(() => null) : null;
  const classNames = [...new Set([
    student.grade,
    studentClass?.name,
    studentClass?.grade,
    `${studentClass?.grade || ''} ${studentClass?.stream || ''}`.trim(),
    `${studentClass?.name || ''} ${studentClass?.stream || ''}`.trim()
  ].filter(Boolean))];

  const orRules = [];
  if (student.classId) orRules.push({ classId: student.classId });
  if (classNames.length) {
    orRules.push({ className: { [Op.in]: classNames } });
    orRules.push({ gradeLevel: { [Op.in]: classNames } });
  }
  if (!orRules.length) return;

  let tasks = await HomeTask.findAll({
    where: {
      isActive: { [Op.ne]: false },
      [Op.and]: [
        { [Op.or]: [{ schoolCode }, { schoolCode: null }] },
        { [Op.or]: orRules }
      ]
    },
    attributes: ['id', 'classId', 'className', 'gradeLevel', 'schoolCode'],
    limit: 500
  });

  if (!tasks.length && classNames.length) {
    const candidates = await HomeTask.findAll({
      where: { isActive: { [Op.ne]: false }, [Op.or]: [{ schoolCode }, { schoolCode: null }] },
      attributes: ['id', 'classId', 'className', 'gradeLevel', 'schoolCode'],
      limit: 1000
    });
    tasks = candidates.filter(task => classNames.some(name => classTextsMatch(task.className, name) || classTextsMatch(task.gradeLevel, name)) || (student.classId && Number(task.classId) === Number(student.classId)));
  }

  for (const task of tasks) {
    await HomeTaskAssignment.findOrCreate({
      where: { taskId: task.id, studentId: student.id },
      defaults: {
        studentId: student.id,
        taskId: task.id,
        classId: task.classId || student.classId || null,
        schoolCode: schoolCode || task.schoolCode || null,
        assignedAt: new Date(),
        status: 'pending'
      }
    }).catch(() => null);
  }
}

exports.getStudentAssignments = async (req, res) => {
  try {
    await ensureRuntimeSchema().catch(() => null);
    const student = await Student.findOne({
      where: { userId: req.user.id },
      attributes: ['id', 'userId', 'grade', 'classId', 'status']
    });
    if (!student) return res.status(403).json({ success: false, message: 'Not a student' });

    await ensureHomeworkAssignmentsForStudent(student, req.user.schoolCode);

    const assignments = await HomeTaskAssignment.findAll({
      where: {
        studentId: student.id,
        [Op.or]: [{ schoolCode: req.user.schoolCode }, { schoolCode: null }]
      },
      include: [{
        model: HomeTask,
        required: true,
        where: { [Op.or]: [{ schoolCode: req.user.schoolCode }, { schoolCode: null }] },
        include: [{ model: Teacher, required: false, include: [{ model: User, attributes: ['id', 'name'], required: false }] }]
      }],
      order: [['assignedAt', 'DESC']]
    });

    const data = assignments.map(a => {
      const row = a.toJSON();
      const task = row.HomeTask || {};
      const timing = deriveAssignmentTiming(row, task);
      const maxPoints = Number(task.points || 0);
      return {
        id: row.id,
        assignmentId: row.id,
        studentId: row.studentId,
        taskId: row.taskId,
        status: row.status || 'pending',
        displayStatus: timing.displayStatus,
        isLate: timing.isLate,
        submittedLate: timing.submittedLate,
        assignedAt: row.assignedAt,
        submittedAt: row.completedAt || null,
        studentFeedback: row.studentFeedback || {},
        parentFeedback: row.parentFeedback || {},
        pointsEarned: row.pointsEarned ?? null,
        maxPoints,
        scoreText: row.pointsEarned !== null && row.pointsEarned !== undefined ? `${row.pointsEarned}/${maxPoints || ''}`.replace(/\/$/, '') : 'Not graded',
        schoolCode: row.schoolCode || task.schoolCode || null,
        HomeTask: {
          id: task.id,
          title: task.title || 'Untitled Homework',
          instructions: task.instructions || '',
          description: task.instructions || '',
          subject: task.subject || 'General',
          dueDate: task.dueDate || null,
          classId: task.classId || null,
          className: task.className || null,
          estimatedMinutes: task.estimatedMinutes || null,
          points: task.points || 0,
          difficulty: task.difficulty || null,
          attachments: normalizeAttachmentUrlsForResponse(req, task.attachments),
          teacherNote: task.teacherNote || '',
          teacherName: task.Teacher?.User?.name || 'Not assigned',
          createdAt: task.createdAt
        }
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get student assignments error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitAssignment = async (req, res) => {
  try {
    await ensureRuntimeSchema().catch(() => null);
    const { assignmentId } = req.params;
    const { fileUrl, comment } = req.body;
    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) return res.status(403).json({ success: false, message: 'Not a student' });
    const assignment = await HomeTaskAssignment.findOne({ where: { id: assignmentId, studentId: student.id } });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });

    const task = await HomeTask.findByPk(assignment.taskId);
    const submittedAt = new Date();
    const due = task?.dueDate ? new Date(task.dueDate) : null;
    const submittedLate = Boolean(due && submittedAt > due);
    await assignment.update({
      status: 'submitted',
      completedAt: submittedAt,
      studentFeedback: { fileUrl, comment, submittedLate }
    });
    res.json({ success: true, data: { submittedLate, displayStatus: submittedLate ? 'Submitted late' : 'Submitted' } });
  } catch (error) {
    console.error('Submit assignment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
