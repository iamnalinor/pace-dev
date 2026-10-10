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

describe("CloseSheet — a task without a deadline", () => {
  it("previews plain Done, no deadline words or pill", async () => {
    const runtime = await createTestRuntime({ now: HW_VIEW_NOW });
    const result = await runtime.actions.createTask({ presetId: "personal", title: "Call mom" });
    const [created] = result.ok ? result.value : [];
    const taskId = created?.type === "task.created" ? created.payload.taskId : "";
    await renderScreen(<TaskScreen id={taskId} openClose />, runtime);
    expect(preview("outcome")).toHaveTextContent(`${en("close.outcome")}${en("outcome.done")}`);
    expect(screen.queryByRole("radio", { name: en("quickTime.at-deadline") })).toBeNull();
  });
});

describe("CloseSheet — submitting problems", () => {
  it("offers the quick times and previews the outcome", async () => {
    await openSubmit();
    expect(screen.getByRole("header", { name: "Submit 3 and 4" })).toBeOnTheScreen();
    expect(
      screen.getByText(en("close.subtitleSolved", { title: "Algebra HW 6" })),
    ).toBeOnTheScreen();
    for (const key of ["now", "hour-ago", "yesterday-evening", "at-deadline"] as const) {
      expect(screen.getByRole("radio", { name: en(`quickTime.${key}`) })).toBeOnTheScreen();
    }
    expect(preview("outcome")).toHaveTextContent(en("close.beforeDeadline"), { exact: false });
    expect(preview("open")).toHaveTextContent("5, 6, 7a Bonus", { exact: false });
    expect(preview("recorded")).toHaveTextContent("12:50 · happened 12:50", { exact: false });
    await fireEvent.press(screen.getByRole("radio", { name: en("quickTime.hour-ago") }));
    expect(preview("recorded")).toHaveTextContent("12:50 · happened 11:50", { exact: false });
  });

  it("submits an hour ago as an approximate time", async () => {
    const runtime = await openSubmit();
    await fireEvent.press(screen.getByRole("radio", { name: en("quickTime.hour-ago") }));
    await fireEvent(screen.getByRole("switch", { name: en("close.exact") }), "valueChange", false);
    await fireEvent.press(screen.getByRole("button", { name: en("close.submit") }));
    await waitFor(() => {
      expect(runtime.state.store.getState().log.at(-1)?.type).toBe("task.submitted");
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
    await fireEvent.press(screen.getByRole("radio", { name: en("close.pickExact") }));
    expect(screen.getByText(en("edit.inZone", { zone: "Europe/Moscow" }))).toBeOnTheScreen();
    const time = screen.getByLabelText(en("close.time"));
    await fireEvent.changeText(time, "25:00");
    expect(screen.getByText(en("close.timeInvalid"))).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: en("close.submit") })).toBeDisabled();
    await fireEvent.changeText(time, "10:15");
    expect(preview("recorded")).toHaveTextContent("12:50 · happened 10:15", { exact: false });
  });

  it("closes the task as skipped with a reason instead", async () => {
    const runtime = await openSubmit();
    await fireEvent.press(screen.getByRole("button", { name: en("close.other") }));
    await fireEvent.press(screen.getByRole("radio", { name: en("close.skipped") }));
    await fireEvent.changeText(screen.getByLabelText(en("close.reason")), "course dropped");
    const confirm = en("close.confirm", { outcome: en("close.skipped") });
    await fireEvent.press(screen.getByRole("button", { name: confirm }));
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
    expect(preview("outcome")).toHaveTextContent(en("close.late"), { exact: false });
    await fireEvent.press(screen.getByRole("radio", { name: en("quickTime.at-deadline") }));
    expect(preview("outcome")).toHaveTextContent(en("close.beforeDeadline"), { exact: false });
    await fireEvent.press(screen.getByRole("button", { name: en("common.done") }));
    await waitFor(() => {
      expect(runtime.state.store.getState().tasks.byId[TRK_ID]?.closed?.outcome).toBe("done");
    });
  });
});
