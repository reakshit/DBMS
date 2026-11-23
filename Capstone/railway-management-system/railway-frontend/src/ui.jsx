import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/* ---------- data loading ---------- */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    return fn()
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => setState({ data: null, error, loading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run, setData: (data) => setState((s) => ({ ...s, data })) };
}

/* ---------- station board: the signature element ---------- */
export function StationBoard({ code, name, caption, className = '' }) {
  return (
    <div className={`board-in rounded-[3px] bg-board p-1 shadow-[0_2px_0_#101C33] ${className}`}>
      <div className="rounded-[2px] border-2 border-ink px-4 py-2 text-ink">
        {caption && <div className="text-sm font-bold">{caption}</div>}
        <div className="font-display text-5xl font-extrabold leading-none sm:text-6xl">{code || '- - -'}</div>
        <div className="mt-1 truncate text-[15px] font-medium">{name || 'Choose a station'}</div>
      </div>
    </div>
  );
}

/* ---------- small pieces ---------- */
const STATUS = {
  CONFIRMED: 'bg-go/10 text-go border-go/40',
  WAITLISTED: 'bg-wait/10 text-wait border-wait/40',
  RAC: 'bg-wait/10 text-wait border-wait/40',
  CANCELLED: 'bg-stop/10 text-stop border-stop/40',
  SCHEDULED: 'bg-coach/10 text-coach border-coach/40',
  DEPARTED: 'bg-ink/10 text-ink border-ink/30',
  PARTIAL: 'bg-wait/10 text-wait border-wait/40',
};
export const StatusBadge = ({ status, children }) => (
  <span className={`inline-block rounded-sm border px-2 py-0.5 text-sm font-bold ${STATUS[status] || 'border-rule'}`}>
    {children || status}
  </span>
);

export const Spinner = ({ label = 'Loading' }) => (
  <div className="flex items-center gap-3 py-10 text-ink/70" role="status">
    <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
    <span>{label}</span>
  </div>
);

export const ErrorNote = ({ error, onRetry }) =>
  error ? (
    <div className="flex flex-wrap items-center gap-3 rounded-sm border border-stop/50 bg-stop/5 px-4 py-3 text-stop" role="alert">
      <span className="font-medium">{error.message || String(error)}</span>
      {onRetry && <button className="underline" onClick={onRetry}>Try again</button>}
    </div>
  ) : null;

export const Empty = ({ title, children }) => (
  <div className="panel px-6 py-10 text-center">
    <div className="font-display text-2xl font-extrabold">{title}</div>
    {children && <div className="mx-auto mt-2 max-w-md text-ink/70">{children}</div>}
  </div>
);

export const PageHead = ({ title, children }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <h1 className="text-4xl font-extrabold sm:text-5xl">{title}</h1>
    {children}
  </div>
);

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-ink/60">{hint}</span>}
    </label>
  );
}

/* ---------- modal ---------- */
export function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/50 p-4 sm:items-center" onMouseDown={onClose}>
      <div
        ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className="w-full max-w-md rounded-sm bg-white p-6 outline-none" onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-3xl font-extrabold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/* ---------- toasts ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, kind = 'ok') => {
    const id = Math.random();
    setItems((l) => [...l, { id, message, kind }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 left-1/2 z-50 flex w-[92%] max-w-md -translate-x-1/2 flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`rounded-sm px-4 py-3 font-medium text-white shadow-lg ${t.kind === 'error' ? 'bg-stop' : 'bg-ink'}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
