import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { HW_ID, HW_VIEW_NOW, TRK_ID } from "@pace/core/testing";

import { TaskScreen } from "./task-screen.tsx";

const HOUR_AGO = "2026-10-07T08:50:00.000Z";

const openSubmit = async (now = HW_VIEW_NOW) => {
  const runtime = await createTestRuntime({ now });
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
    expect(preview("outcome")).toHaveTextContent(`${en("close.recordsAs")}${en("outcome.done")}`);
    expect(screen.queryByRole("radio", { name: en("quickTime.at-deadline") })).toBeNull();
  });
});

describe("CloseSheet — submitting subtasks", () => {
  it("offers the quick times and previews the outcome", async () => {
    await openSubmit();
    expect(screen.getByRole("header", { name: "Submit 3 and 4" })).toBeOnTheScreen();
    expect(
      screen.getByText(en("close.subtitleSolved", { title: "Algebra HW 6" })),
    ).toBeOnTheScreen();
    for (const key of ["now", "hour-ago", "yesterday-evening"] as const) {
      expect(screen.getByRole("radio", { name: en(`quickTime.${key}`) })).toBeOnTheScreen();
    }
    // Due tonight: closing "at the deadline" would be refused as the future, so it is not offered.
    expect(screen.queryByRole("radio", { name: en("quickTime.at-deadline") })).toBeNull();
    expect(preview("outcome")).toHaveTextContent(en("close.submittedBeforeDeadline"), {
      exact: false,
    });
    expect(preview("open")).toHaveTextContent("5, 6, 7a Bonus", { exact: false });
    expect(preview("recorded")).toHaveTextContent("12:50", { exact: false });
    expect(screen.queryByText("12:50 · happened 12:50")).toBeNull();
    await fireEvent.press(screen.getByRole("radio", { name: en("quickTime.hour-ago") }));
    expect(preview("recorded")).toHaveTextContent("12:50 · happened 11:50", { exact: false });
  });

  it("shows only recorded time when the chosen instant is in the same minute", async () => {
    await openSubmit("2026-10-07T09:50:37.000Z");
    await fireEvent.press(screen.getByRole("radio", { name: en("close.pickExact") }));
    await fireEvent.changeText(screen.getByLabelText(en("close.time")), "12:50");
    expect(preview("recorded")).toHaveTextContent("12:50", { exact: false });
    expect(screen.queryByText("12:50 · happened 12:50")).toBeNull();

    // The same clock reading on an earlier day is still a different instant, and says its day.
    await fireEvent.changeText(screen.getByLabelText(en("close.date")), "2026-10-06");
    expect(preview("recorded")).toHaveTextContent("12:50 · happened yesterday 12:50", {
      exact: false,
    });
  });

  it("submits an hour ago as an approximate time", async () => {
    const runtime = await openSubmit();
    await fireEvent.press(screen.getByRole("radio", { name: en("quickTime.hour-ago") }));
    // Both choices in sight as chips, not a switch to decode.
    expect(screen.getByRole("radio", { checked: true, name: en("close.exact") })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("radio", { name: en("close.approx") }));
    // Leaving is the dim (or the cross on a wide window), not a Back button.
    expect(screen.queryByRole("button", { name: en("common.back") })).toBeNull();
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

  it("says why a typed time cannot be taken, before Submit is pressed: ahead of now, before the task", async () => {
    // The sheet and the write read one rule: Submit is never enabled for a time it would refuse.
    await openSubmit();
    await fireEvent.press(screen.getByRole("radio", { name: en("close.pickExact") }));
    const submit = () => screen.getByRole("button", { name: en("close.submit") });
    await fireEvent.changeText(screen.getByLabelText(en("close.time")), "20:00");
    expect(screen.getByText(en("actionError.retro/future"))).toBeOnTheScreen();
    expect(submit()).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText(en("close.date")), "2026-10-04");
    expect(screen.getByText(en("actionError.retro/before-created"))).toBeOnTheScreen();
    expect(submit()).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText(en("close.date")), "2026-10-06");
    expect(screen.queryByText(en("actionError.retro/before-created"))).toBeNull();
    expect(submit()).toBeEnabled();
  });

  it("closes the task as skipped with a reason instead", async () => {
    const runtime = await openSubmit();
    // The outcome is one choice in sight: Submit, Cancelled, Skipped (QA 19 M2, QA 20 L6).
    const outcome = screen.getByLabelText(en("close.outcome"));
    expect(within(outcome).getByRole("radio", { name: en("close.submit") })).toBeChecked();
    await fireEvent.press(within(outcome).getByRole("radio", { name: en("close.skipped") }));
    expect(within(outcome).getByRole("radio", { name: en("close.skipped") })).toBeChecked();
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

/** The tracker's close sheet, the day after its deadline. */
const openTrk = async () => {
  const runtime = await createTestRuntime({ deviceTz: "UTC", now: "2026-10-10T10:00:00.000Z" });
  await renderScreen(<TaskScreen id={TRK_ID} openClose />, runtime);
  return runtime;
};

const outcomeGroup = () => screen.getByLabelText(en("close.outcome"));

describe("CloseSheet — the outcome and the time, one choice each (QA round 20)", () => {
  it("switches between Done, Cancelled and Skipped, and back to Done (L6)", async () => {
    await openTrk();
    await fireEvent.press(
      within(outcomeGroup()).getByRole("radio", { name: en("close.cancelled") }),
    );
    expect(screen.getByLabelText(en("close.reason"))).toBeOnTheScreen();
    await fireEvent.press(within(outcomeGroup()).getByRole("radio", { name: en("outcome.done") }));
    expect(screen.queryByLabelText(en("close.reason"))).toBeNull();
    expect(screen.getByRole("button", { name: en("common.done") })).toBeOnTheScreen();
  });

  it("is one tab stop per choice; the arrows move inside it (L7)", async () => {
    await openTrk();
    const tabStops = () =>
      within(outcomeGroup())
        .getAllByRole("radio")
        .map((radio) => radio.props["tabIndex"] as number);
    expect(tabStops()).toEqual([0, -1, -1]);
    await fireEvent(outcomeGroup(), "keyDown", { key: "ArrowRight" });
    expect(
      within(outcomeGroup()).getByRole("radio", { name: en("close.cancelled") }),
    ).toBeChecked();
    expect(tabStops()).toEqual([-1, 0, -1]);
    await fireEvent(outcomeGroup(), "keyDown", { key: "ArrowLeft" });
    await fireEvent(outcomeGroup(), "keyDown", { key: "ArrowLeft" });
    expect(within(outcomeGroup()).getByRole("radio", { name: en("close.skipped") })).toBeChecked();
    const when = screen.getByLabelText(en("close.whenClosed"));
    expect(
      within(when)
        .getAllByRole("radio")
        .filter((radio) => radio.props["tabIndex"] === 0),
    ).toHaveLength(1);
  });

  it("offers a typed time the write takes, even in the task's first minute (L4)", async () => {
    const now = "2026-10-10T10:00:37.000Z";
    const runtime = await createTestRuntime({ deviceTz: "UTC", now });
    const result = await runtime.actions.createTask({ presetId: "personal", title: "Call mom" });
    const [created] = result.ok ? result.value : [];
    const taskId = created?.type === "task.created" ? created.payload.taskId : "";
    await renderScreen(<TaskScreen id={taskId} openClose />, runtime);
    await fireEvent.press(screen.getByRole("radio", { name: en("close.pickExact") }));
    expect(screen.queryByText(en("actionError.retro/before-created"))).toBeNull();
    expect(screen.getByRole("button", { name: en("common.done") })).toBeEnabled();
  });

  it("names the day of a time that is not today, and calls its chip Pick a time (L5)", async () => {
    await openTrk();
    expect(screen.getByRole("radio", { name: en("close.pickExact") })).toHaveTextContent(
      en("close.pickExact"),
    );
    await fireEvent.press(screen.getByRole("radio", { name: en("quickTime.yesterday-evening") }));
    expect(preview("recorded")).toHaveTextContent("happened yesterday", { exact: false });
  });
});
