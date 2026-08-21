import { useState } from "react";

import QrScanner from "../components/QrScanner.jsx";
import { verifyLocal } from "../data/repository.js";
import { computeValidity } from "../domain/tickets.js";
import { visitsForVisitor } from "../data/repository.js";

export default function VerifyPage() {
  const [payload, setPayload] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [searched, setSearched] = useState(false);

  async function lookup(value) {
    const visitor = await verifyLocal(value.trim());
    setSearched(true);
    setResult(visitor || null);
    setTicket(null);
    if (visitor) {
      const visits = await visitsForVisitor(visitor.id);
      const open = visits.find((v) => !v.exit_timestamp);
      if (open) {
        setTicket(computeValidity(open.entry_timestamp, open.nights_purchased));
      }
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    await lookup(payload);
  }

  function onDecode(decoded) {
    setScanning(false);
    setPayload(decoded);
    lookup(decoded);
  }

  return (
    <div className="row">
      <div className="col-lg-6">
        <h2 className="h4 mb-3">Verify visitor</h2>
        <p className="text-muted small">
          Checks the identifier against the record on this device, so it works with no connection.
        </p>

        <form onSubmit={onSubmit} className="mb-3">
          <div className="input-group">
            <input
              className="form-control"
              placeholder="Scan a QR or type the identifier / ID number"
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
            />
            <button className="btn btn-success" type="submit">
              Verify
            </button>
          </div>
        </form>

        <button
          className="btn btn-outline-success btn-sm mb-3"
          onClick={() => setScanning((s) => !s)}
        >
          {scanning ? "Stop camera" : "Scan QR with camera"}
        </button>

        {scanning && (
          <div className="mb-3">
            <QrScanner onDecode={onDecode} onError={() => setScanning(false)} />
          </div>
        )}

        {searched && !result && (
          <div className="alert alert-danger">No matching record on this device.</div>
        )}

        {result && (
          <div className="card shadow-sm">
            <div className="card-body">
              <h3 className="h5">{result.full_name}</h3>
              <dl className="row mb-0 small">
                <dt className="col-5">Identifier</dt>
                <dd className="col-7">
                  <code>{result.id}</code>
                </dd>
                <dt className="col-5">ID number</dt>
                <dd className="col-7">{result.id_number}</dd>
                <dt className="col-5">Category</dt>
                <dd className="col-7">{result.category}</dd>
                <dt className="col-5">Nationality</dt>
                <dd className="col-7">{result.nationality || "-"}</dd>
              </dl>
              {ticket && (
                <div
                  className={
                    "alert mt-3 mb-0 py-2 " +
                    (ticket.status === "Active" ? "alert-success" : "alert-warning")
                  }
                >
                  Ticket <strong>{ticket.status}</strong> - expires{" "}
                  {ticket.expiry.toLocaleString()}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
