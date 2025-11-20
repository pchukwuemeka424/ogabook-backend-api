# OgaBook Admin Panel

A comprehensive admin panel for managing your Supabase database with Node.js and Express.

## Features

- 🔐 Secure admin authentication with JWT
- 📊 View all database tables
- 🔍 Browse and search table data
- ✏️ Create, update, and delete records
- 📋 View table structures and schemas
- 🔧 Execute custom SQL queries (with safety checks)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory:
```env
# Supabase Configuration
SUPABASE_URL=https://ldtayamrxisvypqzvldo.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Database Connection (PostgreSQL)
DATABASE_URL=postgresql://postgres:Iz98HAD7jElqdiRk@db.ldtayamrxisvypqzvldo.supabase.co:5432/postgres

# JWT Secret for Admin Authentication
JWT_SECRET=your_jwt_secret_key_change_this_in_production

# Admin Credentials (for initial setup)
ADMIN_EMAIL=admin@ogabook.com
ADMIN_PASSWORD=holiday100@

# Server Configuration
PORT=3000
NODE_ENV=development
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
  "email": "admin@ogabook.com",
  "password": "holiday100@"
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
    "email": "admin@ogabook.com"
  }
}
```

#### Verify Token
```http
GET /api/auth/verify
Authorization: Bearer <token>
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

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- SQL injection prevention through parameterized queries
- Table name validation
- Restricted dangerous SQL operations
- Service role key for admin operations

## Admin Login

The admin login uses the `users` table in your database. You must have a user account in the `users` table with:
- A valid `email` address
- A `password_hash` field (bcrypt hashed password)
- `is_active` set to `true`

To create or update an admin user in the `users` table, you can:
1. Use the setup script: `npm run setup-admin` (creates admin@ogabook.com)
2. Manually create a user through the admin panel
3. Insert directly into the database

**Note:** The login authenticates against the `users` table, not a separate admin table.

## Project Structure

```
ogabookadmin/
├── config/
│   └── supabase.js          # Supabase and PostgreSQL configuration
├── middleware/
│   └── auth.js              # Authentication middleware
├── routes/
│   ├── auth.js              # Authentication routes
│   └── database.js          # Database management routes
├── server.js                # Express server setup
├── package.json
├── .env                     # Environment variables (create this)
└── README.md
```

## Usage Examples

### Using cURL

1. Login:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ogabook.com","password":"holiday100@"}'
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
    email: 'admin@ogabook.com',
    password: 'holiday100@'
  })
});

const { token } = await loginResponse.json();

// Get tables
const tablesResponse = await fetch('http://localhost:3000/api/database/tables', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const tables = await tablesResponse.json();
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | Secret key for JWT tokens | Yes |
| `ADMIN_EMAIL` | Default admin email | No |
| `ADMIN_PASSWORD` | Default admin password | No |
| `PORT` | Server port | No (default: 3000) |
| `SUPABASE_URL` | Supabase project URL | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | No |

## Notes

- Admin authentication uses the `users` table in your database
- Run `npm run setup-admin` to create/update the admin user if needed
- All database operations use parameterized queries to prevent SQL injection
- The system validates table names before executing queries
- Custom SQL queries are restricted to prevent dangerous operations

## License

ISC

