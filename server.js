const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Set NODE_ENV to development if not set (for better error messages)
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

const authRoutes = require('./routes/auth');
const databaseRoutes = require('./routes/database');
const webRoutes = require('./routes/web');
const paymentRoutes = require('./routes/payment');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/database', databaseRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/payment', paymentRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'OgaBook Admin API',
    version: '1.0.0',
    endpoints: {
      auth: {
        login: 'POST /api/auth/login',
        verify: 'GET /api/auth/verify'
      },
      database: {
        tables: 'GET /api/database/tables',
        tableStructure: 'GET /api/database/tables/:tableName/structure',
        tableData: 'GET /api/database/tables/:tableName/data',
        getRecord: 'GET /api/database/tables/:tableName/data/:id',
        createRecord: 'POST /api/database/tables/:tableName/data',
        updateRecord: 'PUT /api/database/tables/:tableName/data/:id',
        deleteRecord: 'DELETE /api/database/tables/:tableName/data/:id',
        customQuery: 'POST /api/database/query'
      }
    }
  });
});

// Web Routes (must be after API routes)
app.use('/', webRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 404 handler
app.use((req, res) => {
  // If it's an API request, return JSON
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      success: false,
      message: 'Route not found'
    });
  }
  // Otherwise, redirect to login for web requests
  res.redirect('/login');
});

// Start server (only if not in Vercel serverless environment)
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}`);
    console.log(`🔐 Admin login: POST http://localhost:${PORT}/api/auth/login`);
  });
}

module.exports = app;

