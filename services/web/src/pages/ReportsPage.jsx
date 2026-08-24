import { useEffect, useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import { getReport, downloadReportCsv } from "../api/client.js";
import { formatMinor } from "../domain/categories.js";
import PageHeader from "../components/PageHeader.jsx";

const GRANULARITIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
];

export default function ReportsPage() {
  const { session, online } = useApp();
  const [granularity, setGranularity] = useState("monthly");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      setReport(await getReport(session.token, { granularity, start, end }));
    } catch {
      setError("Could not load the report. It needs a live connection to the central system.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (online) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, granularity]);

  async function onDownload() {
    try {
      const blob = await downloadReportCsv(session.token, { granularity, start, end });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vmis_report_${granularity}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download the CSV export.");
    }
  }

  const rows = report?.rows || [];
  const currencies = Array.from(
    new Set(rows.flatMap((r) => r.revenue.map((x) => x.currency))),
  ).sort();

  const totals = {
    visitors_registered: rows.reduce((s, r) => s + r.visitors_registered, 0),
    entries: rows.reduce((s, r) => s + r.entries, 0),
    activities: rows.reduce((s, r) => s + r.activities, 0),
    revenue: currencies.map((cur) => ({
      currency: cur,
      amount_minor: rows.reduce(
        (s, r) => s + (r.revenue.find((x) => x.currency === cur)?.amount_minor || 0),
        0,
      ),
    })),
  };

  function revenueFor(row, cur) {
    const hit = row.revenue.find((x) => x.currency === cur);
    return hit ? formatMinor(hit.amount_minor, hit.currency) : formatMinor(0, cur);
  }

  return (
    <>
      <PageHeader
        icon="bi-file-earmark-bar-graph"
        title="Reports"
        subtitle="Periodic summaries of visitors, entries, activities, and revenue"
        actions={
          <button className="btn btn-ghost" onClick={onDownload} disabled={!online || !rows.length}>
            <i className="bi bi-download" /> Export CSV
          </button>
        }
      />

      {!online && (
        <div className="alert alert-warning">
          Reports reflect central data and are unavailable offline. Reconnect to load figures.
        </div>
      )}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="surface-card p-4 mb-3">
        <div className="row g-3 align-items-end">
          <div className="col-md-4">
            <label className="form-label">Granularity</label>
            <select
              className="form-select"
              value={granularity}
              onChange={(e) => setGranularity(e.target.value)}
            >
              {GRANULARITIES.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">From</label>
            <input
              type="date"
              className="form-control"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">To</label>
            <input
              type="date"
              className="form-control"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <div className="col-md-2">
            <button className="btn btn-success w-100" onClick={load} disabled={!online || loading}>
              <i className={"bi bi-arrow-repeat" + (loading ? " spin" : "")} /> Run
            </button>
          </div>
        </div>
      </div>

      {report && (
        <div className="surface-card p-0 overflow-hidden">
          {rows.length === 0 ? (
            <div className="empty-state m-4">
              <i className="bi bi-inbox" />
              No data in this period.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th className="text-end">Visitors</th>
                    <th className="text-end">Entries</th>
                    <th className="text-end">Activities</th>
                    {currencies.map((cur) => (
                      <th key={cur} className="text-end">
                        Revenue ({cur})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.period}>
                      <td className="fw-semibold">{r.period}</td>
                      <td className="text-end">{r.visitors_registered}</td>
                      <td className="text-end">{r.entries}</td>
                      <td className="text-end">{r.activities}</td>
                      {currencies.map((cur) => (
                        <td key={cur} className="text-end">
                          {revenueFor(r, cur)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--vmis-line)" }}>
                    <td className="fw-semibold">Total</td>
                    <td className="text-end fw-semibold">{totals.visitors_registered}</td>
                    <td className="text-end fw-semibold">{totals.entries}</td>
                    <td className="text-end fw-semibold">{totals.activities}</td>
                    {currencies.map((cur) => {
                      const t = totals.revenue.find((x) => x.currency === cur);
                      return (
                        <td key={cur} className="text-end fw-semibold">
                          {t ? formatMinor(t.amount_minor, t.currency) : formatMinor(0, cur)}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
