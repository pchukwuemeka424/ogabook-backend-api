const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/supabase');

// Admin Login - Uses users table
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user in users table by email
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

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
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is active
    if (user.is_active === false) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        username: user.username,
        role: user.role || 'admin'
      },
      process.env.JWT_SECRET || 'your_jwt_secret_key_change_this_in_production',
      { expiresIn: '24h' }
    );

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
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
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

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Try to fetch user email - handle both UUID and string ID formats
    let userResult;
    try {
      // First try with the userId as-is (could be UUID or string)
      userResult = await pool.query(
        'SELECT email, phone FROM users WHERE id = $1',
        [userId]
      );
    } catch (idError) {
      // If that fails, try casting to text (for UUID compatibility)
      console.log('First query attempt failed, trying text cast:', idError.message);
      try {
        userResult = await pool.query(
          'SELECT email, phone FROM users WHERE id::text = $1',
          [userId]
        );
      } catch (textError) {
        console.error('Error fetching user email:', textError);
        return res.status(500).json({
          success: false,
          message: 'Error fetching user details',
          error: textError.message
        });
      }
    }

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];
    res.json({
      success: true,
      email: user.email || null,
      phone: user.phone || null
    });
  } catch (error) {
    console.error('Error fetching user email:', error);
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

