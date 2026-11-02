import { fireEvent, screen } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { ComposerProvider } from "./composer-flow.tsx";
import { Composer } from "./composer.tsx";

// The line as the web build has it: Enter is read from the key, which the line may hold back.
jest.mock("#app/platform/enter-key.ts", (): unknown =>
  jest.requireActual("#app/platform/enter-key.web.ts"),
);

const line = () => screen.getByPlaceholderText(en("composer.placeholder"));

/** Enter pressed in the line; true when the line held back the browser's own handling. */
const isEnterHeldBack = async (modifiers: { readonly shiftKey?: boolean } = {}) => {
  const preventDefault = jest.fn();
  await fireEvent(line(), "keyPress", {
    nativeEvent: { key: "Enter", ...modifiers },
    preventDefault,
  });
  return preventDefault.mock.calls.length > 0;
};

const renderLine = async () => {
  const parse = jest.fn();
  await renderScreen(
    <ComposerProvider>
      <Composer />
    </ComposerProvider>,
    await createTestRuntime({ routes: { "POST /api/parse": parse } }),
  );
  return { parse };
};

describe("Enter in the composer's line on the web (QA round 18 M2)", () => {
  it.each([
    ["an empty line", ""],
    ["a line of spaces", " ".repeat(3)],
  ])("does nothing on %s: no line break, nothing sent", async (_name, text) => {
    const { parse } = await renderLine();
    await fireEvent.changeText(line(), text);
    // Held back: the browser would otherwise break the line (a tall empty box, a leading "\n").
    expect(await isEnterHeldBack()).toBe(true);
    expect(line()).toHaveDisplayValue(text);
    expect(parse).not.toHaveBeenCalled();
  });

  it("leaves Shift+Enter to break the line", async () => {
    await renderLine();
    expect(await isEnterHeldBack({ shiftKey: true })).toBe(false);
  });
});
