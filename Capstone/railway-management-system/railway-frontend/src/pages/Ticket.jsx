import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { ErrorNote, Modal, PageHead, Spinner, StationBoard, StatusBadge, useAsync, useToast } from '../ui';
import { CLASS_NAMES, berthName, fmtDate, fmtDateTime, inr } from '../format';

export const seatLabel = (p) =>
  p.status === 'CONFIRMED' ? `${p.coach}, seat ${p.seat}${p.berth ? ` (${berthName(p.berth)})` : ''}`
  : p.status === 'WAITLISTED' ? `Waitlist ${p.waitlist_no}`
  : '';

export default function Ticket() {
  const { pnr } = useParams();
  const toast = useToast();
  const { data: t, error, loading, reload, setData } = useAsync(() => api.ticket(pnr), [pnr]);
  const [confirm, setConfirm] = useState(null); // { passenger } or { all: true }
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState(null);

  if (loading) return <Spinner label="Loading ticket" />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const active = t.passengers.filter((p) => p.status !== 'CANCELLED');
  const refundEstimate = confirm?.all
    ? active.reduce((sum, p) => sum + Number(p.refund_estimate || 0), 0)
    : Number(confirm?.passenger?.refund_estimate || 0);
  const total = t.payments.reduce((s, p) => s + (p.status === 'SUCCESS' ? (p.txn_type === 'PAYMENT' ? p.amount : -p.amount) : 0), 0);

  const doCancel = async () => {
    setBusy(true); setActionErr(null);
    try {
      const r = confirm.all ? await api.cancelBooking(pnr) : await api.cancelPassenger(pnr, confirm.passenger.passenger_id);
      setData(r.ticket);
      toast(`Cancelled. Refund of ${inr(r.refund_amount)} is on its way.`);
      setConfirm(null);
    } catch (e) { setActionErr(e); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead title="Your ticket">
        <StatusBadge status={t.booking_status} />
      </PageHead>

      <div className="stub panel" style={{ '--notch': '8.5rem' }}>
        <div className="flex flex-wrap items-center gap-4 p-5">
          <div className="w-40"><StationBoard code={t.from} /></div>
          <span className="font-display text-3xl font-extrabold">to</span>
          <div className="w-40"><StationBoard code={t.to} /></div>
          <div className="ml-auto text-right">
            <div className="text-sm text-ink/60">PNR</div>
            <div className="font-display text-4xl font-extrabold tracking-wider">{t.pnr}</div>
          </div>
        </div>
        <div className="border-t-2 border-dashed border-rule" />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <div><div className="text-sm text-ink/60">Train</div><Link to={`/train/${t.train_number}`} className="font-bold hover:underline">{t.train_number} {t.train_name}</Link></div>
          <div><div className="text-sm text-ink/60">Journey date</div><div className="font-bold">{fmtDate(t.journey_date)}</div></div>
          <div><div className="text-sm text-ink/60">Class</div><div className="font-bold">{t.class} {CLASS_NAMES[t.class]}</div></div>
        </div>
      </div>

      <section className="panel mt-6 overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-rule"><tr>
            <th className="th">Passenger</th><th className="th">Age</th><th className="th">Status</th><th className="th">Seat</th><th className="th text-right">Fare / refund estimate</th><th className="th" />
          </tr></thead>
          <tbody>
            {t.passengers.map((p) => (
              <tr key={p.passenger_id} className="border-b border-rule last:border-0">
                <td className="td font-bold">{p.name}</td>
                <td className="td">{p.age}</td>
                <td className="td"><StatusBadge status={p.status} /></td>
                <td className="td">{seatLabel(p)}</td>
                <td className="td text-right"><div>{inr(p.fare)}</div><div className="text-sm text-ink/60">Refund: {inr(p.refund_estimate)}</div></td>
                <td className="td text-right">
                  {p.status !== 'CANCELLED' && (
                    <button className="btn-danger !py-1.5" onClick={() => { setActionErr(null); setConfirm({ passenger: p }); }}>Cancel</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <section className="panel p-5">
          <h2 className="mb-2 text-2xl font-extrabold">Payments</h2>
          {t.payments.map((p, i) => (
            <div key={i} className="flex justify-between border-b border-rule py-2 text-[15px] last:border-0">
              <span>{p.txn_type === 'REFUND' ? 'Refund' : 'Payment'} by {p.method}<span className="block text-sm text-ink/60">{fmtDateTime(p.created_at)}</span></span>
              <span className={p.txn_type === 'REFUND' ? 'font-bold text-go' : 'font-bold'}>{p.txn_type === 'REFUND' ? '+' : ''}{inr(p.amount)}</span>
            </div>
          ))}
          <div className="mt-2 flex justify-between border-t border-ink pt-2 font-bold"><span>Net paid</span><span>{inr(total)}</span></div>
        </section>
        <section className="panel p-5">
          <h2 className="mb-2 text-2xl font-extrabold">Manage booking</h2>
          <p className="text-[15px] text-ink/70">Booked by {t.booked_by} on {fmtDateTime(t.booking_time)}.</p>
          {active.length > 0 && (
            <button className="btn-danger mt-4" onClick={() => { setActionErr(null); setConfirm({ all: true }); }}>
              Cancel {active.length === 1 ? 'ticket' : `all ${active.length} active tickets`}
            </button>
          )}
        </section>
      </div>

      {confirm && (
        <Modal title="Cancel this ticket?" onClose={() => !busy && setConfirm(null)}>
          <p className="text-[15px]">{confirm.all ? `All ${active.length} active passengers on PNR ${t.pnr} will be cancelled.` : `${confirm.passenger.name} will be cancelled.`}</p>
          <div className="mt-3 rounded-sm bg-chalk p-3">
            <div className="text-sm text-ink/70">Estimated refund based on current ticket status and departure time</div>
            <div className="font-display text-3xl font-extrabold">{inr(refundEstimate)}</div>
          </div>
          <p className="mt-3 text-sm text-ink/70">Final refunds follow the cancellation rules: 90% at 48 hours or more, 75% at 12–48 hours, 50% at 4–12 hours, and none under 4 hours. Waitlisted tickets are refunded in full. Estimates can change if waitlisted passengers are promoted while cancelling multiple tickets.</p>
          <div className="mt-3"><ErrorNote error={actionErr} /></div>
          <div className="mt-5 flex gap-3">
            <button className="btn-danger" disabled={busy} onClick={doCancel}>{busy ? 'Cancelling' : 'Cancel ticket'}</button>
            <button className="btn-ghost" disabled={busy} onClick={() => setConfirm(null)}>Keep ticket</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
