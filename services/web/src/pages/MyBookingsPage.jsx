import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useApp } from "../context/AppContext.jsx";
import PageHeader from "../components/PageHeader.jsx";
import PaymentPanel from "../components/PaymentPanel.jsx";
import BookingTicket from "../components/BookingTicket.jsx";
import { cancelBooking, getMyBookings } from "../api/client.js";
import { CATEGORIES, formatMinor } from "../domain/categories.js";

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.code, c.label]));

const STATUS_META = {
  pending: { label: "Expected", cls: "active", icon: "bi-hourglass-split" },
  arrived: { label: "Arrived", cls: "neutral", icon: "bi-box-arrow-in-right" },
  cancelled: { label: "Cancelled", cls: "expired", icon: "bi-x-circle" },
  no_show: { label: "No show", cls: "expired", icon: "bi-dash-circle" },
};

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function MyBookingsPage() {
  const { session, online } = useApp();
  const token = session.token;

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  // When set, show a modal: mode "pay" collects payment, "ticket" shows the QR.
  const [modal, setModal] = useState(null); // { mode, booking }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getMyBookings(token);
      setBookings(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err?.message || "Could not load your bookings.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (online) load();
    else setLoading(false);
  }, [online, load]);

  async function onCancel(booking) {
    if (!window.confirm("Cancel this booking? This cannot be undone.")) return;
    setBusyId(booking.id);
    setError(null);
    try {
      await cancelBooking(token, booking.id);
      await load();
    } catch (err) {
      setError(err?.message || "Could not cancel the booking.");
    } finally {
      setBusyId(null);
    }
  }

  function closeModal() {
    setModal(null);
  }

  return (
    <>
      <PageHeader
        icon="bi-journal-check"
        title="My bookings"
        subtitle="Your upcoming and past visit bookings"
        actions={
          <Link to="/book" className="btn btn-success btn-sm">
            <i className="bi bi-calendar-plus" /> Book a visit
          </Link>
        }
      />

      {!online && (
        <div className="alert alert-warning py-2">
          You are offline. Connect to see and manage your bookings.
        </div>
      )}
      {error && <div className="alert alert-danger py-2">{error}</div>}

      {loading ? (
        <div className="surface-card p-4 text-center muted">Loading…</div>
      ) : bookings.length === 0 ? (
        <div className="empty-state surface-card p-5 text-center">
          <div className="mb-3" style={{ fontSize: "2.5rem", color: "var(--vmis-muted)" }}>
            <i className="bi bi-calendar-x" />
          </div>
          <h3 style={{ color: "var(--vmis-ink)" }}>No bookings yet</h3>
          <p className="muted mb-4">
            When you book a visit it will appear here, where you can review or
            cancel it.
          </p>
          <Link to="/book" className="btn btn-success">
            <i className="bi bi-calendar-plus" /> Book your first visit
          </Link>
        </div>
      ) : (
        <div className="row g-3">
          {bookings.map((b) => {
            const meta = STATUS_META[b.status] || STATUS_META.pending;
            const canCancel = b.status === "pending";
            const isPaid = b.payment_status === "paid";
            const canPay = !isPaid && b.status === "pending";
            return (
              <div className="col-md-6 col-xl-4" key={b.id}>
                <div className="surface-card p-4 h-100 d-flex flex-column">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <div className="fw-semibold" style={{ color: "var(--vmis-ink)" }}>
                      {formatDate(b.intended_date)}
                    </div>
                    <span className={"pill " + meta.cls}>
                      <i className={"bi " + meta.icon} /> {meta.label}
                    </span>
                  </div>
                  <div className="breakdown-list flex-grow-1">
                    <div className="data-row">
                      <span className="muted">Party size</span>
                      <span>{b.party_size}</span>
                    </div>
                    {b.expected_gate && (
                      <div className="data-row">
                        <span className="muted">Entry gate</span>
                        <span>{b.expected_gate}</span>
                      </div>
                    )}
                    {b.category && (
                      <div className="data-row">
                        <span className="muted">Category</span>
                        <span>{CATEGORY_LABEL[b.category] || b.category}</span>
                      </div>
                    )}
                    <div className="data-row">
                      <span className="muted">Nights</span>
                      <span>{b.length_of_stay_nights}</span>
                    </div>
                    {b.accommodation && (
                      <div className="data-row">
                        <span className="muted">Accommodation</span>
                        <span>{b.accommodation}</span>
                      </div>
                    )}
                    <div className="data-row">
                      <span className="muted">Entry fee</span>
                      <span>
                        {b.amount_minor != null
                          ? formatMinor(b.amount_minor, b.currency)
                          : "—"}
                      </span>
                    </div>
                    <div className="data-row">
                      <span className="muted">Payment</span>
                      <span className={"pill " + (isPaid ? "green" : "gold")}>
                        <i className={"bi " + (isPaid ? "bi-patch-check-fill" : "bi-hourglass")} />{" "}
                        {isPaid ? "Paid" : "Unpaid"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 d-grid gap-2">
                    {canPay && (
                      <button
                        type="button"
                        className="btn btn-success btn-sm"
                        onClick={() => setModal({ mode: "pay", booking: b })}
                      >
                        <i className="bi bi-credit-card" /> Pay entry fee
                      </button>
                    )}
                    {isPaid && (
                      <button
                        type="button"
                        className="btn btn-outline-success btn-sm"
                        onClick={() => setModal({ mode: "ticket", booking: b })}
                      >
                        <i className="bi bi-ticket-perforated" /> View ticket
                      </button>
                    )}
                    {canCancel && (
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => onCancel(b)}
                        disabled={busyId === b.id}
                      >
                        {busyId === b.id ? (
                          <>
                            <i className="bi bi-arrow-repeat spin" /> Cancelling…
                          </>
                        ) : (
                          <>
                            <i className="bi bi-x-circle" /> Cancel booking
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <div className="vmis-modal-backdrop" onClick={closeModal}>
          <div
            className="vmis-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="vmis-modal__head">
              <h3 className="mb-0">
                {modal.mode === "pay" ? "Pay entry fee" : "Your ticket"}
              </h3>
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                onClick={closeModal}
              />
            </div>
            <div className="vmis-modal__body">
              {modal.mode === "pay" ? (
                <>
                  <div className="mb-3">
                    <div className="fw-semibold" style={{ color: "var(--vmis-ink)" }}>
                      {modal.booking.full_name}
                    </div>
                    <div className="muted small">
                      {modal.booking.party_size} visitor
                      {modal.booking.party_size > 1 ? "s" : ""}
                      {" · "}
                      {formatDate(modal.booking.intended_date)}
                    </div>
                  </div>
                  <PaymentPanel
                    booking={modal.booking}
                    token={token}
                    online={online}
                    onPaid={(paid) => {
                      setBookings((rows) =>
                        rows.map((r) => (r.id === paid.id ? paid : r)),
                      );
                      setModal({ mode: "ticket", booking: paid });
                    }}
                  />
                </>
              ) : (
                <BookingTicket booking={modal.booking} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
