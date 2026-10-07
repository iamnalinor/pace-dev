import { describe, expect, it } from "vitest";

import {
  grantedScopes,
  OAUTH_SCOPES,
  OAuthCompleteBodySchema,
  OAuthGrantSchema,
  requestedScopes,
} from "./oauth.ts";

describe("requestedScopes", () => {
  it("offers every scope when the client asked for none", () => {
    expect(requestedScopes([])).toEqual(OAUTH_SCOPES);
  });

  it("keeps the client's order and drops scopes Pace does not know", () => {
    expect(requestedScopes(["tasks:write", "profile", "tasks:read", "tasks:write"])).toEqual([
      "tasks:write",
      "tasks:read",
    ]);
  });
});

describe("grantedScopes", () => {
  it("accepts a subset of what was requested", () => {
    expect(grantedScopes(["tasks:read", "tasks:write"], ["tasks:read"])).toEqual({
      ok: true,
      value: ["tasks:read"],
    });
  });

  it("rejects a scope the client did not request", () => {
    expect(grantedScopes(["tasks:read"], ["tasks:read", "tasks:write"])).toEqual({
      ok: false,
      error: "oauth/scope-not-requested",
    });
  });

  it("rejects an empty choice: a grant must allow something", () => {
    expect(grantedScopes(["tasks:read"], [])).toEqual({ ok: false, error: "oauth/no-scopes" });
  });

  it("deduplicates the chosen scopes", () => {
    expect(grantedScopes(["tasks:read"], ["tasks:read", "tasks:read"])).toEqual({
      ok: true,
      value: ["tasks:read"],
    });
  });
});

describe("OAuth contract schemas", () => {
  it("accepts a consent completion with either a widget payload or a dev id", () => {
    const base = { authQuery: "client_id=x&redirect_uri=https%3A%2F%2Fa.test", scopes: [] };
    expect(OAuthCompleteBodySchema.safeParse({ ...base, devTelegramId: "1001" }).success).toBe(
      true,
    );
    expect(
      OAuthCompleteBodySchema.safeParse({
        ...base,
        telegram: { auth_date: 1, first_name: "A", hash: "ab", id: 1 },
      }).success,
    ).toBe(true);
    expect(OAuthCompleteBodySchema.safeParse({ ...base, scopes: ["admin"] }).success).toBe(false);
  });

  it("describes a grant with ISO timestamps", () => {
    const grant = {
      id: "g1",
      clientId: "c1",
      clientName: "Claude",
      logoUri: null,
      scopes: ["tasks:read"],
      createdAt: "2026-10-07T10:00:00.000Z",
      expiresAt: null,
    };
    expect(OAuthGrantSchema.parse(grant)).toEqual(grant);
  });
});
