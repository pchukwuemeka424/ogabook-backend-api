# OgaBook Admin Panel

A comprehensive admin panel for managing your Supabase database with Node.js and Express.

## Features

- 🔐 Secure admin authentication with JWT
- 📊 View all database tables
- 🔍 Browse and search table data
- ✏️ Create, update, and delete records
- 📋 View table structures and schemas
- 🔧 Execute custom SQL queries (with safety checks)
- 💳 Flutterwave payment integration
- 🗑️ Account deletion functionality
- 📱 Subscription management

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory:
```env
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Database Connection (PostgreSQL)
DATABASE_URL=postgresql://postgres:your_password@db.your-project.supabase.co:5432/postgres

# JWT Secret for Admin Authentication
JWT_SECRET=your_jwt_secret_key_change_this_in_production

# Admin Credentials (for initial setup)
ADMIN_EMAIL=your_admin_email@example.com
ADMIN_PASSWORD=your_secure_password

# Server Configuration
PORT=3000
NODE_ENV=development

# Flutterwave Payment Configuration
FLUTTERWAVE_PUBLIC_KEY=your_flutterwave_public_key
FLUTTERWAVE_SECRET_KEY=your_flutterwave_secret_key
FLUTTERWAVE_ENCRYPTION_KEY=your_flutterwave_encryption_key
```

3. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

### Authentication

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "your_admin_email@example.com",
  "password": "your_password"
}
```

Response:
```json
{
  "success": true,
  "message": "Login successful",
  "token": "jwt_token_here",
  "admin": {
    "id": 1,
    "email": "your_admin_email@example.com"
  }
}
```

#### Verify Token
```http
GET /api/auth/verify
Authorization: Bearer <token>
```

#### Delete Account
```http
POST /api/auth/delete-account
Content-Type: application/json

{
  "email": "user@example.com"
}
```

### Database Management

All database endpoints require authentication. Include the token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

#### Get All Tables
```http
GET /api/database/tables
```

#### Get Table Structure
```http
GET /api/database/tables/:tableName/structure
```

#### Get Table Data (with pagination)
```http
GET /api/database/tables/:tableName/data?page=1&limit=100&search=term&searchColumn=column_name
```

#### Get Single Record
```http
GET /api/database/tables/:tableName/data/:id
```

#### Create Record
```http
POST /api/database/tables/:tableName/data
Content-Type: application/json

{
  "column1": "value1",
  "column2": "value2"
}
```

#### Update Record
```http
PUT /api/database/tables/:tableName/data/:id
Content-Type: application/json

{
  "column1": "new_value1",
  "column2": "new_value2"
}
```

#### Delete Record
```http
DELETE /api/database/tables/:tableName/data/:id
```

#### Execute Custom Query
```http
POST /api/database/query
Content-Type: application/json

{
  "query": "SELECT * FROM users LIMIT 10"
}
```

**Note:** Dangerous operations (DROP, TRUNCATE, DELETE FROM, ALTER TABLE, etc.) are blocked for security.

### Payment

#### Initialize Payment
```http
POST /api/payment/initialize
Content-Type: application/json

{
  "userId": "user-id",
  "userEmail": "user@example.com",
  "userPhone": "+1234567890",
  "package": "basic",
  "billingCycle": "monthly",
  "amount": "200",
  "status": "pending"
}
```

#### Verify Payment
```http
POST /api/payment/verify
Content-Type: application/json

{
  "txRef": "transaction-reference"
}
```

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- SQL injection prevention through parameterized queries
- Table name validation
- Restricted dangerous SQL operations
- Service role key for admin operations
- Environment variable protection

## Admin Login

The admin login uses the `users` table in your database. You must have a user account in the `users` table with:
- A valid `email` address
- A `password_hash` field (bcrypt hashed password)
- `is_active` set to `true`

To create or update an admin user in the `users` table, you can:
1. Use the setup script: `npm run setup-admin` (creates admin user with credentials from .env)
2. Manually create a user through the admin panel
3. Insert directly into the database

**Note:** The login authenticates against the `users` table, not a separate admin table.

## Project Structure

```
ogabookadmin/
├── assets/
│   └── logo.png              # Application logo
├── config/
│   └── supabase.js           # Supabase and PostgreSQL configuration
├── middleware/
│   └── auth.js               # Authentication middleware
├── routes/
│   ├── auth.js               # Authentication routes
│   ├── database.js           # Database management routes
│   ├── payment.js            # Payment routes (Flutterwave)
│   └── web.js                # Web page routes
├── views/
│   ├── account-deleted.ejs   # Account deletion success page
│   ├── delete-account.ejs    # Account deletion page
│   ├── payment-*.ejs         # Payment pages (success, failed, cancelled)
│   ├── subscription.ejs      # Subscription checkout page
│   └── ...                   # Other view files
├── scripts/
│   ├── check-tables.js       # Database table checker
│   └── setup-admin-user.js   # Admin user setup script
├── server.js                 # Express server setup
├── package.json
├── .env                      # Environment variables (create this)
└── README.md
```

## Usage Examples

### Using cURL

1. Login:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your_admin_email@example.com","password":"your_password"}'
```

2. Get all tables:
```bash
curl -X GET http://localhost:3000/api/database/tables \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

3. Get table data:
```bash
curl -X GET "http://localhost:3000/api/database/tables/users/data?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Using JavaScript/Fetch

```javascript
// Login
const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'your_admin_email@example.com',
    password: 'your_password'
  })
});

const { token } = await loginResponse.json();

// Get tables
const tablesResponse = await fetch('http://localhost:3000/api/database/tables', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const tables = await tablesResponse.json();
```

## Web Pages

- `/login` - Admin login page
- `/dashboard` - Admin dashboard
- `/delete-account` - Public account deletion page
- `/account-deleted` - Account deletion success page
- `/` - Subscription checkout page (with query parameters: userId, package, billingCycle, amount, status)
- `/payment/success` - Payment success page
- `/payment/failed` - Payment failed page
- `/payment/cancelled` - Payment cancelled page

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | Secret key for JWT tokens | Yes |
| `ADMIN_EMAIL` | Default admin email | No |
| `ADMIN_PASSWORD` | Default admin password | No |
| `PORT` | Server port | No (default: 3000) |
| `NODE_ENV` | Environment (development/production) | No |
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes |
| `FLUTTERWAVE_PUBLIC_KEY` | Flutterwave public key | Yes (for payments) |
| `FLUTTERWAVE_SECRET_KEY` | Flutterwave secret key | Yes (for payments) |
| `FLUTTERWAVE_ENCRYPTION_KEY` | Flutterwave encryption key | Yes (for payments) |

## Scripts

- `npm start` - Start the server
- `npm run dev` - Start server with auto-reload (nodemon)
- `npm run setup-admin` - Create/update admin user in database
- `npm run check-tables` - Check database tables

## Vercel Deployment

### Setting Environment Variables

1. Go to your Vercel project dashboard
2. Navigate to **Settings** > **Environment Variables**
3. Add the following required variables:

   - `DATABASE_URL` - Get this from Supabase Dashboard > Settings > Database > Connection string (URI mode)
     - Format: `postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres`
     - **Important**: Use the connection string from Supabase, not the hardcoded fallback
   
   - `JWT_SECRET` - A secure random string for JWT token signing
   
   - `SUPABASE_URL` - Your Supabase project URL
   
   - `SUPABASE_ANON_KEY` - Your Supabase anonymous key
   
   - `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key

4. After adding variables, redeploy your application

### Getting Your Database Connection String

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Settings** > **Database**
4. Scroll to **Connection string** section
5. Select **URI** mode
6. Copy the connection string (it includes your password)
7. Paste it as the `DATABASE_URL` value in Vercel

**Note**: If you see `ENOTFOUND` errors, it means `DATABASE_URL` is not set correctly in Vercel.

## Notes

- Admin authentication uses the `users` table in your database
- Run `npm run setup-admin` to create/update the admin user if needed
- All database operations use parameterized queries to prevent SQL injection
- The system validates table names before executing queries
- Custom SQL queries are restricted to prevent dangerous operations
- Never commit `.env` file to version control
- Keep all API keys and secrets secure
- Flutterwave payment integration requires valid API keys
- **For Vercel**: Always set `DATABASE_URL` environment variable - the hardcoded fallback may not work

## License

ISC
