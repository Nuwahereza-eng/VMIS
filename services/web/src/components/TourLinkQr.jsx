import { useState } from "react";

import { mintTourToken } from "../api/client.js";
import { visitorQrPayload } from "../domain/qr.js";
import VisitorQrCode from "./VisitorQrCode.jsx";

// The QR a visitor scans with their own phone to open their tour page already
// linked to their ticket. Online, it carries a token signed for this ticket.
// If the officer's screen is offline it carries the visitor id instead, and the
// phone swaps that for a token once it has signal.
// With `self`, it is the tourist's own screen: wording changes and a direct
// "Start on this phone" link is offered alongside the QR.
export default function TourLinkQr({ visitorId, bookingId, token, online, self = false }) {
  const [url, setUrl] = useState(null);
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function show() {
    setBusy(true);
    setError(null);
    setNote(null);
    const base = `${window.location.origin}/tour`;
    try {
      if (!online) throw Object.assign(new Error("offline"), { status: 0 });
      const minted = await mintTourToken(token, { visitorId, bookingId });
      setUrl(`${base}#t=${encodeURIComponent(minted.token)}`);
    } catch (err) {
      if (visitorId && !err?.status) {
        // Offline: the phone links with the visitor id when it gets signal.
        setUrl(`${base}#v=${encodeURIComponent(visitorQrPayload(visitorId).slice("VMIS:1:".length))}`);
        setNote("Offline: the visitor's phone will confirm the ticket when it has signal.");
      } else {
        setError(err?.message || "Could not create the link.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tour-link-qr">
      <div className="fw-semibold small mb-1" style={{ color: "var(--vmis-ink)" }}>
        <i className="bi bi-phone" /> {self ? "Tour tracking" : "Visitor's phone"}
      </div>
      {url ? (
        <>
          <VisitorQrCode value={url} size={168} />
          <div className="muted small mt-1">{self ? "Scan with the phone you'll carry in the park." : "Scan with the visitor's phone camera to open their visit page."}</div>
          {note && <div className="small mt-1" style={{ color: "var(--vmis-warning)" }}>{note}</div>}
          {self && (
            <a href={url} className="btn btn-success btn-sm w-100 mt-2">
              <i className="bi bi-broadcast" /> Start on this phone
            </a>
          )}
        </>
      ) : (
        <button type="button" className="btn btn-outline-success btn-sm w-100" onClick={show} disabled={busy}>
          <i className="bi bi-qr-code" /> {busy ? "Creating…" : self ? "Start tour tracking" : "Show tour link QR"}
        </button>
      )}
      {error && <div className="alert alert-danger py-2 mt-2 mb-0 small">{error}</div>}
    </div>
  );
}
