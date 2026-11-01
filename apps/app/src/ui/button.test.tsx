import { fireEvent, render, screen } from "@testing-library/react-native";

import { isControl } from "#app/test/focus-target.ts";

import { Button } from "./button.tsx";
import { ThemeProvider } from "./theme-provider.tsx";

/** Where focus was moved, as the button asked the platform (bug class 5). */
const mockMoveFocus = jest.fn<undefined, [unknown]>();
/** Whether focus is still nowhere when the spell ends; false once the person moved it elsewhere. */
const mockFocus = { isLost: true };
jest.mock("#app/platform/move-focus.ts", (): unknown => ({
  isFocusLost: () => mockFocus.isLost,
  moveFocus: (target: unknown) => {
    mockMoveFocus(target);
  },
}));

const saving = (isBusy: boolean) => (
  <ThemeProvider>
    <Button busy={isBusy} onPress={() => undefined}>
      Save
    </Button>
  </ThemeProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockFocus.isLost = true;
});

describe("Button", () => {
  it("takes focus back when it stops being busy, if it had it (a disabled control loses it on the web)", async () => {
    const view = await render(saving(false));
    const button = screen.getByRole("button", { name: "Save" });
    await fireEvent(button, "focus", { currentTarget: button });
    await view.rerender(saving(true));
    // The busy button is disabled, which drops focus on the web: the blur says nothing of intent.
    await fireEvent(screen.getByRole("button"), "blur");
    await view.rerender(saving(false));
    expect(mockMoveFocus).toHaveBeenCalledTimes(1);
    expect(
      isControl(mockMoveFocus.mock.calls[0]?.[0], screen.getByRole("button", { name: "Save" })),
    ).toBe(true);
  });

  it("leaves focus where the person put it meanwhile (a click armed it, a later key must not press it)", async () => {
    const view = await render(saving(false));
    const button = screen.getByRole("button", { name: "Save" });
    await fireEvent(button, "focus", { currentTarget: button });
    await view.rerender(saving(true));
    await fireEvent(screen.getByRole("button"), "blur");
    // The person moved on while it spun: focus is on something else, not on the page.
    mockFocus.isLost = false;
    await view.rerender(saving(false));
    expect(mockMoveFocus).not.toHaveBeenCalled();
    // The next spell starts fresh: if focus is lost again, it comes back.
    await fireEvent(screen.getByRole("button", { name: "Save" }), "focus", {
      currentTarget: screen.getByRole("button", { name: "Save" }),
    });
    await view.rerender(saving(true));
    await fireEvent(screen.getByRole("button"), "blur");
    mockFocus.isLost = true;
    await view.rerender(saving(false));
    expect(mockMoveFocus).toHaveBeenCalledTimes(1);
  });

  it("leaves focus alone when it did not have it", async () => {
    const view = await render(saving(false));
    await view.rerender(saving(true));
    await view.rerender(saving(false));
    expect(mockMoveFocus).not.toHaveBeenCalled();
  });
});
