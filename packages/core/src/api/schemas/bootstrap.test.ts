import { describe, expect, it } from "vitest";

import { endpoints } from "../endpoints.ts";
import { LiveServerMessageSchema, parseLiveClientMessage } from "../live-protocol.ts";
import { SyncPullOutputSchema, SyncPullQuerySchema } from "./sync.ts";

describe("checkpoint sync contracts", () => {
  it("exposes an explicit source fallback and strict sequenced bootstrap", () => {
    expect(
      endpoints.sync.bootstrap.output.safeParse({ kind: "source", storeId: "store" }).success,
    ).toBe(true);
    expect(
      endpoints.sync.bootstrap.output.safeParse({
        kind: "checkpoint",
        storeId: "store",
        checkpointJson: "{}",
        checkpointSha256: "a".repeat(64),
        throughSeq: 3,
        records: [{ seq: 3, event: {} }],
        seq: 3,
        more: false,
      }).success,
    ).toBe(false);
  });
  it("keeps pinned history and ordinary enhanced pull negotiation", () => {
    expect(
      SyncPullQuerySchema.parse({
        since: "0",
        storeId: "store",
        through: "3",
        checkpointVersion: "1",
      }),
    ).toMatchObject({ storeId: "store", through: 3, checkpointVersion: 1 });
    expect(
      SyncPullOutputSchema.safeParse({
        events: [],
        records: [{ seq: 1, event: {} }],
        seq: 1,
        more: false,
        storeId: "store",
      }).success,
    ).toBe(false);
  });
  it("accepts additive socket negotiation and refuses invalid enhanced records", () => {
    expect(
      parseLiveClientMessage(
        JSON.stringify({ type: "pull", id: "p", since: 0, checkpointVersion: 1 }),
      ).ok,
    ).toBe(true);
    expect(
      LiveServerMessageSchema.safeParse({
        type: "events",
        since: 0,
        events: [],
        records: [{ seq: 1, event: {} }],
        seq: 1,
        more: false,
        storeId: "store",
      }).success,
    ).toBe(false);
  });
});
