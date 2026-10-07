import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { HW_ID, HW_VIEW_NOW, TRK_ID } from "@pace/core/testing";

import { TaskScreen } from "./task-screen.tsx";

const HOUR_AGO = "2026-10-07T08:50:00.000Z";

const openSubmit = async () => {
  const runtime = await createTestRuntime({ now: HW_VIEW_NOW });
  await renderScreen(<TaskScreen id={HW_ID} openClose />, runtime);
  return runtime;
};

const preview = (label: string) => screen.getByTestId(`preview-${label}`);

describe("CloseSheet — submitting problems", () => {
  it("offers the quick times and previews the outcome", async () => {
    await openSubmit();
    expect(screen.getByRole("header", { name: "Submit 3 and 4" })).toBeOnTheScreen();
    expect(
      screen.getByText(en("close.subtitleSolved", { title: "Algebra HW 6" })),
    ).toBeOnTheScreen();
    for (const key of ["now", "hour-ago", "yesterday-evening", "at-deadline"] as const) {
      expect(screen.getByRole("button", { name: en(`quickTime.${key}`) })).toBeOnTheScreen();
    }
    expect(preview("outcome")).toHaveTextContent(en("close.beforeDeadline"));
    expect(preview("open")).toHaveTextContent("5, 6, 7a Bonus");
    expect(preview("recorded")).toHaveTextContent("12:50 · happened 12:50");
    await fireEvent.press(screen.getByRole("button", { name: en("quickTime.hour-ago") }));
    expect(preview("recorded")).toHaveTextContent("12:50 · happened 11:50");
  });

  it("submits an hour ago as an approximate time", async () => {
    const runtime = await openSubmit();
    await fireEvent.press(screen.getByRole("button", { name: en("quickTime.hour-ago") }));
    await fireEvent(screen.getByRole("switch", { name: en("close.exact") }), "valueChange", false);
    await fireEvent.press(screen.getByRole("button", { name: en("close.submit") }));
    await waitFor(() => {
      expect(screen.getByText("Algebra HW 6 · 2 sent")).toBeOnTheScreen();
    });
    const sent = runtime.state.store.getState().log.at(-1);
    expect(sent).toMatchObject({
      occurredAt: HOUR_AGO,
      payload: { subtaskIds: ["s3", "s4"], taskId: HW_ID },
      precision: "approx",
      type: "task.submitted",
    });
  });

  it("takes an exact time typed in the device zone and refuses a malformed one", async () => {
    await openSubmit();
    await fireEvent.press(screen.getByRole("button", { name: en("close.pickExact") }));
    expect(screen.getByText(en("edit.inZone", { zone: "Europe/Moscow" }))).toBeOnTheScreen();
    const time = screen.getByLabelText(en("close.time"));
    await fireEvent.changeText(time, "25:00");
    expect(screen.getByText(en("close.timeInvalid"))).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: en("close.submit") })).toBeDisabled();
    await fireEvent.changeText(time, "10:15");
    expect(preview("recorded")).toHaveTextContent("12:50 · happened 10:15");
  });

  it("closes the task as skipped with a reason instead", async () => {
    const runtime = await openSubmit();
    await fireEvent.press(screen.getByRole("button", { name: en("close.other") }));
    await fireEvent.press(screen.getByRole("button", { name: en("close.skipped") }));
    await fireEvent.changeText(screen.getByLabelText(en("close.reason")), "course dropped");
    await fireEvent.press(
      screen.getByRole("button", { name: en("close.confirm", { outcome: en("close.skipped") }) }),
    );
    await waitFor(() => {
      expect(runtime.state.store.getState().tasks.byId[HW_ID]?.closed).toMatchObject({
        outcome: "skipped",
        reason: "course dropped",
      });
    });
  });
});

describe("CloseSheet — closing a whole task", () => {
  it("previews a late close after the due and closes as done", async () => {
    const runtime = await createTestRuntime({ deviceTz: "UTC", now: "2026-10-10T10:00:00.000Z" });
    await renderScreen(<TaskScreen id={TRK_ID} openClose />, runtime);
    expect(screen.getByRole("header", { name: en("close.closeTitle") })).toBeOnTheScreen();
    expect(preview("outcome")).toHaveTextContent(en("close.late"));
    await fireEvent.press(screen.getByRole("button", { name: en("quickTime.at-deadline") }));
    expect(preview("outcome")).toHaveTextContent(en("close.beforeDeadline"));
    await fireEvent.press(screen.getByRole("button", { name: en("common.done") }));
    await waitFor(() => {
      expect(runtime.state.store.getState().tasks.byId[TRK_ID]?.closed?.outcome).toBe("done");
    });
  });
});
