import { render } from "@testing-library/react-native";

import { FormAlert } from "#app/shared/task-fields/form-alert.tsx";

import { RevealContext, revealIn } from "./overlay-reveal.ts";
import { TextField } from "./text-field.tsx";
import { ThemeProvider } from "./theme-provider.tsx";

/** A scroll view whose content is `inner`, recording where it was asked to scroll. */
const scroller = (frame: unknown = 1) => {
  const scrollTo = jest.fn();
  return { getInnerViewNode: () => 1, getScrollableNode: () => frame, scrollTo };
};

/** A native view laid out at `top`, `height` in the body's content. */
const nativeAt = (top: number, height: number) => ({
  measureLayout: (_relativeTo: unknown, onSuccess: (...box: readonly number[]) => void) => {
    onSuccess(0, top, 100, height);
  },
});

describe("revealIn: a message in an overlay's body is scrolled into view (QA round 26 R26-01)", () => {
  it("on a phone, scrolls a message below the visible part up above the footer, with room", () => {
    const scroll = scroller();
    revealIn(scroll, nativeAt(700, 60), { height: 600, offset: 0 });
    expect(scroll.scrollTo).toHaveBeenCalledWith({ animated: true, y: 700 + 60 + 16 - 600 });
  });

  it("scrolls back down to a message above the visible part", () => {
    const scroll = scroller();
    revealIn(scroll, nativeAt(100, 20), { height: 600, offset: 400 });
    expect(scroll.scrollTo).toHaveBeenCalledWith({ animated: true, y: 84 });
  });

  it("leaves a message that shows already where it is", () => {
    const scroll = scroller();
    revealIn(scroll, nativeAt(300, 20), { height: 600, offset: 0 });
    expect(scroll.scrollTo).not.toHaveBeenCalled();
  });

  it("on the web, reads the element's box against the body's", () => {
    const scroll = scroller({ getBoundingClientRect: () => ({ bottom: 760, top: 160 }) });
    const node = { ...nativeAt(0, 0), getBoundingClientRect: () => ({ bottom: 800, top: 740 }) };
    revealIn(scroll, node, { height: 600, offset: 50 });
    expect(scroll.scrollTo).toHaveBeenCalledWith({ animated: true, y: 50 + 800 + 16 - 760 });
  });
});

describe("the messages that ask to be revealed", () => {
  it("a field's error and a form's alert hand their node to the overlay as they appear", async () => {
    const reveal = jest.fn();
    await render(
      <ThemeProvider forced="light">
        <RevealContext value={reveal}>
          <TextField error="Type a time like 09:30." label="To" value="9" />
          <FormAlert>Pick a day.</FormAlert>
        </RevealContext>
      </ThemeProvider>,
    );
    expect(reveal).toHaveBeenCalledTimes(2);
    expect(reveal.mock.calls.every(([node]) => node !== null)).toBe(true);
  });
});
