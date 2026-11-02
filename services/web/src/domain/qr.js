// What a visitor QR encodes, mirroring the server (app/qr.py):
//
//   VMIS:1:<visitor-uuid>
//
// Only the identifier, never personal data. Scanners resolve it against the
// local store and, when online, the system of record.

const PREFIX = "VMIS:1:";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_CODE_RE = /^VM-?([0-9A-F]{8})$/i;
const TICKET_RE = /^MF-[A-Z0-9]+$/i;

export function visitorQrPayload(visitorId) {
  return PREFIX + visitorId;
}

// Classify anything scanned or typed at the gate:
//   { kind: "ticket", code }          a booking ticket (MF-...)
//   { kind: "visitor", id }           a visitor QR (current or older bare-id QR)
//   { kind: "code", code }            the short visitor code (VM-1A2B3C4D)
//   { kind: "text", text }            anything else (e.g. a passport number)
export function classifyScan(raw) {
  const text = String(raw || "").trim();
  if (TICKET_RE.test(text)) return { kind: "ticket", code: text.toUpperCase() };
  if (text.toUpperCase().startsWith(PREFIX)) {
    const id = text.slice(PREFIX.length);
    if (UUID_RE.test(id)) return { kind: "visitor", id: id.toLowerCase() };
  }
  if (UUID_RE.test(text)) return { kind: "visitor", id: text.toLowerCase() };
  const short = text.match(SHORT_CODE_RE);
  if (short) return { kind: "code", code: "VM-" + short[1].toUpperCase() };
  return { kind: "text", text };
}
