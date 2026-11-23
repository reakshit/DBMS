# Rail Desk: frontend for the railway reservation backend

React 18 + Vite + Tailwind + React Router. It talks to the Express API in `railway-backend`.

## Run it

```bash
# terminal 1: backend (see its README; MySQL loaded, npm run seed:passwords done)
cd railway-backend && npm run dev        # http://localhost:4000

# terminal 2: frontend
cd railway-frontend
npm install
npm run dev                              # http://localhost:5173
```

In development Vite proxies `/api` to `http://localhost:4000`, so no CORS setup is needed.
For a deployed build set `VITE_API_URL` (see `.env.example`) and add the site origin to `CORS_ORIGIN` in the backend `.env`.

## Sample logins (password `Password@123`)

| Account | Role |
|---|---|
| riya@mail.com, aman@mail.com, neha@mail.com | Passenger |
| admin@rail.local | Admin (also sees the Staff desk) |

To try the staff-only view, promote a user from Admin > Users.

## Pages

| Route | Who | Backend calls |
|---|---|---|
| `/`, `/login` | signed out | login screen; successful sign-in uses the role stored in the database |
| `/register` | signed out | passenger account registration |
| `/trains` | signed in | stations and train search form, PNR shortcut, and refund information |
| `/search?from=&to=&date=` | signed in | `GET /trains/search` (calls `sp_search_trains`) |
| `/upcoming` | signed in | `GET /runs/upcoming?days=7`, scheduled train runs in a selectable 3–30 day window |
| `/train/:number` | signed in | `GET /trains/:n/schedule` |
| `/pnr/:pnr` | signed in | `GET /pnr/:pnr` (no names or fares) |
| `/login` | signed out | `/auth/login` |
| `/book?run=&from=&to=&date=&class=` | signed in | Simulated UPI confirmation; creates a demo payment record and booking |
| `/payment-simulation` | signed in | Scannable local demo QR or phone-number simulation |
| `/payment-done` | signed in | Confirms the simulation, returns to booking, then lets the user create the ticket |
| `/bookings`, `/ticket/:pnr` | signed in | list, ticket, cancel one passenger or the whole PNR |
| `/staff` | staff, admin | runs by date, passenger chart, mark departed or cancelled |
| `/admin` | admin | reports, train directory/editing, upcoming runs, add stations/trains/stops/coaches/runs, fares + audit log, user roles |

## Notes

- Seat availability shows "Waitlist open" at 0 seats. Booking more passengers than seats left is allowed and the booking page warns how many will be waitlisted, matching `sp_book_ticket`.
- Admin forms that create stops, coaches, and runs still ask for a Train ID; the train directory displays IDs and fills the ID into the stop/coach forms when adding a train.
- Train management lists train IDs and upcoming-run counts, supports editing train details and activation, and shows all active scheduled runs in the next 7 days.
- Search results can be filtered by class or seat availability and sorted by departure, fare, or available seats. Booking rechecks live availability and asks for review if the waitlist estimate worsens. Ticket cancellation shows a refund estimate before confirmation.
- Payments are simulated for demonstration only. No Razorpay credentials are needed, no external payment service is called, and no real money is charged. Run `npm run migrate:demo-payments` in the backend before booking.
- The JWT is kept in `localStorage`; a 401 from any call signs the user out.
- Passenger registration and account roles are stored in the MySQL `users` table. Login requires choosing User or Admin, and the backend rejects credentials if that choice does not match the database role.
- All booking, train, PNR, staff, and admin features require sign-in. Admin and staff pages additionally enforce database roles.
- Admin users land on `/admin` after sign-in and when opening the home route; passenger and staff users land on `/trains`.
