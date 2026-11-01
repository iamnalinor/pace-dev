import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Session } from "@pace/core";

import { LAST_DATA_EXACT_AFTER_HOURS, sessionRows } from "./sessions.ts";

/* eslint-disable sonarjs/no-hardcoded-ip -- the address Cloudflare reports is these tests' fixture */
const ZONE = "Europe/Moscow";
/** 07:11 on Oct 13 in Moscow. */
const NOW = "2026-10-13T04:11:00.000Z";
const MINUTE = 60_000;

const before = (minutes: number): string =>
  new Date(Date.parse(NOW) - minutes * MINUTE).toISOString();

const session = (overrides: Partial<Session> = {}): Session => ({
  city: null,
  country: null,
  createdAt: Date.parse("2026-10-01T10:00:00.000Z"),
  current: false,
  id: "01SESSION",
  ip: null,
  kind: "browser",
  lastDataAt: null,
  lastSeenAt: Date.parse("2026-10-12T10:00:00.000Z"),
  name: "Chrome on macOS",
  ...overrides,
});

const agent = (lastDataAt: null | string): Session =>
  session({ id: "01AGENT", kind: "agent", lastDataAt, name: "Linux Mint" });

const metaOf = (item: Session, language: "en" | "ru" = "en"): readonly string[] =>
  sessionRows([item], { language, now: NOW, zone: ZONE })[0]?.meta ?? [];

/** The line of an agent whose newest data ended `minutes` before now. */
const agentSent = (minutes: number, language: "en" | "ru" = "en"): readonly string[] =>
  metaOf(agent(before(minutes)), language);

describe("the sessions list", () => {
  it("shows recent data as a duration up to and including eight hours", () => {
    expect(LAST_DATA_EXACT_AFTER_HOURS).toBe(8);
    expect(agentSent(7 * 60 + 59)).toEqual(["Last data 7h 59m ago"]);
    expect(agentSent(8 * 60)).toEqual(["Last data 8h ago"]);
  });

  it("shows older data as the exact time in the account's zone", () => {
    expect(agentSent(8 * 60 + 1)).toEqual(["Last data Oct 12, 23:10"]);
    expect(agentSent(8 * 60 + 1, "ru")).toEqual(["Данные 12 окт., 23:10"]);
  });

  it("says when an app or an agent has sent nothing yet", () => {
    expect(metaOf(agent(null))).toEqual(["Nothing sent yet"]);
    expect(metaOf(session({ kind: "app", name: "Pixel 9a" }), "ru")).toEqual([
      "Ещё ничего не прислал",
    ]);
  });

  it("says nothing about data for a browser or an MCP app", () => {
    expect(metaOf(session())).toEqual([]);
    expect(metaOf(session({ kind: "mcp", lastSeenAt: null, scopes: ["tasks:read"] }))).toEqual([]);
  });

  it("puts the current session first as this device, then the most recently seen", () => {
    const rows = sessionRows(
      [
        session({ id: "old", lastSeenAt: Date.parse("2026-10-10T10:00:00.000Z") }),
        session({ id: "mcp", kind: "mcp", lastSeenAt: null, name: "Claude" }),
        session({ id: "new", lastSeenAt: Date.parse("2026-10-12T10:00:00.000Z") }),
        session({
          country: "DE",
          current: true,
          id: "me",
          ip: "1.2.3.4",
          lastSeenAt: Date.parse("2026-10-01T10:00:00.000Z"),
        }),
      ],
      { language: "en", now: NOW, zone: ZONE },
    );
    expect(rows.map((row) => row.id)).toEqual(["me", "new", "old", "mcp"]);
    expect(rows[0]).toMatchObject({ isCurrent: true, meta: ["This device"] });
    expect(rows[1]?.isCurrent).toBe(false);
  });

  it("names where a session signed in from: the country in the viewer's language and the address", () => {
    const placed = session({ city: "Berlin", country: "DE", ip: "1.2.3.4" });
    expect(metaOf(placed)).toEqual(["Germany", "1.2.3.4"]);
    expect(metaOf(placed, "ru")).toEqual(["Германия", "1.2.3.4"]);
    expect(metaOf({ ...placed, current: true }, "ru")).toEqual(["Это устройство"]);
    // Cloudflare's "T1" (Tor) is no region: shown as it came.
    expect(metaOf(session({ country: "T1" }))).toEqual(["T1"]);
  });

  it("disconnects an agent and revokes everything else", () => {
    const rows = sessionRows(
      [
        agent(null),
        session({ id: "app", kind: "app" }),
        session({ id: "mcp", kind: "mcp" }),
        session({ id: "dev", kind: "dev" }),
      ],
      { language: "en", now: NOW, zone: ZONE },
    );
    expect(Object.fromEntries(rows.map((row) => [row.id, row.action]))).toEqual({
      "01AGENT": "disconnect",
      app: "revoke",
      dev: "revoke",
      mcp: "revoke",
    });
    expect(rows.find((row) => row.id === "01AGENT")).toMatchObject({
      kind: "agent",
      name: "Linux Mint",
    });
  });

  it("switches from the duration to the exact time right after eight hours, whatever the seconds", () => {
    const limit = LAST_DATA_EXACT_AFTER_HOURS * 60;
    fc.assert(
      fc.property(
        fc.integer({ max: 3 * limit, min: 1 }),
        fc.integer({ max: 59, min: 0 }),
        (minutes, seconds) => {
          const at = new Date(Date.parse(before(minutes)) - seconds * 1000).toISOString();
          const [text] = metaOf(agent(at));
          expect(text?.endsWith(" ago")).toBe(minutes <= limit);
        },
      ),
    );
  });
});
/* eslint-enable sonarjs/no-hardcoded-ip -- the fixture addresses end here */
