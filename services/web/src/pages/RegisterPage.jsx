import { useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import { CATEGORIES } from "../domain/categories.js";
import { findDuplicates, registerVisitor } from "../data/repository.js";

const EMPTY = {
  full_name: "",
  id_number: "",
  nationality: "",
  category: "FNR",
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
    <div className="row">
      <div className="col-lg-7">
        <h2 className="h4 mb-3">Register visitor</h2>

        {saved && (
          <div className="alert alert-success">
            Registered <strong>{saved.full_name}</strong> locally. Identifier{" "}
            <code>{saved.id}</code>. Queued for sync.
          </div>
        )}
        {error && <div className="alert alert-danger">{error}</div>}
        {duplicates.length > 0 && (
          <div className="alert alert-warning">
            <strong>Possible duplicate.</strong> {duplicates.length} existing record(s) share this
            ID number and name. Review, then submit again to register anyway.
            <ul className="mb-0 mt-2">
              {duplicates.map((d) => (
                <li key={d.id}>
                  {d.full_name} - {d.id_number}
                </li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={onSubmit} className="card card-body shadow-sm">
          <div className="mb-3">
            <label className="form-label">Full name</label>
            <input
              className="form-control"
              value={form.full_name}
              onChange={(e) => update("full_name", e.target.value)}
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label">ID / passport number</label>
            <input
              className="form-control"
              value={form.id_number}
              onChange={(e) => update("id_number", e.target.value)}
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Nationality</label>
            <input
              className="form-control"
              value={form.nationality}
              onChange={(e) => update("nationality", e.target.value)}
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Category</label>
            <select
              className="form-select"
              value={form.category}
              onChange={(e) => update("category", e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.label} ({c.currency})
                </option>
              ))}
            </select>
          </div>
          <div className="form-check mb-3">
            <input
              id="privacy"
              type="checkbox"
              className="form-check-input"
              checked={form.privacy_notice_accepted}
              onChange={(e) => update("privacy_notice_accepted", e.target.checked)}
            />
            <label htmlFor="privacy" className="form-check-label">
              Visitor was shown and accepted the privacy notice (Data Protection and Privacy Act,
              2019).
            </label>
          </div>
          <button className="btn btn-success">Register</button>
        </form>
      </div>
      <div className="col-lg-5">
        <div className="card card-body bg-light mt-4 mt-lg-0">
          <h3 className="h6">Works offline</h3>
          <p className="small mb-0">
            Registration is saved to this device immediately and given a station-generated
            identifier, so two gates registering at once can never collide. The record syncs to the
            central system when a connection is available.
          </p>
        </div>
      </div>
    </div>
  );
}
