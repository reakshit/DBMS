# Railway Reservation Backend (Express + MySQL)

A thin REST API over your `railway_db.sql`. All the important logic (seat allocation, waitlist,
refund slabs, promotion trigger, fare audit) stays **inside MySQL**; the API validates input,
handles auth/roles and calls the stored procedures.

## Setup

```bash
# 1. In MySQL Workbench run railway_db.sql (creates DB, procedures, triggers, sample data)
npm install
cp .env.example .env          # then edit DB_PASSWORD and set a real JWT_SECRET
npm run migrate:demo-payments # adds the demo payment-order table and booking procedure
npm run seed:passwords        # gives the sample users a real bcrypt hash (password: Password@123)
npm run dev                   # http://localhost:4000/api/health
```

Sample logins: `admin@rail.local` (ADMIN), `riya@mail.com`, `aman@mail.com`, `neha@mail.com` (PASSENGER).
To test STAFF endpoints, promote a user: `PATCH /api/admin/users/:id/role {"role":"STAFF"}`.

## Endpoints

| Method | Path | Access | Calls |
|---|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | public | bcrypt + JWT; login requires `account_type` (`USER` or `ADMIN`) and checks it against the database role |
| GET | `/api/auth/me` | any user | |
| GET | `/api/runs/upcoming?days=7` | public | scheduled runs for the next 1–30 days |
| GET | `/api/stations?q=` | public | |
| GET | `/api/trains/search?from=NDLS&to=BPL&date=YYYY-MM-DD` | public | `sp_search_trains` |
| GET | `/api/trains/:trainNumber/schedule` | public | `v_train_schedule` |
| GET | `/api/runs/:runId/availability?from=&to=` | public | `fn_available_seats` |
| GET | `/api/pnr/:pnr` | public | `v_booking_details` (no names/fares) |
| POST | `/api/payments/orders` | logged in | creates a simulated UPI order for validated booking details |
| POST | `/api/payments/verify` | logged in | marks the demo payment successful and atomically creates the booking |
| GET | `/api/bookings`, `/api/bookings/:pnr` | owner (staff/admin can view any PNR) | private ticket response includes a current refund estimate per passenger |
| POST | `/api/bookings/:pnr/passengers/:passengerId/cancel` | owner/staff/admin | `sp_cancel_passenger` + trigger |
| POST | `/api/bookings/:pnr/cancel` | owner/staff/admin | cancels all active passengers |
| GET | `/api/staff/runs?date=`, `/api/staff/runs/:runId/chart` | STAFF, ADMIN | passenger chart |
| PATCH | `/api/staff/runs/:runId/status` | STAFF, ADMIN | mark DEPARTED / CANCELLED |
| POST | `/api/admin/stations`, `/trains`, `/trains/:id/stops`, `/trains/:id/coaches`, `/runs` | ADMIN | `sp_add_coach` for coaches |
| GET | `/api/admin/trains` | ADMIN | train directory and upcoming run counts |
| PATCH | `/api/admin/trains/:id` | ADMIN | update train details or active status |
| PUT | `/api/admin/fares/:classCode` | ADMIN | fires `trg_fare_audit` |
| GET | `/api/admin/fare-audit`, `/users` | ADMIN | |
| PATCH | `/api/admin/users/:id/role` | ADMIN | |
| GET | `/api/admin/reports/revenue-by-train`, `revenue-by-route`, `top-trains`, `cancellation-rate` | ADMIN | `v_revenue_by_train` + aggregates |

### Example

```bash
# login
curl -X POST localhost:4000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"riya@mail.com","password":"Password@123"}'

# search (use a date within the next 7 days; sample runs are created for CURDATE()+1..7)
curl "localhost:4000/api/trains/search?from=NDLS&to=BPL&date=2026-10-31"

# create a demo payment order (use run_id from the search result)
curl -X POST localhost:4000/api/payments/orders -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"run_id":3,"from":"NDLS","to":"BPL","class":"SL",
       "passengers":[{"name":"Riya Sharma","age":24,"gender":"F"}]}'
# Then POST {"order_id":"<order_id from the response>"} to /api/payments/verify.
# This only records a simulated payment; it never charges real money.
```

Payments are simulated for demonstration: no Razorpay account, payment credentials, UPI app, or external payment service is used. The booking page asks for confirmation, then the backend records a simulated UPI success and creates the ticket. No real money is charged.

The legacy direct `POST /api/bookings` endpoint is disabled; bookings must use the demo payment confirmation flow. The concurrency demo still calls the original stored procedure directly and is for database testing only.

Errors come back as `{ "error": "..." }`. Business-rule messages raised by your procedures with
`SIGNAL SQLSTATE '45000'` (for example "Train has already departed") are passed through as HTTP 400.

## Concurrency test (great for the report and viva)

`npm run test:concurrency` fires 6 simultaneous bookings at a class with only 2 seats and checks that
no seat is double-booked (expected: 2 CONFIRMED, 4 WAITLISTED). Re-import the SQL to reset between runs.
`sp_book_ticket` serialises bookings by locking the `train_runs` row with `SELECT ... FOR UPDATE`;
the API also retries automatically if MySQL reports a deadlock.

## Things to know

- The `fare_audit.changed_by` column stores MySQL's `USER()` (the DB account, e.g. `root@localhost`), not the app admin,
  because the trigger cannot see the API user.
- Cancelling a whole *run* (`PATCH /api/staff/runs/:id/status`) does not refund existing bookings.
- Demo payment records are marked successful without a real charge. Cancellation refund amounts are calculated by MySQL; no money is moved during booking or cancellation.
- Public sign-up always creates PASSENGER accounts; only an ADMIN can promote roles.

## Load real train data (optional)

`npm run import:datameet` loads real stations, trains and timetables from the public
[datameet/railways](https://github.com/datameet/railways) dataset (about 2016, so timetables are dated; not affiliated with Indian Railways).
It downloads the three JSON files into `scripts/data/` on first run (about 100 MB), then inserts through your own tables and `sp_add_coach`.

```bash
npm run import:datameet                         # about 40 trains, bookable for the next 14 days
npm run import:datameet -- --limit 80 --days 30
npm run import:datameet -- --trains 12002,12301
npm run import:datameet -- --small              # 4-6 seat coaches so the waitlist is easy to demo
npm run import:datameet -- --dry-run            # report only, writes nothing
```

If Node runs out of memory while reading the dataset, run `node --max-old-space-size=4096 scripts/import-datameet.js`.

What it does and its limits:
- Keeps real halts only (the dataset also lists every pass-through station) and skips local, MEMU and passenger trains.
- Per-stop distances are **estimated**: straight-line distance between stations scaled to the train's official total.
- Coach layouts are generic (SL 3x72, 3A 2x64, 2A 1x46, 1A 1x24 seats). Shatabdi chair cars are stored as 3A.
- Safe to re-run. Trains that already have stops are skipped, so the sample trains 12951 and 12616 from `railway_db.sql` stay as they are
  (the real 12951 is the Mumbai Rajdhani; delete the sample train first if you want the real one).
- Runs are only created for the next N days. Add more from Admin > Trains and stations > Open dates for booking.
