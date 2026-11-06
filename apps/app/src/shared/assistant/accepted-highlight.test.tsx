import { act, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { motion } from "@pace/core";

import { AcceptedHighlight, markAccepted } from "./accepted-highlight.tsx";

const row = async () =>
  await renderScreen(
    <>
      <AcceptedHighlight id="a">
        <Text>first</Text>
      </AcceptedHighlight>
      <AcceptedHighlight id="b">
        <Text>second</Text>
      </AcceptedHighlight>
    </>,
    await createTestRuntime({ world: "empty" }),
  );

describe("AcceptedHighlight", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("marks only the row an approval created, once, for 600 ms", async () => {
    await row();
    expect(screen.queryByTestId("accepted-highlight")).toBeNull();
    await act(() => {
      markAccepted(["a"]);
    });
    expect(screen.getAllByTestId("accepted-highlight")).toHaveLength(1);
    await act(() => {
      jest.advanceTimersByTime(motion.highlight + 1);
    });
    expect(screen.queryByTestId("accepted-highlight")).toBeNull();
  });

  it("marks nothing for a proposal that created no row", async () => {
    await row();
    await act(() => {
      markAccepted([]);
    });
    expect(screen.queryByTestId("accepted-highlight")).toBeNull();
  });
});
