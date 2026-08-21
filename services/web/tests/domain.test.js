import { describe, expect, it } from "vitest";

import { CATEGORY_CURRENCY, formatMinor } from "../src/domain/categories.js";
import { uuid4 } from "../src/domain/ids.js";

describe("categories and money formatting (build prompt Table 1)", () => {
  it("bills the three foreign categories in USD and EAC in UGX", () => {
    expect(CATEGORY_CURRENCY.FNR).toBe("USD");
    expect(CATEGORY_CURRENCY.FR).toBe("USD");
    expect(CATEGORY_CURRENCY.ROA).toBe("USD");
    expect(CATEGORY_CURRENCY.EAC).toBe("UGX");
  });

  it("formats integer minor units with the right exponent", () => {
    expect(formatMinor(4500, "USD")).toBe("45.00 USD");
    expect(formatMinor(50000, "UGX")).toBe("50000 UGX");
  });
});

describe("station-generated ids (build prompt sections 4.1, 9)", () => {
  it("produces distinct RFC 4122 v4 identifiers", () => {
    const seen = new Set();
    for (let i = 0; i < 1000; i += 1) {
      const id = uuid4();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      seen.add(id);
    }
    expect(seen.size).toBe(1000);
  });
});
