// Thin fetch wrapper around the Express API. Errors arrive as { error: "..." }.
const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const KEY = 'rail_token';

export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function request(path, { method = 'GET', body, query } = {}) {
  const qs = query
    ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '')).toString()
    : '';
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}${path}${qs}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check that the backend is running on port 4000.');
  }
  const contentType = res.headers.get('content-type') || '';
  const responseBody = contentType.includes('application/json')
    ? await res.json().catch(() => null)
    : await res.text().catch(() => '');
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event('rail:unauthorized'));
    throw new ApiError(res.status, responseBody?.error || responseBody || `Request failed (${res.status})`);
  }
  return responseBody;
}

export const api = {
  // auth
  login: (email, password, account_type) => request('/auth/login', { method: 'POST', body: { email, password, account_type } }),
  register: (b) => request('/auth/register', { method: 'POST', body: b }),
  me: () => request('/auth/me'),
  // public
  stations: (q = '') => request('/stations', { query: { q } }),
  upcomingRuns: (days = 7) => request('/runs/upcoming', { query: { days } }),
  search: (from, to, date) => request('/trains/search', { query: { from, to, date } }),
  schedule: (trainNumber) => request(`/trains/${encodeURIComponent(trainNumber)}/schedule`),
  availability: (runId, from, to) => request(`/runs/${runId}/availability`, { query: { from, to } }),
  pnr: (pnr) => request(`/pnr/${pnr}`),
  // bookings
  createPaymentOrder: (b) => request('/payments/orders', { method: 'POST', body: b }),
  verifyPayment: (b) => request('/payments/verify', { method: 'POST', body: b }),
  myBookings: () => request('/bookings'),
  ticket: (pnr) => request(`/bookings/${pnr}`),
  cancelPassenger: (pnr, id) => request(`/bookings/${pnr}/passengers/${id}/cancel`, { method: 'POST' }),
  cancelBooking: (pnr) => request(`/bookings/${pnr}/cancel`, { method: 'POST' }),
  // staff
  staffRuns: (date) => request('/staff/runs', { query: { date } }),
  staffChart: (runId) => request(`/staff/runs/${runId}/chart`),
  setRunStatus: (runId, status) => request(`/staff/runs/${runId}/status`, { method: 'PATCH', body: { status } }),
  // admin
  addStation: (b) => request('/admin/stations', { method: 'POST', body: b }),
  addTrain: (b) => request('/admin/trains', { method: 'POST', body: b }),
  trains: () => request('/admin/trains'),
  setTrainActive: (id, is_active) => request(`/admin/trains/${id}`, { method: 'PATCH', body: { is_active } }),
  updateTrain: (id, b) => request(`/admin/trains/${id}`, { method: 'PATCH', body: b }),
  addStop: (trainId, b) => request(`/admin/trains/${trainId}/stops`, { method: 'POST', body: b }),
  addCoach: (trainId, b) => request(`/admin/trains/${trainId}/coaches`, { method: 'POST', body: b }),
  addRuns: (b) => request('/admin/runs', { method: 'POST', body: b }),
  setFare: (classCode, rate_per_km) => request(`/admin/fares/${classCode}`, { method: 'PUT', body: { rate_per_km } }),
  fareAudit: () => request('/admin/fare-audit'),
  users: () => request('/admin/users'),
  setRole: (id, role) => request(`/admin/users/${id}/role`, { method: 'PATCH', body: { role } }),
  revenueByTrain: () => request('/admin/reports/revenue-by-train'),
  revenueByRoute: () => request('/admin/reports/revenue-by-route'),
  topTrains: (limit = 5) => request('/admin/reports/top-trains', { query: { limit } }),
  cancellationRate: () => request('/admin/reports/cancellation-rate'),
};
