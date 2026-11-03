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

  it.each([
    ["primary", "bg-accent", "text-accent-on"],
    ["secondary", "bg-fill-2", "text-label-primary"],
    ["destructive", "bg-danger-quiet", "text-danger"],
  ] as const)(
    "draws %s on its fill with its label colour (spec §4.2.3)",
    async (variant, fill, ink) => {
      await render(
        <ThemeProvider>
          <Button onPress={() => undefined} variant={variant}>
            Save
          </Button>
        </ThemeProvider>,
      );
      expect(String(screen.getByTestId("pressable-visual").props["className"])).toContain(fill);
      expect(String(screen.getByText("Save").props["className"])).toContain(ink);
    },
  );

  it("is fill.1 under label.quaternary when disabled, never an opacity (F-COL-13)", async () => {
    await render(
      <ThemeProvider>
        <Button disabled onPress={() => undefined}>
          Save
        </Button>
      </ThemeProvider>,
    );
    const visual = String(screen.getByTestId("pressable-visual").props["className"]);
    expect(visual).toContain("bg-fill-1");
    expect(visual).not.toContain("opacity");
    expect(String(screen.getByText("Save").props["className"])).toContain("text-label-quaternary");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("keeps its label while busy, with the spinner in the icon's place (the width never jumps)", async () => {
    await render(saving(true));
    expect(screen.getByText("Save")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save" })).toBeBusy();
  });

  it("hugs its label with width hug, on every window (R22-10: wide buttons on a computer)", async () => {
    await render(
      <ThemeProvider>
        <Button onPress={() => undefined} width="hug">
          Accept
        </Button>
      </ThemeProvider>,
    );
    expect(screen.getByRole("button", { name: "Accept" }).props["style"]).toEqual(
      expect.objectContaining({ alignSelf: "flex-start" }),
    );
  });

  it("draws its visual inside the target: 48 on a phone, 40 on a desktop, 32 small (one geometry per size)", async () => {
    await render(
      <ThemeProvider>
        <Button onPress={() => undefined}>Regular</Button>
        <Button onPress={() => undefined} size="small">
          Small
        </Button>
      </ThemeProvider>,
    );
    const [regular, small] = screen
      .getAllByTestId("pressable-visual")
      .map((node) => String(node.props["className"]).split(" "));
    expect(regular).toEqual(expect.arrayContaining(["min-h-12", "lg:min-h-10", "rounded-md"]));
    expect(small).toEqual(expect.arrayContaining(["min-h-8", "rounded-sm"]));
  });

  it("leaves focus alone when it did not have it", async () => {
    const view = await render(saving(false));
    await view.rerender(saving(true));
    await view.rerender(saving(false));
    expect(mockMoveFocus).not.toHaveBeenCalled();
  });
});
