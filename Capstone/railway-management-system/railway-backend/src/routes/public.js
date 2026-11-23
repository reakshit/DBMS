const express = require('express');
const pool = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const v = require('../utils/validate');
const { getTicket } = require('../services/ticketService');

const router = express.Router();

// GET /api/runs/upcoming?days=7
router.get('/runs/upcoming', asyncHandler(async (req, res) => {
  const days = v.int(req.query.days ?? 7, 'days', { min: 1, max: 30 });
  const [rows] = await pool.query(
    `SELECT r.run_id, t.train_number, t.train_name, r.journey_date, r.status,
            origin.station_code AS from_code, origin.station_name AS from_name,
            destination.station_code AS to_code, destination.station_name AS to_name,
            start_stop.departure_time AS departs, end_stop.arrival_time AS arrives
       FROM train_runs r
       JOIN trains t ON t.train_id = r.train_id AND t.is_active = TRUE
       JOIN train_stops start_stop ON start_stop.train_id = t.train_id AND start_stop.stop_seq = 1
       JOIN stations origin ON origin.station_id = start_stop.station_id
       JOIN train_stops end_stop ON end_stop.train_id = t.train_id
         AND end_stop.stop_seq = (SELECT MAX(last_stop.stop_seq) FROM train_stops last_stop WHERE last_stop.train_id = t.train_id)
       JOIN stations destination ON destination.station_id = end_stop.station_id
      WHERE r.status = 'SCHEDULED'
        AND r.journey_date >= CURDATE()
        AND r.journey_date < DATE_ADD(CURDATE(), INTERVAL ? DAY)
      ORDER BY r.journey_date, start_stop.departure_time, t.train_number`,
    [days]
  );
  res.json({ days, runs: rows });
}));

// GET /api/stations?q=del
router.get('/stations', asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const like = `%${q}%`;
  const [rows] = await pool.query(
    `SELECT station_id, station_code, station_name, city, state
       FROM stations
      WHERE ? = '' OR station_code LIKE ? OR station_name LIKE ? OR city LIKE ?
      ORDER BY station_name`,
    [q, like, like, like]
  );
  res.json(rows);
}));

// GET /api/trains/search?from=NDLS&to=BPL&date=2026-11-02   -> sp_search_trains
router.get('/trains/search', asyncHandler(async (req, res) => {
  const from = v.code(req.query.from, 'from', 5);
  const to = v.code(req.query.to, 'to', 5);
  const date = v.date(req.query.date);
  if (from === to) throw new HttpError(400, 'Origin and destination must be different');

  const [result] = await pool.query('CALL sp_search_trains(?, ?, ?)', [from, to, date]);
  const rows = result[0]; // first result set of the CALL

  // The procedure returns one row per (train, class); group them per train for the UI
  const trains = new Map();
  for (const r of rows) {
    if (!trains.has(r.run_id)) {
      trains.set(r.run_id, {
        run_id: r.run_id,
        train_number: r.train_number,
        train_name: r.train_name,
        departs: r.departs,
        arrives: r.arrives,
        distance_km: r.distance_km,
        classes: [],
      });
    }
    trains.get(r.run_id).classes.push({ class_code: r.class_code, fare: r.fare, seats_available: r.seats_available });
  }
  res.json({ from, to, date, trains: [...trains.values()] });
}));

// GET /api/trains/:trainNumber/schedule   -> v_train_schedule
router.get('/trains/:trainNumber/schedule', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM v_train_schedule WHERE train_number = ? ORDER BY stop_seq',
    [req.params.trainNumber]
  );
  if (rows.length === 0) throw new HttpError(404, 'Train not found');
  res.json({ train_number: rows[0].train_number, train_name: rows[0].train_name, stops: rows.map(({ train_number, train_name, ...stop }) => stop) });
}));

// GET /api/runs/:runId/availability?from=NDLS&to=BPL   -> fn_available_seats per class
router.get('/runs/:runId/availability', asyncHandler(async (req, res) => {
  const runId = v.int(req.params.runId, 'runId');
  const from = v.code(req.query.from, 'from', 5);
  const to = v.code(req.query.to, 'to', 5);

  const [[run]] = await pool.query('SELECT run_id, train_id, journey_date, status FROM train_runs WHERE run_id = ?', [runId]);
  if (!run) throw new HttpError(404, 'Run not found');

  const [stops] = await pool.query(
    `SELECT st.station_code, s.stop_seq
       FROM train_stops s JOIN stations st ON st.station_id = s.station_id
      WHERE s.train_id = ? AND st.station_code IN (?, ?)`,
    [run.train_id, from, to]
  );
  const fromSeq = stops.find((s) => s.station_code === from)?.stop_seq;
  const toSeq = stops.find((s) => s.station_code === to)?.stop_seq;
  if (fromSeq === undefined || toSeq === undefined || fromSeq >= toSeq) {
    throw new HttpError(400, 'Invalid origin/destination for this train');
  }

  const [classes] = await pool.query(
    `SELECT DISTINCT cc.class_id, cc.class_code, cc.class_name
       FROM train_coaches tc JOIN coach_classes cc ON cc.class_id = tc.class_id
      WHERE tc.train_id = ? ORDER BY cc.class_id`,
    [run.train_id]
  );

  const result = [];
  for (const c of classes) {
    const [[avail]] = await pool.query('SELECT fn_available_seats(?, ?, ?, ?) AS seats_available', [runId, c.class_id, fromSeq, toSeq]);
    const [[wl]] = await pool.query(
      `SELECT COUNT(*) AS waitlisted
         FROM passengers p JOIN bookings b ON b.booking_id = p.booking_id
        WHERE b.run_id = ? AND b.class_id = ? AND p.status = 'WAITLISTED'`,
      [runId, c.class_id]
    );
    result.push({ class_code: c.class_code, class_name: c.class_name, seats_available: avail.seats_available, waitlisted: wl.waitlisted });
  }
  res.json({ run_id: runId, journey_date: run.journey_date, run_status: run.status, from, to, classes: result });
}));

// GET /api/pnr/:pnr   (open PNR status: no names, ages or fares)
router.get('/pnr/:pnr', asyncHandler(async (req, res) => {
  if (!/^\d{10}$/.test(req.params.pnr)) throw new HttpError(400, 'PNR must be 10 digits');
  res.json(await getTicket(req.params.pnr, { publicView: true }));
}));

module.exports = router;
