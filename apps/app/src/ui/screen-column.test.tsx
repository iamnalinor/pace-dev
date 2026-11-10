import { screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { Screen } from "./screen.tsx";

// A computer's window: the sidebar beside the content region.
jest.mock("./layout.ts", (): unknown => ({
  ...jest.requireActual("./layout.ts"),
  useIsWide: () => true,
}));

/** The classes of the column under the header's edge. */
const columnClasses = (): readonly string[] =>
  String(screen.getByTestId("screen-column").props["className"]).split(" ");

describe("a screen's column on a computer (spec §5.0.1, design review H1)", () => {
  it.each([undefined, "content", "wide"] as const)(
    "starts at the region's leading edge, never centred in it (anchor: %s)",
    async (anchor) => {
      await renderScreen(
        <Screen {...(anchor !== undefined && { anchor })} header={<Text>Title</Text>}>
          <Text>Body</Text>
        </Screen>,
        await createTestRuntime(),
      );
      const column = columnClasses();
      expect(column).toContain("self-start");
      expect(column).not.toContain("self-center");
    },
  );
});
