import { useState } from "react";

import { payBooking } from "../api/client.js";
import { formatMinor } from "../domain/categories.js";

const METHODS = [
  { value: "mobile_money", label: "Mobile Money", icon: "bi-phone" },
  { value: "card", label: "Card", icon: "bi-credit-card" },
  { value: "cash", label: "Cash", icon: "bi-cash-coin" },
];

// Collects a (simulated) payment for a booking's entry fee and reports the paid
// booking back via onPaid. The amount comes from the server-quoted booking, so
// this panel never computes money itself.
export default function PaymentPanel({ booking, token, online, onPaid }) {
  const [method, setMethod] = useState("mobile_money");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(null);

  const hasQuote = booking?.amount_minor != null && booking?.currency;

  async function onPay() {
    setError(null);
    setPaying(true);
    try {
      const updated = await payBooking(token, booking.id, { method });
      onPaid?.(updated);
    } catch (err) {
      setError(err?.message || "Payment could not be completed. Please try again.");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="payment-panel">
      <div className="payment-panel__amount">
        <span className="muted">Amount due</span>
        <span className="payment-panel__figure">
          {hasQuote ? formatMinor(booking.amount_minor, booking.currency) : "—"}
        </span>
      </div>

      {!hasQuote && (
        <div className="alert alert-warning py-2 mb-3">
          Choose a visitor category for this booking so the entry fee can be
          calculated.
        </div>
      )}

      <div className="payment-panel__methods">
        {METHODS.map((m) => (
          <label
            key={m.value}
            className={"payment-method" + (method === m.value ? " is-selected" : "")}
          >
            <input
              type="radio"
              name="pay-method"
              value={m.value}
              checked={method === m.value}
              onChange={() => setMethod(m.value)}
            />
            <i className={"bi " + m.icon} />
            <span>{m.label}</span>
          </label>
        ))}
      </div>

      <p className="muted small mb-3">
        <i className="bi bi-shield-lock" /> This is a simulated payment for the
        demo — no real money is charged.
      </p>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      <button
        type="button"
        className="btn btn-success w-100"
        onClick={onPay}
        disabled={paying || !online || !hasQuote}
      >
        {paying ? (
          <>
            <i className="bi bi-arrow-repeat spin" /> Processing payment…
          </>
        ) : (
          <>
            <i className="bi bi-credit-card-2-front" /> Pay{" "}
            {hasQuote ? formatMinor(booking.amount_minor, booking.currency) : "now"}
          </>
        )}
      </button>
    </div>
  );
}
