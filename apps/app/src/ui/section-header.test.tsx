import { screen } from "@testing-library/react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { Button } from "./button.tsx";
import { SectionHeader } from "./section-header.tsx";

describe("SectionHeader (spec §4.1.1, §5.0.3)", () => {
  it("is a heading of the level it is given, its sentence-case text unchanged", async () => {
    await renderScreen(
      <SectionHeader level={3} title="With a deadline" />,
      await createTestRuntime({ world: "empty" }),
    );
    const heading = screen.getByRole("header", { name: "With a deadline" });
    expect(heading.props["aria-level"]).toBe(3);
    expect(heading).toHaveTextContent("With a deadline", { exact: true });
    expect(String(heading.props["className"])).not.toContain("uppercase");
  });

  it("is a level-2 heading unless told, in subhead and the secondary label", async () => {
    await renderScreen(
      <SectionHeader title="Без срока" />,
      await createTestRuntime({ world: "empty" }),
    );
    const heading = screen.getByRole("header", { name: "Без срока" });
    expect(heading.props["aria-level"]).toBe(2);
    expect(String(heading.props["className"])).toContain("text-subhead");
    expect(String(heading.props["className"])).toContain("text-label-secondary");
  });

  it("carries a trailing count through the language's formatter, tabular", async () => {
    await renderScreen(
      <SectionHeader count={1284} title="Done" />,
      await createTestRuntime({ world: "empty" }),
    );
    const count = screen.getByText("1,284");
    expect(String(count.props["className"])).toContain("tabular-nums");
  });

  it("carries one trailing action", async () => {
    await renderScreen(
      <SectionHeader
        action={
          <Button onPress={() => undefined} variant="ghost">
            Show all
          </Button>
        }
        title="Apps"
      />,
      await createTestRuntime({ world: "empty" }),
    );
    expect(screen.getByRole("button", { name: "Show all" })).toBeOnTheScreen();
  });
});
