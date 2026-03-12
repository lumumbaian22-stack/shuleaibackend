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
// ... other routes

const app = express();

// Security
app.use(helmet());

// ============ UPDATED CORS CONFIGURATION ============
const allowedOrigins = [
    'https://shuleai.live',
    'http://localhost:3000',
    'http://localhost:5000',
    'https://shuleaibackend-32h1.onrender.com',
    process.env.FRONTEND_URL
].filter(Boolean); // Remove any undefined values

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, etc)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
            callback(null, true);
        } else {
            console.log('Blocked origin:', origin); // For debugging
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Handle preflight requests for all routes
app.options('*', cors(corsOptions));

// Additional headers middleware
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin) || !origin) {
        res.header('Access-Control-Allow-Origin', origin || '*');
    }
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});
// ============ END CORS CONFIGURATION ============

// Rate limiting
const limiter = rateLimit({ 
    windowMs: 15*60*1000, 
    max: 100,
    skip: (req) => req.method === 'OPTIONS' // Skip preflight requests
});
app.use('/api', limiter);

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(compression());

// File upload
app.use(fileUpload({
  limits: { fileSize: process.env.MAX_FILE_SIZE || 50*1024*1024 },
  useTempFiles: true,
  tempFileDir: '/tmp/',
  createParentPath: true
}));

// Logging
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production', 
    maxAge: 7*24*60*60*1000,
    sameSite: 'lax' // Important for cross-origin requests
  }
}));

// Static uploads
const uploadDir = path.join(__dirname, '../uploads');
require('fs').existsSync(uploadDir) || require('fs').mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/duty', dutyRoutes);
app.use('/api/public', publicRoutes);
// ... other routes

app.get('/health', (req, res) => {
  res.json({ success: true, timestamp: new Date().toISOString() });
});

// 404
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  
  // Handle CORS errors specifically
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ 
      success: false, 
      message: 'CORS error: Origin not allowed',
      allowedOrigins: allowedOrigins.filter(o => o) 
    });
  }
  
  res.status(err.status || 500).json({ 
    success: false, 
    message: err.message 
  });
});

// TEMPORARY TEST ENDPOINT - Remove after confirming fix
app.post('/api/test/create-school', async (req, res) => {
  try {
    const { School } = require('./src/models');
    
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
      error: error.message,
      stack: error.stack,
      errors: error.errors
    });
  }
});

module.exports = app;

