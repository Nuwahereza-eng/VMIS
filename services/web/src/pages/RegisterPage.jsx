import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useApp } from "../context/AppContext.jsx";
import { CATEGORIES } from "../domain/categories.js";
import { GATES, LODGES } from "../domain/reference.js";
import { uuid4, visitorCode } from "../domain/ids.js";
import {
  findDuplicates,
  recordAccommodation,
  recordEntry,
  registerVisitor,
} from "../data/repository.js";
import VisitorQrCode from "../components/VisitorQrCode.jsx";

const NIGHT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 10, 14];

function emptyForm() {
  return {
    // A station-generated id is minted up front so the QR preview and the
    // saved record share the same identifier.
    id: uuid4(),
    full_name: "",
    id_number: "",
    nationality: "",
    category: "FNR",
    phone: "",
    email: "",
    entry_gate: GATES[0],
    entry_datetime: "",
    nights_purchased: 3,
    accommodation: "",
    vehicle_registration: "",
    tour_company: "",
  };
}

// Prefill the form from an existing visitor when arriving via "Update Visitor".
function formFromVisitor(v) {
  return {
    id: v.id,
    full_name: v.full_name || "",
    id_number: v.id_number || "",
    nationality: v.nationality || v.country || "",
    category: v.category || "FNR",
    phone: v.phone || "",
    email: v.email || "",
    entry_gate: GATES[0],
    entry_datetime: "",
    nights_purchased: 3,
    accommodation: "",
    vehicle_registration: v.vehicle_registration || "",
    tour_company: v.tour_company || "",
  };
}

export default function RegisterPage() {
  const { session, refreshOutbox } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  // When "Update Visitor" sends us here, we edit that record instead of
  // creating a new one (and skip opening a fresh gate entry).
  const editingVisitor = location.state?.visitor || null;
  const isEditing = Boolean(editingVisitor);

  const [form, setForm] = useState(() =>
    editingVisitor ? formFromVisitor(editingVisitor) : emptyForm(),
  );
  const [duplicates, setDuplicates] = useState([]);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const code = useMemo(() => visitorCode(form.id), [form.id]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaved(null);

    if (!form.full_name.trim() || !form.id_number.trim() || !form.nationality.trim()) {
      setError("Full name, passport / national ID and nationality are required.");
      return;
    }

    // Only guard against duplicates when creating a brand-new visitor.
    if (!isEditing) {
      const dupes = await findDuplicates(form.id_number, form.full_name);
      if (dupes.length > 0 && duplicates.length === 0) {
        setDuplicates(dupes);
        return;
      }
    }

    setBusy(true);
    try {
      const visitor = await registerVisitor(
        {
          id: form.id,
          full_name: form.full_name,
          id_number: form.id_number,
          nationality: form.nationality,
          category: form.category,
          country: form.nationality,
          phone: form.phone,
          email: form.email,
          tour_company: form.tour_company,
          vehicle_registration: form.vehicle_registration,
          privacy_notice_accepted: true,
        },
        session.stationId,
      );

      // Editing only updates the visitor's details — no new gate entry. A fresh
      // registration also admits the visitor in one step (per the mockup).
      if (!isEditing) {
        const entryTs = form.entry_datetime
          ? new Date(form.entry_datetime).toISOString()
          : new Date().toISOString();
        await recordEntry(
          {
            visitor_id: visitor.id,
            entry_gate: form.entry_gate,
            entry_timestamp: entryTs,
            ticket_number: code,
            nights_purchased: Number(form.nights_purchased) || 1,
          },
          session.stationId,
        );

        if (form.accommodation) {
          await recordAccommodation(
            visitor.id,
            form.accommodation,
            Number(form.nights_purchased) || 1,
          );
        }
      }

      await refreshOutbox();
      setSaved({ ...visitor, code, edited: isEditing });
      setDuplicates([]);
      if (!isEditing) setForm(emptyForm());
    } catch {
      setError(
        isEditing
          ? "Could not save the changes. Please try again."
          : "Could not complete the registration. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="reg fade-in">
      <div className="reg__topbar">
        <button className="vp__back" onClick={() => navigate(-1)} aria-label="Back">
          <i className="bi bi-arrow-left" />
        </button>
        <h1 className="vp__title">{isEditing ? "Update Visitor" : "Register New Visitor"}</h1>
      </div>

      <div className="reg__body">
        {saved && (
          <div className="alert alert-success">
            {saved.edited ? (
              <>
                Updated <strong>{saved.full_name}</strong>. Changes queued for sync.
              </>
            ) : (
              <>
                Registered <strong>{saved.full_name}</strong> and admitted at{" "}
                {form.entry_gate || "the gate"}. Visitor ID <strong>{saved.code}</strong>. Queued
                for sync.
              </>
            )}
          </div>
        )}
        {error && <div className="alert alert-danger">{error}</div>}
        {duplicates.length > 0 && (
          <div className="alert alert-warning">
            <strong>Possible duplicate.</strong> {duplicates.length} record(s) share this ID and
            name. Review, then submit again to register anyway.
            <ul className="mb-0 mt-2">
              {duplicates.map((d) => (
                <li key={d.id}>
                  {d.full_name} · {d.id_number}
                </li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={onSubmit} className="reg__grid">
          {/* Column 1 — Personal information */}
          <div className="surface-card p-4">
            <h3 className="vp__card-title">PERSONAL INFORMATION</h3>

            <div className="reg__field">
              <label className="form-label">
                Full Name <span className="reg__req">*</span>
              </label>
              <input
                className="form-control"
                value={form.full_name}
                onChange={(e) => update("full_name", e.target.value)}
                placeholder="e.g. John Smith"
                required
              />
            </div>

            <div className="reg__field">
              <label className="form-label">
                Passport / National ID <span className="reg__req">*</span>
              </label>
              <input
                className="form-control"
                value={form.id_number}
                onChange={(e) => update("id_number", e.target.value)}
                placeholder="Document number"
                required
              />
            </div>

            <div className="reg__field">
              <label className="form-label">
                Nationality <span className="reg__req">*</span>
              </label>
              <input
                className="form-control"
                value={form.nationality}
                onChange={(e) => update("nationality", e.target.value)}
                placeholder="e.g. United States"
                required
              />
            </div>

            <div className="reg__field">
              <label className="form-label">
                Category <span className="reg__req">*</span>
              </label>
              <select
                className="form-select"
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label} ({c.code}) · {c.currency}
                  </option>
                ))}
              </select>
            </div>

            <div className="reg__field">
              <label className="form-label">Phone Number</label>
              <input
                className="form-control"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="reg__field mb-0">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-control"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Column 2 — Visit details */}
          <div className="surface-card p-4">
            <h3 className="vp__card-title">VISIT DETAILS</h3>

            <div className="reg__field">
              <label className="form-label">
                Entry Gate <span className="reg__req">*</span>
              </label>
              <select
                className="form-select"
                value={form.entry_gate}
                onChange={(e) => update("entry_gate", e.target.value)}
              >
                {GATES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div className="reg__field">
              <label className="form-label">Entry Date &amp; Time</label>
              <input
                type="datetime-local"
                className="form-control"
                value={form.entry_datetime}
                onChange={(e) => update("entry_datetime", e.target.value)}
              />
              <div className="form-text">Leave blank to use the current time.</div>
            </div>

            <div className="reg__field">
              <label className="form-label">
                No. of Nights <span className="reg__req">*</span>
              </label>
              <select
                className="form-select"
                value={form.nights_purchased}
                onChange={(e) => update("nights_purchased", e.target.value)}
              >
                {NIGHT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} Night{n === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </div>

            <div className="reg__field">
              <label className="form-label">Accommodation (if known)</label>
              <select
                className="form-select"
                value={form.accommodation}
                onChange={(e) => update("accommodation", e.target.value)}
              >
                <option value="">No accommodation</option>
                {LODGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <div className="reg__field">
              <label className="form-label">Vehicle Registration</label>
              <input
                className="form-control"
                value={form.vehicle_registration}
                onChange={(e) => update("vehicle_registration", e.target.value)}
                placeholder="e.g. UAS 123A"
              />
            </div>

            <div className="reg__field mb-0">
              <label className="form-label">Tour Operator</label>
              <input
                className="form-control"
                value={form.tour_company}
                onChange={(e) => update("tour_company", e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Column 3 — Visitor preview */}
          <div className="surface-card p-4 reg__preview">
            <h3 className="vp__card-title text-center">VISITOR PREVIEW</h3>
            <VisitorQrCode value={form.id} size={168} />
            <div className="reg__preview-idlabel">Visitor ID</div>
            <div className="reg__preview-code">{code}</div>
            <button type="submit" className={"btn btn-success w-100 mt-3" + (busy ? " is-busy" : "")} disabled={busy}>
              <i className={"bi " + (busy ? "bi-arrow-repeat spin" : isEditing ? "bi-check2-circle" : "bi-qr-code")} />{" "}
              {busy
                ? isEditing
                  ? "Saving…"
                  : "Registering…"
                : isEditing
                  ? "Save changes"
                  : "Generate QR & Register"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
