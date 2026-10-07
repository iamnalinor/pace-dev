import { describe, expect, it } from "vitest";

import { t } from "@pace/core";

import { actionErrorText } from "./action-error.ts";

const en = (key: Parameters<typeof t>[1], params?: Parameters<typeof t>[2]) => t("en", key, params);

describe("actionErrorText", () => {
  it("translates a known code", () => {
    expect(actionErrorText(en, "preset/exists")).toBe("A preset with this id already exists.");
    expect(actionErrorText(en, "retro/future")).toBe("That time is in the future.");
  });

  it("names the code of a store refusal", () => {
    expect(actionErrorText(en, "dispatch/payload: bad")).toBe(
      "Could not apply this change (dispatch/payload: bad).",
    );
  });
});
