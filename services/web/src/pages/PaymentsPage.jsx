import { useEffect, useMemo, useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import { getActivities, getDashboard } from "../api/client.js";
import { getMeta, setMeta } from "../db/store.js";
import {
  CATEGORY_CURRENCY,
  convertMinor,
  formatMinor,
  sumMinorIn,
} from "../domain/categories.js";
import { getReportPrefs, DEFAULT_REPORT_PREFS } from "../settings/prefs.js";
import { visitorCode } from "../domain/ids.js";
import { allActivities, allVisitors } from "../data/repository.js";
import PageHeader from "../components/PageHeader.jsx";

const CATALOGUE_KEY = "activity_catalogue";

export default function PaymentsPage() {
  const { session, online } = useApp();
  const [board, setBoard] = useState(null);
  const [catalogue, setCatalogue] = useState([]);
  const [visitors, setVisitors] = useState([]);
  const [lines, setLines] = useState([]);
  const [prefs, setPrefs] = useState(DEFAULT_REPORT_PREFS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setPrefs(await getReportPrefs());
      setVisitors(await allVisitors());
      setLines(await allActivities());
      let cat = (await getMeta(CATALOGUE_KEY)) || [];
      if (online) {
        try {
          cat = await getActivities(session.token);
          await setMeta(CATALOGUE_KEY, cat);
          setBoard(await getDashboard(session.token));
        } catch {
          /* keep cached */
        }
      }
      setCatalogue(cat);
      setLoading(false);
    })();
  }, [online, session.token]);

  const visitorFor = (id) => visitors.find((v) => v.id === id) || null;

  function amountFor(line) {
    const activity = catalogue.find((a) => a.id === line.activity_id);
    const visitor = visitorFor(line.visitor_id);
    if (!activity || !visitor) return null;
    if (activity.is_free) return 0;
    const rate = (activity.rates || []).find((r) => r.category === visitor.category);
    if (!rate) return null;
    return rate.amount_minor * (line.quantity || 1);
  }

  const nameFor = (id) => catalogue.find((a) => a.id === id)?.name || id;

  const payments = useMemo(
    () =>
      [...lines]
        .sort((a, b) => String(b.client_created_at).localeCompare(String(a.client_created_at)))
        .map((line) => {
          const visitor = visitorFor(line.visitor_id);
          const currency = visitor ? CATEGORY_CURRENCY[visitor.category] : null;
          return {
            id: line.id,
            visitor: visitor?.full_name || line.visitor_id,
            code: visitorCode(line.visitor_id),
            activity: nameFor(line.activity_id),
            quantity: line.quantity || 1,
            amount: amountFor(line),
            currency,
          };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, catalogue, visitors],
  );

  // Single-currency device total: convert each captured line into the
  // configured reporting currency at the configured rate.
  const localTotal = useMemo(
    () =>
      payments.reduce(
        (total, p) =>
          p.amount && p.currency
            ? total + convertMinor(p.amount, p.currency, prefs.currency, prefs.usdToUgx)
            : total,
        0,
      ),
    [payments, prefs],
  );

  return (
    <>
      <PageHeader
        icon="bi-cash-coin"
        title="Payments"
        subtitle="Revenue captured across activities and stations"
      />

      <div className="row g-3 mb-1">
        <div className="col-sm-6 col-xl-4">
          <div className="stat-card">
            <div className="stat-card__icon gold">
              <i className="bi bi-cash-stack" />
            </div>
            <div>
              <div className="stat-card__label">Revenue today (central)</div>
              <div className="stat-card__value" style={{ fontSize: "1.2rem" }}>
                {board && board.revenue_today?.length
                  ? formatMinor(
                      sumMinorIn(board.revenue_today, prefs.currency, prefs.usdToUgx),
                      prefs.currency,
                    )
                  : formatMinor(0, prefs.currency)}
              </div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-xl-4">
          <div className="stat-card">
            <div className="stat-card__icon green">
              <i className="bi bi-graph-up-arrow" />
            </div>
            <div>
              <div className="stat-card__label">Revenue to date (central)</div>
              <div className="stat-card__value" style={{ fontSize: "1.2rem" }}>
                {board && board.revenue?.length
                  ? formatMinor(
                      sumMinorIn(board.revenue, prefs.currency, prefs.usdToUgx),
                      prefs.currency,
                    )
                  : formatMinor(0, prefs.currency)}
              </div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-xl-4">
          <div className="stat-card">
            <div className="stat-card__icon info">
              <i className="bi bi-hdd" />
            </div>
            <div>
              <div className="stat-card__label">Captured on this device</div>
              <div className="stat-card__value" style={{ fontSize: "1.2rem" }}>
                {localTotal ? formatMinor(localTotal, prefs.currency) : formatMinor(0, prefs.currency)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="muted mb-3" style={{ fontSize: "0.8rem" }}>
        <i className="bi bi-info-circle" /> Totals shown in {prefs.currency}; converted at 1 USD ={" "}
        {prefs.usdToUgx.toLocaleString()} UGX. Change this in Settings.
      </p>

      <div className="surface-card p-4">
        <div className="card-title-row">
          <i className="bi bi-receipt" />
          <h2>Captured payments</h2>
        </div>
        {loading ? (
          <div className="empty-state mb-0">
            <i className="bi bi-arrow-repeat spin" /> Loading…
          </div>
        ) : payments.length === 0 ? (
          <div className="empty-state mb-0">
            <i className="bi bi-cash" /> No activity payments captured on this device yet.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead>
                <tr>
                  <th>Visitor</th>
                  <th>Activity</th>
                  <th className="text-end">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.visitor}
                      <div className="muted" style={{ fontSize: "0.78rem" }}>
                        {p.code}
                      </div>
                    </td>
                    <td>
                      {p.activity}
                      {p.quantity > 1 ? ` ×${p.quantity}` : ""}
                    </td>
                    <td className="text-end">
                      {p.amount === null || !p.currency
                        ? "Not priced"
                        : formatMinor(p.amount, p.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
