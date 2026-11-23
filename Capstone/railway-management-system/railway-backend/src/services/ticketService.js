const pool = require('../db');
const { withConnection, retryOnDeadlock } = require('../db');
const HttpError = require('../utils/httpError');

// The booking / cancellation logic lives in MySQL (sp_book_ticket, sp_cancel_passenger).
// These wrappers only call the procedures and read their OUT parameters.

async function bookTicket({ userId, runId, from, to, cls, passengers, method }) {
  return retryOnDeadlock(() =>
    withConnection(async (conn) => {
      await conn.query('CALL sp_book_ticket(?, ?, ?, ?, ?, ?, ?, @pnr)', [
        userId, runId, from, to, cls, JSON.stringify(passengers), method,
      ]);
      const [[row]] = await conn.query('SELECT @pnr AS pnr');
      return row.pnr;
    })
  );
}

async function bookDemoTicket({ userId, runId, from, to, cls, passengers, orderId, paymentId }) {
  return retryOnDeadlock(() =>
    withConnection(async (conn) => {
      await conn.query('CALL sp_book_ticket_demo(?, ?, ?, ?, ?, ?, ?, ?, @pnr)', [
        userId, runId, from, to, cls, JSON.stringify(passengers), orderId, paymentId,
      ]);
      const [[row]] = await conn.query('SELECT @pnr AS pnr');
      return row.pnr;
    })
  );
}

async function cancelPassenger(passengerId) {
  return retryOnDeadlock(() =>
    withConnection(async (conn) => {
      await conn.query('CALL sp_cancel_passenger(?, @refund)', [passengerId]);
      const [[row]] = await conn.query('SELECT @refund AS refund');
      return Number(row.refund);
    })
  );
}

// Ticket by PNR. publicView = true hides names, ages, fares, payments (used by the open PNR-status page).
async function getTicket(pnr, { publicView = false } = {}) {
  const [[booking]] = await pool.query(
    `SELECT b.booking_id, b.pnr, b.user_id, b.status, b.total_fare, b.booking_time
       FROM bookings b WHERE b.pnr = ?`, [pnr]);
  if (!booking) throw new HttpError(404, 'PNR not found');

  const [rows] = await pool.query(
    'SELECT * FROM v_booking_details WHERE pnr = ? ORDER BY passenger_id', [pnr]);
  if (rows.length === 0) throw new HttpError(404, 'PNR not found');

  const head = rows[0];
  const ticket = {
    pnr: booking.pnr,
    booking_status: booking.status,
    train_number: head.train_number,
    train_name: head.train_name,
    journey_date: head.journey_date,
    from: head.from_code,
    to: head.to_code,
    class: head.class_code,
    passengers: rows.map((r, i) => {
      const base = {
        passenger_no: i + 1,
        status: r.ticket_status,
        coach: r.coach_number,
        seat: r.seat_number,
        berth: r.berth_type,
        waitlist_no: r.waitlist_no,
      };
      return publicView ? base : { passenger_id: r.passenger_id, name: r.passenger, age: r.age, fare: r.fare, ...base };
    }),
  };

  if (!publicView) {
    const [estimates] = await pool.query(
      `SELECT passenger_id, ROUND(fare * CASE
                WHEN status = 'CANCELLED' THEN 0
                WHEN status = 'WAITLISTED' THEN 1.00
                WHEN hours_until_departure >= 48 THEN 0.90
                WHEN hours_until_departure >= 12 THEN 0.75
                WHEN hours_until_departure >= 4 THEN 0.50
                ELSE 0 END, 2) AS refund_estimate
         FROM (
           SELECT p.passenger_id, p.status, p.fare,
                  TIMESTAMPDIFF(HOUR, NOW(), fn_departure(b.run_id, b.from_seq)) AS hours_until_departure
             FROM passengers p JOIN bookings b ON b.booking_id = p.booking_id
            WHERE b.booking_id = ?
         ) AS passenger_estimates`,
      [booking.booking_id]
    );
    const estimateByPassenger = new Map(estimates.map((p) => [p.passenger_id, Number(p.refund_estimate)]));
    ticket.passengers = ticket.passengers.map((p) => ({
      ...p,
      refund_estimate: estimateByPassenger.get(p.passenger_id) ?? 0,
    }));
    ticket.booked_by = head.booked_by;
    ticket.booking_time = booking.booking_time;
    ticket.total_fare = booking.total_fare;
    const [payments] = await pool.query(
      `SELECT txn_type, amount, method, status, txn_ref, created_at
         FROM payments WHERE booking_id = ? ORDER BY payment_id`, [booking.booking_id]);
    ticket.payments = payments;
    ticket._owner_id = booking.user_id; // used for permission checks, stripped by the route
  }
  return ticket;
}

module.exports = { bookTicket, bookDemoTicket, cancelPassenger, getTicket };
