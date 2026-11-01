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

  it("reads the instants the person recorded as ones they were awake, and where their starts close", () => {
    const started = byPerson(1, at("22:00"), {
      payload: { activityId: "work", category: "work", label: "Deploy" },
      type: "activity.started",
    });
    const alongside = byPerson(2, at("22:10"), {
      payload: { activityId: "music", alongside: true, category: "rest", label: "Music" },
      type: "activity.started",
    });
    const stopped = byPerson(3, at("23:50"), {
      payload: { activityId: "work" },
      type: "activity.stopped",
    });
    const logged = byPerson(4, at("08:00"), {
      payload: {
        activityId: "read",
        category: "study",
        endAt: at("01:30"),
        label: "Read",
        startAt: at("01:00"),
      },
      type: "activity.logged",
    });
    const moved = byPerson(5, at("08:05"), {
      payload: { activityId: "work", startAt: at("21:45") },
      type: "activity.adjusted",
    });
    // Recorded and then deleted: not an instant they were awake.
    const deleted = byPerson(6, at("02:00"), {
      payload: { activityId: "oops", category: "work", label: "Oops" },
      type: "activity.started",
    });
    const undone = byPerson(7, at("02:01"), {
      payload: { targetId: deleted.id },
      type: "event.revoked",
    });
    const log = [...night(), started, alongside, stopped, logged, moved, deleted, undone];
    const knowledge = {
      decidedUntil: null,
      knownUntil: at("07:30"),
      now: at("08:10"),
      uses: [],
      usesFrom: at("12:00"),
      zone: MOSCOW,
    };
    const input = sleepInputOf(log, knowledge);
    // The rules' own start and stop are not the person's; a rest of theirs (the music) bounds
    // sleep by the rest rules instead.
    expect(input.personMarks).toEqual(
      ["21:45", "22:00", "23:50", "01:00", "01:30"].map((hhmm) => at(hhmm)),
    );
    expect(input.mainStarts).toEqual([at("22:00")]);
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
      mainStarts: [],
      personMarks: [],
      personRevokedAutoStarts: [],
      revokedAutoStartIds: [],
    });
  });
});
