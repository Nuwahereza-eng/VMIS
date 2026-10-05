import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

import { CATEGORIES, formatMinor } from "../domain/categories.js";

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.code, c.label]));

const METHOD_LABEL = {
  mobile_money: "Mobile Money",
  card: "Card",
  cash: "Cash",
};

function formatDate(iso) {
  if (!iso) return "—";
  // Booking dates are plain YYYY-MM-DD; paid_at is a full ISO timestamp.
  const d = iso.length <= 10 ? new Date(iso + "T00:00:00") : new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// A paid booking's digital ticket: a QR code (encoding the ticket code, which a
// gate officer can scan) plus the trip and payment details. The QR is generated
// in the browser from the server-issued ticket code — no personal data in it.
export default function BookingTicket({ booking }) {
  const [qrUrl, setQrUrl] = useState(null);
  const printRef = useRef(null);

  const ticketCode = booking?.ticket_code;

  useEffect(() => {
    let active = true;
    if (!ticketCode) {
      setQrUrl(null);
      return undefined;
    }
    QRCode.toDataURL(ticketCode, { width: 320, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => {
        if (active) setQrUrl(url);
      })
      .catch(() => {
        if (active) setQrUrl(null);
      });
    return () => {
      active = false;
    };
  }, [ticketCode]);

  if (!booking || !ticketCode) return null;

  function downloadQr() {
    const link = document.createElement("a");
    link.href = qrUrl;
    link.download = `${ticketCode}.png`;
    link.click();
  }

  return (
    <div className="booking-ticket" ref={printRef}>
      <div className="booking-ticket__top">
        <div className="booking-ticket__brand">
          <i className="bi bi-tree-fill" />
          <div>
            <div className="booking-ticket__park">Murchison Falls National Park</div>
            <div className="booking-ticket__kind">Entry ticket</div>
          </div>
        </div>
        <span className="pill green">
          <i className="bi bi-patch-check-fill" /> Paid
        </span>
      </div>

      <div className="booking-ticket__qr">
        {qrUrl ? (
          <img src={qrUrl} alt={`QR code for ticket ${ticketCode}`} />
        ) : (
          <div className="booking-ticket__qr-fallback">
            <i className="bi bi-qr-code" />
          </div>
        )}
        <div className="booking-ticket__code">{ticketCode}</div>
        <div className="booking-ticket__hint muted">Show this QR at the gate</div>
      </div>

      <div className="booking-ticket__rows">
        <div className="data-row">
          <span className="muted">Visitor</span>
          <span>{booking.full_name}</span>
        </div>
        <div className="data-row">
          <span className="muted">Visit date</span>
          <span>{formatDate(booking.intended_date)}</span>
        </div>
        <div className="data-row">
          <span className="muted">Party size</span>
          <span>{booking.party_size}</span>
        </div>
        {booking.expected_gate && (
          <div className="data-row">
            <span className="muted">Entry gate</span>
            <span>{booking.expected_gate}</span>
          </div>
        )}
        {booking.category && (
          <div className="data-row">
            <span className="muted">Category</span>
            <span>{CATEGORY_LABEL[booking.category] || booking.category}</span>
          </div>
        )}
        <div className="data-row">
          <span className="muted">Nights</span>
          <span>{booking.length_of_stay_nights}</span>
        </div>
      </div>

      <div className="booking-ticket__pay">
        <div className="data-row">
          <span className="muted">Amount paid</span>
          <span className="fw-semibold">
            {booking.amount_minor != null
              ? formatMinor(booking.amount_minor, booking.currency)
              : "—"}
          </span>
        </div>
        <div className="data-row">
          <span className="muted">Method</span>
          <span>{METHOD_LABEL[booking.payment_method] || booking.payment_method || "—"}</span>
        </div>
        {booking.payment_reference && (
          <div className="data-row">
            <span className="muted">Reference</span>
            <span>{booking.payment_reference}</span>
          </div>
        )}
        {booking.paid_at && (
          <div className="data-row">
            <span className="muted">Paid on</span>
            <span>{formatDate(booking.paid_at)}</span>
          </div>
        )}
      </div>

      {qrUrl && (
        <button type="button" className="btn btn-outline-success btn-sm w-100 mt-3" onClick={downloadQr}>
          <i className="bi bi-download" /> Save ticket QR
        </button>
      )}
    </div>
  );
}
