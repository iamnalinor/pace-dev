import { describe, expect, it } from "vitest";

import { NOTIFICATION_KINDS } from "../model/notification-channels.ts";
import { ALL_ANSWERS, ANSWERS, canResolveAs, isAnswer, RESOLUTIONS } from "./pool.ts";

describe("the answers", () => {
  it("are the ones some kind has, each once, every one a resolution", () => {
    expect(ALL_ANSWERS).toEqual(["attended", "skipped", "still", "stopped"]);
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
});
