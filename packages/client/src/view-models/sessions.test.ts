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

/** The part about data an app or an agent sent: after the kind, before when it was added. */
const dataPart = (item: Session, language: "en" | "ru" = "en"): string | undefined =>
  metaOf(item, language).at(-2);

/** The line of an agent whose newest data ended `minutes` before now. */
const agentSent = (minutes: number, language: "en" | "ru" = "en"): string | undefined =>
  dataPart(agent(before(minutes)), language);

describe("the sessions list", () => {
  it("shows recent data as a duration up to and including eight hours", () => {
    expect(LAST_DATA_EXACT_AFTER_HOURS).toBe(8);
    expect(agentSent(7 * 60 + 59)).toBe("Last data 7h 59m ago");
    expect(agentSent(8 * 60)).toBe("Last data 8h ago");
  });

  it("shows older data as the exact time in the account's zone", () => {
    expect(agentSent(8 * 60 + 1)).toBe("Last data Oct 12, 23:10");
    expect(agentSent(8 * 60 + 1, "ru")).toBe("Данные 12 окт., 23:10");
  });

  it("says when an app or an agent has sent nothing yet", () => {
    expect(dataPart(agent(null))).toBe("Nothing sent yet");
    expect(dataPart(session({ kind: "app", name: "Pixel 9a" }), "ru")).toBe(
      "Ещё ничего не прислал",
    );
  });

  it("says nothing about data for a browser or an MCP app", () => {
    expect(metaOf(session())).toEqual(["Browser", "Signed in Oct 1, 13:00"]);
    expect(metaOf(session({ kind: "mcp", lastSeenAt: null, scopes: ["tasks:read"] }))).toEqual([
      "AI app",
      "Added Oct 1, 13:00",
    ]);
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
    // This device's row says where and when it signed in too, as the others do (QA 17 L2).
    expect(rows[0]).toMatchObject({
      isCurrent: true,
      meta: ["Browser", "This device", "Germany", "1.2.3.4", "Signed in Oct 1, 13:00"],
    });
    expect(rows[1]?.isCurrent).toBe(false);
  });

  it("names where a session signed in from: the country in the viewer's language and the address", () => {
    const placed = session({ city: "Berlin", country: "DE", ip: "1.2.3.4" });
    expect(metaOf(placed)).toEqual(["Browser", "Germany", "1.2.3.4", "Signed in Oct 1, 13:00"]);
    expect(metaOf(placed, "ru")).toEqual(["Браузер", "Германия", "1.2.3.4", "Вход 1 окт., 13:00"]);
    expect(metaOf({ ...placed, current: true }, "ru")).toEqual([
      "Браузер",
      "Это устройство",
      "Германия",
      "1.2.3.4",
      "Вход 1 окт., 13:00",
    ]);
    // Cloudflare's "T1" (Tor) is no region: shown as it came.
    expect(metaOf(session({ country: "T1" }))).toContain("T1");
  });

  it("names every row's kind in words and tells same-name rows apart by when they were added", () => {
    // QA round 15 L5 / L15: an icon alone did not say browser, phone, computer or AI app, and two
    // "My computer" rows read the same.
    const rows = sessionRows(
      [
        session({
          createdAt: Date.parse("2026-10-13T01:05:00.000Z"),
          id: "a",
          kind: "agent",
          name: "My computer",
        }),
        session({
          createdAt: Date.parse("2026-10-13T03:40:00.000Z"),
          id: "b",
          kind: "agent",
          name: "My computer",
        }),
        session({ id: "dev", kind: "dev", name: "Dev login" }),
        session({
          createdAt: Date.parse("2025-12-30T10:00:00.000Z"),
          id: "app",
          kind: "app",
          name: "Pixel 9a",
        }),
      ],
      { language: "en", now: NOW, zone: ZONE },
    );
    const meta = Object.fromEntries(rows.map((row) => [row.id, row.meta]));
    expect(meta["a"]).toEqual(["Computer", "Nothing sent yet", "Added Oct 13, 04:05"]);
    expect(meta["b"]).toEqual(["Computer", "Nothing sent yet", "Added Oct 13, 06:40"]);
    expect(meta["dev"]).toEqual(["Developer sign-in", "Signed in Oct 1, 13:00"]);
    expect(meta["app"]).toEqual(["Phone app", "Nothing sent yet", "Signed in Dec 30 2025, 13:00"]);
    const ru = sessionRows([session({ kind: "mcp", name: "Claude" })], {
      language: "ru",
      now: NOW,
      zone: ZONE,
    });
    expect(ru[0]?.meta).toEqual(["ИИ-приложение", "Добавлено 1 окт., 13:00"]);
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
          const text = dataPart(agent(at));
          expect(text?.endsWith(" ago")).toBe(minutes <= limit);
        },
      ),
    );
  });
});
/* eslint-enable sonarjs/no-hardcoded-ip -- the fixture addresses end here */
