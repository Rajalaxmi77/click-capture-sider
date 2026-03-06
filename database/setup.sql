-- Create users table if not exists
CREATE TABLE IF NOT EXISTS users (
    userid VARCHAR(50) PRIMARY KEY,
    role VARCHAR(50) NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- Create index on userid for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_userid ON users(userid);

-- Insert a test user (password: 'password123')
-- You'll need to generate the actual hash using bcrypt
-- INSERT INTO users (userid, role, password) 
-- VALUES ('admin', 'admin', '$2b$10$YourHashedPasswordHere');