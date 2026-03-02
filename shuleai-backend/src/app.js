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
const uploadRoutes = require('./routes/uploadRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const parentRoutes = require('./routes/parentRoutes');
const studentRoutes = require('./routes/studentRoutes');

const app = express();

// Trust proxy (required for rate limiter on Render)
app.set('trust proxy', 1);

// Security with proper CSP for Chart.js
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'", 
                "'unsafe-eval'", 
                "'unsafe-inline'", 
                "https://cdn.jsdelivr.net",
                "https://cdnjs.cloudflare.com",
                "https://ui-avatars.com"
            ],
            styleSrc: [
                "'self'", 
                "'unsafe-inline'", 
                "https://cdnjs.cloudflare.com",
                "https://fonts.googleapis.com"
            ],
            fontSrc: [
                "'self'", 
                "https://cdnjs.cloudflare.com",
                "https://fonts.gstatic.com"
            ],
            imgSrc: [
                "'self'", 
                "data:", 
                "https://ui-avatars.com",
                "https://cdnjs.cloudflare.com"
            ],
            connectSrc: [
                "'self'", 
                "https://shuleaibackend-32h1.onrender.com", 
                "https://shuleai.live",
                "http://localhost:3000"
            ],
        },
    },
}));

// Debug: Log environment variables
console.log('=== CORS DEBUG ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('FRONTEND_URL from env:', process.env.FRONTEND_URL);
console.log('==================');

// Define allowed origins explicitly
const allowedOrigins = [
    'http://localhost:3000',
    'https://shuleai.live',
    'https://www.shuleai.live',
    process.env.FRONTEND_URL
].filter(Boolean);

console.log('Allowed origins:', allowedOrigins);

// CORS configuration with proper preflight handling
app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps, curl)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
}));

// Additional CORS headers middleware
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Rate limiting
const limiter = rateLimit({ 
    windowMs: 15 * 60 * 1000, 
    max: 100,
    keyGenerator: (req) => {
        return req.ip || req.connection.remoteAddress;
    }
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
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', 
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    }
}));

// Static uploads
const uploadDir = path.join(__dirname, '../uploads');
require('fs').existsSync(uploadDir) || require('fs').mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// Test endpoint to check CORS
app.get('/cors-test', (req, res) => {
    res.json({
        message: 'CORS is working!',
        yourOrigin: req.headers.origin,
        allowedOrigins: allowedOrigins,
        env: {
            frontend_url: process.env.FRONTEND_URL,
            node_env: process.env.NODE_ENV
        }
    });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/duty', dutyRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/public', publicRoutes);

app.get('/health', (req, res) => {
    res.json({ success: true, timestamp: new Date().toISOString() });
});

// 404
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

// Error handler
app.use((err, req, res, next) => {
    console.error('Error stack:', err.stack);
    res.status(err.status || 500).json({ 
        success: false, 
        message: err.message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

module.exports = app;
