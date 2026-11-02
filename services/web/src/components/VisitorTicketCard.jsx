import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { emailVisitorTicket } from "../api/client.js";
import { CATEGORIES } from "../domain/categories.js";
import { visitorCode } from "../domain/ids.js";
import { visitorQrPayload } from "../domain/qr.js";
import EmailTicketForm from "./EmailTicketForm.jsx";

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.code, c.label]));

function formatDateTime(value) {
  return value
    ? new Date(value).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}

function esc(text) {
  return String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// Print just the ticket: a small standalone page with the QR and key details.
function printTicket({ qrUrl, code, rows, name }) {
  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return;
  const rowHtml = rows
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`)
    .join("");
  win.document.write(`<!doctype html><html><head><title>Ticket ${esc(code)}</title>
<style>body{font-family:Arial,sans-serif;margin:24px;color:#16231d;text-align:center}
h1{font-size:18px;margin:0}p{margin:4px 0 16px;color:#7c8a83;font-size:13px}
img{width:240px;height:240px}.code{font:700 20px Menlo,monospace;letter-spacing:2px;margin:8px 0 16px}
table{width:100%;font-size:14px;border-collapse:collapse;text-align:left}td{padding:6px 0;border-top:1px solid #e5eae7}
td:last-child{text-align:right}</style></head><body>
<h1>Murchison Falls National Park</h1><p>Visitor ticket · ${esc(name)}</p>
<img src="${qrUrl}" alt="QR"><div class="code">${esc(code)}</div><table>${rowHtml}</table>
<script>window.onload=function(){window.print()}</script></body></html>`);
  win.document.close();
}

// Every visitor's ticket: the real, scannable QR (VMIS:1:<id>, the payload the
// gate scanner resolves) with the current entry's ticket number and validity,
// plus save, print and email so a visitor without the app can carry it.
export default function VisitorTicketCard({ visitor, visit, validity, token, online, onVisitorChange }) {
  const [qrUrl, setQrUrl] = useState(null);
  const payload = visitorQrPayload(visitor.id);
  const code = visitorCode(visitor.id);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(payload, { width: 480, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => alive && setQrUrl(url))
      .catch(() => alive && setQrUrl(null));
    return () => {
      alive = false;
    };
  }, [payload]);

  const active = validity && validity.status === "Active";
  const rows = [
    ["Visitor", visitor.full_name],
    ["Category", CATEGORY_LABEL[visitor.category] || visitor.category],
    ...(visit
      ? [
          ["Ticket no.", visit.ticket_number || "—"],
          ["Entry gate", visit.entry_gate || "—"],
          ["Entered", formatDateTime(visit.entry_timestamp)],
          ["Nights", String(visit.nights_purchased)],
          [active ? "Valid until" : "Expired", validity ? formatDateTime(validity.expiry) : "—"],
        ]
      : []),
  ];

  function downloadQr() {
    const link = document.createElement("a");
    link.href = qrUrl;
    link.download = `${code}.png`;
    link.click();
  }

  return (
    <div className="surface-card p-4 visitor-ticket">
      <div className="d-flex justify-content-between align-items-start mb-2">
        <h3 className="vp__card-title mb-0">VISITOR TICKET</h3>
        {visit ? (
          <span className={"pill " + (active ? "active" : "expired")}>
            <i className={"bi " + (active ? "bi-patch-check-fill" : "bi-shield-exclamation")} />{" "}
            {active ? "Valid" : visit.exit_timestamp ? "Exited" : "Expired"}
          </span>
        ) : (
          <span className="pill neutral">
            <i className="bi bi-dash-circle" /> No entry yet
          </span>
        )}
      </div>

      <div className="visitor-ticket__qr">
        {qrUrl ? <img src={qrUrl} alt={`QR code for ${visitor.full_name}`} /> : <i className="bi bi-qr-code" />}
        <div className="booking-ticket__code">{code}</div>
        <div className="muted small">Scanned at the gate, checkpoints and exit</div>
      </div>

      <dl className="visitor-ticket__rows">
        {rows.map(([k, v]) => (
          <div key={k} className="data-row">
            <dt className="muted">{k}</dt>
            <dd className="mb-0">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="d-flex gap-2 mt-3">
        <button type="button" className="btn btn-outline-success btn-sm flex-grow-1" onClick={downloadQr} disabled={!qrUrl}>
          <i className="bi bi-download" /> Save QR
        </button>
        <button
          type="button"
          className="btn btn-outline-success btn-sm flex-grow-1"
          onClick={() => printTicket({ qrUrl, code, rows, name: visitor.full_name })}
          disabled={!qrUrl}
        >
          <i className="bi bi-printer" /> Print
        </button>
      </div>

      <hr />
      <EmailTicketForm
        id={visitor.id}
        initialEmail={visitor.email}
        online={online}
        send={async (address) => {
          const updated = await emailVisitorTicket(token, visitor.id, { email: address });
          onVisitorChange?.(updated);
          return { email: updated.email, sentAt: new Date().toISOString() };
        }}
      />
    </div>
  );
}
