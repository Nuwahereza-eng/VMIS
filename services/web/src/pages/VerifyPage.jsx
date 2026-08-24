import { useState } from "react";

import QrScanner from "../components/QrScanner.jsx";
import { verifyLocal } from "../data/repository.js";
import VisitorProfilePage from "./VisitorProfilePage.jsx";

// Full-screen "Scan QR Code" experience matching the mockup: a dark top bar,
// a live camera view with yellow corner framing, and a caption. A manual entry
// fallback keeps it usable on devices without a camera or when testing offline.
// A successful scan/lookup opens the visitor's profile.
export default function VerifyPage() {
  const [scanning, setScanning] = useState(true);
  const [manual, setManual] = useState("");
  const [visitor, setVisitor] = useState(null);
  const [notFound, setNotFound] = useState(false);

  async function lookup(value) {
    const found = await verifyLocal(String(value).trim());
    if (found) {
      setVisitor(found);
      setScanning(false);
      setNotFound(false);
    } else {
      setNotFound(true);
    }
  }

  function onDecode(decoded) {
    setScanning(false);
    lookup(decoded);
  }

  if (visitor) {
    return (
      <VisitorProfilePage
        visitor={visitor}
        onBack={() => {
          setVisitor(null);
          setScanning(true);
        }}
        onScanQr={() => {
          setVisitor(null);
          setScanning(true);
        }}
      />
    );
  }

  return (
    <div className="scan fade-in">
      <div className="scan__topbar">
        <button className="vp__back" onClick={() => window.history.back()} aria-label="Back">
          <i className="bi bi-arrow-left" />
        </button>
        <h1 className="vp__title">Scan QR Code</h1>
        <button
          className="scan__flash"
          onClick={() => setScanning((s) => !s)}
          aria-label={scanning ? "Stop camera" : "Start camera"}
          title={scanning ? "Stop camera" : "Start camera"}
        >
          <i className={"bi " + (scanning ? "bi-lightning-charge-fill" : "bi-lightning-charge")} />
        </button>
      </div>

      <div className="scan__stage">
        {scanning ? (
          <div className="scan__viewport">
            <QrScanner onDecode={onDecode} onError={() => setScanning(false)} />
            <div className="scan__frame">
              <span className="scan__corner tl" />
              <span className="scan__corner tr" />
              <span className="scan__corner bl" />
              <span className="scan__corner br" />
            </div>
          </div>
        ) : (
          <div className="scan__viewport scan__viewport--idle">
            <i className="bi bi-camera-video-off scan__idle-icon" />
            <button className="btn btn-success" onClick={() => setScanning(true)}>
              <i className="bi bi-camera" /> Start camera
            </button>
          </div>
        )}

        <p className="scan__caption">Position the QR code within the frame to scan</p>

        {notFound && (
          <div className="alert alert-warning scan__alert">
            No matching visitor on this device for that code.
          </div>
        )}

        <form
          className="scan__manual"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) lookup(manual);
          }}
        >
          <input
            className="form-control"
            placeholder="Or enter Visitor ID / code manually"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <button className="btn btn-ghost" type="submit">
            <i className="bi bi-search" /> Look up
          </button>
        </form>
      </div>
    </div>
  );
}
