import { useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import { CATEGORIES } from "../domain/categories.js";
import { AGE_CATEGORIES, GENDERS } from "../domain/reference.js";
import { findDuplicates, registerVisitor } from "../data/repository.js";
import PageHeader from "../components/PageHeader.jsx";
import VisitorQrCode from "../components/VisitorQrCode.jsx";

const EMPTY = {
  full_name: "",
  id_number: "",
  nationality: "",
  category: "FNR",
  country: "",
  age_category: "",
  gender: "",
  phone: "",
  email: "",
  tour_company: "",
  vehicle_registration: "",
  num_visitors: 1,
  guide_name: "",
  privacy_notice_accepted: false,
};

export default function RegisterPage() {
  const { session, refreshOutbox } = useApp();
  const [form, setForm] = useState(EMPTY);
  const [duplicates, setDuplicates] = useState([]);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState(null);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaved(null);

    if (!form.privacy_notice_accepted) {
      setError("The visitor must accept the privacy notice before registration.");
      return;
    }

    // Non-blocking duplicate warning (mirrors the server), unless the officer
    // has already been shown it and chose to proceed.
    const dupes = await findDuplicates(form.id_number, form.full_name);
    if (dupes.length > 0 && duplicates.length === 0) {
      setDuplicates(dupes);
      return;
    }

    const record = await registerVisitor(form, session.stationId);
    await refreshOutbox();
    setSaved(record);
    setForm(EMPTY);
    setDuplicates([]);
  }

  return (
    <>
      <PageHeader
        icon="bi-person-plus"
        title="Register visitor"
        subtitle="One record per visitor, saved to this device and synced when online"
      />

      <div className="row g-4">
        <div className="col-lg-7">
          {saved && (
            <div className="alert alert-success">
              <span>
                Registered <strong>{saved.full_name}</strong> locally. Identifier{" "}
                <code>{saved.id}</code>. Queued for sync.
              </span>
            </div>
          )}
          {error && <div className="alert alert-danger">{error}</div>}
          {duplicates.length > 0 && (
            <div className="alert alert-warning">
              <div>
                <strong>Possible duplicate.</strong> {duplicates.length} existing record(s) share
                this ID number and name. Review, then submit again to register anyway.
                <ul className="mb-0 mt-2">
                  {duplicates.map((d) => (
                    <li key={d.id}>
                      {d.full_name} — {d.id_number}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <form onSubmit={onSubmit} className="surface-card p-4">
            <div className="card-title-row">
              <i className="bi bi-person-vcard" />
              <h2>Visitor details</h2>
            </div>

            <div className="row g-3">
              <div className="col-md-12">
                <label className="form-label">Full name</label>
                <div className="input-icon">
                  <i className="bi bi-person" />
                  <input
                    className="form-control"
                    value={form.full_name}
                    onChange={(e) => update("full_name", e.target.value)}
                    placeholder="As shown on ID or passport"
                    required
                  />
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label">ID / passport number</label>
                <div className="input-icon">
                  <i className="bi bi-credit-card-2-front" />
                  <input
                    className="form-control"
                    value={form.id_number}
                    onChange={(e) => update("id_number", e.target.value)}
                    placeholder="Document number"
                    required
                  />
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label">Nationality</label>
                <div className="input-icon">
                  <i className="bi bi-globe2" />
                  <input
                    className="form-control"
                    value={form.nationality}
                    onChange={(e) => update("nationality", e.target.value)}
                    placeholder="e.g. Ugandan"
                  />
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label">Country</label>
                <div className="input-icon">
                  <i className="bi bi-flag" />
                  <input
                    className="form-control"
                    value={form.country}
                    onChange={(e) => update("country", e.target.value)}
                    placeholder="Country of residence"
                  />
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label">Fee category</label>
                <select
                  className="form-select"
                  value={form.category}
                  onChange={(e) => update("category", e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.label} ({c.currency})
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label">Age category</label>
                <select
                  className="form-select"
                  value={form.age_category}
                  onChange={(e) => update("age_category", e.target.value)}
                >
                  <option value="">—</option>
                  {AGE_CATEGORIES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label">Gender</label>
                <select
                  className="form-select"
                  value={form.gender}
                  onChange={(e) => update("gender", e.target.value)}
                >
                  <option value="">—</option>
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Phone number</label>
                <div className="input-icon">
                  <i className="bi bi-telephone" />
                  <input
                    className="form-control"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label">Email address</label>
                <div className="input-icon">
                  <i className="bi bi-envelope" />
                  <input
                    type="email"
                    className="form-control"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label">Tour company</label>
                <div className="input-icon">
                  <i className="bi bi-building" />
                  <input
                    className="form-control"
                    value={form.tour_company}
                    onChange={(e) => update("tour_company", e.target.value)}
                    placeholder="Tour operator (if any)"
                  />
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label">Vehicle registration</label>
                <div className="input-icon">
                  <i className="bi bi-car-front" />
                  <input
                    className="form-control"
                    value={form.vehicle_registration}
                    onChange={(e) => update("vehicle_registration", e.target.value)}
                    placeholder="e.g. UAS 123A"
                  />
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label">Number of visitors</label>
                <div className="input-icon">
                  <i className="bi bi-people" />
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    value={form.num_visitors}
                    onChange={(e) => update("num_visitors", e.target.value)}
                  />
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label">Guide name</label>
                <div className="input-icon">
                  <i className="bi bi-person-badge" />
                  <input
                    className="form-control"
                    value={form.guide_name}
                    onChange={(e) => update("guide_name", e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>

            <div
              className="form-check mt-3 p-3"
              style={{ background: "var(--vmis-green-50)", borderRadius: "var(--vmis-radius-sm)" }}
            >
              <input
                id="privacy"
                type="checkbox"
                className="form-check-input"
                checked={form.privacy_notice_accepted}
                onChange={(e) => update("privacy_notice_accepted", e.target.checked)}
              />
              <label htmlFor="privacy" className="form-check-label" style={{ fontSize: "0.88rem" }}>
                <i className="bi bi-shield-check me-1" style={{ color: "var(--vmis-green-700)" }} />
                Visitor was shown and accepted the privacy notice (Data Protection and Privacy Act,
                2019).
              </label>
            </div>

            <button className="btn btn-success mt-4">
              <i className="bi bi-check2-circle" /> Register visitor
            </button>
          </form>
        </div>

        <div className="col-lg-5">
          {saved && (
            <div className="surface-card p-4 mb-3 text-center">
              <div className="card-title-row justify-content-center">
                <i className="bi bi-qr-code" />
                <h3>Visitor ticket</h3>
              </div>
              <VisitorQrCode value={saved.id} label="Scan at the gate to verify" />
              <div className="mt-3">
                <div style={{ color: "var(--vmis-ink)", fontWeight: 600 }}>{saved.full_name}</div>
                <span className="pill neutral mt-1">{saved.category}</span>
                <div className="small-caps mt-2">Identifier</div>
                <code style={{ fontSize: "0.82rem" }}>{saved.id}</code>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm mt-3"
                onClick={() => window.print()}
              >
                <i className="bi bi-printer" /> Print ticket
              </button>
            </div>
          )}
          <div className="note-card mb-3">
            <h3>
              <i className="bi bi-wifi-off" /> Works offline
            </h3>
            <p>
              Registration is saved to this device immediately with a station-generated identifier,
              so two gates registering at once can never collide. Records sync to the central system
              automatically once a connection returns.
            </p>
          </div>
          <div className="surface-card p-4">
            <div className="card-title-row">
              <i className="bi bi-tags" />
              <h3>Fee categories</h3>
            </div>
            <div className="d-flex flex-column gap-2">
              {CATEGORIES.map((c) => (
                <div key={c.code} className="d-flex justify-content-between align-items-center">
                  <span>
                    <span className="pill neutral me-2">{c.code}</span>
                    <span style={{ fontSize: "0.9rem" }}>{c.label}</span>
                  </span>
                  <span className="small-caps">{c.currency}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
