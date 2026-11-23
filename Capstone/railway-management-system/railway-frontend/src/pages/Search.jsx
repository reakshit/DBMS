import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import SearchForm, { useStations } from '../SearchForm';
import { Empty, ErrorNote, Spinner, StationBoard, useAsync } from '../ui';
import { CLASS_NAMES, fmtDate, fmtTime, inr } from '../format';

export default function Search() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const stations = useStations();
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const date = params.get('date') || '';
  const [classFilter, setClassFilter] = useState('');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState('departure');
  const { data, error, loading, reload } = useAsync(() => api.search(from, to, date), [from, to, date]);
  const name = (c) => stations.find((s) => s.station_code === c)?.station_name;

  const filtered = useMemo(() => {
    const matches = (data?.trains || []).map((train) => ({
      ...train,
      classes: train.classes.filter((c) =>
        (!classFilter || c.class_code === classFilter) && (!availableOnly || c.seats_available > 0)
      ),
    })).filter((train) => train.classes.length > 0);

    return matches.sort((a, b) => {
      if (sort === 'fare') return Math.min(...a.classes.map((c) => c.fare)) - Math.min(...b.classes.map((c) => c.fare));
      if (sort === 'seats') return Math.max(...b.classes.map((c) => c.seats_available)) - Math.max(...a.classes.map((c) => c.seats_available));
      return String(a.departs).localeCompare(String(b.departs));
    });
  }, [data, classFilter, availableOnly, sort]);

  const choose = (t, cls) =>
    nav(`/book?run=${t.run_id}&from=${from}&to=${to}&date=${date}&class=${cls.class_code}`);

  return (
    <div className="space-y-6">
      <div className="panel p-5"><SearchForm initial={{ from, to, date }} /></div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-44"><StationBoard code={from} name={name(from)} /></div>
        <span className="font-display text-3xl font-extrabold">to</span>
        <div className="w-44"><StationBoard code={to} name={name(to)} /></div>
        <span className="text-lg font-bold">{fmtDate(date)}</span>
      </div>

      {loading && <Spinner label="Searching trains" />}
      <ErrorNote error={error} onRetry={reload} />
      {data && data.trains.length > 0 && (
        <div className="panel flex flex-wrap items-end gap-4 p-4">
          <label className="block">
            <span className="label">Class</span>
            <select className="input w-auto" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              <option value="">All classes</option>
              {Object.entries(CLASS_NAMES).map(([code, label]) => <option key={code} value={code}>{code} — {label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 font-bold">
            <input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} />
            Seats available only
          </label>
          <label className="block">
            <span className="label">Sort by</span>
            <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="departure">Departure time</option>
              <option value="fare">Lowest fare</option>
              <option value="seats">Most seats available</option>
            </select>
          </label>
          <span className="pb-2 text-sm text-ink/70">{filtered.length} train{filtered.length === 1 ? '' : 's'} match</span>
        </div>
      )}
      {data && data.trains.length === 0 && (
        <Empty title="No trains on this date">
          Try a different date. Trains only run on dates the admin has scheduled.
        </Empty>
      )}
      {data && data.trains.length > 0 && filtered.length === 0 && (
        <Empty title="No trains match these filters">Try another class or show waitlisted trains too.</Empty>
      )}

      <ul className="space-y-4">
        {filtered.map((t) => (
          <li key={t.run_id} className="panel">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rule p-4">
              <div>
                <Link to={`/train/${t.train_number}`} className="text-2xl font-extrabold hover:underline">
                  {t.train_number} {t.train_name}
                </Link>
                <div className="text-sm text-ink/60">{t.distance_km} km</div>
              </div>
              <div className="flex items-center gap-3 font-display text-4xl font-extrabold">
                <span>{fmtTime(t.departs)}</span>
                <span className="h-0.5 w-8 bg-ink" aria-hidden />
                <span>{fmtTime(t.arrives)}</span>
              </div>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              {t.classes.map((c) => {
                const avail = c.seats_available > 0;
                return (
                  <button
                    key={c.class_code} onClick={() => choose(t, c)}
                    className="rounded-sm border border-ink/25 p-3 text-left transition-colors hover:border-ink hover:bg-board/20"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-display text-3xl font-extrabold">{c.class_code}</span>
                      <span className="text-lg font-bold">{inr(c.fare)}</span>
                    </div>
                    <div className="text-sm text-ink/60">{CLASS_NAMES[c.class_code]}</div>
                    <div className={`mt-2 font-bold ${avail ? 'text-go' : 'text-wait'}`}>
                      {avail ? `${c.seats_available} seats available` : 'Waitlist open'}
                    </div>
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
