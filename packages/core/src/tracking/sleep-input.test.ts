import { describe, expect, it } from "vitest";

import { sleepStartId } from "../ids.ts";
import { at, byPerson, MOSCOW, step, use } from "./sleep-auto.fake.ts";
import { sleepActivitiesOf, sleepInputOf } from "./sleep-input.ts";

const NIGHT = "2026-10-07";
const START = sleepStartId(NIGHT, at("23:40"));

/** The automatic night 23:40–07:10, as the rules wrote it. */
const night = () =>
  step([], { knownUntil: at("07:30"), uses: [use("23:10", "23:40"), use("07:10", "07:25")] }).log;

/** An edit of the night's start or end, by the person unless the server's own. */
const adjusted = (
  payload: { startAt?: string; endAt?: string },
  source: "app" | "system" = "app",
) => ({
  ...byPerson(1, at("08:00"), {
    payload: { activityId: START, ...payload },
    type: "activity.adjusted",
  }),
  source,
});

const flagsOf = (log: ReturnType<typeof night>) => {
  const sleep = sleepActivitiesOf(log).find((activity) => activity.id === START);
  return [sleep?.isStartAmendedByPerson, sleep?.isEndAmendedByPerson];
};

/** The flags after the person's edit of the night (or the server's own). */
const flagsAfter = (payload: { startAt?: string; endAt?: string }, source?: "app" | "system") =>
  flagsOf([...night(), adjusted(payload, source)]);

describe("what automatic sleep reads from the log", () => {
  it("takes the person's edit for a change only of the values it actually changed", () => {
    expect(flagsOf(night())).toEqual([false, false]);
    const [asleep, morning, earlier, later] = [at("23:40"), at("07:10"), at("23:20"), at("07:40")];
    // The edit sheet sent both, but only the end moved: the start is still the rules'.
    expect(flagsAfter({ endAt: later, startAt: asleep })).toEqual([false, true]);
    expect(flagsAfter({ startAt: earlier })).toEqual([true, false]);
    expect(flagsAfter({ endAt: morning })).toEqual([false, false]);
  });

  it("keeps an end the person set when a start recorded later closes the sleep at that instant", () => {
    // Still running; the person ends it at 21:00 the next day, then that night's sleep opens there.
    const running = step([], { knownUntil: at("02:00"), uses: [use("23:10", "23:40")] }).log;
    const nextEvening = at("21:00", { night: "2026-10-08" });
    const ended = {
      ...byPerson(1, at("21:05", { night: "2026-10-08" }), {
        payload: { activityId: START, endAt: nextEvening },
        type: "activity.adjusted",
      }),
    };
    const nextId = sleepStartId("2026-10-08", nextEvening);
    const nextNight = {
      ...byPerson(2, nextEvening, {
        payload: { activityId: nextId, category: "sleep", label: "Sleep" },
        type: "activity.started",
      }),
      id: nextId,
      source: "system" as const,
    };
    expect(flagsOf([...running, ended, nextNight])).toEqual([false, true]);
    // Saved as it already stood when recorded, it changes nothing.
    expect(
      flagsOf([...running, nextNight, { ...ended, id: "01ARZ3NDEKTSV4RRFFQ69G5FZZ" }]),
    ).toEqual([false, false]);
  });

  it("never takes the server's own adjustment for the person's", () => {
    const later = at("07:40");
    expect(flagsAfter({ endAt: later }, "system")).toEqual([false, false]);
  });

  it("carries what is known beside the log as it was given", () => {
    const knowledge = {
      decidedUntil: at("07:00"),
      knownUntil: at("07:30"),
      now: at("07:35"),
      uses: [use("07:10", "07:25")],
      usesFrom: at("12:00"),
      zone: MOSCOW,
    };
    expect(sleepInputOf(night(), knowledge)).toMatchObject({
      ...knowledge,
      personRevokedAutoStarts: [],
      revokedAutoStartIds: [],
    });
  });
});
