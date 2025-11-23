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
  console.error('⚠️  WARNING: DATABASE_URL environment variable is not set!');
  console.error('   Please set DATABASE_URL in your Vercel project settings.');
  console.error('   For Vercel: Use Connection Pooler URL from Supabase Dashboard > Settings > Database > Connection Pooling');
} else if (databaseUrl.includes('db.') && databaseUrl.includes('.supabase.co:5432')) {
  console.warn('⚠️  WARNING: You are using a direct connection URL. For Vercel/serverless, use Connection Pooler URL instead!');
  console.warn('   Direct URLs often cause ENOTFOUND errors on serverless platforms.');
  console.warn('   Get the pooler URL from: Supabase Dashboard > Settings > Database > Connection Pooling');
}

const pool = new Pool({
  connectionString: databaseUrl || 'postgresql://postgres:Iz98HAD7jElqdiRk@db.ldtayamrxisvypqzvldo.supabase.co:5432/postgres',
  ssl: {
    rejectUnauthorized: false
  }
});

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
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

