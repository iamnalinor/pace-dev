import { t } from "@pace/core";

import { errorText } from "./action-error.ts";

const en = (key: Parameters<typeof t>[1], params?: Parameters<typeof t>[2]) => t("en", key, params);

describe("errorText", () => {
  it("has a sentence for every known code and a generic one for store refusals", () => {
    expect(errorText(en, "retro/future")).toBe("That time is in the future.");
    expect(errorText(en, "action/empty-text")).toBe("Type something first.");
    expect(errorText(en, "dispatch/boom")).toBe("Could not apply this change (dispatch/boom).");
  });

  it("says in both languages that a change the device could not save was taken back", () => {
    expect(errorText(en, "persist_failed")).toBe(
      "Could not save this on the device, so it was not changed. Try again.",
    );
    expect(errorText((key, params) => t("ru", key, params), "persist_failed")).toBe(
      "Не удалось сохранить это на устройстве, поэтому ничего не изменилось. Попробуйте снова.",
    );
  });
});
