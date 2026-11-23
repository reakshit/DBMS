import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { ErrorNote, Field, Spinner, StationBoard, useAsync, useToast } from '../ui';
import { CLASS_NAMES, fmtDate, fmtTime, inr } from '../format';

const blank = () => ({ name: '', age: '', gender: 'M' });

export default function Book() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const run = Number(params.get('run'));
  const from = params.get('from');
  const to = params.get('to');
  const date = params.get('date');
  const cls = params.get('class');

  const [passengers, setPassengers] = useState(() => (
    Array.isArray(location.state?.passengers) && location.state.passengers.length > 0
      ? location.state.passengers
      : [blank()]
  ));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const paymentDoneOrderId = location.state?.demoPaymentDone ? location.state.orderId : null;

  // Re-run the search so a page refresh still knows the train, fare and seats left
  const { data, error: loadErr, loading } = useAsync(() => api.search(from, to, date), [from, to, date]);
  const {
    data: availability,
    error: availabilityError,
    loading: availabilityLoading,
    reload: reloadAvailability,
    setData: setAvailability,
  } = useAsync(() => run && from && to ? api.availability(run, from, to) : Promise.resolve(null), [run, from, to]);
  const train = data?.trains.find((t) => t.run_id === run);
  const klass = train?.classes.find((c) => c.class_code === cls);
  const availableSeats = availability?.classes.find((c) => c.class_code === cls)?.seats_available ?? klass?.seats_available ?? 0;

  const update = (i, patch) => setPassengers((l) => l.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const n = passengers.length;
  const total = klass ? klass.fare * n : 0;
  const waitlisted = klass ? Math.max(0, n - availableSeats) : 0;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const latest = await api.availability(run, from, to);
      setAvailability(latest);
      const currentClass = latest.classes.find((c) => c.class_code === cls);
      if (!currentClass) throw new Error('This class is no longer available for the selected train.');
      const latestWaitlisted = Math.max(0, n - currentClass.seats_available);
      if (currentClass.seats_available < availableSeats && latestWaitlisted > 0) {
        setError(new Error(`Availability changed. ${latestWaitlisted} passenger${latestWaitlisted === 1 ? '' : 's'} would now be waitlisted. Review the updated estimate and submit again to continue.`));
        return;
      }
      if (paymentDoneOrderId) {
        const result = await api.verifyPayment({ order_id: paymentDoneOrderId });
        toast(`Ticket booked successfully. Your PNR is ${result.ticket.pnr}`);
        nav(`/ticket/${result.ticket.pnr}`, { replace: true });
      } else {
        const order = await api.createPaymentOrder({
          run_id: run,
          from,
          to,
          class: cls,
          passengers: passengers.map((p) => ({ name: p.name.trim(), age: Number(p.age), gender: p.gender })),
        });
        nav('/payment-simulation', {
          state: {
            order,
            returnTo: `${location.pathname}${location.search}`,
            passengers,
          },
        });
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner label="Loading train details" />;
  if (loadErr) return <ErrorNote error={loadErr} />;
  if (!train || !klass) {
    return (
      <div className="panel p-8">
        <h1 className="text-3xl font-extrabold">This train or class is no longer available</h1>
        <Link className="mt-3 inline-block underline" to={`/search?from=${from}&to=${to}&date=${date}`}>Back to search results</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-extrabold">{train.train_number} {train.train_name}</h1>
          <p className="mt-1 text-lg">
            {fmtDate(date)}, departs {fmtTime(train.departs)}, arrives {fmtTime(train.arrives)}
          </p>
        </div>

        <section className="panel p-5">
          <h2 className="mb-4 text-3xl font-extrabold">Passengers</h2>
          <div className="space-y-4">
            {passengers.map((p, i) => (
              <div key={i} className="grid gap-3 border-b border-rule pb-4 last:border-0 last:pb-0 sm:grid-cols-[1fr_90px_130px_auto] sm:items-end">
                <Field label={`Passenger ${i + 1} name`}>
                  <input className="input" required maxLength={100} value={p.name} disabled={Boolean(paymentDoneOrderId)} onChange={(e) => update(i, { name: e.target.value })} />
                </Field>
                <Field label="Age">
                  <input className="input" type="number" required min={1} max={120} value={p.age} disabled={Boolean(paymentDoneOrderId)} onChange={(e) => update(i, { age: e.target.value })} />
                </Field>
                <Field label="Gender">
                  <select className="input" value={p.gender} disabled={Boolean(paymentDoneOrderId)} onChange={(e) => update(i, { gender: e.target.value })}>
                    <option value="M">Male</option><option value="F">Female</option><option value="O">Other</option>
                  </select>
                </Field>
                {n > 1 && !paymentDoneOrderId && (
                  <button type="button" className="btn-ghost" onClick={() => setPassengers((l) => l.filter((_, j) => j !== i))}>Remove</button>
                )}
              </div>
            ))}
          </div>
          {n < 6 && !paymentDoneOrderId && (
            <button type="button" className="btn-ghost mt-4" onClick={() => setPassengers((l) => [...l, blank()])}>
              Add passenger
            </button>
          )}
          <p className="mt-2 text-sm text-ink/60">Up to 6 passengers on one PNR.</p>
        </section>

        <fieldset className="panel p-5">
          <legend className="sr-only">Payment method</legend>
          <h2 className="mb-3 text-3xl font-extrabold">UPI payment simulation</h2>
          <div className="flex items-center gap-3 rounded-sm border border-coach/20 bg-coach/5 p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-coach shadow-sm" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M13 2 4 14h7l-1 8 10-13h-7l1-7Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <div className="font-bold">UPI payment demo</div>
              <p className="text-sm text-ink/65">This is a simulation only. No UPI app is opened and no real money is charged.</p>
            </div>
          </div>
        </fieldset>
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="mb-3 flex items-center gap-2">
          <StationBoard code={from} className="flex-1" />
          <StationBoard code={to} className="flex-1" />
        </div>
        <div className="panel p-5">
          <div className="flex items-baseline justify-between">
            <span className="font-display text-4xl font-extrabold">{cls}</span>
            <span className="text-ink/70">{CLASS_NAMES[cls]}</span>
          </div>
          <dl className="mt-4 space-y-2 text-[15px]">
            <div className="flex justify-between"><dt>Fare per passenger</dt><dd>{inr(klass.fare)}</dd></div>
            <div className="flex justify-between"><dt>Passengers</dt><dd>{n}</dd></div>
            <div className="flex justify-between border-t border-rule pt-2 text-xl font-bold"><dt>Total</dt><dd>{inr(total)}</dd></div>
          </dl>
          {availabilityLoading && <p className="mt-4 text-sm text-ink/70">Checking current seat availability…</p>}
          <div className="mt-3"><ErrorNote error={availabilityError} onRetry={reloadAvailability} /></div>
          {waitlisted > 0 && (
            <p className="mt-4 rounded-sm border border-wait/40 bg-wait/10 p-3 text-sm font-medium text-wait">
              {availableSeats === 0
                ? 'No seats are left, so all passengers will be waitlisted.'
                : `Only ${availableSeats} seat${availableSeats === 1 ? '' : 's'} left. ${waitlisted} passenger${waitlisted === 1 ? '' : 's'} will be waitlisted.`}{' '}
              Waitlisted tickets are confirmed automatically if someone cancels.
            </p>
          )}
          {paymentDoneOrderId && (
            <p className="mt-4 rounded-sm border border-go/40 bg-go/10 p-3 font-bold text-go" role="alert">
              Payment done successfully! You can now book your ticket. (Simulation only; no money was charged.)
            </p>
          )}
          <div className="mt-4"><ErrorNote error={error} /></div>
          <button className="btn-primary mt-4 w-full" disabled={busy || availabilityLoading || Boolean(availabilityError)}>
            {busy
              ? paymentDoneOrderId ? 'Booking ticket…' : 'Preparing demo…'
              : availabilityLoading
                ? 'Checking seats'
                : paymentDoneOrderId ? 'Book ticket' : `Continue with demo payment · ${inr(total)}`}
          </button>
        </div>
      </aside>
    </form>
  );
}
