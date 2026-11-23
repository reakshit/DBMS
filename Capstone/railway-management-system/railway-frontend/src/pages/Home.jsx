import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import SearchForm from '../SearchForm';

export default function Home() {
  const nav = useNavigate();
  const [pnr, setPnr] = useState('');
  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-6 max-w-2xl text-5xl font-extrabold leading-[0.95] sm:text-7xl">Pick your stations, pick your day.</h1>
        <div className="panel p-5 sm:p-6">
          <SearchForm />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <form
          className="panel p-5"
          onSubmit={(e) => { e.preventDefault(); if (/^\d{10}$/.test(pnr)) nav(`/pnr/${pnr}`); }}
        >
          <h2 className="text-3xl font-extrabold">Already booked?</h2>
          <p className="mt-1 text-ink/70">Enter the 10-digit PNR to see whether each seat is confirmed or still on the waitlist.</p>
          <div className="mt-4 flex gap-2">
            <input
              className="input" inputMode="numeric" maxLength={10} placeholder="10-digit PNR" aria-label="PNR number"
              value={pnr} onChange={(e) => setPnr(e.target.value.replace(/\D/g, ''))}
            />
            <button className="btn-primary" disabled={pnr.length !== 10}>Check status</button>
          </div>
        </form>
        <div className="panel p-5">
          <h2 className="text-3xl font-extrabold">How cancellation refunds work</h2>
          <ul className="mt-2 space-y-1 text-[15px]">
            <li>48 hours or more before departure: 90% back</li>
            <li>12 to 48 hours: 75% back</li>
            <li>4 to 12 hours: 50% back</li>
            <li>Under 4 hours: no refund</li>
            <li>Waitlisted tickets: full refund at any time</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
