import { useEffect, useRef, useState } from "react";

function motionAllowed() {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return !reduced && !navigator.connection?.saveData;
}

// A silent looping clip that only downloads as it nears the screen and only
// plays while visible, so a page full of them stays kind to mobile data. With
// reduced motion or data-saver on, it stays a still picture.
export default function AutoVideo({ video, poster, label, className }) {
  const ref = useRef(null);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const [allowed] = useState(motionAllowed);

  useEffect(() => {
    const el = ref.current;
    if (!el || !allowed || !("IntersectionObserver" in window)) return undefined;
    const nearby = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          nearby.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    const onScreen = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.25,
    });
    nearby.observe(el);
    onScreen.observe(el);
    return () => {
      nearby.disconnect();
      onScreen.disconnect();
    };
  }, [allowed]);

  // Depends on `near` too: a jump straight to a clip makes it visible before
  // its source is attached, and play() would fail with nothing to retry it.
  useEffect(() => {
    const el = ref.current;
    if (!el || !near) return;
    el.muted = true;
    if (visible) el.play().catch(() => {});
    else el.pause();
  }, [near, visible]);

  if (!allowed) return <img src={poster} alt={label} className={className} loading="lazy" />;

  return (
    <video
      ref={ref}
      src={near ? video : undefined}
      poster={poster}
      className={className}
      aria-label={label}
      muted
      loop
      playsInline
      preload={near ? "auto" : "none"}
    />
  );
}
