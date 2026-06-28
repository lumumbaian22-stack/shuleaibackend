const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const {
  LearnFeedUser,
  LearnFeedVideo,
  LearnFeedInteraction,
  LearnFeedFollow,
  LearnFeedComment,
  LearnFeedLiveRoom,
  LearnFeedMessage,
  LearnFeedSubscriptionPayment,
  Student,
  User,
  Subscription,
  Payment
} = require('../models');
const paymentEngine = require('../services/paymentProviderEngine');

const PUBLIC_PLANS = [
  { code: 'free', name: 'Free', monthlyKes: 0, days: 30, features: ['Public feed', 'Comments', 'Basic AI help'] },
  { code: 'learner_plus', name: 'Learner Plus', monthlyKes: 299, days: 30, features: ['More AI tutor use', 'Saved lessons', 'Quiz XP'] },
  { code: 'creator_pro', name: 'Creator Pro', monthlyKes: 799, days: 30, features: ['Creator studio', 'Live hosting', 'Wallet and payouts'] }
];

function cleanText(value, fallback = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function normalizeRole(value) {
  return String(value || '').toLowerCase().includes('teacher') ? 'teacher' : 'student';
}

function handleFrom(value) {
  const raw = String(value || '').trim().replace(/^@+/, '').replace(/[^a-z0-9_]/gi, '').toLowerCase();
  return '@' + (raw || 'learnfeed' + Date.now());
}

function normalizePhone(phone) {
  const raw = String(phone || '').replace(/[^0-9+]/g, '').trim();
  if (!raw) return '';
  if (raw.startsWith('+')) return raw;
  if (raw.startsWith('0')) return '254' + raw.slice(1);
  if (raw.startsWith('7') || raw.startsWith('1')) return '254' + raw;
  return raw;
}

function planByCode(code) {
  return PUBLIC_PLANS.find(p => p.code === code || p.name === code) || PUBLIC_PLANS[1];
}

function addDays(days) {
  return new Date(Date.now() + Number(days || 30) * 86400000);
}

function publicUser(user) {
  return user?.getPublicProfile ? user.getPublicProfile() : null;
}

function videoJson(video, extras = {}) {
  const raw = video?.toJSON ? video.toJSON() : (video || {});
  const creator = raw.Creator || raw.creator || {};
  const title = raw.title || 'LearnFeed Lesson';
  const subject = String(raw.subject || 'General');
  return {
    id: raw.id,
    creatorId: raw.creatorId,
    subject: subject.toUpperCase(),
    className: raw.className || 'Public',
    title,
    description: raw.description || '',
    creator: creator.displayName || creator.name || 'LearnFeed Creator',
    handle: creator.handle || '@learnfeed',
    role: creator.role === 'teacher' ? 'Teacher / Creator' : 'Student Creator',
    avatar: creator.avatar || (creator.role === 'teacher' ? '👨🏾‍🏫' : '🎓'),
    verified: creator.role === 'teacher',
    likes: Number(raw.likesCount || 0),
    comments: Number(raw.commentsCount || 0),
    saves: Number(raw.savesCount || 0),
    shares: Number(raw.sharesCount || 0),
    views: Number(raw.viewsCount || 0) >= 1000 ? String(Math.round(Number(raw.viewsCount) / 1000)) + 'K' : String(raw.viewsCount || 0),
    sound: raw.soundTitle || 'Original Sound - LearnFeed',
    topic: raw.topic || subject,
    visualEmoji: raw.visualEmoji || '🎓',
    live: !!raw.isLiveReplay,
    following: !!extras.following,
    liked: !!extras.liked,
    saved: !!extras.saved,
    question: raw.quizQuestion || 'What is this lesson mainly about?',
    options: Array.isArray(raw.quizOptions) && raw.quizOptions.length ? raw.quizOptions : [subject, 'Gaming', 'Cooking', 'Travel'],
    answer: Number(raw.quizAnswerIndex || 0),
    aiContext: raw.aiContext || ('This public LearnFeed lesson is about ' + subject + '. ' + title),
    createdAt: raw.createdAt
  };
}

function commentJson(comment) {
  const raw = comment?.toJSON ? comment.toJSON() : (comment || {});
  const user = raw.User || raw.user || {};
  return { id: raw.id, userId: raw.userId, videoId: raw.videoId, user: user.displayName || user.name || 'Learner', avatar: user.avatar || '🙂', text: raw.text, likes: Number(raw.likesCount || 0), pinned: !!raw.pinned, createdAt: raw.createdAt };
}

function roomJson(room) {
  const raw = room?.toJSON ? room.toJSON() : (room || {});
  const host = raw.Host || raw.host || {};
  return { id: raw.id, host: host.displayName || 'Live Creator', handle: host.handle || '@learnfeed', title: raw.title, subject: raw.subject || 'General', viewers: Number(raw.viewers || 1), avatar: host.avatar || '🎓', emoji: raw.emoji || '🔴', status: raw.status };
}

async function optionalAuth(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.learnFeedUserId || (decoded.role === 'learnfeed_user' ? decoded.id : null);
    if (!userId) return null;
    const user = await LearnFeedUser.findByPk(userId);
    if (user) {
      await refreshInheritedSubscription(user);
      await syncStandaloneSubscriptionPayment(user);
    }
    return user;
  } catch (error) {
    return null;
  }
}

async function requireLearnFeedUser(req, res, next) {
  const user = await optionalAuth(req);
  if (!user || !user.isActive) return res.status(401).json({ success: false, message: 'LearnFeed login required' });
  req.learnFeedUser = user;
  next();
}

async function uniqueHandle(base) {
  let candidate = handleFrom(base);
  let suffix = 1;
  while (await LearnFeedUser.findOne({ where: { handle: candidate } })) {
    suffix += 1;
    candidate = handleFrom(base + suffix);
  }
  return candidate;
}

async function uniqueLearnFeedId() {
  for (let i = 0; i < 5; i += 1) {
    const year = new Date().getFullYear();
    const candidate = 'LF-' + year + '-' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    if (!(await LearnFeedUser.findOne({ where: { learnFeedId: candidate } }))) return candidate;
  }
  return 'LF-' + Date.now();
}

function platformStudentWhere(value) {
  const id = cleanText(value).toUpperCase();
  return { [Op.or]: [{ elimuid: id }, { admissionNumber: id }] };
}

async function findPlatformStudent(identifier) {
  if (!identifier) return null;
  return Student.findOne({ where: platformStudentWhere(identifier), include: [{ model: User, required: true }] });
}

async function verifyPlatformStudent(identifier, password) {
  const student = await findPlatformStudent(identifier);
  if (!student || !student.User) return null;
  if (!student.User.isActive) throw Object.assign(new Error('This ShuleAI student account is inactive.'), { status: 403 });
  const ok = await student.User.comparePassword(String(password || ''));
  if (!ok) throw Object.assign(new Error('Invalid Elimu ID or password.'), { status: 401 });
  return student;
}

async function activeSchoolSubscriptionForStudent(student) {
  if (!student) return { active: false, source: 'none' };
  if (typeof student.hasActiveSubscription === 'function' && student.hasActiveSubscription()) {
    return { active: true, source: 'student_profile', planCode: student.subscriptionPlan || 'basic', endsAt: student.subscriptionExpiry || null };
  }
  const subscription = await Subscription.findOne({
    where: { ownerType: 'child', studentId: student.id, status: 'active', endDate: { [Op.gt]: new Date() } },
    order: [['endDate', 'DESC']]
  }).catch(() => null);
  if (subscription) return { active: true, source: 'child_subscription', planCode: subscription.planCode || 'basic', endsAt: subscription.endDate || null };
  return { active: false, source: 'school_linked_unpaid', planCode: student.subscriptionPlan || 'basic', endsAt: student.subscriptionExpiry || null };
}

async function applyPlatformLink(user, student, source = 'platform_student_login') {
  const sub = await activeSchoolSubscriptionForStudent(student);
  const patch = {
    linkedPlatformUserId: student.User.id,
    linkedStudentId: student.id,
    linkedSchoolCode: student.User.schoolCode,
    linkedElimuId: student.elimuid,
    linkStatus: 'linked',
    linkSource: source,
    linkedAt: new Date(),
    subscriptionPlanCode: sub.planCode || student.subscriptionPlan || 'basic',
    subscriptionSource: sub.active ? sub.source : 'school_linked_unpaid',
    subscriptionStatus: sub.active ? 'inherited_active' : 'pending_school_subscription',
    subscriptionEndsAt: sub.endsAt || null,
    metadata: { ...(user.metadata || {}), lastPlatformLinkCheckAt: new Date().toISOString() }
  };
  await user.update(patch);
  return user.reload ? user.reload() : user;
}

async function refreshInheritedSubscription(user) {
  if (!user || user.linkStatus !== 'linked' || !user.linkedStudentId) return user;
  const student = await Student.findByPk(user.linkedStudentId, { include: [{ model: User, required: true }] }).catch(() => null);
  if (!student) return user;
  const sub = await activeSchoolSubscriptionForStudent(student);
  const status = sub.active ? 'inherited_active' : 'pending_school_subscription';
  if (user.subscriptionStatus !== status || String(user.subscriptionEndsAt || '') !== String(sub.endsAt || '')) {
    await user.update({ subscriptionStatus: status, subscriptionPlanCode: sub.planCode || user.subscriptionPlanCode || 'basic', subscriptionSource: sub.active ? sub.source : 'school_linked_unpaid', subscriptionEndsAt: sub.endsAt || null, linkedSchoolCode: student.User.schoolCode, linkedElimuId: student.elimuid });
  }
  return user;
}

async function learnFeedUserForPlatformStudent(student, password, source) {
  let user = await LearnFeedUser.findOne({ where: { linkedStudentId: student.id } });
  if (user) return applyPlatformLink(user, student, source);
  const email = student.User.email || String(student.elimuid).toLowerCase() + '@learnfeed.shuleai.local';
  user = await LearnFeedUser.findOne({ where: { email } });
  if (!user) {
    user = await LearnFeedUser.create({
      learnFeedId: await uniqueLearnFeedId(),
      email,
      password: password || Math.random().toString(36).slice(2) + Date.now(),
      role: 'student',
      displayName: student.User.name || student.elimuid,
      handle: await uniqueHandle(student.User.name || student.elimuid),
      avatar: '🎓'
    });
  }
  return applyPlatformLink(user, student, source);
}

async function activateStandaloneSubscription({ user, paymentRow, plan }) {
  const endsAt = addDays(plan.days || 30);
  await user.update({ subscriptionStatus: 'active', subscriptionPlanCode: plan.code, subscriptionSource: 'learnfeed_platform_payment', subscriptionEndsAt: endsAt, lastSubscriptionPaymentReference: paymentRow.internalReference });
  await paymentRow.update({ status: 'success', paidAt: new Date(), expiresAt: endsAt, metadata: { ...(paymentRow.metadata || {}), activatedAt: new Date().toISOString() } });
}

async function syncStandaloneSubscriptionPayment(user) {
  if (!user || user.linkStatus === 'linked' || user.hasActiveLearnFeedAccess()) return user;
  const paymentRow = await LearnFeedSubscriptionPayment.findOne({
    where: { userId: user.id, status: { [Op.notIn]: ['success', 'failed', 'cancelled', 'canceled', 'expired'] } },
    order: [['createdAt', 'DESC']]
  }).catch(() => null);
  if (!paymentRow) return user;
  const payment = paymentRow.legacyPaymentId
    ? await Payment.findByPk(paymentRow.legacyPaymentId).catch(() => null)
    : await Payment.findOne({ where: { reference: paymentRow.internalReference } }).catch(() => null);
  const status = String(payment?.status || paymentRow.status || '').toLowerCase();
  if (['completed', 'paid', 'success', 'successful', 'approved'].includes(status)) {
    await activateStandaloneSubscription({ user, paymentRow, plan: planByCode(paymentRow.planCode) });
    return user.reload ? user.reload() : user;
  }
  if (['failed', 'cancelled', 'canceled', 'expired', 'abandoned', 'reversed'].includes(status) && paymentRow.status !== status) {
    await paymentRow.update({ status, metadata: { ...(paymentRow.metadata || {}), syncedFailedAt: new Date().toISOString() } });
  }
  return user;
}

exports.requireLearnFeedUser = requireLearnFeedUser;

exports.register = async (req, res) => {
  try {
    const platformId = cleanText(req.body.elimuid || req.body.elimuId || req.body.platformStudentId || req.body.studentElimuId);
    const password = String(req.body.password || '');
    if (platformId) {
      const student = await verifyPlatformStudent(platformId, req.body.platformPassword || password);
      const user = await learnFeedUserForPlatformStudent(student, password, 'learnfeed_register_platform_link');
      return res.status(201).json({ success: true, data: { token: user.generateAuthToken(), user: publicUser(user), linked: true } });
    }
    const email = cleanText(req.body.email).toLowerCase();
    const displayName = cleanText(req.body.displayName || req.body.name, email.split('@')[0]);
    if (!email || !password || password.length < 6) return res.status(400).json({ success: false, message: 'Email and password of at least 6 characters are required.' });
    const exists = await LearnFeedUser.findOne({ where: { email } });
    if (exists) return res.status(400).json({ success: false, message: 'Email already exists. Sign in instead.' });
    const user = await LearnFeedUser.create({ learnFeedId: await uniqueLearnFeedId(), email, password, role: normalizeRole(req.body.role), displayName, handle: await uniqueHandle(req.body.handle || displayName || email), avatar: normalizeRole(req.body.role) === 'teacher' ? '👨🏾‍🏫' : '🎓', subscriptionStatus: 'free', subscriptionPlanCode: 'free', subscriptionSource: 'learnfeed' });
    res.status(201).json({ success: true, data: { token: user.generateAuthToken(), user: publicUser(user), linked: false } });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const platformId = cleanText(req.body.elimuid || req.body.elimuId || req.body.platformStudentId || req.body.studentElimuId);
    const password = String(req.body.password || '');
    if (platformId) {
      const student = await verifyPlatformStudent(platformId, password);
      const user = await learnFeedUserForPlatformStudent(student, password, 'platform_student_login');
      user.lastLogin = new Date();
      await user.save();
      return res.json({ success: true, data: { token: user.generateAuthToken(), user: publicUser(user), linked: true } });
    }
    const email = cleanText(req.body.email || req.body.emailOrPhone).toLowerCase();
    const user = await LearnFeedUser.findOne({ where: { email } });
    if (!user || !(await user.comparePassword(password))) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (!user.isActive) return res.status(403).json({ success: false, message: 'Account is deactivated' });
    await refreshInheritedSubscription(user);
    await syncStandaloneSubscriptionPayment(user);
    user.lastLogin = new Date();
    await user.save();
    res.json({ success: true, data: { token: user.generateAuthToken(), user: publicUser(user), linked: user.linkStatus === 'linked' } });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

exports.linkPlatformStudent = async (req, res) => {
  try {
    const platformId = cleanText(req.body.elimuid || req.body.elimuId || req.body.studentElimuId);
    const student = await verifyPlatformStudent(platformId, req.body.platformPassword || req.body.password);
    const linkedUser = await applyPlatformLink(req.learnFeedUser, student, 'manual_link_from_learnfeed');
    res.json({ success: true, data: { user: publicUser(linkedUser), linked: true } });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, message: error.message });
  }
};

exports.me = async (req, res) => {
  await refreshInheritedSubscription(req.learnFeedUser);
  await syncStandaloneSubscriptionPayment(req.learnFeedUser);
  res.json({ success: true, data: { user: publicUser(req.learnFeedUser) } });
};

exports.logout = async (req, res) => { res.json({ success: true, message: 'Logged out' }); };

exports.listFeed = async (req, res) => {
  try {
    const user = await optionalAuth(req);
    const feed = String(req.query.feed || 'for-you').toLowerCase();
    const subject = feed === 'stem' ? ['CHEMISTRY', 'MATHEMATICS', 'BIOLOGY', 'PHYSICS'] : null;
    const where = { status: 'published', visibility: 'public' };
    if (subject) where.subject = { [Op.in]: subject };
    const rows = await LearnFeedVideo.findAll({ where, include: [{ model: LearnFeedUser, as: 'Creator', attributes: ['id', 'displayName', 'handle', 'role', 'avatar'] }], order: [['createdAt', 'DESC']], limit: Math.min(50, Number(req.query.limit || 25)) });
    let liked = new Set(); let saved = new Set(); let following = new Set();
    if (user && rows.length) {
      const ids = rows.map(v => v.id);
      const creatorIds = rows.map(v => v.creatorId);
      const interactions = await LearnFeedInteraction.findAll({ where: { userId: user.id, videoId: ids, type: ['like', 'save'] } });
      liked = new Set(interactions.filter(x => x.type === 'like').map(x => x.videoId));
      saved = new Set(interactions.filter(x => x.type === 'save').map(x => x.videoId));
      const follows = await LearnFeedFollow.findAll({ where: { followerId: user.id, creatorId: creatorIds } });
      following = new Set(follows.map(x => x.creatorId));
    }
    let videos = rows.map(v => videoJson(v, { liked: liked.has(v.id), saved: saved.has(v.id), following: following.has(v.creatorId) }));
    if (feed === 'following' && user) videos = videos.filter(v => v.following);
    if (feed === 'live') videos = videos.filter(v => v.live);
    res.json({ success: true, data: { videos, page: Number(req.query.page || 0) } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

async function toggleInteraction(userId, videoId, type, countField) {
  const video = await LearnFeedVideo.findByPk(videoId);
  if (!video) throw Object.assign(new Error('Video not found'), { status: 404 });
  const existing = await LearnFeedInteraction.findOne({ where: { userId, videoId, type } });
  if (existing) {
    await existing.destroy();
    await video.update({ [countField]: Math.max(0, Number(video[countField] || 0) - 1) });
    return { active: false, video };
  }
  await LearnFeedInteraction.create({ userId, videoId, type });
  await video.update({ [countField]: Number(video[countField] || 0) + 1 });
  return { active: true, video };
}

exports.like = async (req, res) => { try { const result = await toggleInteraction(req.learnFeedUser.id, req.body.videoId, 'like', 'likesCount'); res.json({ success: true, data: { liked: result.active, likes: result.video.likesCount } }); } catch (error) { res.status(error.status || 400).json({ success: false, message: error.message }); } };
exports.save = async (req, res) => { try { const result = await toggleInteraction(req.learnFeedUser.id, req.body.videoId, 'save', 'savesCount'); res.json({ success: true, data: { saved: result.active, saves: result.video.savesCount } }); } catch (error) { res.status(error.status || 400).json({ success: false, message: error.message }); } };

exports.follow = async (req, res) => {
  try {
    let creatorId = Number(req.body.creatorId || 0);
    if (!creatorId && req.body.videoId) {
      const video = await LearnFeedVideo.findByPk(req.body.videoId);
      creatorId = Number(video?.creatorId || 0);
    }
    if (!creatorId || creatorId === req.learnFeedUser.id) return res.status(400).json({ success: false, message: 'Valid creatorId required' });
    const existing = await LearnFeedFollow.findOne({ where: { followerId: req.learnFeedUser.id, creatorId } });
    if (existing) { await existing.destroy(); return res.json({ success: true, data: { following: false } }); }
    await LearnFeedFollow.create({ followerId: req.learnFeedUser.id, creatorId });
    res.json({ success: true, data: { following: true } });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

exports.notInterested = async (req, res) => { try { await LearnFeedInteraction.findOrCreate({ where: { userId: req.learnFeedUser.id, videoId: req.body.videoId, type: 'not_interested' } }); res.json({ success: true, data: { hidden: true } }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } };

exports.publishVideo = async (req, res) => {
  try {
    const payload = req.body || {};
    const title = cleanText(payload.caption || payload.title, 'New LearnFeed Lesson').slice(0, 180);
    const subject = cleanText(payload.subject, 'General').slice(0, 80);
    const video = await LearnFeedVideo.create({ creatorId: req.learnFeedUser.id, subject: subject.toUpperCase(), className: cleanText(payload.className, 'Public').slice(0, 80), title, description: cleanText(payload.description, '').slice(0, 4000), visualEmoji: payload.emoji || '🎓', soundTitle: cleanText(payload.sound, 'Original Sound - Public Creator').slice(0, 180), topic: subject, aiContext: 'This is a public LearnFeed lesson about ' + subject + '.', quizQuestion: 'What is this lesson mainly about?', quizOptions: [subject, 'Gaming', 'Cooking', 'Travel'], quizAnswerIndex: 0, visibility: String(payload.visibility || 'public').toLowerCase(), allowComments: payload.allowComments !== false, allowDuet: payload.allowDuet !== false, allowStitch: payload.allowStitch !== false, metadata: { source: 'learnfeed-app', effect: payload.effect || null } });
    const full = await LearnFeedVideo.findByPk(video.id, { include: [{ model: LearnFeedUser, as: 'Creator', attributes: ['id', 'displayName', 'handle', 'role', 'avatar'] }] });
    res.status(201).json({ success: true, data: { video: videoJson(full) } });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

exports.reportVideo = async (req, res) => { try { await LearnFeedInteraction.findOrCreate({ where: { userId: req.learnFeedUser.id, videoId: req.body.videoId, type: 'report' }, defaults: { metadata: { reason: cleanText(req.body.reason, 'Other') } } }); res.json({ success: true, message: 'Report submitted' }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } };
exports.remixVideo = async (req, res) => { res.json({ success: true, data: { sourceVideoId: req.body.sourceVideoId, mode: req.body.mode || 'remix', ready: true } }); };

exports.listComments = async (req, res) => { try { const videoId = Number(req.query.videoId || req.params.videoId || 0); const comments = await LearnFeedComment.findAll({ where: { videoId, status: 'visible' }, include: [{ model: LearnFeedUser, as: 'User', attributes: ['id', 'displayName', 'avatar'] }], order: [['pinned', 'DESC'], ['createdAt', 'DESC']], limit: 80 }); res.json({ success: true, data: { comments: comments.map(commentJson) } }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } };
exports.addComment = async (req, res) => { try { const video = await LearnFeedVideo.findByPk(req.body.videoId); if (!video || !video.allowComments) return res.status(404).json({ success: false, message: 'Comments unavailable for this video' }); const text = cleanText(req.body.text).slice(0, 1000); if (!text) return res.status(400).json({ success: false, message: 'Comment text is required' }); const comment = await LearnFeedComment.create({ userId: req.learnFeedUser.id, videoId: video.id, text }); await video.update({ commentsCount: Number(video.commentsCount || 0) + 1 }); const full = await LearnFeedComment.findByPk(comment.id, { include: [{ model: LearnFeedUser, as: 'User', attributes: ['id', 'displayName', 'avatar'] }] }); res.status(201).json({ success: true, data: { comment: commentJson(full), comments: video.commentsCount + 1 } }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } };
exports.likeComment = async (req, res) => { res.json({ success: true, data: { liked: true } }); };

exports.listLiveRooms = async (req, res) => { try { const rooms = await LearnFeedLiveRoom.findAll({ where: { status: 'live' }, include: [{ model: LearnFeedUser, as: 'Host', attributes: ['id', 'displayName', 'handle', 'avatar'] }], order: [['createdAt', 'DESC']], limit: 30 }); res.json({ success: true, data: { rooms: rooms.map(roomJson) } }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } };
exports.startLive = async (req, res) => { try { const room = await LearnFeedLiveRoom.create({ hostUserId: req.learnFeedUser.id, title: cleanText(req.body.title, 'Live Lesson').slice(0, 180), subject: cleanText(req.body.subject, 'General').slice(0, 80), emoji: req.body.emoji || '🔴' }); const full = await LearnFeedLiveRoom.findByPk(room.id, { include: [{ model: LearnFeedUser, as: 'Host', attributes: ['id', 'displayName', 'handle', 'avatar'] }] }); res.status(201).json({ success: true, data: { room: roomJson(full) } }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } };
exports.endLive = async (req, res) => { try { await LearnFeedLiveRoom.update({ status: 'ended', endedAt: new Date() }, { where: { id: req.body.roomId, hostUserId: req.learnFeedUser.id } }); res.json({ success: true }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } };
exports.liveChat = async (req, res) => { res.json({ success: true, data: { message: cleanText(req.body.text), sender: publicUser(req.learnFeedUser), createdAt: new Date().toISOString() } }); };
exports.liveGift = async (req, res) => { res.json({ success: true, data: { accepted: true, giftId: req.body.giftId || 'heart' } }); };

exports.listSounds = async (req, res) => { res.json({ success: true, data: { sounds: [{ id: 's1', title: 'Original Sound - Study Beat', creator: 'LearnFeed', uses: '18.2K' }, { id: 's2', title: 'Soft Revision Lofi', creator: 'Shule AI', uses: '9.4K' }, { id: 's3', title: 'Exam Focus Timer', creator: 'Creator Tools', uses: '4.1K' }] } }); };
exports.useSound = async (req, res) => { res.json({ success: true, data: { soundId: req.body.soundId, selected: true } }); };
exports.askAi = async (req, res) => { const text = cleanText(req.body.text, 'Explain this lesson'); const video = req.body.videoId ? await LearnFeedVideo.findByPk(req.body.videoId).catch(() => null) : null; const context = video?.aiContext || 'This is a public LearnFeed lesson.'; res.json({ success: true, data: { answer: context + ' For your question: "' + text + '", start with the key idea, then solve it step by step.' } }); };
exports.submitQuiz = async (req, res) => { try { const video = await LearnFeedVideo.findByPk(req.body.videoId); if (!video) return res.status(404).json({ success: false, message: 'Video not found' }); const selected = Number(req.body.answer); const correct = selected === Number(video.quizAnswerIndex || 0); res.json({ success: true, data: { correct, xp: correct ? 10 : 2, answer: video.quizAnswerIndex } }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } };

exports.inbox = async (req, res) => { try { const messages = await LearnFeedMessage.findAll({ where: { [Op.or]: [{ toUserId: req.learnFeedUser.id }, { fromUserId: req.learnFeedUser.id }] }, order: [['createdAt', 'DESC']], limit: 50 }); res.json({ success: true, data: { messages } }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } };
exports.sendMessage = async (req, res) => { try { const text = cleanText(req.body.text).slice(0, 2000); const toUserId = Number(req.body.toId || req.body.toUserId || 0); if (!text || !toUserId) return res.status(400).json({ success: false, message: 'Recipient and text are required' }); const message = await LearnFeedMessage.create({ fromUserId: req.learnFeedUser.id, toUserId, text }); res.status(201).json({ success: true, data: { message } }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } };

exports.publicPlans = async (req, res) => { res.json({ success: true, data: { plans: PUBLIC_PLANS } }); };

exports.checkout = async (req, res) => {
  try {
    const user = req.learnFeedUser;
    await refreshInheritedSubscription(user);
    if (user.linkStatus === 'linked' && user.hasActiveLearnFeedAccess()) {
      return res.json({ success: true, data: { noPaymentRequired: true, user: publicUser(user), message: 'This student is linked to an active ShuleAI school subscription.' } });
    }
    if (user.linkStatus === 'linked') {
      return res.status(403).json({ success: false, message: 'This student is linked to a ShuleAI school account. Subscription should be handled through the school/parent platform, not a separate LearnFeed platform payment.' });
    }
    const plan = planByCode(req.body.planId || req.body.planCode || 'learner_plus');
    if (!plan.monthlyKes) return res.json({ success: true, data: { noPaymentRequired: true, plan, user: publicUser(user) } });
    const phone = normalizePhone(req.body.phone || req.body.payerPhone);
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required for M-Pesa STK prompt.' });
    const provider = paymentEngine.normalizeProvider(req.body.provider || 'daraja') || 'daraja';
    const reference = 'LF-' + user.learnFeedId.replace(/[^A-Z0-9]/gi, '') + '-' + Date.now();
    const payment = await paymentEngine.initiatePayment({
      user: { id: user.id, role: 'learnfeed_user', email: user.email, name: user.displayName, phone, schoolCode: 'platform' },
      body: { paymentType: 'platform', platformPurpose: 'learnfeed_subscription', purpose: 'learnfeed_subscription', provider, amount: plan.monthlyKes, currency: 'KES', phone, email: user.email, name: user.displayName, reference, accountReference: user.learnFeedId, metadata: { learnFeedUserId: user.id, learnFeedId: user.learnFeedId, planCode: plan.code } }
    });
    const record = await LearnFeedSubscriptionPayment.create({ userId: user.id, learnFeedId: user.learnFeedId, legacyPaymentId: payment.id, planCode: plan.code, planName: plan.name, provider, phone, amount: plan.monthlyKes, currency: 'KES', status: 'pending', internalReference: payment.reference || reference, providerReference: payment.providerReference || null, checkoutRequestId: payment.checkoutRequestId || null, checkoutUrl: payment.checkoutUrl || null, metadata: { promptStatus: payment.promptStatus, promptType: payment.promptType, message: payment.metadata?.promptMessage || null } });
    await user.update({ lastSubscriptionPaymentReference: record.internalReference });
    res.status(201).json({ success: true, data: { reference: record.internalReference, status: payment.status, promptStatus: payment.promptStatus, promptType: payment.promptType, provider, phone, amount: plan.monthlyKes, currency: 'KES', checkoutUrl: payment.checkoutUrl, message: payment.metadata?.promptMessage || 'M-Pesa prompt sent.', plan, learnFeedId: user.learnFeedId } });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

exports.paymentStatus = async (req, res) => {
  try {
    const reference = cleanText(req.params.reference || req.query.reference).toUpperCase();
    const record = await LearnFeedSubscriptionPayment.findOne({ where: { internalReference: reference, userId: req.learnFeedUser.id } });
    if (!record) return res.status(404).json({ success: false, message: 'Payment not found for this LearnFeed account.' });
    const payment = record.legacyPaymentId ? await Payment.findByPk(record.legacyPaymentId) : await Payment.findOne({ where: { reference } });
    const status = String(payment?.status || record.status || '').toLowerCase();
    const paid = ['completed', 'paid', 'success', 'successful', 'approved'].includes(status);
    if (paid && record.status !== 'success') await activateStandaloneSubscription({ user: req.learnFeedUser, paymentRow: record, plan: planByCode(record.planCode) });
    res.json({ success: true, data: { reference, status: paid ? 'success' : (payment?.status || record.status), promptStatus: payment?.promptStatus || record.metadata?.promptStatus || null, provider: record.provider, amount: record.amount, currency: record.currency, paid, user: publicUser(req.learnFeedUser) } });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

exports.wallet = async (req, res) => { res.json({ success: true, data: { balanceKes: Math.round(Number(req.learnFeedUser.walletBalanceCents || 0) / 100), currency: 'KES', available: true, learnFeedId: req.learnFeedUser.learnFeedId } }); };
exports.withdraw = async (req, res) => { res.json({ success: true, data: { status: 'requested', amount: Number(req.body.amount || 0), provider: req.body.provider || 'mpesa' } }); };
