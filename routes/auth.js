const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, supabase } = require('../config/supabase');

// Admin Login - Uses users table
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Log login attempt (without sensitive data)
    console.log(`[LOGIN] Attempt from: ${req.ip}, Email: ${email ? email.substring(0, 3) + '***' : 'missing'}`);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Normalize email to lowercase for case-insensitive comparison
    const normalizedEmail = email.toLowerCase().trim();

    // Find user in users table by email (case-insensitive)
    let result;
    try {
      // Execute query using pool (automatically handles connection management)
      result = await pool.query(
        'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
        [email.trim()]
      );
    } catch (dbError) {
      console.error('Database query error during login:', dbError);
      console.error('Error details:', {
        message: dbError.message,
        code: dbError.code,
        detail: dbError.detail,
        hint: dbError.hint,
        stack: dbError.stack
      });
      
      // Check if it's a DNS/hostname resolution error (ENOTFOUND)
      if (dbError.code === 'ENOTFOUND' || dbError.errno === -3007) {
        return res.status(500).json({
          success: false,
          message: 'Database connection failed: Cannot resolve database hostname',
          error: process.env.NODE_ENV === 'development' ? dbError.message : 'Database hostname not found',
          hint: 'Please check your DATABASE_URL environment variable in Vercel. The database hostname may be incorrect or the DATABASE_URL may not be set.'
        });
      }
      
      // Check if it's a connection error
      if (dbError.code === 'ECONNREFUSED' || dbError.code === 'ETIMEDOUT' || dbError.message.includes('connection')) {
        return res.status(500).json({
          success: false,
          message: 'Database connection failed. Please check your database configuration.',
          error: process.env.NODE_ENV === 'development' ? dbError.message : 'Connection error',
          hint: 'Verify your DATABASE_URL environment variable is set correctly in Vercel.'
        });
      }
      
      // Check if table doesn't exist
      if (dbError.message.includes('does not exist') || dbError.code === '42P01') {
        return res.status(500).json({
          success: false,
          message: 'Database table not found. Please ensure the users table exists.',
          error: process.env.NODE_ENV === 'development' ? dbError.message : 'Table not found'
        });
      }
      
      // Return detailed error (show in production for debugging)
      const errorResponse = {
        success: false,
        message: 'Database query failed',
        error: dbError.message,
        code: dbError.code || 'UNKNOWN',
        hint: dbError.code === 'ENOTFOUND' 
          ? 'Use Connection Pooler URL from Supabase Dashboard > Settings > Database > Connection Pooling'
          : dbError.code === '28P01' || dbError.message.includes('password')
          ? 'Database authentication failed. Check your DATABASE_URL password in Vercel.'
          : dbError.code === '3D000' || dbError.message.includes('database')
          ? 'Database does not exist. Check your DATABASE_URL connection string.'
          : dbError.hint || 'Check your DATABASE_URL environment variable in Vercel',
        details: {
          code: dbError.code,
          detail: dbError.detail,
          hint: dbError.hint,
          errno: dbError.errno,
          syscall: dbError.syscall,
          hostname: dbError.hostname
        }
      };
      
      // Log full error for debugging
      console.error('[DB ERROR] Full error object:', JSON.stringify(errorResponse, null, 2));
      
      return res.status(500).json(errorResponse);
    }

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const user = result.rows[0];

    // Check if user has password_hash
    if (!user.password_hash) {
      return res.status(401).json({
        success: false,
        message: 'User account not properly configured'
      });
    }

    // Verify password
    let isValidPassword;
    try {
      isValidPassword = await bcrypt.compare(password, user.password_hash);
    } catch (bcryptError) {
      console.error('Bcrypt error during password verification:', bcryptError);
      return res.status(500).json({
        success: false,
        message: 'Error verifying password',
        error: process.env.NODE_ENV === 'development' ? bcryptError.message : 'Password verification failed'
      });
    }

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is active (handle both boolean and null cases)
    if (user.is_active === false) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive'
      });
    }

    // Generate JWT token
    let token;
    try {
      token = jwt.sign(
        { 
          id: user.id, 
          email: user.email,
          username: user.username,
          role: user.role || 'admin'
        },
        process.env.JWT_SECRET || 'your_jwt_secret_key_change_this_in_production',
        { expiresIn: '24h' }
      );
    } catch (jwtError) {
      console.error('JWT signing error:', jwtError);
      return res.status(500).json({
        success: false,
        message: 'Error generating authentication token',
        error: process.env.NODE_ENV === 'development' ? jwtError.message : 'Token generation failed'
      });
    }

    res.json({
      success: true,
      message: 'Login successful',
      token,
      admin: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('[LOGIN ERROR]', {
      message: error.message,
      name: error.name,
      code: error.code,
      stack: error.stack?.split('\n').slice(0, 5).join('\n') // First 5 lines of stack
    });
    
    // Return detailed error information (show in production for debugging)
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message,
      code: error.code,
      name: error.name,
      hint: error.code === 'ENOTFOUND' 
        ? 'Database connection failed. Use Connection Pooler URL from Supabase Dashboard > Settings > Database > Connection Pooling'
        : 'Check Vercel logs for more details'
    });
  }
});

// Verify Token
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1] || req.headers['x-auth-token'];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'your_jwt_secret_key_change_this_in_production'
    );

    res.json({
      success: true,
      admin: decoded
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

// Get User Email by ID (Public endpoint - no auth required, for subscription page)
router.get('/user/email/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`[API] GET /api/auth/user/email/:userId - userId: ${userId}`);

    if (!userId) {
      console.log('[API] User ID is missing');
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Try to fetch user email - handle both UUID and string ID formats
    let userResult;
    let queryAttempt = 1;
    let useSupabaseFallback = false;
    
    try {
      // First try with the userId as-is (could be UUID or string)
      console.log(`[API] Attempt ${queryAttempt}: Querying with id = $1`);
      userResult = await pool.query(
        'SELECT email, phone FROM users WHERE id = $1',
        [userId]
      );
      console.log(`[API] Query ${queryAttempt} returned ${userResult.rows.length} rows`);
    } catch (idError) {
      // If that fails, try casting to text (for UUID compatibility)
      console.log(`[API] Query ${queryAttempt} failed:`, idError.message);
      queryAttempt = 2;
      try {
        console.log(`[API] Attempt ${queryAttempt}: Querying with id::text = $1`);
        userResult = await pool.query(
          'SELECT email, phone FROM users WHERE id::text = $1',
          [userId]
        );
        console.log(`[API] Query ${queryAttempt} returned ${userResult.rows.length} rows`);
      } catch (textError) {
        console.error(`[API] Query ${queryAttempt} also failed:`, textError.message);
        console.error('[API] Error stack:', textError.stack);
        console.log('[API] Attempting Supabase client fallback...');
        useSupabaseFallback = true;
      }
    }

    // If pool query failed, try Supabase client as fallback
    if (useSupabaseFallback) {
      try {
        console.log('[API] Using Supabase client to fetch user...');
        const { data, error } = await supabase
          .from('users')
          .select('email, phone')
          .eq('id', userId)
          .single();
        
        if (error) {
          console.error('[API] Supabase client error:', error);
          return res.status(500).json({
            success: false,
            message: 'Error fetching user details',
            error: error.message
          });
        }
        
        if (!data) {
          console.log(`[API] No user found with Supabase client for userId: ${userId}`);
          return res.status(404).json({
            success: false,
            message: 'User not found'
          });
        }
        
        console.log(`[API] User found via Supabase - email: ${data.email ? 'present' : 'missing'}, phone: ${data.phone ? 'present' : 'missing'}`);
        return res.json({
          success: true,
          email: data.email || null,
          phone: data.phone || null
        });
      } catch (supabaseError) {
        console.error('[API] Supabase fallback also failed:', supabaseError);
        return res.status(500).json({
          success: false,
          message: 'Error fetching user details',
          error: supabaseError.message
        });
      }
    }

    if (userResult.rows.length === 0) {
      console.log(`[API] No user found with userId: ${userId}`);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];
    console.log(`[API] User found - email: ${user.email ? 'present' : 'missing'}, phone: ${user.phone ? 'present' : 'missing'}`);
    
    res.json({
      success: true,
      email: user.email || null,
      phone: user.phone || null
    });
  } catch (error) {
    console.error('[API] Unexpected error fetching user email:', error);
    console.error('[API] Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user email',
      error: error.message
    });
  }
});

// Delete Account by Email (Public endpoint - no auth required)
router.post('/delete-account', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Find user by email - check if user exists
    const userResult = await pool.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    // Check if user exists before attempting deletion
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address. Please check your email and try again.'
      });
    }

    const userId = userResult.rows[0].id;

    // Delete user account
    const deleteResult = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id, email',
      [userId]
    );

    if (deleteResult.rows.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete account. Please try again later.'
      });
    }

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during account deletion',
      error: error.message
    });
  }
});

module.exports = router;

