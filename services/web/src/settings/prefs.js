// Locally-persisted reporting preferences (which currency to show revenue
// totals in, and the USD->UGX rate used to convert). Stored in the same
// IndexedDB meta store as the session, so the choice survives reloads and
// works offline. This is a display-only preference; it never affects the
// amounts actually billed or synced.
import { getMeta, setMeta } from "../db/store.js";
import { REPORT_CURRENCIES, USD_TO_UGX } from "../domain/categories.js";

const CURRENCY_KEY = "report_currency";
const RATE_KEY = "usd_to_ugx_rate";

export const DEFAULT_REPORT_PREFS = {
  currency: "UGX",
  usdToUgx: USD_TO_UGX,
};

export async function getReportPrefs() {
  const currency = await getMeta(CURRENCY_KEY);
  const usdToUgx = await getMeta(RATE_KEY);
  return {
    currency: REPORT_CURRENCIES.includes(currency) ? currency : DEFAULT_REPORT_PREFS.currency,
    usdToUgx: Number(usdToUgx) > 0 ? Number(usdToUgx) : DEFAULT_REPORT_PREFS.usdToUgx,
  };
}

export async function setReportPrefs({ currency, usdToUgx }) {
  if (REPORT_CURRENCIES.includes(currency)) await setMeta(CURRENCY_KEY, currency);
  if (Number(usdToUgx) > 0) await setMeta(RATE_KEY, Number(usdToUgx));
}
