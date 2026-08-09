import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

dotenv.config();

// Aiven requires SSL — supports both file path (local) and env var content (Render)
function getSslConfig() {
  // Render: cert content stored as env variable
  if (process.env.DB_SSL_CA_CONTENT) {
    return { ca: process.env.DB_SSL_CA_CONTENT };
  }
  // Local dev: cert stored as file path
  const caPath = process.env.DB_SSL_CA;
  if (!caPath) return undefined;
  try {
    return { ca: fs.readFileSync(path.resolve(caPath)) };
  } catch {
    logger.warn('DB_SSL_CA file not found — connecting without SSL cert verification');
    return { rejectUnauthorized: false };
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'smartikub',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  timezone: '+03:00', // Ethiopia (EAT)
  ssl: getSslConfig(),
});

export async function testConnection(): Promise<void> {
  const connection = await pool.getConnection();
  await connection.ping();
  connection.release();
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}

// rawQuery uses pool.query (not prepared statements) — needed for dynamic WHERE clauses on MariaDB
export async function rawQuery<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] || null;
}

export async function execute(sql: string, params?: any[]): Promise<mysql.ResultSetHeader> {
  const [result] = await pool.execute(sql, params);
  return result as mysql.ResultSetHeader;
}

export { pool };

export default pool;
