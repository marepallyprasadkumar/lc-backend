-- Users table
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  profile_picture_url TEXT,
  bio TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

-- Create index on email for faster login queries
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);

-- Problems table
CREATE TABLE IF NOT EXISTS problems (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  examples JSONB,
  constraints TEXT,
  difficulty VARCHAR(50) NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  category VARCHAR(100),
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  acceptance_rate FLOAT DEFAULT 0,
  submissions_count INT DEFAULT 0,
  acceptance_count INT DEFAULT 0,
  solution_link TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_problems_difficulty ON problems(difficulty);
CREATE INDEX idx_problems_category ON problems(category);
CREATE INDEX idx_problems_slug ON problems(slug);

-- Submissions table (user code submissions)
CREATE TABLE IF NOT EXISTS submissions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  problem_id BIGINT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  language VARCHAR(50) DEFAULT 'python',
  status VARCHAR(50) NOT NULL CHECK (status IN ('Pending', 'Accepted', 'Wrong Answer', 'Runtime Error', 'Time Limit Exceeded')),
  execution_time INT, -- in milliseconds
  memory_used INT, -- in MB
  output TEXT,
  error_message TEXT,
  test_cases_passed INT DEFAULT 0,
  test_cases_total INT DEFAULT 0,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for submissions
CREATE INDEX idx_submissions_user_id ON submissions(user_id);
CREATE INDEX idx_submissions_problem_id ON submissions(problem_id);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_submissions_created_at ON submissions(created_at);

-- User Progress tracking table
CREATE TABLE IF NOT EXISTS user_progress (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  problems_solved INT DEFAULT 0,
  problems_attempted INT DEFAULT 0,
  submission_count INT DEFAULT 0,
  ranking INT,
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  last_submission_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on user_id
CREATE INDEX idx_user_progress_user_id ON user_progress(user_id);

-- Solved problems tracking
CREATE TABLE IF NOT EXISTS solved_problems (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  problem_id BIGINT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  solved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  solution_code TEXT,
  best_execution_time INT,
  best_memory_used INT,
  UNIQUE(user_id, problem_id)
);

-- Create index
CREATE INDEX idx_solved_problems_user_id ON solved_problems(user_id);
CREATE INDEX idx_solved_problems_problem_id ON solved_problems(problem_id);

-- Discussion/Comments table
CREATE TABLE IF NOT EXISTS discussions (
  id BIGSERIAL PRIMARY KEY,
  problem_id BIGINT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  upvotes INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_discussions_problem_id ON discussions(problem_id);
CREATE INDEX idx_discussions_user_id ON discussions(user_id);

-- Leaderboard view (materialized view for better performance)
CREATE OR REPLACE VIEW leaderboard AS
SELECT 
  up.user_id,
  u.username,
  up.problems_solved,
  up.submission_count,
  up.current_streak,
  ROW_NUMBER() OVER (ORDER BY up.problems_solved DESC, up.submission_count ASC) as rank
FROM user_progress up
JOIN users u ON up.user_id = u.id
WHERE u.is_active = true
ORDER BY up.problems_solved DESC;

-- Create triggers for auto-updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_problems_updated_at BEFORE UPDATE ON problems
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_progress_updated_at BEFORE UPDATE ON user_progress
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_discussions_updated_at BEFORE UPDATE ON discussions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
