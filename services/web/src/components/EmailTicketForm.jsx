import { useEffect, useRef, useState } from "react";


function formatTime(value) {
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Emails a ticket (QR + details) to a visitor — their copy when they have no
// account, e.g. a booking or registration made at a gate. `send(address)` does
// the request and resolves to { email, sentAt }. With `autoSend`, sends once
// on mount if an address is already known.
export default function EmailTicketForm({ id, initialEmail, initialSentAt, send: sendRequest, online, onSent, autoSend = false }) {
  const [email, setEmail] = useState(initialEmail || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sentAt, setSentAt] = useState(initialSentAt || null);
  const autoTried = useRef(false);

  async function send(address) {
    setSending(true);
    setError(null);
    try {
      const result = await sendRequest(address.trim());
      setSentAt(result.sentAt);
      setEmail(result.email || address);
      onSent?.(result);
    } catch (err) {
      setError(err?.message || "Could not send the ticket.");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (autoSend && !autoTried.current && initialEmail && online) {
      autoTried.current = true;
      send(initialEmail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend, initialEmail, online]);

  return (
    <form
      className="email-ticket"
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) send(email);
      }}
    >
      <label className="form-label small mb-1" htmlFor={`email-${id}`}>
        <i className="bi bi-envelope" /> Email the ticket to the visitor
      </label>
      <div className="d-flex gap-2">
        <input
          id={`email-${id}`}
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
