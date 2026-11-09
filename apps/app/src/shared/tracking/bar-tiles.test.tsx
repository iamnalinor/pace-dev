import { screen } from "@testing-library/react-native";
import { createRef } from "react";

import type { TimeButtonView } from "@pace/client";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { BarTile } from "./bar-tiles.tsx";

const CALENDAR: TimeButtonView = {
  category: "other",
  choices: [],
  color: "slate",
  id: "calendar",
  isRunning: false,
  kind: "calendar",
  labelKey: "time.button.calendar",
};

const classes = (node: { props: Record<string, unknown> }): readonly string[] => {
  const name = node.props["className"];
  return typeof name === "string" ? name.split(" ") : [];
};

const NOTHING = (): void => undefined;

describe("a time-bar tile (design review H5, spec §5.1)", () => {
  it("is the neutral 56-high tile on fill.2 with the md corners, never a stretched flex box", async () => {
    await renderScreen(
      <BarTile anchor={createRef()} button={CALENDAR} onTap={NOTHING} />,
      await createTestRuntime(),
    );
    const tile = classes(screen.getByRole("button"));
    expect(tile).toEqual(expect.arrayContaining(["h-bar-tile", "rounded-md", "bg-fill-2"]));
    // `flex-1` in the tooltip's column made the basis 0 and beat the height (44 on the web).
    expect(tile).not.toContain("flex-1");
  });

  it("does not look disabled when the calendar has nothing near: no dashed edge (F-COL-12)", async () => {
    await renderScreen(
      <BarTile
        anchor={createRef()}
        button={CALENDAR}
        onTap={NOTHING}
        unavailable="Nothing near in the calendar"
      />,
      await createTestRuntime(),
    );
    const tile = classes(screen.getByRole("button"));
    expect(tile).not.toContain("border-dashed");
    expect(tile).toContain("bg-fill-2");
  });

  it("marks the running tile with the cell and a bar in its hue's stroke", async () => {
    await renderScreen(
      <BarTile anchor={createRef()} button={{ ...CALENDAR, isRunning: true }} onTap={NOTHING} />,
      await createTestRuntime(),
    );
    expect(classes(screen.getByRole("button"))).toContain("bg-cell");
    expect(classes(screen.getByTestId("bar-tile-running"))).toContain("bg-hue-slate-stroke");
  });
});
