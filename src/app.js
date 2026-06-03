const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');

// Routes
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const dutyRoutes = require('./routes/dutyRoutes');
const publicRoutes = require('./routes/publicRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const parentRoutes = require('./routes/parentRoutes');
const studentRoutes = require('./routes/studentRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const schoolRoutes = require('./routes/schoolRoutes');
const parentMessageRoutes = require('./routes/parentMessageRoutes');
const helpRoutes = require('./routes/helpRoutes');
const userRoutes = require('./routes/userRoutes');
const taskRoutes = require('./routes/taskRoutes');
const alertRoutes = require('./routes/alertRoutes');
const competencyRoutes = require('./routes/competencyRoutes');
const homeTaskRoutes = require('./routes/homeTaskRoutes');
const consentRoutes = require('./routes/consentRoutes'); // <-- ADDED
const searchRoutes = require('./routes/searchRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const timetableRoutes = require('./routes/timetableRoutes');
const homeworkRoutes = require('./routes/homeworkRoutes');
const publicHomeworkFileController = require('./controllers/homeworkController');
const gamificationRoutes = require('./routes/gamificationRoutes');
const chatV9Routes = require('./routes/chatV9Routes');
const paymentRoutes = require('./routes/paymentRoutes');
const nationalRolloutRoutes = require('./routes/nationalRolloutRoutes');
const scaleRoutes = require('./routes/scaleRoutes');
const jobRoutes = require('./routes/jobRoutes');
const tutorRoutes = require('./routes/tutorRoutes');
const reportRoutes = require('./routes/reportRoutes');
const smsRoutes = require('./routes/smsRoutes');
const compatibilityRoutes = require('./routes/compatibilityRoutes');
const feeStructureRoutes = require('./routes/feeStructureRoutes');
const ownerHardeningRoutes = require('./routes/ownerHardeningRoutes');
const { routeAwareApiLimiter } = require('./middleware/productionRateLimits');
const { requestContext, productionErrorHandler } = require('./middleware/requestContext');
const { ensureRuntimeSchema } = require('./utils/schemaSafety');
const { accessSchemaMiddleware, ensureSchoolAccessSchema } = require('./utils/accessSchemaGuard');
const { requireFeature } = require('./middleware/featureGate');

const app = express();

// ============ MIDDLEWARE ============
app.use(requestContext);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS must run before all /api routes and before rate limits.
// Do not rely only on FRONTEND_URL because production may use shuleai.live, www,
// GitHub Pages preview domains, or local dev during emergency testing.
const builtInAllowedOrigins = [
  'https://shuleai.live',
  'https://www.shuleai.live',
  'https://lumumbaian22-stack.github.io',
  'https://shuleaiinfo-cmd.github.io',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5500'
];

const allowedOrigins = Array.from(new Set([
  ...builtInAllowedOrigins,
  ...(process.env.CORS_ORIGINS || '').split(','),
  ...(process.env.FRONTEND_URL || '').split(',')
].map((origin) => String(origin || '').trim()).filter(Boolean)));

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  // Allow GitHub Pages preview/user pages without opening CORS to all origins.
  if (/^https:\/\/[a-z0-9-]+\.github\.io$/i.test(origin)) return true;
  return false;
}

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    console.warn(`[CORS] Blocked origin: ${origin}`);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Route-aware limits: strict for auth/uploads/writes, generous for dashboard reads.
app.use('/api', routeAwareApiLimiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(compression());

app.use(fileUpload({
  limits: { fileSize: process.env.MAX_FILE_SIZE || 50 * 1024 * 1024 },
  useTempFiles: true,
  tempFileDir: process.env.UPLOAD_TMP_DIR || path.join(process.cwd(), 'uploads', 'tmp'),
  createParentPath: true
}));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
  }
}));

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}, express.static(uploadDir));

// Public homework file route used by dashboard View/Download buttons.
// Kept outside /api so browser navigation/downloads do not fail when Authorization headers are unavailable.
app.get('/homework-files/:filename', publicHomeworkFileController.serveHomeworkAttachment);

// ============ TEST ENDPOINT ============
app.get('/health', (req, res) => {
  res.json({ success: true, timestamp: new Date().toISOString() });
});
app.get('/api/health', (req, res) => {
  res.json({ success: true, timestamp: new Date().toISOString() });
});

app.get('/api/health/detailed', async (req, res) => {
  const started = Date.now();
  const checks = { database: { ok: false }, daraja: { ok: false }, aiTutor: { ok: false }, storage: { ok: false } };
  try {
    const { sequelize } = require('./models');
    await sequelize.query('SELECT 1');
    checks.database = { ok: true };
  } catch (e) { checks.database = { ok: false, error: e.message }; }
  try {
    checks.daraja = {
      ok: Boolean(process.env.DARAJA_CONSUMER_KEY && process.env.DARAJA_CONSUMER_SECRET && process.env.DARAJA_PASSKEY && process.env.DARAJA_SHORTCODE),
      configured: Boolean(process.env.DARAJA_CONSUMER_KEY && process.env.DARAJA_CONSUMER_SECRET && process.env.DARAJA_PASSKEY && process.env.DARAJA_SHORTCODE),
      env: process.env.DARAJA_ENV || 'sandbox'
    };
  } catch (e) { checks.daraja = { ok: false, error: e.message }; }
  try {
    const provider = String(process.env.AI_PROVIDER || 'deepseek').toLowerCase().trim();
    const deepseekConfigured = Boolean(process.env.DEEPSEEK_API_KEY);
    const anthropicConfigured = Boolean(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY);
    checks.aiTutor = {
      ok: provider === 'deepseek' ? deepseekConfigured : anthropicConfigured,
      configured: provider === 'deepseek' ? deepseekConfigured : anthropicConfigured,
      provider,
      model: provider === 'deepseek'
        ? (process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash')
        : (process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || 'claude-haiku-4-5'),
      baseUrl: provider === 'deepseek' ? (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com') : undefined
    };
  } catch (e) { checks.aiTutor = { ok: false, error: e.message }; }
  try {
    const tmp = path.join(uploadDir, `.health-${Date.now()}.tmp`);
    fs.writeFileSync(tmp, 'ok'); fs.unlinkSync(tmp);
    checks.storage = { ok: true, uploadDir };
  } catch (e) { checks.storage = { ok: false, error: e.message, uploadDir }; }
  const ok = Object.values(checks).every(x => x.ok);
  res.status(ok ? 200 : 503).json({ success: ok, status: ok ? 'ready' : 'degraded', uptime: process.uptime(), latencyMs: Date.now() - started, timestamp: new Date().toISOString(), checks });
});


// V105: required school access/curriculum schema guard.
// This is not optional in production because the School model reads these columns during login.
// It runs once, before auth and dashboard routes, and only uses safe additive SQL.
app.use('/api', accessSchemaMiddleware);

// Fire the same guard at boot as well; middleware still protects the first request if boot DB is slow.
ensureSchoolAccessSchema().catch((err) => {
  console.error('[access-schema-guard] boot repair failed; first API request will retry:', err.message);
});


// V42: run the schema guard once on first API request too. This protects Render deployments
// where startup migrations are skipped, delayed, or the old process remains warm.
let __v42SchemaGuardPromise = null;
app.use('/api', async (req, res, next) => {
  const allowRuntimeSchemaRepair = process.env.ALLOW_RUNTIME_SCHEMA_REPAIR === 'true' || process.env.NODE_ENV !== 'production';
  if (!allowRuntimeSchemaRepair) return next();
  try {
    if (!__v42SchemaGuardPromise) {
      __v42SchemaGuardPromise = ensureRuntimeSchema().catch((err) => {
        console.error('[v42-schema-guard] Runtime schema repair failed:', err.message);
        __v42SchemaGuardPromise = null;
      });
    }
    await __v42SchemaGuardPromise;
  } catch (err) {
    console.error('[v42-schema-guard] Continuing after schema guard error:', err.message);
  }
  next();
});


async function ensureCriticalDashboardColumns(req, res, next) {
  if (process.env.ALLOW_RUNTIME_SCHEMA_REPAIR !== 'true' && process.env.NODE_ENV === 'production') return next();
  try {
    const { sequelize } = require('./models');
    await sequelize.query('ALTER TABLE IF EXISTS "Students" ADD COLUMN IF NOT EXISTS "classId" INTEGER');
    await sequelize.query('ALTER TABLE IF EXISTS "Teachers" ADD COLUMN IF NOT EXISTS "classId" INTEGER');
    await sequelize.query('ALTER TABLE IF EXISTS "AcademicRecords" ADD COLUMN IF NOT EXISTS "classId" INTEGER');
    await sequelize.query('ALTER TABLE IF EXISTS "Attendances" ADD COLUMN IF NOT EXISTS "classId" INTEGER');
    await sequelize.query('ALTER TABLE IF EXISTS "Fees" ADD COLUMN IF NOT EXISTS "classId" INTEGER');
    await sequelize.query('ALTER TABLE IF EXISTS "ReportSnapshots" ADD COLUMN IF NOT EXISTS "classId" INTEGER').catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "FeeStructures" ADD COLUMN IF NOT EXISTS "classId" INTEGER').catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "TutorSessions" ADD COLUMN IF NOT EXISTS "schoolCode" VARCHAR(255)').catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "TutorMessages" ADD COLUMN IF NOT EXISTS "schoolCode" VARCHAR(255)').catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "pilotFullAccessEnabled" BOOLEAN DEFAULT FALSE').catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "pilotStartedAt" TIMESTAMP WITH TIME ZONE').catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "pilotEndsAt" TIMESTAMP WITH TIME ZONE').catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "pilotEnabledBy" INTEGER').catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "trialAccessEnabled" BOOLEAN DEFAULT FALSE').catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "trialStartedAt" TIMESTAMP WITH TIME ZONE').catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP WITH TIME ZONE').catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "manualPaymentConfirmed" BOOLEAN DEFAULT FALSE').catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "manualPaymentAmount" INTEGER').catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "manualPaymentReference" VARCHAR(255)').catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "manualPaymentConfirmedBy" INTEGER').catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "manualPaymentConfirmedAt" TIMESTAMP WITH TIME ZONE').catch(() => null);
    await sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "subscriptionPlan" VARCHAR(255) DEFAULT 'free'`).catch(() => null);
    await sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "subscriptionStatus" VARCHAR(255) DEFAULT 'inactive'`).catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "subscriptionStartedAt" TIMESTAMP WITH TIME ZONE').catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "subscriptionEndsAt" TIMESTAMP WITH TIME ZONE').catch(() => null);
    await sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "accessMode" VARCHAR(255) DEFAULT 'default'`).catch(() => null);
    await sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "accessStatus" VARCHAR(255) DEFAULT 'limited'`).catch(() => null);
    await sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "schoolStructure" VARCHAR(255) DEFAULT 'mixed'`).catch(() => null);
    await sequelize.query(`ALTER TABLE IF EXISTS "Schools" ADD COLUMN IF NOT EXISTS "enabledLevels" JSONB DEFAULT '[]'::jsonb`).catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "Classes" ADD COLUMN IF NOT EXISTS "curriculum" VARCHAR(255)').catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "Classes" ADD COLUMN IF NOT EXISTS "levelCode" VARCHAR(255)').catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "Classes" ADD COLUMN IF NOT EXISTS "levelLabel" VARCHAR(255)').catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "Classes" ADD COLUMN IF NOT EXISTS "curriculumLevel" VARCHAR(255)').catch(() => null);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS "SchoolPaymentRequests" ("id" SERIAL PRIMARY KEY, "schoolCode" VARCHAR(255) NOT NULL, "submittedBy" INTEGER, "amount" INTEGER DEFAULT 0, "currency" VARCHAR(255) DEFAULT 'KES', "method" VARCHAR(255) DEFAULT 'mpesa', "reference" VARCHAR(255), "paidAt" TIMESTAMP WITH TIME ZONE, "notes" TEXT, "proofUrl" TEXT, "requestedPlan" VARCHAR(255) DEFAULT 'growth', "status" VARCHAR(255) DEFAULT 'pending', "reviewedBy" INTEGER, "reviewedAt" TIMESTAMP WITH TIME ZONE, "reviewNotes" TEXT, "metadata" JSONB DEFAULT '{}'::jsonb, "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(), "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW())`).catch(() => null);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS "StudentSubjectSelections" ("id" SERIAL PRIMARY KEY, "schoolCode" VARCHAR(255) NOT NULL, "studentId" INTEGER NOT NULL, "classId" INTEGER, "subjectId" VARCHAR(255), "subjectName" VARCHAR(255) NOT NULL, "status" VARCHAR(255) DEFAULT 'taking', "pathway" VARCHAR(255), "track" VARCHAR(255), "isCompulsory" BOOLEAN DEFAULT FALSE, "isElective" BOOLEAN DEFAULT TRUE, "requestedBy" INTEGER, "approvedBy" INTEGER, "approvedAt" TIMESTAMP WITH TIME ZONE, "metadata" JSONB DEFAULT '{}'::jsonb, "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(), "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW())`).catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "SchoolCalendars" ADD COLUMN IF NOT EXISTS "classId" INTEGER').catch(() => null);
    await sequelize.query('ALTER TABLE IF EXISTS "SchoolCalendars" ADD COLUMN IF NOT EXISTS "createdByUserId" INTEGER').catch(() => null);
    await sequelize.query(`ALTER TABLE IF EXISTS "SchoolCalendars" ADD COLUMN IF NOT EXISTS "metadata" JSONB DEFAULT '{}'::jsonb`).catch(() => null);
    await sequelize.query('CREATE INDEX IF NOT EXISTS "idx_school_calendars_owner" ON "SchoolCalendars" ("schoolId", "createdByUserId")').catch(() => null);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS "PlatformAuditEvents" ("id" SERIAL PRIMARY KEY, "schoolCode" VARCHAR(255), "actorUserId" INTEGER, "actorRole" VARCHAR(255), "module" VARCHAR(255), "action" VARCHAR(255), "entityType" VARCHAR(255), "entityId" VARCHAR(255), "before" JSONB DEFAULT '{}'::jsonb, "after" JSONB DEFAULT '{}'::jsonb, "metadata" JSONB DEFAULT '{}'::jsonb, "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(), "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW())`).catch(() => null);
    await sequelize.query(`ALTER TABLE IF EXISTS "TutorMessages" ADD COLUMN IF NOT EXISTS "content" TEXT NOT NULL DEFAULT ''`).catch(() => null);
    await sequelize.query(`UPDATE "TutorMessages" SET "content" = COALESCE(NULLIF("content", ''), "message", 'Tutor message') WHERE "content" IS NULL OR "content" = ''`).catch(() => null);
    await sequelize.query("UPDATE \"TutorSessions\" SET \"schoolCode\" = COALESCE(\"schoolCode\", \"schoolId\", 'default') WHERE \"schoolCode\" IS NULL").catch(() => null);
    await sequelize.query("UPDATE \"TutorMessages\" SET \"schoolCode\" = COALESCE(\"schoolCode\", \"schoolId\", 'default') WHERE \"schoolCode\" IS NULL").catch(() => null);
  } catch (err) {
    console.error('[critical-schema] repair failed:', err.message);
  }
  next();
}
app.use('/api', ensureCriticalDashboardColumns);

app.post('/api/system/repair-schema', (req, res, next) => {
  if (process.env.ALLOW_RUNTIME_SCHEMA_REPAIR !== 'true') return res.status(403).json({ success:false, message:'Runtime schema repair is disabled. Run migrations instead.' });
  return ensureCriticalDashboardColumns(req, res, next);
}, (req, res) => {
  res.json({ success: true, message: 'Critical dashboard schema repair completed' });
});

// ============ MOUNT ROUTES ============
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/duty', requireFeature('duty'), dutyRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/subscription', subscriptionRoutes);
// v126: backwards-compatible plural alias used by consolidated frontend fallback paths.
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/school', schoolRoutes);
app.use('/api/parent-messages', parentMessageRoutes);
app.use('/api/help', helpRoutes);
app.use('/api/user', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/cbe', competencyRoutes);
app.use('/api/home-tasks', homeTaskRoutes);
app.use('/api/consent', consentRoutes);   // <-- ADDED
app.use('/api/search', searchRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/sms', requireFeature('bulk_sms'), smsRoutes);
// V27 compatibility routes fix old frontend/test endpoints and role-safe aliases.
app.use('/api', compatibilityRoutes);
app.use('/api/calendar', requireFeature('calendar'), calendarRoutes);
app.use('/api/timetable', requireFeature('timetable'), timetableRoutes);
app.use('/api/homework', requireFeature('homework'), homeworkRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/chat-v9', chatV9Routes);
app.use('/api/scale', scaleRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/tutor', tutorRoutes);
// Payment routes must be mounted BEFORE nationalRolloutRoutes.
// nationalRolloutRoutes intentionally disables legacy/fake payment endpoints, but real Daraja STK
// endpoints such as /api/payments/parent/subscription/stk must remain reachable.
app.use('/api/payments', paymentRoutes);
// National rollout completion routes fill missing school-operations APIs and disable old live-money endpoints.
app.use('/api', nationalRolloutRoutes);
app.use('/api/owner', ownerHardeningRoutes);
app.use('/api/fee-structures', feeStructureRoutes);
app.use('/api/fees/structures', feeStructureRoutes);

// ============ 404 HANDLER ============
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ============ ERROR HANDLER ============
app.use(productionErrorHandler);

module.exports = app;
