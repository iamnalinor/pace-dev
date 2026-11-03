import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text as NativeText } from "react-native";

import { ListRow } from "./list-row.tsx";
import { ThemeProvider } from "./theme-provider.tsx";

const classesOf = (testID: string): readonly string[] =>
  String(screen.getByTestId(testID).props["className"]).split(" ");

const NOTHING = (): void => undefined;

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

  it("is 52 high with the row padding on a phone and 44 on a desktop; compact is 44 everywhere", async () => {
    await render(
      <ThemeProvider>
        <ListRow testID="regular" title="Regular" />
        <ListRow density="compact" testID="compact" title="Compact" />
      </ThemeProvider>,
    );
    expect(classesOf("regular")).toEqual(
      expect.arrayContaining([
        "min-h-row",
        "lg:min-h-row-compact",
        "px-row-x",
        "py-row-y",
        "lg:py-row-y-lg",
      ]),
    );
    expect(classesOf("compact")).toEqual(expect.arrayContaining(["min-h-row-compact"]));
    expect(classesOf("compact")).not.toContain("min-h-row");
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

  it("selected on a button row (the inspector's row) is the current one: bar, selected state and aria-current", async () => {
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
