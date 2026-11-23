import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Empty, ErrorNote, Spinner, StatusBadge, useAsync } from '../ui';
import { fmtDate, fmtTime } from '../format';

export default function UpcomingRuns({ embedded = false, refreshKey = 0 }) {
  const [days, setDays] = useState(7);
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(() => api.upcomingRuns(days), [days, refreshKey]);
  const runs = data?.runs || [];
  const pageSize = 25;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return runs.filter((run) => {
      const matchesDate = !date || run.journey_date === date;
      const matchesQuery = !q || `${run.train_number} ${run.train_name} ${run.from_code} ${run.from_name} ${run.to_code} ${run.to_name}`.toLowerCase().includes(q);
      return matchesDate && matchesQuery;
    });
  }, [runs, query, date]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleRuns = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [days, query, date]);

  return (
    <section className={embedded ? 'panel' : ''}>
      <div className={`flex flex-wrap items-end justify-between gap-3 ${embedded ? 'p-5' : 'mb-6'}`}>
        <div>
          {embedded
            ? <h2 className="text-3xl font-extrabold">Upcoming scheduled trains</h2>
            : <h1 className="text-4xl font-extrabold sm:text-5xl">Upcoming trains</h1>}
          <p className="mt-1 text-ink/70">Active train runs scheduled within a {days}-day window starting today.</p>
        </div>
        <label className="block">
          <span className="label">Show next</span>
          <select className="input w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[3, 7, 14, 30].map((n) => <option key={n} value={n}>{n} days</option>)}
          </select>
        </label>
      </div>

      {loading && <Spinner label="Loading scheduled trains" />}
      <ErrorNote error={error} onRetry={reload} />
      {data && runs.length === 0 && <Empty title="No upcoming trains">No active train runs are scheduled in this date range.</Empty>}

      {runs.length > 0 && (
        <div className={`mb-4 flex flex-wrap items-end gap-3 ${embedded ? 'px-5' : ''}`}>
          <label className="block min-w-56 flex-1">
            <span className="label">Search train or route</span>
            <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Train number, name, or station" />
          </label>
          <label className="block">
            <span className="label">Journey date</span>
            <select className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)}>
              <option value="">All dates</option>
              {[...new Set(runs.map((run) => run.journey_date))].map((journeyDate) => (
                <option key={journeyDate} value={journeyDate}>{fmtDate(journeyDate)}</option>
              ))}
            </select>
          </label>
          <span className="pb-2 text-sm text-ink/70">{filtered.length} scheduled run{filtered.length === 1 ? '' : 's'}</span>
        </div>
      )}
      {data && filtered.length === 0 && runs.length > 0 && <Empty title="No runs match">Try a different train, route, or date.</Empty>}

      {visibleRuns.length > 0 && (
        <div className={embedded ? 'overflow-x-auto border-t border-rule' : 'space-y-5'}>
          {embedded ? (
            <table className="w-full">
              <thead className="border-b border-rule"><tr>
                <th className="th">Date</th><th className="th">Train</th><th className="th">Route</th><th className="th">Departs</th><th className="th">Arrives</th><th className="th">Status</th>
              </tr></thead>
              <tbody>
                {visibleRuns.map((run) => (
                  <tr key={run.run_id} className="border-b border-rule last:border-0">
                    <td className="td whitespace-nowrap">{fmtDate(run.journey_date)}</td>
                    <td className="td"><Link className="font-bold hover:underline" to={`/train/${run.train_number}`}>{run.train_number} {run.train_name}</Link></td>
                    <td className="td whitespace-nowrap">{run.from_code} to {run.to_code}</td>
                    <td className="td">{fmtTime(run.departs) || '-'}</td>
                    <td className="td">{fmtTime(run.arrives) || '-'}</td>
                    <td className="td"><StatusBadge status={run.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : visibleRuns.map((run) => (
            <article key={run.run_id} className="panel flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
              <div className="min-w-32">
                <div className="text-sm text-ink/60">Journey date</div>
                <div className="font-bold">{fmtDate(run.journey_date)}</div>
              </div>
              <div className="min-w-48 flex-1">
                <Link className="text-xl font-extrabold hover:underline" to={`/train/${run.train_number}`}>{run.train_number} {run.train_name}</Link>
                <div className="text-sm text-ink/70">{run.from_name} ({run.from_code}) to {run.to_name} ({run.to_code})</div>
              </div>
              <div className="font-display text-2xl font-extrabold">{fmtTime(run.departs) || '--:--'} <span className="text-ink/50">→</span> {fmtTime(run.arrives) || '--:--'}</div>
              <Link className="btn-board" to={`/search?from=${run.from_code}&to=${run.to_code}&date=${run.journey_date}`}>View availability</Link>
            </article>
          ))}
        </div>
      )}
      {pageCount > 1 && (
        <div className={`mt-4 flex items-center justify-between ${embedded ? 'px-5 pb-5' : ''}`}>
          <button className="btn-ghost" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
          <span className="text-sm text-ink/70">Page {page} of {pageCount}</span>
          <button className="btn-ghost" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)}>Next</button>
        </div>
      )}
    </section>
  );
}
