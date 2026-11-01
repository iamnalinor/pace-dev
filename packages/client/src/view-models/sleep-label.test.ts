import { describe, expect, it } from "vitest";

import { AUTO_SLEEP_LABEL, type Event, sleepStartId } from "@pace/core";
import { artboardEvents, at, ctx, MOSCOW, NOW } from "@pace/core/testing";

import { setupActions } from "../actions/fixture.fake.ts";
import { dayModel } from "./day.ts";
import { historyViewModel } from "./history.ts";
import { timeBarModel } from "./time-bar.ts";
import { weekModel } from "./week.ts";

const SLEPT_AT = "2026-10-06T10:00:00.000Z";
const AUTO = sleepStartId("2026-10-05", SLEPT_AT);

/** The server's automatic sleep, still running, in an account read in `language`. */
const world = async (language: "en" | "ru", label = AUTO_SLEEP_LABEL) => {
  const sleep: Event = {
    ...at(990, SLEPT_AT, {
      payload: { activityId: AUTO, category: "sleep", label },
      type: "activity.started",
    }),
    deviceId: "server",
    id: AUTO,
    source: "system",
  };
  const settings = at(991, "2026-10-01T09:00:00.000Z", {
    payload: { language },
    type: "settings.updated",
  });
  return (await setupActions([...artboardEvents(), settings, sleep])).state.store.getState();
};

/** Every place an activity's label reaches the screen, for the automatic sleep. */
const labelsIn = async (language: "en" | "ru", label?: string) => {
  const state = await world(language, label);
  const day = dayModel(state, null, ctx(NOW));
  const row = day.entries.find(
    (entry) => entry.kind === "activity" && entry.row.activityId === AUTO,
  );
  const week = weekModel(state, null, ctx(NOW));
  const block = week.days.flatMap((each) => each.blocks).find((each) => each.id.startsWith(AUTO));
  const history = historyViewModel(state, { atIso: NOW, deviceTz: MOSCOW });
  return {
    bar: timeBarModel(state, ctx(NOW)).running?.label,
    day: row?.kind === "activity" ? row.row.label : undefined,
    edit: row?.target.kind === "edit" ? row.target.label : undefined,
    history: history.events.find((entry) => entry.id === AUTO)?.taskTitle,
    week: block?.label,
  };
};

describe("automatic sleep's label on screen (class 42)", () => {
  it("reads in the person's language wherever it shows", async () => {
    expect(await labelsIn("ru")).toEqual({
      bar: "Сон",
      day: "Сон",
      edit: "Сон",
      history: "Сон",
      week: "Сон",
    });
    expect(await labelsIn("en")).toMatchObject({ bar: "Sleep", day: "Sleep", history: "Sleep" });
  });

  it("shows a name the person gave it as they typed it", async () => {
    expect((await labelsIn("ru", "Тихий час")).bar).toBe("Тихий час");
  });
});
