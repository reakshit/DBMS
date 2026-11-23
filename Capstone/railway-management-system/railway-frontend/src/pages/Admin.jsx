import { useState } from 'react';
import { api } from '../api';
import { Empty, ErrorNote, Field, Spinner, useAsync, useToast } from '../ui';
import { fmtDateTime, inr, isoDate } from '../format';
import { useAuth } from '../auth';
import UpcomingRuns from './UpcomingRuns';

const TABS = [['reports', 'Reports'], ['network', 'Trains and stations'], ['fares', 'Fares'], ['users', 'Users']];

/* ---------- reports ---------- */
function Bars({ rows, label, value, fmt = (v) => v }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[value])));
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li key={i}>
          <div className="flex justify-between text-[15px]"><span className="font-bold">{r[label]}</span><span>{fmt(r[value])}</span></div>
          <div className="mt-1 h-3 bg-chalk"><div className="h-3 bg-coach" style={{ width: `${Math.max(2, (Number(r[value]) / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function Card({ title, state, children }) {
  return (
    <section className="panel p-5">
      <h2 className="mb-4 text-3xl font-extrabold">{title}</h2>
      {state.loading && <Spinner />}
      <ErrorNote error={state.error} onRetry={state.reload} />
      {state.data && (Array.isArray(state.data) && state.data.length === 0 ? <p className="text-ink/70">No data yet. Make a booking first.</p> : children(state.data))}
    </section>
  );
}

function Reports() {
  const byTrain = useAsync(() => api.revenueByTrain(), []);
  const byRoute = useAsync(() => api.revenueByRoute(), []);
  const top = useAsync(() => api.topTrains(5), []);
  const canc = useAsync(() => api.cancellationRate(), []);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Net revenue by train" state={byTrain}>
        {(d) => <Bars rows={d.map((r) => ({ ...r, label: `${r.train_number} ${r.train_name}` }))} label="label" value="net_revenue" fmt={inr} />}
      </Card>
      <Card title="Net revenue by route" state={byRoute}>
        {(d) => <Bars rows={d.map((r) => ({ ...r, label: `${r.from_code} to ${r.to_code}` }))} label="label" value="net_revenue" fmt={inr} />}
      </Card>
      <Card title="Most booked trains" state={top}>
        {(d) => <Bars rows={d.map((r) => ({ ...r, label: `${r.train_number} ${r.train_name}` }))} label="label" value="passengers_booked" fmt={(v) => `${v} passengers`} />}
      </Card>
      <Card title="Cancellation rate" state={canc}>
        {(d) => (
          <div>
            <div className="mb-4 font-display text-6xl font-extrabold">{Number(d.overall.cancellation_rate_pct)}%</div>
            <p className="mb-4 text-[15px] text-ink/70">{d.overall.cancelled} of {d.overall.total_tickets} tickets cancelled overall. By class:</p>
            <Bars rows={d.by_class} label="class_code" value="cancellation_rate_pct" fmt={(v) => `${Number(v)}%`} />
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- network ---------- */
function useForm(initial) {
  const [f, setF] = useState(initial);
  return [f, (k) => (e) => setF({ ...f, [k]: e.target.value }), setF];
}

function Section({ title, children, onSubmit, submitLabel }) {
  const toast = useToast();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { const msg = await onSubmit(); toast(msg); } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="panel space-y-3 p-5">
      <h2 className="text-3xl font-extrabold">{title}</h2>
      {children}
      <ErrorNote error={error} />
      <button className="btn-primary" disabled={busy}>{busy ? 'Saving' : submitLabel}</button>
    </form>
  );
}

function TrainDirectory({ refreshKey, onUpdate }) {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync(() => api.trains(), [refreshKey]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const edit = (train) => {
    setEditing(train.train_id);
    setForm({ train_number: train.train_number, train_name: train.train_name, train_type: train.train_type });
    setActionError(null);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setActionError(null);
    try {
      const updated = await api.updateTrain(editing, form);
      setData(data.map((train) => train.train_id === updated.train_id ? { ...train, ...updated } : train));
      setEditing(null);
      setForm(null);
      onUpdate();
      toast(`Train ${updated.train_number} updated`);
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (train) => {
    setActionError(null);
    try {
      const updated = await api.updateTrain(train.train_id, { is_active: !train.is_active });
      setData(data.map((item) => item.train_id === train.train_id ? { ...item, ...updated } : item));
      onUpdate();
      toast(`${train.train_number} ${updated.is_active ? 'activated' : 'deactivated'}`);
    } catch (err) {
      setActionError(err);
    }
  };

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-extrabold">Train directory</h2>
          <p className="mt-1 text-ink/70">Edit train details and control whether a train appears in search results.</p>
        </div>
        {data && <span className="text-sm text-ink/70">{data.length} train{data.length === 1 ? '' : 's'}</span>}
      </div>
      {loading && <Spinner />}
      <div className="mt-3"><ErrorNote error={error} onRetry={reload} /><ErrorNote error={actionError} /></div>
      {data && data.length === 0 && <Empty title="No trains yet">Add a train below to begin building the network.</Empty>}
      {data && data.length > 0 && (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {data.map((train) => (
            <li key={train.train_id} className="rounded-sm border border-rule p-4">
              {editing === train.train_id ? (
                <form onSubmit={save} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Train number"><input className="input" required maxLength={6} value={form.train_number} onChange={(e) => setForm({ ...form, train_number: e.target.value })} /></Field>
                    <Field label="Type"><select className="input" value={form.train_type} onChange={(e) => setForm({ ...form, train_type: e.target.value })}>{['LOCAL', 'EXPRESS', 'SUPERFAST', 'RAJDHANI', 'SHATABDI'].map((type) => <option key={type}>{type}</option>)}</select></Field>
                  </div>
                  <Field label="Train name"><input className="input" required maxLength={100} value={form.train_name} onChange={(e) => setForm({ ...form, train_name: e.target.value })} /></Field>
                  <div className="flex gap-2">
                    <button className="btn-primary" disabled={busy}>{busy ? 'Saving' : 'Save changes'}</button>
                    <button type="button" className="btn-ghost" disabled={busy} onClick={() => { setEditing(null); setForm(null); }}>Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-display text-2xl font-extrabold">{train.train_number} {train.train_name}</div>
                      <div className="text-sm text-ink/70">ID {train.train_id} · {train.train_type}</div>
                    </div>
                    <span className={`rounded-sm border px-2 py-0.5 text-sm font-bold ${train.is_active ? 'border-go/40 bg-go/10 text-go' : 'border-stop/40 bg-stop/10 text-stop'}`}>
                      {train.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink/70">
                    <span>{train.stop_count} stops</span><span>{train.upcoming_runs} runs in next 7 days</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button className="btn-ghost" onClick={() => edit(train)}>Edit details</button>
                    <button className="btn-ghost" onClick={() => toggleActive(train)}>{train.is_active ? 'Deactivate' : 'Activate'}</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Network() {
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshNetwork = () => setRefreshKey((key) => key + 1);
  const [st, s, setSt] = useForm({ station_code: '', station_name: '', city: '', state: '' });
  const [tr, t, setTr] = useForm({ train_number: '', train_name: '', train_type: 'EXPRESS' });
  const [stop, p, setStop] = useForm({ train_id: '', stop_seq: '', station_code: '', arrival_time: '', departure_time: '', day_offset: '0', distance_km: '' });
  const [coach, c, setCoach] = useForm({ train_id: '', class_code: 'SL', coach_number: '', seats: '' });
  const [run, r] = useForm({ train_id: '', from_date: isoDate(1), days: '7' });
  return (
    <div className="space-y-6">
      <TrainDirectory refreshKey={refreshKey} onUpdate={refreshNetwork} />
      <UpcomingRuns embedded refreshKey={refreshKey} />
      <div className="grid gap-6 lg:grid-cols-2">
      <Section title="Add a station" submitLabel="Add station" onSubmit={async () => { await api.addStation(st); setSt({ station_code: '', station_name: '', city: '', state: '' }); return `Station ${st.station_code.toUpperCase()} added`; }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code"><input className="input" required maxLength={5} value={st.station_code} onChange={s('station_code')} /></Field>
          <Field label="Name"><input className="input" required value={st.station_name} onChange={s('station_name')} /></Field>
          <Field label="City"><input className="input" required value={st.city} onChange={s('city')} /></Field>
          <Field label="State"><input className="input" required value={st.state} onChange={s('state')} /></Field>
        </div>
      </Section>

      <Section title="Add a train" submitLabel="Add train" onSubmit={async () => { const r2 = await api.addTrain(tr); refreshNetwork(); setStop({ ...stop, train_id: String(r2.train_id) }); setCoach({ ...coach, train_id: String(r2.train_id) }); setTr({ train_number: '', train_name: '', train_type: 'EXPRESS' }); return `Train added with ID ${r2.train_id}. The ID is filled into the forms below.`; }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Number"><input className="input" required maxLength={6} value={tr.train_number} onChange={t('train_number')} /></Field>
          <Field label="Type"><select className="input" value={tr.train_type} onChange={t('train_type')}>{['LOCAL', 'EXPRESS', 'SUPERFAST', 'RAJDHANI', 'SHATABDI'].map((x) => <option key={x}>{x}</option>)}</select></Field>
        </div>
        <Field label="Name"><input className="input" required value={tr.train_name} onChange={t('train_name')} /></Field>
      </Section>

      <Section title="Add a stop to a train" submitLabel="Add stop" onSubmit={async () => { await api.addStop(stop.train_id, { ...stop, stop_seq: Number(stop.stop_seq), day_offset: Number(stop.day_offset), distance_km: Number(stop.distance_km) }); refreshNetwork(); return `Stop ${stop.stop_seq} added`; }}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Train ID"><input className="input" type="number" required min={1} value={stop.train_id} onChange={p('train_id')} /></Field>
          <Field label="Stop number"><input className="input" type="number" required min={1} value={stop.stop_seq} onChange={p('stop_seq')} /></Field>
          <Field label="Station code"><input className="input" required maxLength={5} value={stop.station_code} onChange={p('station_code')} /></Field>
          <Field label="Arrival time"><input className="input" type="time" value={stop.arrival_time} onChange={p('arrival_time')} /></Field>
          <Field label="Departure time"><input className="input" type="time" value={stop.departure_time} onChange={p('departure_time')} /></Field>
          <Field label="Day offset"><input className="input" type="number" min={0} max={10} value={stop.day_offset} onChange={p('day_offset')} /></Field>
          <Field label="Distance from start (km)"><input className="input" type="number" required min={0} value={stop.distance_km} onChange={p('distance_km')} /></Field>
        </div>
      </Section>

      <Section title="Add a coach" submitLabel="Add coach and seats" onSubmit={async () => { await api.addCoach(coach.train_id, { ...coach, seats: Number(coach.seats) }); return `Coach ${coach.coach_number.toUpperCase()} added with ${coach.seats} seats`; }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Train ID"><input className="input" type="number" required min={1} value={coach.train_id} onChange={c('train_id')} /></Field>
          <Field label="Class"><select className="input" value={coach.class_code} onChange={c('class_code')}>{['SL', '3A', '2A', '1A'].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Coach number"><input className="input" required maxLength={4} value={coach.coach_number} onChange={c('coach_number')} /></Field>
          <Field label="Seats"><input className="input" type="number" required min={1} max={120} value={coach.seats} onChange={c('seats')} /></Field>
        </div>
      </Section>

      <Section title="Open dates for booking" submitLabel="Create runs" onSubmit={async () => { const r2 = await api.addRuns({ train_id: Number(run.train_id), from_date: run.from_date, days: Number(run.days) }); refreshNetwork(); return `${r2.created} run${r2.created === 1 ? '' : 's'} created, ${r2.skipped_existing} already existed`; }}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Train ID"><input className="input" type="number" required min={1} value={run.train_id} onChange={r('train_id')} /></Field>
          <Field label="First date"><input className="input" type="date" required value={run.from_date} onChange={r('from_date')} /></Field>
          <Field label="Number of days"><input className="input" type="number" required min={1} max={90} value={run.days} onChange={r('days')} /></Field>
        </div>
      </Section>

      </div>
    </div>
  );
}

/* ---------- fares ---------- */
function Fares() {
  const audit = useAsync(() => api.fareAudit(), []);
  const [cls, setCls] = useState('SL');
  const [rate, setRate] = useState('');
  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <Section title="Change fare rate" submitLabel="Update rate" onSubmit={async () => { await api.setFare(cls, Number(rate)); setRate(''); audit.reload(); return `${cls} rate set to ${inr(rate)} per km`; }}>
        <Field label="Class"><select className="input" value={cls} onChange={(e) => setCls(e.target.value)}>{['SL', '3A', '2A', '1A'].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="New rate per km (₹)"><input className="input" type="number" step="0.01" min="0.01" required value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
        <p className="text-sm text-ink/60">Every change is recorded automatically in the fare audit log.</p>
      </Section>
      <section className="panel overflow-x-auto">
        <h2 className="p-5 pb-3 text-3xl font-extrabold">Fare audit log</h2>
        {audit.loading && <div className="px-5"><Spinner /></div>}
        <div className="px-5"><ErrorNote error={audit.error} onRetry={audit.reload} /></div>
        {audit.data && audit.data.length === 0 && <p className="px-5 pb-5 text-ink/70">No fare changes yet.</p>}
        {audit.data && audit.data.length > 0 && (
          <table className="w-full">
            <thead className="border-y border-rule"><tr><th className="th">When</th><th className="th">Class</th><th className="th text-right">Old rate</th><th className="th text-right">New rate</th><th className="th">Changed by (DB account)</th></tr></thead>
            <tbody>
              {audit.data.map((r) => (
                <tr key={r.audit_id} className="border-b border-rule last:border-0">
                  <td className="td">{fmtDateTime(r.changed_at)}</td><td className="td font-bold">{r.class_code}</td>
                  <td className="td text-right">{inr(r.old_rate)}</td><td className="td text-right">{inr(r.new_rate)}</td><td className="td">{r.changed_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/* ---------- users ---------- */
function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync(() => api.users(), []);
  const change = async (u, role) => {
    try { await api.setRole(u.user_id, role); setData(data.map((x) => (x.user_id === u.user_id ? { ...x, role } : x))); toast(`${u.full_name} is now ${role.toLowerCase()}`); }
    catch (e) { toast(e.message, 'error'); }
  };
  if (loading) return <Spinner />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!data.length) return <Empty title="No users" />;
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-rule"><tr><th className="th">Name</th><th className="th">Email</th><th className="th">Phone</th><th className="th">Joined</th><th className="th">Role</th></tr></thead>
        <tbody>
          {data.map((u) => (
            <tr key={u.user_id} className="border-b border-rule last:border-0">
              <td className="td font-bold">{u.full_name}</td><td className="td">{u.email}</td><td className="td">{u.phone}</td><td className="td">{fmtDateTime(u.created_at)}</td>
              <td className="td">
                <select className="input !w-auto !py-1.5" value={u.role} disabled={u.user_id === me.id} aria-label={`Role for ${u.full_name}`} onChange={(e) => change(u, e.target.value)}>
                  <option>PASSENGER</option><option>STAFF</option><option>ADMIN</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState('reports');
  return (
    <div>
      <h1 className="mb-4 text-4xl font-extrabold sm:text-5xl">Admin</h1>
      <div className="mb-6 flex flex-wrap gap-2" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`rounded-sm border px-4 py-2 font-bold ${tab === id ? 'border-ink bg-board' : 'border-ink/30 bg-white hover:bg-ink/5'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'reports' && <Reports />}
      {tab === 'network' && <Network />}
      {tab === 'fares' && <Fares />}
      {tab === 'users' && <Users />}
    </div>
  );
}
