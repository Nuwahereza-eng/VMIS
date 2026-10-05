import PageHeader from "../components/PageHeader.jsx";
import {
  PARK_OVERVIEW,
  ANIMALS,
  ATTRACTIONS,
  ACTIVITIES,
  ENTRY_POINTS,
  FERRY,
  ACCOMMODATION,
  KEY_LOCATIONS,
  ROUTES,
  PLAN_TIPS,
} from "../domain/parkInfo.js";

function CardGrid({ items }) {
  return (
    <div className="row g-3">
      {items.map((it) => (
        <div className="col-sm-6 col-lg-4" key={it.name}>
          <div className="data-row h-100 align-items-start">
            <span className="d-flex align-items-start gap-2">
              {it.icon ? <i className={"bi " + it.icon} style={{ color: "var(--vmis-green-600)" }} /> : null}
              <span>
                <span className="d-block fw-semibold" style={{ color: "var(--vmis-ink)" }}>
                  {it.name}
                </span>
                {it.note ? (
                  <span className="muted" style={{ fontSize: "0.85rem" }}>{it.note}</span>
                ) : null}
              </span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({ icon, title, subtitle, children }) {
  return (
    <div className="surface-card p-4 mb-3">
      <div className="card-title-row">
        <i className={"bi " + icon} />
        <h3>{title}</h3>
      </div>
      {subtitle ? (
        <p className="muted" style={{ fontSize: "0.9rem" }}>{subtitle}</p>
      ) : null}
      {children}
    </div>
  );
}

export default function TouristInfoPage() {
  return (
    <>
      <PageHeader
        icon="bi-signpost-2"
        title="Tourist information"
        subtitle="Murchison Falls National Park — what to see, do, and know"
      />

      <div className="surface-card p-4 mb-3">
        <div className="card-title-row">
          <i className="bi bi-tree" />
          <h3>{PARK_OVERVIEW.name}</h3>
        </div>
        <p style={{ color: "var(--vmis-ink)", fontWeight: 500 }}>{PARK_OVERVIEW.tagline}</p>
        <p className="muted">{PARK_OVERVIEW.summary}</p>
        <div className="row g-3 mt-1">
          {PARK_OVERVIEW.facts.map((f) => (
            <div className="col-6 col-md-4 col-xl" key={f.label}>
              <div className="stat-card">
                <div>
                  <div className="stat-card__label">{f.label}</div>
                  <div className="stat-card__value" style={{ fontSize: "1.1rem" }}>{f.value}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Section
        icon="bi-binoculars"
        title="Wildlife to see"
        subtitle="A snapshot of the animals and birds the park is known for."
      >
        <CardGrid items={ANIMALS} />
      </Section>

      <Section
        icon="bi-geo-alt"
        title="Attractions"
        subtitle="The landmark places within and around the park."
      >
        <CardGrid items={ATTRACTIONS} />
      </Section>

      <Section
        icon="bi-compass"
        title="Things to do"
        subtitle="Activities visitors can take part in during their stay."
      >
        <CardGrid items={ACTIVITIES} />
      </Section>

      <Section
        icon="bi-door-open"
        title="Entry points"
        subtitle="The gates covered by the system, with how each is approached."
      >
        <CardGrid items={ENTRY_POINTS} />
        <div className="data-row mt-3 align-items-start">
          <span className="d-flex align-items-start gap-2">
            <i className="bi bi-water" style={{ color: "var(--vmis-green-600)" }} />
            <span>
              <span className="d-block fw-semibold" style={{ color: "var(--vmis-ink)" }}>
                {FERRY.name}
              </span>
              <span className="muted" style={{ fontSize: "0.85rem" }}>{FERRY.note}</span>
            </span>
          </span>
        </div>
      </Section>

      <Section
        icon="bi-house-door"
        title="Accommodation"
        subtitle="Lodges and camps in and around the park."
      >
        <CardGrid items={ACCOMMODATION} />
      </Section>

      <div className="row g-3">
        <div className="col-lg-7">
          <Section
            icon="bi-map"
            title="Key locations"
            subtitle="Orientation points for navigating the park."
          >
            <CardGrid items={KEY_LOCATIONS} />
          </Section>
        </div>
        <div className="col-lg-5">
          <div className="surface-card p-4 mb-3 h-100">
            <div className="card-title-row">
              <i className="bi bi-signpost-split" />
              <h3>Routes within the park</h3>
            </div>
            <ul className="mb-0" style={{ paddingLeft: "1.1rem" }}>
              {ROUTES.map((r) => (
                <li key={r} className="muted" style={{ marginBottom: "0.45rem" }}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="surface-card p-4">
        <div className="card-title-row">
          <i className="bi bi-info-circle" />
          <h3>Plan your visit</h3>
        </div>
        <ul className="mb-0" style={{ paddingLeft: "1.1rem" }}>
          {PLAN_TIPS.map((t) => (
            <li key={t} className="muted" style={{ marginBottom: "0.45rem" }}>{t}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
