import { t } from "@pace/core";

import { errorText } from "./action-error.ts";

const en = (key: Parameters<typeof t>[1], params?: Parameters<typeof t>[2]) => t("en", key, params);

describe("errorText", () => {
  it("has a sentence for every known code and a generic one for store refusals", () => {
    expect(errorText(en, "retro/future")).toBe("That time is in the future.");
    expect(errorText(en, "action/empty-text")).toBe("Type something first.");
    expect(errorText(en, "dispatch/boom")).toBe("Could not apply this change (dispatch/boom).");
  });
});
