import { useEffect, useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import { pending } from "../sync/queue.js";
import PageHeader from "../components/PageHeader.jsx";

const ENTITY_META = {
  visitor: { label: "Visitor", icon: "bi-person" },
  visit: { label: "Entry", icon: "bi-box-arrow-in-right" },
  visit_exit: { label: "Exit", icon: "bi-box-arrow-right" },
  visitor_activity: { label: "Activity", icon: "bi-binoculars" },
  accommodation: { label: "Accommodation", icon: "bi-building" },
};

export default function SyncPage() {
  const { online, outbox, syncing, lastSync, sync } = useApp();
  const [ops, setOps] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  async function refresh() {
    setOps(await pending());
  }

  useEffect(() => {
    refresh();
  }, [outbox]);

  async function onSync() {
    setError(null);
    setSummary(null);
    try {
      const result = await sync();
      setSummary(result);
      await refresh();
    } catch (err) {
      setError(err.message || "Sync failed. Your data is safe and still queued.");
    }
  }

  return (
    <>
      <PageHeader
        icon="bi-arrow-repeat"
        title="Synchronisation"
        subtitle="Upload queued work to the central system — safe to retry, never duplicates"
        actions={
          <button
            className="btn btn-success"
            onClick={onSync}
            disabled={!online || syncing || outbox === 0}
          >
            <i className={"bi bi-cloud-arrow-up" + (syncing ? " spin" : "")} />
            {syncing ? "Syncing…" : outbox === 0 ? "Up to date" : `Sync ${outbox}`}
          </button>
        }
      />

      <div className="row g-3 mb-1">
        <div className="col-sm-4">
          <div className="stat-card">
            <div className="stat-card__icon gold"><i className="bi bi-inbox" /></div>
            <div>
              <div className="stat-card__label">Pending</div>
              <div className="stat-card__value">{outbox}</div>
            </div>
          </div>
        </div>
        <div className="col-sm-4">
          <div className="stat-card">
            <div className={"stat-card__icon " + (online ? "green" : "warn")}>
              <i className={"bi " + (online ? "bi-wifi" : "bi-wifi-off")} />
            </div>
            <div>
              <div className="stat-card__label">Connection</div>
              <div className="stat-card__value" style={{ fontSize: "1.25rem" }}>
                {online ? "Online" : "Offline"}
              </div>
            </div>
          </div>
        </div>
        <div className="col-sm-4">
          <div className="stat-card">
            <div className="stat-card__icon info"><i className="bi bi-clock-history" /></div>
            <div>
              <div className="stat-card__label">Last sync</div>
              <div className="stat-card__value" style={{ fontSize: "1.05rem" }}>
                {lastSync ? lastSync.toLocaleTimeString() : "—"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4 mt-1">
        <div className="col-lg-8">
          {!online && (
            <div className="alert alert-warning">
              Offline. Writes are saved on this device and will upload automatically when a
              connection returns.
            </div>
          )}
          {error && <div className="alert alert-danger">{error}</div>}
          {summary && (
            <div className="alert alert-info">
              <span>
                Processed {summary.processed}: {summary.applied} applied, {summary.duplicates}{" "}
                already present, {summary.conflicts} sent to the exceptions queue.{" "}
                {summary.remaining} remain.
              </span>
            </div>
          )}

          <div className="surface-card p-4">
            <div className="card-title-row">
              <i className="bi bi-list-task" />
              <h2>Pending operations</h2>
            </div>
            {ops.length === 0 ? (
              <div className="empty-state">
                <i className="bi bi-check2-all" />
                Nothing queued. Everything is synced.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Target</th>
                      <th className="text-end">Queued</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.map((op) => {
                      const meta = ENTITY_META[op.entity_type] || {
                        label: op.entity_type,
                        icon: "bi-dot",
                      };
                      return (
                        <tr key={op.op_id}>
                          <td>
                            <span className="pill neutral">
                              <i className={"bi " + meta.icon} /> {meta.label}
                            </span>
                          </td>
                          <td>
                            <code>{op.entity_id || op.payload.id || "—"}</code>
                          </td>
                          <td className="text-end muted" style={{ fontSize: "0.85rem" }}>
                            {new Date(op.queued_at).toLocaleTimeString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="col-lg-4">
          <div className="note-card">
            <h3>
              <i className="bi bi-shield-check" /> Zero loss, zero duplicates
            </h3>
            <p>
              Each queued operation carries its own id. Re-sending after an interrupted upload is
              safe: the server recognises ids it has already applied and never creates a duplicate.
              Nothing leaves this device until the server confirms it.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
