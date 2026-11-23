// Loads real Indian Railways stations, trains and timetables into railway_db.
//
// Source: the datameet/railways community dataset (about 2016, so timetables are dated):
//   https://github.com/datameet/railways
// Not affiliated with Indian Railways. Fine for a coursework database, not for real travel.
//
// Usage (run from railway-backend, after importing railway_db.sql and creating .env):
//   npm run import:datameet                       # about 40 trains (famous ones first, then best-connected), runs for the next 14 days
//   npm run import:datameet -- --limit 80 --days 30
//   npm run import:datameet -- --trains 12951,12301,12002,12627
//   npm run import:datameet -- --small            # tiny coaches (4-6 seats) to demo the waitlist
//   npm run import:datameet -- --dry-run          # parse and report, write nothing
//
// Safe to re-run: trains that already have stops are skipped, stations are never overwritten.
require('../src/config');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const BASE = 'https://raw.githubusercontent.com/datameet/railways/master';
const DATA_DIR = path.join(__dirname, 'data');
const FILES = ['stations.json', 'trains.json', 'schedules.json'];

// ---------- CLI ----------
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const LIMIT = Number(opt('limit', 40));
const DAYS = Number(opt('days', 14));
const ONLY = opt('trains', '') ? opt('trains', '').split(',').map((s) => s.trim()) : null;
const SMALL = flag('small');

// Always included (when importable) so common demo routes such as NDLS to BPL return results.
const PINNED = ['12951', '12952', '12301', '12302', '12002', '12001', '12615', '12616', '12627', '12628', '12951', '12423', '12424', '12559', '12560'];
const DRY = flag('dry-run');

// Datameet train type -> our ENUM. Types not listed here (local, MEMU, passenger...) are skipped.
const TYPE_MAP = { Raj: 'RAJDHANI', Shtb: 'SHATABDI', Drnt: 'SUPERFAST', SF: 'SUPERFAST', Exp: 'EXPRESS', Mail: 'EXPRESS', SKr: 'SUPERFAST', Hyd: 'EXPRESS' };

// Coach layout per class: [coach prefix, coach count, seats per coach]
const LAYOUT = {
  SL: ['S', 3, 72],
  '3A': ['B', 2, 64],
  '2A': ['A', 1, 46],
  '1A': ['H', 1, 24],
};
const SMALL_SEATS = { SL: 6, '3A': 6, '2A': 4, '1A': 4 };

// ---------- helpers ----------
async function ensureFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const f of FILES) {
    const dest = path.join(DATA_DIR, f);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) continue;
    console.log(`Downloading ${f} ...`);
    const res = await fetch(`${BASE}/${f}`);
    if (!res.ok) throw new Error(`Could not download ${f} (HTTP ${res.status}). Download it manually from ${BASE}/${f} into scripts/data/`);
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
  }
}
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));

const titleCase = (s) =>
  String(s).toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\s+/g, ' ').trim();
const clip = (s, n) => String(s).slice(0, n);
const hms = (v) => (v && v !== 'None' ? v.slice(0, 8) : null);

function haversineKm([lon1, lat1], [lon2, lat2]) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Real halts only: the dataset also lists every pass-through station with arrival == departure.
function haltsOf(rows) {
  return rows.filter((r, i) => i === 0 || i === rows.length - 1 || (r.arrival !== 'None' && r.departure !== 'None' && r.arrival !== r.departure));
}

// Cumulative km per stop. The dataset has no per-stop distance, only the train's total, so we measure the
// straight line between consecutive stations and scale it so the last stop equals the official total distance.
function cumulativeDistances(stops, coords, totalKm) {
  const legs = [];
  for (let i = 1; i < stops.length; i++) {
    const a = coords.get(stops[i - 1].station_code), b = coords.get(stops[i].station_code);
    legs.push(a && b ? haversineKm(a, b) : null);
  }
  const known = legs.filter((x) => x !== null);
  if (known.length === 0) return null;
  const avg = known.reduce((s, x) => s + x, 0) / known.length;
  const filled = legs.map((x) => (x === null ? avg : x));
  const sum = filled.reduce((s, x) => s + x, 0) || 1;
  const scale = totalKm > 0 ? totalKm / sum : 1;
  let acc = 0;
  const out = [0];
  for (const l of filled) { acc += l * scale; out.push(Math.round(acc)); }
  for (let i = 1; i < out.length; i++) if (out[i] <= out[i - 1]) out[i] = out[i - 1] + 1; // strictly increasing
  return out;
}

function classesFor(p) {
  const set = new Set();
  if (p.sleeper) set.add('SL');
  if (p.third_ac) set.add('3A');
  if (p.second_ac) set.add('2A');
  if (p.first_ac) set.add('1A');
  // Our schema has no chair car class. Shatabdi chair cars are stored as 3A (and executive as 1A) so those trains stay bookable.
  if (p.chair_car && (set.size === 0 || p.type === 'Shtb')) set.add('3A');
  return [...set];
}

// ---------- main ----------
(async () => {
  await ensureFiles();
  console.log('Reading dataset (about 100 MB, takes a few seconds) ...');
  const stationFeat = readJson('stations.json').features;
  const trainFeat = readJson('trains.json').features;
  const schedules = readJson('schedules.json');

  const stationInfo = new Map(); // code -> { name, city, state, coord }
  for (const f of stationFeat) {
    const p = f.properties;
    if (!p.code || p.code.length > 5 || /[^A-Z0-9]/.test(p.code)) continue; // dummy codes like XX-BECE
    stationInfo.set(p.code, {
      name: clip(titleCase(p.name || p.code), 100),
      city: clip(titleCase((p.address || p.name || p.code).split(',')[0]), 60),
      state: clip(p.state || 'Unknown', 60),
      coord: f.geometry?.coordinates || null,
    });
  }
  const coords = new Map([...stationInfo].filter(([, v]) => v.coord).map(([k, v]) => [k, v.coord]));

  const rowsByTrain = new Map();
  for (const r of schedules) {
    if (!rowsByTrain.has(r.train_number)) rowsByTrain.set(r.train_number, []);
    rowsByTrain.get(r.train_number).push(r);
  }

  // Build candidate trains and drop the ones we cannot store cleanly
  const skipped = {};
  const skip = (why) => { skipped[why] = (skipped[why] || 0) + 1; };
  const candidates = [];
  for (const f of trainFeat) {
    const p = f.properties;
    if (ONLY && !ONLY.includes(p.number)) continue;
    if (!/^\d{5}$/.test(p.number)) { skip('train number not 5 digits'); continue; }
    if (!TYPE_MAP[p.type]) { skip('local / passenger / MEMU type'); continue; }
    const classes = classesFor(p);
    if (classes.length === 0) { skip('no SL / AC classes'); continue; }
    const raw = (rowsByTrain.get(p.number) || []).sort((a, b) => a.id - b.id);
    if (raw.length < 2) { skip('no timetable rows'); continue; }
    const stops = haltsOf(raw);
    if (stops.length < 2 || stops.length > 255) { skip('stop count out of range'); continue; }
    if (stops.some((s) => !stationInfo.has(s.station_code))) { skip('unknown or dummy station code'); continue; }
    if (new Set(stops.map((s) => s.station_code)).size !== stops.length) { skip('visits a station twice'); continue; }
    // times must move forward through the journey
    let prev = -1, ok = true;
    for (const s of stops) {
      for (const t of [hms(s.arrival), hms(s.departure)]) {
        if (!t) continue;
        const m = (s.day - 1) * 1440 + Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
        if (m < prev) ok = false;
        prev = Math.max(prev, m);
      }
    }
    if (!ok) { skip('timetable goes backwards in time'); continue; }
    const dist = cumulativeDistances(stops, coords, p.distance);
    if (!dist) { skip('no station coordinates'); continue; }
    candidates.push({ number: p.number, name: clip(p.name, 100), type: TYPE_MAP[p.type], classes, stops, dist });
  }

  // Prefer trains that share busy stations, so searches between many city pairs return results
  let chosen = candidates;
  if (!ONLY) {
    const freq = new Map();
    for (const t of candidates) for (const s of t.stops) freq.set(s.station_code, (freq.get(s.station_code) || 0) + 1);
    const score = (t) => t.stops.reduce((sum, s) => sum + freq.get(s.station_code), 0) / Math.sqrt(t.stops.length);
    const pinned = PINNED.map((n) => candidates.find((t) => t.number === n)).filter(Boolean);
    const pinnedSet = new Set(pinned.map((t) => t.number));
    const rest = candidates.filter((t) => !pinnedSet.has(t.number)).sort((a, b) => score(b) - score(a));
    chosen = [...new Set([...pinned, ...rest])].slice(0, Math.max(LIMIT, pinned.length));
  }

  const usedStations = new Set(chosen.flatMap((t) => t.stops.map((s) => s.station_code)));
  console.log(`\nEligible trains: ${candidates.length}. Selected: ${chosen.length}. Stations needed: ${usedStations.size}.`);
  console.log('Skipped while filtering:', skipped);
  if (ONLY) {
    const missing = ONLY.filter((n) => !chosen.some((t) => t.number === n));
    if (missing.length) console.log('Not importable (see skip reasons above):', missing.join(', '));
  }
  for (const t of chosen.slice(0, 8)) {
    console.log(`  ${t.number} ${t.name} | ${t.stops.length} halts | ${t.dist.at(-1)} km | ${t.classes.join(',')}`);
  }
  if (chosen.length > 8) console.log(`  ... and ${chosen.length - 8} more`);
  if (DRY) { console.log('\nDry run: nothing written.'); return; }
  if (chosen.length === 0) return;

  const pool = require('../src/db');
  const conn = await pool.getConnection();
  try {
    const [classRows] = await conn.query('SELECT class_id, class_code FROM coach_classes');
    const classId = Object.fromEntries(classRows.map((r) => [r.class_code, r.class_id]));
    if (!classId.SL) throw new Error('coach_classes is empty. Import railway_db.sql first.');

    // Stations: insert the missing ones only
    await conn.query(
      'INSERT IGNORE INTO stations (station_code, station_name, city, state) VALUES ?',
      [[...usedStations].map((c) => { const s = stationInfo.get(c); return [c, s.name, s.city, s.state]; })]
    );
    const [stRows] = await conn.query('SELECT station_id, station_code FROM stations WHERE station_code IN (?)', [[...usedStations]]);
    const stationId = Object.fromEntries(stRows.map((r) => [r.station_code, r.station_id]));

    let added = 0, existing = 0, stopRows = 0, coaches = 0, runs = 0;
    const start = new Date();
    for (const t of chosen) {
      const [[have]] = await conn.query(
        `SELECT t.train_id, (SELECT COUNT(*) FROM train_stops s WHERE s.train_id = t.train_id) AS stops
           FROM trains t WHERE t.train_number = ?`, [t.number]);
      if (have && have.stops > 0) { existing++; continue; }

      await conn.beginTransaction();
      try {
        let trainId = have?.train_id;
        if (!trainId) {
          const [r] = await conn.query('INSERT INTO trains (train_number, train_name, train_type) VALUES (?, ?, ?)', [t.number, t.name, t.type]);
          trainId = r.insertId;
        }
        await conn.query(
          'INSERT INTO train_stops (train_id, stop_seq, station_id, arrival_time, departure_time, day_offset, distance_km) VALUES ?',
          [t.stops.map((s, i) => [
            trainId, i + 1, stationId[s.station_code],
            i === 0 ? null : hms(s.arrival), i === t.stops.length - 1 ? null : hms(s.departure),
            Math.min(10, Math.max(0, s.day - 1)), t.dist[i],
          ])]
        );
        stopRows += t.stops.length;

        const [[hasCoach]] = await conn.query('SELECT COUNT(*) AS n FROM train_coaches WHERE train_id = ?', [trainId]);
        if (!hasCoach.n) {
          for (const cls of t.classes) {
            const [prefix, count, seats] = LAYOUT[cls];
            const n = SMALL ? 1 : count;
            for (let i = 1; i <= n; i++) {
              await conn.query('CALL sp_add_coach(?, ?, ?, ?)', [trainId, classId[cls], `${prefix}${i}`, SMALL ? SMALL_SEATS[cls] : seats]);
              coaches++;
            }
          }
        }

        const runValues = [];
        for (let d = 1; d <= DAYS; d++) {
          const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
          const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
          runValues.push([trainId, iso]);
        }
        const [rr] = await conn.query('INSERT IGNORE INTO train_runs (train_id, journey_date) VALUES ?', [runValues]);
        runs += rr.affectedRows;

        await conn.commit();
        added++;
      } catch (e) {
        await conn.rollback();
        console.error(`  ${t.number} ${t.name}: failed and rolled back (${e.message})`);
      }
    }
    console.log(`\nDone. Trains added: ${added}, already present: ${existing}, stops: ${stopRows}, coaches: ${coaches}, runs: ${runs}.`);
    const [[c]] = await conn.query('SELECT (SELECT COUNT(*) FROM stations) s, (SELECT COUNT(*) FROM trains) t, (SELECT COUNT(*) FROM train_stops) st, (SELECT COUNT(*) FROM seats) se');
    console.log(`Database now has ${c.s} stations, ${c.t} trains, ${c.st} stops, ${c.se} seats.`);
  } finally {
    conn.release();
    await pool.end();
  }
})().catch((e) => { console.error('Import failed:', e.message); process.exit(1); });
