const { Student, User, TutorSession, TutorMessage, LearningMaterial } = require('../models');
const { Op } = require('sequelize');
const { detectSubject, detectIntent, buildTutorAnswer } = require('../services/tutorEngine');
const { analyzeStudent, updateTutorInsight } = require('../services/curriculumAnalyticsEngine');
const { hasFeatureForUser } = require('../services/subscriptionService');

async function getStudentForUser(user, requestedStudentId) {
  if (user.role === 'student') return Student.findOne({ where: { userId: user.id }, include: [{ model: User, attributes: ['id','name','schoolCode'] }] });
  if (user.role === 'parent' && requestedStudentId) return Student.findByPk(requestedStudentId, { include: [{ model: User, attributes: ['id','name','schoolCode'] }] });
  return null;
}

exports.chat = async (req, res) => {
  try {
    const { message, sessionId, studentId } = req.body || {};
    if (!message || String(message).trim().length < 2) return res.status(400).json({ success:false, message:'Enter a learning question.' });
    const access = await hasFeatureForUser(req.user, 'ai_tutor', studentId);
    if (!access.allowed) return res.status(402).json({ success:false, code:'SUBSCRIPTION_REQUIRED', message:'AI Tutor is included in Premium and Ultimate subscriptions.', subscription: access.status });
    const student = await getStudentForUser(req.user, studentId);
    if (!student) return res.status(404).json({ success:false, message:'Student profile not found' });
    const detected = detectSubject(message);
    const intent = detectIntent(message);
    const insight = await analyzeStudent(student);
    const weakAreas = insight.weakAreas || [];
    const subject = detected.subject === 'General Learning' && weakAreas[0] ? weakAreas[0] : detected.subject;
    const materials = await LearningMaterial.findAll({ where: { subject, isActive: true, accessLevel: { [Op.in]: ['basic','premium','ultimate'] }, [Op.or]: [{ schoolCode: req.user.schoolCode }, { schoolCode: null }] }, limit: 4 });
    let session = sessionId ? await TutorSession.findByPk(sessionId) : null;
    if (!session) {
      session = await TutorSession.create({ studentId: student.id, userId: req.user.id, schoolCode: req.user.schoolCode || student.User?.schoolCode, subject, gradeLevel: student.grade, title: String(message).slice(0, 60) });
    }
    await TutorMessage.create({ sessionId: session.id, studentId: student.id, role: 'student', subject, content: message, intent, confidence: detected.confidence, metadata: { detected } });
    const answer = buildTutorAnswer({ message, subject, intent, student, weakAreas });
    const tutorMsg = await TutorMessage.create({ sessionId: session.id, studentId: student.id, role: 'tutor', subject, content: answer.answer, intent, confidence: detected.confidence, metadata: { practice: answer.practice, checkpoints: answer.checkpoints, materials: materials.map(m=>m.id) } });
    const metrics = session.metrics || {};
    await session.update({ subject, metrics: { ...metrics, messages: Number(metrics.messages||0)+2, questionsAsked: Number(metrics.questionsAsked||0)+1, confidence: detected.confidence } });
    const updatedInsight = await updateTutorInsight({ student, subject, interaction: { ...answer, intent, confidence: detected.confidence, schoolCode: req.user.schoolCode }, materials: materials.map(m=>({ id:m.id, title:m.title, subject:m.subject })) });
    res.json({ success:true, data: { sessionId: session.id, messageId: tutorMsg.id, subject, confidence: detected.confidence, intent, answer: answer.answer, practice: answer.practice, checkpoints: answer.checkpoints, recommendedMaterials: materials.map(m=>({ id:m.id, title:m.title, summary:m.summary, accessLevel:m.accessLevel })), insight: updatedInsight } });
  } catch (error) { console.error('AI tutor chat error:', error); res.status(500).json({ success:false, message:error.message }); }
};

exports.getInsights = async (req, res) => {
  try {
    const student = await getStudentForUser(req.user, req.params.studentId || req.query.studentId);
    if (!student) return res.status(404).json({ success:false, message:'Student profile not found' });
    const analysis = await analyzeStudent(student);
    res.json({ success:true, data: analysis });
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
};

exports.getSessions = async (req, res) => {
  try {
    const student = await getStudentForUser(req.user, req.query.studentId);
    if (!student) return res.status(404).json({ success:false, message:'Student profile not found' });
    const sessions = await TutorSession.findAll({ where: { studentId: student.id }, order: [['updatedAt','DESC']], limit: 30 });
    res.json({ success:true, data:sessions });
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
};
