import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

// OpenStreetMap via Leaflet (no licensed map provider). Draws plain circle
// markers, so there are no icon images to bundle. Tiles need a connection: if
// they cannot load (offline), the map reports it and the page relies on its
// list instead.
//
// markers: [{ id, latitude, longitude, label, color, radius_m }]  radius_m draws a ring
// path:    [{ latitude, longitude }]
export default function OsmMap({ markers = [], path = [], height = 320, onSelect, fitKey }) {
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const L = useRef(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("leaflet")
      .then((mod) => {
        if (cancelled || !box.current) return;
        L.current = mod.default || mod;
        map.current = L.current.map(box.current, { zoomControl: true, attributionControl: true }).setView([0, 0], 2);
        const tiles = L.current
          .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 18,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          })
          .addTo(map.current);
        let loaded = false;
        tiles.on("tileload", () => {
          loaded = true;
          setUnavailable(false);
        });
        tiles.on("tileerror", () => {
          if (!loaded) setUnavailable(true);
        });
        layer.current = L.current.layerGroup().addTo(map.current);
        draw(true);
      })
      .catch(() => setUnavailable(true));
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw(fit) {
    if (!map.current || !L.current) return;
    const lib = L.current;
    layer.current.clearLayers();
    const bounds = [];
    for (const m of markers) {
      if (m.latitude == null || m.longitude == null) continue;
      const ll = [m.latitude, m.longitude];
      bounds.push(ll);
      if (m.radius_m) {
        lib.circle(ll, { radius: m.radius_m, color: m.color || "#2f9d68", weight: 1, fillOpacity: 0.08 }).addTo(layer.current);
      }
      const dot = lib
        .circleMarker(ll, { radius: m.size || 7, color: "#fff", weight: 2, fillColor: m.color || "#15633f", fillOpacity: 1 })
        .addTo(layer.current);
      if (m.label) dot.bindTooltip(m.label);
      if (onSelect) dot.on("click", () => onSelect(m.id));
    }
    if (path.length > 1) {
      const line = path.map((p) => [p.latitude, p.longitude]);
      lib.polyline(line, { color: "#c98a1f", weight: 3 }).addTo(layer.current);
      bounds.push(...line);
    }
    if (fit && bounds.length) {
      map.current.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
    }
  }

  useEffect(() => {
    draw(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  useEffect(() => {
    draw(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, path]);

  return (
    <div className="osm-map" style={{ height }}>
      <div ref={box} className="osm-map__canvas" />
      {unavailable && (
        <div className="osm-map__offline">
          <i className="bi bi-wifi-off" /> Map unavailable offline. The list below still works.
        </div>
      )}
    </div>
  );
}
