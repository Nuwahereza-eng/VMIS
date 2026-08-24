import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Renders a scannable QR code as inline SVG. The encoded `value` is the
// visitor identifier, which the Verify screen decodes with `verifyLocal`.
// Generation runs entirely on-device (the qrcode package is bundled), so it
// works with no connection.
export default function VisitorQrCode({ value, size = 168, label }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let alive = true;
    if (!value) {
      setSvg("");
      return;
    }
    QRCode.toString(String(value), {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0f5132", light: "#ffffff" },
    })
      .then((markup) => {
        if (alive) setSvg(markup);
      })
      .catch(() => {
        if (alive) setSvg("");
      });
    return () => {
      alive = false;
    };
  }, [value]);

  if (!value) return null;

  return (
    <div className="qr-code">
      <div
        className="qr-code__frame"
        style={{ width: size, height: size }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {label && <span className="qr-code__caption">{label}</span>}
    </div>
  );
}
