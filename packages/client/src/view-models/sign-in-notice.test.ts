import { describe, expect, it } from "vitest";

import type { PoolNotification } from "@pace/core";

import { signInState } from "./sign-in-notice.ts";

const notice = (sessionId: string): PoolNotification => ({
  createdAt: "2026-10-06T08:00:00.000Z",
  id: `n-${sessionId}`,
  kind: "login",
  payload: { country: "DE", ip: "", kind: "web", name: "Chrome on macOS", sessionId },
  readAt: null,
  resolution: null,
  resolvedAt: null,
});

/** The list as fetched at `loadedAt`, holding these session ids; "me" reads the feed. */
const listed = (ids: readonly string[], loadedAt: null | string) => ({
  current: "me",
  ids: new Set(ids),
  loadedAt,
});

describe("a sign-in notice as the feed shows it (QA round 15 L11)", () => {
  it("is this device's own when it is about the session reading it", () => {
    expect(signInState(notice("me"), listed(["me"], "2026-10-06T09:00:00.000Z"))).toBe("own");
  });

  it("is open while its session is listed", () => {
    expect(signInState(notice("s1"), listed(["me", "s1"], "2026-10-06T09:00:00.000Z"))).toBe(
      "open",
    );
  });

  it("is ended when a list fetched well after it no longer holds its session", () => {
    expect(signInState(notice("s1"), listed(["me"], "2026-10-06T09:00:00.000Z"))).toBe("ended");
  });

  it("stays open while the list may predate it: not loaded, or fetched about when it came", () => {
    expect(signInState(notice("s1"), listed(["me"], null))).toBe("open");
    // Fetched a minute after: the device's clock may run ahead of the server's.
    expect(signInState(notice("s1"), listed(["me"], "2026-10-06T08:01:00.000Z"))).toBe("open");
  });

  it("is about something else when it is no sign-in", () => {
    const digest: PoolNotification = {
      createdAt: "2026-10-06T08:00:00.000Z",
      id: "n-d",
      kind: "deadline_digest",
      payload: { slot: "2026-10-06T08:00:00.000Z", tasks: [] },
      readAt: null,
      resolution: null,
      resolvedAt: null,
    };
    expect(signInState(digest, listed([], "2026-10-07T00:00:00.000Z"))).toBe("open");
  });
});
