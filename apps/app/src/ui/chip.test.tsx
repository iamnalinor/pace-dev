import { fireEvent, screen, within } from "@testing-library/react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { Chip } from "./chip.tsx";
import { RadioGroup } from "./radio-group.tsx";

/** The icons the chip asked the kit for. */
const mockIcons: unknown[] = [];

jest.mock("./icon.tsx", () => ({
  Icon: (props: unknown) => {
    mockIcons.push(props);
    return null;
  },
}));

const NOTHING = (): void => undefined;

/** The classes of the chip's pill: the drawn box inside the target. */
const pillOf = (role: "button" | "checkbox" | "radio", name: string): readonly string[] =>
  String(
    within(screen.getByRole(role, { name })).getByTestId("pressable-visual").props["className"],
  ).split(" ");

const empty = async () => await createTestRuntime({ world: "empty" });

const Group = ({ onChange = NOTHING }: { readonly onChange?: (value: string) => void }) => (
  <RadioGroup label="Theme" onChange={onChange} value="dark" values={["light", "dark", "auto"]}>
    <Chip value="light">Light</Chip>
    <Chip hue="green" value="dark">
      Dark
    </Chip>
    <Chip value="auto">Auto</Chip>
  </RadioGroup>
);

describe("Chip (spec §4.2.6)", () => {
  beforeEach(() => {
    mockIcons.length = 0;
  });

  it("marks the chosen radio with the accent fill and its ink; the others rest on fill.2", async () => {
    await renderScreen(<Group />, await empty());
    expect(pillOf("radio", "Dark")).toContain("bg-accent");
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(String(screen.getByText("Dark").props["className"])).toContain("text-accent-on");
    expect(pillOf("radio", "Light")).toContain("bg-fill-2");
    expect(pillOf("radio", "Light")).not.toContain("bg-accent");
    expect(String(screen.getByText("Light").props["className"])).toContain("text-label-secondary");
  });

  it("is one tab stop per group: the chosen radio is 0, the others -1 (QA21 L1, R23-15)", async () => {
    await renderScreen(<Group />, await empty());
    const stops = screen
      .getAllByRole("radio")
      .map((radio) => (radio.props as { tabIndex?: number }).tabIndex);
    expect(stops).toEqual([-1, 0, -1]);
    expect(screen.getByLabelText("Theme").props["role"]).toBe("radiogroup");
  });

  it("makes the first radio the stop when none is chosen", async () => {
    await renderScreen(
      <RadioGroup label="Reasons" onChange={NOTHING} value="typed" values={["a", "b"]}>
        <Chip value="a">A</Chip>
        <Chip value="b">B</Chip>
      </RadioGroup>,
      await empty(),
    );
    const stops = screen
      .getAllByRole("radio")
      .map((radio) => (radio.props as { tabIndex?: number }).tabIndex);
    expect(stops).toEqual([0, -1]);
  });

  it("chooses on a press and says it was a press", async () => {
    const onChange = jest.fn();
    await renderScreen(<Group onChange={onChange} />, await empty());
    await fireEvent.press(screen.getByRole("radio", { name: "Auto" }));
    expect(onChange).toHaveBeenCalledWith("auto", "press");
  });

  it("refuses a radio outside a group (it would be a tab stop of its own with no group)", async () => {
    jest.spyOn(console, "error").mockImplementation(NOTHING);
    await expect(async () => {
      await renderScreen(<Chip value="lonely">Lonely</Chip>, await empty());
    }).rejects.toThrow(/RadioGroup/u);
  });

  it("draws a coloured chip at rest in its hue's tint under its ink, never a dot (owner 2026-11-08)", async () => {
    await renderScreen(
      <RadioGroup label="Project" onChange={NOTHING} value="all" values={["all", "work"]}>
        <Chip value="all">All</Chip>
        <Chip hue="green" value="work">
          Work
        </Chip>
      </RadioGroup>,
      await empty(),
    );
    expect(within(screen.getByRole("radio", { name: "Work" })).queryByTestId("dot")).toBeNull();
    expect(pillOf("radio", "Work")).toContain("bg-hue-green-tint");
    expect(String(screen.getByText("Work").props["className"])).toContain("text-hue-green-ink");
  });

  it("draws its inline icon in the colour of the chip: onAccent when on, secondary off", async () => {
    await renderScreen(
      <>
        <Chip expanded icon="clock" onPress={NOTHING}>
          On
        </Chip>
        <Chip expanded={false} icon="clock" onPress={NOTHING}>
          Off
        </Chip>
      </>,
      await empty(),
    );
    expect(mockIcons).toEqual([
      { name: "clock", size: "inline", tone: "onAccent" },
      { name: "clock", size: "inline", tone: "secondary" },
    ]);
    expect(screen.getByRole("button", { name: "On" })).toBeExpanded();
  });

  it("is a filter checkbox with `checked`, and an action button with neither", async () => {
    const onPress = jest.fn();
    await renderScreen(
      <>
        <Chip checked onPress={NOTHING}>
          Work
        </Chip>
        <Chip onPress={onPress}>Read it later</Chip>
      </>,
      await empty(),
    );
    expect(screen.getByRole("checkbox", { name: "Work" })).toBeChecked();
    await fireEvent.press(screen.getByRole("button", { name: "Read it later" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(pillOf("button", "Read it later")).toContain("bg-fill-2");
  });

  it("is the 48 target around the 32 pill with no negative margin, so wrapped rows never overlap", async () => {
    await renderScreen(<Chip onPress={NOTHING}>Plain</Chip>, await empty());
    const target = String(screen.getByRole("button", { name: "Plain" }).props["className"]).split(
      " ",
    );
    expect(target).toEqual(expect.arrayContaining(["min-h-hit", "min-w-hit"]));
    expect(target.some((name) => name.startsWith("-m"))).toBe(false);
    expect(pillOf("button", "Plain")).toEqual(
      expect.arrayContaining(["h-8", "rounded-pill", "max-w-chip-max", "min-w-8"]),
    );
  });

  it("truncates a long name at size.chip.max with its full value kept (F-DAT-02)", async () => {
    const long = "Междисциплинарная курсовая работа по истории ".repeat(2);
    await renderScreen(<Chip onPress={NOTHING}>{long}</Chip>, await empty());
    expect(screen.getByText(long).props["numberOfLines"]).toBe(1);
  });

  it("is fill.1 under label.quaternary when disabled, never an opacity, and presses nothing", async () => {
    const onPress = jest.fn();
    await renderScreen(
      <Chip disabled onPress={onPress}>
        Later
      </Chip>,
      await empty(),
    );
    expect(pillOf("button", "Later")).toContain("bg-fill-1");
    expect(pillOf("button", "Later").join(" ")).not.toContain("opacity");
    expect(String(screen.getByText("Later").props["className"])).toContain("text-label-quaternary");
    await fireEvent.press(screen.getByRole("button", { name: "Later" }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
