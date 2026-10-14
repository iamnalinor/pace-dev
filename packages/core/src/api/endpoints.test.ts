import type { z } from "zod";

import { describe, expect, it } from "vitest";

import { endpointList, endpoints } from "./endpoints.ts";

/** Every object schema reachable from `schema` that refuses keys it does not know. */
/** Containers that hold schemas but that `loosen` does not walk into. */
const UNWALKED: ReadonlySet<string> = new Set([
  "catch",
  "intersection",
  "lazy",
  "map",
  "record",
  "set",
  "tuple",
]);

const strictObjectsIn = (schema: z.ZodType, path: string): readonly string[] => {
  const def = schema._zod.def as unknown as Record<string, unknown> & { readonly type: string };
  const inner = (key: string): readonly string[] => {
    const child = def[key] as undefined | z.ZodType;
    return child === undefined ? [] : strictObjectsIn(child, path);
  };
  switch (def.type) {
    case "object": {
      const catchall = def["catchall"] as undefined | z.ZodType;
      const own = catchall?._zod.def.type === "never" ? [path] : [];
      const shape = def["shape"] as Readonly<Record<string, z.ZodType>>;
      return [
        ...own,
        ...Object.entries(shape).flatMap(([key, child]) =>
          strictObjectsIn(child, `${path}.${key}`),
        ),
      ];
    }
    case "array": {
      return strictObjectsIn(def["element"] as z.ZodType, `${path}[]`);
    }
    case "union": {
      return (def["options"] as readonly z.ZodType[]).flatMap((option) =>
        strictObjectsIn(option, path),
      );
    }
    case "pipe": {
      return [...inner("in"), ...inner("out")];
    }
    default: {
      // A container `loosen` does not walk would hide a strict object from both: fail loudly.
      return UNWALKED.has(def.type)
        ? [`${path} (${def.type}: not walked by loosen)`]
        : inner("innerType");
    }
  }
};

const calendarEvent = {
  endAt: "2026-10-06T11:30:00.000Z",
  id: "ev-1",
  series: null,
  startAt: "2026-10-06T10:00:00.000Z",
  title: "Seminar",
};

describe("what the server answers", () => {
  it("never refuses a key a newer server adds: no output schema is strict, at any depth", () => {
    const strict = endpointList.flatMap((definition) =>
      strictObjectsIn(definition.output, `${definition.method} ${definition.path}`),
    );
    expect(strict).toEqual([]);
  });

  it("parses a calendar answer with keys it does not know, dropping them", () => {
    const answer = { events: [{ ...calendarEvent, colour: "#ff0000" }], nextCursor: "abc" };
    expect(endpoints.calendar.list.output.parse(answer)).toEqual({ events: [calendarEvent] });
  });

  it("still refuses a key it does not know in what a phone sends", () => {
    const sync = {
      deviceId: "phone",
      events: [calendarEvent],
      from: "2026-10-05T00:00:00.000Z",
      to: "2026-10-12T00:00:00.000Z",
    };
    expect(endpoints.calendar.sync.body.parse(sync)).toEqual(sync);
    expect(() =>
      endpoints.calendar.sync.body.parse({
        ...sync,
        events: [{ ...calendarEvent, colour: "red" }],
      }),
    ).toThrow();
  });
});

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
    const storeId = "store-a";
    expect(endpoints.sync.push.body.parse({ events: [event], storeId })).toEqual({
      events: [event],
      storeId,
    });
    expect(() => endpoints.sync.push.body.parse({ events: [event] })).toThrow();
    expect(() =>
      endpoints.sync.push.body.parse({ events: [{ ...event, precision: "fuzzy" }], storeId }),
    ).toThrow();
    expect(() =>
      endpoints.sync.push.body.parse({ events: [{ ...event, occurredAt: "today" }], storeId }),
    ).toThrow();
  });
});
