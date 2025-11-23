const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
require('dotenv').config();

// Supabase Client
const supabaseUrl = process.env.SUPABASE_URL || 'https://ldtayamrxisvypqzvldo.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkdGF5YW1yeGlzdnlwcXp2bGRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MzQyNjAsImV4cCI6MjA3OTAxMDI2MH0.HY9EiFX1hnWmLiOQ2rg0M_T6kdDz4YX6uHy7YHHH1zE';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkdGF5YW1yeGlzdnlwcXp2bGRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MzQyNjAsImV4cCI6MjA3OTAxMDI2MH0.HY9EiFX1hnWmLiOQ2rg0M_T6kdDz4YX6uHy7YHHH1zE';

// Create Supabase client with service role key for admin operations
const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// PostgreSQL Pool for direct database access
// IMPORTANT: DATABASE_URL must be set in Vercel environment variables
// For Vercel/Serverless: Use Connection Pooler URL (NOT direct connection)
// Format (Connection Pooler): postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
// Get it from: Supabase Dashboard > Settings > Database > Connection Pooling
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  const errorMsg = '❌ ERROR: DATABASE_URL environment variable is not set!\n' +
    '   For Vercel: Go to Project Settings > Environment Variables\n' +
    '   Add DATABASE_URL with Connection Pooler URL from:\n' +
    '   Supabase Dashboard > Settings > Database > Connection Pooling\n' +
    '   Use Session mode or Transaction mode connection string';
  console.error(errorMsg);
  
  // On Vercel, throw error immediately - don't use fallback
  if (process.env.VERCEL === '1') {
    throw new Error('DATABASE_URL is required in Vercel environment variables. Use Connection Pooler URL.');
  }
} else if (databaseUrl.includes('db.') && databaseUrl.includes('.supabase.co:5432')) {
  const warningMsg = '⚠️  CRITICAL WARNING: You are using a direct connection URL!\n' +
    '   Direct URLs (db.*.supabase.co:5432) cause ENOTFOUND errors on Vercel/serverless.\n' +
    '   You MUST use Connection Pooler URL instead:\n' +
    '   1. Go to Supabase Dashboard > Settings > Database > Connection Pooling\n' +
    '   2. Copy the connection string (Session or Transaction mode)\n' +
    '   3. Update DATABASE_URL in Vercel with the pooler URL\n' +
    '   Pooler URL format: postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres';
  console.error(warningMsg);
  
  // On Vercel, throw error if using direct connection
  if (process.env.VERCEL === '1') {
    throw new Error('Direct connection URL detected. Use Connection Pooler URL for Vercel. See logs for instructions.');
  }
}

// Validate that we have a database URL before creating pool
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required. Please set it in your environment variables.');
}

// Configure pool for serverless environments (Vercel)
const poolConfig = {
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false
  },
  // Always use these settings for better serverless compatibility
  max: 1, // Single connection for serverless
  idleTimeoutMillis: 30000, // 30 seconds
  connectionTimeoutMillis: 10000, // 10 seconds
  // Allow exit on idle for serverless
  allowExitOnIdle: true
};

// Log connection string info (without password)
if (databaseUrl) {
  const urlParts = databaseUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (urlParts) {
    console.log('📊 Database connection info:', {
      user: urlParts[1],
      host: urlParts[3],
      port: urlParts[4],
      database: urlParts[5],
      isPooler: urlParts[3].includes('pooler'),
      environment: process.env.VERCEL === '1' ? 'Vercel' : 'Local'
    });
  }
}

const pool = new Pool(poolConfig);

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client:', {
    message: err.message,
    code: err.code,
    errno: err.errno,
    syscall: err.syscall,
    hostname: err.hostname
  });
});

// Test database connection on startup
async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connection test successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    console.error('   Please check your DATABASE_URL in .env file');
    return false;
  }
}

// Test connection if not in Vercel serverless environment
if (process.env.VERCEL !== '1') {
  testConnection().catch(err => {
    console.error('❌ Failed to test database connection:', err);
  });
}

module.exports = {
  supabase,
  pool,
  testConnection
};

