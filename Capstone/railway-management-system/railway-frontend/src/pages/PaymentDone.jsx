import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { inr } from '../format';

function isValidPaymentState(state) {
  return Boolean(
    state?.order?.demo === true
    && typeof state.order.order_id === 'string'
    && Number.isFinite(state.order.amount)
    && typeof state.returnTo === 'string'
    && state.returnTo.startsWith('/book?')
    && ['qr', 'phone'].includes(state.method)
  );
}

export default function PaymentDone() {
  const location = useLocation();
  const navigate = useNavigate();
  const { order, returnTo, passengers, method, methodDetail } = location.state || {};

  if (!isValidPaymentState(location.state)) return <Navigate to="/trains" replace />;

  const returnToBooking = () => {
    navigate(returnTo, {
      replace: true,
      state: {
        demoPaymentDone: true,
        orderId: order.order_id,
        passengers,
      },
    });
  };

  return (
    <div className="mx-auto max-w-xl">
      <div className="panel p-6 sm:p-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-go/10 text-4xl font-extrabold text-go" aria-hidden="true">
          ✓
        </div>
        <p className="mt-5 text-center text-sm font-bold uppercase tracking-[0.2em] text-coach">Demo payment step</p>
        <h1 className="mt-2 text-center text-4xl font-extrabold">Payment simulation</h1>
        <p className="mt-3 text-center text-ink/70">
          {method === 'phone'
            ? `A simulated UPI request was sent to +91 ${methodDetail}.`
            : 'Your demo QR scan has been recorded.'}
        </p>
        <div className="mt-6 rounded-sm border border-rule bg-chalk p-4">
          <div className="flex justify-between gap-3"><span className="text-ink/70">Simulated amount</span><strong>{inr(order.amount / 100)}</strong></div>
          <div className="mt-2 flex justify-between gap-3"><span className="text-ink/70">Payment reference</span><strong className="font-mono text-sm">{order.order_id.slice(-12).toUpperCase()}</strong></div>
        </div>
        <p className="mt-5 rounded-sm border border-wait/40 bg-wait/10 p-4 text-sm font-bold text-wait">
          Demo only. Pressing the button confirms the simulation; no money will be charged.
        </p>
        <button type="button" className="btn-primary mt-6 w-full" onClick={returnToBooking}>Payment done</button>
        <Link to={returnTo} state={{ passengers }} className="mt-4 block text-center text-sm font-bold text-coach hover:underline">Cancel and return to booking</Link>
      </div>
    </div>
  );
}
