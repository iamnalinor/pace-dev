import { screen } from "@testing-library/react-native";
import { View } from "react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { HueTile, Tag } from "./tag.tsx";

const LONG = "Междисциплинарная курсовая работа ".repeat(4).slice(0, 120);

const classesOf = (testID: string): readonly string[] =>
  String(screen.getByTestId(testID).props["className"]).split(" ");

describe("Tag (spec §4.2.7)", () => {
  it("draws a project in its hue's tint under its ink", async () => {
    await renderScreen(<Tag hue="coral">Algebra</Tag>, await createTestRuntime({ world: "empty" }));
    // A stored `coral` is the red hue (bug-lessons 13).
    expect(classesOf("tag")).toContain("bg-hue-red-tint");
    expect(String(screen.getByText("Algebra").props["className"])).toContain("text-hue-red-ink");
  });

  it("is fill.4 under the secondary label without a hue", async () => {
    await renderScreen(<Tag hue={null}>Inbox</Tag>, await createTestRuntime({ world: "empty" }));
    expect(classesOf("tag")).toContain("bg-fill-4");
    expect(String(screen.getByText("Inbox").props["className"])).toContain("text-label-secondary");
  });

  it("ellipsizes a 120-character name in a narrow parent instead of pushing its row (F-DAT-02)", async () => {
    await renderScreen(
      <View className="w-32 flex-row">
        <Tag hue="blue">{LONG}</Tag>
      </View>,
      await createTestRuntime({ world: "empty" }),
    );
    // The tag yields in the row (it shrinks and may go below its content's width) …
    expect(classesOf("tag")).toEqual(expect.arrayContaining(["shrink", "min-w-0"]));
    // … and its text is one line that ends in "…", shrinking with it.
    const text = screen.getByText(LONG);
    expect(text.props["numberOfLines"]).toBe(1);
    expect(text.props["ellipsizeMode"]).toBe("tail");
    expect(text.props["style"]).toEqual(
      expect.arrayContaining([expect.objectContaining({ flexShrink: 1, minWidth: 0 })]),
    );
  });

  it("has no fixed line height: a larger font grows it (F-AND-05)", async () => {
    await renderScreen(<Tag hue="blue">Work</Tag>, await createTestRuntime({ world: "empty" }));
    expect(classesOf("tag")).toContain("min-h-5");
    expect(classesOf("tag")).not.toContain("h-5");
  });
});

describe("HueTile (owner 2026-11-08: colour is never a dot)", () => {
  it("is a 32 tile in the hue's tint with its icon in the hue's ink", async () => {
    await renderScreen(
      <HueTile hue="violet" icon="folder" />,
      await createTestRuntime({ world: "empty" }),
    );
    expect(classesOf("hue-tile")).toEqual(
      expect.arrayContaining(["size-8", "shrink-0", "rounded-md", "bg-hue-violet-tint"]),
    );
  });

  it("is neutral without a colour (No project)", async () => {
    await renderScreen(
      <HueTile hue={null} icon="folder" />,
      await createTestRuntime({ world: "empty" }),
    );
    expect(classesOf("hue-tile")).toContain("bg-fill-4");
  });
});
