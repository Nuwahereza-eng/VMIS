import { useState } from "react";
import { Link } from "react-router-dom";

import { useApp } from "../context/AppContext.jsx";
import PageHeader from "../components/PageHeader.jsx";
import PaymentPanel from "../components/PaymentPanel.jsx";
import BookingTicket from "../components/BookingTicket.jsx";
import { createBooking } from "../api/client.js";
import { CATEGORIES } from "../domain/categories.js";
import { GATES, LODGES } from "../domain/reference.js";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(session) {
  return {
    full_name: session?.name || "",
    intended_date: todayISO(),
    country: "",
    phone: "",
    email: session?.username && session.username.includes("@") ? session.username : "",
    category: "",
    party_size: 1,
    expected_gate: "",
    length_of_stay_nights: 1,
    accommodation: "",
    notes: "",
  };
}

// Three steps: fill the form -> pay the entry fee -> see the QR ticket.
const STEP_FORM = "form";
const STEP_PAY = "pay";
const STEP_TICKET = "ticket";

export default function BookVisitPage() {
  const { session, online } = useApp();
  const token = session.token;

  const [form, setForm] = useState(() => emptyForm(session));
  const [step, setStep] = useState(STEP_FORM);
  const [booking, setBooking] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        intended_date: form.intended_date,
        country: form.country.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        category: form.category || null,
        party_size: Number(form.party_size) || 1,
        expected_gate: form.expected_gate || null,
        length_of_stay_nights: Number(form.length_of_stay_nights) || 1,
        accommodation: form.accommodation || null,
        notes: form.notes.trim() || null,
      };
      const created = await createBooking(token, payload);
      setBooking(created);
      setStep(STEP_PAY);
    } catch (err) {
      setError(err?.message || "Could not submit your booking. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function bookAnother() {
    setForm(emptyForm(session));
    setBooking(null);
    setError(null);
    setStep(STEP_FORM);
  }

  // --- Step 3: paid, show the ticket ---
  if (step === STEP_TICKET && booking) {
    return (
      <>
        <PageHeader
          icon="bi-ticket-perforated"
          title="Your ticket is ready"
          subtitle="Payment received — show this QR code at the park entrance"
        />
        <div className="row g-3 justify-content-center">
          <div className="col-md-7 col-lg-5">
            <div className="surface-card p-4">
              <BookingTicket booking={booking} />
            </div>
            <div className="d-flex gap-2 justify-content-center mt-3">
              <Link to="/my-bookings" className="btn btn-success">
                <i className="bi bi-journal-check" /> My bookings
              </Link>
              <button type="button" className="btn btn-outline-success" onClick={bookAnother}>
                <i className="bi bi-plus-lg" /> Book another visit
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // --- Step 2: pay the entry fee ---
  if (step === STEP_PAY && booking) {
    return (
      <>
        <PageHeader
          icon="bi-credit-card"
          title="Pay your entry fee"
          subtitle="Secure your booking by paying the park entry fee"
        />
        <div className="row g-3 justify-content-center">
          <div className="col-md-7 col-lg-5">
            <div className="surface-card p-4">
              <div className="mb-3">
                <div className="fw-semibold" style={{ color: "var(--vmis-ink)" }}>
                  {booking.full_name}
                </div>
                <div className="muted small">
                  {booking.party_size} visitor{booking.party_size > 1 ? "s" : ""}
                  {booking.category ? ` · ${booking.category}` : ""}
                  {" · "}
                  {new Date(booking.intended_date + "T00:00:00").toLocaleDateString()}
                </div>
              </div>
              <PaymentPanel
                booking={booking}
                token={token}
                online={online}
                onPaid={(paid) => {
                  setBooking(paid);
                  setStep(STEP_TICKET);
                }}
              />
            </div>
            <div className="text-center mt-3">
              <Link to="/my-bookings" className="btn btn-link text-muted">
                Pay later — I'll finish from My Bookings
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  // --- Step 1: the booking form ---
  return (
    <>
      <PageHeader
        icon="bi-calendar-plus"
        title="Book a visit"
        subtitle="Plan your trip to Murchison Falls and reserve your entry"
      />

      {!online && (
        <div className="alert alert-warning py-2">
          You are offline. Submitting a booking needs a connection.
        </div>
      )}
      {error && <div className="alert alert-danger py-2">{error}</div>}

      <div className="surface-card p-4">
        <form onSubmit={onSubmit}>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Lead visitor name</label>
              <input
                className="form-control"
                value={form.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                placeholder="Full name"
                required
              />
            </div>
            <div className="col-md-3">
              <label className="form-label">Visit date</label>
              <input
                type="date"
                className="form-control"
                value={form.intended_date}
                min={todayISO()}
                onChange={(e) => set("intended_date", e.target.value)}
                required
              />
            </div>
            <div className="col-md-3">
              <label className="form-label">Party size</label>
              <input
                type="number"
                min={1}
                max={500}
                className="form-control"
                value={form.party_size}
                onChange={(e) => set("party_size", e.target.value)}
                required
              />
            </div>

            <div className="col-md-4">
              <label className="form-label">Expected entry gate</label>
              <select
                className="form-select"
                value={form.expected_gate}
                onChange={(e) => set("expected_gate", e.target.value)}
              >
                <option value="">Not sure yet</option>
                {GATES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Visitor category</label>
              <select
                className="form-select"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                required
              >
                <option value="">Select…</option>
                {CATEGORIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <div className="form-text">Determines your entry fee.</div>
            </div>
            <div className="col-md-4">
              <label className="form-label">Nights staying</label>
              <input
                type="number"
                min={1}
                max={365}
                className="form-control"
                value={form.length_of_stay_nights}
                onChange={(e) => set("length_of_stay_nights", e.target.value)}
              />
            </div>

            <div className="col-md-4">
              <label className="form-label">Country of origin</label>
              <input
                className="form-control"
                value={form.country}
                onChange={(e) => set("country", e.target.value)}
                placeholder="e.g. Uganda"
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">Phone</label>
              <input
                className="form-control"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-control"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="col-md-6">
              <label className="form-label">Accommodation</label>
              <select
                className="form-select"
                value={form.accommodation}
                onChange={(e) => set("accommodation", e.target.value)}
              >
                <option value="">Not decided</option>
                {LODGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Notes</label>
              <input
                className="form-control"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Anything we should know (optional)"
              />
            </div>
          </div>

          <div className="mt-4 d-flex gap-2 align-items-center">
            <button className="btn btn-success" disabled={saving || !online}>
              {saving ? (
                <>
                  <i className="bi bi-arrow-repeat spin" /> Submitting…
                </>
              ) : (
                <>
                  <i className="bi bi-arrow-right-circle" /> Continue to payment
                </>
              )}
            </button>
            <Link to="/my-bookings" className="btn btn-outline-success">
              My bookings
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
