import { useEffect, useRef, useState } from "react";

import { emailTicket } from "../api/client.js";

function formatTime(value) {
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Sends a paid booking's ticket (QR + details) to the visitor's email — their
// only copy when the booking was made at a gate and they have no account.
// With `autoSend`, sends once on mount if the booking already has an email.
export default function EmailTicketForm({ booking, token, online, onSent, autoSend = false }) {
  const [email, setEmail] = useState(booking.email || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sentAt, setSentAt] = useState(booking.ticket_emailed_at || null);
  const autoTried = useRef(false);

  async function send(address) {
    setSending(true);
    setError(null);
    try {
      const updated = await emailTicket(token, booking.id, { email: address.trim() });
      setSentAt(updated.ticket_emailed_at);
      setEmail(updated.email || address);
      onSent?.(updated);
    } catch (err) {
      setError(err?.message || "Could not send the ticket.");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (autoSend && !autoTried.current && booking.email && online) {
      autoTried.current = true;
      send(booking.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend, booking.email, online]);

  return (
    <form
      className="email-ticket"
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) send(email);
      }}
    >
      <label className="form-label small mb-1" htmlFor={`email-${booking.id}`}>
        <i className="bi bi-envelope" /> Email the ticket to the visitor
      </label>
      <div className="d-flex gap-2">
        <input
          id={`email-${booking.id}`}
          type="email"
          className="form-control"
          placeholder="visitor@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button className="btn btn-success text-nowrap" disabled={sending || !online || !email.trim()}>
          {sending ? (
            <>
              <i className="bi bi-arrow-repeat spin" /> Sending…
            </>
          ) : (
            <>
              <i className="bi bi-send" /> {sentAt ? "Resend" : "Send"}
            </>
          )}
        </button>
      </div>
      {sentAt && !sending && !error && (
        <div className="small mt-2" style={{ color: "var(--vmis-green-700)" }}>
          <i className="bi bi-check2-circle" /> Ticket emailed to {email} · {formatTime(sentAt)}
        </div>
      )}
      {error && <div className="alert alert-danger py-2 mt-2 mb-0 small">{error}</div>}
      {!online && <div className="muted small mt-2">Sending needs a connection.</div>}
    </form>
  );
}
