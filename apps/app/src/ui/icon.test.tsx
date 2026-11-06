import type * as React from "react";
import type { ComponentType, ReactElement } from "react";

import { render, screen } from "@testing-library/react-native";

import { color, size } from "@pace/core";

import { Icon, type IconSize } from "./icon.tsx";
import { ThemeProvider } from "./theme-provider.tsx";

/** The props each lucide icon was drawn with (the real icon still draws). */
const mockSeen: Record<string, unknown>[] = [];

jest.mock("lucide-react-native", () => {
  const actual = jest.requireActual<Record<string, ComponentType<object>>>("lucide-react-native");
  const { createElement } = jest.requireActual<typeof React>("react");
  const recording = (name: string) => (props: object) => {
    mockSeen.push({ glyph: name, ...props });
    const Glyph = actual[name];
    return Glyph === undefined ? null : createElement(Glyph, props);
  };
  return {
    ...actual,
    ChevronRight: recording("ChevronRight"),
    Clock: recording("Clock"),
    TriangleAlert: recording("TriangleAlert"),
    Zap: recording("Zap"),
  };
});

/** lucide's viewBox. */
const VIEW_BOX = 24;

const renderLight = async (ui: ReactElement) =>
  await render(<ThemeProvider forced="light">{ui}</ThemeProvider>);

describe("Icon (spec §3.6)", () => {
  beforeEach(() => {
    mockSeen.length = 0;
  });

  it.each(["inline", "control", "bar"] as const)(
    "draws a %s icon at its token size with a 1.75 stroke on screen",
    async (iconSize: IconSize) => {
      await renderLight(<Icon name="clock" size={iconSize} />);
      const drawn = mockSeen.at(-1);
      expect(drawn).toMatchObject({ glyph: "Clock", size: size.icon[iconSize] });
      // lucide draws the stroke in its 24-unit viewBox, scaled to the icon's size.
      expect((Number(drawn?.["strokeWidth"]) * size.icon[iconSize]) / VIEW_BOX).toBeCloseTo(1.75);
    },
  );

  it("is a control icon in label.secondary unless told, and takes its tone's colour", async () => {
    await renderLight(
      <>
        <Icon name="clock" />
        <Icon name="triangle-alert" tone="danger" />
      </>,
    );
    expect(mockSeen[0]).toMatchObject({
      color: color("light", "label.secondary"),
      size: size.icon.control,
    });
    expect(mockSeen[1]).toMatchObject({ color: color("light", "status.danger") });
  });

  it("is an image with its label for a screen reader, and hidden without one", async () => {
    await renderLight(
      <>
        <Icon label="Late" name="triangle-alert" />
        <Icon name="chevron-right" />
      </>,
    );
    expect(screen.getByRole("image", { name: "Late" })).toBeOnTheScreen();
    expect(screen.getAllByRole("image")).toHaveLength(1);
    expect(mockSeen[1]).toMatchObject({ "aria-hidden": true });
  });

  it("fills in its tone when filled (the selected tab), and only then", async () => {
    await renderLight(
      <>
        <Icon filled name="zap" tone="primary" />
        <Icon name="zap" />
      </>,
    );
    expect(mockSeen[0]).toMatchObject({ fill: color("light", "label.primary") });
    expect(mockSeen[1]).not.toHaveProperty("fill");
  });
});
