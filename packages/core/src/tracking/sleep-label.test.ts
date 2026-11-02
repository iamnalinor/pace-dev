import { describe, expect, it } from "vitest";

import { sleepStartId } from "../ids.ts";
import { at } from "./sleep-auto.fake.ts";
import { AUTO_SLEEP_LABEL, shownLabel } from "./sleep-label.ts";

const AUTO = sleepStartId("2026-10-07", at("23:40"));

describe("an activity's label on screen", () => {
  it("words automatic sleep's stored label in the reader's language", () => {
    expect(shownLabel({ id: AUTO, label: AUTO_SLEEP_LABEL }, "ru")).toBe("Сон");
    expect(shownLabel({ id: AUTO, label: AUTO_SLEEP_LABEL }, "en")).toBe("Sleep");
  });

  it("never rewrites what a person typed, nor a sleep they renamed", () => {
    expect(shownLabel({ id: "a-1", label: "Sleep" }, "ru")).toBe("Sleep");
    expect(shownLabel({ id: AUTO, label: "Nap on the train" }, "ru")).toBe("Nap on the train");
  });
});
