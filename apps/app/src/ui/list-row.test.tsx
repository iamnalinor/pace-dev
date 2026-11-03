import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text as NativeText, Platform } from "react-native";

import { ROW_BOX as WEB_ROW_BOX } from "./list-row-density.web.ts";
import { ListRow } from "./list-row.tsx";
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
