import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text as NativeText, Platform } from "react-native";

import { ROW_BOX as WEB_ROW_BOX } from "./list-row-density.web.ts";
import { ListRow } from "./list-row.tsx";
import { RadioGroup } from "./radio-group.tsx";
import { ThemeProvider } from "./theme-provider.tsx";

const classesOf = (testID: string): readonly string[] =>
  String(screen.getByTestId(testID).props["className"]).split(" ");

const NOTHING = (): void => undefined;

type Node = { readonly props: Record<string, unknown> };

const classesOfNode = (node: Node | undefined): readonly string[] =>
  String(node?.props["className"]).split(" ");

/** The min-height utilities of a class list (a variant like `lg:` included). */
const minHeights = (classes: readonly string[]): readonly string[] =>
  classes.filter((name) => /(?:^|:)min-h-/u.test(name));

describe("ListRow (spec §4.1.1: slots, density, selected)", () => {
  it("shows its title, subtitle and meta, with the leading and trailing slots", async () => {
    await render(
      <ThemeProvider>
        <ListRow
          leading={<NativeText>lead</NativeText>}
          meta={<NativeText>meta node</NativeText>}
          subtitle="Two devices"
          title="Telegram"
          trailing={<NativeText>1 h 5 m</NativeText>}
        />
      </ThemeProvider>,
    );
    for (const text of ["lead", "Telegram", "Two devices", "meta node", "1 h 5 m"]) {
      expect(screen.getByText(text)).toBeOnTheScreen();
    }
    expect(String(screen.getByText("Telegram").props["className"])).toContain("text-body");
    const subtitle = String(screen.getByText("Two devices").props["className"]);
    expect(subtitle).toContain("text-footnote");
    expect(subtitle).toContain("text-label-secondary");
  });

  it("on a phone keeps the 52 row inside the press target; compact is the target itself (48 dp)", async () => {
    const restore = jest.replaceProperty(Platform, "OS", "android");
    try {
      await render(
        <ThemeProvider>
          <ListRow onPress={NOTHING} testID="regular" title="Regular" />
          <ListRow density="compact" onPress={NOTHING} testID="compact" title="Compact" />
        </ThemeProvider>,
      );
      for (const id of ["regular", "compact"]) {
        // Exactly one min-height on the control, the target: no class order decides the height.
        expect(minHeights(classesOf(id))).toEqual(["min-h-hit"]);
      }
      const [regular, compact] = screen.getAllByTestId("list-row-box");
      expect(minHeights(classesOfNode(regular))).toEqual(["min-h-row"]);
      // Nothing below the 48 dp target: compact takes the control's own height.
      expect(minHeights(classesOfNode(compact))).toEqual([]);
      expect(classesOfNode(regular)).toEqual(expect.arrayContaining(["px-row-x", "py-row-y"]));
      expect(classesOfNode(regular).some((name) => name.startsWith("lg:"))).toBe(false);
    } finally {
      restore.restore();
    }
  });

  it("on the web is 52 on a phone and 44 on a desktop, compact 44 everywhere (both at or above 44 px)", () => {
    expect(WEB_ROW_BOX.regular.split(" ")).toEqual(
      expect.arrayContaining(["min-h-row", "lg:min-h-row-compact", "py-row-y", "lg:py-row-y-lg"]),
    );
    expect(minHeights(WEB_ROW_BOX.compact.split(" "))).toEqual(["min-h-row-compact"]);
  });

  it("is no control without a press: no button, nothing to press", async () => {
    await render(
      <ThemeProvider>
        <ListRow title="Static" />
      </ThemeProvider>,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("presses as a button named by its title", async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider>
        <ListRow onPress={onPress} title="Open settings" />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Open settings" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("selected adds the leading bar and accessibilityState.selected (a tab)", async () => {
    await render(
      <ThemeProvider>
        <ListRow onPress={NOTHING} role="tab" selected title="Picked" />
        <ListRow onPress={NOTHING} role="tab" selected={false} title="Other" />
      </ThemeProvider>,
    );
    expect(screen.getAllByTestId("list-row-selected-bar")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "Picked" })).toHaveProp("accessibilityState", {
      disabled: false,
      selected: true,
    });
    expect(screen.getByRole("tab", { name: "Other" })).toHaveProp("accessibilityState", {
      disabled: false,
      selected: false,
    });
  });

  it("selected on a button row (the inspector's row) is the current one: the bar and aria-current", async () => {
    await render(
      <ThemeProvider>
        <ListRow onPress={NOTHING} selected title="Algebra" />
      </ThemeProvider>,
    );
    const row = screen.getByRole("button", { name: "Algebra" });
    expect(row.props["aria-current"]).toBe("page");
    expect(screen.getByTestId("list-row-selected-bar")).toBeOnTheScreen();
    expect(classesOf("list-row-selected-bar")).toEqual(
      expect.arrayContaining(["bg-accent", "rounded-xs"]),
    );
  });

  it("selected on a static row says so to assistive tech", async () => {
    await render(
      <ThemeProvider>
        <ListRow selected testID="static" title="Static and current" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("static").props["accessibilityState"]).toEqual({ selected: true });
    expect(screen.getByTestId("static").props["aria-current"]).toBe(true);
    expect(screen.getByTestId("list-row-selected-bar")).toBeOnTheScreen();
  });

  it("aligns leading and trailing to the first title line: they top-align in a wrapped row", async () => {
    await render(
      <ThemeProvider>
        <ListRow
          leading={<NativeText>lead</NativeText>}
          title="A long title that wraps over several lines in Russian"
          trailing={<NativeText>trail</NativeText>}
        />
      </ThemeProvider>,
    );
    expect(classesOf("list-row-content")).toContain("items-start");
    expect(classesOf("list-row-leading")).toContain("justify-center");
    expect(classesOf("list-row-trailing")).toContain("justify-center");
  });
});

describe("ListRow toggle and select (spec §4.1.1 variants)", () => {
  it("toggle: the whole row is one switch named by its title, and flips from the label (R23-10)", async () => {
    const onChange = jest.fn();
    await render(
      <ThemeProvider>
        <ListRow
          subtitle="Hidden by default"
          title="Show deleted"
          toggle={{ isOn: false, onChange }}
        />
      </ThemeProvider>,
    );
    const row = screen.getByRole("switch", { name: "Show deleted" });
    expect(row).not.toBeChecked();
    // One control: the drawn switch inside is no second stop.
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    await fireEvent.press(screen.getByText("Show deleted"));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByTestId("switch-track")).toBeOnTheScreen();
  });

  it("toggle: says on, and draws the accent track", async () => {
    await render(
      <ThemeProvider>
        <ListRow title="Night hours" toggle={{ isOn: true, onChange: NOTHING }} />
      </ThemeProvider>,
    );
    expect(screen.getByRole("switch", { name: "Night hours" })).toBeChecked();
    expect(classesOf("switch-track")).toContain("bg-accent");
  });

  it("select: a radio of its group with a trailing check on the chosen one", async () => {
    const onChange = jest.fn();
    await render(
      <ThemeProvider>
        <RadioGroup label="Project" onChange={onChange} value="b" values={["a", "b"]}>
          <ListRow select="a" title="Algebra" />
          <ListRow select="b" title="Biology" />
        </RadioGroup>
      </ThemeProvider>,
    );
    expect(screen.getByRole("radio", { name: "Biology" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Algebra" })).not.toBeChecked();
    expect(screen.getAllByTestId("list-row-check")).toHaveLength(1);
    await fireEvent.press(screen.getByText("Algebra"));
    expect(onChange).toHaveBeenCalledWith("a", "press");
  });
});
