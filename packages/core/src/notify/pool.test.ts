import { describe, expect, it } from "vitest";

import { NOTIFICATION_KINDS } from "../model/notification-channels.ts";
import {
  ALL_ANSWERS,
  ANSWERABLE_KINDS,
  ANSWERS,
  canResolveAs,
  isAnswer,
  isOwnSignIn,
  RESOLUTIONS,
} from "./pool.ts";

describe("the answers", () => {
  it("are the ones some kind has, each once, every one a resolution", () => {
    expect(ALL_ANSWERS).toEqual(["revoked", "attended", "skipped", "still", "stopped"]);
    expect(ALL_ANSWERS.every((answer) => (RESOLUTIONS as readonly string[]).includes(answer))).toBe(
      true,
    );
    for (const kind of NOTIFICATION_KINDS) {
      const answers = ANSWERS[kind];
      for (const answer of answers) {
        expect(canResolveAs(kind, answer)).toBe(true);
      }
    }
  });

  it("tell an answer button from anything else", () => {
    expect(isAnswer("still")).toBe(true);
    expect(isAnswer("read")).toBe(false);
    expect(isAnswer("expo.modules.notifications.actions.DEFAULT")).toBe(false);
  });

  it("let a sign-in be ended as not the person's, and nothing else", () => {
    expect(canResolveAs("login", "revoked")).toBe(true);
    expect(canResolveAs("event_start", "revoked")).toBe(false);
    expect(canResolveAs("activity_overrun", "revoked")).toBe(false);
    expect(isAnswer("revoked")).toBe(true);
    expect(ANSWERABLE_KINDS).toEqual(["login", "event_start", "activity_overrun"]);
  });
});

describe("isOwnSignIn", () => {
  const login = {
    kind: "login" as const,
    payload: { country: "", ip: "", kind: "app", name: "Pixel", sessionId: "s-1" },
  };

  it("is the sign-in notice of that very session, nothing else", () => {
    expect(isOwnSignIn(login, "s-1")).toBe(true);
    expect(isOwnSignIn(login, "s-2")).toBe(false);
    expect(isOwnSignIn(login, undefined)).toBe(false);
    const digest = {
      kind: "deadline_digest" as const,
      payload: { slot: "2026-10-06T06:00:00.000Z", tasks: [] },
    };
    expect(isOwnSignIn(digest, "s-1")).toBe(false);
  });
});
