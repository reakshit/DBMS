import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { Field, Spinner } from '../ui';
import { inr } from '../format';

function isValidPaymentState(state) {
  return Boolean(
    state?.order?.demo === true
    && typeof state.order.order_id === 'string'
    && Number.isFinite(state.order.amount)
    && typeof state.returnTo === 'string'
    && state.returnTo.startsWith('/book?')
  );
}

export default function PaymentSimulation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { order, returnTo, passengers } = location.state || {};
  const [qrCode, setQrCode] = useState('');
  const [qrError, setQrError] = useState(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isValidPaymentState(location.state)) return undefined;
    let active = true;
    QRCode.toDataURL(`RAILDESK DEMO PAYMENT\n${order.order_id}\n${order.amount}`, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 240,
      color: { dark: '#101C33', light: '#FFFFFF' },
    }).then((dataUrl) => {
      if (active) setQrCode(dataUrl);
    }).catch((generationError) => {
      console.error('Could not generate demo payment QR code:', generationError);
      if (active) setQrError('Could not generate the demo QR code. You can use the phone number option instead.');
    });
    return () => { active = false; };
  }, [location.state, order?.amount, order?.order_id]);

  if (!isValidPaymentState(location.state)) return <Navigate to="/trains" replace />;

  const continueToConfirmation = (method, methodDetail) => {
    navigate('/payment-done', {
      state: {
        order,
        returnTo,
        passengers,
        method,
        methodDetail,
      },
    });
  };

  const submitPhone = (event) => {
    event.preventDefault();
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setError('');
    continueToConfirmation('phone', phone);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Link to={returnTo} state={{ passengers }} className="mb-4 inline-flex items-center gap-2 font-bold text-coach hover:underline">
        <span aria-hidden="true">←</span> Back to booking
      </Link>
      <div className="panel overflow-hidden">
        <div className="bg-ink px-6 py-6 text-white sm:px-8">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-board">Demo checkout</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-4xl font-extrabold">UPI payment simulation</h1>
              <p className="mt-1 text-white/75">Choose a demo method to continue. No real payment is made.</p>
            </div>
            <div className="rounded-sm bg-white/10 px-4 py-2 text-right">
              <div className="text-sm text-white/70">Amount</div>
              <div className="text-2xl font-extrabold">{inr(order.amount / 100)}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-2">
          <section className="rounded-sm border border-rule p-5 text-center">
            <div className="text-lg font-extrabold">Scan demo QR code</div>
            <p className="mt-1 text-sm text-ink/65">Scan to view the demo payment reference on your device.</p>
            <div className="mx-auto mt-4 flex min-h-64 w-64 max-w-full items-center justify-center rounded-sm border border-rule bg-white p-3">
              {qrError ? (
                <p className="text-sm text-stop" role="alert">{qrError}</p>
              ) : qrCode ? (
                <img className="h-full w-full" src={qrCode} alt="Scannable demo payment QR code" />
              ) : (
                <Spinner label="Preparing QR code" />
              )}
            </div>
            <p className="mt-3 text-xs text-ink/60">This QR contains demo details only and cannot charge money.</p>
            <button type="button" className="btn-primary mt-4 w-full" onClick={() => continueToConfirmation('qr', 'QR code scanned')}>
              I scanned the QR code
            </button>
          </section>

          <section className="rounded-sm border border-rule p-5">
            <div className="text-lg font-extrabold">Use phone number</div>
            <p className="mt-1 text-sm text-ink/65">Enter a mobile number to simulate a UPI payment request.</p>
            <form className="mt-5 space-y-4" onSubmit={submitPhone}>
              <Field label="Mobile number" hint="10 digits, starting with 6, 7, 8, or 9">
                <div className="flex">
                  <span className="inline-flex items-center rounded-l-sm border border-r-0 border-rule bg-chalk px-3 font-bold">+91</span>
                  <input
                    className="input rounded-l-none"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    pattern="[6-9][0-9]{9}"
                    maxLength={10}
                    required
                    value={phone}
                    onChange={(event) => {
                      setPhone(event.target.value.replace(/\D/g, '').slice(0, 10));
                      setError('');
                    }}
                    placeholder="9876543210"
                  />
                </div>
              </Field>
              {error && <p className="text-sm font-medium text-stop" role="alert">{error}</p>}
              <button type="submit" className="btn-primary w-full">Continue with phone number</button>
            </form>
            <div className="mt-6 rounded-sm bg-chalk p-4 text-sm text-ink/70">
              <div className="font-bold text-ink">Demo privacy</div>
              <p className="mt-1">The number is only shown on the confirmation page. It is not sent to a payment provider.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
