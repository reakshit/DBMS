const express = require('express');
const pool = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const v = require('../utils/validate');
const { authenticate } = require('../middleware/auth');
const { cancelPassenger, getTicket } = require('../services/ticketService');

const router = express.Router();
router.use(authenticate);

const isStaff = (user) => user.role === 'STAFF' || user.role === 'ADMIN';

// Loads a ticket and makes sure the caller may see it (owner, or staff/admin)
async function loadOwnedTicket(pnr, user) {
  if (!/^\d{10}$/.test(pnr)) throw new HttpError(400, 'PNR must be 10 digits');
  const ticket = await getTicket(pnr);
  if (ticket._owner_id !== user.id && !isStaff(user)) throw new HttpError(403, 'This booking belongs to another user');
  const { _owner_id, ...safe } = ticket;
  return safe;
}

router.post('/', (req, res, next) => next(new HttpError(410, 'Direct booking is disabled. Use the demo payment flow to create a booking.')));

// GET /api/bookings   (my bookings, newest first)
router.get('/', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT b.pnr, b.status, b.total_fare, b.booking_time,
            t.train_number, t.train_name, r.journey_date,
            sf.station_code AS from_code, st.station_code AS to_code, cc.class_code,
            (SELECT COUNT(*) FROM passengers p WHERE p.booking_id = b.booking_id) AS passenger_count,
            (SELECT COUNT(*) FROM passengers p WHERE p.booking_id = b.booking_id AND p.status = 'CONFIRMED') AS confirmed,
            (SELECT COUNT(*) FROM passengers p WHERE p.booking_id = b.booking_id AND p.status = 'WAITLISTED') AS waitlisted
       FROM bookings b
       JOIN train_runs r     ON r.run_id = b.run_id
       JOIN trains t         ON t.train_id = r.train_id
       JOIN stations sf      ON sf.station_id = b.from_station_id
       JOIN stations st      ON st.station_id = b.to_station_id
       JOIN coach_classes cc ON cc.class_id = b.class_id
      WHERE b.user_id = ?
      ORDER BY b.booking_time DESC, b.booking_id DESC`,
    [req.user.id]
  );
  res.json(rows);
}));

// GET /api/bookings/:pnr   (full ticket with passengers and payments)
router.get('/:pnr', asyncHandler(async (req, res) => {
  res.json(await loadOwnedTicket(req.params.pnr, req.user));
}));

// POST /api/bookings/:pnr/passengers/:passengerId/cancel   -> sp_cancel_passenger
// The AFTER INSERT trigger on `cancellations` then promotes the first waitlisted passenger.
router.post('/:pnr/passengers/:passengerId/cancel', asyncHandler(async (req, res) => {
  const passengerId = v.int(req.params.passengerId, 'passengerId');
  const ticket = await loadOwnedTicket(req.params.pnr, req.user);
  if (!ticket.passengers.some((p) => p.passenger_id === passengerId)) {
    throw new HttpError(404, 'Passenger not found on this PNR');
  }
  const refund = await cancelPassenger(passengerId);
  const updated = await loadOwnedTicket(req.params.pnr, req.user);
  res.json({ refund_amount: refund, ticket: updated });
}));

// POST /api/bookings/:pnr/cancel   (cancel every passenger that is still active)
router.post('/:pnr/cancel', asyncHandler(async (req, res) => {
  const ticket = await loadOwnedTicket(req.params.pnr, req.user);
  const active = ticket.passengers.filter((p) => p.status !== 'CANCELLED');
  if (active.length === 0) throw new HttpError(400, 'All passengers on this PNR are already cancelled');

  let totalRefund = 0;
  for (const p of active) {
    // one transaction per passenger; a promoted waitlisted passenger on the same PNR is picked up next loop only if
    // still active, so re-check status from the DB each time
    const [[row]] = await pool.query('SELECT status FROM passengers WHERE passenger_id = ?', [p.passenger_id]);
    if (row.status === 'CANCELLED') continue;
    totalRefund += await cancelPassenger(p.passenger_id);
  }
  const updated = await loadOwnedTicket(req.params.pnr, req.user);
  res.json({ refund_amount: Math.round(totalRefund * 100) / 100, ticket: updated });
}));

module.exports = router;
