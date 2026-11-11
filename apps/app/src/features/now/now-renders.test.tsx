import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { type ReactElement, useEffect, useState } from "react";

import type * as CheckCircleModule from "#app/ui/check-circle.tsx";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { ScreenActive } from "#app/ui/screen-active-provider.tsx";
import { HW_ID } from "@pace/core/testing";

import { ComposerProvider } from "./composer/composer-flow.tsx";
import { NowBoard } from "./now-screen.tsx";

/**
The cost of a tap, counted (bug-lessons 310): how many task rows React renders for it. Every row
draws one check, so a render of the check is a render of its row; the check itself is the real one.
*/
const mockRenders = new Map<string, number>();
jest.mock("#app/ui/check-circle.tsx", (): unknown => {
  const actual = jest.requireActual<typeof CheckCircleModule>("#app/ui/check-circle.tsx");
  return {
    ...actual,
    CheckCircle: (props: Parameters<typeof actual.CheckCircle>[0]): ReactElement => {
      mockRenders.set(props.label, (mockRenders.get(props.label) ?? 0) + 1);
      return <actual.CheckCircle {...props} />;
    },
  };
});

const CURATOR = "Mark Reply to course curator done";

/** The rows rendered since the last `mockRenders.clear()`, by their check's name. */
const rendered = (): readonly string[] =>
  mockRenders
    .keys()
    .toArray()
    .toSorted((a, b) => a.localeCompare(b));

/** Brings the board to the front or leaves it behind, as a tab switch does. */
const front: { set: (isFront: boolean) => void } = { set: () => undefined };

const Board = ({ isFrontAtFirst = true }: { readonly isFrontAtFirst?: boolean }) => {
  const [isFront, setIsFront] = useState(isFrontAtFirst);
  useEffect(() => {
    front.set = setIsFront;
  }, []);
  return (
    <ScreenActive isActive={isFront}>
      <ComposerProvider>
        <NowBoard />
      </ComposerProvider>
    </ScreenActive>
  );
};

const closedOf = (runtime: Awaited<ReturnType<typeof createTestRuntime>>, title: string): unknown =>
  Object.values(runtime.state.store.getState().tasks.byId).find((task) => task.title === title)
    ?.closed;

describe("Now renders what a tap changed, nothing else (bug-lessons 310)", () => {
  it("renders only the checked row for a check, through its dust, its close and its write", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<Board />, runtime);
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(3);
    mockRenders.clear();
    await fireEvent.press(screen.getByRole("checkbox", { name: CURATOR }));
    await waitFor(() => {
      expect(closedOf(runtime, "Reply to course curator")).not.toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByText("Reply to course curator")).toBeNull();
    });
    expect(rendered()).toEqual([CURATOR]);
  });

  it("renders only the row of the task a store change is about", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<Board />, runtime);
    mockRenders.clear();
    await act(async () => {
      await runtime.actions.updateTask(HW_ID, { title: "Algebra HW 7" });
    });
    expect(screen.getByText("Algebra HW 7")).toBeOnTheScreen();
    expect(rendered()).toEqual(["Mark Algebra HW 7 done"]);
  });

  it("renders nothing on a screen left behind, and shows the change once it is in front again", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<Board isFrontAtFirst={false} />, runtime);
    mockRenders.clear();
    await act(async () => {
      await runtime.actions.updateTask(HW_ID, { title: "Algebra HW 7" });
      await runtime.actions.closeTask({ outcome: "done", taskId: HW_ID });
      await runtime.actions.revoke(
        (runtime.state.store.getState().tasks.byId[HW_ID]?.closed as { eventId: string }).eventId,
      );
    });
    expect(rendered()).toEqual([]);
    expect(screen.queryByText("Algebra HW 7")).toBeNull();
    await act(() => {
      front.set(true);
    });
    await waitFor(() => {
      expect(screen.getByText("Algebra HW 7")).toBeOnTheScreen();
    });
    expect(rendered()).toEqual(["Mark Algebra HW 7 done"]);
  });
});
