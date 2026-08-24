// Pure-SVG donut chart with a side legend, matching the "Visitors by entry
// gate" panel in the design mock-up. No charting dependency: the app is an
// offline-first PWA, so we keep the bundle small and render segments by hand.

const PALETTE = [
  "var(--vmis-green-700)",
  "var(--vmis-gold-500)",
  "var(--vmis-green-500)",
  "var(--vmis-info)",
  "#8a6d3b",
  "#5b8c5a",
  "#b4362f",
  "#c98a1f",
];

export default function DonutChart({ data = [], size = 168, thickness = 26 }) {
  const rows = data.filter((d) => d.count > 0);
  const total = rows.reduce((s, d) => s + d.count, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  if (total === 0) {
    return (
      <div className="empty-state mb-0">
        <i className="bi bi-pie-chart" />
        No data to chart yet.
      </div>
    );
  }

  let offset = 0;
  const segments = rows.map((d, i) => {
    const fraction = d.count / total;
    const dash = fraction * circumference;
    const seg = {
      color: PALETTE[i % PALETTE.length],
      dash,
      gap: circumference - dash,
      offset: -offset,
      pct: Math.round(fraction * 100),
      ...d,
    };
    offset += dash;
    return seg;
  });

  return (
    <div className="donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="donut__svg">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--vmis-bg-2)"
            strokeWidth={thickness}
          />
          {segments.map((s) => (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${s.dash} ${s.gap}`}
              strokeDashoffset={s.offset}
              strokeLinecap="butt"
            />
          ))}
        </g>
        <text
          x="50%"
          y="47%"
          textAnchor="middle"
          style={{ fontSize: "1.6rem", fontWeight: 700, fill: "var(--vmis-ink)" }}
        >
          {total}
        </text>
        <text
          x="50%"
          y="60%"
          textAnchor="middle"
          style={{ fontSize: "0.62rem", letterSpacing: "0.08em", fill: "var(--vmis-muted)" }}
        >
          TOTAL
        </text>
      </svg>

      <ul className="donut__legend">
        {segments.map((s) => (
          <li key={s.label}>
            <span className="dot" style={{ background: s.color }} />
            <span className="label">{s.label}</span>
            <span className="value">
              {s.count} <span className="muted">({s.pct}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
