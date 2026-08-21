import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

// Camera QR scanner (build prompt Table 5: readable by an ordinary camera).
// Mounts a scanner into a div and calls onDecode with the decoded string.
// Rendered only when the officer opts to scan, so the camera is not held open.
export default function QrScanner({ onDecode, onError }) {
  const regionRef = useRef(null);
  const scannerRef = useRef(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const regionId = "qr-region";
    const scanner = new Html5Qrcode(regionId, { verbose: false });
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decoded) => {
          onDecode(decoded);
        },
        () => {
          /* per-frame decode misses are normal; ignore */
        },
      )
      .then(() => {
        if (!cancelled) setStarting(false);
      })
      .catch((err) => {
        if (!cancelled && onError) onError(err);
      });

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        s.stop()
          .then(() => s.clear())
          .catch(() => {
            /* already stopped */
          });
      }
    };
  }, [onDecode, onError]);

  return (
    <div>
      <div id="qr-region" ref={regionRef} style={{ width: "100%", maxWidth: 320 }} />
      {starting && <p className="text-muted small mt-2">Starting camera...</p>}
    </div>
  );
}
