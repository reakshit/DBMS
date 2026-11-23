// Concurrency demo for your report/viva: many users fight for the last seats of one run.
// Uses the sample data (train 2, class 1A has exactly 2 seats). Expected on a FRESH database:
//   2 CONFIRMED, 4 WAITLISTED, and no seat ever allocated twice.
// Re-import railway_db.sql to reset before running it again.
require('../src/config');
const pool = require('../src/db');
const { bookTicket } = require('../src/services/ticketService');

(async () => {
  const [[run]] = await pool.query(
    `SELECT run_id, journey_date FROM train_runs
      WHERE train_id = 2 AND status = 'SCHEDULED' AND journey_date > CURDATE()
      ORDER BY journey_date DESC LIMIT 1`);
  if (!run) throw new Error('No future run found for train 2. Did you import railway_db.sql?');

  const attempts = 6;
  const users = [2, 3, 4]; // sample passengers
  console.log(`Run ${run.run_id} (${run.journey_date}): firing ${attempts} simultaneous bookings for 1A NDLS->AGC...`);

  const results = await Promise.allSettled(
    Array.from({ length: attempts }, (_, i) =>
      bookTicket({
        userId: users[i % users.length],
        runId: run.run_id,
        from: 'NDLS',
        to: 'AGC',
        cls: '1A',
        passengers: [{ name: `Racer ${i + 1}`, age: 30, gender: 'O' }],
        method: 'UPI',
      })
    )
  );
  results.forEach((r, i) =>
    console.log(`  booking ${i + 1}:`, r.status === 'fulfilled' ? `PNR ${r.value}` : `FAILED - ${r.reason.sqlMessage || r.reason.message}`));

  const [summary] = await pool.query(
    `SELECT p.status, COUNT(*) AS passengers
       FROM passengers p JOIN bookings b ON b.booking_id = p.booking_id
      WHERE b.run_id = ? AND b.class_id = 4 GROUP BY p.status`, [run.run_id]);
  console.table(summary);

  const [dupes] = await pool.query(
    `SELECT p.seat_id, COUNT(*) AS times_allocated
       FROM passengers p JOIN bookings b ON b.booking_id = p.booking_id
      WHERE b.run_id = ? AND p.status = 'CONFIRMED'
      GROUP BY p.seat_id HAVING COUNT(*) > 1`, [run.run_id]);
  console.log(dupes.length === 0 ? 'PASS: no seat was double-allocated.' : 'FAIL: double allocation found:', dupes);

  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
