import { fireEvent, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { ChipScroller, edgesOf } from "./chip-scroller.tsx";

describe("edgesOf", () => {
  it("knows which ends have more of the row beyond them", () => {
    expect(edgesOf({ content: 300, view: 300, x: 0 })).toEqual({ hasEnd: false, hasStart: false });
    expect(edgesOf({ content: 600, view: 300, x: 0 })).toEqual({ hasEnd: true, hasStart: false });
    expect(edgesOf({ content: 600, view: 300, x: 150 })).toEqual({ hasEnd: true, hasStart: true });
    expect(edgesOf({ content: 600, view: 300, x: 300 })).toEqual({ hasEnd: false, hasStart: true });
  });
});

describe("ChipScroller (a row that goes on says so, F-DAT-02)", () => {
  it("shows a cue only at the end that has more, hidden from assistive tech", async () => {
    await renderScreen(
      <ChipScroller>
        <Text>chips</Text>
      </ChipScroller>,
      await createTestRuntime(),
    );
    expect(
      screen.queryByTestId("chip-scroller-cue-end", { includeHiddenElements: true }),
    ).toBeNull();
    await fireEvent(screen.getByTestId("chip-scroller"), "layout", {
      nativeEvent: { layout: { width: 300 } },
    });
    await fireEvent(screen.getByTestId("chip-scroller-content"), "layout", {
      nativeEvent: { layout: { height: 40, width: 600 } },
    });
    expect(screen.getByTestId("chip-scroller-cue-end", { includeHiddenElements: true })).toHaveProp(
      "importantForAccessibility",
      "no-hide-descendants",
    );
    expect(
      screen.queryByTestId("chip-scroller-cue-start", { includeHiddenElements: true }),
    ).toBeNull();
    await fireEvent.scroll(screen.getByTestId("chip-scroller-content").parent?.parent as never, {
      nativeEvent: { contentOffset: { x: 300, y: 0 } },
    });
    expect(
      screen.getByTestId("chip-scroller-cue-start", { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(
      screen.queryByTestId("chip-scroller-cue-end", { includeHiddenElements: true }),
    ).toBeNull();
  });
});
