import { useCallback, useEffect, useMemo, useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import { getAlerts } from "../api/client.js";
import { visitorCode } from "../domain/ids.js";
import PageHeader from "../components/PageHeader.jsx";

// kind -> presentation + severity. `sev` drives sort order and summary buckets.
const ALERT_META = {
  ticket_expired: { label: "Ticket expired", icon: "bi-shield-exclamation", cls: "danger", sev: "critical" },
  overstay: { label: "Overstay", icon: "bi-exclamation-octagon", cls: "danger", sev: "critical" },
  expiry_warning: { label: "Expiry warning", icon: "bi-hourglass-split", cls: "warn", sev: "warning" },
  missing_exit: { label: "Missing exit", icon: "bi-box-arrow-right", cls: "warn", sev: "warning" },
  duplicate_entry: { label: "Duplicate entry", icon: "bi-files", cls: "info", sev: "info" },
};

const SEV_RANK = { critical: 0, warning: 1, info: 2 };

const SUMMARY = [
  { key: "critical", label: "Critical", icon: "bi-exclamation-octagon", tone: "danger" },
  { key: "warning", label: "Warnings", icon: "bi-exclamation-triangle", tone: "warn" },
  { key: "info", label: "Informational", icon: "bi-info-circle", tone: "info" },
];

function metaFor(kind) {
  return ALERT_META[kind] || { label: kind, icon: "bi-info-circle", cls: "info", sev: "info" };
}

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

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function AlertsPage() {
  const { session, online } = useApp();
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

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

  // Counts per severity for the summary cards.
  const sevCounts = useMemo(() => {
    const counts = { critical: 0, warning: 0, info: 0 };
    for (const a of alerts) counts[metaFor(a.kind).sev] += 1;
    return counts;
  }, [alerts]);

  // Counts per kind, for the filter chips (only kinds that actually occur).
  const kindCounts = useMemo(() => {
    const counts = {};
    for (const a of alerts) counts[a.kind] = (counts[a.kind] || 0) + 1;
    return counts;
  }, [alerts]);

  // Severity-first, then most-recent-entry-first, then the active kind filter.
  const visible = useMemo(() => {
    const sorted = [...alerts].sort((a, b) => {
      const sa = SEV_RANK[metaFor(a.kind).sev];
      const sb = SEV_RANK[metaFor(b.kind).sev];
      if (sa !== sb) return sa - sb;
      return String(b.entry_timestamp).localeCompare(String(a.entry_timestamp));
    });
    return filter === "all" ? sorted : sorted.filter((a) => a.kind === filter);
  }, [alerts, filter]);

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

      {/* Severity summary */}
      <div className="row g-3 mb-1">
        {SUMMARY.map((s) => (
          <div className="col-sm-4" key={s.key}>
            <div className="stat-card">
              <div className={"stat-card__icon " + s.tone}>
                <i className={"bi " + s.icon} />
              </div>
              <div>
                <div className="stat-card__label">{s.label}</div>
                <div className="stat-card__value">{loading ? "—" : sevCounts[s.key]}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="surface-card p-4">
        <div className="card-title-row">
          <i className="bi bi-exclamation-triangle" />
          <h2>
            Open alerts
            {alerts.length > 0 && <span className="pill gold ms-2">{alerts.length}</span>}
          </h2>
        </div>

        {/* Filter chips */}
        {alerts.length > 0 && (
          <div className="filter-chips">
            <button
              className={"filter-chip" + (filter === "all" ? " is-active" : "")}
              onClick={() => setFilter("all")}
            >
              All <span className="filter-chip__n">{alerts.length}</span>
            </button>
            {Object.keys(kindCounts)
              .sort((a, b) => SEV_RANK[metaFor(a).sev] - SEV_RANK[metaFor(b).sev])
              .map((kind) => (
                <button
                  key={kind}
                  className={"filter-chip" + (filter === kind ? " is-active" : "")}
                  onClick={() => setFilter(kind)}
                >
                  <i className={"bi " + metaFor(kind).icon} /> {metaFor(kind).label}
                  <span className="filter-chip__n">{kindCounts[kind]}</span>
                </button>
              ))}
          </div>
        )}

        {loading ? (
          <div className="empty-state mb-0">
            <i className="bi bi-arrow-repeat spin" /> Loading…
          </div>
        ) : alerts.length === 0 ? (
          <div className="empty-state mb-0">
            <i className="bi bi-check2-circle" /> No open alerts. Everything looks healthy.
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-state mb-0">
            <i className="bi bi-funnel" /> No alerts match this filter.
          </div>
        ) : (
          <div className="d-flex flex-column gap-2">
            {visible.map((a, i) => {
              const meta = metaFor(a.kind);
              return (
                <div key={`${a.visit_id}-${i}`} className={"alert-row alert-row--" + meta.cls}>
                  <i className={"bi " + meta.icon} />
                  <div className="flex-grow-1">
                    <div className="alert-row__head">
                      <span className="fw-semibold" style={{ color: "var(--vmis-ink)" }}>
                        {meta.label}
                      </span>
                      <span className={"pill " + (meta.cls === "danger" ? "expired" : meta.cls)}>
                        {meta.sev}
                      </span>
                      <span className="alert-row__code">{visitorCode(a.visitor_id)}</span>
                      <span className="alert-row__ago">{timeAgo(a.entry_timestamp)}</span>
                    </div>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {a.detail}
                    </div>
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      <i className="bi bi-geo-alt" /> {a.entry_gate} · entered{" "}
                      {formatDateTime(a.entry_timestamp)}
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
