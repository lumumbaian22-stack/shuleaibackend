const { TutorSession, TutorMessage, TutorProgress, TutorUsage, Student, AcademicRecord, Attendance } = require('../models');
const { detectCommand } = require('../services/tutor/commandDetector');
const { LEVELS, normalizeGrade, getLevelByGrade, detectSubject } = require('../services/tutor/curriculumSubjects');
const { detectTopic, buildTutorAnswer } = require('../services/tutor/tutorKnowledge');
const { callClaudeTutor } = require('../services/claudeTutorService');

async function resolveStudent(req, requestedStudentId) {
  if (requestedStudentId) {
    const s = await Student.findByPk(requestedStudentId);
    if (s) return s;
  }
  if (req.user.role === 'student') {
    const s = await Student.findOne({ where: { userId: req.user.id } });
    if (s) return s;
  }
  return null;
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

exports.getTutorConfig = async (req, res) => {
  res.json({ success: true, data: { levels: LEVELS, commands: ['ask', 'explain', 'solve', 'quiz', 'summarize', 'revise', 'homework', 'weakness', 'plan'] } });
};

exports.askTutor = async (req, res) => {
  try {
    const { question = '', studentId, grade, subject, mode, curriculum } = req.body;
    if (!String(question).trim()) return res.status(400).json({ success: false, message: 'Question is required' });

    const schoolId = req.user.schoolCode || req.body.schoolId || 'default';
    const student = await resolveStudent(req, studentId);
    const realStudentId = student?.id || studentId || req.user.id;
    const realGrade = normalizeGrade(grade || student?.grade || 'Grade 5');
    const level = getLevelByGrade(realGrade);
    const realSubject = subject || detectSubject(question, realGrade);
    const command = req.body.command || detectCommand(question);
    const topic = detectTopic(question, realSubject);

    let usage = await TutorUsage.findOne({ where: { schoolId, studentId: realStudentId, usageDate: todayISO() } });
    if (!usage) usage = await TutorUsage.create({ schoolId, studentId: realStudentId, usageDate: todayISO(), totalQuestions: 0, aiCalls: 0 });
    const dailyLimit = req.user.role === 'admin' || req.user.role === 'teacher' ? 500 : 50;
    if (usage.totalQuestions >= dailyLimit) {
      return res.status(403).json({ success: false, message: 'Daily tutor limit reached', data: { locked: true, dailyLimit } });
    }

    const session = await TutorSession.create({ schoolId, studentId: realStudentId, userId: req.user.id, grade: realGrade, level: level.id, subject: realSubject, mode: mode || command, lastCommand: command });
    await TutorMessage.create({ schoolId, sessionId: session.id, studentId: realStudentId, userId: req.user.id, role: 'student', message: question, subject: realSubject, topic, command, source: 'student' });

    const localAnswer = buildTutorAnswer({ question, command, subject: realSubject, topic, grade: realGrade, level });

    const recentMarks = student ? await AcademicRecord.findAll({ where: { studentId: student.id, schoolCode: schoolId }, order: [['createdAt','DESC']], limit: 5 }).catch(()=>[]) : [];
    const recentAttendance = student ? await Attendance.findAll({ where: { studentId: student.id, schoolCode: schoolId }, order: [['date','DESC']], limit: 5 }).catch(()=>[]) : [];
    let aiText = null;
    try {
      aiText = await callClaudeTutor({ question, command, subject: realSubject, topic, grade: realGrade, curriculum: curriculum || student?.curriculum || 'cbc', studentContext: { recentMarks: recentMarks.map(r=>({subject:r.subject, score:r.score, term:r.term, year:r.year})), recentAttendance: recentAttendance.map(a=>({date:a.date, status:a.status})) } });
    } catch (aiError) {
      console.error('Claude tutor failed, using deterministic tutor engine:', aiError.message);
    }
    const answer = { ...localAnswer, explanation: aiText || localAnswer.explanation, source: aiText ? 'claude-haiku' : localAnswer.source };

    await TutorMessage.create({ schoolId, sessionId: session.id, studentId: realStudentId, userId: req.user.id, role: 'tutor', message: answer.explanation, subject: realSubject, topic, command, source: answer.source, metadata: answer });
    const [progress] = await TutorProgress.findOrCreate({ where: { schoolId, studentId: realStudentId, subject: realSubject, topic }, defaults: { schoolId, studentId: realStudentId, grade: realGrade, level: level.id, subject: realSubject, topic, attempts: 0, correct: 0 } });
    await progress.update({ attempts: progress.attempts + 1, lastCommand: command, lastSource: answer.source, lastStudiedAt: new Date() });
    await usage.update({ totalQuestions: usage.totalQuestions + 1 });

    res.json({ success: true, data: { ...answer, command, subject: realSubject, grade: realGrade, level: level.name, supportedSubjects: level.subjects, sessionId: session.id, usage: { used: usage.totalQuestions + 1, limit: dailyLimit } } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProgress = async (req, res) => {
  try {
    const schoolId = req.user.schoolCode || 'default';
    const student = await resolveStudent(req, req.params.studentId);
    const realStudentId = student?.id || req.params.studentId || req.user.id;
    const progress = await TutorProgress.findAll({ where: { schoolId, studentId: realStudentId }, order: [['updatedAt', 'DESC']] });
    res.json({ success: true, data: progress });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.getSessionHistory = async (req, res) => {
  try {
    const schoolId = req.user.schoolCode || 'default';
    const student = await resolveStudent(req, req.params.studentId);
    const realStudentId = student?.id || req.params.studentId || req.user.id;
    const messages = await TutorMessage.findAll({ where: { schoolId, studentId: realStudentId }, order: [['createdAt', 'DESC']], limit: 40 });
    res.json({ success: true, data: messages.reverse() });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.submitPracticeAnswer = async (req, res) => {
  try {
    const { studentId, subject = 'General', topic = 'Practice', isCorrect = false } = req.body;
    const schoolId = req.user.schoolCode || 'default';
    const realStudentId = studentId || req.user.id;
    const [progress] = await TutorProgress.findOrCreate({ where: { schoolId, studentId: realStudentId, subject, topic }, defaults: { schoolId, studentId: realStudentId, subject, topic } });
    await progress.update({ attempts: progress.attempts + 1, correct: progress.correct + (isCorrect ? 1 : 0), lastCommand: 'quiz', lastStudiedAt: new Date() });
    res.json({ success: true, data: { correct: !!isCorrect, progress } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.getParentReport = async (req, res) => {
  try {
    const schoolId = req.user.schoolCode || 'default';
    const rows = await TutorProgress.findAll({ where: { schoolId }, order: [['updatedAt', 'DESC']], limit: 100 });
    res.json({ success: true, data: { summary: 'Tutor progress report', rows } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.getTeacherReport = async (req, res) => {
  try {
    const schoolId = req.user.schoolCode || 'default';
    const rows = await TutorProgress.findAll({ where: { schoolId }, order: [['attempts', 'DESC']], limit: 100 });
    res.json({ success: true, data: { weakTopics: rows.filter(r => r.attempts > r.correct), rows } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
