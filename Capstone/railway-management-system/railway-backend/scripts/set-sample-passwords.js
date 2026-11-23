// The sample users in railway_db.sql have placeholder password hashes, so nobody can log in.
// Run once after importing the SQL:  npm run seed:passwords
require('../src/config'); // loads .env (also validates JWT_SECRET)
const bcrypt = require('bcryptjs');
const pool = require('../src/db');

const PASSWORD = 'Password@123';

(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const [r] = await pool.query(
    "UPDATE users SET password_hash = ? WHERE password_hash LIKE '%replace_with_real_bcrypt_hash%'", [hash]);
  console.log(`Updated ${r.affectedRows} sample user(s). Login with e.g. admin@rail.local / ${PASSWORD}`);
  console.log('These are demo credentials only. Do not use them anywhere real.');
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
