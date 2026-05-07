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
const gamificationRoutes = require('./routes/gamificationRoutes');
const chatV9Routes = require('./routes/chatV9Routes');
const paymentRoutes = require('./routes/paymentRoutes');
const nationalRolloutRoutes = require('./routes/nationalRolloutRoutes');
const scaleRoutes = require('./routes/scaleRoutes');
const jobRoutes = require('./routes/jobRoutes');
const tutorRoutes = require('./routes/tutorRoutes');
const reportRoutes = require('./routes/reportRoutes');
const compatibilityRoutes = require('./routes/compatibilityRoutes');
const feeStructureRoutes = require('./routes/feeStructureRoutes');
const { routeAwareApiLimiter } = require('./middleware/productionRateLimits');
const { requestContext, productionErrorHandler } = require('./middleware/requestContext');

const app = express();

// ============ MIDDLEWARE ============
app.use(requestContext);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Route-aware limits: strict for auth/uploads/writes, generous for dashboard reads.
app.use('/api', routeAwareApiLimiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(compression());

app.use(fileUpload({
  limits: { fileSize: process.env.MAX_FILE_SIZE || 50 * 1024 * 1024 },
  useTempFiles: true,
  tempFileDir: '/tmp/',
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

// ============ TEST ENDPOINT ============
app.get('/health', (req, res) => {
  res.json({ success: true, timestamp: new Date().toISOString() });
});

// ============ MOUNT ROUTES ============
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/duty', dutyRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/subscription', subscriptionRoutes);
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
// V27 compatibility routes fix old frontend/test endpoints and role-safe aliases.
app.use('/api', compatibilityRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/homework', homeworkRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/chat-v9', chatV9Routes);
app.use('/api/scale', scaleRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/tutor', tutorRoutes);
// National rollout completion routes fill missing school-operations APIs and disable live money collection.
app.use('/api', nationalRolloutRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/fee-structures', feeStructureRoutes);
app.use('/api/fees/structures', feeStructureRoutes);

// ============ 404 HANDLER ============
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ============ ERROR HANDLER ============
app.use(productionErrorHandler);

module.exports = app;
