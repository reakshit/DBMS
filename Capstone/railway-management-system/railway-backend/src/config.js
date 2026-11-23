// Load .env once, before anything else reads process.env
require('dotenv').config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me') {
  console.error('JWT_SECRET is missing or still the placeholder. Set a real secret in .env');
  process.exit(1);
}

module.exports = {
  port: Number(process.env.PORT) || 4000,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigins: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) : true,
};
