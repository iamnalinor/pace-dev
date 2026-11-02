import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime, type TestWorld } from "#app/test/runtime.ts";

import { ActivitySheet } from "./activity-sheet.tsx";

describe("the activity sheet", () => {
  it("links an existing block to a task and shows the selected task in its editor", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "study",
      endAt: "2026-10-06T10:00:00.000Z",
      label: "Reading",
      startAt: "2026-10-06T09:00:00.000Z",
    });
    const [activity] = Object.values(runtime.state.store.getState().time.activities);
    const task = Object.values(runtime.state.store.getState().tasks.byId).find(
      (item) => item.title === "Algebra HW 6",
    );
    const onClose = jest.fn();
    await renderScreen(
      <ActivitySheet
        onClose={onClose}
        target={{
          activityId: activity?.id ?? "",
          category: "study",
          endAt: "2026-10-06T10:00:00.000Z",
          kind: "edit",
          label: "Reading",
          startAt: "2026-10-06T09:00:00.000Z",
          taskId: null,
        }}
        zone="Europe/Moscow"
      />,
      runtime,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Task: No task" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Algebra HW 6" }));
    expect(screen.getByRole("button", { name: "Task: Algebra HW 6" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(runtime.state.store.getState().time.activities[activity?.id ?? ""]?.taskId).toBe(
      task?.id,
    );
  });

  it("removes a task link from an existing block", async () => {
    const runtime = await createTestRuntime();
    const task = Object.values(runtime.state.store.getState().tasks.byId).find(
      (item) => item.title === "Algebra HW 6",
    );
    await runtime.actions.logPast({
      category: "study",
      endAt: "2026-10-06T10:00:00.000Z",
      label: "Reading",
      startAt: "2026-10-06T09:00:00.000Z",
      taskId: task?.id,
    });
    const [activity] = Object.values(runtime.state.store.getState().time.activities);
    await renderScreen(
      <ActivitySheet
        onClose={jest.fn()}
        target={{
          activityId: activity?.id ?? "",
          category: "study",
          endAt: "2026-10-06T10:00:00.000Z",
          kind: "edit",
          label: "Reading",
          startAt: "2026-10-06T09:00:00.000Z",
          taskId: task?.id ?? null,
        }}
        zone="Europe/Moscow"
      />,
      runtime,
    );
    expect(screen.getByRole("button", { name: "Task: Algebra HW 6" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Task: Algebra HW 6" }));
    await fireEvent.press(screen.getByRole("radio", { name: "No task" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(runtime.state.store.getState().time.activities[activity?.id ?? ""]?.taskId).toBeNull();
    });
  });

  it("renames a block and closes on save", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "work",
      endAt: "2026-10-06T10:00:00.000Z",
      label: "Team chat",
      startAt: "2026-10-06T09:00:00.000Z",
    });
    const [activity] = Object.values(runtime.state.store.getState().time.activities);
    const onClose = jest.fn();
    await renderScreen(
      <ActivitySheet
        onClose={onClose}
        target={{
          activityId: activity?.id ?? "",
          category: "work",
          endAt: "2026-10-06T10:00:00.000Z",
          kind: "edit",
          label: "Team chat",
          startAt: "2026-10-06T09:00:00.000Z",
        }}
        zone="Europe/Moscow"
      />,
      runtime,
    );
    await fireEvent.changeText(screen.getByLabelText("What"), "Standup");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(runtime.state.store.getState().time.activities[activity?.id ?? ""]).toMatchObject({
      label: "Standup",
    });
  });
});

describe("the log-past sheet", () => {
  it("says under each field what is wrong instead of a toast", async () => {
    const runtime = await createTestRuntime();
    const onClose = jest.fn();
    await renderScreen(
      <ActivitySheet
        onClose={onClose}
        target={{
          endAt: "2026-10-06T10:00:00.000Z",
          kind: "log",
          startAt: "2026-10-06T09:00:00.000Z",
        }}
        zone="Europe/Moscow"
      />,
      runtime,
    );
    await fireEvent.changeText(screen.getByLabelText("What"), "");
    await fireEvent.changeText(screen.getByLabelText("From"), "9999");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Say what it was.")).toBeOnTheScreen();
    expect(screen.getByText("Type a time like 09:30.")).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
  });
});

/** The log-past sheet on a day (the test clock is 6 Oct, 15:00 in Moscow). */
const logSheet = async (day = "2026-10-06") => {
  const runtime = await createTestRuntime();
  const onClose = jest.fn();
  await renderScreen(
    <ActivitySheet
      onClose={onClose}
      target={{
        endAt: `${day}T10:00:00.000Z`,
        kind: "log",
        startAt: `${day}T09:00:00.000Z`,
      }}
      zone="Europe/Moscow"
    />,
    runtime,
  );
  await fireEvent.changeText(screen.getByLabelText("What"), "Nap");
  return { onClose, runtime };
};

describe("the log-past sheet's times", () => {
  it("refuses an end at or well before the start instead of a day-long block", async () => {
    const { onClose } = await logSheet();
    await fireEvent.changeText(screen.getByLabelText("From"), "1000");
    await fireEvent.changeText(screen.getByLabelText("To"), "0930");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("The end must be after the start.")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText("To"), "1000");
    expect(screen.getByText("The end must be after the start.")).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("refuses what is still ahead today", async () => {
    const { onClose } = await logSheet();
    await fireEvent.changeText(screen.getByLabelText("From"), "1600");
    await fireEvent.changeText(screen.getByLabelText("To"), "1700");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findAllByText("That is still ahead: log what already happened."),
    ).toHaveLength(2);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("reads a short evening block that ends after midnight as one night", async () => {
    const { onClose, runtime } = await logSheet("2026-10-05");
    await fireEvent.changeText(screen.getByLabelText("From"), "2300");
    await fireEvent.changeText(screen.getByLabelText("To"), "0100");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    const [nap] = Object.values(runtime.state.store.getState().time.activities);
    expect(Date.parse(nap?.endAt ?? "") - Date.parse(nap?.startAt ?? "")).toBe(2 * 3_600_000);
  });
});

describe("moving a block's end", () => {
  it("refuses an end that runs into the next activity instead of clipping it", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.startActivity(
      { category: "rest", label: "Rest" },
      { at: "2026-10-06T09:00:00.000Z" },
    );
    await runtime.actions.startActivity(
      { category: "chores", label: "Lunch" },
      { at: "2026-10-06T10:00:00.000Z" },
    );
    const rest = Object.values(runtime.state.store.getState().time.activities).find(
      (activity) => activity.label === "Rest",
    );
    const onClose = jest.fn();
    await renderScreen(
      <ActivitySheet
        onClose={onClose}
        target={{
          activityId: rest?.id ?? "",
          category: "rest",
          endAt: "2026-10-06T10:00:00.000Z",
          kind: "edit",
          label: "Rest",
          startAt: "2026-10-06T09:00:00.000Z",
        }}
        zone="Europe/Moscow"
      />,
      runtime,
    );
    await fireEvent.changeText(screen.getByLabelText("To"), "1330");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("That runs into the next activity: move its start first."),
    ).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
  });
});

/**
The Day sheet on a logged 12:00–13:00 Moscow block (times with seconds when asked, as automatic
sleep's are), opened with `label`, and the events a save writes.
*/
const editSheet = async ({
  endAt = "2026-10-06T10:00:00.000Z",
  label = "Team chat",
  startAt = "2026-10-06T09:00:00.000Z",
  stored = label,
  world,
}: {
  startAt?: string;
  endAt?: string;
  label?: string;
  stored?: string;
  /** The test world (its clock frozen at 6 Oct, 15:00 in Moscow unless it says otherwise). */
  world?: TestWorld;
} = {}) => {
  const runtime = await createTestRuntime(world);
  await runtime.actions.logPast({ category: "work", endAt, label: stored, startAt });
  const [activity] = Object.values(runtime.state.store.getState().time.activities);
  const before = runtime.state.store.getState().log.length;
  const onClose = jest.fn();
  await renderScreen(
    <ActivitySheet
      onClose={onClose}
      target={{
        activityId: activity?.id ?? "",
        category: "work",
        endAt,
        kind: "edit",
        label,
        startAt,
      }}
      zone="Europe/Moscow"
    />,
    runtime,
  );
  const saved = async () => {
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    return runtime.state.store.getState().log.slice(before);
  };
  return { activityId: activity?.id ?? "", runtime, saved };
};

describe("what saving an edit sends", () => {
  it("sends no boundary when only the name and category changed", async () => {
    const { saved } = await editSheet();
    await fireEvent.changeText(screen.getByLabelText("What"), "Standup");
    const written = await saved();
    expect(written.map((event) => event.type)).toEqual(["activity.labelled"]);
  });

  it("sends no boundary for times with seconds the sheet shows to the minute", async () => {
    const { saved } = await editSheet({
      endAt: "2026-10-06T10:00:08.004Z",
      startAt: "2026-10-06T09:00:37.512Z",
    });
    await fireEvent.changeText(screen.getByLabelText("What"), "Standup");
    expect((await saved()).map((event) => event.type)).toEqual(["activity.labelled"]);
  });

  it("sends the end alone when only the end of a block with seconds moved", async () => {
    const { activityId, saved } = await editSheet({
      endAt: "2026-10-06T10:00:08.004Z",
      startAt: "2026-10-06T09:00:37.512Z",
    });
    await fireEvent.changeText(screen.getByLabelText("To"), "1330");
    expect((await saved()).map((event) => [event.type, event.payload])).toEqual([
      ["activity.adjusted", { activityId, endAt: "2026-10-06T10:30:00.000Z" }],
    ]);
  });

  it("keeps the stored name when the sheet showed it worded and only the category changed", async () => {
    // Automatic sleep's stored "Sleep" opens worded («Сон» for a Russian reader).
    const { activityId, runtime, saved } = await editSheet({ label: "Сон", stored: "Sleep" });
    await fireEvent.press(screen.getByRole("radio", { name: "Rest" }));
    expect((await saved()).map((event) => event.payload)).toEqual([
      { activityId, category: "rest" },
    ]);
    expect(runtime.state.store.getState().time.activities[activityId]?.label).toBe("Sleep");
  });

  // QA round 17 review I1: the sheet opens on the real boundaries, a day or more apart.
  it.each([
    ["a 13-hour night", "2026-10-04T17:00:00.000Z", "2026-10-05T06:00:00.000Z"],
    ["a 30-hour block", "2026-10-02T17:00:00.000Z", "2026-10-04T04:00:00.000Z"],
  ])("renames %s without moving either end", async (_name, startAt, endAt) => {
    const { activityId, runtime, saved } = await editSheet({ endAt, startAt });
    await fireEvent.changeText(screen.getByLabelText("What"), "Standup");
    expect((await saved()).map((event) => event.type)).toEqual(["activity.labelled"]);
    expect(runtime.state.store.getState().time.activities[activityId]).toMatchObject({
      endAt,
      startAt,
    });
  });

  it("moves the end of a 30-hour block on the day it ends", async () => {
    const { activityId, saved } = await editSheet({
      endAt: "2026-10-04T04:00:00.000Z",
      startAt: "2026-10-02T17:00:00.000Z",
    });
    await fireEvent.changeText(screen.getByLabelText("To"), "0630");
    expect((await saved()).map((event) => [event.type, event.payload])).toEqual([
      ["activity.adjusted", { activityId, endAt: "2026-10-04T03:30:00.000Z" }],
    ]);
  });

  it("sends the end alone when only the end moved, never the start it did not touch", async () => {
    const { activityId, saved } = await editSheet();
    await fireEvent.changeText(screen.getByLabelText("To"), "1330");
    const written = await saved();
    expect(written.map((event) => [event.type, event.payload])).toEqual([
      ["activity.adjusted", { activityId, endAt: "2026-10-06T10:30:00.000Z" }],
    ]);
  });
});

describe("the sheet's day", () => {
  it("names both days of a night, and the one day once the end moves back before midnight", async () => {
    // Saturday 23:25 → Sunday 07:40 in Moscow, opened from Sunday's row (QA round 17 L14, review m7).
    await editSheet({ endAt: "2026-10-04T04:40:00.000Z", startAt: "2026-10-03T20:25:00.000Z" });
    expect(screen.getByText("Sat · Oct 3 – Sun · Oct 4")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText("To"), "2350");
    expect(screen.getByText("Saturday · Oct 3")).toBeOnTheScreen();
  });
});

describe("an end typed before the start's clock (QA round 18 M3)", () => {
  // One rule: a reading of the end counts if it is after the start and on the start's day, or
  // makes a block of at most 12 hours, or adjusts an already longer block on its old end's day.
  // Anything else is refused in the same words, never a silent day-long block, never "still ahead".
  // Each row: the block, the typed To, the world's clock (6 Oct, 15:00 unless set), and the
  // subtitle shown once it reads (null: refused).
  const REVERSED = "The end must be after the start.";
  it.each([
    {
      endAt: "2026-10-04T23:00:00.000Z",
      name: "22:00–02:00 → 21:00",
      startAt: "2026-10-04T19:00:00.000Z",
      subtitle: null,
      to: "2100",
      world: {},
    },
    {
      endAt: "2026-10-04T21:30:00.000Z",
      name: "23:30–00:30 → 23:00",
      startAt: "2026-10-04T20:30:00.000Z",
      subtitle: null,
      to: "2300",
      world: {},
    },
    // QA's (a): yesterday's 08:00–21:00 early the next morning: refused, not "still ahead".
    {
      endAt: "2026-10-05T18:00:00.000Z",
      name: "yesterday 08:00–21:00 → 07:00",
      startAt: "2026-10-05T05:00:00.000Z",
      subtitle: null,
      to: "0700",
      world: { now: "2026-10-06T03:30:00.000Z" },
    },
    {
      endAt: "2026-10-05T18:00:00.000Z",
      name: "yesterday 08:00–21:00 → 07:00 later on",
      startAt: "2026-10-05T05:00:00.000Z",
      subtitle: null,
      to: "0700",
      world: {},
    },
    {
      endAt: "2026-09-29T18:30:00.000Z",
      name: "a week-old 08:00–21:30 → 07:00",
      startAt: "2026-09-29T05:00:00.000Z",
      subtitle: null,
      to: "0700",
      world: {},
    },
    {
      endAt: "2026-10-05T04:00:00.000Z",
      name: "22:00–07:00 → 19:00",
      startAt: "2026-10-04T19:00:00.000Z",
      subtitle: null,
      to: "1900",
      world: {},
    },
    {
      endAt: "2026-10-04T20:00:00.000Z",
      name: "22:00–23:00 → 01:00",
      startAt: "2026-10-04T19:00:00.000Z",
      subtitle: "Sun · Oct 4 – Mon · Oct 5",
      to: "0100",
      world: {},
    },
    {
      endAt: "2026-10-05T04:00:00.000Z",
      name: "22:00–07:00 → 09:00",
      startAt: "2026-10-04T19:00:00.000Z",
      subtitle: "Sun · Oct 4 – Mon · Oct 5",
      to: "0900",
      world: {},
    },
    {
      endAt: "2026-10-04T04:00:00.000Z",
      name: "Fri 20:00 – Sun 07:00 → 08:00",
      startAt: "2026-10-02T17:00:00.000Z",
      subtitle: "Fri · Oct 2 – Sun · Oct 4",
      to: "0800",
      world: {},
    },
  ])("$name", async ({ endAt, startAt, subtitle, to, world }) => {
    const { saved } = await editSheet({ endAt, startAt, world });
    await fireEvent.changeText(screen.getByLabelText("To"), to);
    if (subtitle === null) {
      await fireEvent.press(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByText(REVERSED)).toBeOnTheScreen();
      expect(screen.queryByText("That is still ahead: log what already happened.")).toBeNull();
    } else {
      // The subtitle follows the typed times while typing, before any save.
      expect(screen.getByText(subtitle)).toBeOnTheScreen();
      expect((await saved()).map((event) => event.type)).toEqual(["activity.adjusted"]);
    }
  });
});

describe("a time put on another day (round 6: a runaway block cut back)", () => {
  // Fri 20:00 → Sun 07:00 in Moscow: a timer left running all weekend.
  const runaway = { endAt: "2026-10-04T04:00:00.000Z", startAt: "2026-10-02T17:00:00.000Z" };

  it("cuts a weekend-long block back to Friday evening", async () => {
    const { activityId, saved } = await editSheet(runaway);
    expect(screen.getByText("End day")).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "Ends Sun · Oct 4" })).toBeChecked();
    await fireEvent.press(screen.getByRole("radio", { name: "Ends Fri · Oct 2" }));
    await fireEvent.changeText(screen.getByLabelText("To"), "2300");
    expect(screen.getByRole("radio", { name: "Ends Fri · Oct 2" })).toBeChecked();
    expect(screen.getByText("Friday · Oct 2")).toBeOnTheScreen();
    expect((await saved()).map((event) => [event.type, event.payload])).toEqual([
      ["activity.adjusted", { activityId, endAt: "2026-10-02T20:00:00.000Z" }],
    ]);
  });

  it("refuses an end on the chosen day before the start in the usual words", async () => {
    await editSheet(runaway);
    await fireEvent.press(screen.getByRole("radio", { name: "Ends Fri · Oct 2" }));
    await fireEvent.changeText(screen.getByLabelText("To"), "1900");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("The end must be after the start.")).toBeOnTheScreen();
  });

  it("moves a start to a later day of the block", async () => {
    const { activityId, saved } = await editSheet(runaway);
    await fireEvent.press(screen.getByRole("radio", { name: "Starts Sat · Oct 3" }));
    await fireEvent.changeText(screen.getByLabelText("From"), "2200");
    expect((await saved()).map((event) => [event.type, event.payload])).toEqual([
      ["activity.adjusted", { activityId, startAt: "2026-10-03T19:00:00.000Z" }],
    ]);
  });

  it("keeps a one-day block's days behind a button, then offers the next day for its end", async () => {
    const { activityId, saved } = await editSheet();
    expect(screen.queryByText("End day")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Other days" }));
    expect(screen.getByText("End day")).toBeOnTheScreen();
    expect(screen.queryByText("Start day")).toBeNull();
    await fireEvent.press(screen.getByRole("radio", { name: "Ends Wed · Oct 7" }));
    await fireEvent.changeText(screen.getByLabelText("To"), "0100");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    // The next day's 01:00 is still ahead of the test world's clock (6 Oct, 15:00).
    expect(
      await screen.findByText("That is still ahead: log what already happened."),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("radio", { name: "Ends Tue · Oct 6" }));
    await fireEvent.changeText(screen.getByLabelText("To"), "1400");
    expect((await saved()).map((event) => [event.type, event.payload])).toEqual([
      ["activity.adjusted", { activityId, endAt: "2026-10-06T11:00:00.000Z" }],
    ]);
  });
});

describe("deleting a block", () => {
  it("asks for a second tap, then takes it off the day", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "work",
      endAt: "2026-10-06T10:00:00.000Z",
      label: "Team chat",
      startAt: "2026-10-06T09:00:00.000Z",
    });
    const [activity] = Object.values(runtime.state.store.getState().time.activities);
    const onClose = jest.fn();
    await renderScreen(
      <ActivitySheet
        onClose={onClose}
        target={{
          activityId: activity?.id ?? "",
          category: "work",
          endAt: "2026-10-06T10:00:00.000Z",
          kind: "edit",
          label: "Team chat",
          startAt: "2026-10-06T09:00:00.000Z",
        }}
        zone="Europe/Moscow"
      />,
      runtime,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Delete activity" }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete activity? Tap again" }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(runtime.state.store.getState().time.activities[activity?.id ?? ""]).toBeUndefined();
  });
});
