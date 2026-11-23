export const inr = (n) =>
  '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// MySQL dates arrive as "YYYY-MM-DD" (backend uses dateStrings); build a local date to avoid timezone shifts
const toDate = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const fmtDate = (s) =>
  s ? toDate(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
export const fmtShortDate = (s) =>
  s ? toDate(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
export const fmtTime = (t) => (t ? String(t).slice(0, 5) : '');
export const fmtDateTime = (s) => {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T'));
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const isoDate = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const CLASS_NAMES = { SL: 'Sleeper', '3A': 'AC 3 Tier', '2A': 'AC 2 Tier', '1A': 'AC First Class' };
export const berthName = (b) => (b ? b.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '');
