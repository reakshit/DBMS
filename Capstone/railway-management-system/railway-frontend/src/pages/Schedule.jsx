import { useParams } from 'react-router-dom';
import { api } from '../api';
import { ErrorNote, Spinner, useAsync } from '../ui';
import { fmtTime } from '../format';

export default function Schedule() {
  const { trainNumber } = useParams();
  const { data, error, loading, reload } = useAsync(() => api.schedule(trainNumber), [trainNumber]);
  if (loading) return <Spinner label="Loading timetable" />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-4xl font-extrabold sm:text-5xl">{data.train_number} {data.train_name}</h1>
      <p className="mb-6 text-ink/70">Every stop on the route, with arrival and departure times.</p>
      <div className="panel overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-rule"><tr>
            <th className="th">Stop</th><th className="th">Station</th><th className="th">Day</th><th className="th">Arrives</th><th className="th">Departs</th><th className="th text-right">Distance</th>
          </tr></thead>
          <tbody>
            {data.stops.map((s) => (
              <tr key={s.stop_seq} className="border-b border-rule last:border-0">
                <td className="td font-display text-2xl font-extrabold">{s.stop_seq}</td>
                <td className="td"><span className="font-bold">{s.station_name}</span> <span className="text-ink/60">{s.station_code}</span></td>
                <td className="td">{s.day_offset + 1}</td>
                <td className="td">{fmtTime(s.arrival_time) || '-'}</td>
                <td className="td">{fmtTime(s.departure_time) || '-'}</td>
                <td className="td text-right">{s.distance_km} km</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
