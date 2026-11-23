const HttpError = require('./httpError');

const bad = (msg) => new HttpError(400, msg);

exports.str = (v, name, max, min = 1) => {
  if (typeof v !== 'string') throw bad(`${name} is required`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw bad(`${name} must be ${min}-${max} characters`);
  return s;
};

exports.code = (v, name, max = 6) => {
  if (typeof v !== 'string' || !/^[A-Za-z0-9]+$/.test(v.trim()) || v.trim().length > max) {
    throw bad(`${name} must be an alphanumeric code of at most ${max} characters`);
  }
  return v.trim().toUpperCase();
};

exports.email = (v) => {
  const s = exports.str(v, 'email', 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw bad('email is not valid');
  return s;
};

exports.phone = (v) => {
  const s = exports.str(v, 'phone', 15);
  if (!/^\d{10,15}$/.test(s)) throw bad('phone must be 10-15 digits');
  return s;
};

exports.password = (v) => {
  if (typeof v !== 'string' || v.length < 8 || v.length > 72) {
    throw bad('password must be 8-72 characters');
  }
  return v;
};

exports.int = (v, name, { min = 1, max = 2147483647 } = {}) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} must be an integer between ${min} and ${max}`);
  return n;
};

exports.number = (v, name, { min = 0, max = 1e9 } = {}) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) {
    throw bad(`${name} must be a number between ${min} and ${max}`);
  }
  return n;
};

exports.date = (v, name = 'date') => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
    throw bad(`${name} must be a date in YYYY-MM-DD format`);
  }
  return v;
};

// Optional TIME value (HH:MM or HH:MM:SS); null/undefined/'' -> null
exports.timeOrNull = (v, name) => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v)) {
    throw bad(`${name} must be a time in HH:MM format`);
  }
  return v;
};

exports.oneOf = (v, name, list) => {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : v;
  if (!list.includes(s)) throw bad(`${name} must be one of: ${list.join(', ')}`);
  return s;
};
