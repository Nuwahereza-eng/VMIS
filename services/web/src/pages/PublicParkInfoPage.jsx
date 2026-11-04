import { Link } from "react-router-dom";

import AutoVideo from "../components/AutoVideo.jsx";
import HeroReel from "../components/HeroReel.jsx";
import PhotoCredits from "../components/PhotoCredits.jsx";
import {
  CTA_IMAGE,
  FALLS_PHOTOS,
  RANGERS_CLIP,
  RIBBON_PHOTOS,
  STATS,
  STEPS,
  WILD_TILES,
} from "../domain/landing.js";
import { ACTIVITIES } from "../domain/parkInfo.js";

// The public landing: pictures and motion first, few words. The full detail is
// one click away in the park guide (/guide).
export default function PublicParkInfoPage() {
  return (
    <div className="landing">
      <section className="landing-hero">
        <HeroReel />
        <div className="landing-hero__content">
          <h1>Murchison Falls</h1>
          <p>Where the Nile explodes through the rocks.</p>
          <div className="landing-hero__actions">
            <Link to="/signup" className="btn btn-success btn-lg">
              Book your visit
            </Link>
            <a href="#wild" className="btn btn-outline-light btn-lg">
              <i className="bi bi-arrow-down" /> See the wild
            </a>
          </div>
        </div>
      </section>

      <section className="landing-stats" aria-label="The park in numbers">
        {STATS.map((s) => (
          <div key={s.label}>
            <div className="landing-stats__value">{s.value}</div>
            <div className="landing-stats__label">{s.label}</div>
          </div>
        ))}
      </section>

      <section className="landing-section landing-section--dark" id="wild">
        <h2>Meet the wild</h2>
        <div className="wild-wall">
          {WILD_TILES.map((t) => (
            <figure key={t.label} className={`wild-tile wild-tile--${t.size}`}>
              {t.video ? (
                <AutoVideo video={t.video} poster={t.poster} label={t.label} />
              ) : (
                <img src={t.image} alt={t.label} loading="lazy" style={{ objectPosition: t.focus }} />
              )}
              <figcaption>{t.label}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <div className="photo-ribbon" aria-hidden="true">
        <div className="photo-ribbon__track">
          {[...RIBBON_PHOTOS, ...RIBBON_PHOTOS].map((src, i) => (
            <img key={`${src}-${i}`} src={src} alt="" />
          ))}
        </div>
      </div>

      <section className="landing-section">
        <h2>The falls</h2>
        <p className="landing-section__lede">A 7-metre gap. A 43-metre drop.</p>
        <div className="falls-grid">
          {FALLS_PHOTOS.map((p) => (
            <img key={p.image} src={p.image} alt={p.alt} loading="lazy" />
          ))}
        </div>
      </section>

      <section className="landing-section landing-section--tint">
        <h2>Things to do</h2>
        <div className="do-scroller">
          {ACTIVITIES.map((a) => (
            <figure key={a.name} className="do-card">
              <img src={a.image} alt="" loading="lazy" />
              <figcaption>{a.name}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="landing-rangers">
        <AutoVideo video={RANGERS_CLIP.video} poster={RANGERS_CLIP.poster} label="Park rangers" />
        <div>
          <h2>Guarded by rangers</h2>
          <p>Uganda Wildlife Authority rangers protect the park and its wildlife.</p>
        </div>
      </section>

      <section className="landing-section">
        <h2>Three steps to the gate</h2>
        <ol className="landing-steps">
          {STEPS.map((s) => (
            <li key={s.title}>
              <i className={"bi " + s.icon} aria-hidden="true" />
              <span>{s.title}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-cta" style={{ backgroundImage: `url(${CTA_IMAGE})` }}>
        <h2>See it for yourself</h2>
        <Link to="/signup" className="btn btn-success btn-lg">
          Book your visit
        </Link>
        <Link to="/guide" className="landing-cta__link">
          Read the full park guide
        </Link>
      </section>

      <div className="landing-credits">
        <PhotoCredits />
      </div>
    </div>
  );
}
