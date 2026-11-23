import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { ErrorNote, Field } from '../ui';

function Shell({ title, children, footer }) {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-5xl font-extrabold">{title}</h1>
      <div className="panel p-6">{children}</div>
      <p className="mt-4 text-[15px]">{footer}</p>
    </div>
  );
}

function TrainIllustration() {
  return (
    <svg viewBox="0 0 760 620" className="h-full w-full" role="img" aria-labelledby="train-art-title">
      <title id="train-art-title">A train crossing a bridge through a mountain landscape</title>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#284f83" />
          <stop offset="1" stopColor="#9bb6cb" />
        </linearGradient>
        <linearGradient id="trainBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff4d6" />
          <stop offset="1" stopColor="#f4b400" />
        </linearGradient>
      </defs>
      <rect width="760" height="620" fill="url(#sky)" />
      <circle cx="580" cy="112" r="52" fill="#ffd477" opacity=".92" />
      <path d="M0 335 128 174l95 115 131-177 158 213 98-106 150 144v257H0Z" fill="#365b77" />
      <path d="m0 379 151-151 112 139 143-192 165 225 90-103 99 97v226H0Z" fill="#243f58" />
      <path d="M0 408q140-58 275 0t250 0q122-58 235 0v212H0Z" fill="#537d70" />
      <path d="M0 471q128-40 257 1t254 0q129-39 249 0v148H0Z" fill="#355f55" />
      <path d="M0 494h760" stroke="#f4b400" strokeWidth="5" opacity=".65" />
      <path d="M0 512h760M0 550h760" stroke="#e8d9b8" strokeWidth="8" opacity=".85" />
      <path d="M64 485v83m112-83v83m112-83v83m112-83v83m112-83v83m112-83v83m112-83v83" stroke="#d4c8ad" strokeWidth="7" />
      <path d="m0 588 760-169M0 619l760-169" stroke="#1b2e43" strokeWidth="13" />
      <g transform="translate(192 292) rotate(-8 205 100)">
        <path d="M25 67q0-24 25-24h356q23 0 33 23l24 68H25Z" fill="url(#trainBody)" stroke="#fff9e9" strokeWidth="7" />
        <path d="M52 56h320q16 0 23 14l9 23H52Z" fill="#17344e" />
        <path d="M58 62h74v24H58zm94 0h74v24h-74zm94 0h74v24h-74z" fill="#90bdd0" />
        <path d="M25 117h420v20H25z" fill="#b83227" />
        <path d="M25 137h420l-26 30H52q-18 0-27-30Z" fill="#f3e8d1" stroke="#fff9e9" strokeWidth="6" />
        <circle cx="99" cy="169" r="21" fill="#15263a" stroke="#c7d0d5" strokeWidth="7" />
        <circle cx="357" cy="169" r="21" fill="#15263a" stroke="#c7d0d5" strokeWidth="7" />
        <path d="M419 110h25v19h-25z" fill="#ffdd86" />
        <path d="M22 104H8" stroke="#f4b400" strokeWidth="8" strokeLinecap="round" />
      </g>
      <g fill="#eaf0e5" opacity=".55">
        <circle cx="80" cy="92" r="3" /><circle cx="130" cy="132" r="2" /><circle cx="692" cy="217" r="3" />
        <circle cx="645" cy="65" r="2" /><circle cx="322" cy="72" r="3" /><circle cx="523" cy="191" r="2" />
      </g>
      <rect x="28" y="28" width="704" height="564" rx="8" fill="none" stroke="#fff" strokeOpacity=".2" strokeWidth="2" />
    </svg>
  );
}

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [accountType, setAccountType] = useState('USER');
  const [f, setF] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const user = await login(f.email, f.password, accountType);
      nav(loc.state?.from || (user.role === 'ADMIN' ? '/admin' : '/trains'), { replace: true });
    }
    catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <div className="login-scene flex min-h-screen items-center justify-center p-4 sm:p-8">
      <div className="login-card grid w-full max-w-6xl overflow-hidden rounded-sm bg-white shadow-2xl lg:min-h-[650px] lg:grid-cols-[1.1fr_.9fr]">
        <section className="relative hidden min-h-[420px] overflow-hidden bg-ink lg:block" aria-label="Railway journey illustration">
          <TrainIllustration />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/95 via-ink/70 to-transparent p-10 pt-28 text-white">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-board">RailDesk · Railway reservations</p>
            <h1 className="mt-3 max-w-lg font-display text-6xl font-extrabold leading-[.95]">Every journey has a beginning.</h1>
            <p className="mt-4 max-w-md text-white/75">Sign in to find your train, manage your bookings, and keep moving.</p>
          </div>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-10 lg:p-14">
          <div className="w-full max-w-md">
            <div className="mb-9 lg:hidden">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-coach">RailDesk · Railway reservations</p>
              <h1 className="mt-3 font-display text-5xl font-extrabold leading-none">Your journey starts here.</h1>
            </div>
            <div className="mb-8">
              <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-sm bg-board text-ink" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M6 17V6.5A3.5 3.5 0 0 1 9.5 3h5A3.5 3.5 0 0 1 18 6.5V17M6 17h12M6 17l-2 3m14-3 2 3M8 20h8M8 7h8v5H8zM8 15h.01M16 15h.01" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-coach">Welcome aboard</p>
              <h2 className="mt-1 font-display text-5xl font-extrabold">Sign in</h2>
              <p className="mt-2 text-ink/65">Use your account email and password to continue.</p>
            </div>
            <form onSubmit={submit} className="space-y-5">
              <fieldset>
                <legend className="mb-2 text-sm font-bold">Choose your sign-in</legend>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    aria-pressed={accountType === 'USER'}
                    onClick={() => { setAccountType('USER'); setError(null); }}
                    className={`login-role login-role-user ${accountType === 'USER' ? 'login-role-selected' : ''}`}
                  >
                    <span className="login-role-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M7 18V6.5A3.5 3.5 0 0 1 10.5 3h3A3.5 3.5 0 0 1 17 6.5V18M7 18h10M7 18l-2 3m12-3 2 3M9 20h6M9 7h6v5H9zM9 15h.01M15 15h.01" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="block font-display text-2xl font-extrabold">User</span>
                    <span className="mt-1 block text-xs font-medium">Passenger account</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={accountType === 'ADMIN'}
                    onClick={() => { setAccountType('ADMIN'); setError(null); }}
                    className={`login-role login-role-admin ${accountType === 'ADMIN' ? 'login-role-selected' : ''}`}
                  >
                    <span className="login-role-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M12 3 19 6v5c0 4.7-2.9 8-7 10-4.1-2-7-5.3-7-10V6l7-3Z" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="block font-display text-2xl font-extrabold">Admin</span>
                    <span className="mt-1 block text-xs font-medium">Management account</span>
                  </button>
                </div>
                <p className="mt-2 text-xs text-ink/55">
                  {accountType === 'ADMIN'
                    ? 'Admin sign-in only accepts an account assigned the ADMIN role.'
                    : 'User sign-in is for passenger and staff accounts.'}
                </p>
              </fieldset>
              <Field label="Email address">
                <input className="input login-input" type="email" required autoComplete="email" autoFocus value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="you@example.com" />
              </Field>
              <Field label="Password">
                <input className="input login-input" type="password" required autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="Enter your password" />
              </Field>
              <ErrorNote error={error} />
              <button className="btn-primary login-submit w-full" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
                {!busy && <span aria-hidden="true">→</span>}
              </button>
            </form>
            <p className="mt-8 border-t border-rule pt-5 text-sm text-ink/55">Secure access · Your account permissions are based on your assigned role.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

export function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ full_name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await register(f); nav('/trains', { replace: true }); }
    catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <Shell title="Create account" footer={<>Already registered? <Link className="font-bold underline" to="/login">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name"><input className="input" required maxLength={100} value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label="Email"><input className="input" type="email" required autoComplete="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Phone number" hint="10 to 15 digits, no spaces"><input className="input" inputMode="numeric" required pattern="\d{10,15}" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Password" hint="At least 8 characters"><input className="input" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>
        <ErrorNote error={error} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating account' : 'Create account'}</button>
      </form>
    </Shell>
  );
}
