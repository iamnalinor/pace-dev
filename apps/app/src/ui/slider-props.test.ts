import { act, renderHook } from "@testing-library/react-native";

import { useShownStep } from "./slider-props.ts";

describe("useShownStep (spec §4.2.24: the number follows the movement, no jitter after save)", () => {
  it("shows the finger's step, then holds the released one until the store answers", async () => {
    const hook = await renderHook(({ value }: { readonly value: number }) => useShownStep(value), {
      initialProps: { value: 3 },
    });
    await act(async () => {
      hook.result.current.setDraft(7);
    });
    expect(hook.result.current.shown).toBe(7);
    await act(async () => {
      hook.result.current.release(7);
    });
    // Released, the store not yet answered: still 7, never back to 3 for a frame.
    expect(hook.result.current.shown).toBe(7);
    await hook.rerender({ value: 7 });
    expect(hook.result.current.shown).toBe(7);
    // The next answer from the store is shown as it is.
    await hook.rerender({ value: 2 });
    expect(hook.result.current.shown).toBe(2);
  });

  it("lets go of a held step when the store answers with another value (a refused save)", async () => {
    const hook = await renderHook(({ value }: { readonly value: number }) => useShownStep(value), {
      initialProps: { value: 3 },
    });
    await act(async () => {
      hook.result.current.setDraft(9);
      hook.result.current.release(9);
    });
    await hook.rerender({ value: 4 });
    expect(hook.result.current.shown).toBe(4);
  });
});
