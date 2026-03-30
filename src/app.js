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
const { sequelize } = require('./models');

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
const uploadRoutes = require('./routes/uploadRoutes');
const schoolRoutes = require('./routes/schoolRoutes');
const parentMessageRoutes = require('./routes/parentMessageRoutes');
const helpRoutes = require('./routes/helpRoutes');
const userRoutes = require('./routes/userRoutes');
const taskRoutes = require('./routes/taskRoutes');

const app = express();

// ============ MIDDLEWARE ============
// Security
app.use(helmet());

// CORS - Allow frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use('/api', limiter);

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(compression());

// File upload
app.use(fileUpload({
  limits: { fileSize: process.env.MAX_FILE_SIZE || 50 * 1024 * 1024 },
  useTempFiles: true,
  tempFileDir: '/tmp/',
  createParentPath: true
}));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Session - Use a proper store in production (Redis, etc.)
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

// Static uploads
const uploadDir = path.join(__dirname, '../uploads');
const fs = require('fs');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// ============ TEST ENDPOINTS ============
app.get('/health', (req, res) => {
  res.json({ success: true, timestamp: new Date().toISOString() });
});

app.get('/api/test/db', async (req, res) => {
  try {
    const { School } = require('./models');
    const count = await School.count();
    res.json({
      success: true,
      message: 'Database connected',
      schoolCount: count
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({
      success: false,
      message: 'Database error',
      error: error.message
    });
  }
});

app.post('/api/test/create-school', async (req, res) => {
  try {
    const { School } = require('./models');
    const testSchool = await School.create({
      name: 'Test School ' + Date.now(),
      system: 'cbc',
      status: 'pending'
    });
    res.json({
      success: true,
      school: {
        id: testSchool.id,
        schoolId: testSchool.schoolId,
        shortCode: testSchool.shortCode,
        name: testSchool.name
      }
    });
  } catch (error) {
    console.error('Test school creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============ ROUTES ============
// All routes must be valid routers (not objects)
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/duty', dutyRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/parent-messages', parentMessageRoutes);  // Changed to avoid conflict
app.use('/api/student', studentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/school', schoolRoutes);
app.use('/api/help', helpRoutes);
app.use('/api/user', userRoutes);
app.use('/api/tasks', taskRoutes);

// 404 handler - This must be AFTER all routes
app.use((req, res) => {
  console.log('404 Not Found:', req.method, req.url);
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
