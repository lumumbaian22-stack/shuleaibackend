const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');

// Routes – ensure all files exist and export a router
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const dutyRoutes = require('./routes/dutyRoutes');
const publicRoutes = require('./routes/publicRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const parentRoutes = require('./routes/parentRoutes');
const studentRoutes = require('./routes/studentRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const schoolRoutes = require('./routes/schoolRoutes');
const parentMessageRoutes = require('./routes/parentMessageRoutes');
const helpRoutes = require('./routes/helpRoutes');
const userRoutes = require('./routes/userRoutes');
const taskRoutes = require('./routes/taskRoutes');
const alertRoutes = require('./routes/alertRoutes');
const competencyRoutes = require('./routes/competencyRoutes');

const app = express();

// ============ MIDDLEWARE ============
app.use(helmet());

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use('/api', limiter);

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
app.use('/uploads', express.static(uploadDir));

// ============ TEST ENDPOINTS ============
app.get('/health', (req, res) => {
  res.json({ success: true, timestamp: new Date().toISOString() });
});

// ============ ROUTES ============
// Verify each imported route is a valid router function
const routeModules = {
  '/api/auth': authRoutes,
  '/api/admin': adminRoutes,
  '/api/duty': dutyRoutes,
  '/api/public': publicRoutes,
  '/api/super-admin': superAdminRoutes,
  '/api/teacher': teacherRoutes,
  '/api/parent': parentRoutes,
  '/api/student': studentRoutes,
  '/api/analytics': analyticsRoutes,
  '/api/upload': uploadRoutes,
  '/api/school': schoolRoutes,
  '/api/parent-messages': parentMessageRoutes,
  '/api/help': helpRoutes,
  '/api/user': userRoutes,
  '/api/tasks': taskRoutes,
  '/api/alerts': alertRoutes,
  '/api/cbe': competencyRoutes
};

Object.entries(routeModules).forEach(([path, router]) => {
  if (typeof router === 'function') {
    app.use(path, router);
  } else {
    console.error(`❌ Route module for ${path} is not a valid router function. Got:`, typeof router);
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

module.exports = app;
