import { fireEvent, screen, within } from "@testing-library/react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { PaceSwitch } from "./switch-row.tsx";

/** The size classes of the track: its box, the same in both states. */
const box = (classes: string): readonly string[] =>
  classes.split(" ").filter((name) => /^[hw]-switch/.test(name));

const show = async (isOn: boolean, onChange: (isOn: boolean) => void = () => undefined) => {
  await renderScreen(
    <PaceSwitch isOn={isOn} label="Night hours" onChange={onChange} />,
    await createTestRuntime({ world: "empty" }),
  );
  const track = screen.getByTestId("switch-track");
  return {
    knob: within(track).getByTestId("switch-knob").props["className"] as string,
    track: track.props["className"] as string,
  };
};

describe("PaceSwitch", () => {
  it("is a 48 target around the 32 track, a pill so the focus ring follows it, with no extra room in the layout", async () => {
    await show(false);
    const classes = (
      screen.getByRole("switch", { name: "Night hours" }).props["className"] as string
    ).split(" ");
    expect(classes).toEqual(expect.arrayContaining(["-my-2", "h-hit", "rounded-pill", "shrink-0"]));
  });

  it("insets the off knob 8 px from the track's edge, the gap above and below it (2 border + 4 + 2)", async () => {
    const { knob, track } = await show(false);
    expect(track.split(" ")).toEqual(expect.arrayContaining(["border-2", "pl-1"]));
    expect(knob.split(" ")).toContain("ml-0.5");
  });

  it("is the accent with the on-accent knob when on", async () => {
    const { knob, track } = await show(true);
    expect(track).toContain("bg-accent");
    expect(knob).toContain("bg-accent-on");
    expect(screen.getByRole("switch", { name: "Night hours" })).toBeChecked();
  });

  it("is a ringed fill-2 track with a tertiary knob when off, in the same box", async () => {
    const on = await show(true);
    const off = await show(false);
    expect(off.track).toContain("border-outline");
    expect(off.track).toContain("bg-fill-2");
    expect(off.knob).toContain("bg-label-tertiary");
    // One geometry for both states: only colours and the knob's place change.
    expect(box(off.track)).toEqual(box(on.track));
    expect(box(off.track)).toHaveLength(2);
  });

  it("flips on a press, as a native switch does", async () => {
    const onChange = jest.fn();
    await show(false, onChange);
    await fireEvent.press(screen.getByRole("switch", { name: "Night hours" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
