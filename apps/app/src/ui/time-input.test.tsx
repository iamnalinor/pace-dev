import { fireEvent, screen } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { TimeInput } from "./time-input.tsx";

const renderTime = async (onTime: (time: string) => void, isEditable = true) =>
  await renderScreen(
    <TimeInput editable={isEditable} label="Starts at" onTime={onTime} value="09:00" />,
    await createTestRuntime({ world: "empty" }),
  );

describe("TimeInput (spec §4.2.29)", () => {
  it("saves a time when the field is left or Enter is pressed, never while it is typed", async () => {
    const onTime = jest.fn();
    await renderTime(onTime);
    const field = screen.getByLabelText("Starts at");
    await fireEvent.changeText(field, "14");
    await fireEvent.changeText(field, "1430");
    expect(onTime).not.toHaveBeenCalled();
    await fireEvent(field, "blur");
    expect(onTime).toHaveBeenCalledWith("14:30");
    await fireEvent.changeText(field, "1445");
    await fireEvent(field, "submitEditing");
    expect(onTime).toHaveBeenLastCalledWith("14:45");
  });

  it("deleting the hour digit inside a filled value saves nothing on the way (QA-25 review I1)", async () => {
    const onTime = jest.fn();
    await renderTime(onTime);
    const field = screen.getByLabelText("Starts at");
    // «09:00», the caret after the 9, Backspace, then the new hour digit.
    await fireEvent.changeText(field, "0:00");
    expect(screen.getByLabelText("Starts at").props["value"]).toBe("0:00");
    await fireEvent.changeText(field, "07:00");
    expect(onTime).not.toHaveBeenCalled();
    await fireEvent(field, "blur");
    expect(onTime).toHaveBeenCalledTimes(1);
    expect(onTime).toHaveBeenCalledWith("07:00");
  });

  it("says a time it cannot read under itself and keeps the text, as Day's sheet does (R26-05)", async () => {
    const onTime = jest.fn();
    await renderTime(onTime);
    const field = screen.getByLabelText("Starts at");
    for (const raw of ["7:", "12:5", "24:00", "9:30 PM"]) {
      await fireEvent.changeText(field, raw);
      await fireEvent(field, "blur");
      expect(screen.getByRole("alert")).toHaveTextContent(en("day.badTime"));
      expect(screen.getByLabelText("Starts at").props["aria-invalid"]).toBe(true);
    }
    expect(onTime).not.toHaveBeenCalled();
    // «930» pasted reads as typed key by key: 09:30.
    await fireEvent.changeText(field, "930");
    await fireEvent(field, "blur");
    expect(onTime).toHaveBeenCalledWith("09:30");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("left untouched, shows the stored time and saves nothing", async () => {
    const onTime = jest.fn();
    await renderTime(onTime);
    const field = screen.getByLabelText("Starts at");
    await fireEvent(field, "focus");
    await fireEvent(field, "blur");
    expect(onTime).not.toHaveBeenCalled();
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
