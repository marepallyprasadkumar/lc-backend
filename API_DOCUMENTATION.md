# CodeArena Backend API Documentation

## Table of Contents
1. [Setup Instructions](#setup-instructions)
2. [API Endpoints](#api-endpoints)
3. [Database Schema](#database-schema)
4. [Authentication](#authentication)
5. [Error Handling](#error-handling)
6. [Testing](#testing)

---

## Setup Instructions

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0
- Supabase account and project

### Installation

1. **Clone the repository**
```bash
git clone <repo-url>
cd backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Setup Supabase Database**
   - Go to Supabase SQL Editor
   - Create a new query and copy the contents of `01_create_tables.sql`
   - Execute the query to create all tables

4. **Configure environment variables**
```bash
cp .env.example .env
```
Update `.env` with your Supabase credentials:
```
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
JWT_SECRET=your_jwt_secret
```

5. **Start the server**
```bash
# Development
npm run dev

# Production
npm start
```

The server will start on http://localhost:5000

---

## API Endpoints

### Authentication (`/api/auth`)

#### POST /register
Create a new user account
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "password123",
  "confirmPassword": "password123"
}
```
Response:
```json
{
  "message": "User registered successfully",
  "token": "jwt_token",
  "user": {
    "id": 1,
    "username": "john_doe",
    "email": "john@example.com"
  }
}
```

#### POST /login
Login to existing account
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

#### GET /me (Protected)
Get current user profile
Headers: `Authorization: Bearer <token>`

#### PUT /profile (Protected)
Update user profile
```json
{
  "bio": "Software Engineer",
  "profile_picture_url": "https://example.com/pic.jpg"
}
```

#### POST /logout (Protected)
Logout current user

---

### Problems (`/api/problems`)

#### GET /
Get all problems with filtering
Query parameters:
- `difficulty` - Easy, Medium, Hard
- `category` - Problem category
- `search` - Search by title
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)
- `sortBy` - id, difficulty, acceptance, recent

Example: `/api/problems?difficulty=Medium&page=1&limit=20`

Response:
```json
{
  "data": [
    {
      "id": 1,
      "title": "Two Sum",
      "slug": "two-sum",
      "difficulty": "Easy",
      "acceptance_rate": 45.5,
      "submissions_count": 1000,
      "category": "Array",
      "tags": ["array", "hash-table"]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

#### GET /slug/:slug
Get problem by slug
Example: `/api/problems/slug/two-sum`

Response includes:
- Problem details
- User progress (if authenticated)
- Submission history

#### GET /stats
Get problem statistics
```json
{
  "totalProblems": 100,
  "byDifficulty": [
    {"difficulty": "Easy", "count": 40},
    {"difficulty": "Medium", "count": 35},
    {"difficulty": "Hard", "count": 25}
  ]
}
```

#### POST / (Protected, Admin)
Create new problem
```json
{
  "title": "Two Sum",
  "description": "Find two numbers that add up to target",
  "difficulty": "Easy",
  "category": "Array",
  "tags": ["array", "hash-table"],
  "examples": [...],
  "constraints": "..."
}
```

#### PUT /:id (Protected, Admin)
Update problem

#### DELETE /:id (Protected, Admin)
Delete problem

---

### Code Execution (`/api/code`)

#### POST /run
Run code without saving
```json
{
  "code": "print('Hello, World!')",
  "language": "python",
  "input": "optional input data"
}
```

Supported languages:
- python
- javascript
- cpp
- java
- c

Response:
```json
{
  "success": true,
  "output": "Hello, World!",
  "executionTime": 123
}
```

#### POST /submit (Protected)
Submit code for a problem
```json
{
  "code": "def twoSum(nums, target):\n    ...",
  "language": "python",
  "problemId": 1
}
```

#### GET /submissions/:problemId (Protected)
Get user's submissions for a problem

---

### User Progress (`/api/user`)

#### GET /dashboard (Protected)
Get user dashboard with stats
```json
{
  "progress": {
    "problems_solved": 28,
    "submission_count": 284,
    "current_streak": 14,
    "ranking": 12847
  },
  "recentSubmissions": [...],
  "todayActivity": 3,
  "stats": {...}
}
```

#### GET /progress (Protected)
Get detailed user progress with breakdown by difficulty

#### GET /rank (Protected)
Get user's current rank
```json
{
  "rank": 12847,
  "problemsSolved": 28
}
```

#### POST /mark-solved (Protected)
Mark a problem as solved
```json
{
  "problemId": 1
}
```

#### GET /leaderboard
Get global leaderboard
Query: `?page=1&limit=50`

---

### Discussions (`/api/discussions`)

#### GET /problem/:problemId
Get discussions for a problem

#### POST / (Protected)
Create new discussion
```json
{
  "problemId": 1,
  "title": "Discussion Title",
  "content": "Discussion content"
}
```

#### PUT /:discussionId (Protected)
Update discussion

#### DELETE /:discussionId (Protected)
Delete discussion

#### POST /:discussionId/upvote
Upvote a discussion

#### POST /:discussionId/downvote
Downvote a discussion

---

## Database Schema

### users
```sql
- id (PRIMARY KEY)
- username (UNIQUE)
- email (UNIQUE)
- password (hashed)
- profile_picture_url
- bio
- is_active
- created_at
- updated_at
```

### problems
```sql
- id (PRIMARY KEY)
- title
- slug (UNIQUE)
- description
- examples (JSONB)
- constraints
- difficulty (Easy, Medium, Hard)
- category
- tags (TEXT ARRAY)
- acceptance_rate
- submissions_count
- acceptance_count
- solution_link
- created_at
- updated_at
```

### submissions
```sql
- id (PRIMARY KEY)
- user_id (FOREIGN KEY)
- problem_id (FOREIGN KEY)
- code
- language
- status (Pending, Accepted, Wrong Answer, Runtime Error, TLE)
- execution_time
- memory_used
- output
- error_message
- test_cases_passed
- test_cases_total
- submitted_at
- created_at
```

### user_progress
```sql
- id (PRIMARY KEY)
- user_id (FOREIGN KEY UNIQUE)
- problems_solved
- problems_attempted
- submission_count
- ranking
- current_streak
- longest_streak
- last_submission_date
- created_at
- updated_at
```

### solved_problems
```sql
- id (PRIMARY KEY)
- user_id (FOREIGN KEY)
- problem_id (FOREIGN KEY)
- solved_at
- solution_code
- best_execution_time
- best_memory_used
- UNIQUE(user_id, problem_id)
```

### discussions
```sql
- id (PRIMARY KEY)
- problem_id (FOREIGN KEY)
- user_id (FOREIGN KEY)
- title
- content
- upvotes
- created_at
- updated_at
```

---

## Authentication

The API uses JWT (JSON Web Tokens) for authentication.

### How to authenticate:
1. Register or login to get a token
2. Include the token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

### Token details:
- Expires in 7 days
- Secret stored in `JWT_SECRET` environment variable

### Example request:
```bash
curl -H "Authorization: Bearer eyJhbGc..." http://localhost:5000/api/auth/me
```

---

## Error Handling

The API returns appropriate HTTP status codes and error messages:

```json
{
  "message": "Error description",
  "error": "Detailed error (development mode only)"
}
```

### Common status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict (e.g., duplicate email)
- `500` - Server Error

---

## Testing

### Test endpoints with curl:

**Register a user:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123",
    "confirmPassword": "password123"
  }'
```

**Get all problems:**
```bash
curl http://localhost:5000/api/problems
```

**Run code:**
```bash
curl -X POST http://localhost:5000/api/code/run \
  -H "Content-Type: application/json" \
  -d '{
    "code": "print(\"Hello\")",
    "language": "python"
  }'
```

---

## Environment Variables Reference

```bash
# Server
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Database
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key

# Security
JWT_SECRET=your_secret_key

# Code Execution
CODE_EXECUTION_TIMEOUT=5000
MAX_OUTPUT_LENGTH=10000
```

---

## Deployment Checklist

- [ ] Update `.env` with production values
- [ ] Set `NODE_ENV=production`
- [ ] Use strong JWT secret
- [ ] Update CORS origins for production domain
- [ ] Enable HTTPS
- [ ] Setup database backups
- [ ] Configure rate limiting
- [ ] Setup error logging/monitoring
- [ ] Enable CORS for frontend domain
- [ ] Test all endpoints in production

---

## Support & Troubleshooting

### Common Issues

**Supabase connection error:**
- Check SUPABASE_URL and SUPABASE_KEY
- Ensure Supabase project is active

**JWT token expired:**
- User needs to login again to get new token

**Code execution timeout:**
- Default timeout is 5 seconds
- Adjust CODE_EXECUTION_TIMEOUT in .env

**CORS errors:**
- Update FRONTEND_URL in .env
- Ensure correct headers are sent

For more help, check the error message and logs!
