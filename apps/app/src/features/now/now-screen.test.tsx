import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { HW_ID } from "@pace/core/testing";

import { NowBoard } from "./now-screen.tsx";

beforeEach(() => {
  jest.clearAllMocks();
});

const checks = (): readonly string[] =>
  screen
    .getAllByRole("checkbox", { name: /^Mark .* done$/ })
    .map((button) => String(button.props["accessibilityLabel"]));

describe("NowBoard", () => {
  it("lists the artboard rows by deadline with their meta lines", async () => {
    await renderScreen(<NowBoard />, await createTestRuntime());
    expect(screen.getByText("Tuesday · Oct 6")).toBeOnTheScreen();
    expect(screen.getByText("Now")).toBeOnTheScreen();
    expect(checks()).toEqual([
      "Mark Calculus HW 5 done",
      "Mark Algebra HW 6 done",
      "Mark History HW 1 done",
      "Mark Prepare demo for Friday done",
      "Mark Flaky latency test in nightly done",
      "Mark Calculus HW 6 done",
      "Mark Return library books done",
      "Mark RFC: dedicated runner pool done",
      "Mark Reply to course curator done",
    ]);
    expect(
      screen.getByText("Due tomorrow 23:59 · 1d 8h left · 4/7 solved · 2 sent"),
    ).toBeOnTheScreen();
    // The project (else the category) and the importance are coloured tags before the meta text.
    expect(screen.getAllByText("ASAP").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Normal").length).toBeGreaterThan(0);
    expect(screen.getByText("15h late · 2 problems left")).toBeOnTheScreen();
    expect(screen.getByText("12d old")).toBeOnTheScreen();
    expect(screen.getAllByText("Nice-to-have").length).toBeGreaterThan(0);
    expect(screen.getByText("Due Oct 9 18:00 UTC (your time 21:00)")).toBeOnTheScreen();
    expect(screen.getAllByText("Algebra").length).toBeGreaterThan(0);
    expect(screen.getByLabelText(en("time.whatDoing"))).toBeOnTheScreen();
  });

  it("opens the inbox from the counter and a task from its row", async () => {
    await renderScreen(<NowBoard />, await createTestRuntime());
    await fireEvent.press(screen.getByRole("button", { name: "Inbox, 3 unsorted" }));
    expect(router.push).toHaveBeenCalledWith("/inbox");
    await fireEvent.press(screen.getByText("Algebra HW 6"));
    expect(router.push).toHaveBeenCalledWith(`/task/${HW_ID}`);
  });

  it("checks a task off at once, without a toast (History undoes it)", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<NowBoard />, runtime);
    await fireEvent.press(
      screen.getByRole("checkbox", { name: "Mark Reply to course curator done" }),
    );
    await waitFor(() => {
      expect(screen.queryByText("Reply to course curator")).toBeNull();
    });
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    await runtime.actions.undoLast();
    await waitFor(() => {
      expect(screen.getByText("Reply to course curator")).toBeOnTheScreen();
    });
  });

  it("opens the submit sheet for a per-problem task instead of closing it", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<NowBoard />, runtime);
    await fireEvent.press(screen.getByRole("checkbox", { name: "Mark Algebra HW 6 done" }));
    expect(router.push).toHaveBeenCalledWith(`/task/${HW_ID}?close=1`);
    expect(runtime.state.store.getState().tasks.byId[HW_ID]?.closed).toBeNull();
  });

  it("filters by project and folds the tasks that start later under In future", async () => {
    await renderScreen(<NowBoard />, await createTestRuntime());
    const chips = screen.getByLabelText("Filter by project");
    await fireEvent.press(within(chips).getByRole("radio", { name: "Work" }));
    expect(checks()).toEqual([
      "Mark Prepare demo for Friday done",
      "Mark Flaky latency test in nightly done",
      "Mark RFC: dedicated runner pool done",
    ]);
    await fireEvent.press(screen.getByRole("radio", { name: "All" }));
    expect(checks()).toHaveLength(9);
    const fold = screen.getByRole("button", { name: "In future · 4" });
    expect(screen.queryByText("Check test 1 grade")).toBeNull();
    await fireEvent.press(fold);
    expect(screen.getByText("Check test 1 grade")).toBeOnTheScreen();
    expect(screen.getByText(/^Starts Oct 20/u)).toBeOnTheScreen();
  });

  it("offers the device zone when the account sits in another one", async () => {
    const runtime = await createTestRuntime({ deviceTz: "UTC" });
    await renderScreen(<NowBoard />, runtime);
    expect(
      screen.getByText(en("zone.banner", { account: "Europe/Moscow", device: "UTC" })),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Use UTC" }));
    await waitFor(() => {
      expect(runtime.state.store.getState().settings.timezone).toBe("UTC");
    });
    expect(screen.queryByRole("button", { name: "Use UTC" })).toBeNull();
  });

  it("shows the empty state on a fresh account", async () => {
    await renderScreen(<NowBoard />, await createTestRuntime({ world: "empty" }));
    expect(screen.getByText(en("now.empty"))).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Inbox, 0 unsorted" })).toBeOnTheScreen();
  });
});
