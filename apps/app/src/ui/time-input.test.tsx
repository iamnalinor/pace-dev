import { fireEvent, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Pressable, Text } from "react-native";

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
    for (const raw of ["12:5", "24:00", "9:30 PM", "25"]) {
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

  it("reads an hour typed alone as that hour sharp when left (QA round 27 R27-04)", async () => {
    const onTime = jest.fn();
    await renderTime(onTime);
    const field = screen.getByLabelText("Starts at");
    await fireEvent.changeText(field, "7");
    await fireEvent(field, "blur");
    expect(onTime).toHaveBeenCalledWith("07:00");
    expect(screen.getByLabelText("Starts at").props["value"]).toBe("07:00");
  });

  it("left untouched, shows the stored time and saves nothing", async () => {
    const onTime = jest.fn();
    await renderTime(onTime);
    const field = screen.getByLabelText("Starts at");
    await fireEvent(field, "focus");
    await fireEvent(field, "blur");
    expect(onTime).not.toHaveBeenCalled();
  });

  it("keeps a typed time when the field goes away without being left (Android, review I1)", async () => {
    // On Android a tap on Done or Save under `keyboardShouldPersistTaps="handled"` blurs nothing:
    // the field unmounts still focused, and its blur never reaches it.
    const onTime = jest.fn();
    const { unmount } = await renderTime(onTime);
    await fireEvent.changeText(screen.getByLabelText("Starts at"), "1830");
    await unmount();
    expect(onTime).toHaveBeenCalledTimes(1);
    expect(onTime).toHaveBeenCalledWith("18:30");
  });

  it("going away saves nothing untouched, unreadable or already saved", async () => {
    for (const [raw, isLeft] of [
      [null, false],
      ["18:3", false],
      ["1830", true],
    ] as const) {
      const onTime = jest.fn();
      const { unmount } = await renderTime(onTime);
      const field = screen.getByLabelText("Starts at");
      if (raw !== null) {
        await fireEvent.changeText(field, raw);
      }
      if (isLeft) {
        await fireEvent(field, "blur");
      }
      await unmount();
      expect(onTime).toHaveBeenCalledTimes(isLeft ? 1 : 0);
    }
  });

  it("in a draft, hands each complete time over as it is typed, never a deletion's reading", async () => {
    const onTime = jest.fn();
    await renderScreen(
      <TimeInput isDraft label="Starts at" onTime={onTime} value="09:30" />,
      await createTestRuntime({ world: "empty" }),
    );
    const field = screen.getByLabelText("Starts at");
    // The hour digit deleted to retype it: «0:30» is not a time yet, whatever a whole reading says.
    await fireEvent.changeText(field, "0:30");
    expect(onTime).not.toHaveBeenCalled();
    await fireEvent.changeText(field, "07:30");
    expect(onTime).toHaveBeenLastCalledWith("07:30");
    await fireEvent.changeText(field, "07:3");
    await fireEvent.changeText(field, "07:35");
    expect(onTime).toHaveBeenLastCalledWith("07:35");
    expect(onTime).toHaveBeenCalledTimes(2);
  });

  it("shows a stored time that changes while it is untouched, keeps one being typed (review I5)", async () => {
    const onTime = jest.fn();
    // The stored value moves on its own: synced from another device, or a row above removed.
    const Stored = () => {
      const [value, setValue] = useState("09:00");
      return (
        <>
          <TimeInput label="Starts at" onTime={onTime} value={value} />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setValue((previous) => (previous === "09:00" ? "10:15" : "12:00"));
            }}
          >
            <Text>Sync</Text>
          </Pressable>
        </>
      );
    };
    await renderScreen(<Stored />, await createTestRuntime({ world: "empty" }));
    const field = () => screen.getByLabelText("Starts at");
    await fireEvent.press(screen.getByRole("button", { name: "Sync" }));
    expect(field().props["value"]).toBe("10:15");
    await fireEvent.changeText(field(), "11");
    await fireEvent.press(screen.getByRole("button", { name: "Sync" }));
    expect(field().props["value"]).toBe("11");
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
