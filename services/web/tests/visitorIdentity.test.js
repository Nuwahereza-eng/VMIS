import { beforeEach, describe, expect, it } from "vitest";

import { resetDb } from "../src/db/store.js";
import {
  findLocalVisitor,
  hasPendingVisitorUpdate,
  registerVisitor,
  updateVisitor,
} from "../src/data/repository.js";
import { visitorCode } from "../src/domain/ids.js";
import { classifyScan, visitorQrPayload } from "../src/domain/qr.js";
import { pending } from "../src/sync/queue.js";

const VISITOR = {
  full_name: "Synthetic Visitor",
  id_number: "SYN-9001",
  nationality: "Testland",
  category: "FNR",
  privacy_notice_accepted: true,
};

beforeEach(async () => {
  await resetDb();
});

describe("classifyScan", () => {
  const id = "ccf8bd45-0609-4a96-bbe4-5a14ade91d44";

  it("reads the canonical visitor QR and older bare-id QRs", () => {
    expect(classifyScan(visitorQrPayload(id))).toEqual({ kind: "visitor", id });
    expect(classifyScan(id.toUpperCase())).toEqual({ kind: "visitor", id });
  });

  it("recognises short codes, booking tickets and free text", () => {
    expect(classifyScan("vm-ccf8bd45")).toEqual({ kind: "code", code: "VM-CCF8BD45" });
    expect(classifyScan(" mf-abc123 ")).toEqual({ kind: "ticket", code: "MF-ABC123" });
    expect(classifyScan("SYN-9001")).toEqual({ kind: "text", text: "SYN-9001" });
  });
});

describe("editing a visitor", () => {
  it("updates the local copy and queues only the changed fields", async () => {
    const rec = await registerVisitor(VISITOR, "GATE-A");
    const { visitor, changed } = await updateVisitor(rec, {
      ...VISITOR,
      phone: "+256700000001",
      email: " new@example.com ",
    });

    expect(visitor.phone).toBe("+256700000001");
    expect(visitor.email).toBe("new@example.com");
    expect(changed.sort()).toEqual(["email", "phone"]);

    const ops = (await pending()).filter((op) => op.entity_type === "visitor_update");
    expect(ops).toHaveLength(1);
    expect(ops[0].entity_id).toBe(rec.id);
    expect(ops[0].payload).toEqual({ phone: "+256700000001", email: "new@example.com" });
    expect(await hasPendingVisitorUpdate(rec.id)).toBe(true);
  });

  it("queues nothing when nothing changed", async () => {
    const rec = await registerVisitor(VISITOR, "GATE-A");
    const { changed } = await updateVisitor(rec, { ...VISITOR });
    expect(changed).toEqual([]);
    expect((await pending()).some((op) => op.entity_type === "visitor_update")).toBe(false);
  });

  it("can edit a visitor that only exists on the server", async () => {
    const serverOnly = { id: "0b5a3c1e-1111-4222-8333-444455556666", ...VISITOR };
    const { visitor } = await updateVisitor(serverOnly, { phone: "123" });
    expect(visitor.phone).toBe("123");
    expect(await findLocalVisitor({ kind: "visitor", id: serverOnly.id })).toMatchObject({ phone: "123" });
  });
});

describe("findLocalVisitor", () => {
  it("finds a visitor by QR id, short code or ID number", async () => {
    const rec = await registerVisitor(VISITOR, "GATE-A");
    expect((await findLocalVisitor({ kind: "visitor", id: rec.id })).id).toBe(rec.id);
    expect((await findLocalVisitor({ kind: "code", code: visitorCode(rec.id) })).id).toBe(rec.id);
    expect((await findLocalVisitor({ kind: "text", text: "syn-9001" })).id).toBe(rec.id);
    expect(await findLocalVisitor({ kind: "text", text: "nobody" })).toBeNull();
  });
});
