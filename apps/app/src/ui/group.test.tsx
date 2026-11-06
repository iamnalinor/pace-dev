import { render, screen } from "@testing-library/react-native";
import { View } from "react-native";

import { Group } from "./group.tsx";

/** The Group's children and separators, in drawn order, by test id. */
const drawn = (): readonly string[] =>
  screen.getAllByTestId(/^(row-|group-separator)/).map((node) => String(node.props["testID"]));

describe("Group (the inset grouped list, spec §4.1.1, §5.0.3)", () => {
  it("draws a separator between rows, none before the first or after the last", async () => {
    await render(
      <Group>
        <View testID="row-a" />
        <View testID="row-b" />
        <View testID="row-c" />
      </Group>,
    );
    expect(drawn()).toEqual(["row-a", "group-separator", "row-b", "group-separator", "row-c"]);
  });

  it("draws no separator around a single row, and skips holes left by conditions", async () => {
    await render(
      <Group>
        {null}
        <View testID="row-a" />
        {false}
      </Group>,
    );
    expect(drawn()).toEqual(["row-a"]);
  });

  it("draws nothing at all when every row is left out", async () => {
    await render(
      <Group testID="group">
        {null}
        {false}
      </Group>,
    );
    expect(screen.queryByTestId("group")).toBeNull();
  });

  it("is the cell ground with the large radius and no border, and stays a view of its own on Android", async () => {
    await render(
      <Group testID="group">
        <View testID="row-a" />
      </Group>,
    );
    const group = screen.getByTestId("group");
    const classes = String(group.props["className"]).split(" ");
    expect(classes).toEqual(expect.arrayContaining(["bg-cell", "rounded-lg", "overflow-hidden"]));
    expect(classes.some((name) => name.startsWith("border"))).toBe(false);
    expect(group.props["collapsable"]).toBe(false);
  });

  it("insets the separator to the text start: the row padding, or past a leading icon", async () => {
    await render(
      <>
        <Group>
          <View testID="row-a" />
          <View testID="row-b" />
        </Group>
        <Group separatorInset="icon">
          <View testID="row-c" />
          <View testID="row-d" />
        </Group>
      </>,
    );
    const [plain, icon] = screen.getAllByTestId("group-separator");
    expect(String(plain?.props["className"])).toContain("ml-row-x");
    // 16 row padding + 20 icon + 12 gap = 48 (`ml-12`).
    expect(String(icon?.props["className"])).toContain("ml-12");
  });

  it("sits inside the screen's gutter when inset, edge to edge when not", async () => {
    await render(
      <>
        <Group testID="inset">
          <View />
        </Group>
        <Group inset={false} testID="flush">
          <View />
        </Group>
      </>,
    );
    expect(String(screen.getByTestId("inset").props["className"])).toContain("mx-gutter");
    expect(String(screen.getByTestId("flush").props["className"])).not.toContain("mx-gutter");
  });
});
