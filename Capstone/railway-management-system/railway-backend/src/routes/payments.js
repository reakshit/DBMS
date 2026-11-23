const crypto = require('crypto');
const express = require('express');
const pool = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const v = require('../utils/validate');
const { authenticate } = require('../middleware/auth');
const { bookDemoTicket, getTicket } = require('../services/ticketService');

const router = express.Router();
router.use(authenticate);

function cleanPassengers(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > 6) {
    throw new HttpError(400, 'passengers must be an array of 1 to 6 people');
  }
  return list.map((p, i) => ({
    name: v.str(p?.name, `passengers[${i}].name`, 100),
    age: v.int(p?.age, `passengers[${i}].age`, { min: 1, max: 120 }),
    gender: v.oneOf(p?.gender, `passengers[${i}].gender`, ['M', 'F', 'O']),
  }));
}

async function ticketForBooking(bookingId, userId) {
  const [[booking]] = await pool.query(
    'SELECT pnr FROM bookings WHERE booking_id = ? AND user_id = ?',
    [bookingId, userId]
  );
  if (!booking) throw new HttpError(404, 'Demo booking was not found');
  const ticket = await getTicket(booking.pnr);
  const { _owner_id, ...safe } = ticket;
  return safe;
}

router.post('/orders', asyncHandler(async (req, res) => {
  const runId = v.int(req.body.run_id, 'run_id');
  const from = v.code(req.body.from, 'from', 5);
  const to = v.code(req.body.to, 'to', 5);
  const cls = v.code(req.body.class, 'class', 3);
  const passengers = cleanPassengers(req.body.passengers);
  if (from === to) throw new HttpError(400, 'Origin and destination must be different');

  const [[journey]] = await pool.query(
    `SELECT r.status AS run_status, r.train_id, cc.class_id, cc.rate_per_km,
            a.stop_seq AS from_seq, a.distance_km AS from_km,
            b.stop_seq AS to_seq, b.distance_km AS to_km,
            fn_departure(r.run_id, a.stop_seq) AS departure_at,
            EXISTS(SELECT 1 FROM train_coaches tc WHERE tc.train_id = r.train_id AND tc.class_id = cc.class_id) AS has_class
       FROM train_runs r
       JOIN trains t ON t.train_id = r.train_id AND t.is_active = TRUE
       JOIN coach_classes cc ON cc.class_code = ?
       JOIN train_stops a ON a.train_id = r.train_id
       JOIN stations sa ON sa.station_id = a.station_id AND sa.station_code = ?
       JOIN train_stops b ON b.train_id = r.train_id AND b.stop_seq > a.stop_seq
       JOIN stations sb ON sb.station_id = b.station_id AND sb.station_code = ?
      WHERE r.run_id = ?
      LIMIT 1`,
    [cls, from, to, runId]
  );
  if (!journey || journey.from_seq >= journey.to_seq) {
    throw new HttpError(400, 'Invalid origin/destination for this train');
  }
  if (journey.run_status !== 'SCHEDULED' || new Date(journey.departure_at) <= new Date()) {
    throw new HttpError(400, 'This train is not open for booking');
  }
  if (!journey.has_class) throw new HttpError(400, 'This class is not available on this train');

  const farePerPassenger = Math.round((journey.to_km - journey.from_km) * Number(journey.rate_per_km) * 100) / 100;
  const amountPaise = Math.round(farePerPassenger * passengers.length * 100);
  if (amountPaise < 100) throw new HttpError(400, 'Demo payment amount must be at least ₹1');

  const localOrderId = crypto.randomUUID();
  const demoOrderId = `demo_${crypto.randomUUID().replace(/-/g, '')}`;
  const payload = { run_id: runId, from, to, class: cls, passengers };
  try {
    await pool.query(
      `INSERT INTO payment_orders (razorpay_order_id, local_order_id, user_id, amount_paise, request_json)
       VALUES (?, ?, ?, ?, ?)`,
      [demoOrderId, localOrderId, req.user.id, amountPaise, JSON.stringify(payload)]
    );
  } catch (error) {
    console.error('Could not save demo payment order:', error.message);
    throw new HttpError(500, 'Could not save the demo payment. No real payment was made.');
  }

  res.status(201).json({
    order_id: demoOrderId,
    amount: amountPaise,
    currency: 'INR',
    demo: true,
  });
}));

router.post('/verify', asyncHandler(async (req, res) => {
  const orderId = v.str(req.body.order_id, 'order_id', 40);
  const [[order]] = await pool.query(
    'SELECT * FROM payment_orders WHERE razorpay_order_id = ? AND user_id = ?',
    [orderId, req.user.id]
  );
  if (!order) throw new HttpError(404, 'Demo payment order not found');
  if (order.status === 'BOOKED') {
    return res.json({ ticket: await ticketForBooking(order.booking_id, req.user.id) });
  }
  if (order.status !== 'CREATED') {
    throw new HttpError(409, `Demo payment order is ${order.status.toLowerCase().replace(/_/g, ' ')}`);
  }

  const payload = typeof order.request_json === 'string' ? JSON.parse(order.request_json) : order.request_json;
  const demoPaymentId = `pay_${crypto.randomUUID().replace(/-/g, '')}`;
  try {
    const pnr = await bookDemoTicket({
      userId: req.user.id,
      runId: payload.run_id,
      from: payload.from,
      to: payload.to,
      cls: payload.class,
      passengers: payload.passengers,
      orderId,
      paymentId: demoPaymentId,
    });
    const ticket = await getTicket(pnr);
    const { _owner_id, ...safe } = ticket;
    return res.json({ ticket: safe, demo: true });
  } catch (bookingError) {
    const [[latest]] = await pool.query(
      'SELECT status, booking_id FROM payment_orders WHERE razorpay_order_id = ? AND user_id = ?',
      [orderId, req.user.id]
    );
    if (latest?.status === 'BOOKED') {
      return res.json({ ticket: await ticketForBooking(latest.booking_id, req.user.id), demo: true });
    }
    console.error('Could not complete demo booking:', bookingError.sqlMessage || bookingError.message);
    throw bookingError;
  }
}));

module.exports = router;
