import { useEffect, useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import { getReconciliation } from "../api/client.js";
import { formatMinor } from "../domain/categories.js";
import PageHeader from "../components/PageHeader.jsx";

// Render a per-currency money list (never summed across currencies).
function Money({ totals }) {
  if (!totals || totals.length === 0) return <span className="muted">—</span>;
  return (
    <span className="d-inline-flex flex-column">
      {totals.map((t) => (
        <span key={t.currency} style={{ color: "var(--vmis-ink)", fontWeight: 600 }}>
          {formatMinor(t.amount_minor, t.currency)}
        </span>
      ))}
    </span>
  );
}

export default function ReconciliationPage() {
  const { session, online } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      setData(await getReconciliation(session.token));
    } catch {
      setError("Could not load reconciliation. It needs a live connection to the central system.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (online) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const gates = data?.gates || [];
  const hasUnassigned = (data?.unassigned_revenue || []).length > 0;

  return (
    <>
      <PageHeader
        icon="bi-bank"
        title="Gate reconciliation"
        subtitle="Reconcile visitor numbers and revenue across every entry gate"
        actions={
          <button className="btn btn-ghost" onClick={load} disabled={!online || loading}>
            <i className={"bi bi-arrow-repeat" + (loading ? " spin" : "")} /> Refresh
          </button>
        }
      />

      {!online && (
        <div className="alert alert-warning">
          Reconciliation reflects central data and is unavailable offline. Reconnect to load figures.
        </div>
      )}
      {error && <div className="alert alert-danger">{error}</div>}

      {data && (
        <>
          <div className="row g-3 mb-1">
            <div className="col-sm-6 col-xl-3">
              <div className="stat-card">
                <div className="stat-card__icon info"><i className="bi bi-calendar-check" /></div>
                <div>
                  <div className="stat-card__label">Expected</div>
                  <div className="stat-card__value">{data.total_expected}</div>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-xl-3">
              <div className="stat-card">
                <div className="stat-card__icon green"><i className="bi bi-box-arrow-in-right" /></div>
                <div>
                  <div className="stat-card__label">Entries</div>
                  <div className="stat-card__value">{data.total_entries}</div>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-xl-3">
              <div className="stat-card">
                <div className="stat-card__icon green"><i className="bi bi-people" /></div>
                <div>
                  <div className="stat-card__label">Inside now</div>
                  <div className="stat-card__value">{data.total_inside}</div>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-xl-3">
              <div className="stat-card">
                <div className="stat-card__icon info"><i className="bi bi-box-arrow-right" /></div>
                <div>
                  <div className="stat-card__label">Exited</div>
                  <div className="stat-card__value">{data.total_exited}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="surface-card p-4 mt-1">
            <div className="card-title-row">
              <i className="bi bi-bank" />
              <h3>Per-gate reconciliation</h3>
            </div>
            {gates.length === 0 ? (
              <div className="empty-state">
                <i className="bi bi-door-closed" />
                No gate activity recorded yet.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Gate</th>
                      <th className="text-end">Expected</th>
                      <th className="text-end">Entries</th>
                      <th className="text-end">Visitors</th>
                      <th className="text-end">Inside</th>
                      <th className="text-end">Exited</th>
                      <th className="text-end">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gates.map((g) => (
                      <tr key={g.gate}>
                        <td className="fw-semibold" style={{ color: "var(--vmis-ink)" }}>
                          <i className="bi bi-door-open me-2 muted" />
                          {g.gate}
                        </td>
                        <td className="text-end">{g.expected}</td>
                        <td className="text-end">{g.entries}</td>
                        <td className="text-end">{g.distinct_visitors}</td>
                        <td className="text-end">
                          <span className={"pill " + (g.inside_now > 0 ? "active" : "neutral")}>
                            {g.inside_now}
                          </span>
                        </td>
                        <td className="text-end">{g.exited}</td>
                        <td className="text-end"><Money totals={g.revenue} /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--vmis-green-600)" }}>
                      <td className="fw-bold" style={{ color: "var(--vmis-ink)" }}>All gates</td>
                      <td className="text-end fw-bold">{data.total_expected}</td>
                      <td className="text-end fw-bold">{data.total_entries}</td>
                      <td className="text-end">—</td>
                      <td className="text-end fw-bold">{data.total_inside}</td>
                      <td className="text-end fw-bold">{data.total_exited}</td>
                      <td className="text-end"><Money totals={data.totals} /></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {hasUnassigned && (
            <div className="surface-card p-3 mt-3">
              <span className="muted" style={{ fontSize: "0.9rem" }}>
                <i className="bi bi-info-circle me-1" />
                Revenue not yet attributable to a gate (no matching entry):{" "}
                <Money totals={data.unassigned_revenue} />
              </span>
            </div>
          )}
        </>
      )}
    </>
  );
}
