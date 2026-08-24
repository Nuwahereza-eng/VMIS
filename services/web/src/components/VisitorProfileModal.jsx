import { CATEGORIES } from "../domain/categories.js";
import VisitorQrCode from "./VisitorQrCode.jsx";

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.code, c.label]));

function initials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

function Row({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <>
      <dt className="col-5 small-caps">{label}</dt>
      <dd className="col-7">{value}</dd>
    </>
  );
}

// Read-only visitor profile shown when a registry row is clicked. All fields
// come from the registry payload already in memory, so opening it is instant
// and needs no extra request.
export default function VisitorProfileModal({ visitor, onClose }) {
  if (!visitor) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel surface-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-panel__close" onClick={onClose} aria-label="Close">
          <i className="bi bi-x-lg" />
        </button>

        <div
          className="p-4 d-flex align-items-center gap-3"
          style={{ background: "var(--vmis-green-50)", borderBottom: "1px solid var(--vmis-line)" }}
        >
          <div
            className="data-row__avatar"
            style={{ width: 52, height: 52, flex: "0 0 52px", fontSize: "1.1rem" }}
          >
            {initials(visitor.full_name)}
          </div>
          <div>
            <h3 className="mb-0" style={{ fontSize: "1.2rem" }}>
              {visitor.full_name}
            </h3>
            <div className="d-flex gap-2 mt-1">
              <span className="pill neutral">{visitor.category}</span>
              {visitor.is_inside ? (
                <span className="pill active">Inside park</span>
              ) : (
                <span className="pill neutral">Not inside</span>
              )}
            </div>
          </div>
        </div>

        <div className="p-4">
          <div className="row g-4">
            <div className="col-md-7">
              <dl className="row mb-0" style={{ fontSize: "0.9rem" }}>
                <Row label="Category" value={CATEGORY_LABEL[visitor.category] || visitor.category} />
                <Row label="ID number" value={visitor.id_number} />
                <Row label="Nationality" value={visitor.nationality} />
                <Row label="Country" value={visitor.country} />
                <Row label="Age" value={visitor.age_category} />
                <Row label="Gender" value={visitor.gender} />
                <Row label="Phone" value={visitor.phone} />
                <Row label="Email" value={visitor.email} />
                <Row label="Tour company" value={visitor.tour_company} />
                <Row label="Vehicle" value={visitor.vehicle_registration} />
                <Row label="Guide" value={visitor.guide_name} />
                <Row
                  label="Party size"
                  value={Number(visitor.num_visitors) > 1 ? visitor.num_visitors : null}
                />
                <Row label="Visits" value={visitor.visit_count} />
                <Row label="Identifier" value={<code style={{ fontSize: "0.8rem" }}>{visitor.id}</code>} />
              </dl>
            </div>
            <div className="col-md-5 d-flex justify-content-center align-items-start">
              <VisitorQrCode value={visitor.id} label="Scan to verify" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
