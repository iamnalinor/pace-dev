import { fireEvent, render, screen } from "@testing-library/react-native";

import { ThemeProvider } from "./theme-provider.tsx";
import { TimeInput } from "./time-input.tsx";

const renderTime = async (onTime: (time: string) => void, isEditable = true) =>
  await render(
    <ThemeProvider forced="light">
      <TimeInput editable={isEditable} label="Starts at" onTime={onTime} value="09:00" />
    </ThemeProvider>,
  );

describe("TimeInput (spec §4.2.29)", () => {
  it("hears only complete times, and puts the stored one back when left half typed", async () => {
    const onTime = jest.fn();
    await renderTime(onTime);
    const field = screen.getByLabelText("Starts at");
    await fireEvent.changeText(field, "14");
    expect(onTime).not.toHaveBeenCalled();
    await fireEvent(field, "blur");
    expect(screen.getByLabelText("Starts at").props["value"]).toBe("09:00");
    await fireEvent.changeText(field, "1430");
    expect(onTime).toHaveBeenCalledWith("14:30");
  });

  it("wears the field's states: the ring while focused, no border and quaternary text disabled", async () => {
    await renderTime(jest.fn());
    await fireEvent(screen.getByLabelText("Starts at"), "focus");
    expect(screen.getByTestId("text-field-ring")).toBeOnTheScreen();
    expect(screen.getByLabelText("Starts at").props["inputMode"]).toBe("numeric");
  });

  it("is quiet while disabled", async () => {
    await renderTime(jest.fn(), false);
    expect(String(screen.getByLabelText("Starts at").props["className"])).toContain(
      "text-label-quaternary",
    );
  });
});
