const express = require('express');
const pool = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const v = require('../utils/validate');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('ADMIN'));

// ---------- Master data ----------

// POST /api/admin/stations
router.post('/stations', asyncHandler(async (req, res) => {
  const b = req.body;
  const station = {
    station_code: v.code(b.station_code, 'station_code', 5),
    station_name: v.str(b.station_name, 'station_name', 100),
    city: v.str(b.city, 'city', 60),
    state: v.str(b.state, 'state', 60),
  };
  const [r] = await pool.query('INSERT INTO stations SET ?', [station]);
  res.status(201).json({ station_id: r.insertId, ...station });
}));

// POST /api/admin/trains
router.post('/trains', asyncHandler(async (req, res) => {
  const b = req.body;
  const train = {
    train_number: v.code(b.train_number, 'train_number', 6),
    train_name: v.str(b.train_name, 'train_name', 100),
    train_type: v.oneOf(b.train_type || 'EXPRESS', 'train_type', ['LOCAL', 'EXPRESS', 'SUPERFAST', 'RAJDHANI', 'SHATABDI']),
  };
  const [r] = await pool.query('INSERT INTO trains SET ?', [train]);
  res.status(201).json({ train_id: r.insertId, ...train, is_active: true });
}));

// GET /api/admin/trains
router.get('/trains', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT t.train_id, t.train_number, t.train_name, t.train_type, t.is_active,
            COUNT(DISTINCT s.stop_seq) AS stop_count,
            COUNT(DISTINCT CASE
              WHEN r.status = 'SCHEDULED'
               AND r.journey_date >= CURDATE()
               AND r.journey_date < DATE_ADD(CURDATE(), INTERVAL 7 DAY)
              THEN r.run_id END) AS upcoming_runs
       FROM trains t
       LEFT JOIN train_stops s ON s.train_id = t.train_id
       LEFT JOIN train_runs r ON r.train_id = t.train_id
      GROUP BY t.train_id, t.train_number, t.train_name, t.train_type, t.is_active
      ORDER BY t.train_number`
  );
  res.json(rows);
}));

// PATCH /api/admin/trains/:id   { train_number?, train_name?, train_type?, is_active? }
router.patch('/trains/:id', asyncHandler(async (req, res) => {
  const id = v.int(req.params.id, 'id');
  const fields = [];
  const values = [];
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be an object');
  }
  const allowedFields = ['train_number', 'train_name', 'train_type', 'is_active'];
  if (Object.keys(body).some((field) => !allowedFields.includes(field))) {
    throw new HttpError(400, 'Request body contains an unsupported train field');
  }

  if (Object.hasOwn(body, 'train_number')) {
    fields.push('train_number = ?');
    values.push(v.code(body.train_number, 'train_number', 6));
  }
  if (Object.hasOwn(body, 'train_name')) {
    fields.push('train_name = ?');
    values.push(v.str(body.train_name, 'train_name', 100));
  }
  if (Object.hasOwn(body, 'train_type')) {
    fields.push('train_type = ?');
    values.push(v.oneOf(body.train_type, 'train_type', ['LOCAL', 'EXPRESS', 'SUPERFAST', 'RAJDHANI', 'SHATABDI']));
  }
  if (Object.hasOwn(body, 'is_active')) {
    if (typeof body.is_active !== 'boolean') throw new HttpError(400, 'is_active must be true or false');
    fields.push('is_active = ?');
    values.push(body.is_active);
  }
  if (fields.length === 0) throw new HttpError(400, 'Provide at least one train field to update');

  await pool.query(`UPDATE trains SET ${fields.join(', ')} WHERE train_id = ?`, [...values, id]);
  const [[train]] = await pool.query(
    'SELECT train_id, train_number, train_name, train_type, is_active FROM trains WHERE train_id = ?',
    [id]
  );
  if (!train) throw new HttpError(404, 'Train not found');
  res.json(train);
}));

// POST /api/admin/trains/:id/stops
// { stop_seq, station_code, arrival_time, departure_time, day_offset, distance_km }
router.post('/trains/:id/stops', asyncHandler(async (req, res) => {
  const trainId = v.int(req.params.id, 'id');
  const b = req.body;
  const stationCode = v.code(b.station_code, 'station_code', 5);
  const [[station]] = await pool.query('SELECT station_id FROM stations WHERE station_code = ?', [stationCode]);
  if (!station) throw new HttpError(404, `Unknown station ${stationCode}`);

  const stop = {
    train_id: trainId,
    stop_seq: v.int(b.stop_seq, 'stop_seq', { min: 1, max: 255 }),
    station_id: station.station_id,
    arrival_time: v.timeOrNull(b.arrival_time, 'arrival_time'),
    departure_time: v.timeOrNull(b.departure_time, 'departure_time'),
    day_offset: v.int(b.day_offset ?? 0, 'day_offset', { min: 0, max: 10 }),
    distance_km: v.int(b.distance_km, 'distance_km', { min: 0, max: 20000 }),
  };
  await pool.query('INSERT INTO train_stops SET ?', [stop]);
  res.status(201).json({ ...stop, station_code: stationCode });
}));

// POST /api/admin/trains/:id/coaches   { class_code, coach_number, seats }  -> sp_add_coach (also creates the seats)
router.post('/trains/:id/coaches', asyncHandler(async (req, res) => {
  const trainId = v.int(req.params.id, 'id');
  const classCode = v.code(req.body.class_code, 'class_code', 3);
  const coachNo = v.code(req.body.coach_number, 'coach_number', 4);
  const seats = v.int(req.body.seats, 'seats', { min: 1, max: 120 });

  const [[train]] = await pool.query('SELECT train_id FROM trains WHERE train_id = ?', [trainId]);
  if (!train) throw new HttpError(404, 'Train not found');
  const [[cls]] = await pool.query('SELECT class_id FROM coach_classes WHERE class_code = ?', [classCode]);
  if (!cls) throw new HttpError(404, `Unknown class ${classCode}`);

  await pool.query('CALL sp_add_coach(?, ?, ?, ?)', [trainId, cls.class_id, coachNo, seats]);
  res.status(201).json({ train_id: trainId, class_code: classCode, coach_number: coachNo, seats });
}));

// POST /api/admin/runs   { train_id, from_date, days }   -> creates bookable runs, skips dates that already exist
router.post('/runs', asyncHandler(async (req, res) => {
  const trainId = v.int(req.body.train_id, 'train_id');
  const start = v.date(req.body.from_date, 'from_date');
  const days = v.int(req.body.days, 'days', { min: 1, max: 90 });

  const [[train]] = await pool.query('SELECT train_id FROM trains WHERE train_id = ?', [trainId]);
  if (!train) throw new HttpError(404, 'Train not found');

  const [y, m, d] = start.split('-').map(Number);
  const rows = [];
  for (let i = 0; i < days; i++) {
    rows.push([trainId, new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10)]);
  }
  const [r] = await pool.query('INSERT IGNORE INTO train_runs (train_id, journey_date) VALUES ?', [rows]);
  res.status(201).json({ created: r.affectedRows, skipped_existing: days - r.affectedRows });
}));

// ---------- Fares ----------

// PUT /api/admin/fares/:classCode   { rate_per_km }
// The AFTER UPDATE trigger trg_fare_audit writes the old/new rate to fare_audit.
router.put('/fares/:classCode', asyncHandler(async (req, res) => {
  const classCode = v.code(req.params.classCode, 'classCode', 3);
  const rate = v.number(req.body.rate_per_km, 'rate_per_km', { min: 0.01, max: 9999 });
  const [r] = await pool.query('UPDATE coach_classes SET rate_per_km = ? WHERE class_code = ?', [rate, classCode]);
  if (r.affectedRows === 0) throw new HttpError(404, 'Unknown class');
  res.json({ class_code: classCode, rate_per_km: rate });
}));

// GET /api/admin/fare-audit
router.get('/fare-audit', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT a.audit_id, cc.class_code, a.old_rate, a.new_rate, a.changed_by, a.changed_at
       FROM fare_audit a JOIN coach_classes cc ON cc.class_id = a.class_id
      ORDER BY a.audit_id DESC`);
  res.json(rows);
}));

// ---------- Users ----------

// GET /api/admin/users
router.get('/users', asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT user_id, full_name, email, phone, role, created_at FROM users ORDER BY user_id');
  res.json(rows);
}));

// PATCH /api/admin/users/:id/role   { role }
router.patch('/users/:id/role', asyncHandler(async (req, res) => {
  const id = v.int(req.params.id, 'id');
  const role = v.oneOf(req.body.role, 'role', ['PASSENGER', 'STAFF', 'ADMIN']);
  if (id === req.user.id) throw new HttpError(400, 'You cannot change your own role');
  const [r] = await pool.query('UPDATE users SET role = ? WHERE user_id = ?', [role, id]);
  if (r.affectedRows === 0) throw new HttpError(404, 'User not found');
  res.json({ user_id: id, role });
}));

// ---------- Reports ----------

// GET /api/admin/reports/revenue-by-train   -> view v_revenue_by_train
router.get('/reports/revenue-by-train', asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM v_revenue_by_train ORDER BY net_revenue DESC');
  res.json(rows);
}));

// GET /api/admin/reports/revenue-by-route
router.get('/reports/revenue-by-route', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT sf.station_code AS from_code, st.station_code AS to_code,
            COUNT(DISTINCT b.booking_id) AS bookings,
            SUM(CASE WHEN p.txn_type = 'PAYMENT' THEN p.amount ELSE -p.amount END) AS net_revenue
       FROM payments p
       JOIN bookings b  ON b.booking_id = p.booking_id
       JOIN stations sf ON sf.station_id = b.from_station_id
       JOIN stations st ON st.station_id = b.to_station_id
      WHERE p.status = 'SUCCESS'
      GROUP BY b.from_station_id, b.to_station_id, sf.station_code, st.station_code
      ORDER BY net_revenue DESC`);
  res.json(rows);
}));

// GET /api/admin/reports/top-trains?limit=5   (most booked trains)
router.get('/reports/top-trains', asyncHandler(async (req, res) => {
  const limit = v.int(req.query.limit ?? 5, 'limit', { min: 1, max: 50 });
  const [rows] = await pool.query(
    `SELECT t.train_number, t.train_name,
            COUNT(DISTINCT b.booking_id) AS bookings,
            COUNT(p.passenger_id)        AS passengers_booked
       FROM bookings b
       JOIN train_runs r  ON r.run_id = b.run_id
       JOIN trains t      ON t.train_id = r.train_id
       JOIN passengers p  ON p.booking_id = b.booking_id
      GROUP BY t.train_id, t.train_number, t.train_name
      ORDER BY passengers_booked DESC
      LIMIT ?`, [limit]);
  res.json(rows);
}));

// GET /api/admin/reports/cancellation-rate   (per class, plus overall)
router.get('/reports/cancellation-rate', asyncHandler(async (req, res) => {
  const [byClass] = await pool.query(
    `SELECT cc.class_code,
            COUNT(*) AS total_tickets,
            SUM(p.status = 'CANCELLED') AS cancelled,
            ROUND(100 * SUM(p.status = 'CANCELLED') / COUNT(*), 2) AS cancellation_rate_pct
       FROM passengers p
       JOIN bookings b       ON b.booking_id = p.booking_id
       JOIN coach_classes cc ON cc.class_id = b.class_id
      GROUP BY cc.class_id, cc.class_code
      ORDER BY cc.class_id`);
  const [[overall]] = await pool.query(
    `SELECT COUNT(*) AS total_tickets,
            COALESCE(SUM(status = 'CANCELLED'), 0) AS cancelled,
            COALESCE(ROUND(100 * SUM(status = 'CANCELLED') / NULLIF(COUNT(*), 0), 2), 0) AS cancellation_rate_pct
       FROM passengers`);
  res.json({ overall, by_class: byClass });
}));

module.exports = router;
