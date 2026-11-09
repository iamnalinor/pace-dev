import type { Locator } from "@playwright/test";

import { expect } from "./fixtures.ts";

/**
The time bar's typed field, unfolded first when the bar folded it under «Start something else»
(a phone with something running, or the bar over its budget). Waits for the bar to show either the
field or the fold row: right after a navigation neither is there yet, and a check made then found
nothing to unfold and the field never came (sheet-focus's `time-proposal` opener).
*/
export const typedField = async (
  bar: Locator,
  names: { readonly field: string; readonly unfold: string },
): Promise<Locator> => {
  const field = bar.getByRole("textbox", { name: names.field });
  const more = bar.getByRole("button", { name: names.unfold });
  await expect(field.or(more).first()).toBeVisible();
  if ((await more.count()) > 0 && (await more.getAttribute("aria-expanded")) === "false") {
    await more.click();
  }
  await expect(field).toBeVisible();
  return field;
};
