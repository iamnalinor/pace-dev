import { describe, expect, it } from "vitest";

import type { Activity, ActivityCategory, CoreState } from "@pace/core";

import { artboardState, ctx, HW_ID, MOSCOW, NOW } from "@pace/core/testing";

import { dayModel, trackedDates } from "./day.ts";

type Spec = {
  readonly id: string;
  readonly label: string;
  readonly category: ActivityCategory;
  readonly startAt: string;
  readonly endAt: null | string;
  readonly expect?: null | number;
  readonly isAlongside?: boolean;
};

const activity = ({
  category,
  endAt,
  expect = null,
  id,
  isAlongside = false,
  label,
  startAt,
}: Spec): Activity => ({
  buttonId: null,
  category,
  endAt,
  expectMinutes: expect,
  id,
  isAlongside,
  isLogged: endAt !== null,
  label,
  originEventId: `e-${id}`,
  startAt,
  stillAt: null,
  taskId: null,
});

const withActivities = (activities: readonly Activity[]): CoreState => {
  const base = artboardState();
  return {
    ...base,
    time: { ...base.time, activities: Object.fromEntries(activities.map((a) => [a.id, a])) },
  };
};

const minutesBefore = (minutes: number): string =>
  new Date(Date.parse(NOW) - minutes * 60_000).toISOString();

describe("dayModel rows", () => {
  it("carries the Expect, shows what ran alongside, and hides a label that only repeats the category", () => {
    const state = withActivities([
      activity({
        category: "food",
        endAt: minutesBefore(100),
        expect: 30,
        id: "a1",
        label: "Food",
        startAt: minutesBefore(120),
      }),
      activity({
        category: "food",
        endAt: minutesBefore(80),
        id: "a2",
        label: "Еда",
        startAt: minutesBefore(90),
      }),
      activity({
        category: "sport",
        endAt: null,
        expect: 90,
        id: "a3",
        label: "Gym",
        startAt: minutesBefore(60),
      }),
      activity({
        category: "rest",
        endAt: null,
        id: "a4",
        isAlongside: true,
        label: "Music",
        startAt: minutesBefore(50),
      }),
    ]);
    const rows = dayModel(state, null, ctx()).entries.flatMap((entry) =>
      entry.kind === "activity" ? [entry.row] : [],
    );
    expect(
      rows.map((row) => [row.label, row.showsLabel, row.expectMinutes, row.isAlongside]),
    ).toEqual([
      ["Food", false, 30, false],
      ["Еда", false, null, false],
      ["Gym", true, 90, false],
      ["Music", true, null, true],
    ]);
  });
});

/** A finished block on a task (or on no task), labelled so; `order` sets it apart in time. */
const onTask = (id: string, label: string, taskId: null | string): Activity => {
  const order = Number(id.slice(1));
  const block = activity({
    category: "task",
    endAt: minutesBefore(30),
    id,
    label,
    startAt: minutesBefore(60 + order),
  });
  return { ...block, taskId };
};

/** Each block's label and its link to its task, as Day shows them. */
const linksOf = (activities: readonly Activity[]) =>
  dayModel(withActivities(activities), null, ctx()).entries.flatMap((entry) =>
    entry.kind === "activity" ? [[entry.row.label, entry.row.taskLink]] : [],
  );

describe("dayModel edit targets (QA round 17 L14)", () => {
  // A night from Monday 23:25 to Tuesday 07:40, Moscow: Tuesday shows it from 00:00.
  const night = activity({
    category: "sleep",
    endAt: "2026-10-06T04:40:00.000Z",
    id: "n1",
    label: "Sleep",
    startAt: "2026-10-05T20:25:00.000Z",
  });

  it("opens an overnight block with its real start and end, while the row shows the day's part", () => {
    const entry = dayModel(withActivities([night]), null, ctx()).entries.find(
      (item) => item.kind === "activity",
    );
    expect(entry?.kind === "activity" ? entry.row.startAt : null).toBe("2026-10-05T21:00:00.000Z");
    expect(entry?.target).toMatchObject({
      endAt: "2026-10-06T04:40:00.000Z",
      kind: "edit",
      startAt: "2026-10-05T20:25:00.000Z",
    });
  });

  it("opens the evening part on the day before with the real end, not midnight", () => {
    const monday = "2026-10-05T12:00:00.000Z";
    const entry = dayModel(withActivities([night]), monday, ctx()).entries.find(
      (item) => item.kind === "activity",
    );
    expect(entry?.target).toMatchObject({
      endAt: "2026-10-06T04:40:00.000Z",
      startAt: "2026-10-05T20:25:00.000Z",
    });
  });
});

describe("dayModel task links", () => {
  it("says Open task when the label is the task's title, and names the task when it is not", () => {
    const title = artboardState().tasks.byId[HW_ID]?.title ?? "";
    expect(
      linksOf([
        onTask("a1", title, HW_ID),
        onTask("a2", "Reading for it", HW_ID),
        onTask("a3", "No task", null),
        onTask("a4", "A task gone since", "01GONE0000000000000000000"),
      ]),
    ).toEqual([
      ["A task gone since", null],
      ["No task", null],
      ["Reading for it", { id: HW_ID, text: { title } }],
      [title, { id: HW_ID, text: { key: "day.openTask" } }],
    ]);
  });

  it("reads a label cut to 80 characters as the long title it came from", () => {
    const base = artboardState();
    const long = `${"Подготовить доклад ".repeat(6)}к семинару`;
    const task = base.tasks.byId[HW_ID];
    const state = withActivities([onTask("a1", long.slice(0, 80).trim(), HW_ID)]);
    const withLongTitle: CoreState = {
      ...state,
      tasks: {
        ...state.tasks,
        byId: {
          ...state.tasks.byId,
          [HW_ID]: { ...(task ?? Object.values(base.tasks.byId)[0]), title: long },
        },
      },
    } as CoreState;
    const entry = dayModel(withLongTitle, null, ctx()).entries.find(
      (one) => one.kind === "activity",
    );
    expect(entry?.kind === "activity" && entry.row.taskLink).toEqual({
      id: HW_ID,
      text: { key: "day.openTask" },
    });
  });
});

describe("trackedDates", () => {
  it("lists the days with time on them, on the account's calendar", () => {
    const state = withActivities([
      activity({
        category: "other",
        endAt: "2026-10-03T23:30:00.000Z",
        id: "a1",
        label: "Night",
        startAt: "2026-10-03T22:30:00.000Z",
      }),
      activity({
        category: "food",
        endAt: "2026-10-05T10:30:00.000Z",
        id: "a2",
        label: "Lunch",
        startAt: "2026-10-05T10:00:00.000Z",
      }),
    ]);
    expect(
      [...trackedDates(state, { ...ctx(), deviceTz: MOSCOW })].toSorted((a, b) =>
        a.localeCompare(b),
      ),
    ).toEqual(["2026-10-04", "2026-10-05"]);
  });
});
