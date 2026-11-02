import { fireEvent, screen, within } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { TRK_ID } from "@pace/core/testing";

import { TaskScreen } from "./task-screen.tsx";

/** A computer with a keyboard (the web build's fine pointer). */
jest.mock("#app/ui/use-hotkey.tsx", (): unknown => ({
  ...jest.requireActual("#app/ui/use-hotkey.tsx"),
  KEYBOARD: "other",
}));

/** Which field was given the cursor. */
const mockFocusField = jest.fn<undefined, [unknown]>();
jest.mock("#app/platform/focus-field.ts", (): unknown => ({
  focusField: (input: unknown) => {
    mockFocusField(input);
  },
}));

describe("CloseSheet with a keyboard (QA round 20 M2)", () => {
  it("puts the cursor in Reason when the outcome turns to Cancelled, never leaving it on the page", async () => {
    const runtime = await createTestRuntime({ deviceTz: "UTC", now: "2026-10-10T10:00:00.000Z" });
    await renderScreen(<TaskScreen id={TRK_ID} openClose />, runtime);
    mockFocusField.mockClear();
    const outcome = screen.getByLabelText(en("close.outcome"));
    await fireEvent.press(within(outcome).getByRole("radio", { name: en("close.cancelled") }));
    expect(screen.getByLabelText(en("close.reason"))).toBeOnTheScreen();
    expect(mockFocusField).toHaveBeenCalledTimes(1);
    expect(mockFocusField.mock.calls[0]?.[0]).not.toBeNull();
  });
});
