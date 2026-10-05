import { Link } from "react-router-dom";

import TouristInfoPage from "./TouristInfoPage.jsx";
import { HERO_IMAGE } from "../domain/parkInfo.js";

// The public landing: explore the park freely, then a clear call to create an
// account and book. The information itself is the same content officers and
// management see on /park-info, so there is a single source of truth.
export default function PublicParkInfoPage() {
  return (
    <>
      <div
        className="public-hero public-hero--photo"
        style={{
          backgroundImage:
            `linear-gradient(135deg, rgba(21,99,63,0.82), rgba(12,74,44,0.82)), url(${HERO_IMAGE})`,
        }}
      >
        <div>
          <h1>Plan your visit to Murchison Falls</h1>
          <p>
            Explore the park's wildlife, attractions, activities and entry
            points. When you're ready, create a free account to book your visit.
          </p>
          <div className="public-hero__actions">
            <Link to="/signup" className="btn btn-success">
              <i className="bi bi-calendar-plus" /> Create account &amp; book
            </Link>
            <Link to="/login" className="btn btn-outline-light">
              <i className="bi bi-box-arrow-in-right" /> I already have an account
            </Link>
          </div>
        </div>
      </div>

      <TouristInfoPage />

      <div className="surface-card p-4 text-center">
        <h3 className="mb-2" style={{ color: "var(--vmis-ink)" }}>
          Ready to visit?
        </h3>
        <p className="muted mb-3">
          Create a free account to reserve your entry, choose your gate and
          manage your bookings.
        </p>
        <Link to="/signup" className="btn btn-success">
          <i className="bi bi-calendar-plus" /> Sign up to book
        </Link>
      </div>
    </>
  );
}
