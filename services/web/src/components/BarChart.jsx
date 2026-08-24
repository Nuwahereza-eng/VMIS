// Vertical bar chart (pure CSS/fl: no charting dependency), matching the
// "Activities today" panel in the design mock-up. Bars scale to the tallest
// value and label along the x-axis.

export default function BarChart({ data = [], height = 200 }) {
  const rows = data.filter((d) => d.count >= 0);
  const max = Math.max(1, ...rows.map((d) => d.count));

  if (rows.length === 0) {
    return (
      <div className="empty-state mb-0">
        <i className="bi bi-bar-chart" />
        No data to chart yet.
      </div>
    );
  }

  return (
    <div className="barchart" style={{ height }}>
      {rows.map((d) => (
        <div key={d.label} className="barchart__col" title={`${d.label}: ${d.count}`}>
          <div className="barchart__value">{d.count}</div>
          <div className="barchart__track">
            <div
              className="barchart__bar"
              style={{ height: `${(d.count / max) * 100}%` }}
            />
          </div>
          <div className="barchart__label">{d.label}</div>
        </div>
      ))}
    </div>
  );
}
