// Quick migration runner using compiled JS (no ts-node needed)
// Run: node run-migration.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const sql = `
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
  INDEX idx_ikub_id (ikub_id),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status)
);
`;

async function run() {
  let sslConfig;
  if (process.env.DB_SSL_CA_CONTENT) {
    sslConfig = { ca: process.env.DB_SSL_CA_CONTENT };
  } else if (process.env.DB_SSL_CA) {
    const fs = require('fs');
    sslConfig = { ca: fs.readFileSync(process.env.DB_SSL_CA) };
  }

  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT || '3306'),
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl:      sslConfig,
  });

  try {
    console.log('Running applications table migration...');
    await conn.execute(sql.trim());
    console.log('applications table: OK');

    // Verify
    const [rows] = await conn.execute("SHOW TABLES LIKE 'applications'");
    console.log('Table exists:', rows.length > 0 ? 'YES' : 'NO');
  } finally {
    await conn.end();
  }
}

run().catch(err => { console.error('Migration failed:', err.message); process.exit(1); });
