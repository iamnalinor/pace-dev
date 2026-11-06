import { fireEvent, render, screen, within } from "@testing-library/react-native";

import { Segmented } from "./segmented.tsx";
import { ThemeProvider } from "./theme-provider.tsx";

const OPTIONS = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
] as const;

const show = async (onChange: (value: string) => void = () => undefined) => {
  await render(
    <ThemeProvider>
      <Segmented label="Theme" onChange={onChange} options={OPTIONS} value="light" />
    </ThemeProvider>,
  );
};

describe("Segmented (spec §4.2.19)", () => {
  it("is a named radio group with one tab stop, on the chosen segment (F-A11Y-13, QA21 L1)", async () => {
    await show();
    expect(screen.getByLabelText("Theme").props["role"]).toBe("radiogroup");
    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
    expect(
      screen.getAllByRole("radio").map((radio) => (radio.props as { tabIndex?: number }).tabIndex),
    ).toEqual([-1, 0, -1]);
  });

  it("marks the chosen segment by a thumb with an edge and its label's weight, not colour alone", async () => {
    await show();
    const thumb = String(
      within(screen.getByRole("radio", { name: "Light" })).getByTestId("pressable-visual").props[
        "className"
      ],
    ).split(" ");
    expect(thumb).toEqual(
      expect.arrayContaining(["bg-elevated", "border", "border-label-tertiary", "rounded-pill"]),
    );
    expect(String(screen.getByText("Light").props["className"])).toContain("font-semibold");
    expect(String(screen.getByText("Dark").props["className"])).toContain("text-label-secondary");
  });

  it("chooses on a press", async () => {
    const onChange = jest.fn();
    await show(onChange);
    await fireEvent.press(screen.getByRole("radio", { name: "Dark" }));
    expect(onChange).toHaveBeenCalledWith("dark");
  });
});
