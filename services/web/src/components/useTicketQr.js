import { useEffect, useState } from "react";
import QRCode from "qrcode";

// A PNG data URL of a ticket code's QR, generated in the browser from the
// server-issued code (no personal data in it). Null while rendering or absent.
export default function useTicketQr(ticketCode, width = 320) {
  const [qrUrl, setQrUrl] = useState(null);

  useEffect(() => {
    let active = true;
    if (!ticketCode) {
      setQrUrl(null);
      return undefined;
    }
    QRCode.toDataURL(ticketCode, { width, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => {
        if (active) setQrUrl(url);
      })
      .catch(() => {
        if (active) setQrUrl(null);
      });
    return () => {
      active = false;
    };
  }, [ticketCode, width]);

  return qrUrl;
}
