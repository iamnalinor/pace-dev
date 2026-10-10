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
