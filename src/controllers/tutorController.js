const { Op } = require('sequelize');
const { TutorSession, TutorMessage, TutorProgress, TutorUsage, Student, User, School, Class, AcademicRecord, Attendance, HomeTaskAssignment, Subscription, SubscriptionPlan } = require('../models');
const { detectCommand } = require('../services/tutor/commandDetector');
const { LEVELS, normalizeGrade, getLevelByGrade, detectSubject } = require('../services/tutor/curriculumSubjects');
const { detectTopic, buildTutorAnswer } = require('../services/tutor/tutorKnowledge');
const { callStudentTutorAI, getAIProviderConfig } = require('../services/aiProviderService');

// v127: Final parent subscription AI rules.
// Basic has NO AI Tutor. Premium has 6 AI messages/day. Ultimate has extended access.
// Legacy Essential/Smart/Genius codes remain accepted as aliases so old active subscriptions do not crash;
// they are normalized into Basic/Premium/Ultimate behavior.
const CHILD_AI_PLAN_LIMITS = {
  child_basic: { daily: 0, monthly: 0, label: 'Basic', aiTutor: false },
  basic: { daily: 0, monthly: 0, label: 'Basic', aiTutor: false },
  child_essential: { daily: 0, monthly: 0, label: 'Basic', aiTutor: false },
  essential: { daily: 0, monthly: 0, label: 'Basic', aiTutor: false },
  child_premium: { daily: 6, monthly: 180, label: 'Premium', aiTutor: true },
  premium: { daily: 6, monthly: 180, label: 'Premium', aiTutor: true },
  child_smart: { daily: 6, monthly: 180, label: 'Premium', aiTutor: true },
  smart: { daily: 6, monthly: 180, label: 'Premium', aiTutor: true },
  child_ultimate: { daily: 50, monthly: 1500, label: 'Ultimate', aiTutor: true },
  ultimate: { daily: 50, monthly: 1500, label: 'Ultimate', aiTutor: true },
  child_genius: { daily: 50, monthly: 1500, label: 'Ultimate', aiTutor: true },
  genius: { daily: 50, monthly: 1500, label: 'Ultimate', aiTutor: true }
};

function todayISO() { return new Date().toISOString().slice(0, 10); }
function monthKey(date = new Date()) { return date.toISOString().slice(0, 7); }

function normalizePlanCode(value) {
  const raw = String(value || '').toLowerCase().trim();
  if (!raw) return 'child_basic';
  if (raw.includes('genius') || raw === 'ultimate' || raw === 'child_ultimate') return 'child_ultimate';
  if (raw.includes('smart') || raw === 'premium' || raw === 'child_premium') return 'child_premium';
  if (raw.includes('essential') || raw === 'basic' || raw === 'child_basic') return 'child_basic';
  return raw.startsWith('child_') ? raw : `child_${raw}`;
}

function planLimitsFrom(subscription, plan) {
  const planCode = normalizePlanCode(subscription?.planCode || plan?.code || plan?.name || subscription?.planName);
  const defaults = CHILD_AI_PLAN_LIMITS[planCode] || CHILD_AI_PLAN_LIMITS.child_basic;
  const limits = { ...(plan?.limits || {}), ...(subscription?.limits || {}) };
  const explicitAi = limits.aiTutor ?? limits.aiTutorEnabled ?? limits.aiTutorAccess ?? defaults.aiTutor;
  const aiTutorEnabled = explicitAi === true || explicitAi === 'true' || explicitAi === 1 || explicitAi === '1' || defaults.aiTutor === true;
  const dailyRaw = limits.aiQuestionsPerDay ?? limits.dailyAiTutorQuestions ?? limits.dailyQuestions ?? defaults.daily;
  const monthlyRaw = limits.aiQuestionsPerMonth ?? limits.monthlyAiTutorQuestions ?? limits.monthlyQuestions ?? defaults.monthly;
  const daily = Number(dailyRaw);
  const monthly = Number(monthlyRaw);
  return {
    planCode,
    planName: subscription?.planName || plan?.displayName || plan?.name || defaults.label,
    aiTutorEnabled,
    dailyLimit: aiTutorEnabled && Number.isFinite(daily) && daily > 0 ? daily : defaults.daily,
    monthlyLimit: aiTutorEnabled && Number.isFinite(monthly) && monthly > 0 ? monthly : defaults.monthly
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


function getStudentPreferences(student) {
  const prefs = student?.preferences && typeof student.preferences === 'object' ? student.preferences : {};
  return Array.isArray(prefs) ? {} : prefs;
}

async function findSchoolForTutor(schoolCode) {
  const value = String(schoolCode || '').trim();
  if (!value) return null;
  return School.findOne({
    where: {
      [Op.or]: [
        { schoolId: value },
        { shortCode: value },
        { lookupCodes: { [Op.contains]: [value] } }
      ]
    }
  }).catch(() => null);
}

function getSchoolAISettings(school) {
  const settings = school?.settings || {};
  const ai = settings.aiLearningAssistant && typeof settings.aiLearningAssistant === 'object' ? settings.aiLearningAssistant : {};
  return {
    enabled: ai.enabled !== false,
    projectHelpMode: ai.projectHelpMode !== false,
    studyAheadMode: ai.studyAheadMode !== false,
    allowChatHistory: ai.allowChatHistory !== false,
    allowTeacherSummaries: ai.allowTeacherSummaries === true,
    blockDuringExams: ai.blockDuringExams === true,
    dailyQuestionLimit: Number(ai.dailyQuestionLimit || 0) || null,
    monthlySchoolLimit: Number(ai.monthlySchoolLimit || 0) || null,
    languageSupport: ai.languageSupport || 'school_default'
  };
}

function onboardingText() {
  return {
    title: 'Welcome to ShuleAI Learning Assistant',
    message: 'AI means Artificial Intelligence. I am a smart learning helper that can explain topics, help you revise, answer questions, guide you through homework, help with school projects, and prepare you for exams. I am here to help you learn, not to replace your teacher or help you cheat. I may sometimes make mistakes, so always ask your teacher when something is unclear. Do not share private information like passwords, phone numbers, home address, payment details, or family secrets.',
    bullets: [
      'Ask questions and get clear step-by-step explanations.',
      'Revise subjects with quizzes, summaries, and practice questions.',
      'Get guided help for homework and school projects without copying.',
      'Study ahead safely when you want to learn more advanced topics.',
      'Use your registered class and curriculum as the starting level automatically.'
    ],
    buttonLabel: 'Start Learning'
  };
}

function buildTutorSuggestionsForContext(context = {}) {
  const subject = context.weakSubjects?.[0] || context.subjects?.[0] || 'Mathematics';
  return [
    `Explain ${subject} in simple words`,
    `Help me with my school project`,
    `Create 5 quiz questions for ${subject}`,
    `Help me understand my homework step by step`,
    `Make a study plan for this week`,
    `Teach me the advanced version safely`,
    `Explain this topic like I am in ${context.grade || 'my class'}`,
    `Help me improve from AE to ME`
  ];
}

function summarizeMarks(records = []) {
  const list = (records || []).map(r => ({ subject: r.subject, score: Number(r.score ?? r.marks ?? r.finalScore ?? 0), term: r.term, year: r.year })).filter(r => r.subject);
  const weakSubjects = list.filter(r => Number.isFinite(r.score) && r.score > 0 && r.score < 60).map(r => r.subject);
  return { recentMarks: list, weakSubjects: [...new Set(weakSubjects)].slice(0, 4) };
}

async function buildStudentLearningContext(req, student) {
  const schoolCode = req.user.schoolCode || student.User?.schoolCode || student.schoolCode || 'default';
  const [school, classItem, recentMarksRows, recentAttendanceRows, taskRows] = await Promise.all([
    findSchoolForTutor(schoolCode),
    student.classId ? Class.findOne({ where: { id: student.classId, schoolCode }, attributes: ['id','name','grade','stream','curriculum','levelCode','levelLabel','curriculumLevel'] }).catch(() => null) : Promise.resolve(null),
    AcademicRecord.findAll({ where: { studentId: student.id, schoolCode }, order: [['createdAt','DESC']], limit: 10 }).catch(() => []),
    Attendance.findAll({ where: { studentId: student.id, schoolCode }, order: [['date','DESC']], limit: 10 }).catch(() => []),
    HomeTaskAssignment ? HomeTaskAssignment.findAll({ where: { studentId: student.id, schoolCode }, order: [['createdAt','DESC']], limit: 6 }).catch(() => []) : Promise.resolve([])
  ]);
  const gradeRaw = student.grade || classItem?.grade || classItem?.name || 'Grade 5';
  const grade = normalizeGrade(gradeRaw);
  const level = getLevelByGrade(grade) || getLevelByGrade('Grade 5');
  const curriculum = String(classItem?.curriculum || student.curriculum || school?.system || school?.settings?.curriculum || 'cbc').toLowerCase();
  const marks = summarizeMarks(recentMarksRows);
  const attendanceSummary = recentAttendanceRows.map(a => ({ date: a.date, status: a.status })).filter(a => a.date || a.status);
  const subjects = Array.isArray(level.subjects) ? level.subjects : [];
  return {
    studentId: student.id,
    studentName: student.User?.name || student.name || 'Student',
    schoolCode,
    schoolName: school?.name || 'your school',
    classId: student.classId || classItem?.id || null,
    className: classItem?.name || student.className || grade,
    grade,
    gradeLevel: grade,
    stream: classItem?.stream || null,
    curriculum,
    levelId: level.id,
    levelName: level.name,
    subjects,
    weakSubjects: marks.weakSubjects,
    recentMarks: marks.recentMarks,
    recentAttendance: attendanceSummary,
    recentTasks: (taskRows || []).map(t => ({ taskId: t.taskId, status: t.status, assignedAt: t.assignedAt })).slice(0, 6),
    aiSettings: getSchoolAISettings(school),
    onboardingCompleted: !!getStudentPreferences(student).aiTutorOnboardingCompleted,
    profileComplete: !!(student.grade || classItem?.grade || classItem?.name)
  };
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
      commands: ['ask', 'explain', 'solve', 'quiz', 'summarize', 'revise', 'homework', 'weakness', 'plan', 'project', 'research', 'study_ahead'],
      access: 'student_subscription_required',
      freeTier: false,
      provider: providerConfig.provider,
      model: providerConfig.provider === 'anthropic' ? providerConfig.anthropic.model : providerConfig.deepseek.model,
      plans: [
        { code: 'child_basic', name: 'Basic', aiTutor: false, dailyLimit: 0, monthlyLimit: 0, priceKes: 100, features: ['Report cards', 'Attendance', 'Progress'] },
        { code: 'child_premium', name: 'Premium', aiTutor: true, dailyLimit: 6, monthlyLimit: 180, priceKes: 250, features: ['Everything in Basic', 'AI Tutor: 6 messages/day', 'Child timetable if school has timetable'] },
        { code: 'child_ultimate', name: 'Ultimate', aiTutor: true, dailyLimit: 50, monthlyLimit: 1500, priceKes: 500, features: ['Everything in Premium', 'Extended AI Tutor', 'Live child analytics', 'Stronger alerts', 'Child recommendations'] }
      ]
    }
  });
};


exports.getOnboarding = async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ success: false, message: 'Student AI onboarding is student-only.' });
    const student = await resolveStudent(req);
    if (!student) return res.status(403).json({ success: false, message: 'Student profile not found for this account.' });
    const context = await buildStudentLearningContext(req, student);
    res.json({
      success: true,
      data: {
        completed: context.onboardingCompleted,
        onboarding: onboardingText(),
        context: {
          studentName: context.studentName,
          grade: context.grade,
          className: context.className,
          curriculum: context.curriculum,
          subjects: context.subjects,
          weakSubjects: context.weakSubjects,
          studyAheadAllowed: context.aiSettings.studyAheadMode !== false,
          projectHelpAllowed: context.aiSettings.projectHelpMode !== false
        }
      }
    });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

exports.completeOnboarding = async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ success: false, message: 'Student AI onboarding is student-only.' });
    const student = await resolveStudent(req);
    if (!student) return res.status(403).json({ success: false, message: 'Student profile not found for this account.' });
    const prefs = getStudentPreferences(student);
    await student.update({ preferences: { ...prefs, aiTutorOnboardingCompleted: true, aiTutorOnboardingCompletedAt: new Date().toISOString() } });
    res.json({ success: true, message: 'AI learning assistant onboarding completed.', data: { completed: true } });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

exports.getSuggestions = async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ success: false, message: 'Student AI suggestions are student-only.' });
    const student = await resolveStudent(req);
    if (!student) return res.status(403).json({ success: false, message: 'Student profile not found for this account.' });
    const context = await buildStudentLearningContext(req, student);
    res.json({ success: true, data: { suggestions: buildTutorSuggestionsForContext(context), context } });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

exports.askTutor = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'AI Tutor is currently available to students only.', data: { locked: true, reason: 'student_only' } });
    }

    const { question = '', subject, mode, sessionId } = req.body || {};
    if (!String(question).trim()) return res.status(400).json({ success: false, message: 'Question is required' });

    const schoolId = req.user.schoolCode || 'default';
    const student = await resolveStudent(req);
    if (!student) return res.status(403).json({ success: false, message: 'Student profile not found for this account.' });
    const realStudentId = student.id;
    const learningContext = await buildStudentLearningContext(req, student);
    if (learningContext.aiSettings.enabled === false) {
      return res.status(403).json({ success: false, message: 'The school has disabled the student AI learning assistant for now.', data: { locked: true, reason: 'school_disabled' } });
    }

    const subscription = await getActiveChildSubscription(realStudentId, schoolId);
    if (!subscription) {
      return res.status(403).json({
        success: false,
        message: 'AI Tutor is locked. Ask your parent to activate Premium or Ultimate for this child. Basic includes report cards, attendance and progress only.',
        data: { locked: true, subscriptionRequired: true, freeTier: false, plans: ['Premium', 'Ultimate'], basicIncludesAiTutor: false }
      });
    }

    const plan = subscription.SubscriptionPlan || await SubscriptionPlan.findByPk(subscription.planId).catch(() => null);
    const planLimit = planLimitsFrom(subscription, plan);
    const schoolDailyLimit = Number(learningContext.aiSettings.dailyQuestionLimit || 0);
    if (schoolDailyLimit > 0) planLimit.dailyLimit = Math.min(planLimit.dailyLimit, schoolDailyLimit);
    if (!planLimit.aiTutorEnabled || planLimit.dailyLimit <= 0) {
      return res.status(403).json({
        success: false,
        message: 'AI Tutor is not included in Basic. Upgrade this child to Premium for 6 messages/day or Ultimate for extended access.',
        data: { locked: true, reason: 'ai_not_in_plan', plan: planLimit.planName, planCode: planLimit.planCode, requiredPlans: ['Premium', 'Ultimate'] }
      });
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

    const realGrade = learningContext.grade || 'Grade 5';
    const level = getLevelByGrade(realGrade) || getLevelByGrade('Grade 5');
    const realSubject = subject || detectSubject(question, realGrade);
    const command = req.body.command || detectCommand(question);
    const topic = detectTopic(question, realSubject);

    const localAnswer = buildTutorAnswer({ question, command, subject: realSubject, topic, grade: realGrade, level, curriculum: learningContext.curriculum });
    let aiResult = null;
    let providerFailed = false;
    try {
      aiResult = await callStudentTutorAI({
        question,
        command,
        subject: realSubject,
        topic,
        grade: realGrade,
        curriculum: learningContext.curriculum || 'cbc',
        studentContext: {
          ...learningContext,
          recentMarks: learningContext.recentMarks,
          recentAttendance: learningContext.recentAttendance,
          safetyRules: {
            studyAheadAllowed: learningContext.aiSettings.studyAheadMode !== false,
            projectHelpAllowed: learningContext.aiSettings.projectHelpMode !== false,
            mustBeCompleteAndStepByStep: true,
            doNotAskClassUnlessMissing: true
          }
        }
      });
    } catch (aiError) {
      providerFailed = true;
      console.error('Student AI tutor provider failed, using local learning fallback:', aiError.message);
      aiResult = {
        text: `${localAnswer.explanation}\n\nNote: The full AI provider is unavailable right now, so I used the built-in ShuleAI learning guide. You can still continue learning and ask follow-up questions.`,
        provider: 'local_learning_guide',
        model: 'system_rules',
        usage: {}
      };
    }

    const answer = {
      ...localAnswer,
      answer: localAnswer.answer || 'ShuleAI Learning Assistant response',
      explanation: aiResult.text || localAnswer.explanation,
      source: aiResult.provider,
      model: aiResult.model,
      localFallback: providerFailed,
      contextUsed: {
        grade: learningContext.grade,
        curriculum: learningContext.curriculum,
        className: learningContext.className,
        schoolName: learningContext.schoolName,
        profileComplete: learningContext.profileComplete,
        studyAheadAllowed: learningContext.aiSettings.studyAheadMode !== false
      }
    };
    const sessionTitle = buildTutorSessionTitle(question, realSubject, topic, command);
    let session = null;
    if (sessionId) session = await TutorSession.findOne({ where:{ id:Number(sessionId), schoolId, studentId:realStudentId, userId:req.user.id } });
    if (!session) {
      session = await TutorSession.create({
        schoolId, schoolCode: schoolId, studentId: realStudentId, userId: req.user.id,
        title: sessionTitle, grade: realGrade, gradeLevel: realGrade,
        level: level.id || 'upper_primary', subject: realSubject,
        mode: mode || command || 'ask', lastCommand: command || 'ask',
        metadata: { source: 'student-dashboard', learningAssistant: true, contextUsed: answer.contextUsed, provider: aiResult.provider, model: aiResult.model, subscriptionId: subscription.id, planCode: planLimit.planCode }
      });
    } else {
      await session.update({ subject:realSubject || session.subject, lastCommand:command || session.lastCommand, updatedAt:new Date(), metadata: { ...(session.metadata || {}), learningAssistant: true, contextUsed: answer.contextUsed } });
    }
    await createTutorMessage({ schoolId, schoolCode: schoolId, sessionId: session.id, studentId: realStudentId, userId: req.user.id, role: 'student', text: question, subject: realSubject, topic, command, source: 'student', metadata: { learningAssistant: true } });
    await createTutorMessage({ schoolId, schoolCode: schoolId, sessionId: session.id, studentId: realStudentId, userId: req.user.id, role: 'tutor', text: answer.explanation, subject: realSubject, topic, command, source: aiResult.provider, metadata: answer });

    const [progress] = await TutorProgress.findOrCreate({ where: { schoolId, studentId: realStudentId, subject: realSubject, topic }, defaults: { schoolId, schoolCode: schoolId, studentId: realStudentId, grade: realGrade, level: level.id, subject: realSubject, topic, attempts: 0, correct: 0 } });
    await progress.update({ attempts: progress.attempts + 1, lastCommand: command, lastSource: answer.source, lastStudiedAt: new Date() });

    const promptTokens = Number(aiResult.usage?.prompt_tokens || aiResult.usage?.input_tokens || 0);
    const completionTokens = Number(aiResult.usage?.completion_tokens || aiResult.usage?.output_tokens || 0);
    await usage.update({
      totalQuestions: Number(usage.totalQuestions || 0) + 1,
      monthlyQuestionsUsed: monthlyUsed + 1,
      aiCalls: Number(usage.aiCalls || 0) + (providerFailed ? 0 : 1),
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
        curriculum: learningContext.curriculum,
        level: level.name,
        supportedSubjects: level.subjects,
        suggestions: buildTutorSuggestionsForContext(learningContext),
        sessionId: session.id,
        aiLabel: providerFailed ? 'Guided by ShuleAI local learning rules' : 'Generated by ShuleAI Learning Assistant',
        sessionTitle: session.title,
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

exports.listTutorSessions = async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ success:false, message:'Tutor history is student-only.' });
    const schoolId=req.user.schoolCode||'default'; const student=await resolveStudent(req);
    if(!student)return res.status(403).json({success:false,message:'Student profile not found'});
    const sessions=await TutorSession.findAll({where:{schoolId,studentId:student.id,userId:req.user.id},order:[['updatedAt','DESC']],limit:100});
    const counts=await TutorMessage.findAll({where:{schoolId,studentId:student.id},attributes:['sessionId',[require('sequelize').fn('COUNT',require('sequelize').col('id')),'messageCount']],group:['sessionId'],raw:true}).catch(()=>[]);
    const map=new Map(counts.map(r=>[String(r.sessionId),Number(r.messageCount||0)]));
    res.json({success:true,data:sessions.map(row=>({...row.toJSON(),messageCount:map.get(String(row.id))||0}))});
  } catch(error){res.status(500).json({success:false,message:error.message});}
};
exports.getTutorSession = async (req,res)=>{
  try{
    if(req.user.role!=='student')return res.status(403).json({success:false,message:'Tutor history is student-only.'});
    const schoolId=req.user.schoolCode||'default';const student=await resolveStudent(req);if(!student)return res.status(403).json({success:false,message:'Student profile not found'});
    const session=await TutorSession.findOne({where:{id:Number(req.params.id),schoolId,studentId:student.id,userId:req.user.id}});if(!session)return res.status(404).json({success:false,message:'Tutor chat not found'});
    const messages=await TutorMessage.findAll({where:{schoolId,studentId:student.id,sessionId:session.id},order:[['createdAt','ASC']]});
    res.json({success:true,data:{session,messages}});
  }catch(error){res.status(500).json({success:false,message:error.message});}
};
exports.createTutorSession = async (req,res)=>{
  try{
    if(req.user.role!=='student')return res.status(403).json({success:false,message:'Tutor chats are student-only.'});
    const schoolId=req.user.schoolCode||'default';const student=await resolveStudent(req);if(!student)return res.status(403).json({success:false,message:'Student profile not found'});
    const session=await TutorSession.create({schoolId,schoolCode:schoolId,studentId:student.id,userId:req.user.id,title:String(req.body?.title||'New Tutor Chat').slice(0,90),grade:String(req.body?.grade||student.grade||'Grade 5'),gradeLevel:String(req.body?.grade||student.grade||'Grade 5'),level:String(req.body?.level||'upper_primary'),subject:String(req.body?.subject||'General'),mode:'ask',lastCommand:'ask',metadata:{source:'student-dashboard',empty:true}});
    res.status(201).json({success:true,data:session});
  }catch(error){res.status(500).json({success:false,message:error.message});}
};


exports.deleteTutorSession = async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ success:false, message:'Tutor chats are student-only.' });
    const schoolId = req.user.schoolCode || 'default';
    const student = await resolveStudent(req);
    if (!student) return res.status(403).json({ success:false, message:'Student profile not found' });
    const session = await TutorSession.findOne({ where: { id: Number(req.params.id), schoolId, studentId: student.id, userId: req.user.id } });
    if (!session) return res.status(404).json({ success:false, message:'Tutor chat not found' });
    await TutorMessage.destroy({ where: { schoolId, studentId: student.id, sessionId: session.id } });
    await session.destroy();
    res.json({ success:true, message:'Tutor chat deleted.' });
  } catch (error) { res.status(error.status || 500).json({ success:false, message:error.message }); }
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
