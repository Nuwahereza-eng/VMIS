import { useCallback, useEffect, useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import { getAlerts } from "../api/client.js";
import PageHeader from "../components/PageHeader.jsx";

const ALERT_META = {
  expiry_warning: { label: "Expiry warning", icon: "bi-hourglass-split", cls: "warn" },
  ticket_expired: { label: "Ticket expired", icon: "bi-shield-exclamation", cls: "danger" },
  overstay: { label: "Overstay", icon: "bi-exclamation-octagon", cls: "danger" },
  missing_exit: { label: "Missing exit", icon: "bi-box-arrow-right", cls: "warn" },
  duplicate_entry: { label: "Duplicate entry", icon: "bi-files", cls: "info" },
};

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AlertsPage() {
  const { session, online } = useApp();
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setAlerts(await getAlerts(session.token));
    } catch {
      setError("Could not load alerts. They need a live connection to the central system.");
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => {
    if (online) load();
    else setLoading(false);
  }, [online, load]);

  return (
    <>
      <PageHeader
        icon="bi-bell"
        title="Alerts"
        subtitle="Expiry warnings, overstays, and missing exits"
        actions={
          <button className="btn btn-ghost" onClick={load} disabled={!online || loading}>
            <i className={"bi bi-arrow-repeat" + (loading ? " spin" : "")} /> Refresh
          </button>
        }
      />

      {!online && (
        <div className="alert alert-warning">
          Alerts reflect central data and are unavailable offline. Reconnect to load them.
        </div>
      )}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="surface-card p-4">
        <div className="card-title-row">
          <i className="bi bi-exclamation-triangle" />
          <h2>Open alerts {alerts.length > 0 && <span className="pill gold ms-2">{alerts.length}</span>}</h2>
        </div>

        {loading ? (
          <div className="empty-state mb-0">
            <i className="bi bi-arrow-repeat spin" /> Loading…
          </div>
        ) : alerts.length === 0 ? (
          <div className="empty-state mb-0">
            <i className="bi bi-check2-circle" /> No open alerts. Everything looks healthy.
          </div>
        ) : (
          <div className="d-flex flex-column gap-2">
            {alerts.map((a, i) => {
              const meta = ALERT_META[a.kind] || {
                label: a.kind,
                icon: "bi-info-circle",
                cls: "info",
              };
              return (
                <div key={`${a.visit_id}-${i}`} className={"alert-row alert-row--" + meta.cls}>
                  <i className={"bi " + meta.icon} />
                  <div className="flex-grow-1">
                    <div className="fw-semibold" style={{ color: "var(--vmis-ink)" }}>
                      {meta.label}
                    </div>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {a.detail}
                    </div>
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      {a.entry_gate} · entered {formatDateTime(a.entry_timestamp)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
