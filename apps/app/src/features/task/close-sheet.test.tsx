import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { HW_ID, HW_VIEW_NOW, TRK_ID } from "@pace/core/testing";

import { TaskScreen } from "./task-screen.tsx";

/** The task screen with its close sheet open, from the footer's "Done at another time". */
const renderClosing = async (
  taskId: string,
  runtime: Awaited<ReturnType<typeof createTestRuntime>>,
): Promise<void> => {
  await renderScreen(<TaskScreen id={taskId} />, runtime);
  await fireEvent.press(screen.getByRole("button", { name: en("task.doneOther") }));
};

const HOUR_AGO = "2026-10-07T08:50:00.000Z";

const openClose = async (now = HW_VIEW_NOW) => {
  const runtime = await createTestRuntime({ now });
  await renderClosing(HW_ID, runtime);
  return runtime;
};

const preview = (label: string) => screen.getByTestId(`preview-${label}`);

describe("CloseSheet — a task without a deadline", () => {
  it("previews plain Done, no deadline words or pill", async () => {
    const runtime = await createTestRuntime({ now: HW_VIEW_NOW });
    const result = await runtime.actions.createTask({ presetId: "personal", title: "Call mom" });
    const [created] = result.ok ? result.value : [];
    const taskId = created?.type === "task.created" ? created.payload.taskId : "";
    await renderClosing(taskId, runtime);
    expect(preview("outcome")).toHaveTextContent(`${en("close.recordsAs")}${en("outcome.done")}`);
    expect(screen.queryByRole("radio", { name: en("quickTime.at-deadline") })).toBeNull();
  });
});

describe("CloseSheet — a homework task (one done mark per subtask, nothing to send)", () => {
  it("offers the quick times and previews the outcome", async () => {
    await openClose();
    expect(screen.getByRole("header", { name: en("close.closeTitle") })).toBeOnTheScreen();
    expect(screen.getByText("Algebra HW 6")).toBeOnTheScreen();
    expect(screen.queryByText(/Submit|Сдать/u)).toBeNull();
    for (const key of ["now", "hour-ago", "yesterday-evening"] as const) {
      expect(screen.getByRole("radio", { name: en(`quickTime.${key}`) })).toBeOnTheScreen();
    }
    // Due tonight: closing "at the deadline" would be refused as the future, so it is not offered.
    expect(screen.queryByRole("radio", { name: en("quickTime.at-deadline") })).toBeNull();
    // Every done subtask was done before the deadline: so is the task.
    expect(preview("outcome")).toHaveTextContent(en("close.beforeDeadline"), { exact: false });
    expect(screen.queryByTestId("preview-open")).toBeNull();
    expect(preview("recorded")).toHaveTextContent("12:50", { exact: false });
    expect(screen.queryByText("12:50 · happened 12:50")).toBeNull();
    await fireEvent.press(screen.getByRole("radio", { name: en("quickTime.hour-ago") }));
    expect(preview("recorded")).toHaveTextContent("12:50 · happened 11:50", { exact: false });
  });

  it("shows only recorded time when the chosen instant is in the same minute", async () => {
    await openClose("2026-10-07T09:50:37.000Z");
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

  it("closes as done an hour ago, as an approximate time", async () => {
    const runtime = await openClose();
    await fireEvent.press(screen.getByRole("radio", { name: en("quickTime.hour-ago") }));
    // Both choices in sight as chips, not a switch to decode.
    expect(screen.getByRole("radio", { checked: true, name: en("close.exact") })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("radio", { name: en("close.approx") }));
    // Leaving is the dim (or the cross on a wide window), not a Back button.
    expect(screen.queryByRole("button", { name: en("common.back") })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: en("common.done") }));
    await waitFor(() => {
      expect(runtime.state.store.getState().log.at(-1)?.type).toBe("task.closed");
    });
    const closed = runtime.state.store.getState().log.at(-1);
    expect(closed).toMatchObject({
      occurredAt: HOUR_AGO,
      payload: { outcome: "done", taskId: HW_ID },
      precision: "approx",
      type: "task.closed",
    });
  });

  it("takes an exact time typed in the device zone and refuses a malformed one", async () => {
    await openClose();
    await fireEvent.press(screen.getByRole("radio", { name: en("close.pickExact") }));
    // The zone as people name it, not its IANA id (QA R28-08).
    expect(screen.getByText(en("edit.inZone", { zone: "Moscow Standard Time" }))).toBeOnTheScreen();
    expect(screen.queryByText(/Europe\/Moscow/u)).toBeNull();
    // Both fields carry a visible label, so they line up under their words.
    expect(screen.getByText(en("close.date"))).toBeOnTheScreen();
    expect(screen.getByText(en("close.time"))).toBeOnTheScreen();
    const time = screen.getByLabelText(en("close.time"));
    await fireEvent.changeText(time, "25:00");
    await fireEvent(time, "blur");
    expect(screen.getByRole("alert")).toHaveTextContent(en("day.badTime"));
    await fireEvent.changeText(time, "10:15");
    expect(preview("recorded")).toHaveTextContent("12:50 · happened 10:15", { exact: false });
  });

  it("reads its time as every time field does, and says which field is wrong (R27-01)", async () => {
    const runtime = await openClose();
    await fireEvent.press(screen.getByRole("radio", { name: en("close.pickExact") }));
    const time = screen.getByLabelText(en("close.time"));
    // «930», «0930», «9.30» are 09:30 here too, the colon comes by itself.
    for (const raw of ["930", "0930", "9.30"]) {
      await fireEvent.changeText(time, "");
      await fireEvent.changeText(time, raw);
      expect(screen.getByLabelText(en("close.time")).props["value"]).toBe("09:30");
      expect(preview("recorded")).toHaveTextContent("happened 09:30", { exact: false });
    }
    // A date it cannot read is said under the date, not as one sentence for both.
    await fireEvent.changeText(screen.getByLabelText(en("close.date")), "2026-13-01");
    expect(screen.getByText(en("close.dateInvalid"))).toBeOnTheScreen();
    expect(preview("recorded")).not.toHaveTextContent("—");
    await fireEvent.changeText(screen.getByLabelText(en("close.date")), "2026-10-07");
    // Done with a time it cannot read refuses and says so; Enter presses Done when it can.
    await fireEvent.changeText(time, "25:00");
    await fireEvent.press(screen.getByRole("button", { name: en("common.done") }));
    expect(screen.getByRole("alert")).toHaveTextContent(en("day.badTime"));
    expect(runtime.state.store.getState().log.at(-1)?.type).not.toBe("task.closed");
    await fireEvent.changeText(time, "");
    await fireEvent.changeText(time, "0930");
    await fireEvent(time, "submitEditing");
    await waitFor(() => {
      expect(runtime.state.store.getState().log.at(-1)?.type).toBe("task.closed");
    });
  });

  it("closes at an hour typed alone with one press of Done, or one Enter, without leaving the field (QA 27 review I3)", async () => {
    for (const press of ["Done", "Enter"] as const) {
      const runtime = await openClose();
      await fireEvent.press(screen.getByRole("radio", { name: en("close.pickExact") }));
      const time = screen.getByLabelText(en("close.time"));
      await fireEvent.changeText(time, "");
      await fireEvent.changeText(time, "7");
      await (press === "Done"
        ? fireEvent.press(screen.getByRole("button", { name: en("common.done") }))
        : fireEvent(time, "submitEditing"));
      await waitFor(() => {
        expect(runtime.state.store.getState().log.at(-1)).toMatchObject({
          occurredAt: "2026-10-07T04:00:00.000Z",
          type: "task.closed",
        });
      });
      await screen.unmount();
    }
  });

  it("says why a typed time cannot be taken, before Done is pressed: ahead of now, before the task", async () => {
    // The sheet and the write read one rule: Done is never enabled for a time it would refuse.
    await openClose();
    await fireEvent.press(screen.getByRole("radio", { name: en("close.pickExact") }));
    const submit = () => screen.getByRole("button", { name: en("common.done") });
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
    const runtime = await openClose();
    // The outcome is one choice in sight: Done, Cancelled, Skipped (QA 19 M2, QA 20 L6).
    const outcome = screen.getByLabelText(en("close.outcome"));
    expect(within(outcome).getByRole("radio", { name: en("outcome.done") })).toBeChecked();
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

describe("CloseSheet — lateness by the subtasks only once all are done (owner, 2026-11-09)", () => {
  const DAY_AFTER = "2026-10-08T10:00:00.000Z";
  const EARLY = "2026-10-07T09:00:00.000Z";

  it("reads late while a subtask is left open, closed after the due", async () => {
    await openClose(DAY_AFTER);
    expect(preview("outcome")).toHaveTextContent(en("close.late"), { exact: false });
  });

  it("reads on time when every subtask was done before the due, closed after it", async () => {
    const runtime = await createTestRuntime({ now: DAY_AFTER });
    const subtasks = runtime.state.store.getState().tasks.byId[HW_ID]?.subtasks ?? [];
    for (const item of subtasks) {
      if (item.doneAt === null) {
        await runtime.actions.markDone(HW_ID, item.id, { at: EARLY });
      }
    }
    await renderClosing(HW_ID, runtime);
    expect(preview("outcome")).toHaveTextContent(en("close.beforeDeadline"), { exact: false });
  });
});

describe("CloseSheet — closing a whole task", () => {
  it("previews a late close after the due and closes as done", async () => {
    const runtime = await createTestRuntime({ deviceTz: "UTC", now: "2026-10-10T10:00:00.000Z" });
    await renderClosing(TRK_ID, runtime);
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
  await renderClosing(TRK_ID, runtime);
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
    await renderClosing(taskId, runtime);
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
