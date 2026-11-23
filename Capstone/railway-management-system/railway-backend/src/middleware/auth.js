const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config');
const HttpError = require('../utils/httpError');

// Requires "Authorization: Bearer <token>"; puts { id, role } on req.user
function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Missing bearer token');
  try {
    req.user = jwt.verify(token, jwtSecret);
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
  next();
}

// Role-based access: requireRole('ADMIN') or requireRole('STAFF', 'ADMIN')
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw new HttpError(403, 'You do not have permission for this action');
  next();
};

module.exports = { authenticate, requireRole };
