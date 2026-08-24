// Visitor fee categories and their billing currency (build prompt Table 1).
// The three foreign categories pay in USD; East African Citizens pay in UGX.
// Money is always integer minor units; this table gives the exponent so the
// UI can format an amount without ever using floats in storage.

export const CATEGORIES = [
  { code: "FNR", label: "Foreign Non-Resident", currency: "USD" },
  { code: "FR", label: "Foreign Resident", currency: "USD" },
  { code: "ROA", label: "Rest of Africa", currency: "USD" },
  { code: "EAC", label: "East African Citizen", currency: "UGX" },
];

export const CATEGORY_CURRENCY = Object.fromEntries(
  CATEGORIES.map((c) => [c.code, c.currency]),
);

export const CURRENCY_MINOR_EXPONENT = { USD: 2, UGX: 0 };

// Single editable reporting exchange rate. Revenue is billed in either USD
// (foreign categories) or UGX (EAC); to show one uniform total we convert
// everything to UGX. Update this one constant when the rate changes.
export const USD_TO_UGX = 3800;

// Convert an integer minor-unit amount from one currency to another using the
// reporting rate above. Result is rounded to whole minor units of `to`.
export function convertMinor(amountMinor, from, to) {
  if (!amountMinor) return 0;
  if (from === to) return amountMinor;
  const fromExp = CURRENCY_MINOR_EXPONENT[from] ?? 2;
  const toExp = CURRENCY_MINOR_EXPONENT[to] ?? 2;
  const major = amountMinor / 10 ** fromExp;
  // Rate expressed as UGX per 1 USD; go via UGX as the pivot.
  const ugxPerUnit = { USD: USD_TO_UGX, UGX: 1 };
  const majorUgx = major * (ugxPerUnit[from] ?? 1);
  const majorTo = to === "UGX" ? majorUgx : majorUgx / (ugxPerUnit[to] ?? 1);
  return Math.round(majorTo * 10 ** toExp);
}

// Sum a list of { amount_minor, currency } into a single target currency.
export function sumMinorIn(rows, to) {
  return (rows || []).reduce(
    (total, r) => total + convertMinor(r.amount_minor, r.currency, to),
    0,
  );
}

// Format integer minor units for display only. Never used for storage or math.
export function formatMinor(amountMinor, currency) {
  const exp = CURRENCY_MINOR_EXPONENT[currency] ?? 2;
  const major = amountMinor / 10 ** exp;
  return `${major.toFixed(exp)} ${currency}`;
}
