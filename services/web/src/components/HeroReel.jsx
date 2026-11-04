import { useEffect, useRef, useState } from "react";

import { HERO_CLIPS_TALL, HERO_CLIPS_WIDE } from "../domain/landing.js";

const CLIP_MS = 5000;
const STALL_MS = CLIP_MS + 2500;

// Full-screen background reel: one silent clip at a time, 5 seconds each. It
// stops when scrolled away or the tab is hidden, starts paused for reduced
// motion, and shows still frames on a data-saver connection.
export default function HeroReel() {
  const [clips] = useState(() =>
    window.matchMedia?.("(max-width: 767.98px)").matches ? HERO_CLIPS_TALL : HERO_CLIPS_WIDE,
  );
  const [stills] = useState(() => Boolean(navigator.connection?.saveData));
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  const [offscreen, setOffscreen] = useState(false);
  const [hidden, setHidden] = useState(() => document.visibilityState === "hidden");
  const rootRef = useRef(null);
  const videoRef = useRef(null);

  const running = !paused && !offscreen && !hidden;
  const clip = clips[index];
  const next = () => setIndex((i) => (i + 1) % clips.length);

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    let observer;
    if (rootRef.current && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(([e]) => setOffscreen(!e.isIntersecting), { threshold: 0.1 });
      observer.observe(rootRef.current);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!running) return undefined;
    const id = setTimeout(next, stills ? CLIP_MS : STALL_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, running, stills]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    if (running) video.play().catch(() => {});
    else video.pause();
  }, [index, running]);

  // Fetch the next poster early so clips change without a blank frame.
  useEffect(() => {
    new Image().src = clips[(index + 1) % clips.length].poster;
  }, [index, clips]);

  return (
    <div className="hero-reel" ref={rootRef}>
      <div className="hero-reel__stage" key={index}>
        {stills ? (
          <img src={clip.poster} alt="" style={{ objectPosition: clip.focus }} />
        ) : (
          <video
            ref={videoRef}
            src={clip.video}
            poster={clip.poster}
            style={{ objectPosition: clip.focus }}
            muted
            playsInline
            autoPlay={running}
            preload="auto"
            aria-hidden="true"
            onEnded={next}
            onError={() => {
              if (running) next();
            }}
          />
        )}
      </div>
      <button
        type="button"
        className="hero-reel__toggle"
        onClick={() => setPaused((p) => !p)}
        aria-label={paused ? "Play background video" : "Pause background video"}
      >
        <i className={"bi " + (paused ? "bi-play-fill" : "bi-pause-fill")} />
      </button>
    </div>
  );
}
