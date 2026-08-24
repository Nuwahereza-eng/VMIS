import { useState } from "react";

import QrScanner from "../components/QrScanner.jsx";
import { verifyLocal } from "../data/repository.js";
import { computeValidity } from "../domain/tickets.js";
import TicketCountdown from "../components/TicketCountdown.jsx";
import {
  visitsForVisitor,
  activitiesForVisitor,
  accommodationsForVisitor,
} from "../data/repository.js";
import PageHeader from "../components/PageHeader.jsx";
import VisitorQrCode from "../components/VisitorQrCode.jsx";

export default function VerifyPage() {
  const [payload, setPayload] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [openVisit, setOpenVisit] = useState(null);
  const [activities, setActivities] = useState([]);
  const [accommodations, setAccommodations] = useState([]);
  const [searched, setSearched] = useState(false);

  async function lookup(value) {
    const visitor = await verifyLocal(value.trim());
    setSearched(true);
    setResult(visitor || null);
    setTicket(null);
    setOpenVisit(null);
    setActivities([]);
    setAccommodations([]);
    if (visitor) {
      const visits = await visitsForVisitor(visitor.id);
      const open = visits.find((v) => !v.exit_timestamp);
      if (open) {
        setOpenVisit(open);
        setTicket(computeValidity(open.entry_timestamp, open.nights_purchased));
      }
      setActivities(await activitiesForVisitor(visitor.id));
      setAccommodations(await accommodationsForVisitor(visitor.id));
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
    <>
      <PageHeader
        icon="bi-qr-code-scan"
        title="Verify visitor"
        subtitle="Checks the identifier against this device, so it works with no connection"
      />

      <div className="row g-4">
        <div className="col-lg-6">
          <div className="surface-card p-4">
            <div className="card-title-row">
              <i className="bi bi-search" />
              <h2>Look up a visitor</h2>
            </div>

            <form onSubmit={onSubmit} className="mb-3">
              <div className="input-icon mb-2">
                <i className="bi bi-upc-scan" />
                <input
                  className="form-control"
                  placeholder="Scan a QR or type the identifier / ID number"
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                />
              </div>
              <div className="d-flex gap-2">
                <button className="btn btn-success flex-grow-1" type="submit">
                  <i className="bi bi-check2-circle" /> Verify
                </button>
                <button
                  type="button"
                  className={"btn " + (scanning ? "btn-outline-danger" : "btn-ghost")}
                  onClick={() => setScanning((s) => !s)}
                >
                  <i className={"bi " + (scanning ? "bi-x-lg" : "bi-camera")} />
                  {scanning ? "Stop" : "Camera"}
                </button>
              </div>
            </form>

            {scanning && (
              <div className="mb-1">
                <QrScanner onDecode={onDecode} onError={() => setScanning(false)} />
              </div>
            )}
          </div>
        </div>

        <div className="col-lg-6">
          {searched && !result && (
            <div className="alert alert-danger">No matching record on this device.</div>
          )}

          {!searched && (
            <div className="surface-card p-4 h-100 d-flex align-items-center justify-content-center">
              <div className="empty-state mb-0">
                <i className="bi bi-person-badge" />
                Scan or enter an identifier to see the visitor and ticket status.
              </div>
            </div>
          )}

          {result && (
            <div className="surface-card overflow-hidden">
              <div
                className="p-4 d-flex align-items-center gap-3"
                style={{ background: "var(--vmis-green-50)", borderBottom: "1px solid var(--vmis-line)" }}
              >
                <div className="data-row__avatar" style={{ width: 52, height: 52, flex: "0 0 52px", fontSize: "1.1rem" }}>
                  {result.full_name?.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <h3 className="mb-0" style={{ fontSize: "1.2rem" }}>{result.full_name}</h3>
                  <span className="pill neutral mt-1">{result.category}</span>
                </div>
              </div>
              <div className="p-4">
                <dl className="row mb-0" style={{ fontSize: "0.9rem" }}>
                  <dt className="col-5 small-caps">Identifier</dt>
                  <dd className="col-7"><code>{result.id}</code></dd>
                  <dt className="col-5 small-caps">ID number</dt>
                  <dd className="col-7">{result.id_number}</dd>
                  <dt className="col-5 small-caps">Nationality</dt>
                  <dd className="col-7">{result.nationality || "—"}</dd>
                  {result.country && (
                    <>
                      <dt className="col-5 small-caps">Country</dt>
                      <dd className="col-7">{result.country}</dd>
                    </>
                  )}
                  {result.phone && (
                    <>
                      <dt className="col-5 small-caps">Phone</dt>
                      <dd className="col-7">{result.phone}</dd>
                    </>
                  )}
                  {result.email && (
                    <>
                      <dt className="col-5 small-caps">Email</dt>
                      <dd className="col-7">{result.email}</dd>
                    </>
                  )}
                  {result.tour_company && (
                    <>
                      <dt className="col-5 small-caps">Tour company</dt>
                      <dd className="col-7">{result.tour_company}</dd>
                    </>
                  )}
                  {result.vehicle_registration && (
                    <>
                      <dt className="col-5 small-caps">Vehicle</dt>
                      <dd className="col-7">{result.vehicle_registration}</dd>
                    </>
                  )}
                  {result.guide_name && (
                    <>
                      <dt className="col-5 small-caps">Guide</dt>
                      <dd className="col-7">{result.guide_name}</dd>
                    </>
                  )}
                  {Number(result.num_visitors) > 1 && (
                    <>
                      <dt className="col-5 small-caps">Party size</dt>
                      <dd className="col-7">{result.num_visitors}</dd>
                    </>
                  )}
                  {openVisit && (
                    <>
                      <dt className="col-5 small-caps">Ticket no.</dt>
                      <dd className="col-7">{openVisit.ticket_number}</dd>
                    </>
                  )}
                </dl>

                {ticket ? (
                  <TicketCountdown
                    entryTimestamp={openVisit.entry_timestamp}
                    nightsPurchased={openVisit.nights_purchased}
                  />
                ) : (
                  <div className="alert alert-info mt-3 mb-0">
                    No open visit on this device for this visitor.
                  </div>
                )}

                <div className="d-flex gap-2 mt-3">
                  <span className="pill neutral">
                    <i className="bi bi-compass me-1" />
                    {activities.length} activit{activities.length === 1 ? "y" : "ies"}
                  </span>
                  <span className="pill neutral">
                    <i className="bi bi-house-door me-1" />
                    {accommodations.length
                      ? accommodations
                          .map((a) => `${a.facility} (${a.nights}n)`)
                          .join(", ")
                      : "No accommodation"}
                  </span>
                </div>

                <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--vmis-line)" }}>
                  <VisitorQrCode value={result.id} label="Visitor QR — scan to re-verify" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
