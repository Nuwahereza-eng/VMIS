import { useEffect, useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import { getDashboard } from "../api/client.js";
import { formatMinor } from "../domain/categories.js";
import PageHeader from "../components/PageHeader.jsx";

const ALERT_META = {
  ticket_expired: { label: "Ticket expired", icon: "bi-hourglass-bottom" },
  overstay: { label: "Overstay", icon: "bi-exclamation-triangle" },
  missing_exit: { label: "Missing exit", icon: "bi-door-closed" },
  duplicate_entry: { label: "Duplicate entry", icon: "bi-files" },
};

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

function BreakdownCard({ icon, title, rows, emptyText }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="surface-card p-4 h-100">
      <div className="card-title-row">
        <i className={"bi " + icon} />
        <h3>{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="muted mb-0" style={{ fontSize: "0.9rem" }}>{emptyText}</p>
      ) : (
        <div className="d-flex flex-column gap-3">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="d-flex justify-content-between mb-1">
                <span style={{ fontSize: "0.9rem", color: "var(--vmis-ink)", fontWeight: 500 }}>
                  {r.label}
                </span>
                <span className="fw-semibold">{r.count}</span>
              </div>
              <div style={{ height: 7, background: "var(--vmis-bg-2)", borderRadius: 99 }}>
                <div
                  style={{
                    width: `${(r.count / max) * 100}%`,
                    height: "100%",
                    borderRadius: 99,
                    background: "linear-gradient(90deg, var(--vmis-green-500), var(--vmis-green-700))",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { session, online } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      setData(await getDashboard(session.token));
    } catch {
      setError("Could not load the dashboard. It needs a live connection to the central system.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (online) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const totalActivities = (data?.by_activity || []).reduce((s, r) => s + r.count, 0);
  const totalAlerts = (data?.alert_counts || []).reduce((s, r) => s + r.count, 0);

  return (
    <>
      <PageHeader
        icon="bi-grid-1x2"
        title="Operations dashboard"
        subtitle="Live park activity, revenue, and station synchronisation health"
        actions={
          <button className="btn btn-ghost" onClick={load} disabled={!online || loading}>
            <i className={"bi bi-arrow-repeat" + (loading ? " spin" : "")} /> Refresh
          </button>
        }
      />

      {!online && (
        <div className="alert alert-warning">
          The dashboard reflects central data and is unavailable offline. Reconnect to load live figures.
        </div>
      )}
      {error && <div className="alert alert-danger">{error}</div>}

      {data && (
        <>
          <div className="row g-3 mb-1">
            <div className="col-sm-6 col-xl-3">
              <div className="stat-card">
                <div className="stat-card__icon green"><i className="bi bi-people" /></div>
                <div>
                  <div className="stat-card__label">Inside now</div>
                  <div className="stat-card__value">{data.inside_now}</div>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-xl-3">
              <div className="stat-card">
                <div className="stat-card__icon gold"><i className="bi bi-cash-stack" /></div>
                <div>
                  <div className="stat-card__label">Revenue</div>
                  <div className="stat-card__value" style={{ fontSize: "1.25rem" }}>
                    {data.revenue.length === 0
                      ? "—"
                      : data.revenue.map((r) => formatMinor(r.amount_minor, r.currency)).join(" · ")}
                  </div>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-xl-3">
              <div className="stat-card">
                <div className="stat-card__icon info"><i className="bi bi-binoculars" /></div>
                <div>
                  <div className="stat-card__label">Activities logged</div>
                  <div className="stat-card__value">{totalActivities}</div>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-xl-3">
              <div className="stat-card">
                <div className="stat-card__icon warn"><i className="bi bi-bell" /></div>
                <div>
                  <div className="stat-card__label">Open alerts</div>
                  <div className="stat-card__value">{totalAlerts}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="row g-3 mt-1">
            <div className="col-lg-6">
              <BreakdownCard
                icon="bi-door-open"
                title="Visitors by gate"
                rows={data.by_gate}
                emptyText="No one is currently inside the park."
              />
            </div>
            <div className="col-lg-6">
              <BreakdownCard
                icon="bi-tags"
                title="Visitors by category"
                rows={data.by_category}
                emptyText="No active visitors to categorise yet."
              />
            </div>
            <div className="col-lg-6">
              <BreakdownCard
                icon="bi-binoculars"
                title="Top activities"
                rows={data.by_activity}
                emptyText="No activities have been captured yet."
              />
            </div>
            <div className="col-lg-6">
              <BreakdownCard
                icon="bi-building"
                title="Accommodation by lodge"
                rows={data.by_lodge}
                emptyText="No accommodation recorded yet."
              />
            </div>
          </div>

          <div className="row g-3 mt-1">
            <div className="col-lg-7">
              <div className="surface-card p-4 h-100">
                <div className="card-title-row">
                  <i className="bi bi-hdd-network" />
                  <h3>Station sync health</h3>
                </div>
                {data.stations.length === 0 ? (
                  <div className="empty-state">
                    <i className="bi bi-router" />
                    No station has synced yet.
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table align-middle mb-0">
                      <thead>
                        <tr>
                          <th>Station</th>
                          <th>Last sync</th>
                          <th className="text-end">Operations</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.stations.map((s) => (
                          <tr key={s.station_id}>
                            <td className="fw-semibold" style={{ color: "var(--vmis-ink)" }}>
                              <i className="bi bi-hdd me-2 muted" />
                              {s.station_id}
                            </td>
                            <td>
                              <span className="pill active">
                                <i className="bi bi-clock-history" /> {timeAgo(s.last_sync_at)}
                              </span>
                            </td>
                            <td className="text-end">{s.operations}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div className="col-lg-5">
              <div className="surface-card p-4 h-100">
                <div className="card-title-row">
                  <i className="bi bi-exclamation-triangle" />
                  <h3>Operational alerts</h3>
                </div>
                {data.alert_counts.length === 0 ? (
                  <div className="empty-state">
                    <i className="bi bi-check2-circle" />
                    All clear. No alerts right now.
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    {data.alert_counts.map((a) => {
                      const meta = ALERT_META[a.label] || { label: a.label, icon: "bi-dot" };
                      return (
                        <div key={a.label} className="data-row mb-0">
                          <span className="d-flex align-items-center gap-2">
                            <i className={"bi " + meta.icon} style={{ color: "var(--vmis-warning)" }} />
                            <span style={{ color: "var(--vmis-ink)", fontWeight: 500 }}>{meta.label}</span>
                          </span>
                          <span className="pill gold">{a.count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
