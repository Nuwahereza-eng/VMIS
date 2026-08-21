import { beforeEach, describe, expect, it } from "vitest";

import { resetDb } from "../src/db/store.js";
import { clearSession, decodeJwt, isExpired, loadSession, saveSession } from "../src/auth/session.js";

// Build an unsigned JWT with the given payload (verification is server-side).
function makeToken(payload) {
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.sig`;
}

beforeEach(async () => {
  await resetDb();
});

describe("session (presentation-only; RBAC is enforced server-side)", () => {
  it("decodes sub/role/station from the token", () => {
    const token = makeToken({ sub: "gate1", role: "gate_officer", station_id: "GATE-A" });
    const claims = decodeJwt(token);
    expect(claims.role).toBe("gate_officer");
    expect(claims.station_id).toBe("GATE-A");
  });

  it("persists and reloads a session across a reload", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = makeToken({ sub: "mgr", role: "management", station_id: null, exp });
    await saveSession(token);
    const loaded = await loadSession();
    expect(loaded.username).toBe("mgr");
    expect(loaded.role).toBe("management");
    expect(isExpired(loaded)).toBe(false);
  });

  it("treats a past-exp token as expired", async () => {
    const exp = Math.floor(Date.now() / 1000) - 10;
    const token = makeToken({ sub: "x", role: "gate_officer", exp });
    const s = await saveSession(token);
    expect(isExpired(s)).toBe(true);
  });

  it("clears the session on sign out", async () => {
    await saveSession(makeToken({ sub: "x", role: "gate_officer", exp: 9999999999 }));
    await clearSession();
    expect(await loadSession()).toBeNull();
  });
});
