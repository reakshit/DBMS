import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api';
import { isoDate } from './format';
import { StationBoard } from './ui';

let stationCache = null;
export function useStations() {
  const [list, setList] = useState(stationCache || []);
  useEffect(() => {
    if (stationCache) return;
    api.stations().then((r) => { stationCache = r; setList(r); }).catch(() => {});
  }, []);
  return list;
}

function StationPicker({ caption, value, onChange, stations }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const chosen = stations.find((s) => s.station_code === value);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return stations.slice(0, 8);
    return stations
      .filter((s) => [s.station_code, s.station_name, s.city].some((x) => x.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [text, stations]);

  useEffect(() => {
    const close = (e) => wrap.current && !wrap.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (s) => { onChange(s.station_code); setText(''); setOpen(false); };

  return (
    <div ref={wrap} className="relative min-w-0 flex-1">
      <StationBoard code={chosen?.station_code} name={chosen?.station_name} caption={caption} />
      <input
        className="input mt-2" placeholder={`Type a city, station or code`} aria-label={`${caption} station`}
        value={text} onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && open && matches[0]) { e.preventDefault(); pick(matches[0]); } }}
        autoComplete="off" role="combobox" aria-expanded={open}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-sm border border-ink/30 bg-white shadow-lg" role="listbox">
          {matches.map((s) => (
            <li key={s.station_id}>
              <button type="button" className="flex w-full items-baseline gap-3 px-3 py-2 text-left hover:bg-board/30" onClick={() => pick(s)}>
                <span className="w-12 font-display text-xl font-extrabold">{s.station_code}</span>
                <span>{s.station_name}<span className="text-ink/60">, {s.state}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SearchForm({ initial = {} }) {
  const nav = useNavigate();
  const stations = useStations();
  const [from, setFrom] = useState(initial.from || '');
  const [to, setTo] = useState(initial.to || '');
  const [date, setDate] = useState(initial.date || isoDate(1));
  const [err, setErr] = useState('');

  useEffect(() => { setFrom(initial.from || ''); setTo(initial.to || ''); if (initial.date) setDate(initial.date); }, [initial.from, initial.to, initial.date]);

  const submit = (e) => {
    e.preventDefault();
    if (!from || !to) return setErr('Choose both a starting station and a destination.');
    if (from === to) return setErr('Starting station and destination must be different.');
    setErr('');
    nav(`/search?from=${from}&to=${to}&date=${date}`);
  };

  return (
    <form onSubmit={submit}>
      <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-start">
        <StationPicker caption="From" value={from} onChange={setFrom} stations={stations} />
        <button
          type="button" onClick={() => { setFrom(to); setTo(from); }} aria-label="Swap stations"
          className="btn-ghost self-center md:mt-12"
        >
          Swap
        </button>
        <StationPicker caption="To" value={to} onChange={setTo} stations={stations} />
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="label">Travel date</span>
          <input type="date" className="input w-auto" value={date} min={isoDate(0)} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <button className="btn-primary" type="submit">Find trains</button>
        {err && <span className="font-medium text-stop" role="alert">{err}</span>}
      </div>
    </form>
  );
}
