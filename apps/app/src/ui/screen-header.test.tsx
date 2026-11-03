import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { Text as NativeText } from "react-native";

import { withWindowWidth } from "#app/test/window.ts";

import { ScreenHeader } from "./screen-header.tsx";
import { ThemeProvider } from "./theme-provider.tsx";

const classesOf = (node: { readonly props: Record<string, unknown> }): string =>
  String(node.props["className"]);

const renderHeader = async (header: React.ReactElement) =>
  await render(<ThemeProvider>{header}</ThemeProvider>);

describe("ScreenHeader (spec §4.2.16, §5.0.2)", () => {
  describe("top level", () => {
    it("renders the title as a level-1 largeTitle heading and no eyebrow", async () => {
      await renderHeader(<ScreenHeader title="Now" variant="top" />);
      const title = screen.getByRole("header", { name: "Now" });
      expect(title.props["aria-level"]).toBe(1);
      expect(classesOf(title)).toContain("text-largeTitle");
      // Only the title is text: no eyebrow above it (F-TYP-02).
      expect(screen.getAllByText(/.+/u)).toHaveLength(1);
    });

    it("puts the subtitle under the title, in callout and the secondary label", async () => {
      await renderHeader(<ScreenHeader subtitle="Tuesday, 3 November" title="Day" variant="top" />);
      const texts = screen.getAllByText(/.+/u).map((node) => node.props["children"] as string);
      expect(texts).toEqual(["Day", "Tuesday, 3 November"]);
      const subtitle = screen.getByText("Tuesday, 3 November");
      expect(classesOf(subtitle)).toContain("text-callout");
      expect(classesOf(subtitle)).toContain("text-label-secondary");
    });

    it("holds the period control in the subtitle row when given one", async () => {
      await renderHeader(
        <ScreenHeader period={<NativeText>‹ This week ›</NativeText>} title="Week" variant="top" />,
      );
      expect(
        within(screen.getByTestId("screen-header-subtitle")).getByText("‹ This week ›"),
      ).toBeOnTheScreen();
    });

    it("on a phone keeps a 48 top bar above the title, so the title sits at one y with or without actions", async () => {
      await renderHeader(
        <ScreenHeader actions={<NativeText>bell</NativeText>} title="Now" variant="top" />,
      );
      const bar = screen.getByTestId("screen-header-bar");
      // At least the target, never a fixed height: a labelled action at 200 % text grows it (F-AND-05).
      expect(classesOf(bar).split(" ")).toContain("min-h-hit");
      expect(classesOf(bar).split(" ")).not.toContain("h-hit");
      expect(within(bar).getByText("bell")).toBeOnTheScreen();
    });

    it("keeps the gutter: 16 on a phone, 24 on a tablet, 32 on a computer", async () => {
      await renderHeader(<ScreenHeader title="Inbox" variant="top" />);
      const header = screen.getByTestId("screen-header");
      expect(classesOf(header).split(" ")).toEqual(
        expect.arrayContaining(["px-gutter", "md:px-gutter-pane", "lg:px-gutter-lg"]),
      );
    });

    it("on a phone has the bar even with nothing in it", async () => {
      await renderHeader(<ScreenHeader title="Inbox" variant="top" />);
      expect(screen.getByTestId("screen-header-bar")).toBeOnTheScreen();
    });

    it("pushed from More on a phone, it carries Back in the bar", async () => {
      const onBack = jest.fn();
      await renderHeader(
        <ScreenHeader backLabel="Back" onBack={onBack} title="Projects" variant="top" />,
      );
      await fireEvent.press(screen.getByRole("button", { name: "Back" }));
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe("top level on a desktop", () => {
    withWindowWidth(1440);

    it("has no top bar: the actions sit on the title's line", async () => {
      await renderHeader(
        <ScreenHeader actions={<NativeText>bell</NativeText>} title="Now" variant="top" />,
      );
      expect(screen.queryByTestId("screen-header-bar")).toBeNull();
      expect(
        within(screen.getByTestId("screen-header-title-row")).getByText("bell"),
      ).toBeOnTheScreen();
    });
  });

  describe("pushed", () => {
    it("renders Back and the title as a level-1 title1 heading", async () => {
      const onBack = jest.fn();
      await renderHeader(
        <ScreenHeader backLabel="Back" onBack={onBack} title="Presets" variant="pushed" />,
      );
      const title = screen.getByRole("header", { name: "Presets" });
      expect(title.props["aria-level"]).toBe(1);
      expect(classesOf(title)).toContain("text-title1");
      await fireEvent.press(screen.getByRole("button", { name: "Back" }));
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it("carries a context control and the actions in its bar, the title optional (the task header)", async () => {
      await renderHeader(
        <ScreenHeader
          actions={<NativeText>edit</NativeText>}
          backIcon="x"
          backLabel="Close"
          context={<NativeText>Algebra</NativeText>}
          onBack={() => undefined}
          variant="pushed"
        />,
      );
      const bar = screen.getByTestId("screen-header-bar");
      for (const text of ["Algebra", "edit"]) {
        expect(within(bar).getByText(text)).toBeOnTheScreen();
      }
      expect(screen.queryByRole("header")).toBeNull();
      expect(screen.getByRole("button", { name: "Close" })).toBeOnTheScreen();
    });
  });
});
