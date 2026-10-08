import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { ActivitySheet } from "./activity-sheet.tsx";

describe("the activity sheet", () => {
  it("marks a focus block as one where messaging was the point", async () => {
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
    await fireEvent(screen.getByLabelText("Messaging was part of it"), "valueChange", true);
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(runtime.state.store.getState().time.activities[activity?.id ?? ""]).toMatchObject({
      messengersOnPurpose: true,
    });
  });
});
