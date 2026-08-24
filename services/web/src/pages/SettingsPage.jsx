import { useApp } from "../context/AppContext.jsx";
import PageHeader from "../components/PageHeader.jsx";

const ROLE_LABELS = {
  management: "Management",
  gate_officer: "Gate officer",
  activity_officer: "Activity officer",
};

export default function SettingsPage() {
  const { session, online, outbox } = useApp();

  const rows = [
    { label: "Signed in as", value: session?.username || "—" },
    { label: "Role", value: ROLE_LABELS[session?.role] || session?.role || "—" },
    { label: "Station", value: session?.stationId || "—" },
    { label: "Working mode", value: online ? "Online" : "Offline" },
    { label: "Pending sync operations", value: String(outbox ?? 0) },
    {
      label: "Installed",
      value:
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(display-mode: standalone)").matches
          ? "Yes (PWA)"
          : "Browser tab",
    },
  ];

  return (
    <>
      <PageHeader
        icon="bi-gear"
        title="Settings"
        subtitle="Station, session, and working-mode information"
      />

      <div className="row g-4">
        <div className="col-lg-7">
          <div className="surface-card p-4">
            <div className="card-title-row">
              <i className="bi bi-sliders" />
              <h2>Session &amp; station</h2>
            </div>
            <dl className="row mb-0" style={{ fontSize: "0.92rem" }}>
              {rows.map((r) => (
                <div className="col-12 d-flex justify-content-between data-row" key={r.label}>
                  <dt className="small-caps muted fw-normal">{r.label}</dt>
                  <dd className="mb-0 fw-semibold" style={{ color: "var(--vmis-ink)" }}>
                    {r.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="col-lg-5">
          <div className="note-card mb-3">
            <h3>
              <i className="bi bi-shield-lock" /> Data protection
            </h3>
            <p>
              Personal data is handled under Uganda's Data Protection and Privacy Act, 2019.
              Records on this device sync to the central system and are then subject to central
              retention rules.
            </p>
          </div>
          <div className="note-card">
            <h3>
              <i className="bi bi-wifi" /> Working mode
            </h3>
            <p>
              The app is offline-first: registration, scanning, and activity capture keep working
              without a connection and upload automatically once you are back online.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
