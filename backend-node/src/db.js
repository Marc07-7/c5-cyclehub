
import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';

// Load the TiDB Cloud CA certificate when SSL is configured.
export const dbSsl = process.env.DB_SSL_CA
  ? {
      ca: fs.readFileSync(
        path.resolve(process.cwd(), process.env.DB_SSL_CA),
        'utf8'
      ),
      rejectUnauthorized: true
    }
  : undefined;

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: dbSsl,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
  timezone: 'Z'
});

export async function pingDatabase() {
  const connection = await pool.getConnection();

  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}
