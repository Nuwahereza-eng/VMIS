import { useEffect, useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import { REPORT_CURRENCIES } from "../domain/categories.js";
import { getReportPrefs, setReportPrefs } from "../settings/prefs.js";
import PageHeader from "../components/PageHeader.jsx";

const ROLE_LABELS = {
  management: "Management",
  gate_officer: "Gate officer",
  activity_officer: "Activity officer",
};

function initials(text = "") {
  const parts = text.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function SettingsPage() {
  const { session, online, outbox } = useApp();

  const [currency, setCurrency] = useState("UGX");
  const [rate, setRate] = useState("");
  const [note, setNote] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const prefs = await getReportPrefs();
      setCurrency(prefs.currency);
      setRate(String(prefs.usdToUgx));
    })();
  }, []);

  async function saveReporting(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await setReportPrefs({ currency, usdToUgx: Number(rate) });
      setNote({ type: "success", text: "Reporting preferences saved." });
    } catch {
      setNote({ type: "danger", text: "Could not save preferences. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const displayName = session?.name || session?.username || "—";
  const rows = [
    { label: "Username", value: session?.username || "—" },
    { label: "Role", value: ROLE_LABELS[session?.role] || session?.role || "—" },
    { label: "Station", value: session?.stationId || "Not assigned" },
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
          <div className="surface-card p-4 mb-4">
            <div className="card-title-row">
              <i className="bi bi-person-circle" />
              <h2>Profile</h2>
            </div>
            <div className="profile-head">
              <div className="avatar avatar--lg">{initials(displayName)}</div>
              <div>
                <div className="profile-head__name">{displayName}</div>
                <div className="profile-head__role">
                  <span className="pill green">{ROLE_LABELS[session?.role] || session?.role}</span>
                  {session?.stationId && <span className="muted">· {session.stationId}</span>}
                </div>
              </div>
            </div>
            <dl className="row mb-0 mt-2" style={{ fontSize: "0.92rem" }}>
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

          <form className="surface-card p-4" onSubmit={saveReporting}>
            <div className="card-title-row">
              <i className="bi bi-cash-coin" />
              <h2>Reporting currency</h2>
            </div>
            {note && <div className={`alert alert-${note.type}`}>{note.text}</div>}
            <p className="muted" style={{ fontSize: "0.86rem", marginTop: "-0.25rem" }}>
              Revenue totals are shown in one uniform currency. Amounts billed in the other
              currency are converted at the rate below. This is display-only and never changes
              what visitors are charged.
            </p>
            <div className="row g-3">
              <div className="col-sm-6">
                <label className="form-label">Display currency</label>
                <select
                  className="form-select"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {REPORT_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-sm-6">
                <label className="form-label">Exchange rate (UGX per 1 USD)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="form-control"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>
            </div>
            <button className={"btn btn-success mt-3" + (saving ? " is-busy" : "")} disabled={saving}>
              <i className={"bi " + (saving ? "bi-arrow-repeat spin" : "bi-check2-circle")} />{" "}
              {saving ? "Saving…" : "Save preferences"}
            </button>
          </form>
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
