import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import type { PoolNotification } from "@pace/core";

import { applyAnswer } from "./pool-answers.ts";

const signIn: PoolNotification = {
  createdAt: "2026-10-06T10:00:00.000Z",
  id: "n-1",
  kind: "login",
  payload: { country: "", ip: "", kind: "dev", name: "Dev login", sessionId: "s-1" },
  readAt: null,
  resolution: null,
  resolvedAt: null,
};

/** A store whose id was not made from a name: it cannot tell whose session to end. */
const nameless = {
  ctx: { id: { name: undefined } } as unknown as DurableObjectState,
  env: { DB: env.DB },
};

describe("applyAnswer", () => {
  it("refuses Not me when the store cannot tell its user, so the notice stays open to press again", async () => {
    // Resolving it anyway would say "Session ended" while nothing ended.
    await expect(applyAnswer(signIn, "revoked", nameless)).rejects.toThrow(/user/u);
  });

  it("has nothing to do for any other answer, whatever the store knows", async () => {
    await expect(applyAnswer(signIn, "read", nameless)).resolves.toBeUndefined();
  });
});
