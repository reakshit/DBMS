import { Link } from 'react-router-dom';
import { api } from '../api';
import { Empty, ErrorNote, PageHead, Spinner, StatusBadge, useAsync } from '../ui';
import { fmtDate, inr } from '../format';

export default function MyBookings() {
  const { data, error, loading, reload } = useAsync(() => api.myBookings(), []);
  return (
    <div>
      <PageHead title="My trips"><Link to="/" className="btn-board">Book a train</Link></PageHead>
      {loading && <Spinner />}
      <ErrorNote error={error} onRetry={reload} />
      {data && data.length === 0 && <Empty title="No bookings yet">Search for a train and your tickets will show up here.</Empty>}
      <ul className="space-y-3">
        {data?.map((b) => (
          <li key={b.pnr}>
            <Link to={`/ticket/${b.pnr}`} className="panel flex flex-wrap items-center gap-x-6 gap-y-2 p-4 hover:border-ink">
              <div className="font-display text-4xl font-extrabold">{b.from_code} to {b.to_code}</div>
              <div className="min-w-0 flex-1">
                <div className="font-bold">{b.train_number} {b.train_name}</div>
                <div className="text-sm text-ink/70">{fmtDate(b.journey_date)}, class {b.class_code}, {b.passenger_count} passenger{b.passenger_count === 1 ? '' : 's'}</div>
              </div>
              <div className="text-right">
                <StatusBadge status={b.status} />
                <div className="mt-1 text-sm text-ink/70">PNR {b.pnr}, {inr(b.total_fare)}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
