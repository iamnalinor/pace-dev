import { screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { Screen } from "./screen.tsx";
import { type ListSection, SectionedList } from "./sectioned-list.tsx";

const view = async (sections: readonly ListSection<string>[]) =>
  await renderScreen(
    <Screen
      scroller={(scroll) => (
        <SectionedList
          empty={<Text>nothing here</Text>}
          renderRow={(row) => <Text>{row}</Text>}
          rowKey={(row) => row}
          scroll={scroll}
          sections={sections}
        />
      )}
    />,
    await createTestRuntime({ world: "empty" }),
  );

describe("SectionedList", () => {
  it("draws each section's heading over its rows, and its separators between rows only", async () => {
    await view([
      { key: "a", rows: ["one", "two", "three"], title: "First" },
      { key: "b", rows: ["four"], title: "Second" },
    ]);
    expect(screen.getByRole("header", { name: "First" })).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Second" })).toBeOnTheScreen();
    expect(screen.getAllByTestId("group-separator")).toHaveLength(2);
  });

  it("draws `empty` and no heading for a list with no rows, and no list role at all", async () => {
    await view([{ key: "a", rows: [], title: "First" }]);
    expect(screen.getByText("nothing here")).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "First" })).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("renders only the rows near the window of a long list", async () => {
    const rows = Array.from({ length: 500 }, (_, index) => `row ${String(index)}`);
    await view([{ key: "a", rows, title: "Many" }]);
    expect(screen.getByText("row 0")).toBeOnTheScreen();
    expect(screen.queryByText("row 499")).toBeNull();
    expect(screen.getAllByText(/^row /u).length).toBeLessThan(100);
  });

  it("keeps the screen body's test id, so the scroll edge and the foot room are the screen's own", async () => {
    await view([{ key: "a", rows: ["one"], title: "First" }]);
    expect(screen.getByTestId("screen-body")).toBeOnTheScreen();
  });
});
