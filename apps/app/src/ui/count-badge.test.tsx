import { screen } from "@testing-library/react-native";
import { View } from "react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { BadgeAnchor, CountBadge } from "./count-badge.tsx";

const badge = async (count: number, tone: "danger" | "neutral" = "danger") => {
  await renderScreen(
    <CountBadge count={count} tone={tone} />,
    await createTestRuntime({ world: "empty" }),
  );
  return screen.queryByTestId("count-badge", { includeHiddenElements: true });
};

describe("CountBadge", () => {
  it("is a solid danger pill with cell-coloured digits for what waits (the Inbox)", async () => {
    const view = await badge(3);
    expect(view?.props["className"]).toContain("bg-danger");
    expect(screen.getByText("3", { includeHiddenElements: true }).props["className"]).toContain(
      "text-cell",
    );
  });

  it("is a quiet fill-3 pill with secondary digits for the neutral tone (unread)", async () => {
    const view = await badge(3, "neutral");
    expect(view?.props["className"]).toContain("bg-fill-3");
    expect(screen.getByText("3", { includeHiddenElements: true }).props["className"]).toContain(
      "text-label-secondary",
    );
  });

  it("sizes to its digits: a minimum of its height, the content beyond", async () => {
    const view = await badge(12);
    const classes = (view?.props["className"] as string).split(" ");
    expect(classes).toContain("min-w-5");
    expect(classes.some((name) => name.startsWith("w-"))).toBe(false);
  });

  it("clamps at 99+ and hides at zero", async () => {
    await badge(120);
    expect(screen.getByText("99+", { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it("is not drawn at zero", async () => {
    expect(await badge(0)).toBeNull();
  });

  it("is chrome: font scaling capped at the caption2 floor", async () => {
    await badge(3);
    expect(
      screen.getByText("3", { includeHiddenElements: true }).props["maxFontSizeMultiplier"],
    ).toBeCloseTo(1.6);
  });
});

describe("BadgeAnchor (F-DAT-10, R23-13b)", () => {
  it("hangs the count off the icon's top-right corner and grows away from it, never over the glyph", async () => {
    await renderScreen(
      <BadgeAnchor count={120} tone="neutral">
        <View testID="glyph" />
      </BadgeAnchor>,
      await createTestRuntime({ world: "empty" }),
    );
    const anchor = screen.getByTestId("badge-anchor", { includeHiddenElements: true });
    const classes = String(anchor.props["className"]).split(" ");
    // Anchored by its leading edge at the icon's trailing edge: a wider count grows outward.
    expect(classes).toEqual(expect.arrayContaining(["absolute", "-top-2"]));
    expect(anchor.props["style"]).toEqual({ left: "100%" });
    expect(classes.some((name) => /^-?right-/u.test(name))).toBe(false);
    expect(screen.getByText("99+", { includeHiddenElements: true })).toBeOnTheScreen();
  });
});
