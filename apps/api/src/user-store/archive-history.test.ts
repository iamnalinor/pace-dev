import { describe, expect, it } from "vitest";

import { memoryArchive } from "../../tests/archive-test-store.ts";
import { createArchiveSet, readHistoryPage } from "./archive-history.ts";

const source = { sourceHighSeq: 0, rawRevision: 0, records: [] };
describe("fixed archive history bounds", () => {
  it.each([
    { after: -1, through: 0, limit: 1 },
    { after: NaN, through: 0, limit: 1 },
    { after: 0.5, through: 0, limit: 1 },
    { after: 0, through: -1, limit: 1 },
    { after: 0, through: NaN, limit: 1 },
    { after: 1, through: 0, limit: 1 },
    { after: 0, through: 0, limit: 501 },
    { after: 0, through: 0, limit: Infinity },
  ])("rejects invalid immutable page bounds %#", async (bounds) => {
    const set = await createArchiveSet({
      owner: "owner",
      storeId: "generation",
      sourceSchemaTag: "test",
      source,
      selected: [],
    });
    expect(
      await readHistoryPage({
        set,
        archive: memoryArchive().store,
        retainedComplement: [],
        ...bounds,
      }),
    ).toEqual({ ok: false, error: "archive/invalid" });
  });
});

it("hashes Unicode raw identities in explicit code-unit order", async () => {
  const records = ["ä", "z"].map((app) => ({
    kind: "usage" as const,
    revision: 0,
    row: {
      deviceId: "d",
      deviceName: "D",
      app,
      startAt: "2026-01-01T00:00:00Z",
      endAt: "2026-01-01T01:00:00Z",
    },
  }));
  const set = await createArchiveSet({
    owner: "owner",
    storeId: "generation",
    sourceSchemaTag: "test",
    source: { sourceHighSeq: 0, rawRevision: 0, records },
    selected: [],
  });
  const bytes = new TextEncoder().encode(JSON.stringify([records[1], records[0]]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const expected = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  expect(set.inventoryHash).toBe(expected);
});
