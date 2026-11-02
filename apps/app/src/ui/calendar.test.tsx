import { fireEvent, render, screen } from "@testing-library/react-native";

import { isControl } from "#app/test/focus-target.ts";

import { Calendar } from "./calendar.tsx";
import { ThemeProvider } from "./theme-provider.tsx";

/** Where focus was moved, as the calendar asked the platform. */
const mockMoveFocus = jest.fn<undefined, [unknown]>();
jest.mock("#app/platform/move-focus.ts", (): unknown => ({
  moveFocus: (target: unknown) => {
    mockMoveFocus(target);
  },
}));

// A computer with a keyboard (the web build's check), so the grid takes focus as it opens.
jest.mock("./use-hotkey.tsx", (): unknown => ({
  ...jest.requireActual<object>("./use-hotkey.tsx"),
  KEYBOARD: "windows",
}));

beforeEach(() => {
  jest.clearAllMocks();
});

const LABELS = { next: "Next month", previous: "Previous month" };

const show = async (props: { selected: null | string; max?: string }) =>
  await render(
    <ThemeProvider>
      <Calendar
        labels={LABELS}
        language="en"
        onPick={jest.fn()}
        today="2026-10-20"
        {...props}
        {...(props.max !== undefined && { max: props.max })}
      />
    </ThemeProvider>,
  );

type Rendered = ReturnType<typeof screen.getByRole>;

const nameOf = (element: Rendered): string => String(element.props["accessibilityLabel"]);

/** The names of the day buttons Tab stops at. */
const tabStops = (): readonly string[] =>
  screen
    .getAllByRole("button")
    .filter((element) => nameOf(element).includes("day,"))
    .filter((element) => element.props["tabIndex"] !== -1)
    .map((element) => nameOf(element));

const day = (name: string) => screen.getByRole("button", { name });

describe("the month view's keyboard (QA round 19 L5)", () => {
  it("is one tab stop on the picked day, which takes focus as it opens", async () => {
    await show({ selected: "2026-10-08" });
    expect(tabStops()).toEqual(["Thursday, October 8"]);
    expect(isControl(mockMoveFocus.mock.calls.at(-1)?.[0], day("Thursday, October 8"))).toBe(true);
  });

  it("starts on today when nothing is picked", async () => {
    await show({ selected: null });
    expect(tabStops()).toEqual(["Tuesday, October 20"]);
  });

  it("moves the stop and the focus with the arrows, into the next month too", async () => {
    await show({ selected: "2026-10-29" });
    const grid = screen.getByTestId("calendar-days");
    await fireEvent(grid, "keyDown", { key: "ArrowRight", preventDefault: jest.fn() });
    expect(tabStops()).toEqual(["Friday, October 30"]);
    expect(isControl(mockMoveFocus.mock.calls.at(-1)?.[0], day("Friday, October 30"))).toBe(true);
    await fireEvent(grid, "keyDown", { key: "ArrowDown", preventDefault: jest.fn() });
    expect(screen.getByText("November 2026")).toBeOnTheScreen();
    expect(tabStops()).toEqual(["Friday, November 6"]);
  });

  it("never moves past the last day that can be picked", async () => {
    await show({ max: "2026-10-20", selected: "2026-10-18" });
    await fireEvent(screen.getByTestId("calendar-days"), "keyDown", {
      key: "ArrowDown",
      preventDefault: jest.fn(),
    });
    expect(tabStops()).toEqual(["Tuesday, October 20"]);
  });
});
