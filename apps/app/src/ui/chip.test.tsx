import { screen, within } from "@testing-library/react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { HUE_NAMES } from "@pace/core";

import { Chip } from "./chip.tsx";

/** The classes of the chip's pill, the view that carries the fill and the ring. */
const classOf = (name: string): string =>
  within(screen.getByRole("radio", { name })).getByTestId("chip-pill").props["className"] as string;

describe("Chip", () => {
  it.each([null, ...HUE_NAMES])(
    "marks the chosen one with the accent fill and its ink (3:1 against the unselected cell), colour %s",
    async (color) => {
      await renderScreen(
        <>
          <Chip color={color} onPress={() => undefined} selected>
            Chosen
          </Chip>
          <Chip color={color} onPress={() => undefined}>
            Other
          </Chip>
        </>,
        await createTestRuntime({ world: "empty" }),
      );
      const chosen = classOf("Chosen");
      expect(chosen).toContain("bg-accent");
      expect(chosen).toContain("border-accent");
      expect(chosen).not.toContain("bg-cell");
      const other = classOf("Other");
      expect(other).toContain("bg-cell");
      expect(other).not.toContain("bg-accent");
    },
  );

  it("reads the chosen label in the colour on the accent", async () => {
    await renderScreen(
      <Chip onPress={() => undefined} selected>
        Chosen
      </Chip>,
      await createTestRuntime({ world: "empty" }),
    );
    expect(screen.getByText("Chosen").props["className"]).toContain("text-accent-on");
    expect(screen.getByRole("radio", { name: "Chosen" })).toBeChecked();
  });
});
