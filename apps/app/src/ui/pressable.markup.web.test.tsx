import type { ReactElement } from "react";

import { renderToStaticMarkup } from "react-dom/server";
import { Text } from "react-native";

import { Pressable } from "./pressable.web.tsx";

// The markup react-native-web really writes: the attributes global.css and assistive tech read.
// Only the two components drawn are swapped, so the rest of React Native stays as jest-expo has it.
jest.mock("react-native/Libraries/Components/Pressable/Pressable", () => ({
  __esModule: true,
  default: jest.requireActual<{ Pressable: unknown }>("react-native-web").Pressable,
}));
jest.mock("react-native/Libraries/Text/Text", () => ({
  __esModule: true,
  default: jest.requireActual<{ Text: unknown }>("react-native-web").Text,
}));
jest.mock("../platform/haptics.ts", () => ({ haptic: jest.fn() }));

const NOTHING = (): void => undefined;

const markup = (ui: ReactElement): string => renderToStaticMarkup(ui);

describe("Pressable's markup on the web", () => {
  it('says disabled as aria-disabled="true", which the CSS state layer keys off', () => {
    const html = markup(
      <Pressable disabled onPress={NOTHING} role="button">
        <Text>Save</Text>
      </Pressable>,
    );
    expect(html).toContain('aria-disabled="true"');
  });

  it("says selected as aria-selected on a tab", () => {
    const html = markup(
      <Pressable onPress={NOTHING} role="tab" selected>
        <Text>Today</Text>
      </Pressable>,
    );
    expect(html).toContain('aria-selected="true"');
  });

  it("says checked as aria-checked on a checkbox, never aria-selected (not allowed there)", () => {
    const html = markup(
      <Pressable checked onPress={NOTHING} role="checkbox">
        <Text>Done</Text>
      </Pressable>,
    );
    expect(html).toContain('aria-checked="true"');
    expect(html).not.toContain("aria-selected");
  });

  it.each(["button", "checkbox", "radio", "switch", "link"] as const)(
    "gives a %s no aria-selected even when handed one",
    (role) => {
      // A caller holding the role as a plain string gets past the type; the markup still holds.
      const loose = { role, selected: true } as unknown as { role: "tab"; selected: boolean };
      const html = markup(
        <Pressable {...loose} onPress={NOTHING}>
          <Text>Item</Text>
        </Pressable>,
      );
      expect(html).not.toContain("aria-selected");
    },
  );

  it("draws no state layer on a Pressable with nothing to do", () => {
    const html = markup(
      <Pressable role="button">
        <Text>Idle</Text>
      </Pressable>,
    );
    expect(html).not.toContain("data-pace-press");
    expect(
      markup(
        <Pressable onPress={NOTHING} role="button">
          <Text>Live</Text>
        </Pressable>,
      ),
    ).toContain('data-pace-press="bounded"');
  });
});
