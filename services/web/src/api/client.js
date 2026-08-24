// Thin API client for the FastAPI backend. Only used when online: logging in,
// flushing the outbound sync queue, and management reads. Feature writes never
// go straight here; they go to the local store and the outbox first.

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `HTTP ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

async function parse(res) {
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = body && body.detail ? body.detail : res.statusText;
    throw new ApiError(res.status, detail);
  }
  return body;
}

// OAuth2 password grant: /auth/token expects form-encoded credentials.
export async function login(username, password) {
  const form = new URLSearchParams({ username, password });
  const res = await fetch("/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const body = await parse(res);
  return body.access_token;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// Upload a batch of queued operations to the sync service.
export async function syncBatch(token, stationId, operations) {
  const res = await fetch("/sync/batch", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ station_id: stationId, operations }),
  });
  return parse(res);
}

export async function verifyVisitor(token, payload) {
  const res = await fetch("/visitors/verify", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ payload }),
  });
  return parse(res);
}

export async function getActivities(token) {
  const res = await fetch("/activities", { headers: authHeaders(token) });
  return parse(res);
}

export async function getDashboard(token) {
  const res = await fetch("/management/dashboard", { headers: authHeaders(token) });
  return parse(res);
}

// Management-only operational alerts (expiry warnings, overstays, etc.).
export async function getAlerts(token) {
  const res = await fetch("/management/alerts", { headers: authHeaders(token) });
  return parse(res);
}

// Management-only user administration.
export async function getUsers(token) {
  const res = await fetch("/users", { headers: authHeaders(token) });
  return parse(res);
}

export async function createUser(token, payload) {
  const res = await fetch("/users", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  return parse(res);
}

// Management-only park-wide visitor registry (server-backed, online only).
export async function getVisitors(token, { search = "", category = "", limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (category) params.set("category", category);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  const res = await fetch(`/visitors?${params.toString()}`, { headers: authHeaders(token) });
  return parse(res);
}

// Management-only periodic report (visitors, entries, activities, revenue).
export async function getReport(token, { granularity = "monthly", start = "", end = "" } = {}) {
  const params = new URLSearchParams({ granularity });
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const res = await fetch(`/management/reports?${params.toString()}`, {
    headers: authHeaders(token),
  });
  return parse(res);
}

// Download the same report as CSV. Returns a Blob for the browser to save.
export async function downloadReportCsv(token, { granularity = "monthly", start = "", end = "" } = {}) {
  const params = new URLSearchParams({ granularity });
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const res = await fetch(`/management/reports.csv?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return res.blob();
}
