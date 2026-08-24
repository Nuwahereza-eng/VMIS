import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useApp } from "../context/AppContext.jsx";
import { getAlerts } from "../api/client.js";
import { visitorCode } from "../domain/ids.js";
import { CATEGORIES } from "../domain/categories.js";
import PageHeader from "../components/PageHeader.jsx";

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.code, c.label]));

// kind -> presentation + severity. `sev` drives sort order and summary buckets.
// `action` names the concrete next step so the row isn't generic.
const ALERT_META = {
  ticket_expired: {
    label: "Ticket expired",
    icon: "bi-shield-exclamation",
    cls: "danger",
    sev: "critical",
    action: "Locate the visitor and record their exit or renew the ticket.",
  },
  overstay: {
    label: "Overstay",
    icon: "bi-exclamation-octagon",
    cls: "danger",
    sev: "critical",
    action: "Dispatch a ranger — the visitor is well past their ticket expiry.",
  },
  expiry_warning: {
    label: "Expiry warning",
    icon: "bi-hourglass-split",
    cls: "warn",
    sev: "warning",
    action: "Remind the visitor to renew or exit before the ticket lapses.",
  },
  missing_exit: {
    label: "Missing exit",
    icon: "bi-box-arrow-right",
    cls: "warn",
    sev: "warning",
    action: "Confirm whether the visitor already left and record the exit.",
  },
  duplicate_entry: {
    label: "Duplicate entry",
    icon: "bi-files",
    cls: "info",
    sev: "info",
    action: "Review the open stays and close the erroneous one.",
  },
};

const SEV_RANK = { critical: 0, warning: 1, info: 2 };

const SUMMARY = [
  { key: "critical", label: "Critical", icon: "bi-exclamation-octagon", tone: "danger" },
  { key: "warning", label: "Warnings", icon: "bi-exclamation-triangle", tone: "warn" },
  { key: "info", label: "Informational", icon: "bi-info-circle", tone: "info" },
];

function metaFor(kind) {
  return (
    ALERT_META[kind] || {
      label: kind,
      icon: "bi-info-circle",
      cls: "info",
      sev: "info",
      action: "Open the visitor to investigate.",
    }
  );
}

function initials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
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
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [openRow, setOpenRow] = useState(null);

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

  // Open the real problem: jump to the visitor in the registry and auto-open
  // their profile, pre-filtered by name so management lands on the right record.
  const openVisitor = useCallback(
    (a) => {
      navigate("/visitors", {
        state: { search: a.visitor_name || "", openVisitorId: a.visitor_id },
      });
    },
    [navigate]
  );

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
              const rowKey = `${a.visit_id}-${i}`;
              const isOpen = openRow === rowKey;
              const name = a.visitor_name || "Unknown visitor";
              const category = CATEGORY_LABEL[a.visitor_category] || a.visitor_category;
              return (
                <div
                  key={rowKey}
                  className={"alert-item alert-item--" + meta.cls + (isOpen ? " is-open" : "")}
                >
                  <button
                    type="button"
                    className="alert-item__main"
                    onClick={() => setOpenRow(isOpen ? null : rowKey)}
                    aria-expanded={isOpen}
                  >
                    <span className={"alert-item__avatar avatar avatar--" + meta.cls}>
                      {initials(a.visitor_name)}
                    </span>
                    <span className="alert-item__body">
                      <span className="alert-item__head">
                        <span className="alert-item__name">{name}</span>
                        <span className={"pill " + (meta.cls === "danger" ? "expired" : meta.cls)}>
                          {meta.label}
                        </span>
                        {category && <span className="pill neutral">{category}</span>}
                      </span>
                      <span className="alert-item__detail">{a.detail}</span>
                      <span className="alert-item__meta">
                        <span><i className="bi bi-person-badge" /> {visitorCode(a.visitor_id)}</span>
                        <span><i className="bi bi-geo-alt" /> {a.entry_gate}</span>
                        <span><i className="bi bi-clock-history" /> {timeAgo(a.entry_timestamp)}</span>
                      </span>
                    </span>
                    <i className={"bi alert-item__chev " + (isOpen ? "bi-chevron-up" : "bi-chevron-down")} />
                  </button>

                  {isOpen && (
                    <div className="alert-item__panel">
                      <div className="alert-item__facts">
                        <div>
                          <span className="alert-item__label">Visitor</span>
                          <span className="alert-item__value">{name}</span>
                        </div>
                        <div>
                          <span className="alert-item__label">Nationality</span>
                          <span className="alert-item__value">{a.nationality || "—"}</span>
                        </div>
                        <div>
                          <span className="alert-item__label">Entry gate</span>
                          <span className="alert-item__value">{a.entry_gate}</span>
                        </div>
                        <div>
                          <span className="alert-item__label">Entered</span>
                          <span className="alert-item__value">{formatDateTime(a.entry_timestamp)}</span>
                        </div>
                        <div>
                          <span className="alert-item__label">Ticket expiry</span>
                          <span className="alert-item__value">{formatDateTime(a.expiry_timestamp)}</span>
                        </div>
                        <div>
                          <span className="alert-item__label">Ticket no.</span>
                          <span className="alert-item__value">{a.ticket_number || "—"}</span>
                        </div>
                      </div>
                      <div className={"alert-item__hint alert-item__hint--" + meta.cls}>
                        <i className={"bi " + meta.icon} /> {meta.action}
                      </div>
                      <div className="alert-item__actions">
                        <button className="btn btn-success btn-sm" onClick={() => openVisitor(a)}>
                          <i className="bi bi-person-lines-fill" /> Open visitor profile
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
