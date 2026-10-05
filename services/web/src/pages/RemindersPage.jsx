import { useEffect, useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import { getReminders } from "../api/client.js";
import PageHeader from "../components/PageHeader.jsx";

const KIND_PILL = {
  overdue: "expired",
  due_today: "active",
  day_before: "gold",
  week_before: "neutral",
  scheduled: "neutral",
};

function whenLabel(days) {
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

function ReminderTable({ title, icon, items, emptyText }) {
  return (
    <div className="surface-card p-4 h-100">
      <div className="card-title-row">
        <i className={"bi " + icon} />
        <h3>{title}</h3>
      </div>
      {items.length === 0 ? (
        <div className="empty-state">
          <i className="bi bi-check2-circle" />
          {emptyText}
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead>
              <tr>
                <th>Visitor</th>
                <th>Visit date</th>
                <th className="text-end">When</th>
                <th className="text-end">Party</th>
                <th>Gate</th>
                <th>Contact</th>
                <th className="text-end">Reminder</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.booking_id}>
                  <td className="fw-semibold" style={{ color: "var(--vmis-ink)" }}>
                    {r.full_name}
                    {r.country ? <span className="muted"> · {r.country}</span> : null}
                  </td>
                  <td>{r.intended_date}</td>
                  <td className="text-end">{whenLabel(r.days_until)}</td>
                  <td className="text-end">{r.party_size}</td>
                  <td>{r.expected_gate || <span className="muted">—</span>}</td>
                  <td>
                    {r.contactable ? (
                      <span className="muted" style={{ fontSize: "0.85rem" }}>
                        {r.email || r.phone}
                      </span>
                    ) : (
                      <span className="pill expired" title="No phone or email on the booking">
                        <i className="bi bi-exclamation-circle" /> No contact
                      </span>
                    )}
                  </td>
                  <td className="text-end">
                    <span className={"pill " + (KIND_PILL[r.kind] || "neutral")}>{r.label}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function RemindersPage() {
  const { session, online } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      setData(await getReminders(session.token));
    } catch {
      setError("Could not load reminders. They need a live connection to the central system.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (online) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const dueNow = data?.due_now || [];
  const upcoming = data?.upcoming || [];
  const overdue = data?.overdue || [];

  return (
    <>
      <PageHeader
        icon="bi-calendar-event"
        title="Visit reminders"
        subtitle="Upcoming visits and bookings due a one-week or one-day reminder"
        actions={
          <button className="btn btn-ghost" onClick={load} disabled={!online || loading}>
            <i className={"bi bi-arrow-repeat" + (loading ? " spin" : "")} /> Refresh
          </button>
        }
      />

      {!online && (
        <div className="alert alert-warning">
          Reminders reflect central data and are unavailable offline. Reconnect to load figures.
        </div>
      )}
      {error && <div className="alert alert-danger">{error}</div>}

      {data && (
        <>
          <div className="alert alert-info d-flex align-items-center gap-2">
            <i className="bi bi-info-circle" />
            <span>
              Reminders are surfaced here for management to action. No email/SMS gateway is
              connected yet, so contact visitors using the details shown.
            </span>
          </div>

          <div className="row g-3 mb-1">
            <div className="col-sm-6 col-xl-4">
              <div className="stat-card">
                <div className="stat-card__icon info"><i className="bi bi-calendar-week" /></div>
                <div>
                  <div className="stat-card__label">One-week reminders due</div>
                  <div className="stat-card__value">{data.week_before_count}</div>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-xl-4">
              <div className="stat-card">
                <div className="stat-card__icon gold"><i className="bi bi-calendar-day" /></div>
                <div>
                  <div className="stat-card__label">One-day reminders due</div>
                  <div className="stat-card__value">{data.day_before_count}</div>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-xl-4">
              <div className="stat-card">
                <div className="stat-card__icon warn"><i className="bi bi-hourglass-split" /></div>
                <div>
                  <div className="stat-card__label">Overdue (still pending)</div>
                  <div className="stat-card__value">{overdue.length}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="row g-3 mt-1">
            <div className="col-12">
              <ReminderTable
                title="Reminders due now"
                icon="bi-bell"
                items={dueNow}
                emptyText="No reminders are due right now."
              />
            </div>
            <div className="col-lg-6">
              <ReminderTable
                title="Upcoming visits"
                icon="bi-calendar2-range"
                items={upcoming}
                emptyText="No further upcoming visits booked."
              />
            </div>
            <div className="col-lg-6">
              <ReminderTable
                title="Overdue bookings"
                icon="bi-hourglass-bottom"
                items={overdue}
                emptyText="No overdue bookings. Everything is on track."
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
