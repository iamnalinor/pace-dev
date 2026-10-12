import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { ActivitySheet } from "./activity-sheet.tsx";

describe("the activity sheet", () => {
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
    await fireEvent.press(screen.getByRole("button", { name: "Delete this block" }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete it? Tap again" }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(runtime.state.store.getState().time.activities[activity?.id ?? ""]).toBeUndefined();
  });
});
