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

// Format integer minor units for display only. Never used for storage or math.
export function formatMinor(amountMinor, currency) {
  const exp = CURRENCY_MINOR_EXPONENT[currency] ?? 2;
  const major = amountMinor / 10 ** exp;
  return `${major.toFixed(exp)} ${currency}`;
}
