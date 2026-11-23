import { useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { Spinner } from './ui';
import Home from './pages/Home';
import Search from './pages/Search';
import Book from './pages/Book';
import Ticket from './pages/Ticket';
import MyBookings from './pages/MyBookings';
import Pnr from './pages/Pnr';
import Schedule from './pages/Schedule';
import { Login, Register } from './pages/Auth';
import Staff from './pages/Staff';
import Admin from './pages/Admin';
import UpcomingRuns from './pages/UpcomingRuns';
import PaymentSimulation from './pages/PaymentSimulation';
import PaymentDone from './pages/PaymentDone';

function Guard({ children, role }) {
  const { user, loading, isStaff, isAdmin } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
  if ((role === 'STAFF' && !isStaff) || (role === 'ADMIN' && !isAdmin)) {
    return <div className="panel p-8"><h1 className="text-3xl font-extrabold">No access</h1><p className="mt-2">Your account does not have permission to open this page.</p></div>;
  }
  return children;
}

const linkCls = ({ isActive }) =>
  `rounded-sm px-3 py-2 text-[15px] font-bold ${isActive ? 'bg-board text-ink' : 'text-white/90 hover:bg-white/10'}`;

function Header() {
  const { user, logout, isStaff, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const homePath = isAdmin ? '/admin' : '/trains';
  return (
    <header className="bg-ink text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link to={homePath} className="font-display text-3xl font-extrabold tracking-wide" onClick={close}>
          Rail<span className="text-board">Desk</span>
        </Link>
        <button className="ml-auto rounded-sm border border-white/30 px-3 py-1.5 text-sm font-bold md:hidden" onClick={() => setOpen(!open)} aria-expanded={open}>
          Menu
        </button>
        <nav className={`${open ? 'flex' : 'hidden'} w-full flex-col gap-1 md:flex md:w-auto md:flex-1 md:flex-row md:items-center`} onClick={close}>
          {isAdmin ? (
            <>
              <NavLink to="/admin" className={linkCls}>Admin</NavLink>
              <NavLink to="/trains" className={linkCls}>Book</NavLink>
              <NavLink to="/pnr" className={linkCls}>PNR status</NavLink>
              <NavLink to="/staff" className={linkCls}>Staff</NavLink>
              <NavLink to="/upcoming" className={linkCls}>Upcoming trains</NavLink>
            </>
          ) : (
            <>
              <NavLink to="/trains" className={linkCls}>Book</NavLink>
              <NavLink to="/upcoming" className={linkCls}>Upcoming trains</NavLink>
              <NavLink to="/pnr" className={linkCls}>PNR status</NavLink>
              {user && <NavLink to="/bookings" className={linkCls}>My trips</NavLink>}
              {isStaff && <NavLink to="/staff" className={linkCls}>Staff</NavLink>}
            </>
          )}
          <div className="md:ml-auto md:flex md:items-center md:gap-3">
            {user ? (
              <>
                <span className="px-3 py-2 text-[15px] text-white/80">{user.full_name}</span>
                <button className="rounded-sm border border-white/30 px-3 py-2 text-[15px] font-bold hover:bg-white/10" onClick={logout}>Sign out</button>
              </>
            ) : (
              <>
                <NavLink to="/login" className={linkCls}>Sign in</NavLink>
                <Link to="/register" className="btn-board">Create account</Link>
              </>
            )}
          </div>
        </nav>
      </div>
      <div className="h-1.5 bg-board" />
    </header>
  );
}

export default function App() {
  const { user, loading, isAdmin } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;

  const isLoginPage = !user && loc.pathname === '/login';
  return (
    <div className="min-h-screen">
      {user && <Header />}
      <main className={isLoginPage ? '' : 'mx-auto max-w-6xl px-4 py-8'}>
        <Routes>
          <Route path="/" element={<Navigate to={user ? (isAdmin ? '/admin' : '/trains') : '/login'} replace />} />
          <Route path="/login" element={user ? <Navigate to={isAdmin ? '/admin' : '/trains'} replace /> : <Login />} />
          <Route path="/register" element={user ? <Navigate to={isAdmin ? '/admin' : '/trains'} replace /> : <Register />} />
          <Route path="/trains" element={<Guard><Home /></Guard>} />
          <Route path="/search" element={<Guard><Search /></Guard>} />
          <Route path="/upcoming" element={<Guard><UpcomingRuns /></Guard>} />
          <Route path="/train/:trainNumber" element={<Guard><Schedule /></Guard>} />
          <Route path="/pnr" element={<Guard><Pnr /></Guard>} />
          <Route path="/pnr/:pnr" element={<Guard><Pnr /></Guard>} />
          <Route path="/book" element={<Guard><Book /></Guard>} />
          <Route path="/payment-simulation" element={<Guard><PaymentSimulation /></Guard>} />
          <Route path="/payment-done" element={<Guard><PaymentDone /></Guard>} />
          <Route path="/bookings" element={<Guard><MyBookings /></Guard>} />
          <Route path="/ticket/:pnr" element={<Guard><Ticket /></Guard>} />
          <Route path="/staff" element={<Guard role="STAFF"><Staff /></Guard>} />
          <Route path="/admin" element={<Guard role="ADMIN"><Admin /></Guard>} />
          <Route path="*" element={user
            ? <div className="panel p-8"><h1 className="text-3xl font-extrabold">Page not found</h1><Link className="mt-3 inline-block underline" to="/trains">Back to booking</Link></div>
            : <Navigate to="/login" replace />} />
        </Routes>
      </main>
    </div>
  );
}
