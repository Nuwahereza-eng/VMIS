import { useEffect, useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import { pending } from "../sync/queue.js";

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
    <div className="row">
      <div className="col-lg-8">
        <h2 className="h4 mb-3">Synchronisation</h2>

        <div className="d-flex align-items-center gap-3 mb-3">
          <button
            className="btn btn-success"
            onClick={onSync}
            disabled={!online || syncing || outbox === 0}
          >
            {syncing ? "Syncing..." : `Sync ${outbox} pending`}
          </button>
          <span className={"badge " + (online ? "bg-success" : "bg-danger")}>
            {online ? "Online" : "Offline"}
          </span>
          {lastSync && (
            <span className="text-muted small">Last sync {lastSync.toLocaleString()}</span>
          )}
        </div>

        {!online && (
          <div className="alert alert-warning">
            Offline. Writes are saved on this device and will upload automatically when a connection
            returns.
          </div>
        )}
        {error && <div className="alert alert-danger">{error}</div>}
        {summary && (
          <div className="alert alert-info">
            Processed {summary.processed}: {summary.applied} applied, {summary.duplicates} already
            present, {summary.conflicts} sent to the exceptions queue. {summary.remaining} remain.
          </div>
        )}

        <h3 className="h6">Pending operations</h3>
        {ops.length === 0 ? (
          <p className="text-muted">Nothing queued. Everything is synced.</p>
        ) : (
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Type</th>
                <th>Target</th>
                <th>Queued</th>
              </tr>
            </thead>
            <tbody>
              {ops.map((op) => (
                <tr key={op.op_id}>
                  <td>{op.entity_type}</td>
                  <td className="small">
                    <code>{op.entity_id || op.payload.id || "-"}</code>
                  </td>
                  <td className="small text-muted">{new Date(op.queued_at).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="col-lg-4">
        <div className="card card-body bg-light">
          <h3 className="h6">Zero loss, zero duplicates</h3>
          <p className="small mb-0">
            Each queued operation carries its own id. Re-sending after an interrupted upload is safe:
            the server recognises ids it has already applied and never creates a duplicate. Nothing
            leaves this device until the server confirms it.
          </p>
        </div>
      </div>
    </div>
  );
}
