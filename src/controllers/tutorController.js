const { Op } = require('sequelize');
const { TutorSession, TutorMessage, TutorProgress, TutorUsage, Student, User, AcademicRecord, Attendance, Subscription, SubscriptionPlan } = require('../models');
const { detectCommand } = require('../services/tutor/commandDetector');
const { LEVELS, normalizeGrade, getLevelByGrade, detectSubject } = require('../services/tutor/curriculumSubjects');
const { detectTopic, buildTutorAnswer } = require('../services/tutor/tutorKnowledge');
const { callStudentTutorAI, getAIProviderConfig } = require('../services/aiProviderService');

const CHILD_AI_PLAN_LIMITS = {
  child_basic: { daily: 0, monthly: 0, label: 'Basic' },
  child_essential: { daily: 0, monthly: 0, label: 'Basic' },
  essential: { daily: 0, monthly: 0, label: 'Basic' },
  basic: { daily: 0, monthly: 0, label: 'Basic' },
  child_premium: { daily: 6, monthly: 180, label: 'Premium' },
  child_smart: { daily: 6, monthly: 180, label: 'Premium' },
  smart: { daily: 6, monthly: 180, label: 'Premium' },
  premium: { daily: 6, monthly: 180, label: 'Premium' },
  child_ultimate: { daily: 50, monthly: 1500, label: 'Ultimate' },
  child_genius: { daily: 50, monthly: 1500, label: 'Ultimate' },
  genius: { daily: 50, monthly: 1500, label: 'Ultimate' },
  ultimate: { daily: 50, monthly: 1500, label: 'Ultimate' }
};

function todayISO() { return new Date().toISOString().slice(0, 10); }
function monthKey(date = new Date()) { return date.toISOString().slice(0, 7); }

function normalizePlanCode(value) {
  const raw = String(value || '').toLowerCase().trim();
  if (!raw) return '';
  if (raw.includes('genius') || raw.includes('ultimate')) return 'child_ultimate';
  if (raw.includes('smart') || raw.includes('premium')) return 'child_premium';
  if (raw.includes('essential') || raw.includes('basic')) return 'child_basic';
  return raw.startsWith('child_') ? raw : `child_${raw}`;
}

function planLimitsFrom(subscription, plan) {
  const planCode = normalizePlanCode(subscription?.planCode || plan?.code || plan?.name || subscription?.planName);
  const defaults = CHILD_AI_PLAN_LIMITS[planCode] || CHILD_AI_PLAN_LIMITS.child_basic;
  const limits = { ...(plan?.limits || {}), ...(subscription?.limits || {}) };
  const daily = Number(limits.aiQuestionsPerDay || limits.dailyAiTutorQuestions || limits.dailyQuestions || defaults.daily);
  const monthly = Number(limits.aiQuestionsPerMonth || limits.monthlyAiTutorQuestions || limits.monthlyQuestions || defaults.monthly || (daily * 30));
  return {
    planCode,
    planName: subscription?.planName || plan?.displayName || plan?.name || defaults.label,
    dailyLimit: Number.isFinite(daily) && daily > 0 ? daily : defaults.daily,
    monthlyLimit: Number.isFinite(monthly) && monthly > 0 ? monthly : defaults.monthly
  };
}

function safeTutorText(value, fallback = 'Tutor message') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

async function resolveStudent(req) {
  if (req.user.role !== 'student') return null;

  // Student records do NOT carry schoolCode in the current schema.
  // Tenant ownership is enforced through the linked User.schoolCode.
  // This prevents the production error: column Student.schoolCode does not exist.
  const student = await Student.findOne({
    where: { userId: req.user.id },
    include: [{
      model: User,
      attributes: ['id', 'name', 'email', 'schoolCode'],
      required: true,
      where: { schoolCode: req.user.schoolCode }
    }]
  });

  return student;
}

async function getActiveChildSubscription(studentId, schoolCode) {
  const subscription = await Subscription.findOne({
    where: {
      ownerType: 'child',
      studentId,
      schoolCode,
      status: 'active',
      endDate: { [Op.gt]: new Date() }
    },
    include: [{ model: SubscriptionPlan, required: false }],
    order: [['endDate', 'DESC']]
  });
  return subscription;
}

async function getMonthlyUsage(schoolId, studentId, usageMonth) {
  const rows = await TutorUsage.findAll({ where: { schoolId, studentId, usageMonth } });
  return rows.reduce((sum, row) => sum + Number(row.totalQuestions || 0), 0);
}

async function createTutorMessage({ schoolId, schoolCode, sessionId, studentId, userId, role, text, subject, topic, command, source, metadata }) {
  const safeText = safeTutorText(text, role === 'tutor' ? 'I am ready to help you learn. Ask me any question.' : 'Student question');
  return TutorMessage.create({
    schoolId,
    schoolCode,
    sessionId,
    studentId,
    userId,
    role,
    message: safeText,
    content: safeText,
    subject,
    topic,
    command,
    source,
    metadata: metadata || {}
  });
}

function buildTutorSessionTitle(question, subject, topic, command) {
  const clean = String(question || '').replace(/\s+/g, ' ').trim();
  const safeSubject = String(subject || '').replace(/\s+/g, ' ').trim();
  const safeTopic = String(topic || '').replace(/\s+/g, ' ').trim();
  const safeCommand = String(command || '').replace(/\s+/g, ' ').trim();
  if (safeTopic && safeSubject) return `${safeSubject}: ${safeTopic}`.slice(0, 90);
  if (safeSubject) return `${safeSubject} Tutor Session`.slice(0, 90);
  if (safeCommand && safeCommand !== 'ask') return `${safeCommand.charAt(0).toUpperCase() + safeCommand.slice(1)} Tutor Session`.slice(0, 90);
  if (clean) return (clean.length > 64 ? `${clean.slice(0, 61)}...` : clean) || 'AI Tutor Session';
  return 'AI Tutor Session';
}

exports.getTutorConfig = async (req, res) => {
  const providerConfig = getAIProviderConfig();
  res.json({
    success: true,
    data: {
      levels: LEVELS,
      commands: ['ask', 'explain', 'solve', 'quiz', 'summarize', 'revise', 'homework', 'weakness', 'plan'],
      access: 'student_subscription_required',
      freeTier: false,
      provider: providerConfig.provider,
      model: providerConfig.provider === 'anthropic' ? providerConfig.anthropic.model : providerConfig.deepseek.model,
      plans: [
        { code: 'child_basic', name: 'Basic', dailyLimit: 0, monthlyLimit: 0, priceKes: 100, features:['Report cards','Attendance','Progress'] },
        { code: 'child_premium', name: 'Premium', dailyLimit: 6, monthlyLimit: 180, priceKes: 250, features:['Basic features','Limited AI Tutor','Child timetable where school has timetable'] },
        { code: 'child_ultimate', name: 'Ultimate', dailyLimit: 50, monthlyLimit: 1500, priceKes: 500, features:['Premium features','Extended AI Tutor','Live child analytics','Recommendations'] }
      ]
    }
  });
};

exports.askTutor = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'AI Tutor is currently available to students only.', data: { locked: true, reason: 'student_only' } });
    }

    const { question = '', grade, gradeLevel, level: requestedLevel, subject, mode, curriculum } = req.body;
    if (!String(question).trim()) return res.status(400).json({ success: false, message: 'Question is required' });

    const schoolId = req.user.schoolCode || 'default';
    const student = await resolveStudent(req);
    if (!student) return res.status(403).json({ success: false, message: 'Student profile not found for this account.' });
    const realStudentId = student.id;

    const subscription = await getActiveChildSubscription(realStudentId, schoolId);
    if (!subscription) {
      return res.status(403).json({
        success: false,
        message: 'AI Tutor is locked. Ask your parent to activate Premium or Ultimate for this child.',
        data: { locked: true, subscriptionRequired: true, freeTier: false, plans: ['Premium', 'Ultimate'] }
      });
    }

    const plan = subscription.SubscriptionPlan || await SubscriptionPlan.findByPk(subscription.planId).catch(() => null);
    const planLimit = planLimitsFrom(subscription, plan);
    if (planLimit.dailyLimit <= 0) {
      return res.status(403).json({ success: false, message: 'AI Tutor is available on Premium and Ultimate. Basic includes report cards, attendance, and progress only.', data: { locked: true, plan: planLimit.planName, dailyLimit: 0 } });
    }

    const usageDate = todayISO();
    const usageMonth = monthKey();
    let usage = await TutorUsage.findOne({ where: { schoolId, studentId: realStudentId, usageDate } });
    if (!usage) {
      usage = await TutorUsage.create({
        schoolId,
        schoolCode: schoolId,
        studentId: realStudentId,
        subscriptionId: subscription.id,
        planCode: planLimit.planCode,
        usageDate,
        usageMonth,
        totalQuestions: 0,
        aiCalls: 0,
        dailyLimit: planLimit.dailyLimit,
        monthlyLimit: planLimit.monthlyLimit
      });
    }

    const monthlyUsed = await getMonthlyUsage(schoolId, realStudentId, usageMonth);
    if (Number(usage.totalQuestions || 0) >= planLimit.dailyLimit) {
      return res.status(403).json({ success: false, message: `Daily AI tutor limit reached for ${planLimit.planName}. Try again tomorrow or upgrade the child's plan.`, data: { locked: true, dailyLimit: planLimit.dailyLimit, usedToday: usage.totalQuestions, plan: planLimit.planName } });
    }
    if (monthlyUsed >= planLimit.monthlyLimit) {
      return res.status(403).json({ success: false, message: `Monthly AI tutor limit reached for ${planLimit.planName}. Renew or upgrade the child's plan to continue.`, data: { locked: true, monthlyLimit: planLimit.monthlyLimit, usedThisMonth: monthlyUsed, plan: planLimit.planName } });
    }

    const rawGrade = grade || gradeLevel || student.grade || student.className || student.Class?.name || 'Grade 5';
    const realGrade = normalizeGrade(rawGrade || 'Grade 5');
    const level = getLevelByGrade(realGrade) || getLevelByGrade('Grade 5');
    const realSubject = subject || detectSubject(question, realGrade);
    const command = req.body.command || detectCommand(question);
    const topic = detectTopic(question, realSubject);

    const localAnswer = buildTutorAnswer({ question, command, subject: realSubject, topic, grade: realGrade, level });
    const recentMarks = await AcademicRecord.findAll({ where: { studentId: realStudentId, schoolCode: schoolId }, order: [['createdAt','DESC']], limit: 5 }).catch(() => []);
    const recentAttendance = await Attendance.findAll({ where: { studentId: realStudentId, schoolCode: schoolId }, order: [['date','DESC']], limit: 5 }).catch(() => []);

    let aiResult;
    try {
      aiResult = await callStudentTutorAI({
        question,
        command,
        subject: realSubject,
        topic,
        grade: realGrade,
        curriculum: curriculum || student.curriculum || 'cbc',
        studentContext: {
          recentMarks: recentMarks.map(r => ({ subject: r.subject, score: r.score, term: r.term, year: r.year })),
          recentAttendance: recentAttendance.map(a => ({ date: a.date, status: a.status }))
        }
      });
    } catch (aiError) {
      console.error('Student AI tutor provider failed:', aiError.message);
      return res.status(aiError.status || 503).json({ success: false, message: 'Shule AI Tutor could not answer right now. Please try again shortly. Your usage has not been deducted.', data: { usageDeducted: false } });
    }

    const answer = { ...localAnswer, answer: localAnswer.answer || 'Shule AI response', explanation: aiResult.text || localAnswer.explanation, source: aiResult.provider, model: aiResult.model };
    const sessionTitle = buildTutorSessionTitle(question, realSubject, topic, command);
    const session = await TutorSession.create({
      schoolId,
      schoolCode: schoolId,
      studentId: realStudentId,
      userId: req.user.id,
      title: sessionTitle,
      grade: realGrade,
      gradeLevel: realGrade,
      level: level.id || requestedLevel || 'upper_primary',
      subject: realSubject,
      mode: mode || command || 'ask',
      lastCommand: command || 'ask',
      metadata: { source: 'student-dashboard', rawGrade, title: sessionTitle, provider: aiResult.provider, model: aiResult.model, subscriptionId: subscription.id, planCode: planLimit.planCode }
    });
    await createTutorMessage({ schoolId, schoolCode: schoolId, sessionId: session.id, studentId: realStudentId, userId: req.user.id, role: 'student', text: question, subject: realSubject, topic, command, source: 'student' });
    await createTutorMessage({ schoolId, schoolCode: schoolId, sessionId: session.id, studentId: realStudentId, userId: req.user.id, role: 'tutor', text: answer.explanation, subject: realSubject, topic, command, source: aiResult.provider, metadata: answer });

    const [progress] = await TutorProgress.findOrCreate({ where: { schoolId, studentId: realStudentId, subject: realSubject, topic }, defaults: { schoolId, schoolCode: schoolId, studentId: realStudentId, grade: realGrade, level: level.id, subject: realSubject, topic, attempts: 0, correct: 0 } });
    await progress.update({ attempts: progress.attempts + 1, lastCommand: command, lastSource: answer.source, lastStudiedAt: new Date() });

    const promptTokens = Number(aiResult.usage?.prompt_tokens || aiResult.usage?.input_tokens || 0);
    const completionTokens = Number(aiResult.usage?.completion_tokens || aiResult.usage?.output_tokens || 0);
    await usage.update({
      totalQuestions: Number(usage.totalQuestions || 0) + 1,
      monthlyQuestionsUsed: monthlyUsed + 1,
      aiCalls: Number(usage.aiCalls || 0) + 1,
      subscriptionId: subscription.id,
      planCode: planLimit.planCode,
      dailyLimit: planLimit.dailyLimit,
      monthlyLimit: planLimit.monthlyLimit,
      provider: aiResult.provider,
      model: aiResult.model,
      inputTokens: Number(usage.inputTokens || 0) + promptTokens,
      outputTokens: Number(usage.outputTokens || 0) + completionTokens
    });

    res.json({
      success: true,
      data: {
        ...answer,
        command,
        subject: realSubject,
        grade: realGrade,
        level: level.name,
        supportedSubjects: level.subjects,
        sessionId: session.id,
        aiLabel: 'Generated by Shule AI Tutor',
        usage: {
          used: Number(usage.totalQuestions || 0) + 1,
          limit: planLimit.dailyLimit,
          usedThisMonth: monthlyUsed + 1,
          monthlyLimit: planLimit.monthlyLimit,
          plan: planLimit.planName,
          planCode: planLimit.planCode
        }
      }
    });
  } catch (error) {
    console.error('Ask tutor error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

exports.getProgress = async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ success: false, message: 'Tutor progress is currently student-only.' });
    const schoolId = req.user.schoolCode || 'default';
    const student = await resolveStudent(req);
    if (!student) return res.status(403).json({ success: false, message: 'Student profile not found' });
    const progress = await TutorProgress.findAll({ where: { schoolId, studentId: student.id }, order: [['updatedAt', 'DESC']] });
    res.json({ success: true, data: progress });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message }); }
};

exports.getSessionHistory = async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ success: false, message: 'Tutor history is currently student-only.' });
    const schoolId = req.user.schoolCode || 'default';
    const student = await resolveStudent(req);
    if (!student) return res.status(403).json({ success: false, message: 'Student profile not found' });
    const messages = await TutorMessage.findAll({ where: { schoolId, studentId: student.id }, order: [['createdAt', 'DESC']], limit: 40 });
    res.json({ success: true, data: messages.reverse() });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message }); }
};

exports.submitPracticeAnswer = async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ success: false, message: 'Practice answers are currently student-only.' });
    const { subject = 'General', topic = 'Practice', isCorrect = false } = req.body;
    const schoolId = req.user.schoolCode || 'default';
    const student = await resolveStudent(req);
    if (!student) return res.status(403).json({ success: false, message: 'Student profile not found' });
    const [progress] = await TutorProgress.findOrCreate({ where: { schoolId, studentId: student.id, subject, topic }, defaults: { schoolId, schoolCode: schoolId, studentId: student.id, subject, topic } });
    await progress.update({ attempts: progress.attempts + 1, correct: progress.correct + (isCorrect ? 1 : 0), lastCommand: 'quiz', lastStudiedAt: new Date() });
    res.json({ success: true, data: { correct: !!isCorrect, progress } });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message }); }
};

exports.getParentReport = async (req, res) => {
  res.status(403).json({ success: false, message: 'Parent AI reports are not enabled yet. Parents manage child subscriptions and usage only for now.' });
};

exports.getTeacherReport = async (req, res) => {
  res.status(403).json({ success: false, message: 'Teacher AI reports are not enabled yet.' });
};
