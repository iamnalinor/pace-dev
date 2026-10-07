import { describe, expect, it } from "vitest";

import { endpointList, endpoints } from "./endpoints.ts";

describe("endpoints", () => {
  it("declares every path under /api with a unique method+path", () => {
    const seen = new Set<string>();
    for (const definition of endpointList) {
      expect(definition.path.startsWith("/api/")).toBe(true);
      const key = `${definition.method} ${definition.path}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(endpointList.length).toBeGreaterThan(1);
  });

  it("health is public and answers ok", () => {
    expect(endpoints.health.auth).toBe(false);
    expect(endpoints.health.output.parse({ status: "ok" })).toEqual({ status: "ok" });
    expect(() => endpoints.health.output.parse({ status: "down" })).toThrow();
  });

  it("marks the session endpoints as protected and the login ones as public", () => {
    expect(endpoints.auth.telegram.auth).toBe(false);
    expect(endpoints.auth.nonceCreate.auth).toBe(false);
    expect(endpoints.auth.noncePoll.auth).toBe(false);
    expect(endpoints.auth.dev.auth).toBe(false);
    expect(endpoints.auth.logout.auth).toBe(true);
    expect(endpoints.me.auth).toBe(true);
    expect(endpoints.sync.push.auth).toBe(true);
    expect(endpoints.sync.pull.auth).toBe(true);
    expect(endpoints.sync.observations.auth).toBe(true);
  });

  it("accepts the Telegram Login Widget payload with optional fields", () => {
    const payload = { auth_date: 1_700_000_000, first_name: "Ada", hash: "ab", id: 42 };
    expect(endpoints.auth.telegram.body.parse(payload)).toEqual(payload);
    expect(() => endpoints.auth.telegram.body.parse({ ...payload, id: "42" })).toThrow();
  });

  it("parses the nonce poll output as a discriminated union", () => {
    expect(endpoints.auth.noncePoll.output.parse({ status: "pending" })).toEqual({
      status: "pending",
    });
    expect(() => endpoints.auth.noncePoll.output.parse({ status: "ready" })).toThrow();
  });

  it("coerces the pull cursor from the query string with defaults", () => {
    expect(endpoints.sync.pull.query.parse({})).toEqual({ limit: 200, since: 0 });
    expect(endpoints.sync.pull.query.parse({ limit: "5", since: "12" })).toEqual({
      limit: 5,
      since: 12,
    });
    expect(() => endpoints.sync.pull.query.parse({ limit: "0" })).toThrow();
  });

  it("requires the structural event envelope in a push", () => {
    const event = {
      deviceId: "dev-1",
      id: "01J",
      occurredAt: "2026-10-06T10:00:00.000Z",
      payload: { title: "x" },
      precision: "exact",
      recordedAt: "2026-10-06T10:00:01.000Z",
      source: "app",
      type: "task.created",
    };
    expect(endpoints.sync.push.body.parse({ events: [event] })).toEqual({ events: [event] });
    expect(() =>
      endpoints.sync.push.body.parse({ events: [{ ...event, precision: "fuzzy" }] }),
    ).toThrow();
    expect(() =>
      endpoints.sync.push.body.parse({ events: [{ ...event, occurredAt: "today" }] }),
    ).toThrow();
  });
});
