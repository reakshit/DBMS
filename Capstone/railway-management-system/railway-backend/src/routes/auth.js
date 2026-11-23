const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { jwtSecret, jwtExpiresIn } = require('../config');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const v = require('../utils/validate');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const signToken = (user) => jwt.sign({ id: user.user_id, role: user.role }, jwtSecret, { expiresIn: jwtExpiresIn });
const publicUser = (u) => ({ id: u.user_id, full_name: u.full_name, email: u.email, phone: u.phone, role: u.role });

// Compared against when the email is unknown, so response time does not reveal which emails exist
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// POST /api/auth/register   (public sign-up always creates a PASSENGER; admins promote users later)
router.post('/register', asyncHandler(async (req, res) => {
  const full_name = v.str(req.body.full_name, 'full_name', 100);
  const email = v.email(req.body.email);
  const phone = v.phone(req.body.phone);
  const password = v.password(req.body.password);

  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO users (full_name, email, phone, password_hash) VALUES (?, ?, ?, ?)',
    [full_name, email, phone, hash]
  );
  const user = { user_id: result.insertId, full_name, email, phone, role: 'PASSENGER' };
  res.status(201).json({ user: publicUser(user), token: signToken(user) });
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const email = v.email(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const accountType = v.oneOf(req.body.account_type, 'account_type', ['USER', 'ADMIN']);

  const [[user]] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  const roleMatches = accountType === 'ADMIN' ? user?.role === 'ADMIN' : user?.role !== 'ADMIN';
  if (!user || !ok || !roleMatches) throw new HttpError(401, 'Invalid email or password');

  res.json({ user: publicUser(user), token: signToken(user) });
}));

// GET /api/auth/me
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const [[user]] = await pool.query('SELECT * FROM users WHERE user_id = ?', [req.user.id]);
  if (!user) throw new HttpError(401, 'User no longer exists');
  res.json({ user: publicUser(user) });
}));

module.exports = router;
