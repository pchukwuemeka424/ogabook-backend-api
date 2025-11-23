const express = require('express');
const router = express.Router();
const { pool } = require('../config/supabase');
const { authenticateAdmin } = require('../middleware/auth');

// Get all tables in the database
router.get('/tables', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        table_name,
        table_schema
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    res.json({
      success: true,
      tables: result.rows
    });
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tables',
      error: error.message
    });
  }
});

// Get table structure (columns, types, constraints)
router.get('/tables/:tableName/structure', authenticateAdmin, async (req, res) => {
  try {
    const { tableName } = req.params;

    const result = await pool.query(`
      SELECT 
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default,
        ordinal_position
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = $1
      ORDER BY ordinal_position;
    `, [tableName]);

    // Get primary keys
    const primaryKeys = await pool.query(`
      SELECT 
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = $1
        AND tc.constraint_type = 'PRIMARY KEY';
    `, [tableName]);

    res.json({
      success: true,
      structure: {
        columns: result.rows,
        primaryKeys: primaryKeys.rows.map(row => row.column_name)
      }
    });
  } catch (error) {
    console.error('Error fetching table structure:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching table structure',
      error: error.message
    });
  }
});

// Get all rows from a table (with pagination)
router.get('/tables/:tableName/data', authenticateAdmin, async (req, res) => {
  try {
    const { tableName } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const searchColumn = req.query.searchColumn || '';

    console.log(`Fetching data from table: ${tableName}, page: ${page}, limit: ${limit}`);

    // Validate table name to prevent SQL injection
    const tableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1;
    `, [tableName]);

    if (tableCheck.rows.length === 0) {
      console.error(`Table not found: ${tableName}`);
      return res.status(404).json({
        success: false,
        message: `Table "${tableName}" not found`
      });
    }

    // Get primary key or id column for ordering
    const primaryKeyResult = await pool.query(`
      SELECT 
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
        AND tc.table_name = kcu.table_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = $1
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position
      LIMIT 1;
    `, [tableName]);

    // Check if id or created_at column exists for ordering
    const columnsResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = $1
      AND column_name IN ('id', 'created_at')
      ORDER BY CASE column_name 
        WHEN 'created_at' THEN 1
        WHEN 'id' THEN 2
        ELSE 3
      END
      LIMIT 1;
    `, [tableName]);

    let orderColumn = 'id';
    if (primaryKeyResult.rows.length > 0) {
      orderColumn = primaryKeyResult.rows[0].column_name;
    } else if (columnsResult.rows.length > 0) {
      orderColumn = columnsResult.rows[0].column_name;
    }

    let query = `SELECT * FROM "${tableName}"`;
    let countQuery = `SELECT COUNT(*) FROM "${tableName}"`;
    const queryParams = [];

    // Add search filter if provided
    if (search && searchColumn) {
      query += ` WHERE "${searchColumn}"::text ILIKE $1`;
      countQuery += ` WHERE "${searchColumn}"::text ILIKE $1`;
      queryParams.push(`%${search}%`);
    }

    // Add ordering and pagination
    const paramOffset = queryParams.length;
    query += ` ORDER BY "${orderColumn}" DESC LIMIT $${paramOffset + 1} OFFSET $${paramOffset + 2}`;
    queryParams.push(limit, offset);

    // Execute queries
    console.log(`Executing query: ${query}`);
    console.log(`Query params:`, queryParams);
    const dataResult = await pool.query(query, queryParams);
    console.log(`Query returned ${dataResult.rows.length} rows`);
    
    // Get count - use same search params if provided
    const countParams = search && searchColumn ? [queryParams[0]] : [];
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    console.log(`Total records: ${total}`);

    res.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total: total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching table data:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error fetching table data',
      error: error.message
    });
  }
});

// Get a single row by ID
router.get('/tables/:tableName/data/:id', authenticateAdmin, async (req, res) => {
  try {
    const { tableName, id } = req.params;

    // Get primary key column
    const primaryKeyResult = await pool.query(`
      SELECT 
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = $1
        AND tc.constraint_type = 'PRIMARY KEY'
      LIMIT 1;
    `, [tableName]);

    if (primaryKeyResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Table does not have a primary key'
      });
    }

    const primaryKey = primaryKeyResult.rows[0].column_name;
    const result = await pool.query(
      `SELECT * FROM "${tableName}" WHERE "${primaryKey}" = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching record:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching record',
      error: error.message
    });
  }
});

// Create a new row
router.post('/tables/:tableName/data', authenticateAdmin, async (req, res) => {
  try {
    const { tableName } = req.params;
    const data = req.body;

    // Get table columns
    const columnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = $1;
    `, [tableName]);

    if (columnsResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    const columns = columnsResult.rows.map(row => row.column_name);
    const providedColumns = Object.keys(data).filter(key => columns.includes(key));
    
    if (providedColumns.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid columns provided'
      });
    }

    const columnNames = providedColumns.map(col => `"${col}"`).join(', ');
    const placeholders = providedColumns.map((_, index) => `$${index + 1}`).join(', ');
    const values = providedColumns.map(col => data[col]);

    const result = await pool.query(
      `INSERT INTO "${tableName}" (${columnNames}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    res.status(201).json({
      success: true,
      message: 'Record created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating record:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating record',
      error: error.message
    });
  }
});

// Update a row
router.put('/tables/:tableName/data/:id', authenticateAdmin, async (req, res) => {
  try {
    const { tableName, id } = req.params;
    const data = req.body;

    // Get primary key column
    const primaryKeyResult = await pool.query(`
      SELECT 
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = $1
        AND tc.constraint_type = 'PRIMARY KEY'
      LIMIT 1;
    `, [tableName]);

    if (primaryKeyResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Table does not have a primary key'
      });
    }

    const primaryKey = primaryKeyResult.rows[0].column_name;

    // Get table columns
    const columnsResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = $1;
    `, [tableName]);

    const columns = columnsResult.rows.map(row => row.column_name);
    const providedColumns = Object.keys(data).filter(key => 
      columns.includes(key) && key !== primaryKey
    );

    if (providedColumns.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid columns to update'
      });
    }

    const setClause = providedColumns.map((col, index) => `"${col}" = $${index + 1}`).join(', ');
    const values = providedColumns.map(col => data[col]);
    values.push(id);

    const result = await pool.query(
      `UPDATE "${tableName}" SET ${setClause} WHERE "${primaryKey}" = $${values.length} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    res.json({
      success: true,
      message: 'Record updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating record:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating record',
      error: error.message
    });
  }
});

// Delete a row
router.delete('/tables/:tableName/data/:id', authenticateAdmin, async (req, res) => {
  try {
    const { tableName, id } = req.params;

    // Get primary key column
    const primaryKeyResult = await pool.query(`
      SELECT 
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = $1
        AND tc.constraint_type = 'PRIMARY KEY'
      LIMIT 1;
    `, [tableName]);

    if (primaryKeyResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Table does not have a primary key'
      });
    }

    const primaryKey = primaryKeyResult.rows[0].column_name;
    const result = await pool.query(
      `DELETE FROM "${tableName}" WHERE "${primaryKey}" = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    res.json({
      success: true,
      message: 'Record deleted successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting record:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting record',
      error: error.message
    });
  }
});

// Execute custom SQL query (use with caution)
router.post('/query', authenticateAdmin, async (req, res) => {
  try {
    const { query: sqlQuery } = req.body;

    if (!sqlQuery) {
      return res.status(400).json({
        success: false,
        message: 'SQL query is required'
      });
    }

    // Basic safety check - prevent dangerous operations
    const dangerousKeywords = ['DROP', 'TRUNCATE', 'DELETE FROM', 'ALTER TABLE', 'CREATE TABLE', 'DROP TABLE'];
    const upperQuery = sqlQuery.toUpperCase();
    
    if (dangerousKeywords.some(keyword => upperQuery.includes(keyword))) {
      return res.status(403).json({
        success: false,
        message: 'This operation is not allowed for security reasons'
      });
    }

    const result = await pool.query(sqlQuery);

    res.json({
      success: true,
      data: result.rows,
      rowCount: result.rowCount
    });
  } catch (error) {
    console.error('Error executing query:', error);
    res.status(500).json({
      success: false,
      message: 'Error executing query',
      error: error.message
    });
  }
});

// Get app_settings (or create default if doesn't exist)
router.get('/app-setting', authenticateAdmin, async (req, res) => {
  try {
    // Check if app_settings table exists
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'app_settings'
      );
    `);

    if (!checkTable.rows[0].exists) {
      // Table doesn't exist, return default
      return res.json({
        success: true,
        data: {
          subscription_enabled: 'true'
        }
      });
    }

    // Get subscription_visible setting by key (using existing key from database)
    const result = await pool.query(
      `SELECT key, value FROM app_settings WHERE key = $1`,
      ['subscription_visible']
    );

    if (result.rows.length === 0) {
      // No record exists, return default
      return res.json({
        success: true,
        data: {
          subscription_enabled: 'true'
        }
      });
    }

    // Extract value from JSONB and convert to lowercase string
    const settingValue = result.rows[0].value;
    let subscriptionValue = 'true';
    
    if (typeof settingValue === 'string') {
      subscriptionValue = settingValue.toLowerCase();
    } else if (typeof settingValue === 'boolean') {
      subscriptionValue = settingValue ? 'true' : 'false';
    } else if (settingValue !== null && settingValue !== undefined) {
      subscriptionValue = String(settingValue).toLowerCase();
    }

    res.json({
      success: true,
      data: {
        subscription_enabled: subscriptionValue
      }
    });
  } catch (error) {
    console.error('Error fetching app_settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching app_settings',
      error: error.message
    });
  }
});

// Update app_settings (only update, do not insert)
router.put('/app-setting', authenticateAdmin, async (req, res) => {
  try {
    const { subscription_enabled } = req.body;

    // Convert input to boolean value: true or false
    // Toggle: if toggle is checked -> true, unchecked -> false
    const subscriptionValue = String(subscription_enabled).toLowerCase() === 'true';

    // Check if app_settings table exists
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'app_settings'
      );
    `);

    if (!checkTable.rows[0].exists) {
      return res.status(500).json({
        success: false,
        message: 'app_settings table does not exist',
        error: 'Table not found'
      });
    }

    // Update existing record only (update value column only)
    // Using 'subscription_visible' key which exists in the database
    // Store value as JSONB boolean: true or false (without quotes)
    const result = await pool.query(
      `UPDATE app_settings 
       SET value = $1::jsonb 
       WHERE key = $2
       RETURNING *`,
      [subscriptionValue, 'subscription_visible']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Setting not found. Please create the subscription_visible setting first.',
        error: 'Record not found'
      });
    }

    return res.json({
      success: true,
      message: 'App settings updated successfully',
      data: {
        subscription_enabled: subscriptionValue
      }
    });
  } catch (error) {
    console.error('Error updating app_settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating app_settings',
      error: error.message
    });
  }
});

// Get all notification templates
router.get('/notification-templates', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, title, message, category, is_active, created_at
      FROM notification_templates
      WHERE is_active = true
      ORDER BY name;
    `);

    res.json({
      success: true,
      templates: result.rows
    });
  } catch (error) {
    console.error('Error fetching notification templates:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notification templates',
      error: error.message
    });
  }
});

// Get manager categories (business types)
router.get('/managers/categories', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        business_type as category,
        COUNT(*) as count
      FROM users
      WHERE role = 'manager' 
        AND business_type IS NOT NULL 
        AND business_type != ''
      GROUP BY business_type
      ORDER BY business_type;
    `);

    res.json({
      success: true,
      categories: result.rows
    });
  } catch (error) {
    console.error('Error fetching manager categories:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching manager categories',
      error: error.message
    });
  }
});

// Get a single notification template by ID
router.get('/notification-templates/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT id, name, title, message, category, is_active
      FROM notification_templates
      WHERE id = $1;
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    res.json({
      success: true,
      template: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching notification template:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notification template',
      error: error.message
    });
  }
});

// Send notifications to users
router.post('/notifications/send', authenticateAdmin, async (req, res) => {
  try {
    const { userIds, templateId, title, message, customData } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User IDs are required'
      });
    }

    if (!templateId && !title && !message) {
      return res.status(400).json({
        success: false,
        message: 'Either template ID or title/message is required'
      });
    }

    let finalTitle = title;
    let finalMessage = message;

    // If template is provided, fetch it and use its content
    if (templateId) {
      const templateResult = await pool.query(`
        SELECT title, message FROM notification_templates WHERE id = $1 AND is_active = true;
      `, [templateId]);

      if (templateResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Template not found or inactive'
        });
      }

      const template = templateResult.rows[0];
      finalTitle = finalTitle || template.title;
      finalMessage = finalMessage || template.message;
    }

    if (!finalTitle || !finalMessage) {
      return res.status(400).json({
        success: false,
        message: 'Title and message are required'
      });
    }

    // Get user details for each user ID
    // Handle both UUID and text IDs
    console.log('Sending notifications to user IDs:', userIds);
    console.log('User IDs type:', typeof userIds, Array.isArray(userIds));
    
    // Convert all user IDs to strings to ensure consistency
    const userIdStrings = userIds.map(id => String(id));
    console.log('Converted user IDs:', userIdStrings);

    // Use a more flexible query that handles both UUID and text formats
    let userResults;
    
    try {
      // First try: Use ANY with text array - most compatible
      userResults = await pool.query(`
        SELECT id, username, email, first_name, last_name, phone
        FROM users
        WHERE id::text = ANY($1::text[])
      `, [userIdStrings]);
      console.log(`Text array query found ${userResults.rows.length} users`);
      
      // If no results, try with UUID array
      if (userResults.rows.length === 0 && userIdStrings.length > 0) {
        console.log('Text array query returned 0 results, trying UUID array...');
        try {
          // Try to cast to UUID array
          userResults = await pool.query(`
            SELECT id, username, email, first_name, last_name, phone
            FROM users
            WHERE id = ANY($1::uuid[])
          `, [userIdStrings]);
          console.log(`UUID array query found ${userResults.rows.length} users`);
        } catch (uuidErr) {
          console.log('UUID array query failed, trying individual queries:', uuidErr.message);
          // Fallback: try individual queries
          const userPromises = userIdStrings.map((userId, index) => 
            pool.query(`
              SELECT id, username, email, first_name, last_name, phone
              FROM users
              WHERE id::text = $1
            `, [userId]).catch(err => {
              console.error(`Error querying user ${userId} (index ${index}):`, err.message);
              return { rows: [] };
            })
          );
          const results = await Promise.all(userPromises);
          userResults = {
            rows: results
              .map(r => r.rows && r.rows.length > 0 ? r.rows[0] : null)
              .filter(row => row !== null && row !== undefined)
          };
          console.log(`Individual queries found ${userResults.rows.length} users`);
        }
      }
    } catch (error) {
      console.error('Query error:', error.message);
      console.error('Error stack:', error.stack);
      
      // Final fallback: try individual queries
      console.log('Trying individual queries as final fallback...');
      const userPromises = userIdStrings.map((userId, index) => 
        pool.query(`
          SELECT id, username, email, first_name, last_name, phone
          FROM users
          WHERE id::text = $1
        `, [userId]).catch(err => {
          console.error(`Error querying user ${userId} (index ${index}):`, err.message);
          return { rows: [] };
        })
      );
      const results = await Promise.all(userPromises);
      userResults = {
        rows: results
          .map(r => r.rows && r.rows.length > 0 ? r.rows[0] : null)
          .filter(row => row !== null && row !== undefined)
      };
      console.log(`Final fallback found ${userResults.rows.length} users`);
    }

    console.log(`Final result: Found ${userResults.rows.length} users out of ${userIds.length} requested`);

    if (userResults.rows.length === 0) {
      console.error('No users found. User IDs provided:', userIdStrings);
      // Try to get sample user IDs from database for debugging
      const sampleUsers = await pool.query('SELECT id::text as id, role FROM users WHERE role = \'manager\' LIMIT 3');
      console.error('Sample manager IDs in database:', sampleUsers.rows.map(r => ({ id: r.id, role: r.role })));
      
      return res.status(404).json({
        success: false,
        message: `No users found with the provided IDs. Checked ${userIds.length} IDs.`,
        providedIds: userIdStrings,
        requestedCount: userIds.length,
        debug: {
          sampleManagerIds: sampleUsers.rows.map(r => r.id)
        }
      });
    }

    // Create notifications for each user
    const notifications = [];
    const errors = [];

    for (const user of userResults.rows) {
      try {
        // Replace placeholders in message if needed
        let personalizedMessage = finalMessage;
        personalizedMessage = personalizedMessage.replace(/\{username\}/g, user.username || 'User');
        personalizedMessage = personalizedMessage.replace(/\{first_name\}/g, user.first_name || '');
        personalizedMessage = personalizedMessage.replace(/\{last_name\}/g, user.last_name || '');
        personalizedMessage = personalizedMessage.replace(/\{email\}/g, user.email || '');

        // Insert notification - using account_id as user identifier
        // Note: notifications table requires total, paid_amount, and outstanding_balance
        // For admin notifications, we'll set these to 0
        // Type must be one of: 'outstanding_payment', 'admin_notification', 'system_notification'
        // user_role must be one of: 'manager', 'cashier'
        const notificationResult = await pool.query(`
          INSERT INTO notifications (
            account_id,
            transaction_id,
            receipt_number,
            customer_id,
            customer_name,
            customer_phone,
            admin_title,
            admin_message,
            type,
            user_role,
            total,
            paid_amount,
            outstanding_balance,
            read,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
          RETURNING id;
        `, [
          String(user.id), // account_id
          `notif-${Date.now()}-${user.id}`, // transaction_id (unique identifier)
          `NOTIF-${Date.now()}`, // receipt_number
          String(user.id), // customer_id
          `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'User', // customer_name
          user.phone || '', // customer_phone
          finalTitle, // admin_title
          personalizedMessage, // admin_message
          'admin_notification', // type (must be one of: outstanding_payment, admin_notification, system_notification)
          'manager', // user_role (must be one of: manager, cashier)
          0, // total (required, set to 0 for admin notifications)
          0, // paid_amount (required, set to 0 for admin notifications)
          0, // outstanding_balance (required, set to 0 for admin notifications)
          false // read
        ]);

        notifications.push({
          userId: user.id,
          notificationId: notificationResult.rows[0].id,
          userEmail: user.email,
          userName: user.username
        });
      } catch (error) {
        console.error(`Error creating notification for user ${user.id}:`, error);
        errors.push({
          userId: user.id,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `Notifications sent to ${notifications.length} user(s)`,
      notifications,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error sending notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending notifications',
      error: error.message
    });
  }
});

module.exports = router;

