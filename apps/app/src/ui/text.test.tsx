import { render, screen } from "@testing-library/react-native";

import { Text } from "./text.tsx";

const classesOf = (text: string): readonly string[] =>
  (screen.getByText(text).props["className"] as string).split(" ");

describe("Text (the kit's type roles, spec §3.2, §4.1.2)", () => {
  it("yields in a row by construction: shrinks and may get narrower than its content", async () => {
    await render(<Text role="body">Algebra homework</Text>);
    expect(screen.getByText("Algebra homework")).toHaveStyle({ flexShrink: 1, minWidth: 0 });
  });

  it("keeps its width when the caller says shrink-0 (a word that must not break: ASAP)", async () => {
    // The inline yield used to win over the class, and "ASAP" broke into "AS / AP" at 390 px.
    await render(
      <Text className="shrink-0 font-semibold" role="footnote">
        ASAP
      </Text>,
    );
    expect(screen.getByText("ASAP")).not.toHaveStyle({ flexShrink: 1 });
  });

  it("truncates to one line with policy truncate, and still yields", async () => {
    await render(
      <Text policy="truncate" role="footnote">
        A very long project name
      </Text>,
    );
    const text = screen.getByText("A very long project name");
    expect(text.props["numberOfLines"]).toBe(1);
    expect(text.props["ellipsizeMode"]).toBe("tail");
    expect(text).toHaveStyle({ flexShrink: 1, minWidth: 0 });
  });

  it("clamps to the lines it is given with policy clamp", async () => {
    await render(
      <Text lines={4} policy="clamp" role="callout">
        An inbox capture
      </Text>,
    );
    expect(screen.getByText("An inbox capture").props["numberOfLines"]).toBe(4);
  });

  it("wraps by default: UI strings are never cut (spec §4.1.2 rule 3)", async () => {
    await render(<Text role="body">Сохранить изменения</Text>);
    expect(screen.getByText("Сохранить изменения").props["numberOfLines"]).toBeUndefined();
  });

  it("sets its type role's class, and the tone's label colour (primary unless told)", async () => {
    await render(
      <>
        <Text role="largeTitle">Now</Text>
        <Text role="footnote" tone="secondary">
          meta
        </Text>
        <Text role="caption" tone="danger">
          late
        </Text>
      </>,
    );
    expect(classesOf("Now")).toEqual(
      expect.arrayContaining(["font-sans", "text-largeTitle", "text-label-primary"]),
    );
    expect(classesOf("meta")).toEqual(
      expect.arrayContaining(["text-footnote", "text-label-secondary"]),
    );
    expect(classesOf("late")).toEqual(expect.arrayContaining(["text-caption", "text-danger"]));
  });

  it("carries tabular figures in the numeric roles, and on any role when numeric", async () => {
    await render(
      <>
        <Text role="numeric.live">1:05:00</Text>
        <Text numeric role="footnote">
          25 min
        </Text>
        <Text role="body">Swim</Text>
      </>,
    );
    expect(classesOf("1:05:00")).toEqual(
      expect.arrayContaining(["text-numeric-live", "tabular-nums"]),
    );
    expect(classesOf("25 min")).toContain("tabular-nums");
    expect(classesOf("Swim")).not.toContain("tabular-nums");
  });

  it("is a heading of the level it is given (aria-level, F-A11Y-05)", async () => {
    await render(
      <Text level={2} role="subhead" tone="secondary">
        Today
      </Text>,
    );
    const heading = screen.getByRole("header", { name: "Today" });
    expect(heading.props["aria-level"]).toBe(2);
  });

  it("is not a heading without a level", async () => {
    await render(<Text role="headline">Today</Text>);
    expect(screen.queryByRole("header")).toBeNull();
  });

  it("caps font scaling on chrome only (tab labels, badges; spec §3.2)", async () => {
    await render(
      <>
        <Text chrome role="caption">
          Inbox
        </Text>
        <Text role="body">A paragraph</Text>
      </>,
    );
    expect(screen.getByText("Inbox").props["maxFontSizeMultiplier"]).toBeCloseTo(1.6);
    expect(screen.getByText("A paragraph").props["maxFontSizeMultiplier"]).toBeUndefined();
  });

  it("keeps a caller's class after its own (layout beside it)", async () => {
    await render(
      <Text className="flex-1" role="body">
        Row title
      </Text>,
    );
    expect(classesOf("Row title")).toContain("flex-1");
  });
});
