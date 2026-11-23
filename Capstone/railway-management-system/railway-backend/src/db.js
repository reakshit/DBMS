require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'railway_db',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,    // DATE/DATETIME come back as plain strings: no timezone shifting
  decimalNumbers: true, // DECIMAL columns come back as numbers instead of strings
});

// Run fn with one dedicated connection. Needed for CALL ... OUT params,
// because @user_variables only live on the connection that set them.
async function withConnection(fn) {
  const conn = await pool.getConnection();
  try {
    return await fn(conn);
  } finally {
    conn.release();
  }
}

// MySQL can abort one of two competing transactions (deadlock 1213 / lock wait timeout 1205).
// The stored procedures roll back cleanly, so it is safe to simply try again.
async function retryOnDeadlock(fn, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if ((err.errno === 1213 || err.errno === 1205) && i < attempts) {
        await new Promise((r) => setTimeout(r, 50 * i));
        continue;
      }
      throw err;
    }
  }
}

module.exports = pool;
module.exports.withConnection = withConnection;
module.exports.retryOnDeadlock = retryOnDeadlock;
