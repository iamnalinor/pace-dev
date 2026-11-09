import { fireEvent, screen, within } from "@testing-library/react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { ColorSwatches } from "./color-swatches.tsx";

describe("ColorSwatches (owner 2026-11-08: colour is never a dot; design review L5)", () => {
  it("draws each colour as a tinted tile with an icon in its ink, the chosen one ringed with a check", async () => {
    const onChange = jest.fn();
    await renderScreen(
      <ColorSwatches label="Colour" onChange={onChange} value="blue" />,
      await createTestRuntime(),
    );
    const blue = screen.getByRole("radio", { name: "Blue" });
    expect(blue).toBeChecked();
    expect(within(blue).getByTestId("hue-tile")).toBeOnTheScreen();
    expect(within(blue).getByTestId("swatch-chosen")).toBeOnTheScreen();
    const green = screen.getByRole("radio", { name: "Green" });
    expect(within(green).getByTestId("hue-tile")).toBeOnTheScreen();
    expect(within(green).queryByTestId("swatch-chosen")).toBeNull();
    await fireEvent.press(green);
    expect(onChange).toHaveBeenCalledWith("green");
  });
});
