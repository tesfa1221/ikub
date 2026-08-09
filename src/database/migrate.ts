import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

function getSslConfig() {
  if (process.env.DB_SSL_CA_CONTENT) {
    return { ca: process.env.DB_SSL_CA_CONTENT };
  }
  const caPath = process.env.DB_SSL_CA;
  if (!caPath) return undefined;
  try {
    return { ca: fs.readFileSync(path.resolve(caPath)) };
  } catch {
    return { rejectUnauthorized: false };
  }
}

const migrations = `
-- Tables (Aiven provides the database — no CREATE DATABASE needed)

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  telegram_id BIGINT UNIQUE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role ENUM('member', 'admin', 'super_admin') DEFAULT 'member',
  avatar_url VARCHAR(500),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_telegram_id (telegram_id),
  INDEX idx_role (role)
);

-- Admin accounts table
CREATE TABLE IF NOT EXISTS admins (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role ENUM('admin', 'super_admin') DEFAULT 'admin',
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Ikubs table
CREATE TABLE IF NOT EXISTS ikubs (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  contribution_amount DECIMAL(15,2) NOT NULL,
  schedule ENUM('weekly', 'biweekly', 'monthly') DEFAULT 'monthly',
  max_members INT DEFAULT 12,
  current_round INT DEFAULT 0,
  total_rounds INT DEFAULT 12,
  status ENUM('pending', 'active', 'completed', 'paused') DEFAULT 'pending',
  start_date DATE,
  end_date DATE,
  invitation_code VARCHAR(20) UNIQUE NOT NULL,
  created_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES admins(id),
  INDEX idx_status (status),
  INDEX idx_invitation_code (invitation_code)
);

-- Members table (ikub memberships)
CREATE TABLE IF NOT EXISTS members (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  ikub_id VARCHAR(36) NOT NULL,
  join_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  order_number INT, -- their position/order in draw sequence
  has_received BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE KEY unique_member (user_id, ikub_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (ikub_id) REFERENCES ikubs(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_ikub_id (ikub_id)
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(36) PRIMARY KEY,
  member_id VARCHAR(36) NOT NULL,
  ikub_id VARCHAR(36) NOT NULL,
  round_number INT NOT NULL,
  transaction_id VARCHAR(100) UNIQUE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  payment_method ENUM('telebirr', 'cbe_birr', 'other') NOT NULL,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP NULL,
  verified_by VARCHAR(36) NULL,
  rejection_reason TEXT NULL,
  notes TEXT,
  FOREIGN KEY (member_id) REFERENCES members(id),
  FOREIGN KEY (ikub_id) REFERENCES ikubs(id),
  FOREIGN KEY (verified_by) REFERENCES admins(id),
  INDEX idx_member_id (member_id),
  INDEX idx_ikub_id (ikub_id),
  INDEX idx_status (status),
  INDEX idx_transaction_id (transaction_id)
);

-- Draws table
CREATE TABLE IF NOT EXISTS draws (
  id VARCHAR(36) PRIMARY KEY,
  ikub_id VARCHAR(36) NOT NULL,
  round_number INT NOT NULL,
  winner_member_id VARCHAR(36) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  draw_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  conducted_by VARCHAR(36),
  notes TEXT,
  FOREIGN KEY (ikub_id) REFERENCES ikubs(id),
  FOREIGN KEY (winner_member_id) REFERENCES members(id),
  FOREIGN KEY (conducted_by) REFERENCES admins(id),
  INDEX idx_ikub_id (ikub_id),
  INDEX idx_winner (winner_member_id)
);

-- Transactions table (from Android notification listener)
CREATE TABLE IF NOT EXISTS transactions (
  id VARCHAR(36) PRIMARY KEY,
  transaction_reference VARCHAR(100) UNIQUE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  source ENUM('telebirr', 'cbe_birr', 'other') NOT NULL,
  sender_name VARCHAR(255),
  sender_phone VARCHAR(20),
  raw_message TEXT,
  device_id VARCHAR(100),
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_matched BOOLEAN DEFAULT FALSE,
  matched_payment_id VARCHAR(36) NULL,
  FOREIGN KEY (matched_payment_id) REFERENCES payments(id),
  INDEX idx_transaction_reference (transaction_reference),
  INDEX idx_is_matched (is_matched)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('payment_approved', 'payment_rejected', 'draw_result', 'reminder', 'system') DEFAULT 'system',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_is_read (is_read)
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  actor_id VARCHAR(36),
  actor_type ENUM('admin', 'user', 'system') DEFAULT 'system',
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(36),
  details JSON,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_actor_id (actor_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
);

-- Device tokens table (Android app authentication)
CREATE TABLE IF NOT EXISTS device_tokens (
  id VARCHAR(36) PRIMARY KEY,
  device_id VARCHAR(100) UNIQUE NOT NULL,
  device_name VARCHAR(255),
  api_key_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_sync TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Applications table (public marketplace apply-to-join)
CREATE TABLE IF NOT EXISTS applications (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  ikub_id VARCHAR(36) NOT NULL,
  message TEXT,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  reviewed_by VARCHAR(36) NULL,
  reviewed_at TIMESTAMP NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_application (user_id, ikub_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (ikub_id) REFERENCES ikubs(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES admins(id),
  INDEX idx_ikub_id (ikub_id),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status)
);
`;

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'smartikub',
    multipleStatements: true,
    ssl: getSslConfig(),
  });

  try {
    console.log('🔄 Running migrations...');
    await connection.query(migrations);
    console.log('✅ Migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

migrate().catch(console.error);
