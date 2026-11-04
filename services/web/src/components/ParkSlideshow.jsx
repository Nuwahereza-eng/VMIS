import { useEffect, useMemo, useRef, useState } from "react";

import { PARK_SLIDES } from "../domain/parkInfo.js";

const SLIDE_MS = 5000;
// A video that stalls on a slow connection must not hold the slideshow up.
const VIDEO_STALL_MS = SLIDE_MS + 2500;

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// Auto-advancing park photos and 5-second clips. Clips are silent (browsers only
// autoplay muted video), and users on a data-saver connection get photos only.
// Respects reduced-motion by starting paused, and stops while the tab is hidden.
export default function ParkSlideshow() {
  const slides = useMemo(
    () => (navigator.connection?.saveData ? PARK_SLIDES.filter((s) => !s.video) : PARK_SLIDES),
    [],
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(prefersReducedMotion);
  const [hidden, setHidden] = useState(() => document.visibilityState === "hidden");
  const videoRef = useRef(null);

  const slide = slides[index];
  const running = !paused && !hidden;
  const next = () => setIndex((i) => (i + 1) % slides.length);
  const prev = () => setIndex((i) => (i - 1 + slides.length) % slides.length);

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Advance on a timer; a clip normally advances itself when it ends.
  useEffect(() => {
    if (!running) return undefined;
    const id = setTimeout(next, slide.video ? VIDEO_STALL_MS : SLIDE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, running]);

  // Play or pause the current clip. Autoplay can still be refused (e.g. iOS low
  // power mode); the poster then shows and the timer moves on.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    if (running) video.play().catch(() => {});
    else video.pause();
  }, [index, running]);

  // Fetch the next picture early so slides change without a blank frame.
  useEffect(() => {
    const upcoming = slides[(index + 1) % slides.length];
    new Image().src = upcoming.poster || upcoming.image;
  }, [index, slides]);

  return (
    <section className="park-slides" aria-roledescription="carousel" aria-label="Scenes from the park">
      <div className="park-slides__stage" key={index}>
        {slide.video ? (
          <video
            ref={videoRef}
            src={slide.video}
            poster={slide.poster}
            muted
            playsInline
            autoPlay={running}
            preload="auto"
            aria-label={slide.caption}
            onEnded={next}
            onError={() => {
              if (running) next();
            }}
          />
        ) : (
          <img src={slide.image} alt={slide.caption} style={{ objectPosition: slide.focus }} />
        )}
        <div className="park-slides__caption">
          {slide.video && <i className="bi bi-play-circle-fill" aria-hidden="true" />} {slide.caption}
        </div>
        {running && (
          <div className="park-slides__progress" aria-hidden="true">
            <span />
          </div>
        )}
      </div>

      <div className="park-slides__controls">
        <button type="button" onClick={prev} aria-label="Previous slide">
          <i className="bi bi-chevron-left" />
        </button>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Play slideshow" : "Pause slideshow"}
        >
          <i className={"bi " + (paused ? "bi-play-fill" : "bi-pause-fill")} />
        </button>
        <button type="button" onClick={next} aria-label="Next slide">
          <i className="bi bi-chevron-right" />
        </button>
        <span className="park-slides__count">
          {index + 1} / {slides.length}
        </span>
      </div>
    </section>
  );
}
