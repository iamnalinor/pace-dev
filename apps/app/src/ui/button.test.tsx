import { fireEvent, render, screen } from "@testing-library/react-native";

import { isControl } from "#app/test/focus-target.ts";

import { Button } from "./button.tsx";
import { ThemeProvider } from "./theme-provider.tsx";

/** Where focus was moved, as the button asked the platform (bug class 5). */
const mockMoveFocus = jest.fn<undefined, [unknown]>();
jest.mock("#app/platform/move-focus.ts", (): unknown => ({
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

  it("leaves focus alone when it did not have it", async () => {
    const view = await render(saving(false));
    await view.rerender(saving(true));
    await view.rerender(saving(false));
    expect(mockMoveFocus).not.toHaveBeenCalled();
  });
});
