import { useState } from 'react';
import { api } from '../api';
import { Empty, ErrorNote, Modal, PageHead, Spinner, StatusBadge, useAsync, useToast } from '../ui';
import { berthName, fmtDate, isoDate } from '../format';

function Chart({ runId, onClose }) {
  const { data, error, loading } = useAsync(() => api.staffChart(runId), [runId]);
  return (
    <section className="panel mt-6">
      <div className="flex items-center justify-between border-b border-rule p-4">
        <h2 className="text-3xl font-extrabold">{data ? `Passenger chart: ${data.run.train_number} ${data.run.train_name}, ${fmtDate(data.run.journey_date)}` : 'Passenger chart'}</h2>
        <button className="btn-ghost" onClick={onClose}>Close</button>
      </div>
      {loading && <div className="px-4"><Spinner /></div>}
      {error && <div className="p-4"><ErrorNote error={error} /></div>}
      {data && data.passengers.length === 0 && <p className="p-6 text-ink/70">No active tickets on this run.</p>}
      {data && data.passengers.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-rule"><tr>
              <th className="th">Class</th><th className="th">Coach</th><th className="th">Seat</th><th className="th">Passenger</th><th className="th">Age</th><th className="th">Journey</th><th className="th">PNR</th><th className="th">Status</th>
            </tr></thead>
            <tbody>
              {data.passengers.map((p) => (
                <tr key={p.passenger_id} className="border-b border-rule last:border-0">
                  <td className="td font-bold">{p.class_code}</td>
                  <td className="td">{p.coach_number || '-'}</td>
                  <td className="td">{p.seat_number ? `${p.seat_number} ${berthName(p.berth_type)}` : p.waitlist_no ? `WL ${p.waitlist_no}` : '-'}</td>
                  <td className="td">{p.name}</td>
                  <td className="td">{p.age}</td>
                  <td className="td">{p.from_code} to {p.to_code}</td>
                  <td className="td">{p.pnr}</td>
                  <td className="td"><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function Staff() {
  const toast = useToast();
  const [date, setDate] = useState(isoDate(1));
  const [chart, setChart] = useState(null);
  const [confirm, setConfirm] = useState(null); // { run, status }
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState(null);
  const { data, error, loading, reload } = useAsync(() => api.staffRuns(date), [date]);

  const apply = async () => {
    setBusy(true); setActionErr(null);
    try {
      await api.setRunStatus(confirm.run.run_id, confirm.status);
      toast(`${confirm.run.train_number} marked ${confirm.status.toLowerCase()}`);
      setConfirm(null); reload();
    } catch (e) { setActionErr(e); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHead title="Staff desk">
        <label className="flex items-center gap-2"><span className="font-bold">Date</span>
          <input type="date" className="input w-auto" value={date} onChange={(e) => { setDate(e.target.value); setChart(null); }} />
        </label>
      </PageHead>
      {loading && <Spinner />}
      <ErrorNote error={error} onRetry={reload} />
      {data && data.length === 0 && <Empty title="No runs on this date">Admins can add runs from the Admin page.</Empty>}
      {data && data.length > 0 && (
        <div className="panel overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-rule"><tr>
              <th className="th">Train</th><th className="th">Status</th><th className="th text-right">Tickets</th><th className="th text-right">Confirmed</th><th className="th text-right">Waitlisted</th><th className="th text-right">Cancelled</th><th className="th" />
            </tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.run_id} className="border-b border-rule last:border-0">
                  <td className="td font-bold">{r.train_number} {r.train_name}</td>
                  <td className="td"><StatusBadge status={r.status} /></td>
                  <td className="td text-right">{r.tickets}</td>
                  <td className="td text-right">{r.confirmed}</td>
                  <td className="td text-right">{r.waitlisted}</td>
                  <td className="td text-right">{r.cancelled}</td>
                  <td className="td">
                    <div className="flex justify-end gap-2">
                      <button className="btn-ghost !py-1.5" onClick={() => setChart(r.run_id)}>Passenger chart</button>
                      {r.status === 'SCHEDULED' && <>
                        <button className="btn-ghost !py-1.5" onClick={() => { setActionErr(null); setConfirm({ run: r, status: 'DEPARTED' }); }}>Mark departed</button>
                        <button className="btn-danger !py-1.5" onClick={() => { setActionErr(null); setConfirm({ run: r, status: 'CANCELLED' }); }}>Cancel run</button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {chart && <Chart runId={chart} onClose={() => setChart(null)} />}
      {confirm && (
        <Modal title={confirm.status === 'DEPARTED' ? 'Mark as departed?' : 'Cancel this run?'} onClose={() => !busy && setConfirm(null)}>
          <p className="text-[15px]">
            {confirm.run.train_number} {confirm.run.train_name} on {fmtDate(confirm.run.journey_date)} will be marked {confirm.status.toLowerCase()}.
            {confirm.status === 'CANCELLED' && ' Existing bookings are not refunded automatically.'} This cannot be undone.
          </p>
          <div className="mt-3"><ErrorNote error={actionErr} /></div>
          <div className="mt-5 flex gap-3">
            <button className={confirm.status === 'CANCELLED' ? 'btn-danger' : 'btn-primary'} disabled={busy} onClick={apply}>{busy ? 'Saving' : confirm.status === 'DEPARTED' ? 'Mark departed' : 'Cancel run'}</button>
            <button className="btn-ghost" disabled={busy} onClick={() => setConfirm(null)}>Go back</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
