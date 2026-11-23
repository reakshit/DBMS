import { Link } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Splash() {
  const { user, loading, isAdmin, isStaff } = useAuth();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section className="overflow-hidden rounded-sm bg-ink text-white shadow-sm">
        <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-board">RailDesk · Railway reservations</p>
            <h1 className="max-w-2xl text-5xl font-extrabold leading-[0.95] sm:text-7xl">Your next journey starts here.</h1>
            <p className="mt-4 max-w-xl text-lg text-white/75">Plan your trip, find your train, and keep every ticket in one place.</p>
            {!loading && (
              <div className="mt-6 flex flex-wrap gap-3">
                {user ? (
                  <>
                    <Link to="/trains" className="btn-board">Find a train</Link>
                    <Link to="/bookings" className="btn-ghost border-white/40 text-white hover:bg-white/10">My trips</Link>
                    {isStaff && <Link to="/staff" className="btn-ghost border-white/40 text-white hover:bg-white/10">Staff desk</Link>}
                    {isAdmin && <Link to="/admin" className="btn-ghost border-white/40 text-white hover:bg-white/10">Admin</Link>}
                  </>
                ) : (
                  <>
                    <Link to="/login?account_type=USER" className="btn-board">User sign in</Link>
                    <Link to="/login?account_type=ADMIN" className="btn-ghost border-white/40 text-white hover:bg-white/10">Admin sign in</Link>
                    <Link to="/register" className="btn-ghost border-white/40 text-white hover:bg-white/10">Create passenger account</Link>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-sm border border-white/20 bg-white/5 p-4">
              <div className="font-display text-2xl font-extrabold text-board">PASSENGER</div>
              <p className="mt-1 text-sm text-white/75">Search scheduled trains, book tickets, and manage trips.</p>
            </div>
            <div className="rounded-sm border border-white/20 bg-white/5 p-4">
              <div className="font-display text-2xl font-extrabold text-board">ADMIN & STAFF</div>
              <p className="mt-1 text-sm text-white/75">Manage train operations and view service information.</p>
            </div>
          </div>
        </div>
        <div className="h-1.5 bg-board" />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link to="/trains" className="panel p-5 transition-colors hover:border-ink">
          <h2 className="text-3xl font-extrabold">Find your train</h2>
          <p className="mt-1 text-ink/70">Choose your route and travel date to see available trains.</p>
        </Link>
        <Link to="/upcoming" className="panel p-5 transition-colors hover:border-ink">
          <h2 className="text-3xl font-extrabold">Upcoming schedules</h2>
          <p className="mt-1 text-ink/70">Browse train runs scheduled over the next few days.</p>
        </Link>
        <Link to="/pnr" className="panel p-5 transition-colors hover:border-ink sm:col-span-2">
          <h2 className="text-3xl font-extrabold">Check a PNR</h2>
          <p className="mt-1 text-ink/70">View ticket confirmation and waitlist status.</p>
        </Link>
      </section>
    </div>
  );
}
