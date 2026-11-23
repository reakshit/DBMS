const express = require('express');
const pool = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const v = require('../utils/validate');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('STAFF', 'ADMIN'));

// GET /api/staff/runs?date=YYYY-MM-DD   (all runs on a date, with booking counts)
router.get('/runs', asyncHandler(async (req, res) => {
  const date = v.date(req.query.date);
  const [rows] = await pool.query(
    `SELECT r.run_id, t.train_number, t.train_name, r.journey_date, r.status,
            COUNT(p.passenger_id) AS tickets,
            COALESCE(SUM(p.status = 'CONFIRMED'), 0)  AS confirmed,
            COALESCE(SUM(p.status = 'WAITLISTED'), 0) AS waitlisted,
            COALESCE(SUM(p.status = 'CANCELLED'), 0)  AS cancelled
       FROM train_runs r
       JOIN trains t         ON t.train_id = r.train_id
       LEFT JOIN bookings b  ON b.run_id = r.run_id
       LEFT JOIN passengers p ON p.booking_id = b.booking_id
      WHERE r.journey_date = ?
      GROUP BY r.run_id, t.train_number, t.train_name, r.journey_date, r.status
      ORDER BY t.train_number`,
    [date]
  );
  res.json(rows);
}));

// GET /api/staff/runs/:runId/chart   (passenger chart: who sits where)
router.get('/runs/:runId/chart', asyncHandler(async (req, res) => {
  const runId = v.int(req.params.runId, 'runId');
  const [[run]] = await pool.query(
    `SELECT r.run_id, t.train_number, t.train_name, r.journey_date, r.status
       FROM train_runs r JOIN trains t ON t.train_id = r.train_id WHERE r.run_id = ?`, [runId]);
  if (!run) throw new HttpError(404, 'Run not found');

  const [passengers] = await pool.query(
    `SELECT pnr, class_code, from_code, to_code, passenger_id, passenger AS name, age, ticket_status AS status,
            coach_number, seat_number, berth_type, waitlist_no
       FROM v_booking_details
      WHERE train_number = ? AND journey_date = ? AND ticket_status <> 'CANCELLED'
      ORDER BY class_code, coach_number, seat_number, waitlist_no`,
    [run.train_number, run.journey_date]
  );
  res.json({ run, passengers });
}));

// PATCH /api/staff/runs/:runId/status   { status: 'DEPARTED' | 'CANCELLED' }
// Note: cancelling a run does not auto-refund existing bookings; that is an extension you could add as a procedure.
router.patch('/runs/:runId/status', asyncHandler(async (req, res) => {
  const runId = v.int(req.params.runId, 'runId');
  const status = v.oneOf(req.body.status, 'status', ['DEPARTED', 'CANCELLED']);
  const [r] = await pool.query(
    `UPDATE train_runs SET status = ? WHERE run_id = ? AND status = 'SCHEDULED'`, [status, runId]);
  if (r.affectedRows === 0) throw new HttpError(409, 'Run not found or no longer SCHEDULED');
  res.json({ run_id: runId, status });
}));

module.exports = router;
