import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { ErrorNote, PageHead, Spinner, StationBoard, StatusBadge, useAsync } from '../ui';
import { CLASS_NAMES, fmtDate } from '../format';
import { seatLabel } from './Ticket';

function Result({ pnr }) {
  const { data: t, error, loading, reload } = useAsync(() => api.pnr(pnr), [pnr]);
  if (loading) return <Spinner label="Looking up PNR" />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  return (
    <div className="mt-6">
      <div className="panel">
        <div className="flex flex-wrap items-center gap-4 p-5">
          <div className="w-40"><StationBoard code={t.from} /></div>
          <span className="font-display text-3xl font-extrabold">to</span>
          <div className="w-40"><StationBoard code={t.to} /></div>
          <div className="ml-auto text-right">
            <div className="text-sm text-ink/60">PNR</div>
            <div className="font-display text-4xl font-extrabold tracking-wider">{t.pnr}</div>
          </div>
        </div>
        <div className="grid gap-3 border-t border-rule p-5 sm:grid-cols-3">
          <div><div className="text-sm text-ink/60">Train</div><Link className="font-bold hover:underline" to={`/train/${t.train_number}`}>{t.train_number} {t.train_name}</Link></div>
          <div><div className="text-sm text-ink/60">Journey date</div><div className="font-bold">{fmtDate(t.journey_date)}</div></div>
          <div><div className="text-sm text-ink/60">Class</div><div className="font-bold">{t.class} {CLASS_NAMES[t.class]}</div></div>
        </div>
      </div>
      <div className="panel mt-4 overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-rule"><tr><th className="th">Passenger</th><th className="th">Status</th><th className="th">Seat</th></tr></thead>
          <tbody>
            {t.passengers.map((p) => (
              <tr key={p.passenger_no} className="border-b border-rule last:border-0">
                <td className="td font-bold">Passenger {p.passenger_no}</td>
                <td className="td"><StatusBadge status={p.status} /></td>
                <td className="td">{seatLabel(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-ink/60">Names and fares are hidden on the public PNR page. Sign in and open My trips to see the full ticket.</p>
    </div>
  );
}

export default function Pnr() {
  const { pnr } = useParams();
  const nav = useNavigate();
  const [value, setValue] = useState(pnr || '');
  useEffect(() => setValue(pnr || ''), [pnr]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHead title="PNR status" />
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (/^\d{10}$/.test(value)) nav(`/pnr/${value}`); }}>
        <input className="input" inputMode="numeric" maxLength={10} placeholder="10-digit PNR" aria-label="PNR number" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} />
        <button className="btn-primary" disabled={value.length !== 10}>Check status</button>
      </form>
      {pnr && <Result pnr={pnr} />}
    </div>
  );
}
